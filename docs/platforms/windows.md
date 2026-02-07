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

### Phase 04 roadmap

- Tray integration + minimize-to-tray behavior.
- Tunnel status display UI + visual indicators.
- System notifications for gateway health + message events.

Contributions welcome.
