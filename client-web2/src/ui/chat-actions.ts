/**
 * Chat actions module — extracted from app.ts for modularization.
 * All chat-related logic: send, stream, cache, queue, tool events, compaction, abort.
 */
import type { ChatStreamEvent, ToolEvent, CompactionEvent } from "./gateway-client";
import type { PendingImage } from "./views/chat";
import { showToast } from "./components/operis-toast";
import { waitForConnection, getGatewayClient } from "./gateway-client";
import { getTokenBalance } from "./tokens-api";

// --- Types ---

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  images?: Array<{ preview: string }>;
}

export interface ChatQueueItem {
  id: string;
  text: string;
  createdAt: number;
  images?: PendingImage[];
}

export interface ChatToolCall {
  id: string;
  name: string;
  phase: "start" | "update" | "result";
  isError?: boolean;
  detail?: string;
  output?: string;
}

/** Interface for the host app — chat actions read/write these properties. */
export interface AppChatContext {
  // State (read/write)
  chatMessages: ChatMessage[];
  chatDraft: string;
  chatSending: boolean;
  chatConversationId: string | null;
  chatError: string | null;
  chatInitializing: boolean;
  chatStreamingText: string;
  chatStreamingRunId: string | null;
  chatToolCalls: ChatToolCall[];
  chatPendingImages: PendingImage[];
  chatSessionTokens: number;
  chatThinkingLevel: string | null;
  chatTokenBalance: number;
  chatRunId: string | null;
  chatQueue: ChatQueueItem[];
  chatCompactionActive: boolean;
  currentUser: { token_balance?: number } | null;

  // Methods the host provides
  requestUpdate(): void;
  scrollChatToBottom(): Promise<void>;
  loadGatewaySessions(): Promise<void>;
  persistSessionKey(key: string): void;
}

// --- Chat busy check ---

export function isChatBusy(ctx: AppChatContext): boolean {
  return ctx.chatSending || Boolean(ctx.chatRunId);
}

// --- Chat queue ---

export function enqueueChatMessage(ctx: AppChatContext, text: string, images?: PendingImage[]) {
  const trimmed = text.trim();
  if (!trimmed && (!images || images.length === 0)) return;
  ctx.chatQueue = [
    ...ctx.chatQueue,
    { id: crypto.randomUUID(), text: trimmed, createdAt: Date.now(), images },
  ];
}

export async function flushChatQueue(ctx: AppChatContext) {
  if (isChatBusy(ctx) || ctx.chatQueue.length === 0) return;
  const [next, ...rest] = ctx.chatQueue;
  ctx.chatQueue = rest;
  // Re-use sendMessage logic but with queued content
  ctx.chatDraft = next.text;
  ctx.chatPendingImages = next.images ?? [];
  await handleSendMessage(ctx);
  // If send failed (chatSending still false), restore queue
  if (!ctx.chatSending && !isChatBusy(ctx)) {
    if (ctx.chatDraft === next.text) {
      ctx.chatDraft = "";
      ctx.chatQueue = [next, ...ctx.chatQueue];
    }
  }
}

export function removeQueuedMessage(ctx: AppChatContext, id: string) {
  ctx.chatQueue = ctx.chatQueue.filter((item) => item.id !== id);
}

// --- Chat cache (localStorage) ---

const CHAT_CACHE_KEY = "operis-chat-messages";

export function cacheChatMessages(ctx: AppChatContext) {
  try {
    const sessionKey = ctx.chatConversationId || "main";
    const data = {
      sessionKey,
      cachedAt: Date.now(),
      messages: ctx.chatMessages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp?.toISOString(),
      })),
    };
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

export function restoreCachedMessages(ctx: AppChatContext): boolean {
  try {
    const raw = localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const sessionKey = ctx.chatConversationId || "main";
    if (data.sessionKey !== sessionKey) return false;
    if (!Array.isArray(data.messages) || data.messages.length === 0) return false;
    // Skip stale cache (older than 24h)
    if (data.cachedAt && Date.now() - data.cachedAt > 24 * 60 * 60 * 1000) return false;
    ctx.chatMessages = data.messages.map((m: Record<string, string>) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.timestamp ? new Date(m.timestamp) : undefined,
    }));
    return true;
  } catch {
    return false;
  }
}

