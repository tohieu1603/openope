import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/main.ts"],
    outDir: "dist-electron",
    format: "cjs",
    platform: "node",
    external: ["electron"],
    fixedExtension: false,
    clean: true,
  },
  {
    entry: ["src/preload.ts"],
    outDir: "dist-electron",
    format: "cjs",
    platform: "node",
    external: ["electron"],
    fixedExtension: false,
  },
]);
