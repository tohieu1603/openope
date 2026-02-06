import { html, nothing } from "lit";
import { icons } from "../icons";
import { t } from "../i18n";

export interface LogEntry {
  id: string;
  date: string;
  type: "chat" | "workflow" | "token";
  preview: string;
  tokens?: number;
  messageCount?: number;
}

export interface LogsProps {
  logs: LogEntry[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onLoadMore: () => void;
  onItemClick: (log: LogEntry) => void;
  hasMore: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const time = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Check if same day
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return `Hôm nay ${time}`;

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isYesterday) return `Hôm qua ${time}`;

  // Same year
  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")} ${time}`;
  }

  // Different year
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()} ${time}`;
}

function getTypeIcon(type: string) {
  switch (type) {
    case "chat":
      return icons.messageSquare;
    case "workflow":
      return icons.workflow;
    case "token":
      return icons.coins;
    default:
      return icons.file;
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "chat":
      return "Chat";
    case "workflow":
      return "Workflow";
    case "token":
      return "Token";
    default:
      return type;
  }
}

export function renderLogs(props: LogsProps) {
  const {
    logs,
    loading,
    error,
    searchQuery,
    onSearchChange,
    onLoadMore,
    onItemClick,
    hasMore,
  } = props;

  const filteredLogs = searchQuery
    ? logs.filter((log) =>
        log.preview.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  return html`
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">${t("logsTitle") || "Lịch Sử Hoạt Động"}</div>
          <div class="card-description">${t("logsDescription") || "Xem các tương tác trước đó"}</div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <operis-input
            type="text"
            size="sm"
            placeholder="${t("logsSearch") || "Tìm kiếm..."}"
            has-icon
            style="width: 200px;"
            .value=${searchQuery}
            @input=${(e: InputEvent) => onSearchChange((e.target as HTMLInputElement).value)}
          >
            <span slot="icon">${icons.search}</span>
          </operis-input>
        </div>
      </div>

      ${error
        ? html`
            <div class="alert alert-error" style="margin-top: 16px;">
              ${icons.alertCircle}
              <span>${error}</span>
            </div>
          `
        : nothing}

      ${loading && logs.length === 0
        ? html`
            <div style="padding: 48px; text-align: center; color: var(--text-secondary);">
              <div class="spinner" style="margin: 0 auto 16px;"></div>
              <div>Đang tải...</div>
            </div>
          `
        : filteredLogs.length === 0
          ? html`
              <div style="padding: 48px; text-align: center; color: var(--text-secondary);">
                ${icons.inbox}
                <div style="margin-top: 8px;">${searchQuery ? "Không tìm thấy kết quả" : "Chưa có hoạt động nào"}</div>
              </div>
            `
          : html`
              <div class="list" style="margin-top: 8px;">
                ${filteredLogs.map(
                  (log) => html`
                    <div
                      class="list-item"
                      style="cursor: pointer;"
                      @click=${() => onItemClick(log)}
                    >
                      <div class="list-item-icon">${getTypeIcon(log.type)}</div>
                      <div class="list-item-content">
                        <div class="list-item-title">${log.preview || "(Không có nội dung)"}</div>
                        <div class="list-item-description">
                          ${formatDate(log.date)}
                          ${log.messageCount ? html` &middot; ${log.messageCount} tin nhắn` : nothing}
                          ${log.tokens ? html` &middot; ${log.tokens.toLocaleString()} tokens` : nothing}
                        </div>
                      </div>
                      <span class="pill ${log.type === "chat" ? "" : "accent"}">${getTypeLabel(log.type)}</span>
                    </div>
                  `
                )}
              </div>

              ${hasMore && !searchQuery
                ? html`
                    <div style="margin-top: 16px; text-align: center;">
                      <button
                        class="btn btn-ghost btn-sm"
                        ?disabled=${loading}
                        @click=${onLoadMore}
                      >
                        ${loading ? "Đang tải..." : "Tải thêm"}
                      </button>
                    </div>
                  `
                : nothing}
            `}
    </div>
  `;
}
