import type { AuthUser } from "./auth-api";
import type { ReportFormState } from "./views/report";
import {
  getDailyUsage,
  getRangeUsage,
  transformDailyUsage,
  transformTypeUsage,
  transformStats,
  type DailyUsage,
  type TypeUsage,
  type UsageStats,
} from "./analytics-api";
/**
 * Analytics / Sessions / Reports domain action functions.
 */
import { showConfirm } from "./components/operis-confirm";
import { showToast } from "./components/operis-toast";
import { waitForConnection } from "./gateway-client";
import { createReport, getMyReports, getAllReports, type FeedbackReport } from "./report-api";

export interface AnalyticsHost {
  // Analytics
  analyticsLoading: boolean;
  analyticsError: string | null;
  analyticsStats: UsageStats | null;
  analyticsDailyUsage: DailyUsage[];
  analyticsTypeUsage: TypeUsage[];
  analyticsPeriod: "1d" | "7d" | "30d" | "90d" | "custom";
  analyticsRangeStart: string;
  analyticsRangeEnd: string;

  // Sessions
  sessionsLoading: boolean;
  sessionsError: string | null;
  sessionsResult: {
    ts: number;
    path: string;
    count: number;
    defaults: { model: string | null; contextTokens: number | null };
    sessions: Array<{
      key: string;
      kind: "direct" | "group" | "global" | "unknown";
      label?: string;
      displayName?: string;
      updatedAt: number | null;
      thinkingLevel?: string;
      verboseLevel?: string;
      reasoningLevel?: string;
      modelProvider?: string;
      totalTokens?: number;
      contextTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
    }>;
  } | null;
  sessionsActiveMinutes: string;
  sessionsLimit: string;
  sessionsIncludeGlobal: boolean;
  sessionsIncludeUnknown: boolean;

  // Models (for chat)
  chatAvailableModels: Array<{ id: string; name: string; provider: string; reasoning?: boolean }>;
  chatModelsLoading: boolean;
  chatCurrentModel: string | null;
  chatThinkingLevel: string | null;
  chatConversationId: string | null;

  // Reports
  reports: FeedbackReport[];
  reportLoading: boolean;
  reportError: string | null;
  reportForm: ReportFormState;
  reportSubmitting: boolean;

  // Current user (needed for admin report check)
  currentUser: AuthUser | null;
}

export async function loadAnalytics(host: AnalyticsHost) {
  host.analyticsLoading = true;
  host.analyticsError = null;
  try {
    let result;
    if (host.analyticsPeriod === "custom") {
      if (!host.analyticsRangeStart || !host.analyticsRangeEnd) return;
      result = await getRangeUsage(host.analyticsRangeStart, host.analyticsRangeEnd);
    } else {
      const days =
        host.analyticsPeriod === "1d"
          ? 1
          : host.analyticsPeriod === "7d"
            ? 7
            : host.analyticsPeriod === "30d"
              ? 30
              : 90;
      result = await getDailyUsage(days);
    }

    host.analyticsStats = transformStats(result.stats);
    host.analyticsDailyUsage = transformDailyUsage(result.daily);
    host.analyticsTypeUsage = transformTypeUsage(result.byType);
  } catch (err) {
    host.analyticsError = err instanceof Error ? err.message : "Không thể tải dữ liệu analytics";
  } finally {
    host.analyticsLoading = false;
  }
}

export function handleAnalyticsPeriodChange(
  host: AnalyticsHost,
  period: "1d" | "7d" | "30d" | "90d" | "custom",
) {
  host.analyticsPeriod = period;
  if (period !== "custom") loadAnalytics(host);
}

export function handleAnalyticsRangeChange(host: AnalyticsHost, start: string, end: string) {
  host.analyticsRangeStart = start;
  host.analyticsRangeEnd = end;
  if (start && end) loadAnalytics(host);
}