// --- Stream event handlers ---

export function handleChatStreamEvent(ctx: AppChatContext, evt: ChatStreamEvent) {
  // Guard: only process events when actively sending via WS (like original client-web)
  if (!ctx.chatSending || ctx.chatStreamingRunId === "sse-stream") return;

  if (evt.state === "delta" && evt.message?.content) {
    const text = evt.message.content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("");
    ctx.chatStreamingText = text;
    ctx.chatStreamingRunId = evt.runId;
  } else if (evt.state === "final") {
    handleChatFinal(ctx, evt);
  } else if (evt.state === "aborted") {
    ctx.chatRunId = null;
    ctx.chatStreamingText = "";
    ctx.chatStreamingRunId = null;
    ctx.chatToolCalls = [];
    ctx.chatSending = false;
    flushChatQueue(ctx);
  } else if (evt.state === "error") {
    const errorMsg = evt.errorMessage || "Có lỗi xảy ra khi xử lý tin nhắn";
    ctx.chatMessages = [
      ...ctx.chatMessages,
      { role: "assistant", content: `⚠️ ${errorMsg}`, timestamp: new Date() },
    ];
    ctx.chatRunId = null;
    ctx.chatStreamingText = "";
    ctx.chatStreamingRunId = null;
    ctx.chatToolCalls = [];
    ctx.chatSending = false;
    flushChatQueue(ctx);
  }
}

function handleChatFinal(ctx: AppChatContext, evt: ChatStreamEvent) {
  const finalText =
    evt.message?.content
      ?.filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("") || ctx.chatStreamingText;

  if (finalText) {
    ctx.chatMessages = [
      ...ctx.chatMessages,
      { role: "assistant", content: finalText, timestamp: new Date() },
    ];
  }

  // Accumulate WS token usage
  const wsUsage = evt.usage ?? evt.message?.usage;
  if (wsUsage) {
    ctx.chatSessionTokens +=
      wsUsage.totalTokens || (wsUsage.input || 0) + (wsUsage.output || 0) || 0;
  }

  ctx.chatRunId = null;
  ctx.chatStreamingText = "";
  ctx.chatStreamingRunId = null;
  ctx.chatToolCalls = [];
  ctx.chatSending = false;

  cacheChatMessages(ctx);
  ctx.loadGatewaySessions();
  flushChatQueue(ctx);

  // Fetch updated token balance (fire-and-forget)
  getTokenBalance()
    .then((bal) => {
      ctx.chatTokenBalance = bal.balance;
      if (ctx.currentUser) {
        ctx.currentUser = { ...ctx.currentUser, token_balance: bal.balance };
      }
    })
    .catch(() => {});
}

// --- Tool event handler ---

export function handleToolEvent(ctx: AppChatContext, evt: ToolEvent) {
  if (!isChatBusy(ctx)) return;
  const { phase, toolCallId, name, isError, args, result, partialResult } = evt.data;
  if (!toolCallId) return;

  const detail = extractToolDetail(name, args);
  const rawOutput = phase === "result" ? result : phase === "update" ? partialResult : undefined;
  const output = rawOutput !== undefined ? formatToolOutput(rawOutput) : undefined;

  const existing = ctx.chatToolCalls.findIndex((t) => t.id === toolCallId);
  if (phase === "start" && existing < 0) {
    ctx.chatToolCalls = [
      ...ctx.chatToolCalls,
      { id: toolCallId, name: name ?? "tool", phase: "start", detail },
    ];
  } else if (existing >= 0) {
    const updated = [...ctx.chatToolCalls];
    updated[existing] = {
      ...updated[existing],
      phase,
      isError,
      ...(detail ? { detail } : {}),
      ...(output !== undefined ? { output } : {}),
    };
    ctx.chatToolCalls = updated;
  }

  // Trim to 50 entries max
  if (ctx.chatToolCalls.length > 50) {
    ctx.chatToolCalls = ctx.chatToolCalls.slice(-50);
  }
}

// --- Compaction event handler ---

