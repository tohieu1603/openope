/**
 * Gateway event routing — connects gateway WS events to chat controller.
 *
 * Modeled after openclaw2 `app-gateway.ts`.
 * Provides handler functions that app.ts calls from its event subscriptions.
 */
import type { ChatStreamEvent, ToolEvent, LifecycleEvent, CompactionEvent } from "./gateway-client";
import { handleTerminalChatEvent, type ChatHost } from "./app-chat";
import { handleChatEvent } from "./controllers/chat";
import { getTokenBalance } from "./tokens-api";

// ---------------------------------------------------------------------------
// Reload-history guard (like openclaw2 chat-event-reload.ts)
// ---------------------------------------------------------------------------

/** Decide whether to reload full history after a final event. */
function shouldReloadHistoryForFinalEvent(evt: ChatStreamEvent): boolean {
  if (evt.state !== "final") return false;
  if (!evt.message || typeof evt.message !== "object") return true;
  const message = evt.message as Record<string, unknown>;
  const role = typeof message.role === "string" ? message.role.toLowerCase() : "";
  // Reload if role is present but not "assistant" (e.g. system, tool)
  if (role && role !== "assistant") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Extended host interface (app.ts properties needed by event handlers)
// ---------------------------------------------------------------------------

export type GatewayEventHost = ChatHost & {
  chatCompactionActive: boolean;
  compactionClearTimer: ReturnType<typeof setTimeout> | null;
};

// ---------------------------------------------------------------------------
// Chat stream event handler (like openclaw2 handleChatGatewayEvent)
// ---------------------------------------------------------------------------

export function handleChatStreamEvent(host: GatewayEventHost, evt: ChatStreamEvent): void {
  const result = handleChatEvent(host, evt, {
    normalizeSessionKey: host.normalizeSessionKey,
    currentSessionKey: host.chatConversationId || "main",
    onFinalCrossRun: () => {
      void host.loadChatMessagesFromGateway();
    },
  });

  if (result === "final" || result === "aborted" || result === "error") {
    handleTerminalChatEvent(host);
  }

  // Reload full history when final event is from non-assistant role (like openclaw2)
  if (result === "final" && shouldReloadHistoryForFinalEvent(evt)) {
    void host.loadChatMessagesFromGateway();
  }

  // Fetch updated token balance on final (fire-and-forget)
  if (result === "final") {
    getTokenBalance()
      .then((bal) => {
        host.chatTokenBalance = bal.balance;
        if (host.currentUser) {
          host.currentUser = { ...host.currentUser, token_balance: bal.balance };
        }
      })
      .catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Tool event handler
// ---------------------------------------------------------------------------

export function handleToolEvent(host: GatewayEventHost, evt: ToolEvent): void {
  // Filter by active run
  if (evt.runId !== host.chatRunId) return;

  const { phase, toolCallId, name, isError, args, result, partialResult } = evt.data;
  if (!toolCallId) return;

  const detail = extractToolDetail(name, args);
  const rawOutput = phase === "result" ? result : phase === "update" ? partialResult : undefined;
  const output = rawOutput !== undefined ? formatToolOutput(rawOutput) : undefined;

  const existing = host.chatToolCalls.findIndex((t) => t.id === toolCallId);
  if (phase === "start" && existing < 0) {
    host.chatToolCalls = [
      ...host.chatToolCalls,
      { id: toolCallId, name: name ?? "tool", phase: "start", detail },
    ];
  } else if (existing >= 0) {
    const updated = [...host.chatToolCalls];
    updated[existing] = {
      ...updated[existing],
      phase,
      isError,
      ...(detail ? { detail } : {}),
      ...(output !== undefined ? { output } : {}),
    };
    host.chatToolCalls = updated;
  }

  // Trim to 50 entries max
  if (host.chatToolCalls.length > 50) {
    host.chatToolCalls = host.chatToolCalls.slice(-50);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle event handler
// ---------------------------------------------------------------------------

export function handleLifecycleEvent(host: GatewayEventHost, evt: LifecycleEvent): void {
  // Only process for active run (like TUI)
  if (evt.runId !== host.chatRunId) return;
  // Agent start/end/error — final chat event handles cleanup
}

// ---------------------------------------------------------------------------
// Compaction event handler
// ---------------------------------------------------------------------------

export function handleCompactionEvent(host: GatewayEventHost, evt: CompactionEvent): void {
  if (host.compactionClearTimer) {
    clearTimeout(host.compactionClearTimer);
    host.compactionClearTimer = null;
  }
  if (evt.phase === "start") {
    host.chatCompactionActive = true;
  } else if (evt.phase === "end") {
    host.chatCompactionActive = false;
    host.compactionClearTimer = setTimeout(() => {
      host.chatCompactionActive = false;
      host.compactionClearTimer = null;
    }, 5000);
  }
}

// ---------------------------------------------------------------------------
// Reconnect handler
// ---------------------------------------------------------------------------

export function handleReconnect(host: GatewayEventHost): void {
  // Clear transient streaming state, keep chatRunId alive across reconnects
  host.chatStreamingText = "";
  host.chatStreamingRunId = null;
  host.chatToolCalls = [];
}

// ---------------------------------------------------------------------------
// Tool detail extraction helpers
// ---------------------------------------------------------------------------

function extractToolDetail(name: string | undefined, args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;

  // Browser tool: action + url/value
  if (name === "browser") {
    const action = typeof a.action === "string" ? a.action : undefined;
    if (!action) return undefined;
    const url = typeof a.url === "string" ? a.url : undefined;
    if (url) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        return `${action} · ${host}`;
      } catch {
        return `${action} · ${url.slice(0, 40)}`;
      }
    }
    const value = typeof a.value === "string" ? a.value : undefined;
    if (value) return `${action} · ${value.slice(0, 40)}`;
    const ref = typeof a.ref === "string" ? a.ref : undefined;
    if (ref) return `${action} · ${ref}`;
    return action;
  }

  // Shell/bash tools
  if (name === "shell" || name === "bash" || name === "execute_command") {
    const cmd = typeof a.command === "string" ? a.command : undefined;
    if (cmd) return cmd.length > 50 ? cmd.slice(0, 47) + "…" : cmd;
  }

  // File tools
  if (name === "read_file" || name === "write_file" || name === "edit_file") {
    const path =
      typeof a.path === "string"
        ? a.path
        : typeof a.file_path === "string"
          ? a.file_path
          : undefined;
    if (path) return path.split("/").slice(-2).join("/");
  }

  // Search tools
  if (name === "search" || name === "grep" || name === "web_search") {
    const query =
      typeof a.query === "string" ? a.query : typeof a.pattern === "string" ? a.pattern : undefined;
    if (query) return query.length > 50 ? query.slice(0, 47) + "…" : query;
  }

  // Generic: try action field
  const action = typeof a.action === "string" ? a.action : undefined;
  if (action) return action;

  return undefined;
}

function formatToolOutput(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.slice(0, 120_000);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.text === "string") return rec.text.slice(0, 120_000);
    if (Array.isArray(rec.content)) {
      const parts = (rec.content as Array<Record<string, unknown>>)
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text as string);
      if (parts.length > 0) return parts.join("\n").slice(0, 120_000);
    }
  }
  try {
    const json = JSON.stringify(
      value,
      (_key, v) => {
        if (typeof v === "string" && v.length > 10_000) return v.slice(0, 10_000) + "…";
        return v;
      },
      2,
    );
    return json.slice(0, 120_000);
  } catch {
    return String(value).slice(0, 120_000);
  }
}
