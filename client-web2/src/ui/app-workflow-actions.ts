import type { Workflow, WorkflowFormState } from "./workflow-types";
/**
 * Workflow domain action functions.
 */
import { showConfirm } from "./components/operis-confirm";
import { showToast } from "./components/operis-toast";
import {
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  toggleWorkflow,
  runWorkflow,
  deleteWorkflow,
  getWorkflowRuns,
  getWorkflowStatus,
  seedDefaultWorkflows,
  type WorkflowStatus,
} from "./workflow-api";
import { DEFAULT_WORKFLOW_FORM } from "./workflow-types";

export interface WorkflowHost {
  workflows: Workflow[];
  workflowLoading: boolean;
  workflowError: string | null;
  workflowForm: WorkflowFormState;
  workflowSaving: boolean;
  workflowShowForm: boolean;
  editingWorkflowId: string | null;
  workflowStatus: WorkflowStatus | null;
  runningWorkflowIds: Set<string>;
  workflowRunsId: string | null;
  workflowRuns: Array<{
    ts: number;
    status: string;
    summary?: string;
    durationMs?: number;
    error?: string;
  }>;
  workflowRunsLoading: boolean;
}

export async function loadWorkflows(host: WorkflowHost, silent = false) {
  if (!silent) {
    host.workflowLoading = true;
    host.workflowError = null;
  }
  const startTime = Date.now();
  try {
    const [workflows, status] = await Promise.all([listWorkflows(), getWorkflowStatus()]);
    if (workflows.length === 0) {
      const seeded = await seedDefaultWorkflows();
      host.workflows = seeded.length > 0 ? seeded : workflows;
    } else {
      host.workflows = workflows;
    }
    host.workflowStatus = status;

    // Restore runningWorkflowIds from gateway state
    const loaded = host.workflows;
    const running = new Set(host.runningWorkflowIds);
    for (const w of loaded) {
      if (typeof w.runningAtMs === "number") running.add(w.id);
    }
    host.runningWorkflowIds = running;
  } catch (err) {
    if (!silent) {
      host.workflowError = err instanceof Error ? err.message : "Không thể tải workflows";
    }
  } finally {
    if (!silent) {
      const elapsed = Date.now() - startTime;
      const minDelay = 400;
      if (elapsed < minDelay) {
        await new Promise((r) => setTimeout(r, minDelay - elapsed));
      }
    }
    host.workflowLoading = false;
  }
}

export function handleWorkflowFormChange(host: WorkflowHost, patch: Partial<WorkflowFormState>) {
  host.workflowForm = { ...host.workflowForm, ...patch };
}

export function handleWorkflowEdit(host: WorkflowHost, workflow: Workflow) {
  host.editingWorkflowId = workflow.id;
  host.workflowForm = {
    ...DEFAULT_WORKFLOW_FORM,
    name: workflow.name,
    description: workflow.description || "",
    enabled: workflow.enabled,
    agentId: workflow.agentId || "",
    scheduleKind: workflow.schedule.kind,
    everyAmount: workflow.schedule.everyAmount ?? 1,
    everyUnit: workflow.schedule.everyUnit ?? "days",
    atDatetime: workflow.schedule.atDatetime ?? "",
    cronExpr: workflow.schedule.cronExpr ?? "0 9 * * *",
    cronTz: workflow.schedule.cronTz ?? "",
    sessionTarget: workflow.sessionTarget ?? "isolated",
    wakeMode: workflow.wakeMode ?? "now",
    payloadKind: workflow.payloadKind ?? "agentTurn",
    timeout: workflow.timeout ?? 300,
    prompt: workflow.prompt,
  };
  host.workflowShowForm = true;
}

export async function handleWorkflowSubmit(host: WorkflowHost) {
  if (host.workflowSaving) return;
  host.workflowSaving = true;
  try {
    if (host.editingWorkflowId) {
      await updateWorkflow(host.editingWorkflowId, host.workflowForm);
      showToast(`Đã cập nhật "${host.workflowForm.name}"`, "success");
    } else {
      await createWorkflow(host.workflowForm);
      showToast(`Đã tạo workflow "${host.workflowForm.name}"`, "success");
    }
    host.workflowForm = { ...DEFAULT_WORKFLOW_FORM };
    host.editingWorkflowId = null;
    host.workflowShowForm = false;
    await loadWorkflows(host, true);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : host.editingWorkflowId
          ? "Không thể cập nhật workflow"
          : "Không thể tạo workflow";
    showToast(msg, "error");
    host.workflowError = msg;
  } finally {
    host.workflowSaving = false;
  }
}

