import {
  loadChatMessagesFromGateway,
  cacheChatMessages,
  type AppChatContext,
} from "./chat-actions";
import { showConfirm } from "./components/operis-confirm";
import { showToast } from "./components/operis-toast";
/**
 * Session & model management actions — extracted from app.ts for modularization.
 * Handles gateway sessions, model selection, session lifecycle (patch/reset/delete/compact).
 */
import { waitForConnection } from "./gateway-client";

// --- Types ---

export interface GatewaySession {
  key: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  model?: string;
  updatedAt?: number | null;
  kind?: string;
  label?: string;
  subject?: string;
  sessionId?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  supportsVision?: boolean;
  supportsThinking?: boolean;
}

export interface SessionPatchResult {
  ok: boolean;
  key?: string;
  entry?: Record<string, unknown>;
  resolved?: {
    modelProvider?: string;
    model?: string;
  };
}

export interface SessionResetResult {
  ok: boolean;
  key?: string;
  entry?: Record<string, unknown>;
}

export interface SessionDeleteResult {
  ok: boolean;
  key?: string;
  deleted?: boolean;
  archived?: string[];
}

export interface SessionCompactResult {
  ok: boolean;
  key?: string;
  compacted?: boolean;
  kept?: number;
  reason?: string;
  archived?: string;
}

export interface SessionPreviewItem {
  role: string;
  text: string;
  ts?: number;
}

export interface SessionPreviewEntry {
  key: string;
  status: "ok" | "empty" | "missing" | "error";
  items: SessionPreviewItem[];
}

export interface AppSessionContext extends AppChatContext {
  gatewaySessions: GatewaySession[];
  gatewayModels: ModelInfo[];
  gatewayModelsLoading: boolean;
}

// --- Session key helpers ---

/** Normalize session key: "main" → "agent:main:main", passthrough if already full key */
export function normalizeSessionKey(key: string): string {
  if (key.startsWith("agent:")) return key;
  return `agent:main:${key}`;
}

/** Strip agent prefix: "agent:main:main" → "main", "agent:main:telegram:123" → "telegram:123" */
export function shortSessionKey(key: string): string {
  if (!key.startsWith("agent:")) return key;
  const firstColon = key.indexOf(":");
  const secondColon = key.indexOf(":", firstColon + 1);
  if (secondColon === -1) return key;
  return key.substring(secondColon + 1);
}

// --- Session display helpers (matching TUI openSessionSelector) ---

/** Format session key for display: strips agent prefix */
function formatSessionKey(key: string): string {
  return shortSessionKey(key);
}

/** Format relative time like TUI: "2 phút trước", "3 giờ trước" */
export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "vừa xong";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

/**
 * Build display label for a session row (like TUI openSessionSelector).
 * Returns { label, description } for dropdown rendering.
 */
export function formatSessionDisplay(s: GatewaySession): {
  label: string;
  description: string;
} {
  const label = formatSessionKey(s.key);
  const timePart = s.updatedAt ? formatRelativeTime(s.updatedAt) : "";
  return { label, description: timePart };
}

// --- Load gateway sessions ---

export async function loadGatewaySessions(ctx: AppSessionContext): Promise<void> {
  try {
    const gw = await waitForConnection(5000);
    const result = await gw.request<{
      sessions: GatewaySession[];
    }>("sessions.list", {
      includeGlobal: false,
      includeUnknown: false,
      includeDerivedTitles: true,
      includeLastMessage: true,
    });
    if (result?.sessions) {
      // Only show web-chat sessions: agent keys whose rest part has no ":"
      // This excludes telegram:*, openai-user:*, cron:*, discord:*, etc.
      ctx.gatewaySessions = result.sessions.filter((s) => {
        if (!s.key.startsWith("agent:")) return false;
        if (s.kind === "group") return false;
        const rest = shortSessionKey(s.key);
        return !rest.includes(":");
      });
    }
  } catch (err) {
    console.error("[session] Failed to load gateway sessions:", err);
  }
}

// --- Session switching ---

export async function handleSessionChange(ctx: AppSessionContext, key: string): Promise<void> {
  const fullKey = normalizeSessionKey(key);
  const currentFull = normalizeSessionKey(ctx.chatConversationId || "main");
  if (fullKey === currentFull) return;

  // Store full key so chat.history receives the exact key from sessions.list
  ctx.chatConversationId = fullKey;
  ctx.chatMessages = [];
  ctx.chatStreamingText = "";
  ctx.chatToolCalls = [];
  ctx.persistSessionKey(fullKey);
  console.log("[session] switching to:", fullKey);
  await loadChatMessagesFromGateway(ctx, true);
  ctx.scrollChatToBottom();
}

// --- New conversation (via sessions.reset) ---

export async function handleNewConversation(ctx: AppSessionContext): Promise<void> {
  const sessionKey = normalizeSessionKey(ctx.chatConversationId || "main");
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<SessionResetResult>("sessions.reset", { key: sessionKey });
    if (res?.ok) {
      ctx.chatMessages = [];
      ctx.chatSessionTokens = 0;
      cacheChatMessages(ctx);
      // Reload sessions list (new session may appear)
      await loadGatewaySessions(ctx);
      showToast("Đã tạo phiên chat mới", "success");
    }
  } catch (err) {
    console.error("[session] reset failed:", err);
    // Fallback: send /new command
    ctx.chatDraft = "/new";
    // Note: caller should call handleSendMessage after this
  }
}

// --- Models list ---

