import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildHistoryContextFromEntries, type HistoryEntry } from "../auto-reply/reply/history.js";
import { createDefaultDeps } from "../cli/deps.js";
import { agentCommand } from "../commands/agent.js";
import { DEFAULT_CONTEXT_TOKENS } from "../agents/defaults.js";
import {
  loadSessionStore,
  resolveStorePath,
  resolveSessionTranscriptsDir,
} from "../config/sessions.js";
import { emitAgentEvent, onAgentEvent } from "../infra/agent-events.js";
import { defaultRuntime } from "../runtime.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  readJsonBodyOrError,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
  setSseHeaders,
  writeDone,
} from "./http-common.js";
import { getBearerToken, resolveAgentIdForRequest, resolveSessionKey } from "./http-utils.js";

type OpenAiHttpOptions = {
  auth: ResolvedGatewayAuth;
  maxBodyBytes?: number;
  trustedProxies?: string[];
};

type OpenAiChatMessage = {
  role?: unknown;
  content?: unknown;
  name?: unknown;
};

type OpenAiChatCompletionRequest = {
  model?: unknown;
  stream?: unknown;
  messages?: unknown;
  user?: unknown;
  stream_options?: {
    include_usage?: boolean;
  };
};

function writeSse(res: ServerResponse, data: unknown) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function asMessages(val: unknown): OpenAiChatMessage[] {
  return Array.isArray(val) ? (val as OpenAiChatMessage[]) : [];
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") {
          return "";
        }
        const type = (part as { type?: unknown }).type;
        const text = (part as { text?: unknown }).text;
        const inputText = (part as { input_text?: unknown }).input_text;
        if (type === "text" && typeof text === "string") {
          return text;
        }
        if (type === "input_text" && typeof text === "string") {
          return text;
        }
        if (typeof inputText === "string") {
          return inputText;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function buildAgentPrompt(messagesUnknown: unknown): {
  message: string;
  extraSystemPrompt?: string;
} {
  const messages = asMessages(messagesUnknown);

  const systemParts: string[] = [];
  const conversationEntries: Array<{ role: "user" | "assistant" | "tool"; entry: HistoryEntry }> =
    [];

  for (const msg of messages) {
    if (!msg || typeof msg !== "object") {
      continue;
    }
    const role = typeof msg.role === "string" ? msg.role.trim() : "";
    const content = extractTextContent(msg.content).trim();
    if (!role || !content) {
      continue;
    }
    if (role === "system" || role === "developer") {
      systemParts.push(content);
      continue;
    }

    const normalizedRole = role === "function" ? "tool" : role;
    if (normalizedRole !== "user" && normalizedRole !== "assistant" && normalizedRole !== "tool") {
      continue;
    }

    const name = typeof msg.name === "string" ? msg.name.trim() : "";
    const sender =
      normalizedRole === "assistant"
        ? "Assistant"
        : normalizedRole === "user"
          ? "User"
          : name
            ? `Tool:${name}`
            : "Tool";

    conversationEntries.push({
      role: normalizedRole,
      entry: { sender, body: content },
    });
  }

  let message = "";
  if (conversationEntries.length > 0) {
    let currentIndex = -1;
    for (let i = conversationEntries.length - 1; i >= 0; i -= 1) {
      const entryRole = conversationEntries[i]?.role;
      if (entryRole === "user" || entryRole === "tool") {
        currentIndex = i;
        break;
      }
    }
    if (currentIndex < 0) {
      currentIndex = conversationEntries.length - 1;
    }
    const currentEntry = conversationEntries[currentIndex]?.entry;
    if (currentEntry) {
      const historyEntries = conversationEntries.slice(0, currentIndex).map((entry) => entry.entry);
      if (historyEntries.length === 0) {
        message = currentEntry.body;
      } else {
        const formatEntry = (entry: HistoryEntry) => `${entry.sender}: ${entry.body}`;
        message = buildHistoryContextFromEntries({
          entries: [...historyEntries, currentEntry],
          currentMessage: formatEntry(currentEntry),
          formatEntry,
        });
      }
    }
  }

  return {
    message,
    extraSystemPrompt: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
  };
}

function resolveOpenAiSessionKey(params: {
  req: IncomingMessage;
  agentId: string;
  user?: string | undefined;
}): string {
  return resolveSessionKey({ ...params, prefix: "openai" });
}

function coerceRequest(val: unknown): OpenAiChatCompletionRequest {
  if (!val || typeof val !== "object") {
    return {};
  }
  return val as OpenAiChatCompletionRequest;
}

function readSessionContextWindow(sessionKey: string): number {
  try {
    const storePath = resolveStorePath();
    const store = loadSessionStore(storePath);
    const session = store[sessionKey];
    return session?.contextTokens ?? DEFAULT_CONTEXT_TOKENS;
  } catch {
    return DEFAULT_CONTEXT_TOKENS;
  }
}

export async function handleOpenAiHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: OpenAiHttpOptions,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/v1/chat/completions") {
    return false;
  }

  if (req.method !== "POST") {
    sendMethodNotAllowed(res);
    return true;
  }

  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: opts.auth,
    connectAuth: { token, password: token },
    req,
    trustedProxies: opts.trustedProxies,
  });
  if (!authResult.ok) {
    sendUnauthorized(res);
    return true;
  }

  const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? 1024 * 1024);
  if (body === undefined) {
    return true;
  }

  const payload = coerceRequest(body);
  const stream = Boolean(payload.stream);
  const model = typeof payload.model === "string" ? payload.model : "openclaw";
  const user = typeof payload.user === "string" ? payload.user : undefined;
  // Always include usage for streaming (default true), can be disabled with include_usage=false
  const includeUsage = stream ? (payload.stream_options?.include_usage !== false) : false;

  const agentId = resolveAgentIdForRequest({ req, model });
  const sessionKey = resolveOpenAiSessionKey({ req, agentId, user });
  const prompt = buildAgentPrompt(payload.messages);
  if (!prompt.message) {
    sendJson(res, 400, {
      error: {
        message: "Missing user message in `messages`.",
        type: "invalid_request_error",
      },
    });
    return true;
  }

  const runId = `chatcmpl_${randomUUID()}`;
  const deps = createDefaultDeps();

  if (!stream) {
    try {
      const result = await agentCommand(
        {
          message: prompt.message,
          extraSystemPrompt: prompt.extraSystemPrompt,
          sessionKey,
          runId,
          deliver: false,
          messageChannel: "webchat",
          bestEffortDeliver: false,
        },
        defaultRuntime,
        deps,
      );

      // Type the result properly to access meta.agentMeta.usage
      type AgentResult = {
        payloads?: Array<{ text?: string }>;
        meta?: {
          agentMeta?: {
            usage?: {
              input?: number;
              output?: number;
              cacheRead?: number;
              cacheWrite?: number;
              total?: number;
            };
          };
        };
      };

      const typedResult = result as AgentResult | null;
      const payloads = typedResult?.payloads;
      const content =
        Array.isArray(payloads) && payloads.length > 0
          ? payloads
              .map((p) => (typeof p.text === "string" ? p.text : ""))
              .filter(Boolean)
              .join("\n\n")
          : "No response from OpenClaw.";

      // Get real usage from result.meta.agentMeta.usage (preferred)
      // Fall back to transcript file if not available
      let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

      // Try getting usage directly from result first
      const resultUsage = typedResult?.meta?.agentMeta?.usage;
      if (resultUsage) {
        const inputTokens = (resultUsage.input ?? 0) + (resultUsage.cacheRead ?? 0) + (resultUsage.cacheWrite ?? 0);
        const outputTokens = resultUsage.output ?? 0;
        usage = {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        };
      } else {
        // Fall back to reading from transcript file
        try {
          const storePath = resolveStorePath();
          const store = loadSessionStore(storePath);
          const session = store[sessionKey];
          const transcriptsDir = resolveSessionTranscriptsDir();
          const transcriptFile = session?.sessionId
            ? path.join(transcriptsDir, `${session.sessionId}.jsonl`)
            : null;

          if (transcriptFile && fs.existsSync(transcriptFile)) {
            const lines = fs.readFileSync(transcriptFile, "utf-8").trim().split("\n");
            // Get last assistant message with usage
            for (let i = lines.length - 1; i >= 0; i--) {
              try {
                const entry = JSON.parse(lines[i]);
                if (entry.role === "assistant" && entry.usage) {
                  const u = entry.usage;
                  const inputTokens = (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
                  const outputTokens = u.output ?? 0;
                  usage = {
                    prompt_tokens: inputTokens,
                    completion_tokens: outputTokens,
                    total_tokens: inputTokens + outputTokens,
                  };
                  break;
                }
              } catch {
                /* skip invalid lines */
              }
            }
          }
        } catch {
          // Ignore errors, use default usage
        }
      }

      const contextWindow = readSessionContextWindow(sessionKey);

      sendJson(res, 200, {
        id: runId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            finish_reason: "stop",
          },
        ],
        usage: { ...usage, context_window: contextWindow },
      });
    } catch (err) {
      sendJson(res, 500, {
        error: { message: String(err), type: "api_error" },
      });
    }
    return true;
  }

  setSseHeaders(res);

  let wroteRole = false;
  let sawAssistantDelta = false;
  let closed = false;

  const unsubscribe = onAgentEvent((evt) => {
    if (evt.runId !== runId) {
      return;
    }
    if (closed) {
      return;
    }

    if (evt.stream === "assistant") {
      const delta = evt.data?.delta;
      const text = evt.data?.text;
      const content = typeof delta === "string" ? delta : typeof text === "string" ? text : "";
      if (!content) {
        return;
      }

      if (!wroteRole) {
        wroteRole = true;
        writeSse(res, {
          id: runId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { role: "assistant" } }],
        });
      }

      sawAssistantDelta = true;
      writeSse(res, {
        id: runId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content },
            finish_reason: null,
          },
        ],
      });
      return;
    }

    if (evt.stream === "lifecycle") {
      const phase = evt.data?.phase;
      if (phase === "end" || phase === "error") {
        // If include_usage is enabled, let the finally block handle closing
        // so it can send the usage chunk first
        if (!includeUsage) {
          closed = true;
          unsubscribe();
          writeDone(res);
          res.end();
        }
      }
    }
  });

  req.on("close", () => {
    closed = true;
    unsubscribe();
  });

  void (async () => {
    let result: unknown = null;
    try {
      result = await agentCommand(
        {
          message: prompt.message,
          extraSystemPrompt: prompt.extraSystemPrompt,
          sessionKey,
          runId,
          deliver: false,
          messageChannel: "webchat",
          bestEffortDeliver: false,
        },
        defaultRuntime,
        deps,
      );

      if (closed) {
        return;
      }

      if (!sawAssistantDelta) {
        if (!wroteRole) {
          wroteRole = true;
          writeSse(res, {
            id: runId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { role: "assistant" } }],
          });
        }

        const payloads = (result as { payloads?: Array<{ text?: string }> } | null)?.payloads;
        const content =
          Array.isArray(payloads) && payloads.length > 0
            ? payloads
                .map((p) => (typeof p.text === "string" ? p.text : ""))
                .filter(Boolean)
                .join("\n\n")
            : "No response from OpenClaw.";

        sawAssistantDelta = true;
        writeSse(res, {
          id: runId,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: { content },
              finish_reason: null,
            },
          ],
        });
      }
    } catch (err) {
      if (closed) {
        return;
      }
      writeSse(res, {
        id: runId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: `Error: ${String(err)}` },
            finish_reason: "stop",
          },
        ],
      });
      emitAgentEvent({
        runId,
        stream: "lifecycle",
        data: { phase: "error" },
      });
    } finally {
      if (!closed) {
        closed = true;
        unsubscribe();

        // Send usage chunk if stream_options.include_usage is true
        if (includeUsage) {
          let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          try {
            // Try getting usage from result first
            const typedResult = result as {
              meta?: {
                agentMeta?: {
                  usage?: {
                    input?: number;
                    output?: number;
                    cacheRead?: number;
                    cacheWrite?: number;
                    total?: number;
                  };
                };
              };
            } | null;
            const resultUsage = typedResult?.meta?.agentMeta?.usage;
            if (resultUsage) {
              const inputTokens = (resultUsage.input ?? 0) + (resultUsage.cacheRead ?? 0) + (resultUsage.cacheWrite ?? 0);
              const outputTokens = resultUsage.output ?? 0;
              usage = {
                prompt_tokens: inputTokens,
                completion_tokens: outputTokens,
                total_tokens: inputTokens + outputTokens,
              };
            } else {
              // Fall back to reading from transcript file
              const storePath = resolveStorePath();
              const store = loadSessionStore(storePath);
              const session = store[sessionKey];
              const transcriptsDir = resolveSessionTranscriptsDir();
              const transcriptFile = session?.sessionId
                ? path.join(transcriptsDir, `${session.sessionId}.jsonl`)
                : null;

              if (transcriptFile && fs.existsSync(transcriptFile)) {
                const lines = fs.readFileSync(transcriptFile, "utf-8").trim().split("\n");
                for (let i = lines.length - 1; i >= 0; i--) {
                  try {
                    const entry = JSON.parse(lines[i]);
                    if (entry.role === "assistant" && entry.usage) {
                      const u = entry.usage;
                      const inputTokens = (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0);
                      const outputTokens = u.output ?? 0;
                      usage = {
                        prompt_tokens: inputTokens,
                        completion_tokens: outputTokens,
                        total_tokens: inputTokens + outputTokens,
                      };
                      break;
                    }
                  } catch {
                    /* skip invalid lines */
                  }
                }
              }
            }
          } catch {
            // Ignore errors, use default usage
          }

          // Send final chunk with usage (OpenAI format: choices is empty array)
          const contextWindow = readSessionContextWindow(sessionKey);
          writeSse(res, {
            id: runId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [],
            usage: { ...usage, context_window: contextWindow },
          });
        }

        writeDone(res);
        res.end();
      }
    }
  })();

  return true;
}
