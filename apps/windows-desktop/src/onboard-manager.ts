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
   * Check if OpenClaw config already exists.
   * Config lives at ~/.openclaw/openclaw.json on all platforms.
   */
  isConfigured(): boolean {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const configFile = path.join(home, ".openclaw", "openclaw.json");
    return fs.existsSync(configFile);
  }

  /**
   * Run non-interactive onboarding with provided tokens.
   * Spawns: node dist/entry.js onboard --non-interactive ...
   * Uses process.execPath (Electron's bundled Node) as the runtime.
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
      "--auth-choice", "setup-token",
      "--token", data.anthropicToken,
      "--gateway-port", "18789",
      "--gateway-bind", "loopback",
      "--skip-channels",
      "--skip-skills",
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

      const child = spawn(process.execPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
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
        done({
          success: code === 0,
          output: code === 0 ? stdout : stderr || `exit code ${code}`,
        });
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
