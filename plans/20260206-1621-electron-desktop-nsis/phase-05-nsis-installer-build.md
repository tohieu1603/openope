# Phase 05: NSIS Installer & Build Pipeline

**Parent:** [plan.md](./plan.md) | **Deps:** Phases 1-4 | **Blocks:** None
**Date:** 2026-02-06 | **Priority:** High | **Status:** DONE | **Completed:** 2026-02-08

## Overview

Configure electron-builder for NSIS installer. Build pipeline: gateway -> client-web -> Electron app. Bundle gateway dist, client-web dist, and cloudflared.exe as extraResources. Handle asarUnpack for native modules (sharp, better-sqlite3).

**Key clarification:** `pnpm install` and `pnpm build` are BUILD TIME only (developer machine / CI). End users NEVER run CLI commands. The NSIS installer bundles pre-built artifacts.

## Key Insights

- electron-builder auto-detects native `.node` files for asarUnpack
- Gateway runs as external process (extraResources), NOT inside ASAR
- cloudflared.exe (~50MB) goes in extraResources
- sharp needs explicit asarUnpack: `**/node_modules/sharp/**/*`
- node-pty and playwright-core must be EXCLUDED from desktop build
- Root build: `pnpm build` -> tsdown -> `dist/entry.js` + `dist/control-ui/`
- **No daemon install at install time** -- Electron manages gateway lifecycle at runtime
- **First-run onboard runs at runtime** via `node dist/entry.js onboard --non-interactive ...` (Phase 1)

## Build-Time vs Install-Time vs Runtime

```
BUILD TIME (developer / CI):
  pnpm install              -> node_modules (all deps including native)
  pnpm build                -> dist/entry.js (gateway) + dist/control-ui/ (UI)
  download cloudflared.exe  -> apps/windows-desktop/resources/
  tsc (electron src)        -> apps/windows-desktop/dist-electron/
  electron-builder --win    -> AgentOperis-Setup-x.x.x.exe

INSTALL TIME (end user runs .exe):
  NSIS installer            -> extracts to %LOCALAPPDATA%/Programs/AgentOperis/
  Creates shortcuts         -> Desktop + Start Menu
  Registry entry (optional) -> auto-start on login
  ** No CLI commands. No pnpm. No onboard. **

RUNTIME (app starts):
  First run:
    Electron detects no config -> shows setup.html (2-token form)
    User submits tokens -> Electron spawns: node entry.js onboard --non-interactive ...
    Config created -> proceed to normal startup

  Normal startup:
    Electron spawns: node entry.js gateway (port 18789)
    Health check OK -> spawns cloudflared tunnel run --token
    Loads client-web/index.html in BrowserWindow
    System tray icon active
```

## Related Code

| File | Lines | Purpose |
|------|-------|---------|
| `tsdown.config.ts` | L7-13 | Gateway build: `src/entry.ts` -> `dist/entry.js` |
| `client-web/vite.config.ts` | L43-44 | UI build: `dist/control-ui/` |
| `package.json` | L35 | Root build script chain |
| `src/commands/onboard-non-interactive.ts` | -- | Silent onboard (runtime, Phase 1) |

## Architecture

```
Build Pipeline:
  1. pnpm build (root)           -> dist/entry.js + dist/control-ui/
  2. download cloudflared.exe    -> apps/windows-desktop/resources/
  3. tsc (electron)              -> apps/windows-desktop/dist-electron/
  4. electron-builder --win      -> AgentOperis-Setup-x.x.x.exe

Installer Contents:
  %LOCALAPPDATA%/Programs/AgentOperis/
    |-- AgentOperis.exe          (Electron shell)
    |-- resources/
    |     |-- app.asar           (Electron main + preload)
    |     |-- app.asar.unpacked/ (sharp .node files)
    |     |-- gateway/           (dist/entry.js + deps)
    |     |-- client-web/        (Vite build output)
    |     |-- setup.html         (first-run setup page)
    |     +-- cloudflared.exe    (CF tunnel binary)
    +-- ...                      (Electron runtime files)
```

## Implementation Steps

### 1. Full electron-builder.yml

```yaml
# apps/windows-desktop/electron-builder.yml
appId: com.operis.agent
productName: Agent Operis
copyright: Copyright (c) 2026 Operis

directories:
  output: release
  buildResources: resources

asar: true
asarUnpack:
  - "**/node_modules/sharp/**/*"
  - "**/node_modules/better-sqlite3/**/*"
  - "**/*.node"

extraResources:
  - from: "../../dist"
    to: "gateway"
    filter:
      - "**/*"
      - "!**/*.map"       # Exclude sourcemaps
  - from: "../../dist/control-ui"
    to: "client-web"
    filter:
      - "**/*"
      - "!**/*.map"
  - from: "resources/cloudflared.exe"
    to: "cloudflared.exe"
  - from: "resources/setup.html"
    to: "setup.html"
  - from: "resources/icons"
    to: "icons"

files:
  - "dist-electron/**/*"
  - "!node_modules/@lydell/node-pty/**"
  - "!node_modules/playwright-core/**"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico
  requestedExecutionLevel: asInvoker

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Agent Operis
  uninstallDisplayName: Agent Operis
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  deleteAppDataOnUninstall: false
  # Clean auto-start registry on uninstall
  include: "installer.nsh"
```

