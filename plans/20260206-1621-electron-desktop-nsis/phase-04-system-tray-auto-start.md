# Phase 04: System Tray & Auto-Start

**Parent:** [plan.md](./plan.md) | **Deps:** Phase 2 | **Blocks:** Phase 5
**Date:** 2026-02-06 | **Priority:** Medium | **Status:** Pending

## Overview

Add system tray icon with status indicator and context menu. Minimize to tray on window close (gateway keeps running). Auto-start on Windows login via `app.setLoginItemSettings`.

## Key Insights

- Electron `Tray` API + `Menu.buildFromTemplate` for context menu
- `app.setLoginItemSettings({openAtLogin: true})` writes to `HKEY_CURRENT_USER\...\Run`
- NSIS uninstaller must clean registry entry (electron-builder handles this)
- macOS app uses `GatewayAutostartPolicy.swift` -- equivalent pattern
- Existing schtasks daemon (`src/daemon/schtasks.ts`) is an alternative but Electron API is simpler

## Related Code

| File | Lines | Purpose |
|------|-------|---------|
| `src/daemon/schtasks.ts` | L240-307 | Windows scheduled task install (reference) |
| `src/daemon/service.ts` | L125-152 | Win32 GatewayService abstraction |
| `apps/macos/Sources/OpenClaw/GatewayAutostartPolicy.swift` | -- | macOS auto-start reference |
| `apps/macos/Sources/OpenClaw/MenuBar.swift` | -- | macOS tray/menu bar reference |

## Architecture

```
[System Tray]
  |-- Icon: green (running) / yellow (starting) / red (error) / gray (stopped)
  |-- Tooltip: "Agent Operis - Running"
  |-- Context Menu:
  |     |-- Show / Hide Window
  |     |-- ---
  |     |-- Gateway: Running (status indicator)
  |     |-- Tunnel: Connected (status indicator)
  |     |-- ---
  |     |-- Restart Gateway
  |     |-- Reconnect Tunnel
  |     |-- ---
  |     |-- Start on Login [checkbox]
  |     |-- ---
  |     +-- Quit
  |
  +-- Window close -> minimize to tray (not quit)
```

## Implementation Steps

### 1. Create tray-manager.ts

```ts
// apps/windows-desktop/src/tray-manager.ts
import { Tray, Menu, nativeImage, app, BrowserWindow } from "electron";
import path from "node:path";
import type { GatewayStatus } from "./gateway-manager";

type TrayState = {
  gateway: GatewayStatus;
  tunnel: string;
};

export class TrayManager {
  private tray: Tray | null = null;
  private state: TrayState = { gateway: "stopped", tunnel: "disconnected" };
  private mainWindow: BrowserWindow | null = null;

  private resolveIcon(name: string): string {
    const base = app.isPackaged
      ? path.join(process.resourcesPath, "icons")
      : path.join(__dirname, "..", "resources");
    return path.join(base, `tray-${name}.ico`);
  }

  init(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.tray = new Tray(this.resolveIcon("gray"));
    this.tray.setToolTip("Agent Operis");
    this.tray.on("double-click", () => this.showWindow());
    this.updateMenu();
  }

  updateGateway(status: GatewayStatus): void {
    this.state.gateway = status;
    this.updateTrayIcon();
    this.updateMenu();
  }

  updateTunnel(status: string): void {
    this.state.tunnel = status;
    this.updateMenu();
  }

  private updateTrayIcon(): void {
    const iconMap: Record<GatewayStatus, string> = {
      running: "green", starting: "yellow", error: "red", stopped: "gray",
    };
    this.tray?.setImage(this.resolveIcon(iconMap[this.state.gateway]));
    this.tray?.setToolTip(`Agent Operis - ${this.state.gateway}`);
  }

  // ... (menu building, show/hide, etc.)
}
```

### 2. Build context menu

```ts
private updateMenu(): void {
  const isAutoStart = app.getLoginItemSettings().openAtLogin;
  const menu = Menu.buildFromTemplate([
    { label: "Show Window", click: () => this.showWindow() },
    { type: "separator" },
    { label: `Gateway: ${this.state.gateway}`, enabled: false },
    { label: `Tunnel: ${this.state.tunnel}`, enabled: false },
    { type: "separator" },
    { label: "Restart Gateway", click: () => this.emit("restart-gateway") },
    { label: "Reconnect Tunnel", click: () => this.emit("restart-tunnel") },
    { type: "separator" },
    {
      label: "Start on Login",
      type: "checkbox",
      checked: isAutoStart,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => { this.quitting = true; app.quit(); } },
  ]);
  this.tray?.setContextMenu(menu);
}
```

### 3. Minimize to tray on window close

```ts
// In main.ts:
const win = createWindow();

win.on("close", (e) => {
  if (!trayManager.isQuitting) {
    e.preventDefault();
    win.hide();
  }
});
```

### 4. Auto-start configuration

```ts
// In main.ts, after app.whenReady():
// Set auto-start on first run (user can toggle via tray menu)
const settings = app.getLoginItemSettings();
if (!settings.wasOpenedAtLogin) {
  // Don't force on first run; let user enable via tray
}

// Toggle via IPC (from renderer settings page):
ipcMain.handle("set-auto-start", (_e, enabled: boolean) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  return app.getLoginItemSettings().openAtLogin;
});
```

### 5. Wire tray to gateway/tunnel managers

```ts
// In main.ts:
const trayManager = new TrayManager();

app.whenReady().then(async () => {
  const win = createWindow();
  trayManager.init(win);

  gateway.onStatus((status) => {
    trayManager.updateGateway(status);
    win.webContents.send("gateway-status", status);
  });

  tunnel.onStatus?.((status) => {
    trayManager.updateTunnel(status);
  });
});
```

### 6. Add tray icon assets

Create 4 ICO files in `resources/`:
- `tray-green.ico` (16x16, 32x32) -- running
- `tray-yellow.ico` -- starting
- `tray-red.ico` -- error
- `tray-gray.ico` -- stopped

## Todo

- [ ] Create `apps/windows-desktop/src/tray-manager.ts`
- [ ] Implement tray icon with color-coded status
- [ ] Implement context menu with status display + actions
- [ ] Implement minimize-to-tray on window close
- [ ] Implement auto-start toggle via `setLoginItemSettings`
- [ ] Create tray icon assets (4 .ico files)
- [ ] Wire tray manager to gateway + tunnel status events
- [ ] Add event emitters for restart-gateway, restart-tunnel actions
- [ ] Test: close window, verify tray icon remains + gateway keeps running
- [ ] Test: toggle "Start on Login", verify registry entry

## Success Criteria

1. Tray icon shows with correct color for gateway status
2. Context menu displays gateway + tunnel status
3. Window close minimizes to tray; gateway/tunnel keep running
4. "Quit" from tray stops all processes and exits
5. "Start on Login" toggle writes/removes registry entry
6. Restart Gateway/Tunnel actions work from tray menu

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Tray icon not visible on Windows 11 | LOW | Standard Electron API; well-supported |
| Registry not cleaned on uninstall | MEDIUM | electron-builder NSIS handles cleanup |
| Multiple instances | LOW | Use app.requestSingleInstanceLock() |
| User confused by close != quit | MEDIUM | Show tooltip on first minimize-to-tray |

## Security

- No sensitive data in tray UI (status labels only)
- Auto-start registry entry contains app path only (no tokens)
- Single instance lock prevents duplicate gateway spawns
