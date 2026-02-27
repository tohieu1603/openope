# Frontend Workflow UI Architecture Research

## Current Event Handling Flow

### WebSocket Event Reception (gateway-client.ts lines 390-430)
**Pattern**: Pub/Sub with unsubscribe cleanup functions

```
GatewayClient.onEvent() → notifyCronListeners() → listener callbacks
```

- **CronEventListener**: `(event: CronEvent) => void` callbacks stored in `Set<CronEventListener>`
- **subscribeToCronEvents()**: Returns cleanup function via Set deletion
- **notifyCronListeners()**: Iterates Set with try/catch per listener (error isolation)
- No duplicate subscription guards → multiple subscriptions possible if not cleaned up

### Event Flow in App Component (app.ts lines 420-460)
**Two subscription points** (potential redundancy):

1. **Constructor** (line 420): Initial subscription with cleanup stored
2. **startGatewayServices()** (line 655): Re-subscribe if unsubscribe nullified

**Action Handling** (app.ts line 448-456):
- `action === "started"` → Add to `runningWorkflowIds` Set
- `action === "finished"` → Remove from Set, trigger full workflow refresh
- No granular progress tracking yet

### CronEvent Type Definition (from gateway-client.ts)
Expected structure (inferred from code):
```typescript
interface CronEvent {
  action: "started" | "finished" | /* others? */;
  jobId: string;
  timestamp?: number;
  progress?: number; // Not currently used
  details?: { /* ... */ };
}
```

**Gap**: No progress/status granularity between start and finish.

## Types That Need Extension

### WorkflowProps (workflow.ts lines 17-40)
Current state properties:
- `runningWorkflowIds: Set<string>` — Coarse-grained only
- `loading`, `saving` — Boolean flags only
- `runs?: WorkflowRun[]` — Only historical data, not live progress

**Needed additions**:
```typescript
type WorkflowProgress = {
  workflowId: string;
  status: "queued" | "running" | "processing" | "completed";
  progress?: { current: number; total: number };
  message?: string;
  startedAt: number;
};

// Extend WorkflowProps
progressMap?: Map<string, WorkflowProgress>; // Per-workflow live status
```

### Workflow Type (workflow-types.ts)
Current: Static snapshot without execution state

**Needed**: Runtime state container separate from config
```typescript
type WorkflowExecutionState = {
  id: string;
  status: "idle" | "queued" | "running" | "completed" | "error";
  progress: { step: number; total: number };
  message: string;
  startMs: number;
  endMs?: number;
};
```

## Progress State Management Strategy

**Current**: Full re-render on workflow list fetch (expensive)

**Proposed**:
1. **Event-driven updates**: CronEvent directly mutates UI state
2. **Render on progress**: Only re-render affected workflow card
3. **Progress panel**: Separate right panel subscribed to live events

**Key insight**: Keep progress state in app.ts, pass as `Map<jobId, ProgressState>` to WorkflowProps. Avoids full API refetch on each event.

## Lit Re-render Behavior

### Current Flow
- **Trigger**: `requestUpdate()` in `handleCronEvent()`
- **Scope**: Full template re-render via `renderWorkflow(props)`
- **Efficiency**: All cards re-check `runningWorkflowIds.has(id)` on every event

### Optimization Points
1. **Selective card re-render**: Only update cards with changed state
2. **Progress display**: New right panel can observe `progressMap` independently
3. **Virtual scrolling**: For large workflow lists (future)

### Current Data Flow
```
app.ts state → renderWorkflow(props) → renderWorkflowCard()
                                     → renderStatusCard()
                                     → renderFormCard()
                                     → renderRunItem()
```

**Re-render cost**: O(n) cards * O(m) form fields per CronEvent

## Implementation Hooks

### Event Handler (app.ts line 420-456)
Extend `handleCronEvent()` to:
- Extract progress metrics from CronEvent
- Update `progressMap` instead of just `runningWorkflowIds`
- Emit fine-grained updates

### Subscription Management (app.ts lines 654-680)
Ensure single active subscription; prevent double-subscribe in `startGatewayServices()`.

### Right Panel Component
New component to render:
- Live progress bar per workflow
- Status timeline
- Detailed logs (if available in CronEvent)
- Independent of left card list

### CronEvent Mutation in Gateway
If CronEvent lacks granular progress, extend payload:
- `step: number` (current progress)
- `total: number` (steps to completion)
- `metadata?: Record<string, unknown>` (extensible)

## Critical Findings

1. **No granular progress events yet** — Only "started"/"finished" exists
2. **Memory leak risk** — Double subscription in startGatewayServices if first unsubscribe nullified
3. **Full re-render on every event** — O(n) cards recalculated; can optimize to O(1) with split panel
4. **No persistent progress state** — Lost on page refresh; consider IndexedDB for running jobs
5. **Workflow.ts event type missing** — gateway-client exports CronEvent but workflow-types doesn't import

## Unresolved Questions

- Does CronEvent contain step/progress metadata beyond action + jobId?
- Should progress be persisted across page reloads?
- What's the expected max concurrent workflows for performance budgeting?
- Should progress panel auto-refresh on background tab or pause?
