# Phase 2a: Frontend Module Extraction

## Context Links

- [Plan Overview](./plan.md)
- [Phase 1: Backend Progress Events](./phase-01-backend-progress-events.md)
- [Phase 2b: Split Panel + Progress](./phase-02b-frontend-split-panel-progress.md)
- [Frontend UI Research](./research/researcher-02-frontend-workflow-ui.md)

## Overview

- **Priority**: P2
- **Status**: pending
- **Effort**: ~2h
- **Description**: Extract workflow.ts (1524 lines) into 7 focused sub-modules with ZERO behavior change. UI must look and function identically after extraction.

## Key Insights

- workflow.ts contains: `renderStatusCard` (L139-178), `renderScheduleFields` (L181-241), `renderFormCard` (L244-483), `renderWorkflowCard` (L484-686), `renderRunItem` (L689-705), `renderWorkflow` (L707-1524, ~700 lines CSS)
- CSS is ~710 lines inlined in `renderWorkflow` template literal — largest single extraction target
- All functions share `WorkflowProps` type and a few helper functions — clean dependency graph
- No circular dependency risk: helpers/types → components → orchestrator

## Requirements

### Functional
- Extract all rendering functions into separate files
- workflow.ts becomes orchestrator (imports + renders)
- All existing UI behavior preserved exactly
- All existing CSS preserved exactly

### Non-Functional
- Each file under 200 lines
- No new dependencies or packages
- Vite build must compile cleanly

## File Split Strategy

| New File | Contents | Est. Lines |
|----------|----------|------------|
| `workflow-helpers.ts` | `formatMs`, `formatRelativeTime`, `formatRelativeTimeFromNow`, `formatLastRun`, `formatNextWake`, constants (SCHEDULE_OPTIONS, etc.) | ~100 |
| `workflow-styles.ts` | All CSS as exported template string | ~200 |
| `workflow-status-card.ts` | `renderStatusCard()` | ~50 |
| `workflow-form-card.ts` | `renderFormCard()`, `renderScheduleFields()` | ~200 |
| `workflow-card.ts` | `renderWorkflowCard()` (current full version, not compact yet) | ~200 |
| `workflow-run-history.ts` | `renderRunItem()`, run history section | ~60 |
| `workflow.ts` | `renderWorkflow()` orchestrator, `WorkflowProps` type, imports | ~120 |

## Related Code Files

### Files to Modify

| File | Changes |
|------|---------|
| `client-web/src/ui/views/workflow.ts` | Extract functions, rewrite as orchestrator |

### Files to Create

| File | Purpose |
|------|---------|
| `client-web/src/ui/views/workflow-helpers.ts` | Shared formatters and constants |
| `client-web/src/ui/views/workflow-styles.ts` | Extracted CSS styles |
| `client-web/src/ui/views/workflow-status-card.ts` | Scheduler status card |
| `client-web/src/ui/views/workflow-form-card.ts` | Create/edit workflow form |
| `client-web/src/ui/views/workflow-card.ts` | Full workflow card |
| `client-web/src/ui/views/workflow-run-history.ts` | Run history rendering |

## Implementation Steps

### Step 1: Extract helpers (`workflow-helpers.ts`)

Move from workflow.ts:
- `formatMs()` (L43-51)
- `formatRelativeTime()` (L53-63)
- `formatRelativeTimeFromNow()` (L65-76)
- `formatLastRun()` (L78-84)
- `formatNextWake()` (L87-95)
- Constants: `SCHEDULE_OPTIONS`, `EVERY_UNIT_OPTIONS`, `SESSION_OPTIONS`, `WAKE_MODE_OPTIONS`, `PAYLOAD_OPTIONS`, `DELIVERY_MODE_OPTIONS`, `CHANNEL_OPTIONS` (L98-136)

Export all as named exports.

### Step 2: Extract CSS (`workflow-styles.ts`)

Move entire `<style>...</style>` block (L729-1438) into exported `workflowStyles` template.

### Step 3: Extract status card (`workflow-status-card.ts`)

Move `renderStatusCard()` (L139-178). Import `WorkflowProps` from workflow.ts, helpers from workflow-helpers.ts.

### Step 4: Extract form card (`workflow-form-card.ts`)

Move `renderFormCard()` (L244-483) + `renderScheduleFields()` (L181-241). Import types, helpers, constants.

### Step 5: Extract workflow card (`workflow-card.ts`)

Move `renderWorkflowCard()` (L484-686). Keep current full version — compactification happens in Phase 2b.

### Step 6: Extract run history (`workflow-run-history.ts`)

Move `renderRunItem()` (L689-705) + run history section from renderWorkflow.

### Step 7: Rewrite workflow.ts as orchestrator

Import all sub-modules. Keep `WorkflowProps` type definition. Render same layout as before using imported functions.

### Step 8: Verify

- Run `cd client-web && pnpm build` — must compile cleanly
- Visual inspection: UI must look identical to before extraction

## Todo List

- [ ] Extract `workflow-helpers.ts` (formatters + constants)
- [ ] Extract `workflow-styles.ts` (CSS)
- [ ] Extract `workflow-status-card.ts`
- [ ] Extract `workflow-form-card.ts`
- [ ] Extract `workflow-card.ts`
- [ ] Extract `workflow-run-history.ts`
- [ ] Rewrite `workflow.ts` as orchestrator
- [ ] Verify Vite build compiles cleanly
- [ ] Visual check: UI identical to before

## Success Criteria

1. All extracted files under 200 lines
2. No Vite/TypeScript compilation errors
3. UI looks and behaves identically to before extraction
4. No circular import dependencies
5. workflow.ts reduced to ~120 lines (orchestrator only)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CSS specificity breaks | Low | Medium | CSS stays in single `<style>` block rendered by orchestrator |
| Import path errors | Low | Low | Vite build catches immediately |
| Missing export/import | Medium | Low | TypeScript compiler catches at build time |
| Subtle behavior difference | Low | Medium | Manual UI comparison before/after |

## Security Considerations

- No new functionality, pure code reorganization
- No new user inputs or API calls

## Next Steps

- Phase 2b: Add split panel layout, compact cards, progress timeline on the extracted module base
