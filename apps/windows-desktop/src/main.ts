/**
 * Electron main process entry point for Agent Operis Desktop.
 *
 * Lifecycle:
 * 1. Single instance lock -> prevent duplicate app
 * 2. App ready -> auto-create config if needed -> start gateway -> load client-web
 * 3. User logs in via client-web -> auth profiles synced -> tunnel auto-provisioned
 * 4. System tray: status icon, context menu, minimize-to-tray
 * 5. On quit -> graceful shutdown (tunnel + gateway)
 */
import { app, BrowserWindow, ipcMain, shell } from "electron";
import fs from "node:fs";
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

/** Config file path: ~/.openclaw/openclaw.json */
const configFilePath = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".openclaw",
  "openclaw.json",
);

/**
 * Sync gateway token from backend login to local config.
 * Writes only when the token actually differs — gateway hot-reloads the config automatically.
 * Returns true if the config was updated.
 */
function syncGatewayTokenToConfig(newToken: string): boolean {
  try {
    const raw = fs.readFileSync(configFilePath, "utf-8");
    const config = JSON.parse(raw);
    if (config?.gateway?.auth?.token === newToken) return false;
    config.gateway ??= {};
    config.gateway.auth ??= {};
    config.gateway.auth.token = newToken;
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

let mainWindow: BrowserWindow | null = null;
const gateway = new GatewayManager();
const tunnel = new TunnelManager();
const tray = new TrayManager();

/** Resolve app icon path (dev vs packaged) */
function resolveIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "..", "resources", "icon.ico");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Agent Operis",
    icon: resolveIconPath(),
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

  // Intercept /?token=xxx redirects that break under file:// protocol.
  // The client-web app does window.location.href = "/?token=..." after login,
  // which resolves to file:///C:/?token=... instead of the correct index.html.
  // Also syncs the backend's gateway token to the local config so the gateway
  // hot-reloads and accepts the correct token (only writes on first mismatch).
  win.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "file:" && parsed.searchParams.has("token")) {
        event.preventDefault();
        const token = parsed.searchParams.get("token");
        if (token) {
          if (syncGatewayTokenToConfig(token)) {
            gateway.gatewayToken = token;
          }
        }
        loadClientWeb(win, token);
      }
    } catch {
      // Ignore malformed URLs
    }
  });

  return win;
}

/** Load client-web UI into the main window, passing gateway token for WebSocket auth */
function loadClientWeb(win: BrowserWindow, gatewayToken: string | null): void {
  const uiIndex = resolveResourcePath("control-ui", "index.html");
  const query: Record<string, string> = {};
  if (gatewayToken) {
    query.token = gatewayToken;
  }
  win.loadFile(uiIndex, { query });
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
    onOpenLogs: () => {
      shell.openPath(gateway.getLogFilePath());
    },
  });

  const onboardMgr = new OnboardManager();

  // Provide gateway port to renderer
  ipcMain.handle(IPC.GET_GATEWAY_PORT, () => GATEWAY_PORT);

  // Provide gateway logs to renderer
  ipcMain.handle(IPC.GET_GATEWAY_LOGS, () => gateway.getRecentLogs());
  ipcMain.handle(IPC.GET_GATEWAY_LOG_PATH, () => gateway.getLogFilePath());

  // Auth-profiles sync: client-web pulls from operismb and sends via IPC
  ipcMain.handle("sync-auth-profiles", (_event, profiles: Record<string, unknown>) => {
    try {
      const home = process.env.USERPROFILE || process.env.HOME || "";
      const authPath = path.join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
      const dir = path.dirname(authPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      // Read existing to preserve usageStats
      let existing: Record<string, unknown> = {};
      try { existing = JSON.parse(fs.readFileSync(authPath, "utf-8")); } catch { /* fresh */ }

      const merged = { ...existing, ...profiles };
      fs.writeFileSync(authPath, JSON.stringify(merged, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("[sync-auth-profiles] Failed:", err);
      return false;
    }
  });

  // Clear auth-profiles on logout
  ipcMain.handle("clear-auth-profiles", () => {
    try {
      const home = process.env.USERPROFILE || process.env.HOME || "";
      const authPath = path.join(home, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
      if (!fs.existsSync(authPath)) return true;

      let existing: Record<string, unknown> = {};
      try { existing = JSON.parse(fs.readFileSync(authPath, "utf-8")); } catch { /* fresh */ }

      const cleared = { ...existing, version: 1, profiles: {}, lastGood: {} };
      fs.writeFileSync(authPath, JSON.stringify(cleared, null, 2), "utf-8");
      return true;
    } catch (err) {
      console.error("[clear-auth-profiles] Failed:", err);
      return false;
    }
  });

  // Enable DevTools with F12 or Ctrl+Shift+I
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i")
    ) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  // Tunnel provision IPC: client-web calls this after auto-provisioning via operismb
  // Returns true only when cloudflared is connected (or false on timeout/error)
  ipcMain.handle("provision-tunnel", async (_event, tunnelToken: string) => {
    try {
      // Stop old cloudflared first (may be connected to a different user's tunnel)
      await tunnel.stop();
      tunnel.saveToken(tunnelToken);
      // Start cloudflared with new token if gateway is already running
      if (gateway.currentStatus === "running") {
        await tunnel.start();
        // Wait for cloudflared to actually connect (up to 15s)
        return await tunnel.waitForConnection(15_000);
      }
      return true;
    } catch (err) {
      console.error("[provision-tunnel] Failed:", err);
      return false;
    }
  });

  // Check if tunnel token exists locally
  ipcMain.handle("has-tunnel-token", () => tunnel.hasToken());

  // Get local gateway config for registering with operismb
  ipcMain.handle("get-gateway-config", () => {
    try {
      const raw = fs.readFileSync(configFilePath, "utf-8");
      const config = JSON.parse(raw);
      const gatewayToken = config?.gateway?.auth?.token || "";
      const hooksToken = config?.hooks?.token || "";
      if (!gatewayToken) return null;
      return { gatewayToken, hooksToken };
    } catch {
      return null;
    }
  });

  // First run: auto-create config (no setup.html needed)
  if (!onboardMgr.isConfigured()) {
    onboardMgr.createMinimalConfig();
  }

  // Always: ensure config + auth store, start gateway, load client-web
  onboardMgr.ensureElectronConfig();
  onboardMgr.ensureAgentAuthStore();
  const gatewayToken = onboardMgr.readGatewayToken();
  gateway.gatewayToken = gatewayToken;
  startServicesWithStatus(mainWindow);
  loadClientWeb(mainWindow, gatewayToken);
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
    loadClientWeb(mainWindow, null);
  }
});
