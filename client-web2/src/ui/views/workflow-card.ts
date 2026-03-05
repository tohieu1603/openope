import { html, nothing } from "lit";
import type { Workflow } from "../workflow-types";
import type { WorkflowProps } from "./workflow";
import { t } from "../i18n";
import { icons } from "../icons";
import { formatSchedule } from "../workflow-types";
import { formatLastRun, formatMs, formatRelativeTimeFromNow, renderMd } from "./workflow-helpers";

export function renderWorkflowCard(workflow: Workflow, props: WorkflowProps, isRunning: boolean) {
  const {
    onToggle,
    onRun,
    onCancel,
    onDelete,
    onLoadRuns,
    onOpenWorkflowDetail,
    onSelectWorkflow,
    selectedWorkflowId,
    saving,
  } = props;
  const lastRun = formatLastRun(workflow);
  const isSelected = selectedWorkflowId === workflow.id;
  const statusClass = lastRun.status === "ok" ? "success" : lastRun.status;

  return html`
    <div
      class="wf-card ${workflow.enabled ? "" : "wf-card-paused"} ${
        isRunning ? "wf-card-running" : ""
      } ${isSelected ? "wf-card-selected" : ""}"
    >
      <div class="wf-card-main" @click=${() => onSelectWorkflow?.(isSelected ? null : workflow.id)} style="cursor:pointer">
        <div
          class="wf-card-icon ${
            isRunning ? "wf-card-icon-running" : workflow.enabled ? "wf-card-icon-active" : ""
          }"
        >
          ${icons.workflow}
        </div>
        <div class="wf-card-content">
          <div class="wf-card-header">
            <h4 class="wf-card-title">${workflow.name}</h4>
            ${
              isRunning
                ? html`
                  <span class="wf-status wf-status-running">
                    <span class="wf-status-dot wf-status-dot-pulse"></span>
                    ${t("wfRunning")}
                  </span>
                `
                : html`
                  <span
                    class="wf-status ${workflow.enabled ? "wf-status-active" : "wf-status-paused"}"
                  >
                    <span class="wf-status-dot"></span>
                    ${workflow.enabled ? t("wfActive") : t("wfPaused")}
                  </span>
                `
            }
          </div>
          ${
            workflow.description
              ? html`<p class="wf-card-desc">${workflow.description}</p>`
              : nothing
          }
          <div class="wf-card-meta">
            <span class="wf-meta-item">
              <span class="wf-meta-icon">${icons.clock}</span>
              ${formatSchedule(workflow.schedule)}
            </span>
            <span class="wf-meta-item wf-meta-tag"
              >${workflow.sessionTarget === "main" ? "chính" : "riêng"}</span
            >
            <span class="wf-meta-item wf-meta-${statusClass}">
              <span class="wf-run-dot"></span>
              ${t("wfLast")}: ${lastRun.time}
            </span>
            ${
              workflow.nextRunAt
                ? html`
                  <span class="wf-meta-item wf-meta-next">
                    <span class="wf-meta-icon">${icons.arrowRight}</span>
                    ${t("wfNext")}:
                    ${formatRelativeTimeFromNow(workflow.nextRunAt)}
                  </span>
                `
                : nothing
            }
          </div>
          ${
            workflow.prompt
              ? html`<div class="wf-card-prompt wf-md">${renderMd(
                  workflow.prompt.length > 200
                    ? workflow.prompt.slice(0, 200) + "..."
                    : workflow.prompt,
                )}</div>`
              : nothing
          }
        </div>
      </div>
      <div class="wf-card-actions">
        <button
          class="wf-action"
          @click=${() => onOpenWorkflowDetail?.(workflow)}
          ?disabled=${isRunning}
        >
          ${icons.fileText}
          <span>Chi tiết</span>
        </button>
        <button
          class="wf-action"
          @click=${(e: Event) => {
            e.stopPropagation();
            props.onEdit?.(workflow);
          }}
          ?disabled=${saving || isRunning}
        >
          ${icons.pencil}
          <span>Sửa</span>
        </button>
        <button
          class="wf-action"
          @click=${() => onToggle(workflow)}
          ?disabled=${saving}
        >
          ${workflow.enabled ? icons.pause : icons.play}
          <span>${workflow.enabled ? t("wfPause") : t("wfStart")}</span>
        </button>
        ${
          isRunning
            ? html`<button
              class="wf-action wf-action-cancel"
              @click=${() => onCancel?.(workflow)}
            >
              ${icons.x}
              <span>Hủy</span>
            </button>`
            : html`<button
              class="wf-action wf-action-run"
              @click=${() => onRun(workflow)}
              ?disabled=${saving}
            >
              ${icons.zap}
              <span>${t("wfRun")}</span>
            </button>`
        }
        <button
          class="wf-action ${isSelected && !isRunning ? "wf-action-active" : ""}"
          @click=${() => {
            const sel = isSelected ? null : workflow.id;
            onSelectWorkflow?.(sel);
            onLoadRuns?.(sel);
          }}
          ?disabled=${saving}
        >
          ${icons.clock}
          <span>Lịch sử</span>
        </button>
        <button
          class="wf-action wf-action-delete"
          @click=${() => onDelete(workflow)}
          ?disabled=${saving}
        >
          ${icons.trash}
        </button>
      </div>
    </div>
  `;
}

