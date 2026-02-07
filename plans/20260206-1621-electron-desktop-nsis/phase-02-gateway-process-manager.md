# Phase 02: Gateway Process Manager

**Parent:** [plan.md](./plan.md) | **Deps:** Phase 1 | **Blocks:** Phases 3, 4, 5
**Date:** 2026-02-06 | **Priority:** High | **Status:** Pending

## Overview

Create `gateway-manager.ts` in the Electron main process. Spawns the Node.js gateway as a child process, monitors health via HTTP, handles crash recovery with exponential backoff, and provides IPC events to renderer for status updates.

**Important:** Gateway ONLY starts after first-run onboarding is complete (config exists). Phase 1's `OnboardManager.isConfigured()` gates this.

## Key Insights

- Gateway entry: `node dist/entry.js gateway` -- spawned as child process, NOT via pnpm
- `pnpm install` / `pnpm build` are BUILD TIME only -- never invoked at runtime
- In packaged app: `node` = Electron's bundled Node (`process.execPath`), entry at `resources/gateway/entry.js`
- Gateway binds `127.0.0.1:18789` by default (`startGatewayServer` in `server.impl.ts`)
- Health is WS-based, but HTTP GET `/api/health` works too
- ssh-tunnel.ts shows graceful kill pattern: SIGTERM -> timeout -> SIGKILL
- macOS `GatewayProcessManager.swift` manages identical lifecycle in Swift
- **No daemon install needed** -- Electron manages gateway lifecycle directly (not schtasks)

## Related Code

| File | Lines | Purpose |
|------|-------|---------|
| `src/gateway/server.impl.ts` | L155-158 | `startGatewayServer(port=18789)` entry |
| `src/infra/ssh-tunnel.ts` | L170-188 | Graceful kill: SIGTERM -> 1.5s -> SIGKILL |
| `src/entry.ts` | L1-10 | CLI entry: `gateway` subcommand |
| `src/gateway/server-methods/health.ts` | L9-27 | WS health handler |
| `src/daemon/service.ts` | L39-64 | GatewayService interface (reference only) |
| `src/commands/onboard-non-interactive.ts` | -- | Silent onboard (Phase 1 prerequisite) |

## Architecture

```
[Electron Main]
  |
  +-- Phase 1: OnboardManager.isConfigured() == true?
  |     |-- NO  -> show setup page, run onboard, then proceed
  |     +-- YES -> proceed to gateway start
  |
  +-- GatewayManager
        |-- spawn(process.execPath, ["resources/gateway/entry.js", "gateway"])
        |-- healthCheck loop (HTTP GET /api/health, 5s interval)
        |-- on crash -> exponential backoff restart (1s base, 30s max)
        |-- IPC: gateway-status -> renderer
        +-- graceful shutdown on app quit (SIGTERM -> 5s -> SIGKILL)
```

## Implementation Steps

### 1. Create gateway-manager.ts

```ts
// apps/windows-desktop/src/gateway-manager.ts
import { spawn, ChildProcess } from "node:child_process";
import { app } from "electron";
import path from "node:path";
import http from "node:http";

export type GatewayStatus = "starting" | "running" | "stopped" | "error";
type StatusListener = (status: GatewayStatus, detail?: string) => void;

const GATEWAY_PORT = 18789;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const MAX_BACKOFF_MS = 30000;
const BASE_BACKOFF_MS = 1000;

export class GatewayManager {
  private process: ChildProcess | null = null;
  private status: GatewayStatus = "stopped";
  private restartCount = 0;
  private healthTimer: NodeJS.Timeout | null = null;
  private listeners: StatusListener[] = [];
  private shuttingDown = false;

  get currentStatus(): GatewayStatus { return this.status; }

  onStatus(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit(status: GatewayStatus, detail?: string): void {
    this.status = status;
    for (const l of this.listeners) l(status, detail);
  }

  async start(): Promise<void> {
    if (this.process) return;
    this.shuttingDown = false;
    this.spawnGateway();
  }

  private resolveGatewayPath(): string {
    // In packaged app: resources/gateway/entry.js
    // In dev: ../../dist/entry.js
    const base = app.isPackaged
      ? path.join(process.resourcesPath, "gateway")
      : path.join(__dirname, "..", "..", "..", "dist");
    return path.join(base, "entry.js");
  }

  private spawnGateway(): void {
    this.emit("starting");
    const entryPath = this.resolveGatewayPath();

    // process.execPath = Electron's bundled Node runtime
    const child = spawn(process.execPath, [entryPath, "gateway"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OPENCLAW_NO_RESPAWN: "1" },
      windowsHide: true,
    });
    this.process = child;
    child.stdout?.on("data", (d) => { /* log */ });
    child.stderr?.on("data", (d) => { /* log */ });
    child.on("exit", (code) => this.onExit(code));
    this.startHealthCheck();
  }
  // ... (health check, crash recovery, shutdown below)
}
```

