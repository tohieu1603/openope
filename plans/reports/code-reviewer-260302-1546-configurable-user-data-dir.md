# Code Review: Configurable userDataDir Feature

**Date**: 2026-03-02
**Reviewer**: code-reviewer
**Branch**: Hung
**Focus**: Configurable user data directory (workspace, skills, cron)

---

## Scope

- **Files changed**: 21 (573 added, 744 deleted -- 712 from fl.md cleanup)
- **Net new code**: ~573 lines across backend, installer, and frontend
- **Focus**: Full feature review -- security, correctness, edge cases, code quality

### Changed Files

| Area | Files |
|------|-------|
| Config | `src/config/paths.ts`, `types.openclaw.ts`, `zod-schema.ts` |
| Migration | `src/infra/state-migrations.ts` |
| API | `src/gateway/server-methods/config.ts` |
| Startup | `src/gateway/server.impl.ts` |
| Path resolution | `src/agents/workspace.ts`, `agent-scope.ts`, `skills/workspace.ts`, `skills/refresh.ts` |
| Cron | `src/cron/store.ts`, `src/gateway/server-cron.ts` |
| Session memory | `src/hooks/bundled/session-memory/handler.ts` |
| Daemon | `src/daemon/paths.ts`, `paths.test.ts` |
| Utils | `src/utils.ts` |
| Installer | `apps/windows-desktop/installer.nsh` |
| Onboard | `apps/windows-desktop/src/onboard-manager.ts` |
| Frontend | `client-web/src/ui/app.ts`, `views/settings.ts` |
| Cleanup | `client-web/fl.md` (deleted, unrelated) |

---

## Overall Assessment

Solid feature implementation. The architecture is well-layered: config schema > resolver > migration engine > API handler > UI. The symlink/junction approach for backward compatibility is smart. Several issues need attention before merge.

---

## Critical Issues

### C1. No path traversal validation on `config.userDataDir.set` API

**File**: `D:\Project\SourceCode\agent.operis\src\gateway\server-methods\config.ts` (line 465-513)

The handler accepts any path string from the client and passes it through `resolveUserPath()` which only resolves `~` and calls `path.resolve()`. No validation prevents:

- Setting path to system directories (`C:\Windows\System32`, `/etc`)
- Setting path to other users' home directories
- Empty string after trim (handled) but paths like `.` or `..` resolve to CWD
- Paths with null bytes (Node.js path APIs may not reject them on all platforms)

```typescript
// Current code (line 477):
const resolvedPath = resolveUserPath(rawPath.trim());

// Recommended: Add validation
const resolvedPath = resolveUserPath(rawPath.trim());
if (!resolvedPath || resolvedPath === path.resolve('.')) {
  respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid path"));
  return;
}
// Optional: restrict to user-writable locations
const home = os.homedir();
if (!resolvedPath.startsWith(home) && !resolvedPath.startsWith(os.tmpdir())) {
  respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "path must be within user directory"));
  return;
}
```

**Impact**: Medium-high. This is a local gateway so the attacker surface is the local user or anyone with the gateway token. But the migration engine will attempt to move directories and create junctions at whatever path is provided, which could damage system directories.

**Mitigating factor**: The gateway already requires auth (token-based), so this is only exploitable by authenticated local users. Still worth validating.

### C2. Cross-filesystem copy without cleanup on partial failure

**File**: `D:\Project\SourceCode\agent.operis\src\infra\state-migrations.ts` (line 1000-1007)

When `EXDEV` triggers a cross-FS copy, if `fs.cpSync` succeeds but `fs.rmSync` fails (e.g., file locked by another process), the function still sets `moved = true`. This leads to:
1. Data exists at both `from` and `to` locations
2. A symlink/junction is created at `from` pointing to `to`
3. The original data at `from` is lost (replaced by junction)

But more critically: if `cpSync` partially copies then throws, the catch returns an error but leaves a partial copy at `to` without cleanup.

