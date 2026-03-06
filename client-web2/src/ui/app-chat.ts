/**
 * Chat orchestration — send/stop/queue/cache coordination.
 *
 * Modeled after openclaw2 `app-chat.ts`.
 * Functions take the OperisApp instance as first arg (typed loosely to avoid circular deps).
 */
import type { ChatMessage, PendingImage } from "./views/chat/chat-types";
import { sendChatRequest, abortChatRun } from "./controllers/chat";
import { waitForConnection, getGatewayClient } from "./gateway-client";

// ---------------------------------------------------------------------------
// Host interface — subset of OperisApp properties used by this module
// ---------------------------------------------------------------------------

export type ChatHost = {
  chatMessages: ChatMessage[];
  chatDraft: string;
  chatSending: boolean;
  chatRunId: string | null;
  chatStreamingText: string;
  chatStreamingRunId: string | null;
  chatToolCalls: ChatMessage extends never
    ? never
    : Array<{
        id: string;
        name: string;
        phase: "start" | "update" | "result";
        isError?: boolean;
        detail?: string;
        output?: string;
      }>;
  chatPendingImages: PendingImage[];
  chatError: string | null;
  chatSessionTokens: number;
  chatConversationId: string | null;
  chatQueue: Array<{ id: string; text: string; createdAt: number; images?: PendingImage[] }>;
  chatTokenBalance: number;
  currentUser: { token_balance?: number } | null;
  normalizeSessionKey: (key: string) => string;
  scrollChatToBottom: () => Promise<void>;
  loadChatMessagesFromGateway: (isInitialLoad?: boolean) => Promise<void>;
  loadGatewaySessions: () => void;
  cacheChatMessages: () => void;
};

// ---------------------------------------------------------------------------
// Busy check (like openclaw2 isChatBusy)
// ---------------------------------------------------------------------------

export function isChatBusy(host: ChatHost): boolean {
  return host.chatSending || Boolean(host.chatRunId);
}

// ---------------------------------------------------------------------------
// Stop command detection (like openclaw2 isChatStopCommand)
// ---------------------------------------------------------------------------

export function isChatStopCommand(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  if (normalized === "/stop") return true;
  return (
    normalized === "stop" ||
    normalized === "esc" ||
    normalized === "abort" ||
    normalized === "wait" ||
    normalized === "exit"
  );
}

// ---------------------------------------------------------------------------
// Send message (like openclaw2 handleSendChat + sendChatMessageNow)
// ---------------------------------------------------------------------------