### 2. Health check loop

```ts
private startHealthCheck(): void {
  this.healthTimer = setInterval(() => {
    this.checkHealth().then(ok => {
      if (ok && this.status !== "running") {
        this.restartCount = 0;
        this.emit("running");
      }
    }).catch(() => {});
  }, HEALTH_CHECK_INTERVAL_MS);
}

private checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      `http://127.0.0.1:${GATEWAY_PORT}/api/health`,
      { timeout: 3000 },
      (res) => { res.resume(); resolve(res.statusCode === 200); }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}
```

### 3. Crash recovery with exponential backoff

```ts
private onExit(code: number | null): void {
  this.process = null;
  this.stopHealthCheck();
  if (this.shuttingDown) { this.emit("stopped"); return; }
  this.emit("error", `exit code ${code}`);
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.restartCount, MAX_BACKOFF_MS);
  this.restartCount++;
  setTimeout(() => { if (!this.shuttingDown) this.spawnGateway(); }, delay);
}
```

### 4. Graceful shutdown

```ts
async stop(): Promise<void> {
  this.shuttingDown = true;
  this.stopHealthCheck();
  if (!this.process) { this.emit("stopped"); return; }
  const child = this.process;
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      resolve();
    }, 5000);
    child.once("exit", () => { clearTimeout(timeout); resolve(); });
    child.kill("SIGTERM");
  });
}
```

### 5. Wire to Electron main process

```ts
// In main.ts, add:
import { GatewayManager } from "./gateway-manager";

const gateway = new GatewayManager();

app.whenReady().then(async () => {
  const win = createWindow();
  const onboardMgr = new OnboardManager(resolveResourcePath);

  if (!onboardMgr.isConfigured()) {
    // First run: show setup page (Phase 1)
    // After onboard completes -> start gateway
  } else {
    // Config exists: start gateway immediately
    await gateway.start();
    const uiPath = resolveResourcePath("client-web", "index.html");
    win.loadFile(uiPath);
  }

  gateway.onStatus((status) => {
    win.webContents.send("gateway-status", status);
  });
});

app.on("before-quit", async (e) => {
  e.preventDefault();
  await gateway.stop();
  app.exit(0);
});
```

## Todo

- [ ] Create `apps/windows-desktop/src/gateway-manager.ts`
- [ ] Implement spawn with proper entry path resolution (dev vs packaged)
- [ ] Use `process.execPath` (Electron's Node) to spawn gateway, NOT system node
- [ ] Implement HTTP health check loop (5s interval)
- [ ] Implement exponential backoff restart (1s base, 30s max)
- [ ] Implement graceful shutdown (SIGTERM -> 5s -> SIGKILL)
- [ ] Gate gateway start on `OnboardManager.isConfigured()` (Phase 1)
- [ ] Wire GatewayManager lifecycle to `app.whenReady` / `before-quit`
- [ ] Send IPC `gateway-status` events to renderer
- [ ] Add logging to `%APPDATA%/AgentOperis/logs/`
- [ ] Test: start gateway, verify health check succeeds
- [ ] Test: kill gateway process, verify auto-restart
- [ ] Test: first run without config -> gateway does NOT start until onboard complete

## Success Criteria

1. Gateway spawns on Electron app start (only if config exists)
2. Health check detects gateway running within 10s
3. Killing gateway process triggers auto-restart within 5s
4. Closing Electron app cleanly stops gateway (no orphan processes)
5. Renderer receives status updates via IPC
6. First run without config: gateway waits until onboard completes

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Orphan gateway on crash | HIGH | Track PID; kill in before-quit + app.on("quit") |
| Port conflict if gateway already running | MEDIUM | Check port availability before spawn |
| Windows process tree cleanup | MEDIUM | Use taskkill /T /F /PID as fallback |
| process.execPath in packaged app | LOW | Electron bundles Node; verified pattern |
| Config not found after onboard | LOW | Verify file exists before gateway.start() |

## Security

- Gateway runs on loopback only (127.0.0.1)
- No external ports exposed without Cloudflare tunnel
- OPENCLAW_NO_RESPAWN prevents gateway self-respawn loops
- No daemon install needed; Electron is the process manager