```typescript
// Current code:
fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
fs.rmSync(from, { recursive: true, force: true });
moved = true;

// Recommended: clean up partial copy on cpSync failure
try {
  fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
} catch (cpErr) {
  // Clean up partial copy
  try { fs.rmSync(to, { recursive: true, force: true }); } catch { /* best effort */ }
  return { ok: false, error: `cross-FS copy failed: ${cpErr}` };
}
try {
  fs.rmSync(from, { recursive: true, force: true });
} catch (rmErr) {
  // Copy succeeded but removal failed; data at both locations
  // Still proceed with symlink -- old data will be shadowed
}
moved = true;
```

---

## High Priority

### H1. `DEFAULT_AGENT_WORKSPACE_DIR` computed at module load without config

**File**: `D:\Project\SourceCode\agent.operis\src\agents\workspace.ts` (line 28)

```typescript
export const DEFAULT_AGENT_WORKSPACE_DIR = resolveDefaultAgentWorkspaceDir();
```

This is called at module load time with no `cfg` argument, so `resolveUserDataDir({})` always returns `null`. The constant always resolves to `STATE_DIR/workspace`, ignoring any configured `userDataDir`. This affects all code that references `DEFAULT_AGENT_WORKSPACE_DIR` directly (session-memory fallback, sandbox context, etc.) -- they will not respect `userDataDir` config.

**Impact**: The session-memory handler (line 80) now uses `DEFAULT_AGENT_WORKSPACE_DIR` as fallback when `cfg` is null, which is an improvement from the hardcoded `path.join(os.homedir(), ".operis", "workspace")`, but it still does not respect `userDataDir`. Same for sandbox context.

**Recommendation**: This is a known trade-off. The callers that have access to config (like `resolveAgentWorkspaceDir`) already use `resolveUserDataDir(cfg)` properly. The module-level constant is inherently unable to be config-aware. Document this limitation or consider a lazy-init pattern.

### H2. Startup migration creates dirs before migration checks

**File**: `D:\Project\SourceCode\agent.operis\src\gateway\server.impl.ts` (line 228-230)

```typescript
fs.mkdirSync(path.join(userDataDir, "workspace"), { recursive: true });
fs.mkdirSync(path.join(userDataDir, "skills"), { recursive: true });
fs.mkdirSync(path.join(userDataDir, "cron"), { recursive: true });
const migration = migrateUserDataDirs({ stateDir: STATE_DIR, userDataDir });
```

These `mkdirSync` calls create empty directories at the target before migration runs. Then inside `migrateUserDataDirs`, the check at line 967-977 says "if target exists and has content, skip". Since the dirs were just created empty, `readdirSync` returns `[]`, and the code does `fs.rmdirSync(newDir)` before proceeding with the move.

This works but is fragile -- if anything writes a file to the target dir between `mkdirSync` and migration (e.g., another process), migration would skip that dir. The `mkdirSync` calls are also redundant since `migrateUserDataDirs` itself does `fs.mkdirSync(userDataDir, { recursive: true })` and `moveDirWithSymlink` does `fs.mkdirSync(path.dirname(to), { recursive: true })`.

**Recommendation**: Remove the three `mkdirSync` calls from `server.impl.ts` (lines 228-230). Let the migration engine handle directory creation.

### H3. Zod schema has no path validation

**File**: `D:\Project\SourceCode\agent.operis\src\config\zod-schema.ts` (line 92)

```typescript
userDataDir: z.string().optional(),
```

No minimum length, no path format validation. An empty string `""` passes validation but `resolveUserDataDir` treats it as null (due to `.trim()` check). A string of only spaces also passes. Not harmful since `resolveUserDataDir` handles it, but the schema could be tighter.

**Recommendation**: Consider `z.string().min(1).optional()` or a custom refinement.

---

## Medium Priority

### M1. `resolveUserPath` duplication

**Files**: `D:\Project\SourceCode\agent.operis\src\config\paths.ts` (line 76, private), `D:\Project\SourceCode\agent.operis\src\utils.ts` (line 236, exported)

