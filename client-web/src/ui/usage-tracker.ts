/**
 * Usage Tracker - Subscribe to gateway WS chat events and report token usage to Operis BE.
 * When a chat run finishes (state=final) with usage data:
 * 1. POST analytics to /analytics/usage
 * 2. Deduct tokens via POST /tokens/usage
 */
import { subscribeToChatStream, type ChatStreamEvent, type ChatTokenUsage } from "./gateway-client";
import { reportUsage } from "./analytics-api";
import apiClient, { isAuthenticated, getErrorMessage } from "./api-client";

let unsubscribe: (() => void) | null = null;

/** Deduct tokens from user balance via POST /tokens/usage */
async function deductUsage(usage: ChatTokenUsage): Promise<void> {
  try {
    const res = await apiClient.post("/tokens/usage", {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      model: "claude-sonnet-4-5-20250929",
      request_type: "gateway_chat",
    });
    console.log("[usage-tracker] deduct OK:", res.data);
  } catch (error) {
    console.warn("[usage-tracker] deduct failed:", getErrorMessage(error));
  }
}

function handleChatEvent(evt: ChatStreamEvent) {
  // Debug: log ALL chat events to verify WS is delivering them
  console.log("[usage-tracker] chat event:", evt.state, "runId:", evt.runId, "hasUsage:", !!(evt.usage ?? evt.message?.usage));

  if (evt.state !== "final") return;

  // Usage can be at top-level or nested in message
  const usage: ChatTokenUsage | undefined = evt.usage ?? evt.message?.usage;
  if (!usage || (usage.input === 0 && usage.output === 0)) return;

  // Debug log
  console.log("[usage-tracker] final chat event:", {
    runId: evt.runId,
    sessionKey: evt.sessionKey,
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  });

  // Only report/deduct if user is logged in (JWT available)
  if (!isAuthenticated()) {
    console.log("[usage-tracker] skipped: not authenticated");
    return;
  }

  // 1. Report analytics (existing)
  reportUsage({
    request_type: "gateway_chat",
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead,
    cache_write_tokens: usage.cacheWrite,
    metadata: {
      runId: evt.runId,
      sessionKey: evt.sessionKey,
      source: "websocket",
    },
  });

  // 2. Deduct tokens from balance
  deductUsage(usage);
}

/**
 * Report usage from SSE chat response (web UI direct chat).
 * Called from app.ts after sendChatMessage() returns with usage data.
 */
export function reportSSEUsage(usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number }) {
  if (!usage || (usage.input === 0 && usage.output === 0)) return;
  if (!isAuthenticated()) return;

  console.log("[usage-tracker] SSE chat usage:", usage);

  // 1. Report analytics
  reportUsage({
    request_type: "web_chat",
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead,
    cache_write_tokens: usage.cacheWrite,
    metadata: { source: "sse" },
  });

  // 2. Deduct tokens
  const prompt_tokens = usage.input + usage.cacheRead + usage.cacheWrite;
  const completion_tokens = usage.output;
  const total_tokens = prompt_tokens + completion_tokens;
  deductUsage({ ...usage, prompt_tokens, completion_tokens, total_tokens });
}

/** Start listening to gateway chat events and reporting usage. Call once at app init. */
export function startUsageTracker() {
  if (unsubscribe) return; // already started
  unsubscribe = subscribeToChatStream(handleChatEvent);
}

/** Stop the usage tracker (cleanup). */
export function stopUsageTracker() {
  unsubscribe?.();
  unsubscribe = null;
}