### 2. NSIS custom script for registry cleanup

```nsh
# apps/windows-desktop/installer.nsh
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AgentOperis"
!macroend
```

### 3. Build scripts in package.json

```jsonc
// apps/windows-desktop/package.json scripts:
{
  "scripts": {
    "prebuild": "node scripts/download-cloudflared.mjs",
    "build:gateway": "cd ../.. && pnpm build",
    "build:electron": "tsc -p tsconfig.json",
    "build:installer": "electron-builder --win --config electron-builder.yml",
    "build": "pnpm build:gateway && pnpm build:electron && pnpm build:installer",
    "dev": "tsc -p tsconfig.json && electron dist-electron/main.js"
  }
}
```

### 4. Cloudflared download script

```js
// apps/windows-desktop/scripts/download-cloudflared.mjs
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const CF_VERSION = "2024.12.0"; // Pin version
const CF_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CF_VERSION}/cloudflared-windows-amd64.exe`;
const OUTPUT = path.join(import.meta.dirname, "..", "resources", "cloudflared.exe");

if (fs.existsSync(OUTPUT)) {
  console.log("cloudflared.exe already exists, skipping download");
  process.exit(0);
}

console.log(`Downloading cloudflared ${CF_VERSION}...`);
// Download logic with redirect following
```

### 5. Exclude problematic native modules

In root `package.json` or via electron-builder config, ensure:
- `@lydell/node-pty` excluded (not needed for desktop channels)
- `playwright-core` excluded (browser automation not needed)
- `sharp` included but asarUnpacked

### 6. Sourcemap removal

```yaml
# In electron-builder.yml extraResources filter:
filter:
  - "**/*"
  - "!**/*.map"
  - "!**/*.d.ts"
```

Also ensure `client-web/vite.config.ts` build.sourcemap is `false` for production:
```ts
// Override via env: CLIENT_WEB_SOURCEMAP=false
build: {
  sourcemap: process.env.CLIENT_WEB_SOURCEMAP !== "false",
}
```

### 7. Build verification script

```bash
# Verify installer contents post-build
echo "Checking installer output..."
ls -la release/*.exe
echo "Checking extraResources structure..."
# Verify gateway/, client-web/, cloudflared.exe, setup.html all present
```

## Todo

- [ ] Write full `electron-builder.yml` with NSIS config
- [ ] Write `installer.nsh` for registry cleanup on uninstall
- [ ] Write `scripts/download-cloudflared.mjs` (pin version, download from GitHub)
- [ ] Add build scripts to `apps/windows-desktop/package.json`
- [ ] Configure asarUnpack for sharp + better-sqlite3
- [ ] Configure file exclusions (node-pty, playwright-core)
- [ ] Bundle `setup.html` in extraResources for first-run
- [ ] Remove sourcemaps from production extraResources
- [ ] Test: run `pnpm build` end-to-end, verify .exe output
- [ ] Test: install .exe on clean Windows, verify app starts
- [ ] Test: first run shows setup page, onboard works, gateway starts
- [ ] Test: verify gateway + client-web + cloudflared + setup.html all present in install dir
- [ ] Test: verify uninstaller cleans registry + files
- [ ] Test: WhatsApp + Telegram + Zalo channels work in installed app

## Success Criteria

1. `pnpm build` produces `AgentOperis-Setup-x.x.x.exe`
2. Installer runs on clean Windows 10/11, installs to `%LOCALAPPDATA%/Programs/`
3. First run: setup page appears, user enters tokens, onboard runs silently
4. Subsequent runs: gateway starts immediately, UI loads
5. Gateway dist, client-web dist, cloudflared.exe, setup.html all in resources/
6. No sourcemaps in installed app
7. Uninstaller removes files + auto-start registry entry
8. All 3 channels (WA/TG/Zalo) function in installed build

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| sharp native binary mismatch | MEDIUM | Test asarUnpack; verify .node file present |
| better-sqlite3 rebuild needed | MEDIUM | electron-rebuild if prebuild unavailable |
| cloudflared download fails in CI | LOW | Cache binary; fallback to bundled |
| Installer size ~250MB+ | LOW | Acceptable; NSIS compresses well |
| Windows Defender blocks unsigned | MEDIUM | Document; Phase 2 adds code signing |
| node-pty accidentally included | HIGH | Explicit file exclusion in electron-builder |
| First-run onboard fails silently | MEDIUM | Show error in setup page; allow retry |

## Security

- ASAR packaging for basic code protection
- Sourcemaps stripped from production
- No secrets in installer; tokens stored at runtime in %APPDATA%
- cloudflared downloaded via HTTPS from official GitHub releases
- Code signing deferred to security hardening phase (future)
- First-run tokens passed via child_process only (not persisted by Electron)

## Unresolved Questions

1. Exact electron-builder version compatibility with sharp 0.33+ -- needs local testing
2. Whether better-sqlite3 needs electron-rebuild or if prebuild covers Electron 33
3. CI pipeline for automated builds (GitHub Actions) -- out of scope for MVP
