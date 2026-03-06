/**
 * Chat controller — pure functions for chat event handling, history loading,
 * message sending, and normalization.
 *
 * Copied 1:1 from openclaw2 `controllers/chat.ts`.
 */
import type { GatewayBrowserClient } from "../gateway-client";
import type { ChatStreamEvent } from "../gateway-client";
import type { ChatMessage } from "../views/chat/chat-types";

// ---------------------------------------------------------------------------
// Silent reply detection (like openclaw2)
// ---------------------------------------------------------------------------

const SILENT_REPLY_PATTERN = /^\s*NO_REPLY\s*$/;

function isSilentReplyStream(text: string): boolean {
  return SILENT_REPLY_PATTERN.test(text);
}

/** Client-side defense-in-depth: detect assistant messages whose text is purely NO_REPLY. */
function isAssistantSilentReply(message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const entry = message as Record<string, unknown>;
  const role = typeof entry.role === "string" ? entry.role.toLowerCase() : "";
  if (role !== "assistant") return false;
  // entry.text takes precedence — matches gateway extractAssistantTextForSilentCheck
  if (typeof entry.text === "string") {
    return isSilentReplyStream(entry.text);
  }
  const text = extractRawText(message);
  return typeof text === "string" && isSilentReplyStream(text);
}

// ---------------------------------------------------------------------------
// Chat state (mutable — caller passes a reference that we mutate)
// ---------------------------------------------------------------------------

export type ChatState = {
  chatMessages: ChatMessage[];
  chatStreamingText: string;
  chatStreamingRunId: string | null;
  chatRunId: string | null;
  chatSending: boolean;
  chatError: string | null;
  chatThinkingLevel: string | null;
  chatToolCalls: Array<{
    id: string;
    name: string;
    phase: "start" | "update" | "result";
    isError?: boolean;
    detail?: string;
    output?: string;
  }>;
};

// ---------------------------------------------------------------------------
// Text extraction (like openclaw2 extractRawText / extractText)
// ---------------------------------------------------------------------------

/** Extract raw text from a message payload (handles content string, content array, and .text fallback). */
export function extractRawText(message: unknown): string | null {
  if (!message) return null;
  const m = message as Record<string, unknown>;
  const content = m.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p: Record<string, unknown>) => {
        if (p.type === "text" && typeof p.text === "string") return p.text;
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) return parts.join("\n");
  }
  // Fallback: .text field (like openclaw2 extractRawText)
  if (typeof m.text === "string") return m.text;
  return null;
}

// Keep old name as alias for backward compat
export { extractRawText as extractTextFromMessage };

// ---------------------------------------------------------------------------
// Message normalization (like openclaw2 normalizeAssistantMessage)
// ---------------------------------------------------------------------------

type AssistantMessageNormalizationOptions = {
  roleRequirement: "required" | "optional";
  roleCaseSensitive?: boolean;
  requireContentArray?: boolean;
  allowTextField?: boolean;
};

function normalizeAssistantMessage(
  message: unknown,
  options: AssistantMessageNormalizationOptions,
): Record<string, unknown> | null {
  if (!message || typeof message !== "object") return null;
  const candidate = message as Record<string, unknown>;
  const roleValue = candidate.role;
  if (typeof roleValue === "string") {
    const role = options.roleCaseSensitive ? roleValue : roleValue.toLowerCase();
    if (role !== "assistant") return null;
  } else if (options.roleRequirement === "required") {
    return null;
  }

  if (options.requireContentArray) {
    return Array.isArray(candidate.content) ? candidate : null;
  }
  if (!("content" in candidate) && !(options.allowTextField && "text" in candidate)) {
    return null;
  }
  return candidate;
}

function normalizeAbortedAssistantMessage(message: unknown): Record<string, unknown> | null {
  return normalizeAssistantMessage(message, {
    roleRequirement: "required",
    roleCaseSensitive: true,
    requireContentArray: true,
  });
}

function normalizeFinalAssistantMessage(message: unknown): Record<string, unknown> | null {
  return normalizeAssistantMessage(message, {
    roleRequirement: "optional",
    allowTextField: true,
  });
}

/** Convert a normalized record to a ChatMessage (for appending to state). */
function toChatMessage(record: Record<string, unknown>): ChatMessage {
  const role = typeof record.role === "string" ? record.role : "assistant";
  const content = record.content as ChatMessage["content"];
  const timestamp = typeof record.timestamp === "number" ? record.timestamp : Date.now();
  return { role, content, timestamp };
}

// Keep public export for backward compat (app-gateway uses it for cross-run finals)
export function normalizeFinalMessage(message: unknown): ChatMessage | null {
  const normalized = normalizeFinalAssistantMessage(message);
  if (!normalized || isAssistantSilentReply(normalized)) return null;
  return toChatMessage(normalized);
}

// ---------------------------------------------------------------------------
// Chat event handler (like openclaw2 handleChatEvent)
// ---------------------------------------------------------------------------

export type HandleChatEventResult = "delta" | "final" | "aborted" | "error" | null;

