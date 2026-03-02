import { html, nothing } from "lit";
import type { WorkflowRun, WorkflowStatus } from "../workflow-api";
import type {
  Workflow,
  WorkflowFormState,
  ScheduleKind,
  EveryUnit,
  SessionTarget,
  WakeMode,
  PayloadKind,
  DeliveryMode,
} from "../workflow-types";
import { t } from "../i18n";
import { icons } from "../icons";
import { formatSchedule } from "../workflow-types";

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
  // Run history
  runsWorkflowId?: string | null;
  runs?: WorkflowRun[];
  runsLoading?: boolean;
  // Handlers
  onRefresh: () => void;
  onFormChange: (patch: Partial<WorkflowFormState>) => void;
  onSubmit: () => void;
  onToggle: (workflow: Workflow) => void;
  onRun: (workflow: Workflow) => void;
  onDelete: (workflow: Workflow) => void;
  onToggleDetails?: (workflowId: string) => void;
  onLoadRuns?: (workflowId: string | null) => void;
}

// Format timestamp
function formatMs(ts: number): string {
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return t("wfNever");
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return t("wfJustNow");
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${diffDays} ngày trước`;
}

function formatRelativeTimeFromNow(timestamp: number | undefined): string {
  if (!timestamp) return "—";
  const diffMs = timestamp - Date.now();
  if (diffMs < 0) return t("wfJustNow");
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "< 1 phút";
  if (diffMins < 60) return `${diffMins} phút`;
  if (diffHours < 24) return `${diffHours} giờ`;
  return `${diffDays} ngày`;
}

function formatLastRun(workflow: Workflow): { time: string; status: string } {
  if (!workflow.lastRunAt) return { time: t("wfNever"), status: "never" };
  return {
    time: formatRelativeTime(workflow.lastRunAt),
    status: workflow.lastRunStatus ?? "never",
  };
}

// Format next wake time
function formatNextWake(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = ms - Date.now();
  if (diff < 0) return "Ngay bây giờ";
  if (diff < 60000) return "< 1 phút";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ`;
  return `${Math.floor(diff / 86400000)} ngày`;
}

// Select options
const SCHEDULE_OPTIONS = [
  { value: "every", label: "Định kỳ", description: "Lặp lại theo chu kỳ" },
  { value: "at", label: "Một lần", description: "Chạy vào thời điểm cụ thể" },
  { value: "cron", label: "Cron", description: "Biểu thức cron nâng cao" },
];
const EVERY_UNIT_OPTIONS = [
  { value: "minutes", label: "Phút" },
  { value: "hours", label: "Giờ" },
  { value: "days", label: "Ngày" },
];
const SESSION_OPTIONS = [
  { value: "isolated", label: "Riêng biệt", description: "Phiên tách biệt" },
  { value: "main", label: "Phiên chính", description: "Dùng phiên hiện tại" },
];
const WAKE_MODE_OPTIONS = [
  { value: "now", label: "Ngay lập tức", description: "Đánh thức ngay" },
  {
    value: "next-heartbeat",
    label: "Heartbeat tiếp",
    description: "Chờ heartbeat",
  },
];
const PAYLOAD_OPTIONS = [
  { value: "agentTurn", label: "Gửi tin nhắn", description: "Tin nhắn cho AI" },
  {
    value: "systemEvent",
    label: "Sự kiện hệ thống",
    description: "Event nội bộ",
  },
];
const DELIVERY_MODE_OPTIONS = [
  {
    value: "announce",
    label: "Announce summary",
    description: "Gửi kết quả tóm tắt",
  },
  { value: "none", label: "None (internal)", description: "Không thông báo" },
];
const CHANNEL_OPTIONS = [{ value: "last", label: "last", description: "Kênh cuối cùng tương tác" }];

