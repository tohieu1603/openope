import { html, nothing } from "lit";
import type { Workflow } from "../workflow-types";
import { formatSchedule } from "../workflow-types";
import type { WorkflowProps } from "./workflow";
import { formatLastRun, formatMs, formatRelativeTimeFromNow, renderMd } from "./workflow-helpers";
import { t } from "../i18n";
import { icons } from "../icons";

export function renderWorkflowCard(workflow: Workflow, props: WorkflowProps, isRunning: boolean) {
  const {
    onToggle,
    onRun,
    onDelete,
    onLoadRuns,
    onToggleDetails,
    onSelectWorkflow,
    expandedWorkflowId,
    selectedWorkflowId,
    saving,
  } = props;
  const lastRun = formatLastRun(workflow);
  const isSelected = selectedWorkflowId === workflow.id;
  const isExpanded = expandedWorkflowId === workflow.id;
  const statusClass = lastRun.status === "ok" ? "success" : lastRun.status;

  return html`
    <div
      class="wf-card ${workflow.enabled ? "" : "wf-card-paused"} ${
        isRunning ? "wf-card-running" : ""
      } ${isSelected ? "wf-card-selected" : ""} ${isExpanded ? "wf-card-expanded" : ""}"
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
            !isExpanded && workflow.prompt
              ? html`<div class="wf-card-prompt wf-md">${renderMd(
                  workflow.prompt.length > 200
                    ? workflow.prompt.slice(0, 200) + "..."
                    : workflow.prompt
                )}</div>`
              : nothing
          }
        </div>
      </div>
      ${
        isExpanded
          ? html`
            <div class="wf-card-details">
              <div class="wf-details-grid">
                <div class="wf-detail-item">
                  <span class="wf-detail-label">Phiên</span>
                  <span class="wf-detail-value"
                    >${workflow.sessionTarget === "main" ? "Phiên chính" : "Riêng biệt"}</span
                  >
                </div>
                <div class="wf-detail-item">
                  <span class="wf-detail-label">Cách đánh thức</span>
                  <span class="wf-detail-value"
                    >${workflow.wakeMode === "now" ? "Ngay lập tức" : "Heartbeat tiếp"}</span
                  >
                </div>
                <div class="wf-detail-item">
                  <span class="wf-detail-label">Loại payload</span>
                  <span class="wf-detail-value"
                    >${
                      workflow.payloadKind === "agentTurn" ? "Gửi tin nhắn" : "Sự kiện hệ thống"
                    }</span
                  >
                </div>
                ${
                  workflow.lastRunAt
                    ? html`
                      <div class="wf-detail-item">
                        <span class="wf-detail-label">Chạy lần cuối</span>
                        <span class="wf-detail-value"
                          >${formatMs(workflow.lastRunAt)}</span
                        >
                      </div>
                    `
                    : nothing
                }
                ${
                  workflow.nextRunAt
                    ? html`
                      <div class="wf-detail-item">
                        <span class="wf-detail-label">Chạy tiếp theo</span>
                        <span class="wf-detail-value"
                          >${formatMs(workflow.nextRunAt)}</span
                        >
                      </div>
                    `
                    : nothing
                }
              </div>
              ${
                workflow.prompt
                  ? html`
                    <div class="wf-detail-prompt">
                      <span class="wf-detail-label">Nội dung</span>
                      <div class="wf-detail-prompt-text wf-md">
                        ${renderMd(workflow.prompt)}
                      </div>
                    </div>
                  `
                  : nothing
              }
            </div>
          `
          : nothing
      }
      <div class="wf-card-actions">
        <button
          class="wf-action ${isExpanded ? "wf-action-active" : ""}"
          @click=${() => onToggleDetails?.(workflow.id)}
          ?disabled=${isRunning}
        >
          ${icons.chevronDown}
          <span>${isExpanded ? "Thu gọn" : "Chi tiết"}</span>
        </button>
        <button
          class="wf-action"
          @click=${() => onToggle(workflow)}
          ?disabled=${saving || isRunning}
        >
          ${workflow.enabled ? icons.pause : icons.play}
          <span>${workflow.enabled ? t("wfPause") : t("wfStart")}</span>
        </button>
        <button
          class="wf-action wf-action-run"
          @click=${() => onRun(workflow)}
          ?disabled=${saving || isRunning}
        >
          ${icons.zap}
          <span>${isRunning ? "Đang chạy..." : t("wfRun")}</span>
        </button>
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
          ?disabled=${saving || isRunning}
        >
          ${icons.trash}
        </button>
      </div>
    </div>
  `;
}
