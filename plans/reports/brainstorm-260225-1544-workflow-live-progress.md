# Brainstorm: Workflow Live Progress Milestones

## Problem Statement

Cronjob workflow hiện chỉ hiển thị kết quả cuối cùng (summary + status) sau khi chạy xong. User muốn thấy **tiến trình real-time** qua các mốc (milestones) khi cronjob đang chạy, kết hợp với giao diện **split panel** mới cho tab Workflow.

## Requirements

1. **Real-time milestones**: Hiển thị các bước tổng quát khi cron đang chạy
   - `initializing` → `prompting` → `thinking` → `executing` → `delivering` → `done`
2. **Split panel UI**: Trái = danh sách workflow, Phải = live progress hoặc lịch sử runs
3. **No persistence**: Chỉ stream real-time, không lưu steps vào disk
4. **Run history**: Panel phải hiện lịch sử runs khi không có cron đang chạy

## Current Architecture

```
CronService.runJob()
  → runCronIsolatedAgentTurn()
    → resolveSession, resolveModel, buildPrompt
    → runEmbeddedPiAgent() / runCliAgent()
    → deliverOutboundPayloads()
    → return { status, summary, outputText, usage }
  → emit CronEvent { action: "started" }
  → emit CronEvent { action: "finished", summary, usage }
  → broadcast("cron", evt) → WebSocket → Client
```

Key files:
- `src/cron/service/state.ts` — CronEvent type
- `src/cron/service/timer.ts` — emit() + runJobTick()
- `src/cron/isolated-agent/run.ts` — runCronIsolatedAgentTurn()
- `src/gateway/server-cron.ts` — WebSocket broadcast
- `client-web/src/ui/views/workflow.ts` — UI (1525 lines)
- `client-web/src/ui/gateway-client.ts` — subscribeToCronEvents()

## Evaluated Approaches

### Approach A: Extend CronEvent with `progress` action (Recommended)

Add `action: "progress"` + `step` field to existing CronEvent. Emit at each milestone inside `runCronIsolatedAgentTurn()`.

**Pros:**
- Minimal backend changes — reuse existing broadcast infrastructure
- Client already subscribes to CronEvents — just handle new action
- KISS: one event type, one subscription, one handler

**Cons:**
- CronEvent type grows slightly

### Approach B: Separate WebSocket channel `cron:progress`

Create new event type, new broadcast channel, new client subscription.

**Pros:**
- Clean separation of concerns

**Cons:**
- More plumbing: new types, new broadcast, new subscription
- Violates YAGNI — same data, different pipe
- More client-side code to maintain

### Approach C: Piggyback on agent event system

Use `registerAgentRunContext` and internal agent event broadcasting.

**Pros:**
- Reuse existing infrastructure

**Cons:**
- Tighter coupling between cron and agent internals
- Agent events are session-scoped, not job-scoped
- Harder to map events back to cron job ID on client

## Recommended Solution: Approach A

### Backend Changes

#### 1. Extend CronEvent type (`src/cron/service/state.ts`)

```typescript
export type CronProgressStep =
  | "initializing"
  | "prompting"
  | "thinking"
  | "executing"
  | "delivering";

export type CronEvent = {
  jobId: string;
  action: "added" | "updated" | "removed" | "started" | "finished" | "progress";
  step?: CronProgressStep;    // only for action: "progress"
  stepDetail?: string;        // optional human-readable detail
  // ... existing fields
};
```

#### 2. Add progress callback to runCronIsolatedAgentTurn (`src/cron/isolated-agent/run.ts`)

```typescript
export async function runCronIsolatedAgentTurn(params: {
  // ... existing params
  onProgress?: (step: CronProgressStep, detail?: string) => void;
}): Promise<RunCronAgentTurnResult> {
  params.onProgress?.("initializing", "Resolving session & model");
  // ... session setup, model resolution ...

  params.onProgress?.("prompting", "Sending prompt to LLM");
  // ... before runEmbeddedPiAgent ...

  // After LLM returns:
  params.onProgress?.("executing", "Processing agent response");
  // ... payload processing ...

  if (deliveryRequested) {
    params.onProgress?.("delivering", "Sending delivery");
  }
  // return result
}
```

#### 3. Wire callback in timer.ts (`src/cron/service/timer.ts`)

