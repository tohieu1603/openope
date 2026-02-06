/**
 * Usage Tracker - Subscribe to gateway WS chat events and report token usage to Operis BE.
 * When a chat run finishes (state=final) with usage data, POST it to /analytics/usage with JWT auth.
 */
import { subscribeToChatStream, type ChatStreamEvent, type ChatTokenUsage } from "./gateway-client";
import { reportUsage } from "./analytics-api";
import { isAuthenticated } from "./api-client";

let unsubscribe: (() => void) | null = null;

function handleChatEvent(evt: ChatStreamEvent) {
  if (evt.state !== "final") return;

  // Usage can be at top-level or nested in message
  const usage: ChatTokenUsage | undefined = evt.usage ?? evt.message?.usage;
  if (!usage || (usage.input === 0 && usage.output === 0)) return;

  // Only report if user is logged in (JWT available)
  if (!isAuthenticated()) return;

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
