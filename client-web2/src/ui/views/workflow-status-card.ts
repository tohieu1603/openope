import { html, nothing } from "lit";
import type { WorkflowProps } from "./workflow";
import { formatNextWake } from "./workflow-helpers";

export function renderStatusCard(props: WorkflowProps) {
  const { status, loading, error, onRefresh, workflows, showForm, onToggleForm } = props;
  const enabledCount = workflows.filter((w) => w.enabled).length;
  const totalCount = workflows.length;

  return html`
    <div class="wf-metrics-row">
      <div class="wf-metric-card">
        <span class="wf-metric-label">Trạng thái</span>
        <span class="wf-metric-value ${status?.enabled ? "wf-metric-ok" : ""}">
          ${status ? (status.enabled ? "Bật" : "Tắt") : "—"}
        </span>
      </div>
      <div class="wf-metric-card">
        <span class="wf-metric-label">Workflow</span>
        <span class="wf-metric-value">${totalCount}</span>
      </div>
      <div class="wf-metric-card">
        <span class="wf-metric-label">Đang bật</span>
        <span class="wf-metric-value">${enabledCount}</span>
      </div>
      <div class="wf-metric-card">
        <span class="wf-metric-label">Chạy tiếp</span>
        <span class="wf-metric-value">${formatNextWake(status?.nextWakeAtMs)}</span>
      </div>
    </div>

    <div class="wf-metrics-actions">
      ${error ? html`<span class="wf-muted">${error}</span>` : nothing}
      <button class="wf-btn" ?disabled=${loading} @click=${onRefresh}>
        ${loading ? "Đang tải…" : "Làm mới"}
      </button>
      <button class="wf-btn wf-btn-primary" @click=${onToggleForm}>
        ${showForm ? "Đóng" : "Tạo mới"}
      </button>
    </div>
  `;
}
