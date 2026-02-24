/**
 * System tray manager for Agent Operis Desktop.
 * Shows the app icon tinted by gateway status, context menu with actions,
 * minimize-to-tray on window close, and auto-start toggle.
 */
import { Tray, Menu, app, shell, type BrowserWindow } from "electron";
import path from "node:path";
import type { GatewayStatus } from "./types";
import { getTrayIcon } from "./tray-icon";

type TrayActionHandler = {
  onRestartGateway: () => void;
};

export class TrayManager {
  private tray: Tray | null = null;
  private win: BrowserWindow | null = null;
  private gatewayStatus: GatewayStatus = "stopped";
  private actions: TrayActionHandler | null = null;
  private _isQuitting = false;

  get isQuitting(): boolean {
    return this._isQuitting;
  }

  /** Initialize tray with window reference and action handlers */
  init(win: BrowserWindow, actions: TrayActionHandler): void {
    this.win = win;
    this.actions = actions;

    this.tray = new Tray(getTrayIcon("stopped"));
    this.tray.setToolTip("Agent Operis - Stopped");

    this.tray.on("double-click", () => {
      this.showWindow();
    });

    this.buildMenu();
  }

  /** Update gateway status in tray */
  updateGateway(status: GatewayStatus): void {
    this.gatewayStatus = status;
    this.tray?.setImage(getTrayIcon(status));
    this.tray?.setToolTip(`Agent Operis - Gateway ${status}`);
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
      {
        label: "Gateway Log",
        click: () => {
          const logPath = path.join(app.getPath("userData"), "gateway.log");
          shell.openPath(logPath);
        },
      },
      { type: "separator" },
      {
        label: "Restart Gateway",
        click: () => this.actions?.onRestartGateway(),
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
