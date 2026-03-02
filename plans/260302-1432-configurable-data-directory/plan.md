---
title: "Configurable OperisAgent User Data Directory"
description: "Split user-facing dirs (workspace, skills, cron) into configurable OperisAgent/ folder, defaulting to Desktop. Keep .operis for internal state."
status: done
priority: P1
effort: 12h
branch: Hung
tags: [config, paths, migration, refactor, nsis, ui]
created: 2026-03-02
---

# Configurable OperisAgent User Data Directory

## Goal

Split user-facing directories (workspace, managed skills, cron) from internal state (`.operis/`) into a configurable `OperisAgent/` folder (default: `~/Desktop/OperisAgent/`). Users can choose location during NSIS install. Fix hardcoded paths and merge CONFIG_DIR duplication.

## Architecture: Split State Model

```
~/.operis/                     # INTERNAL STATE (kept as-is)
├── operis.json                # Config + userDataDir pointer
├── credentials/
├── agents/{id}/sessions/      # Sessions stay internal
├── hooks/                     # Managed hooks
├── plugins/
└── logs/

~/Desktop/OperisAgent/         # USER DATA (configurable via userDataDir)
├── workspace/                 # AGENTS.md, SOUL.md, hooks/, skills/
├── skills/                    # Managed skills
└── cron/                      # jobs.json
```

**Key config field:** `userDataDir` in `operis.json` — points to OperisAgent/ location.

**STATE_DIR stays unchanged** — `.operis/` is always the internal state dir. No chicken-and-egg problem because config stays in `.operis/`.

## Phases

| # | Phase | Effort | Status | Risk |
|---|-------|--------|--------|------|
| 1 | [Fix hardcoded paths & merge CONFIG_DIR](./phase-01-fix-hardcoded-merge-configdir.md) | 1.5h | done | Low |
| 2 | [Add `userDataDir` config & path resolution](./phase-02-datadir-config-resolve.md) | 3h | done | Medium |
| 3 | [Auto-migration of user data](./phase-03-auto-migration.md) | 2.5h | done | Medium |
| 4 | [Gateway API for userDataDir changes](./phase-04-api-endpoint.md) | 1h | done | Low |
| 5 | [NSIS installer userDataDir picker](./phase-05-nsis-installer-datadir.md) | 2h | done | Low |
| 6 | [Client-web Settings UI for userDataDir](./phase-06-client-web-settings-ui.md) | 2h | done | Low |

## Key Dependencies

- Phase 1 → Phase 2 (hardcoded paths must route through canonical functions first)
- Phase 2 → Phase 3 (migration needs resolved paths)
- Phase 3 → Phase 4 (API triggers migration)
- Phase 2 → Phase 5 (installer writes `userDataDir` config field)
- Phase 4 → Phase 6 (Settings UI calls `config.userDataDir.set` API)

## Key Decisions (from validation)

| Decision | Choice | Rationale |
|---|---|---|
| What to split | workspace + managed skills + cron only | Sessions, credentials, plugins are internal; user doesn't need direct access |
| STATE_DIR | Keep unchanged (~/.operis) | No chicken-and-egg; config always in known location |
| New config field | `userDataDir` | Points to OperisAgent/ folder; default ~/Desktop/OperisAgent/ |
| STATE_DIR API | `getStateDir()` function | Safer than `let` export; tsdown may not preserve ES live bindings |
| Default creation | During NSIS install | Installer creates OperisAgent/ at chosen location, writes `userDataDir` to config |
| Restart strategy | Graceful shutdown | Wait for in-flight requests before restart when changing userDataDir |
| Cross-FS migration | Sync copy | Simple, blocks until done; acceptable for user data sizes |
| Target OS | Windows only | Electron app builds win target NSIS only |

## Out of Scope

- macOS/Linux support (Windows-only Electron app)

## Validation Log

### Session 1 — 2026-03-02
**Trigger:** Initial plan validation before implementation
**Questions asked:** 8 (across 3 rounds)