export function handleChatEvent(
  state: ChatState,
  evt: ChatStreamEvent,
  opts: {
    normalizeSessionKey: (key: string) => string;
    currentSessionKey: string;
    onFinalCrossRun?: () => void;
  },
): HandleChatEventResult {
  // Filter by session key (like openclaw2: payload.sessionKey !== state.sessionKey)
  if (evt.sessionKey) {
    const evtKey = opts.normalizeSessionKey(evt.sessionKey);
    const currentKey = opts.normalizeSessionKey(opts.currentSessionKey);
    if (evtKey !== currentKey) return null;
  }

  // Cross-run: final from another run (e.g. sub-agent announce).
  // See https://github.com/openclaw/openclaw/issues/1909
  if (evt.runId && state.chatRunId && evt.runId !== state.chatRunId) {
    if (evt.state === "final") {
      const finalMsg = normalizeFinalAssistantMessage(evt.message);
      if (finalMsg && !isAssistantSilentReply(finalMsg)) {
        state.chatMessages = [...state.chatMessages, toChatMessage(finalMsg)];
        opts.onFinalCrossRun?.();
        return null;
      }
      return "final";
    }
    return null;
  }

  if (evt.state === "delta") {
    const next = extractRawText(evt.message);
    if (typeof next === "string" && !isSilentReplyStream(next)) {
      const current = state.chatStreamingText;
      if (!current || next.length >= current.length) {
        state.chatStreamingText = next;
      }
    }
    state.chatStreamingRunId = evt.runId;
    if (!state.chatRunId) {
      state.chatRunId = evt.runId;
    }
    return "delta";
  }

  if (evt.state === "final") {
    const finalMsg = normalizeFinalAssistantMessage(evt.message);
    if (finalMsg && !isAssistantSilentReply(finalMsg)) {
      state.chatMessages = [...state.chatMessages, toChatMessage(finalMsg)];
    } else if (state.chatStreamingText?.trim() && !isSilentReplyStream(state.chatStreamingText)) {
      state.chatMessages = [
        ...state.chatMessages,
        {
          role: "assistant",
          content: [{ type: "text", text: state.chatStreamingText }],
          timestamp: Date.now(),
        },
      ];
    }
    clearStreamState(state);
    return "final";
  }

  if (evt.state === "aborted") {
    const normalizedMessage = normalizeAbortedAssistantMessage(evt.message);
    if (normalizedMessage && !isAssistantSilentReply(normalizedMessage)) {
      state.chatMessages = [...state.chatMessages, toChatMessage(normalizedMessage)];
    } else {
      const streamedText = state.chatStreamingText ?? "";
      if (streamedText.trim() && !isSilentReplyStream(streamedText)) {
        state.chatMessages = [
          ...state.chatMessages,
          {
            role: "assistant",
            content: [{ type: "text", text: streamedText }],
            timestamp: Date.now(),
          },
        ];
      }
    }
    clearStreamState(state);
    return "aborted";
  }

  if (evt.state === "error") {
    state.chatError = evt.errorMessage ?? "chat error";
    clearStreamState(state);
    return "error";
  }

  return null;
}

function clearStreamState(state: ChatState) {
  state.chatStreamingText = "";
  state.chatStreamingRunId = null;
  state.chatRunId = null;
  state.chatToolCalls = [];
  state.chatSending = false;
}

// ---------------------------------------------------------------------------
// Load chat history from gateway (like openclaw2 loadChatHistory)
// ---------------------------------------------------------------------------

export async function loadChatHistory(
  client: GatewayBrowserClient,
  sessionKey: string,
): Promise<{ messages: ChatMessage[]; thinkingLevel: string | null }> {
  const res = await client.request<{
    messages?: Array<Record<string, unknown>>;
    thinkingLevel?: string;
  }>("chat.history", { sessionKey, limit: 200 });

  const rawMessages = Array.isArray(res.messages) ? res.messages : [];
  // Filter out silent reply messages (like openclaw2)
  const parsed: ChatMessage[] = rawMessages
    .filter((msg) => !isAssistantSilentReply(msg))
    .map((msg) => ({
      role: typeof msg.role === "string" ? msg.role : "assistant",
      content: msg.content as ChatMessage["content"],
      timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
      id: typeof msg.id === "string" ? msg.id : undefined,
    }));

  return {
    messages: parsed,
    thinkingLevel: typeof res.thinkingLevel === "string" ? res.thinkingLevel : null,
  };
}

// ---------------------------------------------------------------------------
// Send chat message (like openclaw2 sendChatMessage)
// ---------------------------------------------------------------------------

export type SendChatParams = {
  client: GatewayBrowserClient;
  sessionKey: string;
  message: string;
  runId: string;
  attachments?: Array<{ type: string; mimeType: string; content: string }>;
};

export async function sendChatRequest(params: SendChatParams): Promise<void> {
  await params.client.request("chat.send", {
    sessionKey: params.sessionKey,
    message: params.message,
    deliver: false,
    idempotencyKey: params.runId,
    attachments: params.attachments,
  });
}

// ---------------------------------------------------------------------------
// Abort chat run (like openclaw2 abortChatRun)
// ---------------------------------------------------------------------------

export async function abortChatRun(
  client: GatewayBrowserClient,
  sessionKey: string,
  runId: string | null,
): Promise<boolean> {
  try {
    await client.request("chat.abort", runId ? { sessionKey, runId } : { sessionKey });
    return true;
  } catch (err) {
    console.warn("[chat] abort failed:", err);
    return false;
  }
}