Two identical implementations of `resolveUserPath` exist. The private one in `paths.ts` is used internally by `resolveUserDataDir` and `resolveStateDir`. The exported one in `utils.ts` is used by the API handler and many other modules.

**Recommendation**: The `paths.ts` private copy avoids a circular dependency (paths.ts is imported by utils.ts). This is acceptable but worth a comment explaining why the duplication exists.

### M2. `userDataMigrationDone` module-level guard is not concurrency-safe

**File**: `D:\Project\SourceCode\agent.operis\src\infra\state-migrations.ts` (line 917, 933-934)

The boolean guard prevents double-migration in the same process, but if two API calls to `config.userDataDir.set` arrive simultaneously:

1. First call: `resetUserDataMigration()` sets false, then `migrateUserDataDirs` sets true
2. Second call: `resetUserDataMigration()` sets false again, runs migration again

Both calls are `async` handlers but `migrateUserDataDirs` is synchronous, so actual concurrent execution within a single Node event loop is unlikely. Still, the `resetUserDataMigration` + `migrateUserDataDirs` pair is not atomic.

**Recommendation**: Low real-world risk (single-threaded Node), but consider using a mutex/lock for the API handler or debouncing rapid calls.

### M3. Symlink rollback uses `renameSync` which may fail cross-FS

**File**: `D:\Project\SourceCode\agent.operis\src\infra\state-migrations.ts` (line 1020)

If the original move was cross-FS (EXDEV path), the rollback on symlink failure uses `fs.renameSync(to, from)` which would also fail with EXDEV. The original data at `from` was already deleted by `fs.rmSync`.

```typescript
// Line 1018-1024: symlink failure rollback
} catch (symlinkErr) {
  try {
    fs.renameSync(to, from); // Will fail with EXDEV if original was cross-FS!
```

**Recommendation**: If the original move was cross-FS, rollback should also use copy+delete. Consider tracking whether the EXDEV path was taken and using the appropriate rollback strategy.

### M4. NSIS `customInstall` reads `$DataDirInput` which may be invalid

**File**: `D:\Project\SourceCode\agent.operis\apps\windows-desktop\installer.nsh` (line 47)

If the user navigates directly from the previous page without visiting the data dir page (silent install, or if the page is skipped), `$DataDirInput` may be empty/uninitialized. The `NSD_GetText` would return an empty string, and an empty `$DataDir` would lead to `CreateDirectory ""` (no-op in NSIS) and a seed file with `"userDataDir":""`.

The onboard-manager in `consumeInstallerSeed()` does check `typeof seed.userDataDir === "string"`, but an empty string still passes this check. `resolveUserDataDir` would then receive `""`, trim it, and return null -- so it works, but it writes an unnecessary empty value to config.

**Recommendation**: Guard the `customInstall` macro:
```nsis
StrCmp $DataDir "" skip_seed
; ... write seed file ...
skip_seed:
```

---

## Low Priority

### L1. Hardcoded Vietnamese strings in settings UI

**File**: `D:\Project\SourceCode\agent.operis\client-web\src\ui\views\settings.ts` (lines 870-909)

All UI strings are Vietnamese. This is consistent with the rest of the settings view (other cards also use Vietnamese). Not an issue per se, but worth noting if i18n is planned.

### L2. Unused `os` import in `cron/store.ts`

**File**: `D:\Project\SourceCode\agent.operis\src\cron\store.ts` (line 3)

The `os` import is used only for `os.homedir()` in the tilde expansion at line 23. Since `resolveDefaultCronDir` now delegates to `resolveUserDataDir` which handles tilde expansion internally, the `os` import remains needed only for the `resolveCronStorePath` tilde handling. This is fine but could be simplified by using `resolveUserPath` from utils.

### L3. Test expectations updated for `.operis` but not comprehensive

**File**: `D:\Project\SourceCode\agent.operis\src\daemon\paths.test.ts`

Tests correctly updated from `.openclaw` to `.operis`. No new tests added for `resolveUserDataDir`, `migrateUserDataDirs`, or `moveDirWithSymlink`.

