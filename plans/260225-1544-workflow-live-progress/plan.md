---
title: "Workflow Live Progress Milestones with Split Panel UI"
description: "Real-time cron execution milestones streamed via WebSocket + split panel workflow UI"
status: pending
priority: P2
effort: 7h
branch: Hung
tags: [cron, websocket, ui, lit, workflow, real-time]
created: 2026-02-25
---

# Workflow Live Progress Milestones with Split Panel UI

## Goal

Show real-time execution milestones (initializing / prompting / executing / delivering) while cron jobs run, and restructure the workflow tab into a split panel: compact card list on the left, live progress timeline or run history on the right.

## Architecture Summary

```
Backend:  run.ts  --onProgress-->  timer.ts  --emit-->  server-cron.ts  --broadcast("cron")-->  WS
Frontend: gateway-client.ts  --subscribeToCronEvents-->  app.ts  --progressMap prop-->  workflow views
```

Single new CronEvent action `"progress"` reuses existing broadcast channel. No persistence, no new WS channels.

## Phases

| # | Phase | File | Status | Effort |
|---|-------|------|--------|--------|
| 1 | [Backend Progress Events](./phase-01-backend-progress-events.md) | state.ts, run.ts, timer.ts, server-cron.ts | pending | 2h |
| 2a | [Frontend Module Extraction](./phase-02a-frontend-module-extraction.md) | workflow.ts → 8 sub-modules | pending | 2h |
| 2b | [Frontend Split Panel + Progress](./phase-02b-frontend-split-panel-progress.md) | workflow views, app.ts, gateway-client.ts | pending | 3h |

## Key Decisions

1. **Approach A** (extend CronEvent) chosen over separate WS channel — KISS, reuses existing infra
2. **4 milestones** (init, prompt, execute, deliver) — "thinking" would require hooking into agent streaming; deferred
3. **workflow.ts split into modules** — 1524 lines exceeds 200-line rule; extract rendering functions
4. **Progress state in app.ts** — ephemeral `Map<string, CronProgressState>`, passed as prop to workflow view
5. **Two-step frontend refactor** — Phase 2a extracts modules (no behavior change), Phase 2b adds features
6. **Always show 4 milestones** — "delivering" auto-marked done when "finished" arrives if skipped
7. **Multi-run: stay on current** — Don't auto-switch right panel when new workflow starts
8. **Keep toggle icon on compact cards** — Allows inline detail expansion alongside right panel

## Dependencies

- No new npm packages required
- No DB schema changes
- No API endpoint changes (CronEvent is WebSocket-only)

## Risk Summary

- **Low**: Backend changes are purely additive (new union member in CronEvent)
- **Medium**: Frontend refactor touches large workflow.ts — mitigated by extracting into sub-modules
- **Low**: `dropIfSlow: true` may skip intermediate milestones — acceptable for real-time-only display

## Validation Log

### Session 1 — 2026-02-25
**Trigger:** Initial plan validation after creation
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** Plan tách workflow.ts (1524 dòng) thành 8 module cùng lúc với tính năng mới. Đây là rủi ro cao — refactor lớn + tính năng mới. Nên tách thành 2 bước phụ không?
   - Options: Làm một lần (theo plan) | Hai bước (Recommended) | Tách tối thiểu
   - **Answer:** Hai bước (Recommended)
   - **Rationale:** Splitting reduces risk — Phase 2a extracts modules with zero behavior change (verifiable), Phase 2b adds new features on clean modular base. Rollback is easier if either step fails.

2. **[Assumptions]** Khi cronjob không có bước gửi kết quả (delivery), milestone 'delivering' sẽ không được emit. Timeline hiển thị thế nào?
   - Options: Luôn hiện 4 bước (Recommended) | Danh sách động | Hiện 3 bước, bỏ delivering
   - **Answer:** Luôn hiện 4 bước (Recommended)
   - **Rationale:** Consistent UI regardless of job configuration. When "finished" arrives without "delivering", auto-mark it done. Avoids backend complexity of pre-declaring expected steps.

3. **[Scope]** Khi nhiều workflow chạy đồng thời, plan tự chọn workflow đầu tiên. Nếu workflow thứ hai bắt đầu chạy thì sao?
   - Options: Giữ lựa chọn hiện tại (Recommended) | Tự chuyển sang mới nhất | Xếp chồng
   - **Answer:** Giữ lựa chọn hiện tại (Recommended)
   - **Rationale:** Less disruptive UX. Running indicator on cards gives user awareness of other running workflows. They click to switch manually.

4. **[Tradeoffs]** Card workflow hiện tại có phần mở rộng chi tiết. Plan loại bỏ phần này, chuyển sang panel phải. Chấp nhận mất chi tiết inline không?
   - Options: Bỏ chi tiết inline (theo plan) | Giữ nút mở rộng (Recommended) | Giữ card hiện tại
   - **Answer:** Giữ nút mở rộng (Recommended)
   - **Rationale:** Preserves existing UX while adding new right panel. Users can still expand inline details for quick reference without switching to the right panel.

#### Confirmed Decisions
- **Phase split**: Phase 2 → Phase 2a (module extraction) + Phase 2b (split panel + progress)
- **4 milestones always visible**: Auto-complete "delivering" on "finished" event
- **Multi-run selection**: Stay on current, don't auto-switch
- **Compact cards with toggle**: Keep expand icon for inline details

#### Action Items
- [x] Create phase-02a-frontend-module-extraction.md (extract from current phase-02)
- [x] Create phase-02b-frontend-split-panel-progress.md (new features only)
- [x] Update phase-02b: compact card keeps toggle icon for inline detail expansion
- [x] Update phase-02b: progress timeline always shows 4 milestones, auto-complete delivering on finished

#### Impact on Phases
- Phase 2: Split into Phase 2a (extract modules, no behavior change) and Phase 2b (add split panel + progress timeline)
- Phase 2b: Compact workflow card must keep a small toggle icon for inline detail expansion
- Phase 2b: Progress timeline renders all 4 milestones; on "finished" event without "delivering", auto-mark delivering as done

## Reports

- [Backend Cron Pipeline Research](./research/researcher-01-backend-cron-pipeline.md)
- [Frontend Workflow UI Research](./research/researcher-02-frontend-workflow-ui.md)
- [Brainstorm Notes](../reports/brainstorm-260225-1544-workflow-live-progress.md)
