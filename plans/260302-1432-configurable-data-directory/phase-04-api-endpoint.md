---
title: "Phase 4: Gateway API for userDataDir Changes"
status: pending
effort: 1h
---

# Phase 4: Gateway API for userDataDir Changes

## Context Links

- [plan.md](./plan.md) — overview
- [Phase 3](./phase-03-auto-migration.md) — prerequisite (provides `migrateUserDataDirs`)
- `src/gateway/server-methods/config.ts` — existing config handler pattern
- `src/gateway/server-methods.ts` — handler registry

## Overview

<!-- Updated: Validation Session 1 - Uses graceful shutdown, only migrates 3 dirs, not entire STATE_DIR -->

- **Priority:** Medium (enables future Settings UI)
- **Risk:** Low — follows established handler pattern
- **Description:** Add `config.userDataDir.set` gateway method. Validates path, triggers migration of workspace/skills/cron, updates config, graceful gateway restart.

## Key Insights

1. **Graceful shutdown** — wait for in-flight requests before restart (user preference)
2. **Only migrates 3 dirs** — workspace, skills, cron. Not entire state dir
3. **Follows existing pattern** — `config.patch` / `config.apply` pattern with `baseHash`, `writeConfigFile`, `scheduleGatewaySigusr1Restart`

## Requirements

### Functional
- New gateway method: `config.userDataDir.set`
- Parameters: `{ path: string, baseHash: string }`
- Validates path non-empty, absolute or `~`-prefixed
- Rejects if path equals current userDataDir (no-op)
- Runs `migrateUserDataDirs()` for workspace/skills/cron
- Writes `userDataDir` to config
- Triggers graceful gateway restart

### Non-Functional
- Admin scope required
- Response includes migration results (migrated, skipped, warnings)

## Implementation Steps

### Step 1: Add handler

In `src/gateway/server-methods/config.ts`:

```typescript
"config.userDataDir.set": async ({ params, respond }) => {
  // 1. Validate params
  const { path: rawPath, baseHash } = params as { path: string; baseHash?: string };
  if (!rawPath?.trim()) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path is required"));
    return;
  }

  // 2. Validate baseHash
  const snapshot = await readConfigFileSnapshot();
  if (!requireConfigBaseHash(params, snapshot, respond)) return;

  // 3. Resolve path
  const resolvedPath = resolveUserPath(rawPath.trim());

  // 4. Check not same as current
  const currentUserDataDir = resolveUserDataDir(snapshot.config);
  if (currentUserDataDir && path.resolve(resolvedPath) === path.resolve(currentUserDataDir)) {
    respond(true, { migrated: [], message: "Already using this path" });
    return;
  }

  // 5. Run migration
  resetUserDataMigration();
  const migration = migrateUserDataDirs({
    stateDir: getStateDir(),
    userDataDir: resolvedPath,
  });

  // 6. Write to config
  const cfg = loadConfig();
  cfg.userDataDir = resolvedPath;
  await writeConfigFile(CONFIG_PATH, cfg);

  // 7. Graceful restart
  const restartDelayMs = 3000; // allow in-flight requests to complete
  const restart = scheduleGatewaySigusr1Restart({
    delayMs: restartDelayMs,
    reason: "config.userDataDir.set",
  });

  respond(true, {
    userDataDir: resolvedPath,
    migrated: migration.migrated,
    skipped: migration.skipped,
    warnings: migration.warnings,
    restartScheduled: restart.scheduled,
    restartDelayMs,
  });
},
```

### Step 2: Verify admin scope coverage

Existing `config.*` scope check should cover `config.userDataDir.set` automatically. Verify in `server-methods.ts`.

### Step 3: Write tests

```typescript
describe("config.userDataDir.set", () => {
  it("migrates user data dirs and restarts", async () => { ... });
  it("rejects stale baseHash", async () => { ... });
  it("returns no-op for same path", async () => { ... });
  it("includes migration warnings in response", async () => { ... });
});
```

### Step 4: Compile and test

```bash
pnpm build && pnpm test
```

## Todo List

- [ ] Add `config.userDataDir.set` handler
- [ ] Verify admin scope coverage
- [ ] Write e2e tests
- [ ] Compile check + full test suite

## Success Criteria

1. API call with valid path → workspace/skills/cron migrated, config updated, restart scheduled
2. Stale baseHash → rejected
3. Same-path → no-op success
4. Migration warnings included in response
5. Graceful 3s restart delay

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Slow migration blocks HTTP response | Low | Medium | Workspace/skills/cron are small; rename is instant on same FS |
| Concurrent set requests | Very Low | Medium | baseHash prevents concurrent edits |

## Security Considerations

- Admin scope required
- Path validated via resolveUserPath()
- No path traversal — path.resolve normalizes

## Next Steps

This completes gateway-side changes. Future work:
- Client-web Settings UI calling `config.userDataDir.set`
- NSIS installer writing `userDataDir` to config during install
