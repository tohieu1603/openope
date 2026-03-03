import { html, nothing } from "lit";
import type { WorkflowRun, WorkflowRunActivity } from "../workflow-api";
import { icons } from "../icons";
import { formatMs, renderMd } from "./workflow-helpers";

function formatDuration(ms: number | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}

/** Map tool name to a short Vietnamese label. */
function toolLabel(name: string): string {
  const map: Record<string, string> = {
    read: "Đọc file",
    write: "Ghi file",
    edit: "Chỉnh sửa",
    shell: "Chạy lệnh",
    exec: "Thực thi",
    browser: "Duyệt web",
    search: "Tìm kiếm",
    fetch: "Tải dữ liệu",
    message: "Gửi tin nhắn",
    weather: "Thời tiết",
  };
  return map[name] ?? name;
}

function renderActivityItem(a: WorkflowRunActivity) {
  const stateClass = a.isError ? "wf-act-error" : "wf-act-done";
  return html`
    <div class="wf-act-item ${stateClass}">
      <div class="wf-act-dot">${a.isError ? "✗" : "✓"}</div>
      <div class="wf-act-body">
        <span class="wf-act-name">${toolLabel(a.name)}</span>
        ${a.detail ? html`<span class="wf-act-detail">${a.detail}</span>` : nothing}
      </div>
      <span class="wf-act-time">${(a.durationMs / 1000).toFixed(1)}s</span>
    </div>
  `;
}

function renderActivities(activities: WorkflowRunActivity[] | undefined, error?: string) {
  if (!activities || activities.length === 0) return nothing;
  const isCancelled = error === "Job cancelled";
  return html`
    <div class="wf-act-list" style="margin-top:8px">
      ${activities.map(renderActivityItem)}
      ${
        isCancelled
          ? html`
              <div class="wf-act-item wf-act-cancelled">
                <div class="wf-act-dot" style="color: var(--warning, #f59e0b)">⊘</div>
                <div class="wf-act-body">
                  <span class="wf-act-name" style="color: var(--warning, #f59e0b)">Đã huỷ tại đây</span>
                </div>
              </div>
            `
          : nothing
      }
    </div>
  `;
}

export function renderRunItem(entry: WorkflowRun, onOpenDetail?: (run: WorkflowRun) => void) {
  const isOk = entry.status === "ok" || entry.status === "success";
  const isCancelled = entry.error === "Job cancelled";
  const statusLabel = isCancelled ? "Đã huỷ" : isOk ? "Thành công" : "Lỗi";
  const statusClass = isCancelled
    ? "wf-run-status-cancel"
    : isOk
      ? "wf-run-status-ok"
      : "wf-run-status-error";
  const indicatorClass = isCancelled
    ? "wf-run-indicator-cancel"
    : isOk
      ? "wf-run-indicator-ok"
      : "wf-run-indicator-err";
  return html`
    <div class="wf-run-item" @click=${() => onOpenDetail?.(entry)} style="cursor:pointer">
      <div class="wf-run-indicator ${indicatorClass}">
        ${isCancelled ? "⊘" : isOk ? "✓" : "✗"}
      </div>
      <div class="wf-run-body">
        <div class="wf-run-top">
          <span class="wf-run-status ${statusClass}">
            ${statusLabel}
          </span>
          <span class="wf-run-time">${formatMs(entry.ts)}</span>
        </div>
        ${entry.summary ? html`<div class="wf-run-summary wf-md">${renderMd(entry.summary)}</div>` : nothing}
        ${entry.error && !isCancelled ? html`<div class="wf-run-error wf-md">${renderMd(entry.error)}</div>` : nothing}
        ${renderActivities(entry.activities, entry.error)}
      </div>
      <div class="wf-run-duration">${formatDuration(entry.durationMs)}</div>
    </div>
  `;
}

export function renderRunDetailModal(run: WorkflowRun, onClose: () => void) {
  const isOk = run.status === "ok" || run.status === "success";
  const isCancelled = run.error === "Job cancelled";
  const title = isCancelled ? "Đã huỷ" : isOk ? "Thành công" : "Thất bại";
  const iconClass = isCancelled
    ? "wf-modal-icon-cancel"
    : isOk
      ? "wf-modal-icon-ok"
      : "wf-modal-icon-err";
  return html`
    <div class="wf-modal-backdrop" @click=${onClose}>
      <div class="wf-modal" @click=${(e: Event) => e.stopPropagation()}>
        <!-- Header -->
        <div class="wf-modal-header">
          <div class="wf-modal-header-left">
            <div class="wf-modal-icon ${iconClass}">
              ${isCancelled ? "⊘" : isOk ? "✓" : "✗"}
            </div>
            <div class="wf-modal-header-text">
              <h3 class="wf-modal-title">${title}</h3>
              <div class="wf-modal-meta">
                <span>${formatMs(run.ts)}</span>
                <span class="wf-modal-meta-sep">·</span>
                <span>${formatDuration(run.durationMs)}</span>
              </div>
            </div>
          </div>
          <button class="wf-modal-close" @click=${onClose}>${icons.x}</button>
        </div>

        <!-- Content -->
        <div class="wf-modal-body wf-md">
          ${run.summary ? renderMd(run.summary) : nothing}
          ${run.error && !isCancelled ? html`<div class="wf-modal-error wf-md">${renderMd(run.error)}</div>` : nothing}
          ${renderActivities(run.activities, run.error)}
          ${
            !run.summary && !run.error && (!run.activities || run.activities.length === 0)
              ? html`
                  <p style="opacity: 0.5">Không có nội dung chi tiết.</p>
                `
              : nothing
          }
        </div>

        <!-- Footer -->
        <div class="wf-modal-footer">
          <button class="wf-modal-close-btn" @click=${onClose}>Đóng</button>
        </div>
      </div>
    </div>
  `;
}
