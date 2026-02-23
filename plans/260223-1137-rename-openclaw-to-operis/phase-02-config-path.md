# Phase 2: Config Path `~/.openclaw/` → `~/.operis/`

**Priority:** MEDIUM
**Risk:** MEDIUM — affects config resolution for all platforms
**Status:** pending

---

## Strategy

The gateway already has a **legacy migration system** in `src/config/paths.ts`:
- Legacy dirs: `.clawdbot`, `.moltbot`, `.moldbot` → auto-detected and used
- New dir: `.openclaw` (current default)

**Approach:** Move `.openclaw` to the legacy list, set `.operis` as new default.
The existing resolution logic will:
1. Check `OPENCLAW_STATE_DIR` env override first
2. Check if `~/.operis/` exists → use it
3. Check if `~/.openclaw/` exists (legacy) → use it
4. Default to `~/.operis/` for new installs

This means **existing users keep working** (their `~/.openclaw/` is found as legacy) and **new installs use `~/.operis/`**.

---

## Part A: Central Path Constants (`src/config/paths.ts`)

### Change 1: Move `.openclaw` to legacy, set `.operis` as new
```
OLD: const LEGACY_STATE_DIRNAMES = [".clawdbot", ".moltbot", ".moldbot"] as const;
OLD: const NEW_STATE_DIRNAME = ".openclaw";
OLD: const CONFIG_FILENAME = "openclaw.json";
OLD: const LEGACY_CONFIG_FILENAMES = ["clawdbot.json", "moltbot.json", "moldbot.json"] as const;

NEW: const LEGACY_STATE_DIRNAMES = [".openclaw", ".clawdbot", ".moltbot", ".moldbot"] as const;
NEW: const NEW_STATE_DIRNAME = ".operis";
NEW: const CONFIG_FILENAME = "operis.json";
NEW: const LEGACY_CONFIG_FILENAMES = ["openclaw.json", "clawdbot.json", "moltbot.json", "moldbot.json"] as const;
```

### Change 2: Update lock dir suffix (line 205-206)
```
OLD: const suffix = uid != null ? `openclaw-${uid}` : "openclaw";
NEW: const suffix = uid != null ? `operis-${uid}` : "operis";
```

---

## Part B: Hardcoded `.openclaw` Paths in Gateway Source (`src/`)

These files hardcode `".openclaw"` instead of using the central constant. Each needs updating:

