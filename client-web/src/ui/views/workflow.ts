import { html, nothing } from "lit";
import type { WorkflowRun, WorkflowStatus } from "../workflow-api";
import type { Workflow, WorkflowFormState, CronProgressState } from "../workflow-types";
import { workflowStyles } from "./workflow-styles";
import { renderStatusCard } from "./workflow-status-card";
import { renderFormCard } from "./workflow-form-card";
import { renderWorkflowCard } from "./workflow-card";
import { renderRunItem, renderRunDetailModal } from "./workflow-run-history";
import { renderProgressTimeline } from "./workflow-progress-timeline";
import { t } from "../i18n";
import { icons } from "../icons";

export interface WorkflowProps {
  workflows: Workflow[];
  loading: boolean;
  error: string | null;
  form: WorkflowFormState;
  saving: boolean;
  expandedWorkflowId?: string | null;
  runningWorkflowIds?: Set<string>;
  // Scheduler status
  status?: WorkflowStatus | null;
  // Split panel: selected workflow
  selectedWorkflowId?: string | null;
  progressMap?: Map<string, CronProgressState>;
  // Run history
  runsWorkflowId?: string | null;
  runs?: WorkflowRun[];
  runsLoading?: boolean;
  // Run detail modal
  modalRun?: WorkflowRun | null;
  onOpenRunDetail?: (run: WorkflowRun) => void;
  onCloseRunDetail?: () => void;
  // Handlers
  onRefresh: () => void;
  onFormChange: (patch: Partial<WorkflowFormState>) => void;
  onSubmit: () => void;
  onToggle: (workflow: Workflow) => void;
  onRun: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onToggleDetails?: (workflowId: string) => void;
  onLoadRuns?: (workflowId: string | null) => void;
  onSelectWorkflow?: (workflowId: string | null) => void;
  showForm?: boolean;
  onToggleForm?: () => void;
}

export function renderWorkflow(props: WorkflowProps) {
  const {
    workflows,
    loading,
    runningWorkflowIds = new Set(),
    selectedWorkflowId,
    progressMap = new Map(),
    runsWorkflowId,
    runs = [],
    runsLoading = false,
  } = props;

  const sortedWorkflows = [...workflows].sort((a, b) => {
    const aRunning = runningWorkflowIds.has(a.id) ? 1 : 0;
    const bRunning = runningWorkflowIds.has(b.id) ? 1 : 0;
    if (aRunning !== bRunning) return bRunning - aRunning;
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const runningCount = runningWorkflowIds.size;
  const selWf = selectedWorkflowId ? workflows.find((w) => w.id === selectedWorkflowId) : null;
  const selProgress = selectedWorkflowId ? progressMap.get(selectedWorkflowId) : undefined;
  const showProgress = !!selProgress;
  const showRuns = !showProgress && runsWorkflowId === selectedWorkflowId && !!selectedWorkflowId;

  return html`
    ${workflowStyles}

    <!-- Metrics bar -->
    ${renderStatusCard(props)}

    <!-- Collapsible form -->
    ${props.showForm ? html`<div class="wf-form-collapse">${renderFormCard(props)}</div>` : nothing}

    <!-- Workflow list section header -->
    <div class="wf-section-header">
      <h3 class="wf-section-title">Workflows</h3>
      ${
        runningCount > 0
          ? html`
            <span class="wf-running-badge">
              <span class="wf-running-badge-dot"></span>
              ${runningCount} ${t("wfRunning")}
            </span>
          `
          : nothing
      }
    </div>

    ${
      loading
        ? html`
          <div class="wf-loading">
            <div class="wf-loading-spinner"></div>
            <span class="wf-loading-text">${t("workflowLoading")}</span>
          </div>
        `
        : workflows.length === 0
          ? html`
            <div class="wf-empty">
              <div class="wf-empty-icon">${icons.workflow}</div>
              <h3 class="wf-empty-title">${t("workflowEmpty")}</h3>
              <p class="wf-empty-desc">${t("workflowEmptyDesc")}</p>
            </div>
          `
          : html`
            <!-- Split panel: left=cards, right=details -->
            <div class="wf-split-panel">
              <div class="wf-split-left">
                <div class="wf-list">
                  ${sortedWorkflows.map((w) =>
                    renderWorkflowCard(w, props, runningWorkflowIds.has(w.id)),
                  )}
                </div>
              </div>
              <div class="wf-split-right">
                ${renderRightPanel(props, selWf, selProgress, showProgress, showRuns, runs, runsLoading)}
              </div>
            </div>
          `
    }

    <!-- Run detail modal -->
    ${props.modalRun && props.onCloseRunDetail
      ? renderRunDetailModal(props.modalRun, props.onCloseRunDetail)
      : nothing}
  `;
}

function renderRightPanel(
  props: WorkflowProps,
  selWf: Workflow | null | undefined,
  selProgress: CronProgressState | undefined,
  showProgress: boolean,
  showRuns: boolean,
  runs: WorkflowRun[],
  runsLoading: boolean,
) {
  if (!selWf) {
    return html`
      <div class="wf-empty-panel">
        <div class="wf-empty-panel-icon">${icons.workflow}</div>
        <p>Chọn một workflow để xem chi tiết</p>
      </div>
    `;
  }

  // Live progress timeline
  if (showProgress) {
    return html`
      <div class="wf-right-header">
        <h4 class="wf-right-title">${selWf.name}</h4>
      </div>
      ${renderProgressTimeline(selProgress)}
    `;
  }

  // Run history
  if (showRuns) {
    return html`
      <div class="wf-right-header">
        <h4 class="wf-right-title">Lịch sử chạy</h4>
        <p class="wf-right-sub">${selWf.name}</p>
      </div>
      ${
        runsLoading
          ? html`<div class="wf-right-runs-loading"><div class="wf-loading-spinner"></div></div>`
          : runs.length === 0
            ? html`<div class="wf-right-runs-empty">Chưa có lần chạy nào.</div>`
            : html`<div class="wf-right-runs-list">${runs.map((r) => renderRunItem(r, props.onOpenRunDetail))}</div>`
      }
    `;
  }

  // Default: prompt hint
  return html`
    <div class="wf-empty-panel">
      <h4 style="margin:0 0 4px">${selWf.name}</h4>
      <p style="opacity:.6;font-size:12px;margin:0">
        ${selWf.enabled ? "Nhấn ▶ Chạy ngay hoặc chờ lịch trình" : "Workflow đang tạm dừng"}
      </p>
    </div>
  `;
}
