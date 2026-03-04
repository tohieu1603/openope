---
title: "Phase 3: Auto-Migration of User Data"
status: pending
effort: 2.5h
---

# Phase 3: Auto-Migration of User Data

## Context Links

- [plan.md](./plan.md) — overview
- [Phase 2](./phase-02-datadir-config-resolve.md) — prerequisite
- `src/infra/state-migrations.ts` — existing rename+symlink pattern

## Overview

<!-- Updated: Validation Session 1 - Only migrate workspace, skills, cron (not entire STATE_DIR) -->

- **Priority:** High (data integrity)
- **Risk:** Medium — moving user data; must be safe
- **Description:** When `userDataDir` is first set (or changed), automatically move workspace/, managed skills/, cron/ from `~/.operis/` to the new location. Internal state (sessions, credentials, etc.) stays in `~/.operis/`.

## Key Insights

1. **Only 3 directories to migrate:** workspace/, skills/, cron/ — much simpler than moving entire state dir
2. **Each dir migrated independently.** If one fails, others can still succeed
3. **Reuse rename+symlink pattern** from `autoMigrateLegacyStateDir()`
4. **Sync copy for cross-FS** (user confirmed; acceptable for workspace/skills/cron sizes)
5. **Symlink at old location** so any code still referencing `~/.operis/workspace` follows the link

## Architecture

### Migration Flow

```
Gateway startup → loadConfig() → cfg.userDataDir set?
  │
  ├─ No → skip migration
  │
  └─ Yes → for each dir in [workspace, skills, cron]:
       │
       ├─ oldDir = {STATE_DIR}/{name}/
       ├─ newDir = {userDataDir}/{name}/
       │
       ├─ oldDir doesn't exist? → skip (nothing to migrate)
       ├─ oldDir is symlink to newDir? → skip (already migrated)
       ├─ newDir exists and non-empty? → skip + warn (conflict)
       │
       └─ MIGRATE:
            ├─ fs.renameSync(old, new) ─── same FS? ✓
            │    └─ EXDEV? → fs.cpSync + fs.rmSync
            ├─ fs.symlinkSync(new, old, "junction") ← Windows
            │    └─ fail? → rollback (rename back)
            └─ log success
```

## Related Code Files

| File | Change |
|------|--------|
| `src/infra/state-migrations.ts` | Add `migrateUserDataDirs()` function |
| Gateway startup entry | Call migration after config load |

## Implementation Steps

### Step 1: Add migration function

In `src/infra/state-migrations.ts`:

```typescript
export type UserDataMigrationResult = {
  migrated: string[];    // dirs successfully moved
  skipped: string[];     // dirs skipped (not found, already migrated, conflict)
  warnings: string[];
};

const USER_DATA_DIRS = ["workspace", "skills", "cron"] as const;

/**
 * Migrate user-facing dirs from STATE_DIR to userDataDir.
 * Only moves dirs that exist at old location and don't conflict at new location.
 */
export function migrateUserDataDirs(params: {
  stateDir: string;
  userDataDir: string;
}): UserDataMigrationResult {
  const { stateDir, userDataDir } = params;
  const result: UserDataMigrationResult = { migrated: [], skipped: [], warnings: [] };

  if (path.resolve(stateDir) === path.resolve(userDataDir)) {
    return result; // same dir, nothing to do
  }

  // Ensure userDataDir parent exists
  fs.mkdirSync(userDataDir, { recursive: true });

  for (const dirName of USER_DATA_DIRS) {
    const oldDir = path.join(stateDir, dirName);
    const newDir = path.join(userDataDir, dirName);

    // Skip if source doesn't exist
    if (!fs.existsSync(oldDir)) {
      result.skipped.push(`${dirName}: source not found`);
      continue;
    }

    // Skip if source is already a symlink pointing to target
    try {
      const stat = fs.lstatSync(oldDir);
      if (stat.isSymbolicLink()) {
        const target = path.resolve(path.dirname(oldDir), fs.readlinkSync(oldDir));
        if (target === path.resolve(newDir)) {
          result.skipped.push(`${dirName}: already migrated (symlink exists)`);
          continue;
        }
      }
    } catch { /* proceed */ }

    // Skip if target exists and has content
    if (fs.existsSync(newDir)) {
      try {
        const entries = fs.readdirSync(newDir);
        if (entries.length > 0) {
          result.warnings.push(`${dirName}: target already has content at ${newDir}, skipping`);
          result.skipped.push(dirName);
          continue;
        }
        // Empty target dir — remove it so rename works
        fs.rmdirSync(newDir);
      } catch { /* proceed with rename, it will fail if dir not empty */ }
    }

    // Attempt move
    const moveResult = moveDirWithSymlink(oldDir, newDir);
    if (moveResult.ok) {
      result.migrated.push(dirName);
    } else {
      result.warnings.push(`${dirName}: ${moveResult.error}`);
    }
  }

  return result;
}

/** Move dir from→to, create symlink/junction at from. Rollback on failure. */
function moveDirWithSymlink(from: string, to: string): { ok: boolean; error?: string } {
  // Ensure target parent exists
  fs.mkdirSync(path.dirname(to), { recursive: true });

  // Try atomic rename
  let moved = false;
  try {
    fs.renameSync(from, to);
    moved = true;
  } catch (err: any) {
    if (err?.code === "EXDEV") {
      // Cross-filesystem: copy then delete
      try {
        fs.cpSync(from, to, { recursive: true, preserveTimestamps: true });
        fs.rmSync(from, { recursive: true, force: true });
        moved = true;
      } catch (cpErr) {
        return { ok: false, error: `cross-FS copy failed: ${cpErr}` };
      }
    } else {
      return { ok: false, error: `rename failed: ${err}` };
    }
  }

  if (!moved) return { ok: false, error: "move failed" };

  // Create symlink at old location (Windows: junction)
  try {
    fs.symlinkSync(to, from, process.platform === "win32" ? "junction" : "dir");
  } catch (symlinkErr) {
    // Rollback
    try {
      fs.renameSync(to, from);
      return { ok: false, error: `symlink failed, rolled back: ${symlinkErr}` };
    } catch (rollbackErr) {
      return { ok: false, error: `symlink failed and rollback failed (data at ${to}): ${symlinkErr}` };
    }
  }

  return { ok: true };
}
```

