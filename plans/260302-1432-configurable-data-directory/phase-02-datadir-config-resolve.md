---
title: "Phase 2: Add userDataDir Config & Path Resolution"
status: pending
effort: 3h
---

# Phase 2: Add `userDataDir` Config & Path Resolution

## Context Links

- [plan.md](./plan.md) — overview
- [Phase 1](./phase-01-fix-hardcoded-merge-configdir.md) — prerequisite
- `src/config/paths.ts` — `resolveStateDir()`, `STATE_DIR`
- `src/config/types.openclaw.ts` — `OpenClawConfig` type
- `src/config/zod-schema.ts` — Zod validation schema
- `src/agents/workspace.ts` — workspace dir resolution
- `src/agents/skills/workspace.ts` — managed skills dir resolution
- `src/cron/store.ts` — cron dir resolution

## Overview

- **Priority:** High (core feature)
- **Risk:** Medium — changes how workspace, managed skills, and cron dirs are resolved
- **Description:** Add `userDataDir` field to `operis.json` pointing to the OperisAgent/ folder. Update workspace, managed skills, and cron path resolution to use `userDataDir` when set. STATE_DIR (`~/.operis`) stays unchanged.

## Key Insights

<!-- Updated: Validation Session 1 - Architecture changed from "move entire STATE_DIR" to "split user-facing dirs only" -->

1. **No chicken-and-egg problem.** Config stays in `~/.operis/operis.json`. `userDataDir` is just a pointer to where user-facing data lives. STATE_DIR is never moved.
2. **Only 3 directories affected:** workspace/, managed skills/, cron/. Sessions, credentials, plugins, hooks, logs stay in STATE_DIR.
3. **getStateDir() function pattern** — safer than `let` export for tsdown bundler compatibility. All ~80 STATE_DIR importers need updating, but STATE_DIR itself doesn't change value.
4. **Default: ~/Desktop/OperisAgent/** — created by NSIS installer, not gateway. Gateway reads `userDataDir` from config.
5. **Workspace already has override mechanism** via `agents.defaults.workspace`. `userDataDir` provides a higher-level default that these existing overrides can still override.

## Requirements

### Functional
- `userDataDir` field in `operis.json` (top-level, optional string)
- When `userDataDir` is set:
  - Default workspace dir → `{userDataDir}/workspace/`
  - Managed skills dir → `{userDataDir}/skills/`
  - Default cron dir → `{userDataDir}/cron/`
- When `userDataDir` is NOT set: everything stays as-is (~/.operis/workspace, etc.)
- Existing per-agent workspace overrides (`agents.defaults.workspace`, `agents.list[].workspace`) still take priority
- Existing cron override (`cron.store`) still takes priority
- Env var `OPENCLAW_STATE_DIR` does NOT affect `userDataDir` (they're independent)

### Non-Functional
- STATE_DIR stays constant (~/.operis) — no module-level mutation needed
- No performance regression
- Backward compatible: no `userDataDir` → identical behavior to current

## Architecture

### Path Resolution Chain (after change)

```
Workspace dir:
  1. per-agent config (agents.list[].workspace) → custom path
  2. agents.defaults.workspace → custom path
  3. OPENCLAW_PROFILE → {stateDir}/workspace-{profile}  (or {userDataDir}/workspace-{profile} if set)
  4. userDataDir set → {userDataDir}/workspace/
  5. Default → {stateDir}/workspace/

Managed skills dir:
  1. userDataDir set → {userDataDir}/skills/
  2. Default → CONFIG_DIR/skills/ (= STATE_DIR/skills/)

Cron dir:
  1. cron.store config → custom path
  2. userDataDir set → {userDataDir}/cron/jobs.json
  3. Default → CONFIG_DIR/cron/jobs.json
```

### New helper: resolveUserDataDir()

```typescript
// In src/config/paths.ts:
export function resolveUserDataDir(
  cfg: { userDataDir?: string },
): string | null {
  const dir = cfg.userDataDir?.trim();
  if (!dir) return null;
  return resolveUserPath(dir);
}
```

## Related Code Files

### Files to Modify

| File | Change |
|------|--------|
| `src/config/types.openclaw.ts` | Add `userDataDir?: string` to `OpenClawConfig` |
| `src/config/zod-schema.ts` | Add `userDataDir: z.string().optional()` |
| `src/config/paths.ts` | Add `resolveUserDataDir()` helper |
| `src/agents/workspace.ts` | Update `resolveDefaultAgentWorkspaceDir()` to check `userDataDir` |
| `src/agents/agent-scope.ts` | Update `resolveAgentWorkspaceDir()` fallback to use `userDataDir` |
| `src/agents/skills/workspace.ts` | Update managed skills dir to check `userDataDir` |
| `src/cron/store.ts` | Update DEFAULT_CRON_DIR to check `userDataDir` |
| `src/utils.ts` | Add config-aware `resolveUserDataDir` re-export or helper |

## Implementation Steps

### Step 1: Add `userDataDir` to config type

In `src/config/types.openclaw.ts`:

```typescript
export type OpenClawConfig = {
  /** User data directory for workspace, skills, cron. Default: ~/Desktop/OperisAgent/ */
  userDataDir?: string;
  meta?: { ... };
  // ... rest unchanged
};
```

### Step 2: Add Zod validation

In `src/config/zod-schema.ts`:

```typescript
export const OpenClawSchema = z.object({
  userDataDir: z.string().optional(),
  // ... rest unchanged
});
```

### Step 3: Add resolveUserDataDir() to paths.ts

```typescript
/**
 * Resolve user data dir from config. Returns null if not configured.
 * User data dir contains: workspace/, skills/, cron/
 */
