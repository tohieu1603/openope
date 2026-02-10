---
summary: "Agent Operis Windows installer release checklist (NSIS, code signing, distribution)"
read_when:
  - Cutting or validating an Agent Operis Windows release
  - Building the NSIS installer for distribution
  - Publishing Windows desktop release assets
title: "Windows Release (NSIS Installer)"
---

# Agent Operis Windows Release (NSIS)

Phase 05 complete: the Windows installer build pipeline is fully implemented. Release builds use Electron Builder with NSIS, bundling the Gateway, client-web UI, and cloudflared binary.

## Prereqs

- Node.js **22+** (with npm/pnpm).
- Electron 33+ and electron-builder 25+.
- `cloudflared.exe` binary (auto-downloaded by prebuild script).
- (Optional) Windows code-signing cert for authenticating the installer.
- `pnpm` or `npm` deps installed.

## Build & package

The build chain is automated and runs in sequence: prebuild → gateway → electron → installer.

### From repo root

```bash
cd apps/windows-desktop/
pnpm install          # Install Electron + electron-builder deps
pnpm build            # Full build chain
```

This runs:

1. **prebuild**: `node scripts/download-cloudflared.mjs` — downloads latest cloudflared.exe to `resources/`.
2. **build:gateway**: `cd ../.. && pnpm build` — compiles gateway + client-web UI.
3. **build:electron**: `tsc -p tsconfig.json` — transpiles TypeScript → `dist-electron/`.
4. **build:installer**: `electron-builder --win --config electron-builder.yml` — packages NSIS installer.

### Build output

The installer is created at:

```
apps/windows-desktop/release/Agent Operis.exe
```

This is a single-file installer (~150-200MB with bundled gateway/UI/tunnel binary).

## Installer configuration

Config is defined in `electron-builder.yml`:

- **ASAR unpacking**: Native modules (sharp, better-sqlite3, *.node) are extracted for runtime compatibility.
- **File filters**: Excludes test files, sourcemaps (*.map), TypeScript defs (*.d.ts) for production builds.
- **NSIS settings**:
  - `oneClick: false` — user selects install directory.
  - `perMachine: false` — per-user install (HKCU).
  - `allowToChangeInstallationDirectory: true` — custom paths supported.
  - `createDesktopShortcut: true` — desktop entry created.
  - `createStartMenuShortcut: true` — Start Menu entry created.
  - `deleteAppDataOnUninstall: false` — user config persists after uninstall.
- **Custom script**: `installer.nsh` cleans up auto-start registry on uninstall (HKCU\Software\Microsoft\Windows\CurrentVersion\Run).

## Bundled resources

The installer includes:

- **Gateway**: `dist/` (compiled TypeScript + node_modules, excluding test files + sourcemaps).
- **Client-web UI**: `dist/control-ui/` (web frontend for gateway management).
- **Cloudflared binary**: `resources/cloudflared.exe` (CF tunnel executable).
- **Setup page**: `resources/setup.html` (first-run token input form).
- **Tray icons**: `resources/tray-*.ico` (status indicators; green/yellow/red/gray).
- **App icon**: `resources/icon.ico` (installer + window icon).

## Release checklist

1. **Verify build succeeds**:
   ```bash
   cd apps/windows-desktop/
   pnpm build
   ```
   Check `release/Agent Operis.exe` exists.

2. **Test installer**:
   - Run `Agent Operis.exe` on a clean Windows 10/11 VM.
   - Verify first-run setup page appears.
   - Confirm gateway launches after token submission.
   - Check desktop/Start Menu shortcuts created.
   - Test uninstall + verify registry cleanup (regedit: HKCU\Software\Microsoft\Windows\CurrentVersion\Run, "AgentOperis" should be gone).

3. **Code signing** (optional but recommended):
   ```bash
   signtool sign /f cert.pfx /p password /t http://timestamp.server "release/Agent Operis.exe"
   ```
   (Requires valid code-signing cert + timestamp authority.)

4. **Publish**:
   - Upload `Agent Operis.exe` to GitHub Releases (tag `vYYYY.M.D`).
   - Document changes in CHANGELOG.md.
   - Tag commit: `git tag vYYYY.M.D && git push origin --tags`.

5. **Verify distribution**:
   - Test download + install from fresh Windows machine.
   - Confirm file integrity (file size, hash match).
   - Check installer signature (if signed): `signtool verify /pa "Agent Operis.exe"`.

## Definition of done

- Installer builds cleanly with no warnings.
- First-run onboarding completes end-to-end.
- Gateway + tunnel auto-start after setup.
- Uninstall removes all registry entries + shortcuts.
- Release assets are published to GitHub with proper versioning.
