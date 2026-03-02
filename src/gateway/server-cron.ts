import type { CliDeps } from "../cli/deps.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import { resolveAgentMainSessionKey } from "../config/sessions.js";
import { runCronIsolatedAgentTurn } from "../cron/isolated-agent.js";
import {
  appendCronRunLog,
  resolveCronRunLogPath,
  type CronRunLogActivity,
} from "../cron/run-log.js";
import { CronService } from "../cron/service.js";
import { resolveCronStorePath } from "../cron/store.js";
import { runHeartbeatOnce } from "../infra/heartbeat-runner.js";
import { requestHeartbeatNow } from "../infra/heartbeat-wake.js";
import { enqueueSystemEvent } from "../infra/system-events.js";
import { getChildLogger } from "../logging.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { defaultRuntime } from "../runtime.js";

export type GatewayCronState = {
  cron: CronService;
  storePath: string;
  cronEnabled: boolean;
};

export function buildGatewayCronService(params: {
  cfg: ReturnType<typeof loadConfig>;
  deps: CliDeps;
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void;
}): GatewayCronState {
  const cronLogger = getChildLogger({ module: "cron" });
  const storePath = resolveCronStorePath(params.cfg.cron?.store, params.cfg);
  const cronEnabled = process.env.OPENCLAW_SKIP_CRON !== "1" && params.cfg.cron?.enabled !== false;

  const resolveCronAgent = (requested?: string | null) => {
    const runtimeConfig = loadConfig();
    const normalized =
      typeof requested === "string" && requested.trim() ? normalizeAgentId(requested) : undefined;
    const hasAgent =
      normalized !== undefined &&
      Array.isArray(runtimeConfig.agents?.list) &&
      runtimeConfig.agents.list.some(
        (entry) =>
          entry && typeof entry.id === "string" && normalizeAgentId(entry.id) === normalized,
      );
    const agentId = hasAgent ? normalized : resolveDefaultAgentId(runtimeConfig);
    return { agentId, cfg: runtimeConfig };
  };

  // Track tool activities per running job so we can persist them in the run log.
  const jobActivities = new Map<
    string,
    Array<{
      id: string;
      name: string;
      detail?: string;
      startedAtMs: number;
      durationMs?: number;
      isError?: boolean;
    }>
  >();

  const cron = new CronService({
    storePath,
    cronEnabled,
    enqueueSystemEvent: (text, opts) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(opts?.agentId);
      const sessionKey = resolveAgentMainSessionKey({
        cfg: runtimeConfig,
        agentId,
      });
      enqueueSystemEvent(text, { sessionKey });
    },
    requestHeartbeatNow,
    runHeartbeatOnce: async (opts) => {
      const runtimeConfig = loadConfig();
      return await runHeartbeatOnce({
        cfg: runtimeConfig,
        reason: opts?.reason,
        deps: { ...params.deps, runtime: defaultRuntime },
      });
    },
    runIsolatedAgentJob: async ({ job, message, signal, onProgress, onActivity }) => {
      const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
      return await runCronIsolatedAgentTurn({
        cfg: runtimeConfig,
        deps: params.deps,
        job,
        message,
        signal,
        agentId,
        sessionKey: `cron:${job.id}`,
        lane: "cron",
        onProgress,
        onActivity,
      });
    },
    log: getChildLogger({ module: "cron", storePath }),
    onEvent: (evt) => {
      params.broadcast("cron", evt, { dropIfSlow: true });

      // Accumulate tool activities per running job
      if (evt.action === "started") {
        jobActivities.set(evt.jobId, []);
      } else if (evt.action === "activity" && evt.activity?.kind === "tool") {
        const list = jobActivities.get(evt.jobId);
        if (list && evt.activity.phase === "start") {
          list.push({
            id: evt.activity.id,
            name: evt.activity.name ?? "unknown",
            detail: evt.activity.detail,
            startedAtMs: Date.now(),
          });
        } else if (list && evt.activity.phase === "result") {
          const entry = list.find((a) => a.id === evt.activity!.id);
          if (entry) {
            entry.durationMs = Date.now() - entry.startedAtMs;
            entry.isError = evt.activity.isError;
          }
        }
      }

      if (evt.action === "finished") {
        // Collect accumulated activities for this run
        const rawActivities = jobActivities.get(evt.jobId) ?? [];
        jobActivities.delete(evt.jobId);
        const activities: CronRunLogActivity[] = rawActivities.map((a) => ({
          name: a.name,
          ...(a.detail ? { detail: a.detail } : {}),
          durationMs: a.durationMs ?? Math.max(0, Date.now() - a.startedAtMs),
          ...(a.isError ? { isError: true } : {}),
        }));

        const logPath = resolveCronRunLogPath({
          storePath,
          jobId: evt.jobId,
        });
        void appendCronRunLog(logPath, {
          ts: Date.now(),
          jobId: evt.jobId,
          action: "finished",
          status: evt.status,
          error: evt.error,
          summary: evt.summary,
          runAtMs: evt.runAtMs,
          durationMs: evt.durationMs,
          nextRunAtMs: evt.nextRunAtMs,
          ...(activities.length > 0 ? { activities } : {}),
        }).catch((err) => {
          cronLogger.warn({ err: String(err), logPath }, "cron: run log append failed");
        });
      }
    },
  });

  return { cron, storePath, cronEnabled };
}
