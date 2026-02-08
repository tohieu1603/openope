/**
 * Electron main process entry point for Agent Operis Desktop.
 *
 * Lifecycle:
 * 1. Single instance lock -> prevent duplicate app
 * 2. App ready -> check if OpenClaw config exists
 * 3a. No config (first run) -> show setup.html -> onboard -> start services
 * 3b. Config exists -> start gateway + tunnel + load client-web UI
 * 4. System tray: status icon, context menu, minimize-to-tray
 * 5. On quit -> graceful shutdown (tunnel + gateway)
 */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { OnboardManager } from "./onboard-manager";
import { GatewayManager } from "./gateway-manager";
import { TunnelManager } from "./tunnel-manager";
import { TrayManager } from "./tray-manager";
import { GATEWAY_PORT, IPC } from "./types";

// Single instance lock - prevent multiple app instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

/** Resolve path to bundled resources (works in both dev and packaged mode) */
function resolveResourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "..", "..");
  return path.join(base, ...segments);
}

/** Resolve path to setup.html (different location in dev vs packaged) */
function resolveSetupPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "setup.html")
    : path.join(__dirname, "..", "resources", "setup.html");
}

let mainWindow: BrowserWindow | null = null;
const gateway = new GatewayManager();
const tunnel = new TunnelManager();
const tray = new TrayManager();

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Agent Operis",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for preload script to use Node APIs
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  // Minimize to tray instead of quitting when window is closed
  win.on("close", (e) => {
    if (!tray.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

/** Load client-web UI into the main window */
function loadClientWeb(win: BrowserWindow): void {
  const uiIndex = resolveResourcePath("client-web", "index.html");
  win.loadFile(uiIndex);
}

/** Start gateway/tunnel and wire status to tray + renderer IPC */
function startServicesWithStatus(win: BrowserWindow): void {
  // Forward gateway status to renderer + tray
  gateway.onStatus((status, detail) => {
    tray.updateGateway(status);
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.GATEWAY_STATUS, status, detail);
    }
    // Auto-start tunnel once gateway is healthy
    if (status === "running" && tunnel.hasToken()) {
      tunnel.start();
    }
  });

  // Forward tunnel status to renderer + tray
  tunnel.onStatus((status, detail) => {
    tray.updateTunnel(status);
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.TUNNEL_STATUS, status, detail);
    }
  });

  gateway.start();
}

app.whenReady().then(async () => {
  mainWindow = createWindow();

  // Initialize system tray with action handlers
  tray.init(mainWindow, {
    onRestartGateway: async () => {
      await gateway.stop();
      gateway.start();
    },
    onRestartTunnel: async () => {
      await tunnel.stop();
      tunnel.start();
    },
  });

  const onboardMgr = new OnboardManager(resolveResourcePath);
  onboardMgr.registerIpcHandlers();

  // Provide gateway port to renderer
  ipcMain.handle(IPC.GET_GATEWAY_PORT, () => GATEWAY_PORT);

  if (!onboardMgr.isConfigured()) {
    // First run: show setup page for token entry
    mainWindow.loadFile(resolveSetupPath());

    // After successful onboard, save CF token if provided, then start services
    ipcMain.once("onboard-complete", (_event, data?: { cfTunnelToken?: string }) => {
      if (data?.cfTunnelToken) {
        try {
          tunnel.saveToken(data.cfTunnelToken);
        } catch {
          // Non-fatal: tunnel token save failed
        }
      }
      if (mainWindow) {
        startServicesWithStatus(mainWindow);
        loadClientWeb(mainWindow);
      }
    });
  } else {
    // Normal startup: start services and load client-web UI
    startServicesWithStatus(mainWindow);
    loadClientWeb(mainWindow);
  }
});

// Second instance: show existing window
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Graceful shutdown: stop tunnel + gateway before quitting
app.on("before-quit", (e) => {
  tray.setQuitting();
  const needsGatewayStop = gateway.currentStatus !== "stopped";
  const needsTunnelStop = tunnel.currentStatus !== "disconnected";

  if (needsGatewayStop || needsTunnelStop) {
    e.preventDefault();
    Promise.all([tunnel.stop(), gateway.stop()]).finally(() => {
      app.exit(0);
    });
  }
});

app.on("quit", () => {
  tray.destroy();
});

// Quit when all windows are closed (only if quitting via tray)
app.on("window-all-closed", () => {
  // On Windows/Linux, don't quit - tray keeps app alive
  // App quits via tray "Quit" menu item
});

// macOS: re-create window when dock icon clicked
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    startServicesWithStatus(mainWindow);
    loadClientWeb(mainWindow);
  }
});