export function handleCompactionEvent(
  ctx: AppChatContext,
  evt: CompactionEvent,
  clearTimer: { current: ReturnType<typeof setTimeout> | null },
) {
  if (clearTimer.current) {
    clearTimeout(clearTimer.current);
    clearTimer.current = null;
  }
  if (evt.phase === "start") {
    ctx.chatCompactionActive = true;
  } else if (evt.phase === "end") {
    ctx.chatCompactionActive = false;
    clearTimer.current = setTimeout(() => {
      ctx.chatCompactionActive = false;
      clearTimer.current = null;
    }, 5000);
  }
}

// --- Send message ---

export async function handleSendMessage(ctx: AppChatContext) {
  const hasDraft = ctx.chatDraft.trim() || ctx.chatPendingImages.length > 0;
  if (!hasDraft) return;

  // Queue if busy
  if (isChatBusy(ctx)) {
    enqueueChatMessage(
      ctx,
      ctx.chatDraft,
      ctx.chatPendingImages.length > 0 ? [...ctx.chatPendingImages] : undefined,
    );
    ctx.chatDraft = "";
    ctx.chatPendingImages = [];
    return;
  }

  const userMessage = ctx.chatDraft.trim();
  const images = ctx.chatPendingImages.length > 0 ? [...ctx.chatPendingImages] : undefined;
  ctx.chatDraft = "";
  ctx.chatPendingImages = [];
  ctx.chatSending = true;
  ctx.chatError = null;
  ctx.chatStreamingText = "";
  ctx.chatStreamingRunId = null;
  ctx.chatToolCalls = [];

  // Detect /new or /reset → clear messages before sending
  const isResetCommand = /^\/(new|reset)\b/i.test(userMessage);
  if (isResetCommand) {
    ctx.chatMessages = [];
    ctx.chatSessionTokens = 0;
    cacheChatMessages(ctx);
  }

  // Add user message
  ctx.chatMessages = [
    ...ctx.chatMessages,
    {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
      ...(images ? { images: images.map((img) => ({ preview: img.preview })) } : {}),
    },
  ];
  cacheChatMessages(ctx);
  await ctx.scrollChatToBottom();

  try {
    const gw = await waitForConnection(5000);
    const runId = crypto.randomUUID();
    ctx.chatRunId = runId;
    await gw.request(
      "chat.send",
      {
        sessionKey: ctx.chatConversationId || "main",
        message: userMessage,
        deliver: false,
        idempotencyKey: runId,
        ...(ctx.chatThinkingLevel ? { thinking: ctx.chatThinkingLevel } : {}),
        ...(images?.length
          ? {
              attachments: images.map((img) => ({
                type: "image",
                mimeType: img.mimeType,
                content: img.data,
              })),
            }
          : {}),
      },
      30_000,
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Không thể gửi tin nhắn";
    ctx.chatError = errorMsg;
    ctx.chatMessages = [
      ...ctx.chatMessages,
      { role: "assistant", content: `⚠️ ${errorMsg}`, timestamp: new Date() },
    ];
    ctx.chatRunId = null;
    ctx.chatStreamingText = "";
    ctx.chatStreamingRunId = null;
    ctx.chatToolCalls = [];
  } finally {
    ctx.chatSending = false;
  }
}

// --- Stop/abort chat ---

export function handleStopChat(ctx: AppChatContext) {
  const partialText = ctx.chatStreamingText;
  if (partialText) {
    ctx.chatMessages = [
      ...ctx.chatMessages,
      { role: "assistant" as const, content: partialText, timestamp: new Date() },
    ];
  }
  const gw = getGatewayClient();
  if (gw.connected && ctx.chatRunId) {
    gw.request("chat.abort", {
      sessionKey: ctx.chatConversationId || "main",
      runId: ctx.chatRunId,
    }).catch(() => {});
  }
  ctx.chatRunId = null;
  ctx.chatStreamingText = "";
  ctx.chatStreamingRunId = null;
  ctx.chatToolCalls = [];
  ctx.chatSending = false;
}

// --- Load messages from gateway ---

export async function loadChatMessagesFromGateway(ctx: AppChatContext, isInitialLoad = false) {
  if (isInitialLoad) {
    restoreCachedMessages(ctx);
  }

  try {
    const gw = await waitForConnection(5000);
    const sessionKey = ctx.chatConversationId || "main";
    const res = await gw.request<{
      messages?: Array<Record<string, unknown>>;
      thinkingLevel?: string;
      sessionId?: string;
    }>("chat.history", { sessionKey, limit: 200 });

    const rawMessages = Array.isArray(res.messages) ? res.messages : [];
    console.log("[chat] history response:", {
      sessionKey,
      sessionId: res.sessionId,
      messageCount: rawMessages.length,
    });
    const parsed = rawMessages
      .map((msg) => {
        const role = (msg.role === "user" ? "user" : "assistant") as "user" | "assistant";
        let content = "";
        if (typeof msg.content === "string") {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          content = (msg.content as Array<Record<string, unknown>>)
            .filter((block) => block.type === "text" && typeof block.text === "string")
            .map((block) => block.text as string)
            .join("\n");
        }
        const ts = typeof msg.timestamp === "number" ? new Date(msg.timestamp) : undefined;
        return { role, content, timestamp: ts };
      })
      .filter((m) => m.content);

    ctx.chatMessages = parsed;
    if (typeof res.thinkingLevel === "string") {
      ctx.chatThinkingLevel = res.thinkingLevel;
    }
    cacheChatMessages(ctx);
  } catch (err) {
    console.warn("[chat] Failed to load messages from gateway:", err);
    if (ctx.chatMessages.length === 0) {
      restoreCachedMessages(ctx);
    }
  } finally {
    if (isInitialLoad) {
      ctx.chatInitializing = false;
    }
  }
}

// --- Refresh chat ---

export async function handleRefreshChat(ctx: AppChatContext) {
  ctx.chatStreamingText = "";
  ctx.chatStreamingRunId = null;
  ctx.chatToolCalls = [];
  await loadChatMessagesFromGateway(ctx);
  ctx.loadGatewaySessions();
  ctx.scrollChatToBottom();
}

// --- Inject message into transcript ---

export async function handleChatInject(ctx: AppChatContext, content: string, sessionKey?: string) {
  try {
    const gw = await waitForConnection(5000);
    await gw.request("chat.inject", {
      sessionKey: sessionKey || ctx.chatConversationId || "main",
      content,
    });
    // Reload messages to show injected message
    await loadChatMessagesFromGateway(ctx);
    ctx.scrollChatToBottom();
  } catch (err) {
    console.error("[chat] inject failed:", err);
    showToast("Không thể inject message", "error");
  }
}

// --- Image handling ---

export function handleImageSelect(ctx: AppChatContext, files: FileList) {
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  for (const file of Array.from(files)) {
    if (!ALLOWED_TYPES.has(file.type) || file.size > MAX_FILE_SIZE) continue;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      if (!base64) return;
      ctx.chatPendingImages = [
        ...ctx.chatPendingImages,
        { data: base64, mimeType: file.type, preview: dataUrl },
      ];
    };
    reader.readAsDataURL(file);
  }
}

