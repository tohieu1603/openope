# Phase 1: Backend Progress Events

## Context Links

- [Plan Overview](./plan.md)
- [Backend Research](./research/researcher-01-backend-cron-pipeline.md)
- [Brainstorm](../reports/brainstorm-260225-1544-workflow-live-progress.md)

## Overview

- **Priority**: P2
- **Status**: pending
- **Effort**: ~2h
- **Description**: Add `action: "progress"` to CronEvent with 4 milestones emitted during `runCronIsolatedAgentTurn()`, propagated via existing `emit()` -> `broadcast("cron")` chain.

## Key Insights

- Existing event flow: `emit(state, evt)` -> `state.deps.onEvent(evt)` -> `params.broadcast("cron", evt, { dropIfSlow: true })`
- `runIsolatedAgentJob` in `CronServiceDeps` currently accepts `{ job, message }` — needs `onProgress` callback
- `runCronIsolatedAgentTurn` is a single async function (519 lines) — milestones inserted at 4 strategic points
- `server-cron.ts` wraps `runIsolatedAgentJob` and already has access to `params.broadcast` — natural place to wire callback
- `dropIfSlow: true` means slow clients may miss intermediate milestones; acceptable since progress is ephemeral

## Requirements

### Functional
- Emit `CronProgressStep` milestones: `"initializing"`, `"prompting"`, `"executing"`, `"delivering"`
- Each milestone broadcast as `CronEvent { jobId, action: "progress", step, stepDetail? }`
- Only emitted for `isolated` session jobs (main-session jobs skip milestones)
- `"delivering"` only emitted when delivery is requested

### Non-Functional
- Zero performance overhead when no WS clients are listening (`onEvent` is try/catch-ignored)
- No persistence of progress events
- Backward compatible — existing `"started"` / `"finished"` events unchanged

## Architecture

```
runCronIsolatedAgentTurn(params)
  │
  ├─ params.onProgress?.("initializing")     ← after session registration (line ~353)
  ├─ params.onProgress?.("prompting")         ← before runWithModelFallback (line ~355)
  ├─ params.onProgress?.("executing")         ← after runResult received (line ~401)
  ├─ params.onProgress?.("delivering")        ← before deliverOutboundPayloads (line ~472)
  │
  └─ return result

timer.ts executeJob()
  │
  └─ state.deps.runIsolatedAgentJob({ job, message, onProgress })
       │
       └─ onProgress = (step, detail) => emit(state, { jobId, action: "progress", step, stepDetail: detail })

server-cron.ts buildGatewayCronService()
  │
  └─ runIsolatedAgentJob: async ({ job, message, onProgress }) => {
       return runCronIsolatedAgentTurn({ ...params, onProgress });
     }
```

## Related Code Files

### Files to Modify

| File | Lines | Changes |
|------|-------|---------|
| `src/cron/service/state.ts` | 4-21, 38-52 | Add `CronProgressStep` type, extend `CronEvent` union, add `onProgress` to `runIsolatedAgentJob` params |
| `src/cron/isolated-agent/run.ts` | 110-118, ~353, ~355, ~401, ~472 | Add `onProgress?` param, emit 4 milestones |
| `src/cron/service/timer.ts` | 198-201 | Pass `onProgress` callback to `runIsolatedAgentJob` |
| `src/gateway/server-cron.ts` | 66-77 | Forward `onProgress` from deps to `runCronIsolatedAgentTurn` |

### Files Unchanged
- `src/cron/isolated-agent.ts` — barrel re-export, no signature change needed (params object)
- `src/cron/run-log.ts` — only logs `"finished"` events, skip `"progress"`

## Implementation Steps

### Step 1: Extend CronEvent type and add CronProgressStep (`src/cron/service/state.ts`)

**1a.** Add `CronProgressStep` type export before `CronEvent`:

```typescript
export type CronProgressStep = "initializing" | "prompting" | "executing" | "delivering";
```

**1b.** Extend `CronEvent.action` union at line 6:

```typescript
// Before:
action: "added" | "updated" | "removed" | "started" | "finished";

// After:
action: "added" | "updated" | "removed" | "started" | "finished" | "progress";
```

**1c.** Add optional `step` and `stepDetail` fields to `CronEvent` (after line 10):

```typescript
/** Progress milestone step (only for action: "progress"). */
step?: CronProgressStep;
/** Human-readable detail for the progress step. */
stepDetail?: string;
```

**1d.** Extend `runIsolatedAgentJob` params in `CronServiceDeps` (line 38):

```typescript
// Before:
runIsolatedAgentJob: (params: { job: CronJob; message: string }) => Promise<{...}>;

// After:
runIsolatedAgentJob: (params: {
  job: CronJob;
  message: string;
  onProgress?: (step: CronProgressStep, detail?: string) => void;
}) => Promise<{...}>;
```

