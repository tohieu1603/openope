# Phase 2b: Frontend Split Panel + Progress Timeline

## Context Links

- [Plan Overview](./plan.md)
- [Phase 1: Backend Progress Events](./phase-01-backend-progress-events.md)
- [Phase 2a: Module Extraction](./phase-02a-frontend-module-extraction.md)
- [Frontend UI Research](./research/researcher-02-frontend-workflow-ui.md)

## Overview

- **Priority**: P2
- **Status**: pending
- **Effort**: ~3h
- **Description**: Add split panel layout (left: compact clickable cards with toggle, right: live progress timeline / run history), consume `action: "progress"` CronEvents, manage ephemeral progress state.

<!-- Updated: Validation Session 1 - Phase 2 split into 2a (extraction) + 2b (features) -->

## Key Insights

- Phase 2a provides clean modular base — this phase only adds new behavior
- `gateway-client.ts` CronEvent type (L343-359) must match backend Phase 1 changes
- `app.ts` `handleCronEvent()` (L448-460) currently only tracks `runningWorkflowIds` — extend with `progressMap`
- Progress state is ephemeral: `Map<string, CronProgressState>` in app.ts, cleared on `"finished"` event
- **Always show 4 milestones** — auto-mark "delivering" as done when "finished" arrives without it
- **Multi-run: stay on current selection** — don't auto-switch when new workflow starts
- **Keep toggle icon on compact cards** — inline detail expansion preserved alongside right panel

## Requirements

### Functional
- Handle `action: "progress"` in CronEvent with `step` and `stepDetail` fields
- Maintain `progressMap: Map<string, CronProgressState>` in app.ts, passed as prop
- Split panel layout: left = compact workflow cards with toggle icon, right = progress (running) or run history (idle)
- Progress timeline always shows 4 milestones with states: done / in-progress / pending
- When "finished" arrives without "delivering" having been emitted, auto-mark "delivering" as done
- Elapsed time counter while workflow is running
- Auto-select workflow when it starts running (only if nothing currently selected)
- Stay on current selection when another workflow starts

### Non-Functional
- Re-render only right panel on progress events (avoid O(n) card re-render)
- Keep existing CSS variable system (--card, --border, --accent, etc.)
- Each new file under 200 lines
- Lit HTML templates (no React)

## Architecture

### New Layout Structure

```
┌─────────────────────────────────────┐
│  Status Card  |  Create Form Card   │  ← top-grid (unchanged)
├──────────────┬──────────────────────┤
│  Workflow     │  Right Panel:        │  ← wf-split-panel (NEW)
│  List         │  - Progress timeline │
│  (compact     │    (when running)    │
│   cards with  │  - Run history       │
│   toggle ▼)   │    (when selected)   │
│               │  - Empty prompt      │
│               │    (when nothing)    │
└──────────────┴──────────────────────┘
```

### Data Flow

```
gateway-client.ts
  │ CronEvent { action: "progress", step, stepDetail, jobId }
  │
  ▼
app.ts handleCronEvent()
  │ Update progressMap: Map<jobId, CronProgressState>
  │ On "started": create entry (only auto-select if nothing selected)
  │ On "progress": append step
  │ On "finished": mark all remaining milestones done, clear after 5s
  │
  ▼
renderWorkflow(props)   ← props includes progressMap + selectedWorkflowId
  │
  ├── Left panel:  renderWorkflowCard() per workflow
  │                 - compact mode: name, schedule, status badge
  │                 - toggle icon to expand inline details
  │                 - click body → select → right panel update
  │
  └── Right panel: renderProgressTimeline(progress)
                    OR renderRunHistory(runs)
                    OR renderEmptyPanel()
```

## Related Code Files

### Files to Modify

| File | Changes |
|------|---------|
| `client-web/src/ui/gateway-client.ts` (L343-359) | Add `"progress"` to CronEvent.action, add `step?`/`stepDetail?` |
| `client-web/src/ui/workflow-types.ts` | Add `CronProgressStep`, `CronProgressState`, `PROGRESS_MILESTONES` |
| `client-web/src/ui/app.ts` (L217, L448-460, L2858) | Add `progressMap`/`selectedWorkflowId` state, extend `handleCronEvent` |
| `client-web/src/ui/views/workflow.ts` | Add split panel layout to orchestrator |
| `client-web/src/ui/views/workflow-card.ts` | Make compact with toggle icon for inline details |
| `client-web/src/ui/views/workflow-styles.ts` | Add split panel + progress timeline CSS |

### Files to Create

| File | Purpose |
|------|---------|
| `client-web/src/ui/views/workflow-progress-timeline.ts` | Live progress milestone timeline |

## Implementation Steps

### Step 1: Extend frontend CronEvent type (`gateway-client.ts`)

Add `"progress"` to action union, add `step?: CronProgressStep` and `stepDetail?: string` fields.

### Step 2: Add progress types (`workflow-types.ts`)

