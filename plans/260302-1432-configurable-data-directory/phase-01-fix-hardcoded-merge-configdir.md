---
title: "Phase 1: Fix Hardcoded Paths & Merge CONFIG_DIR"
status: pending
effort: 1.5h
---

# Phase 1: Fix Hardcoded Paths & Merge CONFIG_DIR

## Context Links

- [plan.md](./plan.md) — overview
- `src/config/paths.ts` — canonical `resolveStateDir()` and `STATE_DIR`
- `src/utils.ts:248-338` — duplicate `resolveConfigDir()` and `CONFIG_DIR`
- `src/agents/workspace.ts:9-18` — hardcoded `.operis`
- `src/agents/agent-scope.ts:181` — hardcoded `.operis`
- `src/hooks/bundled/session-memory/handler.ts:79` — hardcoded `.operis`
- `src/daemon/paths.ts:41` — hardcoded `.openclaw`

## Overview

- **Priority:** High (prerequisite for Phase 2)
- **Risk:** Low — no behavior change, just routing through canonical functions
- **Description:** Eliminate all hardcoded `.operis` / `.openclaw` path construction so every path flows through `resolveStateDir()`. Merge the duplicate `resolveConfigDir()` in `utils.ts` into `paths.ts`.

## Key Insights

- `CONFIG_DIR` (utils.ts) and `STATE_DIR` (paths.ts) resolve to the same directory. `resolveConfigDir()` is a simplified copy of `resolveStateDir()` lacking legacy dir scan. They diverge only in edge cases.
- 16 files import `CONFIG_DIR` from `utils.ts`. All should be re-routed to a single canonical export.
- `daemon/paths.ts` is a standalone module used by daemon installers (launchd, systemd, schtasks). It cannot import from `src/config/paths.ts` because daemon modules avoid gateway dependencies. It needs its own fix.

## Requirements

### Functional
- All path construction must go through `resolveStateDir()` or `STATE_DIR` — no `path.join(homedir(), ".operis", ...)` anywhere
- `daemon/paths.ts` must use `.operis` (not `.openclaw`) as default dirname
- `CONFIG_DIR` export must resolve identically to `STATE_DIR`

### Non-Functional
- Zero runtime behavior change for existing users
- All existing tests must pass

## Architecture

No architectural change. This is a pure refactor that routes scattered path construction through the canonical resolution chain.

## Related Code Files

### Files to Modify

| File | Change |
|------|--------|
| `src/agents/workspace.ts:15,17` | Replace `path.join(homedir(), ".operis", ...)` with `path.join(resolveStateDir(env, homedir), ...)` |
| `src/agents/agent-scope.ts:181` | Replace `path.join(os.homedir(), ".operis", ...)` with `path.join(resolveStateDir(process.env, os.homedir), ...)` |
| `src/hooks/bundled/session-memory/handler.ts:79` | Replace `path.join(os.homedir(), ".operis", "workspace")` with import of `DEFAULT_AGENT_WORKSPACE_DIR` from workspace.ts |
| `src/daemon/paths.ts:41` | Replace `.openclaw${suffix}` with `.operis${suffix}` |
| `src/daemon/paths.test.ts` | Update expected values from `.openclaw` to `.operis` |
| `src/utils.ts:248-338` | Remove `resolveConfigDir()`, change `CONFIG_DIR` to re-export `STATE_DIR` from paths.ts |
| All 16 CONFIG_DIR importers | No change needed if `CONFIG_DIR` still exported from `utils.ts` |

### Files to Create
None.

### Files to Delete
None.

## Implementation Steps

### Step 1: Fix `src/agents/workspace.ts` — hardcoded `.operis`

**Lines 9-18**, function `resolveDefaultAgentWorkspaceDir`:

```typescript
// BEFORE (line 15):
return path.join(homedir(), ".operis", `workspace-${profile}`);
// BEFORE (line 17):
return path.join(homedir(), ".operis", "workspace");

// AFTER:
import { resolveStateDir } from "../config/paths.js";

export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
): string {
  const stateDir = resolveStateDir(env, homedir);
  const profile = env.OPENCLAW_PROFILE?.trim();
  if (profile && profile.toLowerCase() !== "default") {
    return path.join(stateDir, `workspace-${profile}`);
  }
  return path.join(stateDir, "workspace");
}
```

