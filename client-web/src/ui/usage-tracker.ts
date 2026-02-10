/**
 * Usage Tracker - Stub module.
 * Token deduction is handled server-side during SSE chat processing.
 * POST /analytics/usage (404) and POST /tokens/usage (500) removed — both non-functional.
 */

/** No-op: usage is tracked server-side via SSE response (tokenBalance field). */
export function reportSSEUsage(_usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number }) {}

/** @deprecated No longer needed. */
export function startUsageTracker() {}

/** @deprecated No longer needed. */
export function stopUsageTracker() {}
