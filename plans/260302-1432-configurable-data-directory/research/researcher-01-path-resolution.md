# Path Resolution & Config Schema Research
Date: 2026-03-02

## 1. resolveStateDir() — Step by Step
`src/config/paths.ts:49-74`

1. Check `OPENCLAW_STATE_DIR` or `CLAWDBOT_STATE_DIR` env var → if set, return `resolveUserPath(override)` (handles `~` expansion and `path.resolve`)
2. Compute `newDir = ~/.operis`
3. If `~/.operis` exists on disk → return it
4. Scan legacy dirs (`~/.openclaw`, `~/.clawdbot`, `~/.moltbot`, `~/.moldbot`) → return first that exists
5. Fallback: return `~/.operis` (even if not created yet)

**Module-level constant:** `export const STATE_DIR = resolveStateDir()` — evaluated once at import time.

## 2. resolveConfigDir() in utils.ts — Step by Step
`src/utils.ts:248-266`

1. Check `OPENCLAW_STATE_DIR` or `CLAWDBOT_STATE_DIR` → if set, return `resolveUserPath(override)`
2. Compute `newDir = path.join(homedir(), ".operis")`
3. If `~/.operis` exists → return it
4. Fallback: return `~/.operis` (no legacy dir scan)

**Difference from resolveStateDir():** Does NOT scan legacy dirs (`.openclaw`, etc.). Effectively returns `~/.operis` always unless overridden or the new dir already exists — which is identical behavior since step 3/4 both return `~/.operis`. This function is redundant / duplicates a simplified form of `resolveStateDir()`.

## 3. Config Path Resolution
`src/config/paths.ts:95-165`

- `resolveCanonicalConfigPath()` → `$STATE_DIR/operis.json` (or env override `OPENCLAW_CONFIG_PATH`)
- `resolveConfigPath()` → checks `$stateDir/operis.json`, then legacy filenames (`openclaw.json`, `clawdbot.json`, etc.), returns first existing
- `resolveConfigPathCandidate()` → scans all state dirs (new + legacy) for config files, returns first hit
- `CONFIG_PATH = resolveConfigPathCandidate()` — module-level constant, evaluated at import

## 4. OpenClawConfig Type
`src/config/types.openclaw.ts:28-100`

Top-level config object. Key sections: `auth`, `env`, `gateway`, `skills`, `session`, `channels`, `tools`, `agents`, `memory`, etc.

**No `dataDir` field exists.** To add it, the correct location is the top-level `OpenClawConfig` type in `types.openclaw.ts`. No sub-type file is needed — it's a simple string path override.

Candidate insertion point (after `meta`, before `auth`):
```ts
/** Override the data/state directory (default: ~/.operis). */
dataDir?: string;
```

## 5. Zod Schema — Where to Add Validation
`src/config/zod-schema.core.ts` — contains primitive schemas only (models, providers, TTS, etc.). The root config schema is elsewhere (not in the 5-file budget).

The root Zod schema that validates `OpenClawConfig` must also accept `dataDir?: z.string().optional()`. Search target: file containing `OpenClawConfigSchema` or equivalent root schema object.

## 6. daemon/paths.ts — The Bug
`src/daemon/paths.ts:33-42`

```ts
export function resolveGatewayStateDir(env): string {
  const override = env.OPENCLAW_STATE_DIR?.trim();
  // ...
  const suffix = resolveGatewayProfileSuffix(env.OPENCLAW_PROFILE);
  return path.join(home, `.openclaw${suffix}`);  // <-- BUG: hardcoded .openclaw
}
```

This function ignores the new `.operis` dir and legacy fallback logic entirely. It hardcodes `.openclaw` as the state dir name, making the daemon (gateway process) diverge from the main path resolution in `src/config/paths.ts`. Any `dataDir` feature must also fix this function.

## 7. Env Vars Affecting Path Resolution

| Env Var | Effect |
|---|---|
| `OPENCLAW_STATE_DIR` | Override state/data dir (main paths + daemon) |
| `CLAWDBOT_STATE_DIR` | Legacy alias for state dir (main paths only, NOT daemon) |
| `OPENCLAW_CONFIG_PATH` | Override config file path directly |
| `CLAWDBOT_CONFIG_PATH` | Legacy alias for config path |
| `OPENCLAW_OAUTH_DIR` | Override OAuth credentials directory |
| `OPENCLAW_GATEWAY_PORT` | Override gateway port |
| `CLAWDBOT_GATEWAY_PORT` | Legacy alias for gateway port |
| `OPENCLAW_NIX_MODE` | Enable Nix mode (=1) |
| `OPENCLAW_PROFILE` | Profile suffix for daemon state dir |
| `HOME` / `USERPROFILE` | Home dir fallback in daemon/paths.ts |

## 8. Chicken-and-Egg Problem

**Problem:** The config file lives inside the state/data dir (`$STATE_DIR/operis.json`). If `dataDir` is a config option, you cannot read the config before you know `dataDir`, and you cannot know `dataDir` without reading the config.

**Current resolution order (without `dataDir` feature):**
1. Env var `OPENCLAW_STATE_DIR` → immediate answer, no config needed
2. Filesystem probe: `~/.operis` exists? → use it
3. Filesystem probe: legacy dirs exist? → use first found
4. Default: `~/.operis`

**Resolution strategies for adding `dataDir` config option:**

A. **Env var only** — keep `OPENCLAW_STATE_DIR` as the only override mechanism, don't add `dataDir` to config. Sidesteps the problem entirely. (KISS/YAGNI-compliant)

B. **Two-pass bootstrap** — read config from default location first, extract `dataDir` if present, then re-resolve state dir and re-read config from new location. Fragile: what if config at default location has different content than at `dataDir`?

C. **Symlink or redirect file** — leave a small pointer file at `~/.operis/data-dir` that contains the real path. Read this before reading config. Low coupling, no circular dependency.

D. **Config path separate from data dir** — treat config file location as independent of data dir. User sets `OPENCLAW_CONFIG_PATH` to a fixed location outside the data dir; config contains `dataDir`. Config is always found at fixed path; data dir can be changed per-config. This is the cleanest split.

## Unresolved Questions

1. Where is the root Zod schema (`OpenClawConfigSchema`) defined? Need to find the file that wraps all sub-schemas into the root config validator to add `dataDir` validation there.
2. How many callers use `STATE_DIR` / `CONFIG_PATH` module-level constants (import-time evaluation)? Late binding of `dataDir` from config won't affect these — they're already resolved before config is loaded.
3. Does `daemon/paths.ts` `resolveGatewayStateDir()` get called after config is loaded, or at startup before config? Affects whether a config-driven `dataDir` can reach it.
4. Is `resolveConfigDir()` in `utils.ts` used anywhere meaningful, or is it dead code that can be removed?
