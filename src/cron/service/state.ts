import type { HeartbeatRunResult } from "../../infra/heartbeat-wake.js";
import type { CronJob, CronJobCreate, CronJobPatch, CronStoreFile } from "../types.js";

export type CronProgressStep = "initializing" | "prompting" | "executing" | "delivering";

/** Live activity item from agent execution (tool call or assistant text). */
export type CronActivity = {
  kind: "tool" | "thinking";
  /** Unique id for tool calls (toolCallId); auto-generated for thinking. */
  id: string;
  /** Tool name (e.g. "read", "shell", "browser") — only for kind="tool". */
  name?: string;
  /** Phase of tool execution — only for kind="tool". */
  phase?: "start" | "result";
  /** Human-readable summary (e.g. file path, command snippet). */
  detail?: string;
  /** Whether the tool result was an error. */
  isError?: boolean;
};

export type CronEvent = {
  jobId: string;
  action: "added" | "updated" | "removed" | "started" | "finished" | "progress" | "activity";
  runAtMs?: number;
  durationMs?: number;
  status?: "ok" | "error" | "skipped";
  error?: string;
  summary?: string;
  nextRunAtMs?: number;
  /** Progress milestone step (only for action: "progress"). */
  step?: CronProgressStep;
  /** Human-readable detail for the progress step. */
  stepDetail?: string;
  /** Live activity from agent run (only for action: "activity"). */
  activity?: CronActivity;
  /** Token usage from isolated agent run (for analytics/billing). */
  usage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  };
  /** Model used for the agent run (e.g. "byteplus/kimi-k2.5"). */
  model?: string;
};

export type Logger = {
  debug: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export type CronServiceDeps = {
  nowMs?: () => number;
  log: Logger;
  storePath: string;
  cronEnabled: boolean;
  enqueueSystemEvent: (text: string, opts?: { agentId?: string }) => void;
  requestHeartbeatNow: (opts?: { reason?: string }) => void;
  runHeartbeatOnce?: (opts?: { reason?: string }) => Promise<HeartbeatRunResult>;
  runIsolatedAgentJob: (params: {
    job: CronJob;
    message: string;
    onProgress?: (step: CronProgressStep, detail?: string) => void;
    onActivity?: (activity: CronActivity) => void;
  }) => Promise<{
    status: "ok" | "error" | "skipped";
    summary?: string;
    /** Last non-empty agent text output (not truncated). */
    outputText?: string;
    error?: string;
    /** Token usage from the agent run (for analytics/billing). */
    usage?: {
      input: number;
      output: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
    };
  }>;
  onEvent?: (evt: CronEvent) => void;
};

export type CronServiceDepsInternal = Omit<CronServiceDeps, "nowMs"> & {
  nowMs: () => number;
};

export type CronServiceState = {
  deps: CronServiceDepsInternal;
  store: CronStoreFile | null;
  timer: NodeJS.Timeout | null;
  running: boolean;
  op: Promise<unknown>;
  warnedDisabled: boolean;
  storeLoadedAtMs: number | null;
  storeFileMtimeMs: number | null;
};

export function createCronServiceState(deps: CronServiceDeps): CronServiceState {
  return {
    deps: { ...deps, nowMs: deps.nowMs ?? (() => Date.now()) },
    store: null,
    timer: null,
    running: false,
    op: Promise.resolve(),
    warnedDisabled: false,
    storeLoadedAtMs: null,
    storeFileMtimeMs: null,
  };
}

export type CronRunMode = "due" | "force";
export type CronWakeMode = "now" | "next-heartbeat";

export type CronStatusSummary = {
  enabled: boolean;
  storePath: string;
  jobs: number;
  nextWakeAtMs: number | null;
};

export type CronRunResult =
  | { ok: true; ran: true }
  | { ok: true; ran: false; reason: "not-due" }
  | { ok: false };

export type CronRemoveResult = { ok: true; removed: boolean } | { ok: false; removed: false };

export type CronAddResult = CronJob;
export type CronUpdateResult = CronJob;

export type CronListResult = CronJob[];
export type CronAddInput = CronJobCreate;
export type CronUpdateInput = CronJobPatch;
