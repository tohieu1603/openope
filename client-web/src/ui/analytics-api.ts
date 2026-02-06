/**
 * Analytics API Service
 * Handles usage analytics with Operis Backend API
 *
 * User Endpoints:
 * - GET /analytics/usage?period=today|week|month|year
 * - GET /analytics/usage/daily?days=7
 * - GET /analytics/usage/range?start=YYYY-MM-DD&end=YYYY-MM-DD
 * - GET /analytics/usage/history?limit=50&offset=0
 */

import apiClient, { getErrorMessage } from "./api-client";

// =============================================================================
// Backend Response Types (snake_case as returned by API)
// =============================================================================

export interface ApiStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_tokens: number;
}

export interface ApiByType {
  request_type: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_tokens: number;
}

export interface ApiDaily {
  date: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_tokens: number;
}

export interface DailyUsageResponse {
  period: string;
  stats: ApiStats;
  byType: ApiByType[];
  daily: ApiDaily[];
}

export interface UsageOverviewResponse {
  period: string;
  current: ApiStats;
  previous: ApiStats;
  byType: ApiByType[];
  daily: ApiDaily[];
}

export interface RangeUsageResponse {
  period: string;
  startDate: string;
  endDate: string;
  stats: ApiStats;
  byType: ApiByType[];
  daily: ApiDaily[];
}

export interface UsageRecord {
  id: string;
  request_type: string;
  request_id?: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_tokens: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface HistoryResponse {
  records: UsageRecord[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// UI-friendly Types (camelCase for frontend)
// =============================================================================

export interface DailyUsage {
  date: string;
  tokensUsed: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TypeUsage {
  type: string;
  tokensUsed: number;
  requests: number;
  percentage: number;
}

export interface UsageStats {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalRequests: number;
}

// Legacy exports for compatibility
export type TokenUsageStats = ApiStats;
export type TokenUsageByType = ApiByType;
export type TokenUsageByDate = ApiDaily;

// =============================================================================
// API Functions
// =============================================================================

/**
 * Get user's usage overview
 * @param period - today | week | month | year
 */
export async function getUsageOverview(
  period: "today" | "week" | "month" | "year" = "today",
): Promise<UsageOverviewResponse> {
  try {
    const response = await apiClient.get<UsageOverviewResponse>(`/analytics/usage?period=${period}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get user's daily usage stats
 * @param days - Number of days (1-90)
 */
export async function getDailyUsage(days = 7): Promise<DailyUsageResponse> {
  try {
    const response = await apiClient.get<DailyUsageResponse>(`/analytics/usage/daily?days=${days}`);
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get user's usage for a custom date range
 * @param start - Start date (YYYY-MM-DD)
 * @param end - End date (YYYY-MM-DD)
 */
export async function getRangeUsage(
  start: string,
  end: string,
): Promise<RangeUsageResponse> {
  try {
    const response = await apiClient.get<RangeUsageResponse>(
      `/analytics/usage/range?start=${start}&end=${end}`,
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get user's usage history (individual records)
 */
export async function getUsageHistory(
  limit = 50,
  offset = 0,
): Promise<HistoryResponse> {
  try {
    const response = await apiClient.get<HistoryResponse>(
      `/analytics/usage/history?limit=${limit}&offset=${offset}`,
    );
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// =============================================================================
// Report Usage - POST token usage from gateway WS events to Operis BE
// =============================================================================

export interface ReportUsagePayload {
  request_type: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Report token usage to Operis BE (called when gateway WS chat event has state=final with usage)
 */
export async function reportUsage(payload: ReportUsagePayload): Promise<void> {
  try {
    await apiClient.post("/analytics/usage", payload);
  } catch (error) {
    // Best-effort: log but don't throw to avoid disrupting chat flow
    console.warn("[analytics] failed to report usage:", getErrorMessage(error));
  }
}

// =============================================================================
// Transform Functions - Convert API response to UI-friendly format
// =============================================================================

export function transformDailyUsage(daily: ApiDaily[]): DailyUsage[] {
  return daily.map((d) => ({
    date: d.date,
    tokensUsed: d.total_tokens,
    requests: d.total_requests,
    inputTokens: d.total_input_tokens,
    outputTokens: d.total_output_tokens,
  }));
}

export function transformTypeUsage(byType: ApiByType[]): TypeUsage[] {
  // Calculate total for percentage
  const totalTokens = byType.reduce((sum, t) => sum + t.total_tokens, 0);

  return byType.map((t) => ({
    type: t.request_type,
    tokensUsed: t.total_tokens,
    requests: t.total_requests,
    percentage: totalTokens > 0 ? (t.total_tokens / totalTokens) * 100 : 0,
  }));
}

export function transformStats(stats: ApiStats): UsageStats {
  return {
    totalTokens: stats.total_tokens,
    inputTokens: stats.total_input_tokens,
    outputTokens: stats.total_output_tokens,
    totalRequests: stats.total_requests,
  };
}