/** Modal showing full workflow details */
export function renderWorkflowDetailModal(workflow: Workflow, onClose: () => void) {
  const statusLabel = workflow.enabled ? "Hoạt động" : "Tạm dừng";
  const statusClass = workflow.enabled ? "wf-modal-icon-ok" : "wf-modal-icon-cancel";
  return html`
    <div class="wf-modal-backdrop" @click=${onClose}>
      <div class="wf-modal wf-modal--detail" @click=${(e: Event) => e.stopPropagation()}>
        <div class="wf-modal-header">
          <div class="wf-modal-header-left">
            <div class="wf-modal-icon ${statusClass}">
              ${icons.workflow}
            </div>
            <div class="wf-modal-header-text">
              <h3 class="wf-modal-title">${workflow.name}</h3>
              ${workflow.description ? html`<div class="wf-modal-meta">${workflow.description}</div>` : nothing}
            </div>
          </div>
          <button class="wf-modal-close" @click=${onClose}>${icons.x}</button>
        </div>

        <div class="wf-modal-body">
          <div class="wf-details-grid">
            <div class="wf-detail-item">
              <span class="wf-detail-label">Trạng thái</span>
              <span class="wf-detail-value">${statusLabel}</span>
            </div>
            <div class="wf-detail-item">
              <span class="wf-detail-label">Lịch trình</span>
              <span class="wf-detail-value">${formatSchedule(workflow.schedule)}</span>
            </div>
            <div class="wf-detail-item">
              <span class="wf-detail-label">Phiên</span>
              <span class="wf-detail-value">${workflow.sessionTarget === "main" ? "Phiên chính" : "Riêng biệt"}</span>
            </div>
            <div class="wf-detail-item">
              <span class="wf-detail-label">Cách đánh thức</span>
              <span class="wf-detail-value">${workflow.wakeMode === "now" ? "Ngay lập tức" : "Heartbeat tiếp"}</span>
            </div>
            <div class="wf-detail-item">
              <span class="wf-detail-label">Loại payload</span>
              <span class="wf-detail-value">${workflow.payloadKind === "agentTurn" ? "Gửi tin nhắn" : "Sự kiện hệ thống"}</span>
            </div>
            ${
              workflow.agentId
                ? html`
              <div class="wf-detail-item">
                <span class="wf-detail-label">Nhân viên</span>
                <span class="wf-detail-value mono">${workflow.agentId}</span>
              </div>
            `
                : nothing
            }
            ${
              workflow.timeout
                ? html`
              <div class="wf-detail-item">
                <span class="wf-detail-label">Timeout</span>
                <span class="wf-detail-value">${Math.round(workflow.timeout / 1000)}s</span>
              </div>
            `
                : nothing
            }
            ${
              workflow.lastRunAt
                ? html`
              <div class="wf-detail-item">
                <span class="wf-detail-label">Chạy lần cuối</span>
                <span class="wf-detail-value">${formatMs(workflow.lastRunAt)}</span>
              </div>
            `
                : nothing
            }
            ${
              workflow.nextRunAt
                ? html`
              <div class="wf-detail-item">
                <span class="wf-detail-label">Chạy tiếp theo</span>
                <span class="wf-detail-value">${formatMs(workflow.nextRunAt)} (${formatRelativeTimeFromNow(workflow.nextRunAt)})</span>
              </div>
            `
                : nothing
            }
            ${
              workflow.createdAtMs
                ? html`
              <div class="wf-detail-item">
                <span class="wf-detail-label">Tạo lúc</span>
                <span class="wf-detail-value">${formatMs(workflow.createdAtMs)}</span>
              </div>
            `
                : nothing
            }
          </div>

          ${
            workflow.prompt
              ? html`
            <div class="wf-detail-prompt" style="margin-top: 16px;">
              <span class="wf-detail-label">Nội dung gửi cho AI</span>
              <div class="wf-detail-prompt-text wf-md">${renderMd(workflow.prompt)}</div>
            </div>
          `
              : nothing
          }
        </div>

        <div class="wf-modal-footer">
          <button class="wf-modal-close-btn" @click=${onClose}>Đóng</button>
        </div>
      </div>
    </div>
  `;
}