### Step 2: Fix `src/agents/agent-scope.ts:181` — hardcoded `.operis`

```typescript
// BEFORE (line 181):
return path.join(os.homedir(), ".operis", `workspace-${id}`);

// AFTER:
// Already imports resolveStateDir on line ~190, just use it:
return path.join(resolveStateDir(process.env, os.homedir), `workspace-${id}`);
```

Verify the import of `resolveStateDir` already exists (line 190 uses it). If not, add:
```typescript
import { resolveStateDir } from "../config/paths.js";
```

### Step 3: Fix `src/hooks/bundled/session-memory/handler.ts:79`

```typescript
// BEFORE (line 79):
: path.join(os.homedir(), ".operis", "workspace");

// AFTER — use the already-resolved default:
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../../../agents/workspace.js";
// ...
: DEFAULT_AGENT_WORKSPACE_DIR;
```

This is better than resolving state dir again because workspace.ts already computes the correct default.

### Step 4: Fix `src/daemon/paths.ts:41` — `.openclaw` to `.operis`

```typescript
// BEFORE (line 41):
return path.join(home, `.openclaw${suffix}`);

// AFTER:
return path.join(home, `.operis${suffix}`);
```

**Note:** daemon/paths.ts is intentionally standalone (no import from config/paths.ts). Keep it standalone but fix the dirname.

### Step 5: Update `src/daemon/paths.test.ts`

Update all 3 test expectations that reference `.openclaw`:
- Line 8: `.openclaw` -> `.operis`
- Line 13: `.openclaw-rescue` -> `.operis-rescue`
- Line 18: `.openclaw` -> `.operis`

### Step 6: Merge `resolveConfigDir` into paths.ts re-export

In `src/utils.ts`:

```typescript
// BEFORE (lines 248-266):
export function resolveConfigDir(...) { ... }

// AFTER — remove the function, re-export from paths:
import { resolveStateDir, STATE_DIR } from "./config/paths.js";
// ... (resolveStateDir already imported for resolveOAuthDir on line 4)

// Remove resolveConfigDir function entirely (lines 248-266)

// BEFORE (line 338):
export const CONFIG_DIR = resolveConfigDir();

// AFTER:
export const CONFIG_DIR = STATE_DIR;
```

Since `CONFIG_DIR` is still exported from `utils.ts` with the same value, all 16 importers need zero changes.

### Step 7: Verify and compile

Run `pnpm build` or `npx tsdown` to verify no compile errors. Run `pnpm test` to ensure all tests pass.

## Todo List

- [ ] Fix workspace.ts hardcoded `.operis` (lines 15, 17)
- [ ] Fix agent-scope.ts hardcoded `.operis` (line 181)
- [ ] Fix session-memory handler.ts hardcoded `.operis` (line 79)
- [ ] Fix daemon/paths.ts `.openclaw` -> `.operis` (line 41)
- [ ] Update daemon/paths.test.ts expectations
- [ ] Remove resolveConfigDir() from utils.ts, set CONFIG_DIR = STATE_DIR
- [ ] Compile check — zero errors
- [ ] Run tests — all pass

## Success Criteria

1. `grep -r '\.operis"' src/` finds zero hardcoded `.operis` path joins (only constant definitions in paths.ts)
2. `grep -r '\.openclaw"' src/` finds zero hardcoded `.openclaw` path joins (only constant definitions in paths.ts)
3. `CONFIG_DIR === STATE_DIR` at runtime
4. All existing tests pass
5. Build succeeds

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Daemon tests fail on CI (path sep) | Low | Low | Tests already use `path.join` |
| Breaking import cycle adding paths.ts import to workspace.ts | Low | Medium | workspace.ts already imports from utils.ts which imports from config/paths.ts — no new cycle |

## Security Considerations

None. Paths resolve identically to current behavior.

## Next Steps

Phase 2 depends on this phase completing first. Once all paths route through `resolveStateDir()`, Phase 2 can modify that single function to support `dataDir` override.