export async function handleSendMessage(host: ChatHost): Promise<void> {
  const hasDraft = host.chatDraft.trim() || host.chatPendingImages.length > 0;
  if (!hasDraft) return;

  // Stop command — abort current run (like openclaw2)
  if (isChatStopCommand(host.chatDraft)) {
    host.chatDraft = "";
    host.chatPendingImages = [];
    handleStopChat(host);
    return;
  }

  // Queue if busy
  if (isChatBusy(host)) {
    enqueueChatMessage(
      host,
      host.chatDraft,
      host.chatPendingImages.length > 0 ? [...host.chatPendingImages] : undefined,
    );
    host.chatDraft = "";
    host.chatPendingImages = [];
    return;
  }

  const userMessage = host.chatDraft.trim();
  const images = host.chatPendingImages.length > 0 ? [...host.chatPendingImages] : undefined;
  host.chatDraft = "";
  host.chatPendingImages = [];
  host.chatSending = true;
  host.chatError = null;
  host.chatStreamingText = "";
  host.chatStreamingRunId = null;
  host.chatToolCalls = [];

  // Detect /new or /reset — clear messages before sending
  const isResetCommand = /^\/(new|reset)\b/i.test(userMessage);
  if (isResetCommand) {
    host.chatMessages = [];
    host.chatSessionTokens = 0;
    host.cacheChatMessages();
  }

  // Build user message content blocks
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (userMessage) {
    contentBlocks.push({ type: "text", text: userMessage });
  }
  if (images?.length) {
    for (const img of images) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      });
    }
  }

  // Add user message to local state
  host.chatMessages = [
    ...host.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: Date.now(),
      ...(images ? { images: images.map((img) => ({ preview: img.preview })) } : {}),
    },
  ];
  await host.scrollChatToBottom();

  const runId = crypto.randomUUID();
  host.chatRunId = runId;
  host.chatStreamingText = "";

  // Convert attachments to API format
  const apiAttachments = images?.length
    ? images.map((img) => ({ type: "image", mimeType: img.mimeType, content: img.data }))
    : undefined;

  try {
    const gw = await waitForConnection(5000);
    const sessionKey = host.normalizeSessionKey(host.chatConversationId || "main");
    await sendChatRequest({
      client: gw,
      sessionKey,
      message: userMessage,
      runId,
      attachments: apiAttachments,
    });
  } catch (err) {
    const error = String(err);
    host.chatRunId = null;
    host.chatStreamingText = "";
    host.chatStreamingRunId = null;
    host.chatToolCalls = [];
    host.chatSending = false;
    host.chatError = error;
    host.chatMessages = [
      ...host.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Stop/abort chat (like openclaw2 handleAbortChat)
// ---------------------------------------------------------------------------

export function handleStopChat(host: ChatHost): void {
  // Save partial response
  const partialText = host.chatStreamingText;
  if (partialText) {
    host.chatMessages = [
      ...host.chatMessages,
      { role: "assistant", content: [{ type: "text", text: partialText }], timestamp: Date.now() },
    ];
  }

  // Abort via gateway WS
  const gw = getGatewayClient();
  if (gw.connected && host.chatRunId) {
    const sessionKey = host.normalizeSessionKey(host.chatConversationId || "main");
    void abortChatRun(gw, sessionKey, host.chatRunId);
  }

  host.chatRunId = null;
  host.chatStreamingText = "";
  host.chatStreamingRunId = null;
  host.chatToolCalls = [];
  host.chatSending = false;
}

// ---------------------------------------------------------------------------
// Chat queue (like openclaw2 enqueueChatMessage / flushChatQueue)
// ---------------------------------------------------------------------------

function enqueueChatMessage(host: ChatHost, text: string, images?: PendingImage[]): void {
  const trimmed = text.trim();
  if (!trimmed && (!images || images.length === 0)) return;
  if (host.chatQueue.length >= 20) {
    console.warn("[chat] queue full, dropping oldest message");
    host.chatQueue = host.chatQueue.slice(1);
  }
  host.chatQueue = [
    ...host.chatQueue,
    { id: crypto.randomUUID(), text: trimmed, createdAt: Date.now(), images },
  ];
}

export async function flushChatQueue(host: ChatHost): Promise<void> {
  if (isChatBusy(host) || host.chatQueue.length === 0) return;
  const [next, ...rest] = host.chatQueue;
  host.chatQueue = rest;
  try {
    host.chatDraft = next.text;
    host.chatPendingImages = next.images ?? [];
    await handleSendMessage(host);
  } catch (err) {
    console.error("[chat] queue flush failed:", err);
  }
  // Restore to queue if send failed
  if (!host.chatSending && !isChatBusy(host)) {
    host.chatDraft = "";
    host.chatPendingImages = [];
    host.chatQueue = [next, ...host.chatQueue];
  }
}

export function removeQueuedMessage(host: ChatHost, id: string): void {
  host.chatQueue = host.chatQueue.filter((item) => item.id !== id);
}

// ---------------------------------------------------------------------------
// Chat message cache (localStorage)
// ---------------------------------------------------------------------------

const CHAT_CACHE_KEY = "operis-chat-messages";

export function cacheChatMessages(host: ChatHost): void {
  try {
    const sessionKey = host.chatConversationId || "main";
    const data = { sessionKey, cachedAt: Date.now(), messages: host.chatMessages };
    localStorage.setItem(CHAT_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

export function restoreCachedMessages(host: ChatHost): boolean {
  try {
    const raw = localStorage.getItem(CHAT_CACHE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const sessionKey = host.chatConversationId || "main";
    if (data.sessionKey !== sessionKey) return false;
    if (!Array.isArray(data.messages) || data.messages.length === 0) return false;
    if (data.cachedAt && Date.now() - data.cachedAt > 24 * 60 * 60 * 1000) return false;
    host.chatMessages = data.messages as ChatMessage[];
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Terminal event handler — called after final/aborted/error
// (like openclaw2 handleTerminalChatEvent)
// ---------------------------------------------------------------------------

export function handleTerminalChatEvent(host: ChatHost): void {
  void flushChatQueue(host);
  // Refresh session selector (like openclaw2 — history reload is handled by app-gateway.ts)
  host.loadGatewaySessions();
}
