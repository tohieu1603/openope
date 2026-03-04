# Researcher 02: Hardcoded Paths & Migration Patterns

Date: 2026-03-02

---

## 1. Hardcoded `.operis` Paths

### A. `src/agents/workspace.ts` — lines 15, 17

```ts
// line 15
return path.join(homedir(), ".operis", `workspace-${profile}`);
// line 17
return path.join(homedir(), ".operis", "workspace");
```

`resolveDefaultAgentWorkspaceDir()` always constructs paths under `~/.operis/workspace[-(profile)]`.

**Fix:** Replace both with a call that first checks a user-configured workspace base dir (e.g., from config or env var `OPERIS_WORKSPACE_DIR`), then falls back to current behavior.

```ts
const baseDir = env.OPERIS_WORKSPACE_DIR?.trim()
  ? resolveUserPath(env.OPERIS_WORKSPACE_DIR.trim())
  : path.join(homedir(), ".operis");
return path.join(baseDir, profile ? `workspace-${profile}` : "workspace");
```

Risk: **Medium** — `DEFAULT_AGENT_WORKSPACE_DIR` is a module-level constant evaluated at import time (line 20). Env var must be set before module loads, or the constant must be converted to a lazy function.

---

### B. `src/agents/agent-scope.ts` — line 181

```ts
// line 181
return path.join(os.homedir(), ".operis", `workspace-${id}`);
```

Fallback path for non-default agents that have no configured workspace.

**Fix:** Same as A — replace `os.homedir(), ".operis"` with a call to the shared `resolveDefaultAgentWorkspaceDir`-style helper so the base dir is configurable.

Risk: **Low-Medium** — only hits when agent has no explicit `workspace` config entry.

---

### C. `src/hooks/bundled/session-memory/handler.ts` — line 79

```ts
// line 79
: path.join(os.homedir(), ".operis", "workspace");
```

Fallback when `cfg` is undefined (no config context injected into the hook event).

**Fix:** Call `resolveDefaultAgentWorkspaceDir()` from `workspace.ts` instead of inlining the path. This centralizes the logic.

```ts
import { resolveDefaultAgentWorkspaceDir } from "../../../agents/workspace.js";
// ...
const workspaceDir = cfg
  ? resolveAgentWorkspaceDir(cfg, agentId)
  : resolveDefaultAgentWorkspaceDir();
```

Risk: **Low** — pure refactor; no behavioral change unless env var is set.

---

## 2. How `resolveConfigDir` / `CONFIG_DIR` Works (`src/utils.ts:248-262`)

```ts
export function resolveConfigDir(env, homedir): string {
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (override) return resolveUserPath(override);
  const newDir = path.join(homedir(), ".operis");
  if (fs.existsSync(newDir)) return newDir;
  // falls through to legacy resolution...
}
export const CONFIG_DIR = resolveConfigDir(); // module-level constant
```

`CONFIG_DIR` is already overridable via `OPENCLAW_STATE_DIR`. The workspace paths are NOT controlled by this same mechanism — they are separate hardcoded paths.

---

## 3. Cron Store (`src/cron/store.ts`)

```ts
import { CONFIG_DIR } from "../utils.js";
export const DEFAULT_CRON_DIR = path.join(CONFIG_DIR, "cron");
export const DEFAULT_CRON_STORE_PATH = path.join(DEFAULT_CRON_DIR, "jobs.json");
```

Cron paths piggyback on `CONFIG_DIR` (`~/.operis/cron/jobs.json`). Already configurable via `OPENCLAW_STATE_DIR`. No extra changes needed here unless the goal is to separate cron from state dir.

---

## 4. Existing Migration Pattern (`src/infra/state-migrations.ts`)

The file implements a robust, battle-tested migration system:

### Key functions:

| Function | What it does |
|---|---|
| `autoMigrateLegacyStateDir` | Renames `~/.openclaw` → `~/.operis`; creates symlink at old path for backward compat |
| `detectLegacyStateMigrations` | Scans for old sessions dir, agent dir, WhatsApp auth that need moving |
| `migrateLegacySessions` | Reads old `sessions/sessions.json`, canonicalizes keys, merges into new agent-scoped path |
| `migrateLegacyAgentDir` | Moves `{stateDir}/agent/` → `{stateDir}/agents/{agentId}/agent/` |
| `migrateLegacyWhatsAppAuth` | Moves `creds.json` etc from oauth root to `whatsapp/default/` |
| `runLegacyStateMigrations` | Orchestrates all three migration steps |
| `autoMigrateLegacyState` | Entry point — runs state dir migration, then agent/sessions migrations |

### Migration mechanics:
- Uses `fs.renameSync` (atomic on same filesystem) for moves
- Creates symlink (`dir` type on POSIX, `junction` on Win32) at old path pointing to new
- Rolls back rename if symlink creation fails
- Backs up non-empty remnants as `{dir}.legacy-{timestamp}`
- Guards with module-level `autoMigrateChecked` boolean (runs once per process)
- Skips if `OPENCLAW_STATE_DIR` is explicitly set

### Pattern to reuse for workspace migration:
```ts
// Pattern: rename → symlink-back → rollback on failure
fs.renameSync(oldWorkspaceDir, newWorkspaceDir);
try {
  fs.symlinkSync(newWorkspaceDir, oldWorkspaceDir, process.platform === "win32" ? "junction" : "dir");
} catch {
  fs.renameSync(newWorkspaceDir, oldWorkspaceDir); // rollback
}
```

---

## 5. Desktop Path Resolution (Cross-Platform)

Node.js has no built-in `getDesktopPath()`. Options:

| Approach | Pros | Cons |
|---|---|---|
| `path.join(os.homedir(), "Desktop")` | Zero deps, works on Win/macOS/most Linux | Wrong if user relocated Desktop (common on Windows via shell folder redirect) |
| `env-paths` npm package | Handles XDG on Linux | Still uses `~/Desktop` on Win/macOS |
| Windows: `SHGetKnownFolderPath` via `winreg` or PowerShell | Correct even with relocation | Windows-only, requires extra dep |
| macOS: `NSFileManager` | Correct | macOS-only |

**Recommended:** `path.join(os.homedir(), "Desktop")` covers 95%+ of cases with zero deps. For production correctness on Windows, query registry key `HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders\Desktop` or run `PowerShell -c "[Environment]::GetFolderPath('Desktop')"`.

---

## 6. Risk Summary

| Location | Change Type | Risk |
|---|---|---|
| `workspace.ts:15,17` — `resolveDefaultAgentWorkspaceDir` | Replace `.operis` literal with configurable base | Medium — module-level const; needs lazy eval or process startup ordering |
| `agent-scope.ts:181` — `resolveAgentWorkspaceDir` | Replace literal with shared helper | Low-Medium |
| `handler.ts:79` — session-memory hook | Delegate to `resolveDefaultAgentWorkspaceDir()` | Low — pure refactor |
| `cron/store.ts` | No change needed | None |
| State migration | Reuse `rename+symlink` pattern from `state-migrations.ts` | Low if pattern is copied faithfully |

---

## Unresolved Questions

1. Is the new configurable workspace dir stored in `operis.json` config or as an env var? (Affects whether `DEFAULT_AGENT_WORKSPACE_DIR` module constant can remain or must become lazy.)
2. Should the Desktop default be per-user-session (query at runtime) or baked in at startup?
3. Does the migration need to handle `workspace-{profile}` variants (multiple profile dirs), or only the default `workspace`?
4. Should cron dir follow the new workspace base or stay under `CONFIG_DIR` (state dir)?