export async function loadSessionsList(host: AnalyticsHost) {
  host.sessionsLoading = true;
  host.sessionsError = null;
  try {
    const gw = await waitForConnection(5000);
    const result = await gw.request<any>("sessions.list", {
      activeMinutes: host.sessionsActiveMinutes ? Number(host.sessionsActiveMinutes) : 525600,
      limit: Number(host.sessionsLimit) || 120,
      includeGlobal: host.sessionsIncludeGlobal,
      includeUnknown: host.sessionsIncludeUnknown,
    });
    host.sessionsResult = result;
  } catch (err) {
    host.sessionsError = err instanceof Error ? err.message : String(err);
  } finally {
    host.sessionsLoading = false;
  }
}

export async function handleSessionsPatch(
  host: AnalyticsHost,
  key: string,
  patch: {
    label?: string | null;
    thinkingLevel?: string | null;
    verboseLevel?: string | null;
    reasoningLevel?: string | null;
  },
) {
  try {
    const gw = await waitForConnection(5000);
    await gw.request("sessions.patch", { key, ...patch });
    loadSessionsList(host);
  } catch (err) {
    console.error("[sessions] patch failed:", err);
    showToast("Failed to patch session", "error");
  }
}

export async function loadAvailableModels(host: AnalyticsHost) {
  host.chatModelsLoading = true;
  try {
    const gw = await waitForConnection(5000);
    const res = await gw.request<{
      models?: Array<{ id: string; name: string; provider?: string; reasoning?: boolean }>;
    }>("models.list", {});
    host.chatAvailableModels = (res.models ?? []).map((m) => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider || m.id.split("/")[0] || "unknown",
      reasoning: m.reasoning,
    }));
  } catch {
    // Models not available — selector stays hidden
  } finally {
    host.chatModelsLoading = false;
  }
}

/** Normalize session key: "main" → "agent:main:main", passthrough if already full key */
function normalizeSessionKey(key: string): string {
  if (key.startsWith("agent:")) return key;
  return `agent:main:${key}`;
}

export async function handleThinkingChange(host: AnalyticsHost, level: string) {
  host.chatThinkingLevel = level;
  const key = normalizeSessionKey(host.chatConversationId || "main");
  await handleSessionsPatch(host, key, { thinkingLevel: level === "off" ? null : level });
}

export async function handleModelChange(host: AnalyticsHost, modelId: string) {
  host.chatCurrentModel = modelId;
  const key = normalizeSessionKey(host.chatConversationId || "main");
  try {
    const gw = await waitForConnection(5000);
    await gw.request("sessions.patch", { key, model: modelId });
  } catch {
    showToast("Không thể đổi model", "error");
  }
}

export async function handleSessionsDelete(host: AnalyticsHost, key: string) {
  const confirmed = await showConfirm({
    title: `Delete session "${key}"?`,
    message: "This action cannot be undone.",
    variant: "danger",
  });
  if (!confirmed) return;
  try {
    const gw = await waitForConnection(5000);
    await gw.request("sessions.delete", { key });
    loadSessionsList(host);
  } catch (err) {
    console.error("[sessions] delete failed:", err);
    showToast("Failed to delete session", "error");
  }
}

export async function loadReports(host: AnalyticsHost) {
  host.reportLoading = true;
  host.reportError = null;
  try {
    const isAdmin = host.currentUser?.role === "admin";
    const result = isAdmin ? await getAllReports() : await getMyReports();
    host.reports = result.reports;
  } catch (err) {
    host.reportError = err instanceof Error ? err.message : "Không thể tải góp ý";
  } finally {
    host.reportLoading = false;
  }
}

export async function handleReportSubmit(host: AnalyticsHost) {
  const { type, subject, content } = host.reportForm;
  if (!subject.trim() || !content.trim()) return;

  host.reportSubmitting = true;
  try {
    await createReport(type, subject, content);
    showToast("Cảm ơn bạn đã đóng góp ý kiến!", "success");
    host.reportForm = { type: "bug", subject: "", content: "" };
    await loadReports(host);
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Gửi góp ý thất bại", "error");
  } finally {
    host.reportSubmitting = false;
  }
}