### Step 2: Add onProgress param to runCronIsolatedAgentTurn (`src/cron/isolated-agent/run.ts`)

**2a.** Import `CronProgressStep` at top of file:

```typescript
import type { CronProgressStep } from "../service/state.js";
```

**2b.** Add `onProgress?` to the params object (line ~117, before closing `}`):

```typescript
export async function runCronIsolatedAgentTurn(params: {
  cfg: OpenClawConfig;
  deps: CliDeps;
  job: CronJob;
  message: string;
  sessionKey: string;
  agentId?: string;
  lane?: string;
  onProgress?: (step: CronProgressStep, detail?: string) => void;  // NEW
}): Promise<RunCronAgentTurnResult> {
```

**2c.** Emit `"initializing"` after session registration (after line 353 — `registerAgentRunContext` call):

```typescript
registerAgentRunContext(cronSession.sessionEntry.sessionId, {
  sessionKey: agentSessionKey,
  verboseLevel: resolvedVerboseLevel,
});
params.onProgress?.("initializing", "Session & model resolved");
```

**2d.** Emit `"prompting"` before `runWithModelFallback` (before line 355):

```typescript
params.onProgress?.("prompting", `${provider}/${model}`);
const fallbackResult = await runWithModelFallback({
```

**2e.** Emit `"executing"` after `runResult` is assigned (after line 403):

```typescript
fallbackModel = fallbackResult.model;
params.onProgress?.("executing", "Processing agent response");
```

**2f.** Emit `"delivering"` before delivery block (before line 472):

```typescript
if (deliveryRequested && !skipHeartbeatDelivery && !skipMessagingToolDelivery) {
  params.onProgress?.("delivering", `${resolvedDelivery.channel}`);
```

### Step 3: Pass onProgress in timer.ts (`src/cron/service/timer.ts`)

**3a.** At line 198, pass `onProgress` callback when calling `runIsolatedAgentJob`:

```typescript
// Before:
const res = await state.deps.runIsolatedAgentJob({
  job,
  message: job.payload.message,
});

// After:
const res = await state.deps.runIsolatedAgentJob({
  job,
  message: job.payload.message,
  onProgress: (step, detail) => {
    emit(state, { jobId: job.id, action: "progress", step, stepDetail: detail });
  },
});
```

### Step 4: Forward onProgress in server-cron.ts (`src/gateway/server-cron.ts`)

**4a.** Update `runIsolatedAgentJob` lambda to accept and forward `onProgress` (line 66-77):

```typescript
// Before:
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

// After:
runIsolatedAgentJob: async ({ job, message, onProgress }) => {
  const { agentId, cfg: runtimeConfig } = resolveCronAgent(job.agentId);
  return await runCronIsolatedAgentTurn({
    cfg: runtimeConfig,
    deps: params.deps,
    job,
    message,
    agentId,
    sessionKey: `cron:${job.id}`,
    lane: "cron",
    onProgress,
  });
}
```

## Todo List

- [ ] Add `CronProgressStep` type to `state.ts`
- [ ] Extend `CronEvent.action` union with `"progress"`, add `step` + `stepDetail` fields
- [ ] Add `onProgress` to `runIsolatedAgentJob` params type in `CronServiceDeps`
- [ ] Add `onProgress` param + `CronProgressStep` import to `runCronIsolatedAgentTurn`
- [ ] Emit `"initializing"` after `registerAgentRunContext` (line ~353)
- [ ] Emit `"prompting"` before `runWithModelFallback` (line ~355)
- [ ] Emit `"executing"` after `runResult` assigned (line ~403)
- [ ] Emit `"delivering"` at top of delivery block (line ~472)
- [ ] Pass `onProgress` callback in `timer.ts` `executeJob()` (line ~198)
- [ ] Forward `onProgress` in `server-cron.ts` `runIsolatedAgentJob` (line ~66)
- [ ] Run `tsdown` build to verify compilation
- [ ] Manual test: trigger cron run, verify progress events in WS client

## Success Criteria

1. `CronEvent` with `action: "progress"` and valid `step` is broadcast for each milestone during isolated agent runs
2. Existing `"started"` and `"finished"` events are unchanged and still work
3. No TypeScript compilation errors
4. Main-session cron jobs do not emit progress events (no `onProgress` passed for that path)
5. Progress events carry correct `jobId` matching the running job

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `dropIfSlow` skips milestones | Medium | Low | Ephemeral display only; client handles missing steps gracefully |
| Type widening breaks existing event handlers | Low | Medium | Union extension is backward-compatible; existing handlers ignore unknown actions |
| Milestone emitted after error | Low | Low | `onProgress` calls are before the fallible operations, not after |

## Security Considerations

- No new user input accepted; milestones are hardcoded strings
- `stepDetail` contains model name or channel info already visible to authenticated users
- No new API endpoints or permissions required

## Next Steps

- Phase 2: Frontend Split Panel UI — consume `action: "progress"` events and render milestones
