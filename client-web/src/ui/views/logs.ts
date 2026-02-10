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

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: keyof typeof icons }> = {
  chat: { label: "Chat", color: "#3b82f6", bg: "rgba(59,130,246,0.1)", icon: "messageSquare" },
  workflow: { label: "Workflow", color: "#10b981", bg: "rgba(16,185,129,0.1)", icon: "workflow" },
  token: { label: "Token", color: "#f59e0b", bg: "rgba(245,158,11,0.1)", icon: "coins" },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  if (date.toDateString() === now.toDateString()) return `Hôm nay ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Hôm qua ${time}`;

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")} ${time}`;
  }

  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()} ${time}`;
}

export function renderLogs(props: LogsProps) {
  const { logs, loading, error, searchQuery, onSearchChange, onLoadMore, onItemClick, hasMore } = props;

  const filteredLogs = searchQuery
    ? logs.filter((log) => log.preview.toLowerCase().includes(searchQuery.toLowerCase()))
    : logs;

  return html`
    <style>
      .logs-layout {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      /* Header Card */
      .logs-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl, 16px);
        overflow: hidden;
      }
      .logs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 20px 24px;
        border-bottom: 1px solid var(--border);
      }
      @media (max-width: 600px) {
        .logs-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }
      }
      .logs-header-info {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .logs-header-icon {
        width: 42px;
        height: 42px;
        border-radius: var(--radius-lg, 12px);
        background: var(--secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .logs-header-icon svg {
        width: 20px;
        height: 20px;
        stroke: var(--accent);
        fill: none;
        stroke-width: 2;
      }
      .logs-header-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong);
      }
      .logs-header-desc {
        font-size: 13px;
        color: var(--muted);
        margin-top: 2px;
      }

      /* Search */
      .logs-search {
        position: relative;
        width: 240px;
        flex-shrink: 0;
      }
      @media (max-width: 600px) {
        .logs-search {
          width: 100%;
        }
      }
      .logs-search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        pointer-events: none;
      }
      .logs-search-icon svg {
        width: 16px;
        height: 16px;
        stroke: var(--muted);
        fill: none;
        stroke-width: 2;
      }
      .logs-search input {
        width: 100%;
        padding: 9px 12px 9px 36px;
        font-size: 13px;
        background: var(--secondary, var(--bg));
        border: 1px solid var(--border);
        border-radius: var(--radius-md, 8px);
        color: var(--text);
        outline: none;
        transition: all 0.15s ease;
        font-family: inherit;
        box-sizing: border-box;
      }
      .logs-search input::placeholder {
        color: var(--muted);
      }
      .logs-search input:focus {
        border-color: var(--accent);
        background: var(--card);
      }

      /* Log List */
      .logs-list {
        display: flex;
        flex-direction: column;
      }
      .logs-item {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 24px;
        cursor: pointer;
        transition: all 0.12s ease;
        border-bottom: 1px solid var(--border);
      }
      .logs-item:last-child {
        border-bottom: none;
      }
      .logs-item:hover {
        background: var(--secondary, var(--bg-hover));
      }

      .logs-item-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-lg, 12px);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .logs-item-icon svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      .logs-item-content {
        flex: 1;
        min-width: 0;
      }
      .logs-item-preview {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-strong);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 4px;
      }
      .logs-item-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--muted);
      }
      .logs-item-meta-sep {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: var(--muted);
        opacity: 0.5;
        flex-shrink: 0;
      }

      .logs-item-badge {
        padding: 4px 10px;
        border-radius: var(--radius-sm, 6px);
        font-size: 12px;
        font-weight: 600;
        flex-shrink: 0;
        letter-spacing: 0.01em;
      }

      .logs-item-arrow {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        opacity: 0;
        transform: translateX(-4px);
        transition: all 0.15s ease;
      }
      .logs-item-arrow svg {
        width: 16px;
        height: 16px;
        stroke: var(--muted);
        fill: none;
        stroke-width: 2;
      }
      .logs-item:hover .logs-item-arrow {
        opacity: 1;
        transform: translateX(0);
      }

      /* Empty & Loading States */
      .logs-empty {
        padding: 64px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }
      .logs-empty-icon {
        width: 56px;
        height: 56px;
        border-radius: var(--radius-xl, 16px);
        background: var(--secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
      }
      .logs-empty-icon svg {
        width: 28px;
        height: 28px;
        stroke: var(--muted);
        fill: none;
        stroke-width: 1.5;
      }
      .logs-empty-title {
        font-size: 15px;
        font-weight: 500;
        color: var(--text-strong);
      }
      .logs-empty-desc {
        font-size: 13px;
        color: var(--muted);
      }

      .logs-loading {
        padding: 48px 24px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
      }
      .logs-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: logs-spin 0.8s linear infinite;
      }
      @keyframes logs-spin {
        to { transform: rotate(360deg); }
      }
      .logs-loading-text {
        font-size: 14px;
        color: var(--muted);
      }

      /* Load More */
      .logs-load-more {
        padding: 16px 24px;
        text-align: center;
        border-top: 1px solid var(--border);
      }
      .logs-load-more-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 20px;
        border-radius: var(--radius-md, 8px);
        font-size: 13px;
        font-weight: 500;
        background: var(--secondary);
        border: 1px solid var(--border);
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s ease;
        font-family: inherit;
      }
      .logs-load-more-btn:hover:not(:disabled) {
        background: var(--bg-hover, var(--secondary));
        border-color: var(--border-strong, var(--border));
      }
      .logs-load-more-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Error */
      .logs-error {
        margin: 16px 24px;
        padding: 14px 18px;
        background: var(--danger-subtle, #fee2e2);
        color: var(--danger, #dc2626);
        border-radius: var(--radius-lg, 12px);
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .logs-error svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        flex-shrink: 0;
      }
    </style>

    <div class="logs-layout">
      <div class="logs-card">
        <div class="logs-header">
          <div class="logs-header-info">
            <div class="logs-header-icon">${icons.clock}</div>
            <div>
              <div class="logs-header-title">${t("logsTitle") || "Lịch Sử Hoạt Động"}</div>
              <div class="logs-header-desc">${t("logsDescription") || "Xem các tương tác trước đó"}</div>
            </div>
          </div>
          <div class="logs-search">
            <div class="logs-search-icon">${icons.search}</div>
            <input
              type="text"
              placeholder="${t("logsSearch") || "Tìm kiếm..."}"
              .value=${searchQuery}
              @input=${(e: InputEvent) => onSearchChange((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        ${error
          ? html`<div class="logs-error">${icons.alertCircle} <span>${error}</span></div>`
          : nothing}

        ${loading && logs.length === 0
          ? html`
              <div class="logs-loading">
                <div class="logs-spinner"></div>
                <div class="logs-loading-text">Đang tải...</div>
              </div>
            `
          : filteredLogs.length === 0
            ? html`
                <div class="logs-empty">
                  <div class="logs-empty-icon">${searchQuery ? icons.search : icons.inbox}</div>
                  <div class="logs-empty-title">
                    ${searchQuery ? "Không tìm thấy kết quả" : "Chưa có hoạt động nào"}
                  </div>
                  <div class="logs-empty-desc">
                    ${searchQuery ? "Thử tìm kiếm với từ khóa khác" : "Các hoạt động sẽ hiển thị tại đây"}
                  </div>
                </div>
              `
            : html`
                <div class="logs-list">
                  ${filteredLogs.map((log) => {
                    const config = TYPE_CONFIG[log.type] || TYPE_CONFIG.chat;
                    return html`
                      <div class="logs-item" @click=${() => onItemClick(log)}>
                        <div class="logs-item-icon" style="background: ${config.bg}; color: ${config.color}">
                          ${icons[config.icon]}
                        </div>
                        <div class="logs-item-content">
                          <div class="logs-item-preview">${log.preview || "(Không có nội dung)"}</div>
                          <div class="logs-item-meta">
                            <span>${formatDate(log.date)}</span>
                            ${log.messageCount
                              ? html`<span class="logs-item-meta-sep"></span><span>${log.messageCount} tin nhắn</span>`
                              : nothing}
                            ${log.tokens
                              ? html`<span class="logs-item-meta-sep"></span><span>${log.tokens.toLocaleString()} tokens</span>`
                              : nothing}
                          </div>
                        </div>
                        <div class="logs-item-badge" style="background: ${config.bg}; color: ${config.color}">
                          ${config.label}
                        </div>
                        <div class="logs-item-arrow">${icons.chevronRight}</div>
                      </div>
                    `;
                  })}
                </div>

                ${hasMore && !searchQuery
                  ? html`
                      <div class="logs-load-more">
                        <button
                          class="logs-load-more-btn"
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
    </div>
  `;
}
