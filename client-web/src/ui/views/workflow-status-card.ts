import { html, nothing } from "lit";
import type { WorkflowProps } from "./workflow";
import { formatNextWake } from "./workflow-helpers";

export function renderStatusCard(props: WorkflowProps) {
  const { status, loading, error, onRefresh, workflows } = props;
  const enabledCount = workflows.filter((w) => w.enabled).length;
  const totalCount = workflows.length;

  return html`
    <div class="wf-card-panel">
      <div class="wf-card-title">Scheduler</div>
      <div class="wf-card-sub">Bộ lập lịch tự động của gateway.</div>
      <div class="wf-stat-grid">
        <div class="wf-stat">
          <div class="wf-stat-label">Trạng thái</div>
          <div class="wf-stat-value ${status?.enabled ? "wf-stat-ok" : ""}">
            ${status ? (status.enabled ? "Bật" : "Tắt") : "n/a"}
          </div>
        </div>
        <div class="wf-stat">
          <div class="wf-stat-label">Workflow</div>
          <div class="wf-stat-value">${totalCount}</div>
        </div>
        <div class="wf-stat">
          <div class="wf-stat-label">Đang bật</div>
          <div class="wf-stat-value">${enabledCount}</div>
        </div>
        <div class="wf-stat">
          <div class="wf-stat-label">Chạy tiếp</div>
          <div class="wf-stat-value">
            ${formatNextWake(status?.nextWakeAtMs)}
          </div>
        </div>
      </div>
      <div class="wf-row">
        <button class="wf-btn" ?disabled=${loading} @click=${onRefresh}>
          ${loading ? "Đang tải…" : "Làm mới"}
        </button>
        ${error ? html`<span class="wf-muted">${error}</span>` : nothing}
      </div>
    </div>
  `;
}
