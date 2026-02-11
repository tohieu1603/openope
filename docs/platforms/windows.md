---
summary: "Windows (WSL2) support + companion app status"
read_when:
  - Installing OpenClaw on Windows
  - Looking for Windows companion app status
title: "Windows (WSL2)"
---

# Windows (WSL2)

OpenClaw on Windows is recommended **via WSL2** (Ubuntu recommended). The
CLI + Gateway run inside Linux, which keeps the runtime consistent and makes
tooling far more compatible (Node/Bun/pnpm, Linux binaries, skills). Native
Windows might be trickier. WSL2 gives you the full Linux experience — one command
to install: `wsl --install`.

Native Windows companion apps are planned.

## Install (WSL2)

- [Getting Started](/start/getting-started) (use inside WSL)
- [Install & updates](/install/updating)
- Official WSL2 guide (Microsoft): https://learn.microsoft.com/windows/wsl/install

## Gateway

- [Gateway runbook](/gateway)
- [Configuration](/gateway/configuration)

## Gateway service install (CLI)

Inside WSL2:

```
openclaw onboard --install-daemon
```

Or:

```
openclaw gateway install
```

Or:

```
openclaw configure
```

Select **Gateway service** when prompted.

Repair/migrate:

```
openclaw doctor
```

## Advanced: expose WSL services over LAN (portproxy)

WSL has its own virtual network. If another machine needs to reach a service
running **inside WSL** (SSH, a local TTS server, or the Gateway), you must
forward a Windows port to the current WSL IP. The WSL IP changes after restarts,
so you may need to refresh the forwarding rule.

Example (PowerShell **as Administrator**):

```powershell
$Distro = "Ubuntu-24.04"
$ListenPort = 2222
$TargetPort = 22

$WslIp = (wsl -d $Distro -- hostname -I).Trim().Split(" ")[0]
if (-not $WslIp) { throw "WSL IP not found." }

netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$ListenPort `
  connectaddress=$WslIp connectport=$TargetPort
```

Allow the port through Windows Firewall (one-time):

```powershell
New-NetFirewallRule -DisplayName "WSL SSH $ListenPort" -Direction Inbound `
  -Protocol TCP -LocalPort $ListenPort -Action Allow
```

Refresh the portproxy after WSL restarts:

```powershell
netsh interface portproxy delete v4tov4 listenport=$ListenPort listenaddress=0.0.0.0 | Out-Null
netsh interface portproxy add v4tov4 listenport=$ListenPort listenaddress=0.0.0.0 `
  connectaddress=$WslIp connectport=$TargetPort | Out-Null
```

Notes:

- SSH from another machine targets the **Windows host IP** (example: `ssh user@windows-host -p 2222`).
- Remote nodes must point at a **reachable** Gateway URL (not `127.0.0.1`); use
  `openclaw status --all` to confirm.
- Use `listenaddress=0.0.0.0` for LAN access; `127.0.0.1` keeps it local only.
- If you want this automatic, register a Scheduled Task to run the refresh
  step at login.

## Step-by-step WSL2 install

### 1) Install WSL2 + Ubuntu

Open PowerShell (Admin):

```powershell
wsl --install
# Or pick a distro explicitly:
wsl --list --online
wsl --install -d Ubuntu-24.04
```

Reboot if Windows asks.

### 2) Enable systemd (required for gateway install)

In your WSL terminal:

```bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Then from PowerShell:

```powershell
wsl --shutdown
```

Re-open Ubuntu, then verify:

```bash
systemctl --user status
```

### 3) Install OpenClaw (inside WSL)

Follow the Linux Getting Started flow inside WSL:

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm ui:build # auto-installs UI deps on first run
pnpm build
openclaw onboard
```

Full guide: [Getting Started](/start/getting-started)

## Windows Electron app (Phase 01)

**Status: First-run onboarding scaffold complete.**

A native Windows Electron app is under development at `apps/windows-desktop/`. Phase 01 includes:

- **Electron 33+** + **electron-builder 25+** for packaging/NSIS installer
- **First-run detection** via `~/.openclaw/openclaw.json` config check
- **Setup page** (setup.html) for token input (Anthropic + optional CF tunnel)
- **IPC bridge** (preload.ts) exposing `getGatewayPort()`, `onGatewayStatus`, `submitOnboard()`, `onboardComplete`
- **Onboard manager** handling non-interactive setup via `openclaw onboard --non-interactive`
- **NSIS installer** with bundled Gateway + client-web UI (extraResources)

### Project structure

```
apps/windows-desktop/
  ├── src/
  │   ├── main.ts              # BrowserWindow + first-run flow
  │   ├── preload.ts           # contextBridge IPC
  │   ├── onboard-manager.ts   # Config check + onboard spawn
  │   └── types.ts             # Shared types (GatewayStatus, TunnelStatus)
  ├── resources/
  │   ├── setup.html           # First-run token form
  │   └── icon.ico             # App icon (placeholder)
  ├── package.json             # Electron + electron-builder
  ├── electron-builder.yml     # NSIS config + extraResources
  └── tsconfig.json            # ES2022 → dist-electron/
