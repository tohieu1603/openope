/**
 * Usage Tracker
 * Reports token usage to Operis BE with source distinction (chat vs cron).
 * Token deduction is handled server-side; this module records usage for analytics.
 */

import { reportUsage } from "./analytics-api";

/** Report chat SSE usage to Operis BE (request_type: "chat"). */
export function reportSSEUsage(usage: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}) {
  if (!usage.input && !usage.output) return;
  reportUsage({
    request_type: "chat",
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead,
    cache_write_tokens: usage.cacheWrite,
  });
}

/** Report cron job usage to Operis BE (request_type: "cron"). */
export function reportCronUsage(
  usage: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  },
  jobId?: string,
) {
  if (!usage.input && !usage.output) return;
  reportUsage({
    request_type: "cronjob",
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead,
    cache_write_tokens: usage.cacheWrite,
    metadata: jobId ? { jobId } : undefined,
  });
}

/** @deprecated No longer needed. */
export function startUsageTracker() {}

/** @deprecated No longer needed. */
export function stopUsageTracker() {}
