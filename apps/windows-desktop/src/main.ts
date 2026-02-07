/**
 * Electron main process entry point for Agent Operis Desktop.
 *
 * Lifecycle:
 * 1. App ready -> check if OpenClaw config exists
 * 2a. No config (first run) -> show setup.html -> user enters tokens -> onboard
 * 2b. Config exists -> start gateway + load client-web UI
 * 3. Gateway managed by GatewayManager (spawn, health check, crash recovery)
 * 4. Once gateway running -> start Cloudflare tunnel (if token configured)
 * 5. On quit -> graceful shutdown (tunnel first, then gateway)
 */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { OnboardManager } from "./onboard-manager";
import { GatewayManager } from "./gateway-manager";
import { TunnelManager } from "./tunnel-manager";
import { GATEWAY_PORT, IPC } from "./types";

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

  return win;
}

/** Load client-web UI into the main window */
function loadClientWeb(win: BrowserWindow): void {
  const uiIndex = resolveResourcePath("client-web", "index.html");
  win.loadFile(uiIndex);
}

/** Start gateway and forward status events to renderer. Start tunnel when gateway is running. */
function startServicesWithStatus(win: BrowserWindow): void {
  // Forward gateway status to renderer
  gateway.onStatus((status, detail) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.GATEWAY_STATUS, status, detail);
    }
    // Auto-start tunnel once gateway is healthy
    if (status === "running" && tunnel.hasToken()) {
      tunnel.start();
    }
  });

  // Forward tunnel status to renderer
  tunnel.onStatus((status, detail) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.TUNNEL_STATUS, status, detail);
    }
  });

  gateway.start();
}

app.whenReady().then(async () => {
  mainWindow = createWindow();

  const onboardMgr = new OnboardManager(resolveResourcePath);
  onboardMgr.registerIpcHandlers();

  // Provide gateway port to renderer
  ipcMain.handle(IPC.GET_GATEWAY_PORT, () => GATEWAY_PORT);

  if (!onboardMgr.isConfigured()) {
    // First run: show setup page for token entry
    mainWindow.loadFile(resolveSetupPath());

    // After successful onboard, save CF token if provided, then start services
    ipcMain.once("onboard-complete", (_event, data?: { cfTunnelToken?: string }) => {
      // Save CF tunnel token if user provided one during setup
      if (data?.cfTunnelToken) {
        try {
          tunnel.saveToken(data.cfTunnelToken);
        } catch {
          // Non-fatal: tunnel token save failed, user can configure later
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

// Graceful shutdown: stop tunnel first, then gateway
app.on("before-quit", (e) => {
  const needsGatewayStop = gateway.currentStatus !== "stopped";
  const needsTunnelStop = tunnel.currentStatus !== "disconnected";

  if (needsGatewayStop || needsTunnelStop) {
    e.preventDefault();
    // Stop tunnel first (faster), then gateway
    Promise.all([tunnel.stop(), gateway.stop()]).finally(() => {
      app.exit(0);
    });
  }
});

// Quit when all windows are closed (Windows/Linux behavior)
app.on("window-all-closed", () => {
  app.quit();
});

// macOS: re-create window when dock icon clicked
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
    startServicesWithStatus(mainWindow);
    loadClientWeb(mainWindow);
  }
});
