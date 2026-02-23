# Rename OpenClaw → Operis

**Date:** 2026-02-23
**Status:** pending
**Goal:** Users don't see "openclaw" anywhere after installing the Electron app

---

## Phases

| # | Phase | Status | Risk |
|---|-------|--------|------|
| 1 | Chrome Extension branding | pending | LOW |
| 2 | Config path `~/.openclaw/` → `~/.operis/` | pending | MEDIUM |

---

## Phase 1: Chrome Extension Branding

**Files:** `assets/chrome-extension/` (4 files)
**Details:** [phase-01-chrome-extension.md](phase-01-chrome-extension.md)

## Phase 2: Config Path Rename

**Files:** Gateway source (`src/config/paths.ts` + 20 hardcoded refs) + Electron (`apps/windows-desktop/`)
**Details:** [phase-02-config-path.md](phase-02-config-path.md)

---

## Out of Scope
- Package names (`@openclaw/*`) — internal, not user-visible
- Import paths (`openclaw/plugin-sdk`) — internal
- Env var names (`OPENCLAW_*`) — internal, not user-visible
- Skill source labels (`openclaw-bundled` etc.) — internal IDs
- macOS/iOS/Android apps — separate platforms, not in current build
- Docker/deployment configs — server-side, not end-user
