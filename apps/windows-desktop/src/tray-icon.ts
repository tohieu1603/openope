/**
 * Tray icon generator — creates tinted versions of the app icon at runtime.
 * Loads icon.ico, resizes to 16x16, applies color tint per gateway status.
 * No external dependencies — uses Electron's nativeImage.
 */
import { nativeImage, app } from "electron";
import path from "node:path";
import type { GatewayStatus } from "./types";

/** Tint color per status — null means use original icon colors */
const STATUS_COLORS: Record<GatewayStatus, [number, number, number] | null> = {
  running: null,               // Original icon (natural colors)
  starting: [255, 193, 7],    // Yellow/Amber
  error: [244, 67, 54],       // Red
  stopped: [158, 158, 158],   // Gray
};

/** Cache generated icons to avoid re-creating on every status change */
const iconCache = new Map<GatewayStatus, Electron.NativeImage>();

/** Resolve the app icon path */
function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "..", "resources", "icon.ico");
}

/**
 * Apply a color tint to an image by blending the target color
 * while preserving the original luminance/alpha.
 */
function tintImage(image: Electron.NativeImage, color: [number, number, number]): Electron.NativeImage {
  const size = image.getSize();
  const bitmap = image.toBitmap();
  const [tr, tg, tb] = color;

  // Bitmap is BGRA on Windows
  for (let i = 0; i < bitmap.length; i += 4) {
    const b = bitmap[i];
    const g = bitmap[i + 1];
    const r = bitmap[i + 2];
    const a = bitmap[i + 3];

    if (a === 0) continue; // Skip transparent pixels

    // Calculate luminance (perceived brightness)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Blend: use target color scaled by luminance
    bitmap[i] = Math.round(tb * lum);     // B
    bitmap[i + 1] = Math.round(tg * lum); // G
    bitmap[i + 2] = Math.round(tr * lum); // R
    // Alpha unchanged
  }

  return nativeImage.createFromBitmap(bitmap, {
    width: size.width,
    height: size.height,
  });
}

/**
 * Get a tray icon for the given gateway status.
 * Returns the app icon tinted with the status color, sized for system tray (16x16).
 */
export function getTrayIcon(status: GatewayStatus): Electron.NativeImage {
  const cached = iconCache.get(status);
  if (cached) return cached;

  const iconPath = getAppIconPath();
  let icon = nativeImage.createFromPath(iconPath);

  // Resize to 16x16 for tray
  icon = icon.resize({ width: 16, height: 16, quality: "best" });

  // Apply color tint (null = keep original colors)
  const color = STATUS_COLORS[status];
  const result = color ? tintImage(icon, color) : icon;

  iconCache.set(status, result);
  return result;
}

/** Clear the icon cache (call if icon file changes) */
export function clearTrayIconCache(): void {
  iconCache.clear();
}