```typescript
// Inside runJobTick, pass onProgress to runIsolatedAgentJob:
const result = await state.deps.runIsolatedAgentJob({
  job, message,
  onProgress: (step, detail) => {
    emit(state, { jobId: job.id, action: "progress", step, stepDetail: detail });
  }
});
```

#### 4. Propagate through CronServiceDeps

Add `onProgress` to `runIsolatedAgentJob` params type in state.ts.

### Frontend Changes

#### 1. Split panel layout (`workflow.ts`)

```
┌─────────────────────────────────┐
│  Scheduler Status + Form (top)  │
├──────────────┬──────────────────┤
│  Workflow     │  Live Progress   │
│  List         │  (when running)  │
│  (compact     │  ────────────── │
│   cards)      │  Run History     │
│               │  (when idle)     │
└──────────────┴──────────────────┘
```

#### 2. Progress timeline component

When a workflow is running, right panel shows:
```
┌─ Workflow: "Báo cáo sáng" ────────────────┐
│                                             │
│  ● Initializing    ✓  0.2s                 │
│  ● Prompting       ✓  0.1s                 │
│  ● Thinking        ◌  (đang chạy...)       │
│  ○ Executing                                │
│  ○ Delivering                               │
│                                             │
│  Duration: 12.3s                            │
└─────────────────────────────────────────────┘
```

Legend: `●` = done, `◌` = in progress (animated), `○` = pending

#### 3. State management in gateway-client.ts

```typescript
// In-memory map of running job progress
const cronProgressMap = new Map<string, CronProgressStep[]>();

// On CronEvent:
// - action "started": clear progress, add entry
// - action "progress": append step
// - action "finished": mark complete, clear after delay
```

#### 4. Run history (right panel when idle)

Reuse existing `renderRunItem()` but move to right panel. Click a workflow card on left → show its history on right.

### Data Flow

```
runCronIsolatedAgentTurn()
  → onProgress("initializing")
    → emit(state, { jobId, action: "progress", step: "initializing" })
      → broadcast("cron", evt, { dropIfSlow: true })
        → WebSocket → subscribeToCronEvents(listener)
          → cronProgressMap.set(jobId, [...steps, "initializing"])
            → re-render right panel with updated milestones
```

## Implementation Considerations

1. **dropIfSlow**: Progress events use same `dropIfSlow: true` — if client is slow, intermediate steps may be skipped. This is acceptable since it's real-time only.

2. **Multiple concurrent crons**: If 2+ crons run simultaneously, right panel should show the one user selected (or the most recent started).

3. **Thinking step timing**: Can't easily know when LLM is "thinking" vs "executing tools" because `runEmbeddedPiAgent` is a single async call. The milestones will be:
   - `initializing`: before model resolution
   - `prompting`: just before calling `runEmbeddedPiAgent`/`runCliAgent`
   - `executing`: after the agent call returns (processing payloads)
   - `delivering`: before delivery (if applicable)

   Note: `thinking` step is a sub-phase of `prompting` — it happens inside the LLM call. To show it separately, we'd need to hook into the agent's streaming callbacks, which is more complex. **Recommendation**: Start with 4 milestones (init → prompt → execute → deliver), add thinking later if needed.

4. **Compact workflow cards**: Left panel needs more compact cards than current full cards. Remove expanded details, keep: name, status, schedule, last run indicator.

## Risk Assessment

- **Low risk**: Backend changes are additive (new event action), no breaking changes
- **Medium risk**: UI refactor (split panel) touches ~1500 lines of workflow.ts
- **Mitigation**: Keep existing `renderRunItem` and card rendering, wrap in new layout

## Success Metrics

- User can see which milestone a running cron is at in real-time
- Progress updates appear within 1-2s of each milestone
- Left panel shows all workflows compactly
- Right panel shows live progress when running, history when idle
- No disk space impact (real-time only, no persistence)

## Next Steps

1. Backend: Add `CronProgressStep` type + `action: "progress"` to CronEvent
2. Backend: Add `onProgress` callback plumbing from timer → run
3. Backend: Emit progress at 4 milestones in `runCronIsolatedAgentTurn`
4. Frontend: Refactor workflow.ts to split panel layout
5. Frontend: Add progress timeline component for right panel
6. Frontend: Move run history to right panel (click-to-select)
7. Test: Trigger manual cron run, verify milestones stream to UI
