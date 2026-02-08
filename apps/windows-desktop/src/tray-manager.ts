/**
 * System tray manager for Agent Operis Desktop.
 * Shows color-coded status icon, context menu with actions,
 * minimize-to-tray on window close, and auto-start toggle.
 */
import { Tray, Menu, app, type BrowserWindow } from "electron";
import path from "node:path";
import type { GatewayStatus, TunnelStatus } from "./types";

type TrayActionHandler = {
  onRestartGateway: () => void;
  onRestartTunnel: () => void;
};

const ICON_MAP: Record<GatewayStatus, string> = {
  running: "tray-green.ico",
  starting: "tray-yellow.ico",
  error: "tray-red.ico",
  stopped: "tray-gray.ico",
};

export class TrayManager {
  private tray: Tray | null = null;
  private win: BrowserWindow | null = null;
  private gatewayStatus: GatewayStatus = "stopped";
  private tunnelStatus: TunnelStatus = "disconnected";
  private actions: TrayActionHandler | null = null;
  private _isQuitting = false;

  get isQuitting(): boolean {
    return this._isQuitting;
  }

  /** Resolve tray icon path (dev vs packaged) */
  private resolveIcon(filename: string): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, filename)
      : path.join(__dirname, "..", "resources", filename);
  }

  /** Initialize tray with window reference and action handlers */
  init(win: BrowserWindow, actions: TrayActionHandler): void {
    this.win = win;
    this.actions = actions;

    this.tray = new Tray(this.resolveIcon("tray-gray.ico"));
    this.tray.setToolTip("Agent Operis - Stopped");

    this.tray.on("double-click", () => {
      this.showWindow();
    });

    this.buildMenu();
  }

  /** Update gateway status in tray */
  updateGateway(status: GatewayStatus): void {
    this.gatewayStatus = status;
    const iconFile = ICON_MAP[status] || "tray-gray.ico";
    this.tray?.setImage(this.resolveIcon(iconFile));
    this.tray?.setToolTip(`Agent Operis - Gateway ${status}`);
    this.buildMenu();
  }

  /** Update tunnel status in tray */
  updateTunnel(status: TunnelStatus): void {
    this.tunnelStatus = status;
    this.buildMenu();
  }

  /** Mark app as quitting (allows window.close() to proceed) */
  setQuitting(): void {
    this._isQuitting = true;
  }

  /** Show/restore the main window */
  private showWindow(): void {
    if (this.win) {
      if (this.win.isMinimized()) this.win.restore();
      this.win.show();
      this.win.focus();
    }
  }

  /** Build the context menu with current status and actions */
  private buildMenu(): void {
    if (!this.tray) return;

    const isAutoStart = app.getLoginItemSettings().openAtLogin;

    const template: Electron.MenuItemConstructorOptions[] = [
      { label: "Show Window", click: () => this.showWindow() },
      { type: "separator" },
      { label: `Gateway: ${this.gatewayStatus}`, enabled: false },
      { label: `Tunnel: ${this.tunnelStatus}`, enabled: false },
      { type: "separator" },
      {
        label: "Restart Gateway",
        click: () => this.actions?.onRestartGateway(),
      },
      {
        label: "Reconnect Tunnel",
        click: () => this.actions?.onRestartTunnel(),
      },
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
      {
        label: "Quit",
        click: () => {
          this._isQuitting = true;
          app.quit();
        },
      },
    ];

    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  /** Cleanup tray on app quit */
  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
