/**
 * First-run detection and non-interactive onboarding manager.
 * Checks if OpenClaw config exists; if not, runs onboard via child_process.
 */
import { spawn } from "node:child_process";
import { app, ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs";
import { IPC, type OnboardResult, type OnboardSubmitData } from "./types";

export class OnboardManager {
  private resolveResource: (...segments: string[]) => string;

  constructor(resolveResource: (...segments: string[]) => string) {
    this.resolveResource = resolveResource;
  }

  /**
   * Path to OpenClaw config file.
   * Config lives at ~/.openclaw/openclaw.json on all platforms.
   */
  private get configFilePath(): string {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    return path.join(home, ".openclaw", "openclaw.json");
  }

  /**
   * Check if OpenClaw config already exists.
   */
  isConfigured(): boolean {
    return fs.existsSync(this.configFilePath);
  }

  /**
   * Read the gateway auth token from config (for passing to UI via URL query).
   */
  readGatewayToken(): string | null {
    try {
      const raw = fs.readFileSync(this.configFilePath, "utf-8");
      return JSON.parse(raw)?.gateway?.auth?.token ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Ensure gateway config has Electron-specific settings (idempotent).
   * Called after onboard and on every app startup.
   * - Enables /v1/chat/completions HTTP endpoint
   * - Allows file:// origin for WebSocket (Electron loads UI from file://)
   */
  ensureElectronConfig(): void {
    try {
      const raw = fs.readFileSync(this.configFilePath, "utf-8");
      const config = JSON.parse(raw);
      let modified = false;

      // Enable chatCompletions endpoint
      config.gateway ??= {};
      config.gateway.http ??= {};
      config.gateway.http.endpoints ??= {};
      config.gateway.http.endpoints.chatCompletions ??= {};
      if (config.gateway.http.endpoints.chatCompletions.enabled !== true) {
        config.gateway.http.endpoints.chatCompletions.enabled = true;
        modified = true;
      }

      // Allow file:// origin for WebSocket
      config.gateway.controlUi ??= {};
      const origins = config.gateway.controlUi.allowedOrigins ?? [];
      if (!origins.includes("file://")) {
        origins.push("file://");
        config.gateway.controlUi.allowedOrigins = origins;
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), "utf-8");
      }
    } catch {
      // Config may not exist yet
    }
  }

  /**
   * Run non-interactive onboarding with provided tokens.
   * Spawns: node gateway/entry.js onboard --non-interactive ...
   * Uses process.execPath (Electron's bundled Node) as the runtime with ELECTRON_RUN_AS_NODE=1.
   */
  async runOnboard(data: OnboardSubmitData): Promise<OnboardResult> {
    const entryPath = this.resolveResource("gateway", "entry.js");

    if (!fs.existsSync(entryPath)) {
      return { success: false, output: `Gateway not found at ${entryPath}` };
    }

    const args = [
      entryPath,
      "onboard",
      "--non-interactive",
      "--accept-risk",
      "--auth-choice",
      "token",
      "--token-provider",
      "anthropic",
      "--token",
      data.anthropicToken,
      "--gateway-port",
      "18789",
      "--gateway-bind",
      "loopback",
      "--skip-channels",
      "--skip-skills",
      "--skip-health",
      "--json",
    ];

    return new Promise<OnboardResult>((resolve) => {
      let resolved = false;
      const done = (result: OnboardResult) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      // Resolve bundled plugins directory so onboard can validate config
      const pluginsDir = app.isPackaged
        ? path.join(process.resourcesPath, "extensions")
        : path.join(__dirname, "..", "dist-extensions");

      const child = spawn(process.execPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          OPENCLAW_BUNDLED_PLUGINS_DIR: pluginsDir,
        },
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        done({ success: false, output: err.message });
      });
      child.on("exit", (code) => {
        const success = code === 0;
        done({
          success,
          output: success ? stdout : stderr || `exit code ${code}`,
        });

        // After successful onboard, ensure Electron-specific config is set
        if (success) {
          this.ensureElectronConfig();
        }
      });
    });
  }

  /** Register IPC handlers for first-run setup page */
  registerIpcHandlers(): void {
    ipcMain.handle(IPC.ONBOARD_SUBMIT, async (_event, data: OnboardSubmitData) => {
      return this.runOnboard(data);
    });
  }

  /** Remove IPC handlers (cleanup) */
  removeIpcHandlers(): void {
    ipcMain.removeHandler(IPC.ONBOARD_SUBMIT);
  }
}
