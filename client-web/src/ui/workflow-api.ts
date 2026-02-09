// Workflow API service - communicates with Gateway via WebSocket RPC
import { waitForConnection } from "./gateway-client";
import type { Workflow, WorkflowFormState } from "./workflow-types";
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

export type WorkflowRun = {
  ts: number;
  status: string;
  summary?: string;
  durationMs?: number;
  error?: string;
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
    const result = await client.request<{ entries?: WorkflowRun[] }>("cron.runs", { id, limit: 20 });
    return Array.isArray(result.entries) ? result.entries : [];
  } catch (error) {
    console.error("Failed to get workflow runs:", error);
    return [];
  }
}
