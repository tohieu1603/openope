# Scout Report: Electron Desktop Wrapper - Codebase Analysis

## 1. Gateway Startup/Entry
**File:** `src/gateway/server.impl.ts`
- `startGatewayServer(port = 18789, opts: GatewayServerOptions)` → `Promise<GatewayServer>`
- GatewayServer has `close(opts?)` for graceful shutdown
- Options: `bind`, `host`, `controlUiEnabled`, `auth`, `tailscale`
- Relation: Primary entry for Electron main process to spawn gateway

## 2. Tailscale Integration Pattern (template for Cloudflare)
**File:** `src/gateway/server-tailscale.ts`
- `startGatewayTailscaleExposure(params)` → `Promise<cleanup | null>`
- Params: `tailscaleMode`, `resetOnExit`, `port`, `controlUiBasePath`, `logTailscale`
- Returns cleanup function; calls infra-level enable/disable
- Relation: Replicate this pattern for `startGatewayCloudflareExposure()`

## 3. SSH Tunnel Pattern
**File:** `src/infra/ssh-tunnel.ts`
- `startSshPortForward(opts)` → `Promise<SshTunnel>`
- SshTunnel: `{localPort, remotePort, pid, stderr, stop()}`
- Graceful kill: SIGTERM → 1.5s → SIGKILL
- Waits for listener with timeout
- Hardcoded `/usr/bin/ssh` (Unix-only)
- Relation: Reference pattern for cloudflare-tunnel.ts process management

## 4. Config Schema
**File:** `src/config/schema.ts`
- Zod-derived JSON Schema with UI hints
- Existing gateway fields: `gateway.remote.url`, `gateway.remote.sshTarget`, `gateway.auth.token`
- Relation: Add `gateway.cloudflare.enabled`, `gateway.cloudflare.token` (sensitive)

## 5. macOS Native App
**Dir:** `apps/macos/Sources/OpenClaw/`
- Swift app: GatewayProcessManager, GatewayConnection, LaunchdManager
- Pattern: bootstrap persistence → init app model → init gateway controller → set UI → wire lifecycle
- Relation: Electron wrapper follows identical pattern in JS/TS

## 6. Client-Web Entry
**Files:** `client-web/src/main.ts` + `client-web/index.html`
- Simple: imports styles + `<operis-app>` web component
- Vite build → static assets
- Relation: Bundle with Electron, load in BrowserWindow

## 7. Daemon Service Abstraction
**File:** `src/daemon/service.ts`
- `resolveGatewayService()` → GatewayService (cross-platform)
- Windows: schtasks.ts (Scheduled Task ONLOGON)
- Interface: install, uninstall, stop, restart, isLoaded, readRuntime
- Relation: Use for auto-start OR use Electron's setLoginItemSettings

## Key Files Summary
| Component | File | Purpose |
|---|---|---|
| Gateway start | `src/gateway/server.impl.ts` | Entry point |
| Tailscale pattern | `src/gateway/server-tailscale.ts` | Template for CF |
| SSH tunnel | `src/infra/ssh-tunnel.ts` | Process pattern |
| Config | `src/config/schema.ts` | Add tunnel config |
| macOS app | `apps/macos/Sources/OpenClaw/` | Reference |
| Web UI | `client-web/` | Bundle with Electron |
| Daemon | `src/daemon/service.ts` | Auto-start |
