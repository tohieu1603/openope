/**
 * Preload script - security bridge between main and renderer.
 * Exposes minimal API via contextBridge. No Node APIs leak to renderer.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  /** Get the gateway port number */
  getGatewayPort: (): Promise<number> => ipcRenderer.invoke("get-gateway-port"),

  /** Listen for gateway status changes */
  onGatewayStatus: (callback: (status: string, detail?: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string, detail?: string) =>
      callback(status, detail);
    ipcRenderer.on("gateway-status", handler);
    return () => ipcRenderer.removeListener("gateway-status", handler);
  },

  /** Listen for tunnel status changes */
  onTunnelStatus: (callback: (status: string, detail?: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string, detail?: string) =>
      callback(status, detail);
    ipcRenderer.on("tunnel-status", handler);
    return () => ipcRenderer.removeListener("tunnel-status", handler);
  },

  /** Submit first-run onboarding tokens */
  submitOnboard: (data: { anthropicToken: string }) => ipcRenderer.invoke("onboard-submit", data),

  /** Signal main process that onboarding is complete, optionally with CF token */
  onboardComplete: (data?: { cfTunnelToken?: string }) =>
    ipcRenderer.send("onboard-complete", data),

  /** Get recent gateway logs (in-memory buffer) */
  getGatewayLogs: (): Promise<string[]> => ipcRenderer.invoke("get-gateway-logs"),

  /** Get path to gateway log file on disk */
  getGatewayLogPath: (): Promise<string> => ipcRenderer.invoke("get-gateway-log-path"),
});
