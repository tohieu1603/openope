/**
 * Toggle IS_PRODUCTION flag in src/build-mode.ts.
 * Usage: node scripts/set-build-mode.mjs production|development
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, "..", "src", "build-mode.ts");
const mode = process.argv[2];

if (mode !== "production" && mode !== "development") {
  console.error("Usage: node scripts/set-build-mode.mjs production|development");
  process.exit(1);
}

const value = mode === "production" ? "true" : "false";
const content = `/** Build mode flag — toggled by build scripts. Do not edit manually. */\nexport const IS_PRODUCTION = ${value};\n`;

fs.writeFileSync(filePath, content, "utf-8");
console.log(`[build-mode] Set IS_PRODUCTION = ${value}`);