```

### Key features

- **First-run UX**: On launch, checks for `~/.openclaw/openclaw.json`. If missing, shows setup.html.
- **Setup form**: User enters Anthropic token (required) + optional CF tunnel token.
- **Non-interactive onboard**: Submits tokens to `gateway/entry.js onboard --non-interactive`.
- **Bundled gateway**: electron-builder extraResources bundles `gateway/` dist + `client-web/` UI.
- **Port**: Gateway runs on localhost:18789 by design (loopback).

### Phase 02 (Complete)

**Gateway process lifecycle management implemented.**

- **GatewayManager** spawns Node.js gateway via `process.execPath` + `entry.js`.
- **Health check**: TCP connection test every 5s (3s timeout).
- **Crash recovery**: Exponential backoff restart (1s → 30s max, reset on successful run).
- **Graceful shutdown**: SIGTERM → 5s wait → taskkill force-kill (Windows).
- **Status events**: `starting | running | error | stopped` sent to renderer via IPC with optional detail msg.
- **Electron lifecycle**: Gateway starts after first-run onboarding completes, stops on app quit.

### Phase 03 (Complete)

**Cloudflare Tunnel Integration implemented.**

- **TunnelManager** encrypts CF tunnel token via Windows safeStorage (DPAPI).
- **cloudflared binary resolution**: checks bundled resources, then userData directory.
- **Auto-start**: tunnel starts when gateway becomes healthy.
- **Status monitoring**: "connecting" → "connected" → "disconnected"/"error".
- **Graceful stop**: SIGTERM → 5s wait → taskkill force-kill.
- **Token management**: secure storage via safeStorage, passed from first-run setup.

### Phase 04 (Complete)

**Tray integration + UI improvements implemented.**

- Tray icon integration with status indicators.
- Minimize-to-tray behavior + taskbar suppression.
- Tunnel status display UI + visual status icons.
- System notifications for gateway health + message events.

### Phase 05 (Complete)

**NSIS Installer Build Pipeline finalized.**

- **Full NSIS build config**: electron-builder.yml with asarUnpack, file exclusions, sourcemap removal.
- **Custom installer script**: installer.nsh handles Windows registry cleanup (auto-start entry removal on uninstall).
- **Cloudflared bundling**: download-cloudflared.mjs downloads cloudflared.exe binary pre-build.
- **Complete build chain**: prebuild → build:gateway → build:electron → build:installer.
- **Test coverage**: 43+ comprehensive electron-builder config tests (electron-builder-config.test.ts).

#### Build workflow

Build the Windows installer:

```bash
cd apps/windows-desktop/
pnpm build
```

This runs the full pipeline:
1. `pnpm prebuild` - Downloads cloudflared.exe to resources/
2. `pnpm build:gateway` - Builds gateway + client-web dist
3. `pnpm build:electron` - Compiles TypeScript → dist-electron/
4. `pnpm build:installer` - Runs electron-builder (NSIS packaging)

Output: `release/Agent Operis.exe` (installer + bundled gateway/UI/cloudflared).

#### Installer features

- **One-click setup** disabled (perMachine: false, allowToChangeInstallationDirectory: true).
- **Desktop + Start Menu shortcuts** auto-created.
- **Auto-start registry**: AgentOperis entry added on install.
- **Clean uninstall**: Registry cleanup removes auto-start entry.
- **ASAR unpacking**: Node native modules (sharp, better-sqlite3, *.node) extracted for runtime compatibility.
- **Sourcemap exclusion**: Production builds omit *.map files (size optimization).

#### Project structure (Phase 05)

```
apps/windows-desktop/
  ├── scripts/
  │   └── download-cloudflared.mjs   # Pre-build cloudflared fetch
  ├── src/
  │   ├── main.ts
  │   ├── preload.ts
  │   ├── onboard-manager.ts
  │   ├── types.ts
  │   └── __tests__/
  │       └── electron-builder-config.test.ts  # 43+ tests
  ├── resources/
  │   ├── setup.html
  │   ├── icon.ico + tray icons
  │   └── cloudflared.exe  # Downloaded by prebuild
  ├── package.json         # Build scripts updated
  ├── electron-builder.yml # Full NSIS + asarUnpack config
  ├── installer.nsh        # Registry cleanup on uninstall
  └── tsconfig.json
```

#### Development notes

- cloudflared binary is fetched from Cloudflare releases (pre-build step).
- NSIS script handles Windows-specific cleanup (registry, auto-start).
- Electron Builder v25+ ensures cross-platform compatibility.
- All build outputs are tested via 43+ unit tests.

Contributions welcome.