export async function loadGatewayModels(ctx: AppSessionContext): Promise<void> {
  ctx.gatewayModelsLoading = true;
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<{
      models?: ModelInfo[];
    }>("models.list", {});
    if (res?.models) {
      ctx.gatewayModels = res.models;
    }
  } catch (err) {
    console.error("[session] Failed to load models:", err);
  } finally {
    ctx.gatewayModelsLoading = false;
  }
}

// --- Sessions.patch — change model, thinkingLevel, etc. ---

export async function patchSession(
  ctx: AppSessionContext,
  patch: {
    model?: string;
    thinkingLevel?: string;
    sendPolicy?: string;
    label?: string;
  },
  sessionKey?: string,
): Promise<SessionPatchResult | null> {
  const key = sessionKey || normalizeSessionKey(ctx.chatConversationId || "main");
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<SessionPatchResult>("sessions.patch", {
      key,
      ...patch,
    });
    if (res?.ok) {
      // Update local thinkingLevel if changed
      if (patch.thinkingLevel) {
        ctx.chatThinkingLevel = patch.thinkingLevel;
      }
      // Reload sessions to reflect model change
      await loadGatewaySessions(ctx);
      return res;
    }
    return null;
  } catch (err) {
    console.error("[session] patch failed:", err);
    showToast("Không thể cập nhật session", "error");
    return null;
  }
}

// --- Sessions.reset ---

export async function resetSession(
  ctx: AppSessionContext,
  sessionKey?: string,
): Promise<SessionResetResult | null> {
  const key = sessionKey || normalizeSessionKey(ctx.chatConversationId || "main");
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<SessionResetResult>("sessions.reset", { key });
    if (res?.ok) {
      ctx.chatMessages = [];
      ctx.chatSessionTokens = 0;
      cacheChatMessages(ctx);
      await loadGatewaySessions(ctx);
      showToast("Đã reset session", "success");
      return res;
    }
    return null;
  } catch (err) {
    console.error("[session] reset failed:", err);
    showToast("Không thể reset session", "error");
    return null;
  }
}

// --- Sessions.delete ---

export async function deleteSession(
  ctx: AppSessionContext,
  sessionKey: string,
  opts?: { deleteTranscript?: boolean },
): Promise<boolean> {
  const confirmed = await showConfirm({
    title: "Xóa session?",
    message: `Bạn có chắc muốn xóa session "${shortSessionKey(sessionKey)}"?`,
    confirmText: "Xóa",
    cancelText: "Hủy",
    variant: "danger",
  });
  if (!confirmed) return false;

  const key = normalizeSessionKey(sessionKey);
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<SessionDeleteResult>("sessions.delete", {
      key,
      deleteTranscript: opts?.deleteTranscript ?? true,
    });
    if (res?.ok) {
      // If deleted session is current, switch to main
      const currentKey = normalizeSessionKey(ctx.chatConversationId || "main");
      if (key === currentKey) {
        ctx.chatConversationId = null;
        ctx.chatMessages = [];
        ctx.chatSessionTokens = 0;
        ctx.persistSessionKey("main");
        await loadChatMessagesFromGateway(ctx, true);
        ctx.scrollChatToBottom();
      }
      await loadGatewaySessions(ctx);
      showToast("Đã xóa session", "success");
      return true;
    }
    return false;
  } catch (err) {
    console.error("[session] delete failed:", err);
    showToast("Không thể xóa session", "error");
    return false;
  }
}

// --- Sessions.compact ---

export async function compactSession(
  ctx: AppSessionContext,
  sessionKey?: string,
  maxLines?: number,
): Promise<SessionCompactResult | null> {
  const key = sessionKey || normalizeSessionKey(ctx.chatConversationId || "main");
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<SessionCompactResult>("sessions.compact", {
      key,
      ...(maxLines ? { maxLines } : {}),
    });
    if (res?.ok) {
      if (res.compacted) {
        showToast(`Đã compact session (giữ lại ${res.kept} dòng)`, "success");
        // Reload messages after compact
        await loadChatMessagesFromGateway(ctx);
        ctx.scrollChatToBottom();
      } else {
        showToast(res.reason || "Session không cần compact", "info");
      }
      return res;
    }
    return null;
  } catch (err) {
    console.error("[session] compact failed:", err);
    showToast("Không thể compact session", "error");
    return null;
  }
}

// --- Sessions.preview ---

export async function loadSessionPreviews(
  keys: string[],
  opts?: { limit?: number; maxChars?: number },
): Promise<SessionPreviewEntry[]> {
  if (keys.length === 0) return [];
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<{
      ts: number;
      previews: SessionPreviewEntry[];
    }>("sessions.preview", {
      keys,
      ...(opts?.limit ? { limit: opts.limit } : {}),
      ...(opts?.maxChars ? { maxChars: opts.maxChars } : {}),
    });
    return res?.previews ?? [];
  } catch (err) {
    console.error("[session] preview failed:", err);
    return [];
  }
}

// --- Sessions.resolve ---

export async function resolveSessionKey(
  key: string,
  opts?: { agentId?: string; channel?: string },
): Promise<string | null> {
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<{ ok: boolean; key: string }>("sessions.resolve", {
      key,
      ...(opts?.agentId ? { agentId: opts.agentId } : {}),
      ...(opts?.channel ? { channel: opts.channel } : {}),
    });
    return res?.ok ? res.key : null;
  } catch (err) {
    console.error("[session] resolve failed:", err);
    return null;
  }
}