#### Questions & Answers

1. **[Architecture]** Plan giả định fresh install sẽ default vào ~/Desktop/OperisAgent/. Nhưng nếu user chạy trên headless Linux server?
   - Options: Vẫn dùng ~/Desktop | Kiểm tra ~/Desktop tồn tại (Recommended) | Luôn dùng ~/.operis
   - **Answer:** User clarified architecture is WRONG — they want to SPLIT dirs, not MOVE entire state dir
   - **Custom input:** "Tôi không muốn xóa .operis mà chỉ muốn chuyển những thư mục cần thiết ra khỏi operis. App chỉ chạy trên Windows (apps/windows-desktop)"
   - **Rationale:** Fundamental architecture change. STATE_DIR stays at ~/.operis. Only workspace, skills, cron move to OperisAgent/

2. **[Architecture]** Xác nhận cấu trúc split: thư mục nào ra OperisAgent/?
   - Options: workspace+skills+cron | workspace+skills+cron+sessions | Tách tất cả trừ operis.json
   - **Answer:** workspace + skills + cron (sessions giữ trong .operis)
   - **Rationale:** Sessions là internal data, user không cần trực tiếp chỉnh

3. **[Scope]** OperisAgent/ tạo khi nào?
   - Options: Tự động khi gateway khởi động (Recommended) | Chỉ khi user chọn
   - **Answer:** Tạo đúng vị trí khi install, installer có UI chọn đường dẫn, default Desktop
   - **Rationale:** NSIS installer handles creation; gateway reads config

4. **[Restart]** Khi user đổi userDataDir, gateway cần restart. Approach nào?
   - Options: Restart ngay (1s) | Graceful shutdown (Recommended) | User restart thủ công
   - **Answer:** Graceful shutdown
   - **Rationale:** Tránh mất request đang xử lý

5. **[Architecture]** STATE_DIR API: let export vs getStateDir() function?
   - Options: let export + test tsdown | getStateDir() function (Recommended) | Proxy object
   - **Answer:** getStateDir() function
   - **Rationale:** STATE_DIR doesn't actually change value in new architecture (stays ~/.operis), but getStateDir() is safer pattern for future. Note: since STATE_DIR is unchanged, ~80 import sites DON'T need updating in this plan.

6. **[Migration]** Cross-FS migration approach?
   - Options: Sync copy | Async with progress | Không hỗ trợ (Recommended)
   - **Answer:** Sync copy
   - **Rationale:** Workspace/skills/cron are small; sync is simple and acceptable

#### Confirmed Decisions
- **Split model:** ~/.operis stays for internal state; OperisAgent/ for user-facing dirs only
- **Config field:** `userDataDir` (not `dataDir`) — clearer intent
- **STATE_DIR unchanged:** No mutable state dir needed; eliminates chicken-and-egg entirely
- **Windows only:** Electron app only builds for Windows (NSIS target)
- **Graceful restart:** 3s delay for in-flight requests when changing userDataDir via API
- **getStateDir():** Safer pattern, but not urgent since STATE_DIR value doesn't change

#### Action Items
- [x] Rewrite plan.md with split architecture
- [x] Rewrite phase-02 — from "move STATE_DIR" to "add userDataDir for 3 dirs"
- [x] Rewrite phase-03 — from "migrate entire state dir" to "migrate 3 dirs individually"
- [x] Rewrite phase-04 — from "config.dataDir.set" to "config.userDataDir.set" with graceful restart
- [ ] Phase 1 unchanged (hardcoded path fixes still needed)

#### Impact on Phases
- Phase 1: No changes needed — hardcoded path fixes are still valid
- Phase 2: **Major rewrite** — no longer mutating STATE_DIR; instead adding userDataDir that affects workspace/skills/cron resolution only
- Phase 3: **Major rewrite** — migrate 3 individual dirs instead of entire state dir
- Phase 4: **Updated** — method renamed to `config.userDataDir.set`, graceful restart