| # | File | Line | Current Code | Action |
|---|------|------|-------------|--------|
| 1 | `src/utils.ts` | 256 | `path.join(homedir(), ".openclaw")` | Change to `".operis"` |
| 2 | `src/agents/agent-scope.ts` | 181 | `path.join(os.homedir(), ".openclaw", ...)` | Change to `".operis"` |
| 3 | `src/agents/workspace.ts` | 15,17 | `path.join(homedir(), ".openclaw", ...)` | Change to `".operis"` |
| 4 | `src/agents/sandbox/constants.ts` | 6 | `path.join(os.homedir(), ".openclaw", "sandboxes")` | Change to `".operis"` |
| 5 | `src/agents/sandbox/constants.ts` | 50 | `path.join(os.homedir(), ".openclaw")` | Change to `".operis"` |
| 6 | `src/plugins/discovery.ts` | 330 | `path.join(workspaceRoot, ".openclaw", "extensions")` | Change to `".operis"` |
| 7 | `src/canvas-host/server.ts` | 238 | `path.join(os.homedir(), ".openclaw", "canvas")` | Change to `".operis"` |
| 8 | `src/hooks/bundled/session-memory/handler.ts` | 79 | `path.join(os.homedir(), ".openclaw", "workspace")` | Change to `".operis"` |
| 9 | `src/hooks/bundled/command-logger/handler.ts` | 42 | `path.join(os.homedir(), ".openclaw")` | Change to `".operis"` |
| 10 | `src/infra/device-identity.ts` | 20 | `path.join(os.homedir(), ".openclaw", "identity")` | Change to `".operis"` |
| 11 | `src/infra/exec-approvals.ts` | 63-64 | `"~/.openclaw/exec-approvals.sock"` and `.json` | Change to `"~/.operis/..."` |
| 12 | `src/infra/dotenv.ts` | 12 | Comment: `~/.openclaw/.env` | Update comment |
| 13 | `src/commands/doctor-config-flow.ts` | 156 | `path.join(home, ".openclaw")` | Change to `".operis"` |
| 14 | `src/commands/doctor-state-integrity.ts` | 120 | `[".openclaw"].map(...)` | Change to `[".operis"]` |
| 15 | `src/commands/doctor-state-integrity.ts` | 144 | `path.join(homedir(), ".openclaw")` | Change to `".operis"` |
| 16 | `src/commands/doctor-platform-notes.ts` | 21 | `path.join(home, ".openclaw", "disable-launchagent")` | Change to `".operis"` |
| 17 | `src/commands/uninstall.ts` | 123 | `hint: "~/.openclaw"` | Change to `"~/.operis"` |
| 18 | `src/cli/update-cli.ts` | 124 | `path.join(os.homedir(), ".openclaw")` | Change to `".operis"` |
| 19 | `src/gateway/session-utils.fs.ts` | 56 | `path.join(home, ".openclaw", "sessions", ...)` | Change to `".operis"` |
| 20 | `src/browser/chrome.profile-decoration.ts` | 9 | `path.join(userDataDir, ".openclaw-profile-decorated")` | Change to `".operis-profile-decorated"` |
| 21 | `src/commands/agents.commands.add.ts` | 336 | Doc URL (keep as-is, external link) | NO CHANGE |

**Total: 20 file edits in gateway source**

---

## Part C: Electron App (`apps/windows-desktop/`)

| # | File | Line | Current Code | New Code |
|---|------|------|-------------|----------|
| 1 | `src/onboard-manager.ts` | 12 | Comment: `~/.openclaw/openclaw.json` | `~/.operis/operis.json` |
| 2 | `src/onboard-manager.ts` | 16 | `path.join(home, ".openclaw", "openclaw.json")` | `path.join(home, ".operis", "operis.json")` |
| 3 | `src/main.ts` | 34 | Comment: `~/.openclaw/openclaw.json` | `~/.operis/operis.json` |
| 4 | `src/main.ts` | ~38 | File watcher for `"openclaw.json"` | `"operis.json"` |

---

## Part D: Gateway Bundle Rebuild

After changing source files:
1. `pnpm run build` — rebuild gateway (`tsdown` → `dist/entry.js`)
2. `cd apps/windows-desktop && node bundle-gateway.js` — rebundle
3. `npx tsc -p tsconfig.json` — compile Electron TS
4. `npx electron-builder --win nsis` — build installer

---

## Migration Behavior (Automatic)

| Scenario | Result |
|----------|--------|
| New install (no `~/.operis/`, no `~/.openclaw/`) | Creates `~/.operis/operis.json` |
| Existing install (`~/.openclaw/` exists) | Gateway finds it via legacy detection, uses it as-is |
| User manually renames `~/.openclaw/` → `~/.operis/` | Works immediately |

**Note:** Existing users who upgrade will still have `~/.openclaw/`. The gateway's legacy resolution will find and use it. No data loss.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Existing users lose config | Legacy detection handles this automatically |
| Hardcoded paths missed | Comprehensive grep already done; test build will catch |
| Gateway tests fail | Tests use env var overrides (`OPENCLAW_STATE_DIR`), should pass |
| External doc URLs (`docs.openclaw.ai`) | Keep as-is — external, not controllable |

---

## Success Criteria
- [ ] New Electron install creates `~/.operis/operis.json` (not `~/.openclaw/`)
- [ ] App runs normally with `~/.operis/` config
- [ ] If `~/.openclaw/` exists from old install, gateway still finds it
- [ ] Chrome Extension shows "Operis" in all user-visible text
- [ ] No "openclaw" visible to end user in installed app
