# Backend Cron Execution Pipeline Research

## Executive Summary
Agent Operis cron pipeline emits events at 3 key stages: job start, execution milestones (via isolated agent), and job finish. Progress milestones can be added within the isolated agent execution loop in `runCronIsolatedAgentTurn()` and propagated via the existing event emission chain.

---

## 1. Event Emission Architecture

### Flow: `emit()` → `onEvent()` → WebSocket broadcast

**timer.ts (Line 257-263):**
```typescript
export function emit(state: CronServiceState, evt: CronEvent) {
  try {
    state.deps.onEvent?.(evt);
  } catch {
    /* ignore */
  }
}
```

**server-cron.ts (Line 79-80):**
```typescript
onEvent: (evt) => {
  params.broadcast("cron", evt, { dropIfSlow: true });
  // ...
}
```

**Key:** CronEvents broadcast to WebSocket clients via `params.broadcast("cron", evt)`. All events use same channel and dropIfSlow flag.

---

## 2. Current Milestone Points

**timer.ts - Line 88** (Job started):
```typescript
emit(state, { jobId: job.id, action: "started", runAtMs: startedAt });
```

**timer.ts - Line 120-130** (Job finished):
```typescript
emit(state, {
  jobId: job.id,
  action: "finished",
  status,
  error: err,
  summary,
  runAtMs: startedAt,
  durationMs: job.state.lastDurationMs,
  nextRunAtMs: job.state.nextRunAtMs,
  usage,
});
```

---

## 3. Where to Add Progress Milestones

### Main Execution Loop: `runCronIsolatedAgentTurn()` (run.ts Line 110-519)

**Line 350-353:** Agent session registered
```typescript
registerAgentRunContext(cronSession.sessionEntry.sessionId, {
  sessionKey: agentSessionKey,
  verboseLevel: resolvedVerboseLevel,
});
```
→ **Milestone 1: "setup-completed"** — workspace/session ready

**Line 355-400:** Model fallback + agent execution
```typescript
const fallbackResult = await runWithModelFallback({
  // ... config
  run: (providerOverride, modelOverride) => {
    // Runs either CLI or embedded agent
  },
});
```
→ **Milestone 2: "execution-started"** — just before agent.run()
→ **Milestone 3: "execution-completed"** — after runResult received (Line 401)

**Line 408-420:** Usage calculation
```typescript
const rawUsage = runResult.payloads ?? [];
const cronUsage = hasNonzeroUsage(rawUsage) ? { ... } : undefined;
```
→ **Milestone 4: "usage-calculated"** — token metrics ready

**Line 472-516:** Delivery phase
```typescript
if (deliveryRequested && !skipHeartbeatDelivery && !skipMessagingToolDelivery) {
  // ... delivery logic
}
```
→ **Milestone 5: "delivery-completed"** — outbound payloads sent

---

## 4. Function Signature Changes Required

### In `timer.ts` - `executeJob()`

**Current signature (Line 79-84):**
```typescript
export async function executeJob(
  state: CronServiceState,
  job: CronJob,
  nowMs: number,
  opts: { forced: boolean },
)
```

**Required changes:**
- Pass job ID to isolated agent runner so milestones can be tagged
- Current: Line 198 calls `state.deps.runIsolatedAgentJob()` and awaits result
- Need to capture and emit intermediate events from isolated agent

### In `run.ts` - `runCronIsolatedAgentTurn()`

**Current signature (Line 110-118):**
```typescript
export async function runCronIsolatedAgentTurn(params: {
  cfg: OpenClawConfig;
  deps: CliDeps;
  job: CronJob;
  message: string;
  sessionKey: string;
  agentId?: string;
  lane?: string;
}): Promise<RunCronAgentTurnResult>
```

**Required changes:**
- Add optional `onMilestone?: (milestone: CronMilestone) => void` callback param
- Call callback at each milestone (setup, execution-start, execution-end, usage-calc, delivery-done)
- Each milestone emitted via callback gets broadcast in server-cron.ts

### In `server-cron.ts` - `buildGatewayCronService()`

**Current isolated agent runner (Line 66-77):**
```typescript
runIsolatedAgentJob: async ({ job, message }) => {
  const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
  return await runCronIsolatedAgentTurn({
    cfg: runtimeConfig,
    deps: params.deps,
    job,
    message,
    agentId,
    sessionKey: `cron:${job.id}`,
    lane: "cron",
  });
}
```

**Required changes:**
- Add `onMilestone` callback that emits via `params.broadcast("cron-milestone", milestone)`
- Or use same `broadcast("cron", milestone)` with extended CronEvent union type

---

## 5. CronEvent Type Extension

Current type (inferred from code):
```typescript
type CronEvent =
  | { jobId: string; action: "started"; runAtMs: number }
  | { jobId: string; action: "finished"; status: string; ... }
  | { jobId: string; action: "removed" }
```

**Proposed extension:**
```typescript
type CronEvent =
  | { jobId: string; action: "started"; runAtMs: number }
  | { jobId: string; action: "milestone"; milestone: string; timestamp?: number }
  | { jobId: string; action: "finished"; status: string; ... }
  | { jobId: string; action: "removed" }
```

---

## 6. Call Chain for Milestone Emission

1. **timer.ts executeJob()** → calls `state.deps.runIsolatedAgentJob()` (Line 198)
2. **server-cron.ts buildGatewayCronService()** → wraps call with onMilestone callback
3. **run.ts runCronIsolatedAgentTurn()** → invokes callback at each milestone
4. **server-cron.ts onEvent callback** → broadcasts milestone via WebSocket
5. **Client (frontend)** → receives event on "cron" channel and updates UI

---

## Implementation Roadmap

1. Extend `CronEvent` type to include milestone action
2. Add `onMilestone` param to `runCronIsolatedAgentTurn()` signature
3. Insert milestone callbacks in run.ts at 5 key points
4. Wrap isolated agent job call in server-cron.ts with onMilestone handler
5. Frontend listens to same "cron" WebSocket channel and renders milestones
6. Test with sample cron job and verify milestones appear in logs/UI

---

## Unresolved Questions
- Should milestone events use same "cron" broadcast channel or separate "cron-milestone" channel?
- Frontend consumption: Does existing WebSocket listener need extension or just parse new event action?
