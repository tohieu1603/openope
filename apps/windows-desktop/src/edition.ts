/**
 * Resource and config path helpers for Agent Operis Desktop.
 *
 * BytePlus provider preset is always bundled and applied on first run.
 * State directory is always ~/.operis.
 */
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

const STATE_DIR_NAME = ".operis";

/** Resolve path inside bundled resources (works in both dev and packaged mode) */
export function resolveResourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "..", "..");
  return path.join(base, ...segments);
}

/** Resolve the preset config file path (or null if not bundled) */
export function resolvePresetPath(): string | null {
  const presetPath = resolveResourcePath("config-preset-byteplus.json");
  return fs.existsSync(presetPath) ? presetPath : null;
}

/** Resolve the state directory (~/.operis) */
export function resolveStateDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, STATE_DIR_NAME);
}

/** Resolve config file path (~/.operis/operis.json) */
export function resolveConfigPath(): string {
  return path.join(resolveStateDir(), "operis.json");
}
