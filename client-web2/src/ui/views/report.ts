/**
 * Report View — customer bug reports & feedback
 */

import { html, nothing } from "lit";
import type { FeedbackReport, ReportType, ReportStatus } from "../report-api";
import { icons } from "../icons";

export interface ReportFormState {
  type: ReportType;
  subject: string;
  content: string;
}

export interface ReportProps {
  reports: FeedbackReport[];
  loading: boolean;
  error: string | null;
  form: ReportFormState;
  submitting: boolean;
  onFormChange: (patch: Partial<ReportFormState>) => void;
  onSubmit: () => void;
  onRefresh: () => void;
}

const TYPE_LABELS: Record<ReportType, string> = {
  bug: "Báo lỗi",
  feedback: "Góp ý",
  suggestion: "Ý tưởng",
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Mở",
  in_progress: "Đang xử lý",
  resolved: "Đã giải quyết",
  closed: "Đóng",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(status: ReportStatus): string {
  switch (status) {
    case "open":
      return "rp-tag-info";
    case "in_progress":
      return "rp-tag-warn";
    case "resolved":
      return "rp-tag-ok";
    case "closed":
      return "rp-tag-muted";
    default:
      return "";
  }
}

function typeClass(type: ReportType): string {
  switch (type) {
    case "bug":
      return "rp-tag-danger";
    case "feedback":
      return "rp-tag-info";
    case "suggestion":
      return "rp-tag-accent";
    default:
      return "";
  }
}

// ── Form Panel ──────────────────────────────────────────────────────────

function renderForm(props: ReportProps) {
  const { form, submitting, onFormChange, onSubmit } = props;

  return html`
    <div class="rp-panel">
      <div class="rp-panel-title">Đóng góp ý kiến</div>
      <div class="rp-panel-sub">Mỗi ý kiến của bạn đều giúp chúng mình phát triển sản phẩm tốt hơn.</div>
      <ul class="rp-hint-list">
        <li>Gặp lỗi? Mô tả để chúng mình sửa nhanh nhất.</li>
        <li>Có ý tưởng hay? Chia sẻ để cùng xây dựng.</li>
        <li>Muốn góp ý? Mọi phản hồi đều được lắng nghe.</li>
      </ul>

      <div class="rp-form-grid">
        <label class="rp-field">
          <span class="rp-field-label">Loại</span>
          <select
            class="rp-input"
            .value=${form.type}
            @change=${(e: Event) => onFormChange({ type: (e.target as HTMLSelectElement).value as ReportType })}
          >
            <option value="bug">Báo lỗi</option>
            <option value="feedback">Góp ý</option>
            <option value="suggestion">Ý tưởng mới</option>
          </select>
        </label>

        <label class="rp-field">
          <span class="rp-field-label">Tiêu đề</span>
          <input
            type="text"
            class="rp-input"
            placeholder="Tóm tắt ngắn gọn..."
            .value=${form.subject}
            @input=${(e: Event) => onFormChange({ subject: (e.target as HTMLInputElement).value })}
            ?disabled=${submitting}
          />
        </label>
      </div>

      <label class="rp-field" style="margin-top: 12px;">
        <span class="rp-field-label">Chi tiết</span>
        <textarea
          class="rp-input rp-textarea"
          rows="4"
          placeholder="Mô tả chi tiết hơn — các bước tái hiện lỗi, bối cảnh sử dụng, hoặc hình dung về tính năng mong muốn..."
          .value=${form.content}
          @input=${(e: Event) => onFormChange({ content: (e.target as HTMLTextAreaElement).value })}
          ?disabled=${submitting}
        ></textarea>
      </label>

      <div class="rp-row" style="margin-top: 16px;">
        <button
          class="rp-btn rp-btn-primary"
          @click=${onSubmit}
          ?disabled=${submitting || !form.subject.trim() || !form.content.trim()}
        >
          ${submitting ? "Đang gửi…" : "Gửi góp ý"}
        </button>
      </div>
    </div>
  `;
}

// ── Report Item ─────────────────────────────────────────────────────────

function renderReportItem(report: FeedbackReport) {
  return html`
    <div class="rp-card">
      <div class="rp-card-top">
        <div class="rp-card-title">${report.subject}</div>
        <span class="rp-card-date">${formatDate(report.created_at)}</span>
      </div>
      ${
        report.user_name || report.user_email
          ? html`<div class="rp-card-user">
            ${icons.user}
            <span>${report.user_name || report.user_email}</span>
          </div>`
          : nothing
      }
      <div class="rp-card-tags">
        <span class="rp-tag ${typeClass(report.type)}">
          ${TYPE_LABELS[report.type] || report.type}
        </span>
        <span class="rp-tag ${statusClass(report.status)}">
          ${STATUS_LABELS[report.status] || report.status}
        </span>
      </div>
      <div class="rp-card-desc">${report.content}</div>
      ${
        report.admin_notes
          ? html`<div class="rp-admin-note">
            <span class="rp-admin-note-label">Phản hồi admin</span>
            ${report.admin_notes}
          </div>`
          : nothing
      }
    </div>
  `;
}

// ── Empty State ─────────────────────────────────────────────────────────

function renderEmpty() {
  return html`
    <div class="rp-empty">
      <div class="rp-empty-icon">${icons.flag}</div>
      <div class="rp-empty-title">Chưa có ý kiến nào</div>
      <div class="rp-empty-sub">Bạn có thể là người đầu tiên đóng góp — mọi ý kiến đều có giá trị!</div>
    </div>
  `;
}

// ── Main View ───────────────────────────────────────────────────────────

export function renderReportView(props: ReportProps) {
  const { reports, loading, error, onRefresh } = props;

  return html`
    <div class="rp-layout">
      <div class="rp-sidebar">
        ${renderForm(props)}
      </div>

      <div class="rp-main">
        <div class="rp-panel">
          <div class="rp-panel-header">
            <div>
              <div class="rp-panel-title">Ý kiến đã gửi</div>
              <div class="rp-panel-sub">${reports.length} ý kiến</div>
            </div>
            <button class="rp-btn rp-btn-ghost" @click=${onRefresh} ?disabled=${loading}>
              <span class="rp-btn-icon">${icons.refresh}</span>
              ${loading ? "Đang tải…" : "Làm mới"}
            </button>
          </div>

          ${error ? html`<div class="rp-error">${error}</div>` : nothing}

          ${
            loading && reports.length === 0
              ? html`
                  <div class="rp-loading">Đang tải…</div>
                `
              : reports.length === 0
                ? renderEmpty()
                : html`<div class="rp-list">${reports.map(renderReportItem)}</div>`
          }
        </div>
      </div>
    </div>

    <style>
      /* Layout */
      .rp-hint-list {
        margin: 8px 0 16px;
        padding-left: 18px;
        font-size: 13px;
        color: var(--muted);
        line-height: 1.7;
        list-style: none;
      }
      .rp-hint-list li {
        position: relative;
        padding-left: 6px;
      }
      .rp-hint-list li::before {
        content: "→";
        position: absolute;
        left: -16px;
        color: var(--accent);
        font-weight: 500;
      }
      .rp-layout {
        display: grid;
        grid-template-columns: 420px 1fr;
        gap: 20px;
        padding: 0 4px;
        min-height: 0;
      }
      @media (max-width: 900px) {
        .rp-layout {
          grid-template-columns: 1fr;
        }
      }

      /* Panel */
      .rp-panel {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
      }
      .rp-panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .rp-panel-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-strong);
        margin-bottom: 2px;
      }
      .rp-panel-sub {
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 16px;
      }

      /* Form */
      .rp-form-grid {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 12px;
      }
      @media (max-width: 600px) {
        .rp-form-grid { grid-template-columns: 1fr; }
      }
      .rp-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .rp-field-label {
        font-size: 12px;
        font-weight: 500;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .rp-input {
        padding: 8px 12px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text);
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
        width: 100%;
        box-sizing: border-box;
      }
      .rp-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent-glow);
      }
      .rp-textarea {
        resize: vertical;
        min-height: 90px;
        line-height: 1.5;
      }

      /* Buttons */
      .rp-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .rp-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: background 0.15s, opacity 0.15s;
        border: none;
        white-space: nowrap;
      }
      .rp-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .rp-btn-primary {
        background: var(--accent);
        color: var(--accent-foreground);
      }
      .rp-btn-primary:hover:not(:disabled) {
        background: var(--accent-hover);
      }
      .rp-btn-ghost {
        background: transparent;
        color: var(--muted);
        border: 1px solid var(--border);
      }
      .rp-btn-ghost:hover:not(:disabled) {
        background: var(--bg-hover);
        color: var(--text);
      }
      .rp-btn-icon {
        display: flex;
        align-items: center;
      }
      .rp-btn-icon svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }

      /* List */
      .rp-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* Card (report item) */
      .rp-card {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        transition: border-color 0.15s;
      }
      .rp-card:hover {
        border-color: var(--border-strong);
      }
      .rp-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .rp-card-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text);
        line-height: 1.3;
      }
      .rp-card-date {
        font-size: 12px;
        color: var(--muted);
        white-space: nowrap;
        flex-shrink: 0;
      }
      .rp-card-user {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 8px;
      }
      .rp-card-user svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
        flex-shrink: 0;
      }
      .rp-card-tags {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
      }
      .rp-card-desc {
        font-size: 13px;
        color: var(--muted);
        line-height: 1.5;
        white-space: pre-wrap;
      }

      /* Tags */
      .rp-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        font-size: 11px;
        font-weight: 500;
        border-radius: var(--radius-full);
        letter-spacing: 0.02em;
      }
      .rp-tag-danger {
        background: var(--danger-subtle);
        color: var(--danger);
      }
      .rp-tag-info {
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
      }
      .rp-tag-warn {
        background: var(--warn-subtle);
        color: var(--warn);
      }
      .rp-tag-ok {
        background: var(--ok-subtle);
        color: var(--ok);
      }
      .rp-tag-muted {
        background: var(--bg-hover);
        color: var(--muted);
      }
      .rp-tag-accent {
        background: var(--accent-2-subtle);
        color: var(--accent-2);
      }

      /* Admin notes */
      .rp-admin-note {
        margin-top: 10px;
        padding: 10px 12px;
        background: var(--accent-2-subtle);
        border: 1px solid rgba(20, 184, 166, 0.2);
        border-radius: var(--radius-sm);
        font-size: 13px;
        color: var(--text);
        line-height: 1.5;
      }
      .rp-admin-note-label {
        display: block;
        font-size: 11px;
        font-weight: 600;
        color: var(--accent-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 4px;
      }

      /* Error */
      .rp-error {
        padding: 10px 14px;
        background: var(--danger-subtle);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius-md);
        color: var(--danger);
        font-size: 13px;
        margin-bottom: 12px;
      }

      /* Loading / Empty */
      .rp-loading {
        text-align: center;
        padding: 32px 16px;
        color: var(--muted);
        font-size: 13px;
      }
      .rp-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 24px;
        text-align: center;
      }
      .rp-empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--accent-subtle);
        border-radius: var(--radius-lg);
        color: var(--accent);
        margin-bottom: 12px;
      }
      .rp-empty-icon svg {
        width: 24px;
        height: 24px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .rp-empty-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text);
        margin-bottom: 4px;
      }
      .rp-empty-sub {
        font-size: 13px;
        color: var(--muted);
      }
    </style>
  `;
}
