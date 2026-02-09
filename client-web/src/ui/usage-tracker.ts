/**
 * Usage Tracker - Report token usage from SSE web chat to Operis BE.
 * Only tracks user-initiated SSE chat (not gateway WS cron/agent runs).
 */
import { reportUsage } from "./analytics-api";
import apiClient, { isAuthenticated, getErrorMessage } from "./api-client";

/** Deduct tokens from user balance via POST /tokens/usage */
async function deductUsage(usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number; prompt_tokens: number; completion_tokens: number; total_tokens: number }): Promise<void> {
  try {
    await apiClient.post("/tokens/usage", {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      model: "claude-sonnet-4-5-20250929",
      request_type: "web_chat",
    });
  } catch (error) {
    console.warn("[usage-tracker] deduct failed:", getErrorMessage(error));
  }
}

/**
 * Report usage from SSE chat response (web UI direct chat).
 * Called from app.ts after sendChatMessage() returns with usage data.
 */
export function reportSSEUsage(usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number }) {
  if (!usage || (usage.input === 0 && usage.output === 0)) return;
  if (!isAuthenticated()) return;

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

/** @deprecated No longer needed - WS gateway tracking removed. Kept for API compat. */
export function startUsageTracker() {}

/** @deprecated No longer needed - WS gateway tracking removed. Kept for API compat. */
export function stopUsageTracker() {}
