/**
 * Edition detection for Agent Operis Desktop.
 *
 * The app detects its "edition" at startup by checking whether a config
 * preset file exists in the bundled resources. The regular build has no
 * preset; the BytePlus build ships with `config-preset-byteplus.json`.
 *
 * Each edition uses its own state directory (~/.operis vs ~/.operis-byteplus)
 * so they can be installed and run independently.
 */
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

export type Edition = "default" | "byteplus";

/** State directory name per edition */
const STATE_DIRS: Record<Edition, string> = {
  default: ".operis",
  byteplus: ".operis-byteplus",
};

/** Resolve path inside bundled resources (works in both dev and packaged mode) */
function resolveResourcePath(...segments: string[]): string {
  const base = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, "..", "..", "..");
  return path.join(base, ...segments);
}

/** Detect edition by checking for bundled preset files */
export function detectEdition(): Edition {
  const byteplusPreset = resolveResourcePath("config-preset-byteplus.json");
  if (fs.existsSync(byteplusPreset)) {
    return "byteplus";
  }
  return "default";
}

/** Resolve the preset config file path (or null for default edition) */
export function resolvePresetPath(edition: Edition): string | null {
  if (edition === "default") return null;
  const presetPath = resolveResourcePath(`config-preset-${edition}.json`);
  return fs.existsSync(presetPath) ? presetPath : null;
}

/** Resolve the state directory for this edition */
export function resolveEditionStateDir(edition: Edition): string {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, STATE_DIRS[edition]);
}

/** Resolve config file path for this edition */
export function resolveEditionConfigPath(edition: Edition): string {
  return path.join(resolveEditionStateDir(edition), "operis.json");
}
