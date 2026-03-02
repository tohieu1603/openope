---
title: "Phase 5: NSIS Installer userDataDir Picker"
status: pending
effort: 2h
---

# Phase 5: NSIS Installer userDataDir Picker

## Context Links

- [plan.md](./plan.md) — overview
- [Phase 2](./phase-02-datadir-config-resolve.md) — `userDataDir` config field
- [Phase 4](./phase-04-api-endpoint.md) — API for changing userDataDir
- `apps/windows-desktop/installer.nsh` — existing custom NSIS script
- `apps/windows-desktop/electron-builder.yml` — NSIS config
- `apps/windows-desktop/src/onboard-manager.ts` — first-run config creation
- `apps/windows-desktop/src/edition.ts` — `resolveStateDir()`, `resolveConfigPath()`

## Overview

- **Priority:** Medium (enables user-chosen data dir during install)
- **Risk:** Low — NSIS custom page is well-documented; Electron reads seed file
- **Description:** Add a custom NSIS installer page where user picks the OperisAgent/ data directory (default: `~/Desktop/OperisAgent/`). Installer writes a seed file. Electron's `OnboardManager` reads seed on first launch and includes `userDataDir` in config.

## Key Insights

1. **NSIS hook available:** `customPageAfterChangeDir` macro fires after install directory selection — ideal placement for data dir picker
2. **Seed file pattern:** NSIS writes `~/.operis/installer-seed.json` with `{ "userDataDir": "..." }`. Electron reads it during onboard, merges into config, deletes seed
3. **No registry dependency** — plain JSON file avoids Windows registry complexity
4. **OnboardManager already creates `~/.operis/`** — NSIS just needs to ensure dir exists before writing seed
5. **Default path:** `$DESKTOP\OperisAgent` (NSIS `$DESKTOP` variable = user's Desktop folder)
6. **electron-builder 25.1.8** supports `customPageAfterChangeDir` in assisted installer template

## Requirements

### Functional
- New NSIS page after install directory selection: "Choose data directory"
- Directory browse dialog with default `$DESKTOP\OperisAgent`
- Write `~/.operis/installer-seed.json` containing `{ "userDataDir": "<chosen-path>" }`
- Create `userDataDir` folder during install (mkdir)
- `OnboardManager.createMinimalConfig()` reads seed file, includes `userDataDir` in config
- Delete seed file after consumption
- If user doesn't change default → still writes seed (explicit is better)

### Non-Functional
- No admin elevation required (user-level paths only)
- Seed file format: JSON, single key
- Backward compatible: missing seed file → no userDataDir in config (current behavior)

## Architecture

### Install-Time Flow
```
NSIS Installer
├─ Welcome Page
├─ Install Directory Page (app install location)
├─ [NEW] Data Directory Page (OperisAgent/ location)
│   ├─ Default: $DESKTOP\OperisAgent
│   ├─ Browse button → directory picker
│   └─ Write seed file + create data dir
├─ Install Files
└─ Finish Page
```

### Seed File Lifecycle
```
Install time:
  NSIS → mkdir ~/.operis/ → write ~/.operis/installer-seed.json

First launch:
  Electron main.ts → OnboardManager
    → isConfigured()? No
    → createMinimalConfig()
      → read installer-seed.json
      → merge userDataDir into config
      → write operis.json
      → delete installer-seed.json
```

## Related Code Files

| File | Change |
|------|--------|
| `apps/windows-desktop/installer.nsh` | Add `customPageAfterChangeDir` macro with data dir picker |
| `apps/windows-desktop/src/onboard-manager.ts` | Read seed file in `createMinimalConfig()`, merge userDataDir |
| `apps/windows-desktop/src/edition.ts` | Add `resolveInstallerSeedPath()` helper |

## Implementation Steps

### Step 1: Update installer.nsh — Add custom page

```nsh
; Agent Operis NSIS custom installer script

Var DataDir

; ── Data directory page (after install dir selection) ──
!macro customPageAfterChangeDir
  ; Create custom page for data directory selection
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 24u "Choose where to store your data (workspace, skills, cron):"
  Pop $0

  ; Default: Desktop\OperisAgent
  StrCpy $DataDir "$DESKTOP\OperisAgent"

  ${NSD_CreateDirRequest} 0 30u 75% 12u "$DataDir"
  Pop $1

  ${NSD_CreateBrowseButton} 77% 29u 23% 14u "Browse..."
  Pop $2
  ${NSD_OnClick} $2 onBrowseDataDir

  nsDialogs::Show
!macroend

Function onBrowseDataDir
  nsDialogs::SelectFolderDialog "Select OperisAgent Data Directory" "$DataDir"
  Pop $0
  ${If} $0 != error
    StrCpy $DataDir $0
    ${NSD_SetText} $1 $DataDir
  ${EndIf}
FunctionEnd

; ── Write seed file + create data dir after install ──
!macro customInstall
  ; Ensure ~/.operis/ exists
  CreateDirectory "$PROFILE\.operis"

  ; Create data directory
  CreateDirectory "$DataDir"

  ; Write installer seed file
  FileOpen $0 "$PROFILE\.operis\installer-seed.json" w
  FileWrite $0 '{"userDataDir":"'
  ; Escape backslashes for JSON
  ${StrRep} $R0 $DataDir "\" "\\"
  FileWrite $0 $R0
  FileWrite $0 '"}'
  FileClose $0
!macroend

; ── Actual uninstall actions ──
!macro customUnInstall
  ; Clean up auto-start registry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AgentOperis"
!macroend
```

**Note:** `${StrRep}` requires `StrFunc.nsh` header. Add `!include "StrFunc.nsh"` and `${StrRep}` declaration at top of file. Alternative: use `/` forward slashes (Node.js handles both on Windows).

### Step 2: Update OnboardManager — Read seed file

In `apps/windows-desktop/src/onboard-manager.ts`, update `createMinimalConfig()`:

```typescript
private get seedFilePath(): string {
  return path.join(this.stateDir, "installer-seed.json");
}

/** Read and consume installer seed file (userDataDir from NSIS) */
private consumeInstallerSeed(): { userDataDir?: string } {
  try {
    if (!fs.existsSync(this.seedFilePath)) return {};
    const raw = fs.readFileSync(this.seedFilePath, "utf-8");
    const seed = JSON.parse(raw);
    // Delete seed after reading
    fs.unlinkSync(this.seedFilePath);
    return { userDataDir: seed.userDataDir };
  } catch {
    return {};
  }
}

createMinimalConfig(): void {
  if (!fs.existsSync(this.stateDir)) {
    fs.mkdirSync(this.stateDir, { recursive: true });
  }

  // Read installer seed (userDataDir from NSIS)
  const seed = this.consumeInstallerSeed();

  const randomHex = (bytes: number) =>
    Array.from({ length: bytes }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
    ).join("");
  const gatewayToken = randomHex(24);
  const hooksToken = randomHex(24);

  const config: Record<string, unknown> = {
    gateway: { ... },  // existing config
    hooks: { ... },
    // ... rest unchanged
  };

  // Include userDataDir from installer seed
  if (seed.userDataDir) {
    config.userDataDir = seed.userDataDir;
  }

  fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
}
```

### Step 3: Update edition.ts — Add seed path helper

```typescript
/** Resolve installer seed file path (~/.operis/installer-seed.json) */
export function resolveInstallerSeedPath(): string {
  return path.join(resolveStateDir(), "installer-seed.json");
}
```

### Step 4: Handle upgrade case (existing config + seed)

If user reinstalls/upgrades and a config already exists, `createMinimalConfig()` won't run. Add seed consumption to `ensureElectronConfig()`:

```typescript
ensureElectronConfig(): void {
  try {
    const raw = fs.readFileSync(this.configFilePath, "utf-8");
    const config = JSON.parse(raw);
    let modified = false;

    // Consume installer seed if present (upgrade/reinstall)
    const seed = this.consumeInstallerSeed();
    if (seed.userDataDir && !config.userDataDir) {
      config.userDataDir = seed.userDataDir;
      modified = true;
    }

    // ... rest of existing ensureElectronConfig logic
  }
}
```

### Step 5: Compile and test

```bash
cd apps/windows-desktop && pnpm build:electron
# Manual test: build installer and verify custom page appears
pnpm build:installer
```

## Todo List

- [ ] Update `installer.nsh` with `customPageAfterChangeDir` macro
- [ ] Add `customInstall` macro for seed file + data dir creation
- [ ] Update `OnboardManager.createMinimalConfig()` to read seed
- [ ] Add `consumeInstallerSeed()` method
- [ ] Handle upgrade case in `ensureElectronConfig()`
- [ ] Add `resolveInstallerSeedPath()` to edition.ts
- [ ] Build installer and manual test custom page
- [ ] Test fresh install + upgrade scenarios

## Success Criteria

1. Fresh install → custom page shows data dir picker with Desktop/OperisAgent default
2. User picks custom path → seed file written → Electron reads it → `userDataDir` in config
3. Default accepted → same flow, Desktop/OperisAgent in config
4. Upgrade (config exists) → seed consumed, `userDataDir` added without overwriting existing config
5. No seed file → backward compat, no `userDataDir` added (current behavior)
6. Data directory created during install (even if empty)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| NSIS StrRep not available | Low | Low | Use forward slashes or include StrFunc.nsh |
| Seed file left behind (Electron crash before consuming) | Very Low | Low | Seed is idempotent; consumed on next startup |
| User picks invalid path | Low | Low | NSIS browse dialog only allows valid dirs |

## Security Considerations

- Seed file contains only a directory path — no secrets
- File created in user-owned `~/.operis/` — no elevation needed
- Deleted after consumption — no lingering state

## Next Steps

Phase 6: Client-web Settings UI to change `userDataDir` post-install via `config.userDataDir.set` API.
