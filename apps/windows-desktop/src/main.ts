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
import { app, BrowserWindow, ipcMain, shell } from "electron";
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

/** Show a small dialog window for tunnel token input */
function promptTunnelToken(): void {
  const win = new BrowserWindow({
    width: 500,
    height: 260,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow ?? undefined,
    modal: true,
    title: "Set Tunnel Token",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setMenuBarVisibility(false);

  // Inline HTML form for tunnel token input
  win.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>
  body{font-family:system-ui;background:#1a1d24;color:#e0e0e0;padding:24px;margin:0}
  h3{margin:0 0 8px;font-size:1rem;color:#fff}
  p{font-size:.82rem;color:#888;margin:0 0 16px}
  input{width:100%;padding:10px;background:#12141a;border:1px solid #2a2d35;border-radius:6px;color:#e0e0e0;font-size:.9rem;outline:0;box-sizing:border-box}
  input:focus{border-color:#6366f1}
  .actions{margin-top:16px;display:flex;gap:8px;justify-content:flex-end}
  button{padding:8px 20px;border:none;border-radius:6px;font-size:.9rem;cursor:pointer}
  .save{background:#6366f1;color:#fff}.save:hover{background:#4f46e5}
  .cancel{background:#2a2d35;color:#ccc}.cancel:hover{background:#3a3d45}
  .msg{font-size:.82rem;margin-top:8px;color:#4ade80;display:none}
</style></head><body>
<h3>Cloudflare Tunnel Token</h3>
<p>Enter the token from Cloudflare Dashboard &gt; Zero Trust &gt; Networks &gt; Tunnels</p>
<input id="t" placeholder="eyJhIjoiNjE3..." autocomplete="off" spellcheck="false"/>
<div id="msg" class="msg"></div>
<div class="actions">
  <button class="cancel" onclick="window.close()">Cancel</button>
  <button class="save" onclick="save()">Save &amp; Connect</button>
</div>
<script>
function save(){
  const v=document.getElementById('t').value.trim();
  if(!v)return;
  const msg=document.getElementById('msg');
  msg.style.display='block';msg.textContent='Saving...';
  fetch('ipc://set-tunnel-token',{method:'POST',body:v}).catch(()=>{});
  // Use title hack: set document title so main process can read it
  document.title='TOKEN:'+v;
  setTimeout(()=>window.close(),500);
}
document.getElementById('t').addEventListener('keydown',e=>{if(e.key==='Enter')save()});
<\/script></body></html>`),
  );

  win.on("closed", () => {
    // Cleanup
  });

  // Listen for title change to get token
  win.webContents.on("page-title-updated", (_event, title) => {
    if (title.startsWith("TOKEN:")) {
      const token = title.slice(6).trim();
      if (token) {
        try {
          tunnel.saveToken(token);
          tunnel.stop().then(() => {
            if (gateway.currentStatus === "running") {
              tunnel.start();
            }
          });
        } catch {
          // Token save failed
        }
      }
    }
  });
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
    onSetTunnelToken: () => {
      promptTunnelToken();
    },
    onOpenLogs: () => {
      shell.openPath(gateway.getLogFilePath());
    },
  });

  const onboardMgr = new OnboardManager(resolveResourcePath);
  onboardMgr.registerIpcHandlers();

  // Provide gateway port to renderer
  ipcMain.handle(IPC.GET_GATEWAY_PORT, () => GATEWAY_PORT);

  // Provide gateway logs to renderer
  ipcMain.handle(IPC.GET_GATEWAY_LOGS, () => gateway.getRecentLogs());
  ipcMain.handle(IPC.GET_GATEWAY_LOG_PATH, () => gateway.getLogFilePath());

  // Enable DevTools with F12 or Ctrl+Shift+I
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i")
    ) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

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
        const gatewayToken = onboardMgr.readGatewayToken();
        startServicesWithStatus(mainWindow);
        loadClientWeb(mainWindow, gatewayToken);
      }
    });
  } else {
    // Normal startup: ensure Electron config, start services and load client-web UI
    onboardMgr.ensureElectronConfig();
    const gatewayToken = onboardMgr.readGatewayToken();
    startServicesWithStatus(mainWindow);
    loadClientWeb(mainWindow, gatewayToken);
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
    loadClientWeb(mainWindow, null);
  }
});
