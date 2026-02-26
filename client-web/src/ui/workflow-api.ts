import type { Workflow, WorkflowFormState } from "./workflow-types";
// Workflow API service - communicates with Gateway via WebSocket RPC
import { waitForConnection } from "./gateway-client";
import { WORKFLOW_PRESETS } from "./workflow-presets";
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
    await client.request("cron.run", { id, mode: "force" }, 600_000);
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

const SEED_STORAGE_KEY = "operis_workflows_seeded";

/**
 * Auto-seed default workflow presets if no workflows exist.
 * Only runs once per browser (tracked via localStorage).
 * Returns the seeded workflows, or empty array if skipped.
 */
export async function seedDefaultWorkflows(): Promise<Workflow[]> {
  // Skip if already seeded in this browser
  if (localStorage.getItem(SEED_STORAGE_KEY)) return [];

  try {
    const existing = await listWorkflows();
    if (existing.length > 0) {
      // Workflows already exist — mark as seeded and skip
      localStorage.setItem(SEED_STORAGE_KEY, Date.now().toString());
      return [];
    }

    console.log(
      `[workflow-seed] No workflows found, seeding ${WORKFLOW_PRESETS.length} presets...`,
    );

    for (const preset of WORKFLOW_PRESETS) {
      const form: WorkflowFormState = {
        ...preset,
        atDatetime: preset.atDatetime ?? "",
      };
      try {
        await createWorkflow(form);
        console.log(`[workflow-seed] Created: ${preset.name}`);
      } catch (err) {
        console.warn(`[workflow-seed] Failed to create "${preset.name}":`, err);
      }
    }

    localStorage.setItem(SEED_STORAGE_KEY, Date.now().toString());

    // Return fresh list
    return listWorkflows();
  } catch (err) {
    console.warn("[workflow-seed] Seed failed:", err);
    return [];
  }
}