export function handleImageRemove(ctx: AppChatContext, index: number) {
  ctx.chatPendingImages = ctx.chatPendingImages.filter((_, i) => i !== index);
}

// --- Helper functions ---

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
    return JSON.stringify(value, null, 2).slice(0, 120_000);
  } catch {
    return String(value);
  }
}

function extractToolDetail(name: string | undefined, args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const a = args as Record<string, unknown>;

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

  if (name === "shell" || name === "bash" || name === "execute_command") {
    const cmd = typeof a.command === "string" ? a.command : undefined;
    if (cmd) return cmd.length > 50 ? cmd.slice(0, 47) + "…" : cmd;
  }

  if (name === "read_file" || name === "write_file" || name === "edit_file") {
    const path =
      typeof a.path === "string"
        ? a.path
        : typeof a.file_path === "string"
          ? a.file_path
          : undefined;
    if (path) {
      const short = path.split("/").slice(-2).join("/");
      return short;
    }
  }

  if (name === "search" || name === "grep" || name === "web_search") {
    const query =
      typeof a.query === "string" ? a.query : typeof a.pattern === "string" ? a.pattern : undefined;
    if (query) return query.length > 50 ? query.slice(0, 47) + "…" : query;
  }

  const action = typeof a.action === "string" ? a.action : undefined;
  if (action) return action;

  return undefined;
}
