import { html, nothing } from "lit";
import type { WorkflowRun } from "../workflow-api";
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

export function renderRunItem(entry: WorkflowRun, onOpenDetail?: (run: WorkflowRun) => void) {
  const isOk = entry.status === "ok" || entry.status === "success";
  return html`
    <div class="wf-run-item" @click=${() => onOpenDetail?.(entry)} style="cursor:pointer">
      <div class="wf-run-indicator ${isOk ? "wf-run-indicator-ok" : "wf-run-indicator-err"}">
        ${isOk ? "✓" : "✗"}
      </div>
      <div class="wf-run-body">
        <div class="wf-run-top">
          <span class="wf-run-status ${isOk ? "wf-run-status-ok" : "wf-run-status-error"}">
            ${isOk ? "Thành công" : "Lỗi"}
          </span>
          <span class="wf-run-time">${formatMs(entry.ts)}</span>
        </div>
        ${entry.summary ? html`<div class="wf-run-summary wf-md">${renderMd(entry.summary)}</div>` : nothing}
        ${entry.error ? html`<div class="wf-run-error wf-md">${renderMd(entry.error)}</div>` : nothing}
      </div>
      <div class="wf-run-duration">${formatDuration(entry.durationMs)}</div>
    </div>
  `;
}

export function renderRunDetailModal(run: WorkflowRun, onClose: () => void) {
  const isOk = run.status === "ok" || run.status === "success";
  return html`
    <div class="wf-modal-backdrop" @click=${onClose}>
      <div class="wf-modal" @click=${(e: Event) => e.stopPropagation()}>
        <!-- Header -->
        <div class="wf-modal-header">
          <div class="wf-modal-header-left">
            <div class="wf-modal-icon ${isOk ? "wf-modal-icon-ok" : "wf-modal-icon-err"}">
              ${isOk ? "✓" : "✗"}
            </div>
            <div class="wf-modal-header-text">
              <h3 class="wf-modal-title">${isOk ? "Thành công" : "Thất bại"}</h3>
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
          ${run.error ? html`<div class="wf-modal-error wf-md">${renderMd(run.error)}</div>` : nothing}
          ${!run.summary && !run.error ? html`<p style="opacity:.5">Không có nội dung chi tiết.</p>` : nothing}
        </div>

        <!-- Footer -->
        <div class="wf-modal-footer">
          <button class="wf-modal-close-btn" @click=${onClose}>Đóng</button>
        </div>
      </div>
    </div>
  `;
}