export async function handleWorkflowToggle(host: WorkflowHost, workflow: Workflow) {
  const newState = !workflow.enabled;
  // If disabling and job is running, cancel it on gateway first then wait for it to stop
  if (!newState && host.runningWorkflowIds.has(workflow.id)) {
    try {
      const { cancelWorkflow } = await import("./workflow-api");
      await cancelWorkflow(workflow.id);
      await new Promise<void>((resolve) => {
        const maxWait = setTimeout(resolve, 30_000);
        const check = setInterval(() => {
          if (!host.runningWorkflowIds.has(workflow.id)) {
            clearInterval(check);
            clearTimeout(maxWait);
            resolve();
          }
        }, 500);
      });
    } catch {
      /* best effort */
    }
  }
  // Optimistic update
  host.workflows = host.workflows.map((w) =>
    w.id === workflow.id ? { ...w, enabled: newState } : w,
  );
  try {
    await toggleWorkflow(workflow.id, newState);
    showToast(
      newState ? `Đã kích hoạt "${workflow.name}"` : `Đã tạm dừng "${workflow.name}"`,
      "success",
    );
  } catch (err) {
    // Revert on error
    host.workflows = host.workflows.map((w) =>
      w.id === workflow.id ? { ...w, enabled: !newState } : w,
    );
    const msg = err instanceof Error ? err.message : "Không thể thay đổi trạng thái";
    showToast(msg, "error");
    host.workflowError = msg;
  }
}

export async function handleWorkflowRun(host: WorkflowHost, workflow: Workflow) {
  if (host.runningWorkflowIds.has(workflow.id)) {
    showToast(`"${workflow.name}" đang chạy, vui lòng đợi hoàn thành.`, "warning");
    return;
  }
  host.runningWorkflowIds = new Set([...host.runningWorkflowIds, workflow.id]);
  try {
    await runWorkflow(workflow.id);
    showToast(`Đang chạy "${workflow.name}"...`, "info");
    // Fallback: clear running state + orphaned progress after 5min if WS events missed
    setTimeout(() => {
      if (host.runningWorkflowIds.has(workflow.id)) {
        const newSet = new Set(host.runningWorkflowIds);
        newSet.delete(workflow.id);
        host.runningWorkflowIds = newSet;
      }
      // Also clean orphaned progress entries for this workflow's cron jobs
      if ("progressMap" in host) {
        const pm = host.progressMap as Map<string, unknown>;
        if (pm.has(workflow.id)) {
          const newPm = new Map(pm);
          newPm.delete(workflow.id);
          (host as Record<string, unknown>).progressMap = newPm;
        }
      }
    }, 300_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Không thể chạy workflow";
    const isTimeout = msg.includes("timeout") || msg.includes("Timeout");
    if (!isTimeout) {
      host.runningWorkflowIds = new Set(
        [...host.runningWorkflowIds].filter((id) => id !== workflow.id),
      );
      showToast(msg, "error");
      host.workflowError = msg;
    }
  }
}

export async function handleWorkflowCancel(host: WorkflowHost, workflow: Workflow) {
  if (!host.runningWorkflowIds.has(workflow.id)) {
    showToast(`"${workflow.name}" không đang chạy.`, "warning");
    return;
  }
  try {
    const { cancelWorkflow } = await import("./workflow-api");
    await cancelWorkflow(workflow.id);
    showToast(`Đã gửi lệnh hủy "${workflow.name}"`, "info");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Không thể hủy workflow";
    showToast(msg, "error");
  }
}

export async function handleWorkflowDelete(host: WorkflowHost, workflow: Workflow) {
  const confirmed = await showConfirm({
    title: "Xóa workflow?",
    message: `Bạn có chắc muốn xóa workflow "${workflow.name}"? Hành động này không thể hoàn tác.`,
    confirmText: "Xóa",
    cancelText: "Hủy",
    variant: "danger",
  });
  if (!confirmed) return;
  // If running, cancel first then wait
  if (host.runningWorkflowIds.has(workflow.id)) {
    try {
      const { cancelWorkflow } = await import("./workflow-api");
      await cancelWorkflow(workflow.id);
      await new Promise<void>((resolve) => {
        const maxWait = setTimeout(resolve, 30_000);
        const check = setInterval(() => {
          if (!host.runningWorkflowIds.has(workflow.id)) {
            clearInterval(check);
            clearTimeout(maxWait);
            resolve();
          }
        }, 500);
      });
    } catch {
      /* best effort */
    }
  }
  const originalWorkflows = host.workflows;
  host.workflows = host.workflows.filter((w) => w.id !== workflow.id);
  try {
    await deleteWorkflow(workflow.id);
    showToast(`Đã xóa "${workflow.name}"`, "success");
  } catch (err) {
    host.workflows = originalWorkflows;
    const msg = err instanceof Error ? err.message : "Không thể xóa workflow";
    showToast(msg, "error");
    host.workflowError = msg;
  }
}

export async function loadWorkflowRuns(host: WorkflowHost, workflowId: string | null) {
  if (!workflowId) {
    host.workflowRunsId = null;
    host.workflowRuns = [];
    return;
  }
  host.workflowRunsId = workflowId;
  host.workflowRunsLoading = true;
  try {
    const runs = await getWorkflowRuns(workflowId);
    host.workflowRuns = runs;
  } catch (err) {
    console.error("Failed to load workflow runs:", err);
    host.workflowRuns = [];
  } finally {
    host.workflowRunsLoading = false;
  }
}
