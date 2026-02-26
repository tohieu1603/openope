import { t } from "../i18n";
import type { Workflow } from "../workflow-types";

// Format timestamp
export function formatMs(ts: number): string {
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return t("wfNever");
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return t("wfJustNow");
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${diffDays} ngày trước`;
}

export function formatRelativeTimeFromNow(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  const diffMs = timestamp - Date.now();
  if (diffMs < 0) return t("wfJustNow");
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "< 1 phút";
  if (diffMins < 60) return `${diffMins} phút`;
  if (diffHours < 24) return `${diffHours} giờ`;
  return `${diffDays} ngày`;
}

export function formatLastRun(workflow: Workflow): { time: string; status: string } {
  if (!workflow.lastRunAt) return { time: t("wfNever"), status: "never" };
  return {
    time: formatRelativeTime(workflow.lastRunAt),
    status: workflow.lastRunStatus ?? "never",
  };
}

// Format next wake time
export function formatNextWake(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = ms - Date.now();
  if (diff < 0) return "Ngay bây giờ";
  if (diff < 60000) return "< 1 phút";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;
  return `${Math.floor(diff / 86400000)} ngày`;
}

// Select options
export const SCHEDULE_OPTIONS = [
  { value: "every", label: "Định kỳ", description: "Lặp lại theo chu kỳ" },
  { value: "at", label: "Một lần", description: "Chạy vào thời điểm cụ thể" },
  { value: "cron", label: "Cron", description: "Biểu thức cron nâng cao" },
];
export const EVERY_UNIT_OPTIONS = [
  { value: "minutes", label: "Phút" },
  { value: "hours", label: "Giờ" },
  { value: "days", label: "Ngày" },
];
export const SESSION_OPTIONS = [
  { value: "isolated", label: "Riêng biệt", description: "Phiên tách biệt" },
  { value: "main", label: "Phiên chính", description: "Dùng phiên hiện tại" },
];
export const WAKE_MODE_OPTIONS = [
  { value: "now", label: "Ngay lập tức", description: "Đánh thức ngay" },
  {
    value: "next-heartbeat",
    label: "Heartbeat tiếp",
    description: "Chờ heartbeat",
  },
];
export const PAYLOAD_OPTIONS = [
  { value: "agentTurn", label: "Gửi tin nhắn", description: "Tin nhắn cho AI" },
  {
    value: "systemEvent",
    label: "Sự kiện hệ thống",
    description: "Event nội bộ",
  },
];
export const DELIVERY_MODE_OPTIONS = [
  {
    value: "announce",
    label: "Announce summary",
    description: "Gửi kết quả tóm tắt",
  },
  { value: "none", label: "None (internal)", description: "Không thông báo" },
];
export const CHANNEL_OPTIONS = [{ value: "last", label: "last", description: "Kênh cuối cùng tương tác" }];