export function resolveUserDataDir(
  cfg: { userDataDir?: string },
): string | null {
  const dir = cfg.userDataDir?.trim();
  if (!dir) return null;
  return resolveUserPath(dir);
}
```

### Step 4: Update workspace dir resolution

In `src/agents/workspace.ts`, update `resolveDefaultAgentWorkspaceDir()`:

```typescript
// After Phase 1 fix, this already uses resolveStateDir().
// Now add userDataDir support:

export function resolveDefaultAgentWorkspaceDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = os.homedir,
  cfg?: { userDataDir?: string },
): string {
  const profile = env.OPENCLAW_PROFILE?.trim();
  const userDataDir = resolveUserDataDir(cfg ?? {});

  if (profile && profile.toLowerCase() !== "default") {
    const base = userDataDir ?? resolveStateDir(env, homedir);
    return path.join(base, `workspace-${profile}`);
  }

  if (userDataDir) {
    return path.join(userDataDir, "workspace");
  }

  return path.join(resolveStateDir(env, homedir), "workspace");
}
```

### Step 5: Update agent-scope.ts fallback

In `src/agents/agent-scope.ts`, the non-default agent workspace fallback:

```typescript
// After Phase 1 fix:
// return path.join(resolveStateDir(...), `workspace-${id}`);

// Now with userDataDir:
const userDataDir = resolveUserDataDir(cfg ?? {});
const base = userDataDir ?? resolveStateDir(process.env, os.homedir);
return path.join(base, `workspace-${id}`);
```

### Step 6: Update managed skills dir

In `src/agents/skills/workspace.ts`, where `managedSkillsDir` is resolved:

```typescript
// BEFORE:
const managedSkillsDir = opts?.managedSkillsDir ?? path.join(CONFIG_DIR, "skills");

// AFTER:
const userDataDir = resolveUserDataDir(opts?.config ?? {});
const managedSkillsDir = opts?.managedSkillsDir
  ?? (userDataDir ? path.join(userDataDir, "skills") : path.join(CONFIG_DIR, "skills"));
```

### Step 7: Update cron store dir

In `src/cron/store.ts`:

```typescript
// BEFORE:
export const DEFAULT_CRON_DIR = path.join(CONFIG_DIR, "cron");

// AFTER: Make it a function that checks config
export function resolveDefaultCronDir(cfg?: { userDataDir?: string }): string {
  const userDataDir = resolveUserDataDir(cfg ?? {});
  if (userDataDir) return path.join(userDataDir, "cron");
  return path.join(CONFIG_DIR, "cron");
}

// For backward compat, keep the const (used at module level by other code):
export const DEFAULT_CRON_DIR = path.join(CONFIG_DIR, "cron");
```

Note: Callers that have config available should use `resolveDefaultCronDir(cfg)`. The const stays for backward compat.

### Step 8: Ensure directories are created

When `userDataDir` is set, the gateway startup should ensure the 3 sub-directories exist:

```typescript
// In gateway startup (after config load):
const userDataDir = resolveUserDataDir(cfg);
if (userDataDir) {
  fs.mkdirSync(path.join(userDataDir, "workspace"), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, "skills"), { recursive: true });
  fs.mkdirSync(path.join(userDataDir, "cron"), { recursive: true });
}
```

### Step 9: Write tests

```typescript
describe("resolveUserDataDir", () => {
  it("returns null when not configured", () => { ... });
  it("resolves ~ prefix", () => { ... });
  it("resolves absolute path", () => { ... });
});

describe("workspace with userDataDir", () => {
  it("uses userDataDir/workspace when set", () => { ... });
  it("falls back to stateDir/workspace when not set", () => { ... });
  it("per-agent config still overrides userDataDir", () => { ... });
});
```

### Step 10: Compile and test

```bash
pnpm build && pnpm test
```

## Todo List

- [ ] Add `userDataDir?: string` to `OpenClawConfig` type
- [ ] Add `userDataDir` to Zod schema
- [ ] Add `resolveUserDataDir()` helper in paths.ts
- [ ] Update `resolveDefaultAgentWorkspaceDir()` for userDataDir support
- [ ] Update `agent-scope.ts` fallback for userDataDir
- [ ] Update managed skills dir resolution for userDataDir
- [ ] Update cron store dir resolution for userDataDir
- [ ] Ensure sub-dirs created on gateway startup when userDataDir set
- [ ] Write unit tests
- [ ] Compile check + full test suite

## Success Criteria

1. `operis.json` with `"userDataDir": "C:/Users/user/Desktop/OperisAgent"` → workspace at `C:/Users/user/Desktop/OperisAgent/workspace/`
2. `operis.json` with `"userDataDir": "..."` → managed skills at `{userDataDir}/skills/`
3. `operis.json` with `"userDataDir": "..."` → cron at `{userDataDir}/cron/`
4. No `userDataDir` → all paths unchanged (backward compat)
5. Per-agent workspace override still takes priority over userDataDir
6. `cron.store` config override still takes priority
7. All tests pass, build succeeds

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Callers don't pass config to workspace resolution | Medium | Medium | Audit all callers; provide fallback to current behavior |
| Module-level constants (DEFAULT_CRON_DIR) ignore userDataDir | Medium | Low | Keep const for compat; add function for config-aware resolution |
| Chokidar skill watcher doesn't watch new skills dir | Low | Medium | Update `resolveWatchPaths()` in skills/refresh.ts |

## Security Considerations

- `userDataDir` validated via `resolveUserPath()` (handles ~ expansion, path.resolve)
- Config is user-owned, trusted
- No path traversal risk — path.resolve normalizes

## Next Steps

Phase 3: migrate existing workspace/skills/cron from `~/.operis/` to `userDataDir` when first set.