// Scheduler status card (left side) - Clean moltbot-style
function renderStatusCard(props: WorkflowProps) {
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

// Schedule fields based on kind
function renderScheduleFields(props: WorkflowProps) {
  const { form, onFormChange } = props;
  if (form.scheduleKind === "at") {
    return html`
      <label class="wf-field" style="margin-top: 12px;">
        <span>Thời gian chạy</span>
        <input
          type="datetime-local"
          .value=${form.atDatetime}
          @input=${(e: Event) => onFormChange({ atDatetime: (e.target as HTMLInputElement).value })}
        />
      </label>
    `;
  }
  if (form.scheduleKind === "every") {
    return html`
      <div class="wf-form-grid" style="margin-top: 12px;">
        <label class="wf-field">
          <span>Mỗi</span>
          <input
            type="number"
            min="1"
            .value=${String(form.everyAmount)}
            @input=${(e: Event) =>
              onFormChange({
                everyAmount: parseInt((e.target as HTMLInputElement).value, 10) || 1,
              })}
          />
        </label>
        <label class="wf-field">
          <span>Đơn vị</span>
          <operis-select
            .value=${form.everyUnit}
            .options=${EVERY_UNIT_OPTIONS}
            @change=${(e: CustomEvent) => onFormChange({ everyUnit: e.detail.value as EveryUnit })}
          ></operis-select>
        </label>
      </div>
    `;
  }
  return html`
    <div class="wf-form-grid" style="margin-top: 12px;">
      <label class="wf-field">
        <span>Biểu thức</span>
        <input
          .value=${form.cronExpr}
          placeholder="0 9 * * *"
          @input=${(e: Event) => onFormChange({ cronExpr: (e.target as HTMLInputElement).value })}
        />
      </label>
      <label class="wf-field">
        <span>Múi giờ</span>
        <input
          .value=${form.cronTz}
          placeholder="UTC"
          @input=${(e: Event) => onFormChange({ cronTz: (e.target as HTMLInputElement).value })}
        />
      </label>
    </div>
  `;
}

// New workflow form card (right side) - Clean moltbot-style
function renderFormCard(props: WorkflowProps) {
  const { form, saving, onFormChange, onSubmit } = props;
  const isValid =
    form.name.trim() &&
    form.prompt.trim() &&
    (form.scheduleKind !== "at" || form.atDatetime) &&
    (form.scheduleKind !== "cron" || form.cronExpr.trim()) &&
    (form.scheduleKind !== "every" || form.everyAmount >= 1);

  return html`
    <div class="wf-card-panel">
      <div class="wf-card-title">Tạo Workflow</div>
      <div class="wf-card-sub">Tạo công việc tự động theo lịch.</div>

      <!-- Basic Info -->
      <div class="wf-form-grid">
        <label class="wf-field">
          <span>Tên</span>
          <input
            .value=${form.name}
            placeholder="VD: Báo cáo buổi sáng"
            @input=${(e: Event) => onFormChange({ name: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="wf-field">
          <span>Mô tả</span>
          <input
            .value=${form.description}
            placeholder="Mô tả ngắn (tuỳ chọn)"
            @input=${(e: Event) =>
              onFormChange({
                description: (e.target as HTMLInputElement).value,
              })}
          />
        </label>
      </div>

      <!-- Schedule -->
      <div class="wf-form-grid" style="margin-top: 12px;">
        <label class="wf-field">
          <span>Lịch chạy</span>
          <operis-select
            .value=${form.scheduleKind}
            .options=${SCHEDULE_OPTIONS}
            @change=${(e: CustomEvent) =>
              onFormChange({ scheduleKind: e.detail.value as ScheduleKind })}
          ></operis-select>
        </label>
        ${
          form.scheduleKind === "at"
            ? html`
              <label class="wf-field">
                <span>Thời gian</span>
                <input
                  type="datetime-local"
                  .value=${form.atDatetime}
                  @input=${(e: Event) =>
                    onFormChange({
                      atDatetime: (e.target as HTMLInputElement).value,
                    })}
                />
              </label>
            `
            : form.scheduleKind === "every"
              ? html`
                <label class="wf-field">
                  <span>Mỗi</span>
                  <input
                    type="number"
                    min="1"
                    .value=${String(form.everyAmount)}
                    @input=${(e: Event) =>
                      onFormChange({
                        everyAmount: parseInt((e.target as HTMLInputElement).value, 10) || 1,
                      })}
                  />
                </label>
                <label class="wf-field">
                  <span>Đơn vị</span>
                  <operis-select
                    .value=${form.everyUnit}
                    .options=${EVERY_UNIT_OPTIONS}
                    @change=${(e: CustomEvent) =>
                      onFormChange({ everyUnit: e.detail.value as EveryUnit })}
                  ></operis-select>
                </label>
              `
              : html`
                <label class="wf-field">
                  <span>Biểu thức</span>
                  <input
                    .value=${form.cronExpr}
                    placeholder="0 9 * * *"
                    @input=${(e: Event) =>
                      onFormChange({
                        cronExpr: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
                <label class="wf-field">
                  <span>Múi giờ</span>
                  <input
                    .value=${form.cronTz}
                    placeholder="UTC"
                    @input=${(e: Event) =>
                      onFormChange({
                        cronTz: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
              `
        }
      </div>

      <!-- Execution -->
      <div class="wf-form-grid" style="margin-top: 12px;">
        <label class="wf-field">
          <span>Phiên</span>
          <operis-select
            .value=${form.sessionTarget}
            .options=${SESSION_OPTIONS}
            @change=${(e: CustomEvent) =>
              onFormChange({ sessionTarget: e.detail.value as SessionTarget })}
          ></operis-select>
        </label>
        <label class="wf-field">
          <span>Đánh thức</span>
          <operis-select
            .value=${form.wakeMode}
            .options=${WAKE_MODE_OPTIONS}
            @change=${(e: CustomEvent) => onFormChange({ wakeMode: e.detail.value as WakeMode })}
          ></operis-select>
        </label>
        <label class="wf-field">
          <span>Loại payload</span>
          <operis-select
            .value=${form.payloadKind}
            .options=${PAYLOAD_OPTIONS}
            @change=${(e: CustomEvent) =>
              onFormChange({ payloadKind: e.detail.value as PayloadKind })}
          ></operis-select>
        </label>
        <label class="wf-field wf-field-checkbox">
          <span>Bật</span>
          <input
            type="checkbox"
            .checked=${form.enabled}
            @change=${(e: Event) =>
              onFormChange({ enabled: (e.target as HTMLInputElement).checked })}
          />
        </label>
      </div>

      <!-- Delivery (for agentTurn) -->
      ${
        form.payloadKind === "agentTurn"
          ? html`
            <div class="wf-form-grid" style="margin-top: 12px;">
              <label class="wf-field">
                <span>Delivery</span>
                <operis-select
                  .value=${form.deliveryMode}
                  .options=${DELIVERY_MODE_OPTIONS}
                  @change=${(e: CustomEvent) =>
                    onFormChange({
                      deliveryMode: e.detail.value as DeliveryMode,
                    })}
                ></operis-select>
              </label>
              <label class="wf-field">
                <span>Timeout (giây)</span>
                <input
                  type="number"
                  min="0"
                  .value=${String(form.timeout)}
                  @input=${(e: Event) =>
                    onFormChange({
                      timeout: parseInt((e.target as HTMLInputElement).value, 10) || 0,
                    })}
                />
              </label>
              ${
                form.deliveryMode === "announce"
                  ? html`
                    <label class="wf-field">
                      <span>Channel</span>
                      <operis-select
                        .value=${form.deliveryChannel || "last"}
                        .options=${CHANNEL_OPTIONS}
                        @change=${(e: CustomEvent) =>
                          onFormChange({ deliveryChannel: e.detail.value })}
                      ></operis-select>
                    </label>
                    <label class="wf-field">
                      <span>To</span>
                      <input
                        .value=${form.deliveryTo}
                        placeholder="+1555… hoặc chat id"
                        @input=${(e: Event) =>
                          onFormChange({
                            deliveryTo: (e.target as HTMLInputElement).value,
                          })}
                      />
                    </label>
                  `
                  : nothing
              }
            </div>
          `
          : nothing
      }

      <!-- Task/Message -->
      <label class="wf-field" style="margin-top: 12px;">
        <span
          >${form.payloadKind === "systemEvent" ? "System text" : "Tin nhắn cho AI"}</span
        >
        <textarea
          .value=${form.prompt}
          rows="4"
          placeholder="VD: Kiểm tra email mới và tóm tắt những email quan trọng"
          @input=${(e: Event) => onFormChange({ prompt: (e.target as HTMLTextAreaElement).value })}
        ></textarea>
      </label>

      <!-- Submit -->
      <div class="wf-row" style="margin-top: 14px;">
        <button
          class="wf-btn wf-btn-primary"
          ?disabled=${saving || !isValid}
          @click=${onSubmit}
        >
          ${saving ? "Đang tạo…" : "Tạo workflow"}
        </button>
      </div>
    </div>
  `;
}

// Beautiful workflow card (original style)
function renderWorkflowCard(workflow: Workflow, props: WorkflowProps, isRunning: boolean) {
  const {
    onToggle,
    onRun,
    onDelete,
    onLoadRuns,
    onToggleDetails,
    expandedWorkflowId,
    runsWorkflowId,
    saving,
  } = props;
  const lastRun = formatLastRun(workflow);
  const isSelected = runsWorkflowId === workflow.id;
  const isExpanded = expandedWorkflowId === workflow.id;
  const statusClass = lastRun.status === "ok" ? "success" : lastRun.status;

  return html`
    <div
      class="wf-card ${workflow.enabled ? "" : "wf-card-paused"} ${
        isRunning ? "wf-card-running" : ""
      } ${isSelected ? "wf-card-selected" : ""} ${isExpanded ? "wf-card-expanded" : ""}"
    >
      <div class="wf-card-main">
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
              ? html`<div class="wf-card-prompt">
                "${
                  workflow.prompt.length > 100
                    ? workflow.prompt.slice(0, 100) + "..."
                    : workflow.prompt
                }"
              </div>`
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
                      <div class="wf-detail-prompt-text">
                        ${workflow.prompt}
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
          class="wf-action ${isSelected ? "wf-action-active" : ""}"
          @click=${() => onLoadRuns?.(isSelected ? null : workflow.id)}
          ?disabled=${saving || isRunning}
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

// Run history item
function renderRunItem(entry: WorkflowRun) {
  return html`
    <div class="wf-run-item">
      <div class="wf-run-main">
        <div class="wf-run-status wf-run-status-${entry.status}">
          ${entry.status}
        </div>
        <div class="wf-run-summary">${entry.summary ?? ""}</div>
        ${entry.error ? html`<div class="wf-run-error">${entry.error}</div>` : nothing}
      </div>
      <div class="wf-run-meta">
        <div>${formatMs(entry.ts)}</div>
        <div class="wf-run-duration">${entry.durationMs ?? 0}ms</div>
      </div>
    </div>
  `;
}

export function renderWorkflow(props: WorkflowProps) {
  const {
    workflows,
    loading,
    runningWorkflowIds = new Set(),
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
  const selectedWorkflow = runsWorkflowId ? workflows.find((w) => w.id === runsWorkflowId) : null;

  return html`
    <style>
      /* Two-column grid (moltbot-style) */
      .wf-top-grid {
        display: grid;
        grid-template-columns: 1fr 1.2fr;
        gap: 16px;
        margin-bottom: 24px;
      }
      @media (max-width: 900px) {
        .wf-top-grid {
          grid-template-columns: 1fr;
        }
      }

      /* === Card Panel (moltbot-style) === */
      .wf-card-panel {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .wf-card-panel:hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-md);
      }
      .wf-card-title {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--text-strong, var(--text));
      }
      .wf-card-sub {
        color: var(--muted);
        font-size: 13px;
        margin-top: 6px;
        line-height: 1.5;
      }

      /* === Stats Grid (moltbot-style) === */
      .wf-stat-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-top: 16px;
      }
      @media (min-width: 600px) {
        .wf-stat-grid {
          grid-template-columns: repeat(4, 1fr);
        }
      }
      .wf-stat {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        padding: 14px 16px;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .wf-stat:hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-sm);
      }
      .wf-stat-label {
        color: var(--muted);
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .wf-stat-value {
        font-size: 24px;
        font-weight: 700;
        margin-top: 6px;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }
      .wf-stat-ok {
        color: var(--ok);
      }

      /* === Row & Button (moltbot-style) === */
      .wf-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
      }
      .wf-muted {
        color: var(--muted);
        font-size: 13px;
      }
      .wf-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border: 1px solid var(--border);
        background: var(--card);
        padding: 9px 16px;
        border-radius: var(--radius-md);
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.01em;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .wf-btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
      }
      .wf-btn:active {
        background: var(--secondary);
        transform: translateY(0);
        box-shadow: none;
      }
      .wf-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .wf-btn-primary {
        border-color: var(--accent);
        background: var(--accent);
        color: var(--accent-foreground, #fff);
      }
      .wf-btn-primary:hover {
        background: var(--accent-hover, var(--accent));
        border-color: var(--accent-hover, var(--accent));
      }

      /* === Form Grid (moltbot-style) === */
      .wf-form-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        margin-top: 16px;
      }
      .wf-field {
        display: grid;
        gap: 6px;
      }
      .wf-field.full {
        grid-column: 1 / -1;
      }
      .wf-field span {
        color: var(--muted);
        font-size: 13px;
        font-weight: 500;
      }
      .wf-field input,
      .wf-field textarea,
      .wf-field select {
        border: 1px solid var(--border);
        background: var(--card);
        border-radius: var(--radius-md);
        padding: 8px 12px;
        outline: none;
        font-size: 14px;
        font-family: inherit;
        color: var(--text);
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
      }
      .wf-field input:focus,
      .wf-field textarea:focus,
      .wf-field select:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent-subtle);
      }
      .wf-field input::placeholder,
      .wf-field textarea::placeholder {
        color: var(--muted);
      }
      .wf-field textarea {
        min-height: 100px;
        resize: vertical;
        font-family: var(--mono, monospace);
        line-height: 1.5;
      }
      .wf-field-checkbox {
        grid-template-columns: auto 1fr;
        align-items: center;
      }
      .wf-field-checkbox input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--accent);
        cursor: pointer;
      }

      /* Section header with running badge */
      .wf-section-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .wf-section-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong, var(--text));
      }
      .wf-running-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--accent-subtle);
        border: 1px solid var(--accent);
        border-radius: var(--radius-full);
        font-size: 13px;
        font-weight: 500;
        color: var(--accent);
      }
      .wf-running-badge-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--accent);
        animation: wf-pulse 1.5s ease-in-out infinite;
      }
      @keyframes wf-pulse {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.5;
          transform: scale(1.3);
        }
      }
      @keyframes wf-spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Workflow cards (beautiful original style) */
      .wf-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .wf-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        overflow: hidden;
        transition: all 0.15s ease;
      }
      .wf-card:hover {
        border-color: var(--border-strong);
        box-shadow: var(--shadow-md);
      }
      .wf-card-paused {
        opacity: 0.7;
      }
      .wf-card-running {
        border-color: var(--accent);
        box-shadow: 0 0 0 1px var(--accent-subtle);
      }
      .wf-card-selected {
        border-color: var(--accent);
        background: var(--accent-subtle);
      }
      .wf-card-main {
        display: flex;
        gap: 16px;
        padding: 20px;
      }
      .wf-card-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--secondary);
        border-radius: var(--radius-md);
        color: var(--muted);
        flex-shrink: 0;
        transition: all 0.15s ease;
      }
      .wf-card-icon-active {
        background: var(--accent-subtle);
        color: var(--accent);
      }
      .wf-card-icon-running {
        background: var(--accent);
        color: var(--accent-foreground);
        animation: wf-icon-pulse 2s ease-in-out infinite;
      }
      @keyframes wf-icon-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.7;
        }
      }
      .wf-card-icon svg {
        width: 24px;
        height: 24px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5;
      }
      .wf-card-content {
        flex: 1;
        min-width: 0;
      }
      .wf-card-header {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .wf-card-title {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong, var(--text));
      }
      .wf-card-desc {
        margin: 4px 0 0;
        font-size: 13px;
        color: var(--text-secondary, var(--text));
        opacity: 0.85;
      }
      .wf-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 500;
        border-radius: var(--radius-full);
      }
      .wf-status-active {
        background: var(--ok-subtle);
        color: var(--ok);
      }
      .wf-status-paused {
        background: var(--warn-subtle);
        color: var(--warn);
      }
      .wf-status-running {
        background: var(--accent-subtle);
        color: var(--accent);
      }
      .wf-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .wf-status-dot-pulse {
        animation: wf-pulse 1.5s ease-in-out infinite;
      }
      .wf-card-meta {
        display: flex;
        gap: 16px;
        margin-top: 12px;
        flex-wrap: wrap;
      }
      .wf-meta-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: var(--text);
        font-weight: 500;
      }
      .wf-meta-icon {
        width: 14px;
        height: 14px;
      }
      .wf-meta-icon svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .wf-run-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--muted);
      }
      .wf-meta-success .wf-run-dot {
        background: var(--ok);
      }
      .wf-meta-ok .wf-run-dot {
        background: var(--ok);
      }
      .wf-meta-error .wf-run-dot {
        background: var(--danger);
      }
      .wf-meta-tag {
        padding: 2px 8px;
        background: var(--secondary);
        border-radius: var(--radius-sm);
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .wf-meta-next {
        color: var(--accent);
        background: var(--accent-subtle);
        padding: 4px 10px;
        border-radius: var(--radius-sm);
      }
      .wf-card-prompt {
        margin-top: 12px;
        padding: 12px 16px;
        background: var(--bg);
        border-radius: var(--radius-md);
        font-size: 13px;
        color: var(--text-strong, var(--text));
        line-height: 1.5;
        font-style: italic;
        border: 1px solid var(--border);
      }
      .wf-card-actions {
        display: flex;
        gap: 8px;
        padding: 12px 20px;
        background: var(--bg-muted);
        border-top: 1px solid var(--border);
      }
      .wf-action {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 500;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .wf-action:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .wf-action svg {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .wf-action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        pointer-events: none;
      }
      .wf-action-run:hover {
        border-color: var(--accent);
        color: var(--accent);
      }
      .wf-action-delete {
        margin-left: auto;
        padding: 8px;
      }
      .wf-action-delete span {
        display: none;
      }
      .wf-action-delete:hover {
        border-color: var(--danger);
        color: var(--danger);
        background: var(--danger-subtle);
      }
      .wf-action-active {
        border-color: var(--accent);
        color: var(--accent);
        background: var(--accent-subtle);
      }
      .wf-action-active svg {
        transform: rotate(180deg);
      }

      /* Expanded details */
      .wf-card-expanded {
        border-color: var(--accent);
      }
      .wf-card-details {
        padding: 16px 20px;
        padding-left: 84px;
        background: var(--card);
        border-top: 1px solid var(--border);
      }
      .wf-details-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .wf-detail-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .wf-detail-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .wf-detail-value {
        font-size: 15px;
        color: var(--text);
      }
      .wf-detail-prompt {
        margin-top: 16px;
      }
      .wf-detail-prompt-text {
        margin-top: 8px;
        padding: 14px 18px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        font-size: 15px;
        color: var(--text);
        line-height: 1.6;
        white-space: pre-wrap;
      }

      /* Run history */
      .wf-runs-section {
        margin-top: 24px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
      }
      .wf-runs-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
      }
      .wf-runs-header-left {
        flex: 1;
      }
      .wf-runs-title {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong, var(--text));
      }
      .wf-runs-sub {
        margin: 0;
        font-size: 13px;
        color: var(--muted);
      }
      .wf-runs-close {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: var(--radius-sm);
        color: var(--muted);
        cursor: pointer;
      }
      .wf-runs-close:hover {
        background: var(--bg-hover);
        color: var(--text);
      }
      .wf-runs-close svg {
        width: 18px;
        height: 18px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
      .wf-runs-list {
        display: flex;
        flex-direction: column;
      }
      .wf-run-item {
        display: flex;
        padding: 14px 20px;
        border-bottom: 1px solid var(--border);
      }
      .wf-run-item:last-child {
        border-bottom: none;
      }
      .wf-run-main {
        flex: 1;
      }
      .wf-run-status {
        font-size: 14px;
        font-weight: 600;
      }
      .wf-run-status-ok,
      .wf-run-status-success {
        color: var(--ok);
      }
      .wf-run-status-error {
        color: var(--danger);
      }
      .wf-run-summary {
        font-size: 13px;
        color: var(--text);
        margin-top: 2px;
      }
      .wf-run-error {
        font-size: 12px;
        color: var(--danger);
        margin-top: 4px;
      }
      .wf-run-meta {
        text-align: right;
        font-size: 12px;
        color: var(--muted);
      }
      .wf-run-duration {
        margin-top: 2px;
      }
      .wf-runs-empty {
        padding: 24px 20px;
        text-align: center;
        font-size: 13px;
        color: var(--muted);
      }
      .wf-runs-loading {
        padding: 24px 20px;
        text-align: center;
      }

      /* Empty state */
      .wf-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 24px;
        text-align: center;
        background: var(--card);
        border: 2px dashed var(--border);
        border-radius: var(--radius-xl);
      }
      .wf-empty-icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--accent-subtle);
        border-radius: var(--radius-lg);
        color: var(--accent);
        margin-bottom: 16px;
      }
      .wf-empty-icon svg {
        width: 28px;
        height: 28px;
        stroke: currentColor;
        fill: none;
        stroke-width: 1.5;
      }
      .wf-empty-title {
        margin: 0 0 8px;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-strong, var(--text));
      }
      .wf-empty-desc {
        margin: 0 0 20px;
        font-size: 13px;
        color: var(--muted);
        max-width: 280px;
      }

      /* Loading */
      .wf-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 24px;
      }
      .wf-loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: wf-spin 0.8s linear infinite;
        margin-bottom: 16px;
      }
      .wf-loading-text {
        font-size: 14px;
        color: var(--muted);
      }
    </style>

    <!-- Top section: Status + Form (two columns like admin UI) -->
    <div class="wf-top-grid">
      ${renderStatusCard(props)} ${renderFormCard(props)}
    </div>

    <!-- Workflow list section -->
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
            <div class="wf-list">
              ${sortedWorkflows.map((w) =>
                renderWorkflowCard(w, props, runningWorkflowIds.has(w.id)),
              )}
            </div>
          `
    }
    ${
      runsWorkflowId
        ? html`
          <div class="wf-runs-section">
            <div class="wf-runs-header">
              <div class="wf-runs-header-left">
                <h3 class="wf-runs-title">Lịch sử chạy</h3>
                <p class="wf-runs-sub">
                  ${selectedWorkflow?.name ?? runsWorkflowId}
                </p>
              </div>
              <button
                class="wf-runs-close"
                @click=${() => props.onLoadRuns?.(null)}
              >
                ${icons.x}
              </button>
            </div>
            ${
              runsLoading
                ? html`
                    <div class="wf-runs-loading">
                      <div class="wf-loading-spinner"></div>
                    </div>
                  `
                : runs.length === 0
                  ? html`
                      <div class="wf-runs-empty">Chưa có lần chạy nào.</div>
                    `
                  : html`
                    <div class="wf-runs-list">
                      ${runs.map((entry) => renderRunItem(entry))}
                    </div>
                  `
            }
          </div>
        `
        : nothing
    }
  `;
}
