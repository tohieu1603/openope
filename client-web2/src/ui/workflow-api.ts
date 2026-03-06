import type { Workflow, WorkflowFormState } from "./workflow-types";
// Workflow API service - communicates with Gateway via WebSocket RPC
import { waitForConnection } from "./gateway-client";
import { formToCronPayload, parseCronSchedule } from "./workflow-types";

type CronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule?: { kind?: string; everyMs?: number; atMs?: number; expr?: string; tz?: string };
  payload?: { kind?: string; message?: string; text?: string; deliver?: boolean };
  sessionTarget?: "main" | "isolated";
  wakeMode?: "next-heartbeat" | "now";
  timeoutSec?: number;
  agentId?: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  state?: {
    lastRunAtMs?: number;
    lastStatus?: string;
    nextRunAtMs?: number;
    runningAtMs?: number;
  };
};

function cronJobToWorkflow(job: CronJob): Workflow {
  const schedule = parseCronSchedule(job);
  const payloadKind = job.payload?.kind as Workflow["payloadKind"];
  return {
    id: job.id,
    name: job.name,
    description: job.description ?? "",
    schedule,
    prompt: job.payload?.message ?? job.payload?.text ?? "",
    notifyMe: job.payload?.deliver ?? false,
    enabled: job.enabled,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    payloadKind,
    timeout: job.timeoutSec,
    lastRunAt: job.state?.lastRunAtMs,
    lastRunStatus: job.state?.lastStatus as Workflow["lastRunStatus"],
    nextRunAt: job.state?.nextRunAtMs,
    runningAtMs: job.state?.runningAtMs,
    createdAtMs: job.createdAtMs,
    updatedAtMs: job.updatedAtMs,
    agentId: job.agentId,
  };
}

export async function listWorkflows(): Promise<Workflow[]> {
  const client = await waitForConnection();
  const result = await client.request<{ jobs?: CronJob[] }>("cron.list", { includeDisabled: true });
  const jobs = Array.isArray(result.jobs) ? result.jobs : [];
  return jobs.map(cronJobToWorkflow);
}

export async function createWorkflow(form: WorkflowFormState): Promise<boolean> {
  try {
    const client = await waitForConnection();
    const payload = formToCronPayload(form);
    await client.request("cron.add", payload);
    return true;
  } catch (error) {
    console.error("Failed to create workflow:", error);
    throw error;
  }
}

export async function updateWorkflow(id: string, form: WorkflowFormState): Promise<boolean> {
  try {
    const client = await waitForConnection();
    // Build patch matching CronJobPatchSchema (differs from cron.add format)
    const addPayload = formToCronPayload(form);
    const { payload: rawPayload, isolation: _iso, ...rest } = addPayload as Record<string, unknown>;
    // Strip delivery fields from payload (cron.update expects separate 'delivery')
    const { deliver, channel, to, ...cleanPayload } = rawPayload as Record<string, unknown>;

    const patch: Record<string, unknown> = { ...rest, payload: cleanPayload };

    // Build delivery object separately
    if (form.payloadKind === "agentTurn" && form.deliveryMode === "announce") {
      patch.delivery = {
        mode: "announce",
        ...(form.deliveryChannel ? { channel: form.deliveryChannel } : {}),
        ...(form.deliveryTo?.trim() ? { to: form.deliveryTo.trim() } : {}),
      };
    } else {
      patch.delivery = { mode: "none" };
    }

    await client.request("cron.update", { id, patch });
    return true;
  } catch (error) {
    console.error("Failed to update workflow:", error);
    throw error;
  }
}

export async function toggleWorkflow(id: string, enabled: boolean): Promise<boolean> {
  try {
    const client = await waitForConnection();
    await client.request("cron.update", { id, patch: { enabled } });
    return true;
  } catch (error) {
    console.error("Failed to toggle workflow:", error);
    throw error;
  }
}

export async function runWorkflow(id: string): Promise<boolean> {
  try {
    const client = await waitForConnection();
    await client.request("cron.run", { id, mode: "force" });
    return true;
  } catch (error) {
    console.error("Failed to run workflow:", error);
    throw error;
  }
}

export async function cancelWorkflow(id: string): Promise<boolean> {
  try {
    const client = await waitForConnection();
    await client.request("cron.cancel", { id });
    return true;
  } catch (error) {
    console.error("Failed to cancel workflow:", error);
    throw error;
  }
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  try {
    const client = await waitForConnection();
    await client.request("cron.remove", { id });
    return true;
  } catch (error) {
    console.error("Failed to delete workflow:", error);
    throw error;
  }
}

export type WorkflowRunActivity = {
  name: string;
  detail?: string;
  durationMs: number;
  isError?: boolean;
};

export type WorkflowRun = {
  ts: number;
  status: string;
  summary?: string;
  durationMs?: number;
  error?: string;
  /** Tool call activities recorded during the run. */
  activities?: WorkflowRunActivity[];
};

export type WorkflowStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

export async function getWorkflowStatus(): Promise<WorkflowStatus | null> {
  const client = await waitForConnection();
  const result = await client.request<WorkflowStatus>("cron.status", {});
  return result;
}

export async function getWorkflowRuns(id: string): Promise<WorkflowRun[]> {
  try {
    const client = await waitForConnection();
    const result = await client.request<{ entries?: WorkflowRun[] }>("cron.runs", {
      id,
      limit: 20,
    });
    return Array.isArray(result.entries) ? result.entries : [];
  } catch (error) {
    console.error("Failed to get workflow runs:", error);
    return [];
  }
}

/**
 * Check if workflows exist on the gateway.
 * Default workflows are seeded by Onboard Manager (Electron) before gateway starts,
 * so this is now a simple existence check — no client-side creation needed.
 * Returns existing workflows, or empty array on error.
 */
export async function seedDefaultWorkflows(): Promise<Workflow[]> {
  try {
    return await listWorkflows();
  } catch (err) {
    console.warn("[workflow-seed] Failed to list workflows:", err);
    return [];
  }
}