### Step 2: Wire into gateway startup

After config load, before subsystem init:

```typescript
import { migrateUserDataDirs } from "../infra/state-migrations.js";

const cfg = loadConfig();
const userDataDir = resolveUserDataDir(cfg);
if (userDataDir) {
  const migration = migrateUserDataDirs({ stateDir: getStateDir(), userDataDir });
  if (migration.migrated.length) logger.info(`Migrated to ${userDataDir}: ${migration.migrated.join(", ")}`);
  if (migration.warnings.length) logger.warn(`Migration warnings: ${migration.warnings.join("; ")}`);
}
```

### Step 3: Guard against re-migration

Add module-level flag:

```typescript
let userDataMigrationDone = false;

export function migrateUserDataDirs(params) {
  if (userDataMigrationDone) return { migrated: [], skipped: [], warnings: [] };
  userDataMigrationDone = true;
  // ... rest of function
}

export function resetUserDataMigration() { userDataMigrationDone = false; }
```

### Step 4: Write tests

```typescript
describe("migrateUserDataDirs", () => {
  it("moves workspace, skills, cron to new location", () => { ... });
  it("creates symlink/junction at old location", () => { ... });
  it("skips dirs that don't exist at source", () => { ... });
  it("skips dirs already migrated (symlink exists)", () => { ... });
  it("skips dirs where target has content (conflict)", () => { ... });
  it("rolls back if symlink fails", () => { ... });
  it("handles cross-FS move via cpSync", () => { ... });
  it("runs only once per process", () => { ... });
});
```

### Step 5: Compile and test

```bash
pnpm build && pnpm test
```

## Todo List

- [ ] Implement `migrateUserDataDirs()` in state-migrations.ts
- [ ] Implement `moveDirWithSymlink()` helper
- [ ] Wire migration into gateway startup
- [ ] Add guard flag + reset for tests
- [ ] Write unit tests
- [ ] Test on Windows (junction behavior)
- [ ] Compile check + full test suite

## Success Criteria

1. Setting `userDataDir` for first time → workspace/, skills/, cron/ moved from `~/.operis/` to target
2. Symlinks/junctions at old locations → old paths still work
3. Already-migrated dirs (symlink exists) → skipped cleanly
4. Conflicting target (non-empty) → skipped with warning, no data loss
5. Symlink failure → rollback to original location
6. Sessions, credentials, plugins, logs NOT moved (stay in `~/.operis/`)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Workspace has open file handles during move | Low | Medium | Move happens at startup before subsystems init |
| Junction requires same drive on Windows | Very Low | Low | Junction works across drives; only symlink requires admin |
| Partial migration (1 of 3 dirs fails) | Low | Medium | Each dir independent; warnings logged; user can retry |

## Security Considerations

- Both source and target are user-owned directories
- No elevation required for junction on Windows
- Symlink target validated via path.resolve normalization