---

## Edge Cases Found by Scouting

1. **`DEFAULT_AGENT_WORKSPACE_DIR` at module load**: All modules importing this constant get the STATE_DIR-based path, never the userDataDir-based path. This is acceptable for fallback use but means sandbox contexts and auto-reply always fall back to `~/.operis/workspace` regardless of config.

2. **Concurrent cron writes during migration**: If cron writes a job to `STATE_DIR/cron/jobs.json` while migration is moving `cron/` to userDataDir, the write could fail (directory moved out from under it) or succeed to the old location (before junction is created). Node single-threaded nature reduces but does not eliminate this risk.

3. **Junction detection**: On Windows, `lstatSync().isSymbolicLink()` returns `true` for junctions. `readlinkSync()` also works on junctions. The existing code at line 956-963 correctly detects already-migrated junctions. Verified.

4. **`resolveConfigDir` deprecation**: `utils.ts` now delegates to `resolveStateDir`. The old `resolveConfigDir` was doing its own `.operis` directory check which is now removed (dedup). The exported `CONFIG_DIR` constant is now `STATE_DIR`. All callers that import `CONFIG_DIR` from `utils.ts` now get the canonical `STATE_DIR` value. No breakage detected.

5. **API handler writes config before restart completes**: `config.userDataDir.set` writes the new config and schedules a 3-second delayed restart. If the gateway crashes between config write and restart, the new config is already persisted. On next startup, `server.impl.ts` will run migration again (idempotent due to the `userDataMigrationDone` guard -- but since it is a fresh process, the guard is reset). The startup migration at `server.impl.ts` line 231 will either succeed or skip already-migrated dirs. This is correct.

---

## Positive Observations

1. **Clean layering**: Config schema > resolver > migration > API > UI separation is well done
2. **Backward compat via junctions**: Smart approach to keep old paths working via symlinks/junctions
3. **Idempotent migration**: Detects already-migrated state (symlink check), skips populated targets
4. **Config hash validation**: The API handler validates `baseHash` to prevent concurrent config edits (optimistic locking)
5. **NSIS backslash-to-forward-slash conversion**: Correct handling for JSON compatibility
6. **Seed file consume-on-read pattern**: Clean one-shot seed file that is deleted after reading
7. **Graceful restart scheduling**: 3-second delay gives time for response to reach client
8. **UI disabled states**: Save button properly disabled during save and when path unchanged

---

## Recommended Actions (Priority Order)

1. **[Critical]** Add path validation in `config.userDataDir.set` handler -- reject empty, system paths, non-absolute
2. **[Critical]** Clean up partial copy at `to` on cross-FS `cpSync` failure in `moveDirWithSymlink`
3. **[High]** Remove redundant `mkdirSync` calls in `server.impl.ts` before migration
4. **[High]** Fix cross-FS rollback in `moveDirWithSymlink` to use copy instead of rename
5. **[Medium]** Add NSIS guard for empty `$DataDir` before writing seed file
6. **[Medium]** Add unit tests for `resolveUserDataDir`, `migrateUserDataDirs`, `moveDirWithSymlink`
7. **[Low]** Add comment explaining `resolveUserPath` duplication between `paths.ts` and `utils.ts`

---

## Metrics

- **Type Coverage**: All new code is TypeScript-typed. `UserDataMigrationResult` type is well-defined.
- **Test Coverage**: Only `daemon/paths.test.ts` updated (existing test fix). No new tests for migration logic.
- **Linting Issues**: Not run (pending build verification)

---

## Unresolved Questions

1. Should `userDataDir` support relative paths? Currently `resolveUserPath` resolves relative paths against CWD, which varies by context (gateway startup CWD vs. Electron app CWD). Consider requiring absolute paths only.
2. Is there a rollback mechanism if the user wants to undo a userDataDir change? The junction approach means old-location references still work, but the config change is permanent until manually reverted.
3. Should the NSIS installer validate the chosen data directory is writable before writing the seed file?