```typescript
export type CronProgressStep = "initializing" | "prompting" | "executing" | "delivering";

export type CronProgressState = {
  jobId: string;
  steps: CronProgressStep[];
  currentStep: CronProgressStep;
  detail?: string;
  startedAtMs: number;
  finishedAtMs?: number;
  status?: "ok" | "error" | "skipped";
};

export const PROGRESS_MILESTONES: { step: CronProgressStep; label: string }[] = [
  { step: "initializing", label: "Khởi tạo" },
  { step: "prompting", label: "Gửi prompt" },
  { step: "executing", label: "Xử lý kết quả" },
  { step: "delivering", label: "Gửi kết quả" },
];
```

### Step 3: Extend app.ts state and handleCronEvent

- Add `progressMap: Map<string, CronProgressState>` and `selectedWorkflowId: string | null`
- On `"started"`: create progress entry, auto-select only if `selectedWorkflowId` is null
- On `"progress"`: append step to existing entry
- On `"finished"`: auto-complete all remaining milestones (including "delivering" if missing), mark finished, clear after 5s
- Add 1s interval timer for elapsed time re-render while any workflow running

<!-- Updated: Validation Session 1 - Auto-complete delivering on finished, stay on current selection -->

### Step 4: Make workflow card compact with toggle (`workflow-card.ts`)

- Default: compact card showing name, schedule badge, status badge, run/toggle/delete actions
- Small toggle icon (▼/▲) to expand inline details (preserve existing expanded content)
- Click card body → select workflow → show in right panel
- Running indicator (pulse animation) on card
- Shrink icon from 48px to 36px
- Truncate prompt to single line in compact mode

<!-- Updated: Validation Session 1 - Keep toggle icon for inline details -->

### Step 5: Create progress timeline (`workflow-progress-timeline.ts`)

- Always render all 4 milestones from `PROGRESS_MILESTONES`
- States: ● done (green check), ◌ in-progress (animated pulse), ○ pending (gray)
- On finished: all milestones marked done regardless of which were actually emitted
- Show elapsed time per completed step (if available)
- Show total duration counter
- Status indicator on completion (success/error)

### Step 6: Add split panel CSS (`workflow-styles.ts`)

Add CSS for `.wf-split-panel`, `.wf-split-left`, `.wf-split-right`, progress timeline styles.
Responsive: single column under 900px.

### Step 7: Update workflow.ts orchestrator

- Import new `renderProgressTimeline` module
- Add split panel layout: left (cards), right (progress/history/empty)
- Pass new props: `progressMap`, `selectedWorkflowId`, `onSelectWorkflow`
- Right panel logic:
  - Selected + running → progress timeline
  - Selected + idle → run history
  - Nothing selected → empty prompt

### Step 8: Update app.ts prop passing

Pass `progressMap`, `selectedWorkflowId`, `onSelectWorkflow` handler to `renderWorkflow`.

### Step 9: Verify

- `cd client-web && pnpm build` — must compile cleanly
- Manual test: trigger cron run, verify milestones appear in right panel
- Test responsive layout (< 900px)

## Todo List

- [ ] Extend `CronEvent` type in `gateway-client.ts`
- [ ] Add `CronProgressStep`, `CronProgressState`, `PROGRESS_MILESTONES` to `workflow-types.ts`
- [ ] Add `progressMap`, `selectedWorkflowId` state to `app.ts`
- [ ] Extend `handleCronEvent` (auto-complete delivering on finished, stay on current)
- [ ] Add 1s timer for elapsed time re-render
- [ ] Make `workflow-card.ts` compact with toggle icon
- [ ] Create `workflow-progress-timeline.ts` (always 4 milestones)
- [ ] Add split panel + progress CSS to `workflow-styles.ts`
- [ ] Update `workflow.ts` orchestrator with split panel
- [ ] Pass new props from `app.ts` to `renderWorkflow`
- [ ] Verify Vite build
- [ ] Manual test: milestones, responsive layout

## Success Criteria

1. Split panel renders: left = compact clickable cards with toggle, right = progress or run history
2. Live milestones appear in right panel within 1-2s of backend emission
3. All 4 milestones always visible; auto-completed on "finished" if skipped
4. Elapsed time counter updates every second while running
5. Clicking card selects it, shows run history in right panel
6. Running workflows auto-selected only if nothing else selected
7. Toggle icon on cards expands inline details
8. No Vite/TypeScript compilation errors
9. Responsive: single column layout under 900px

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Missing milestone events (dropIfSlow) | Medium | Low | Always show 4 milestones, auto-complete on finished |
| 1s timer performance | Low | Low | Only active when workflows running; single requestUpdate() |
| Import cycle between modules | Low | Medium | Types in workflow-types.ts, helpers in workflow-helpers.ts |
| CSS specificity with new classes | Low | Medium | New classes prefixed with `wf-` to avoid conflicts |

## Security Considerations

- No new user input in progress timeline (display-only)
- `stepDetail` rendered as text (no innerHTML)
- No new API calls or auth changes
- Progress data ephemeral, never persisted

## Next Steps

- Manual end-to-end test: trigger cron, verify milestones in UI
- Future: add "thinking" sub-milestone (requires agent streaming hook)
- Future: persist last N progress snapshots for page-reload resilience
