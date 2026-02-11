/**
 * Tests for electron-builder.yml configuration
 * Validates paths, structure, resource configuration, NSIS installer,
 * asarUnpack, file exclusions, and sourcemap removal
 */
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import fs from "node:fs";

describe("electron-builder.yml", () => {
  let content: string;

  beforeAll(() => {
    const configPath = path.join(__dirname, "..", "..", "electron-builder.yml");
    content = fs.readFileSync(configPath, "utf-8");
  });

  it("should exist and be readable", () => {
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
  });

  it("should contain appId", () => {
    expect(content).toContain("appId: com.operis.agent");
  });

  it("should contain productName", () => {
    expect(content).toContain("productName: Agent Operis");
  });

  it("should contain copyright", () => {
    expect(content).toContain("copyright: Copyright (c) 2026 Agent Operis");
  });

  it("should have directories configuration", () => {
    expect(content).toContain("directories:");
    expect(content).toContain("output: release");
    expect(content).toContain("buildResources: resources");
  });

  it("should enable ASAR packaging", () => {
    expect(content).toContain("asar: true");
  });

  describe("asarUnpack", () => {
    it("should unpack sharp native modules", () => {
      expect(content).toContain("asarUnpack:");
      expect(content).toContain('**/node_modules/sharp/**/*');
    });

    it("should unpack better-sqlite3 native modules", () => {
      expect(content).toContain('**/node_modules/better-sqlite3/**/*');
    });

    it("should unpack all .node files", () => {
      expect(content).toContain('"**/*.node"');
    });
  });

  describe("Windows target", () => {
    it("should target NSIS for Windows x64", () => {
      expect(content).toContain("win:");
      expect(content).toContain("target: nsis");
      expect(content).toContain("arch: [x64]");
    });

    it("should use icon.ico", () => {
      expect(content).toContain("icon: resources/icon.ico");
    });

    it("should request asInvoker execution level", () => {
      expect(content).toContain("requestedExecutionLevel: asInvoker");
    });
  });

  describe("NSIS installer config", () => {
    it("should not be oneClick install", () => {
      expect(content).toContain("oneClick: false");
    });

    it("should be per-user install", () => {
      expect(content).toContain("perMachine: false");
    });

    it("should allow changing install directory", () => {
      expect(content).toContain("allowToChangeInstallationDirectory: true");
    });

    it("should create shortcuts", () => {
      expect(content).toContain("createDesktopShortcut: true");
      expect(content).toContain("createStartMenuShortcut: true");
      expect(content).toContain("shortcutName: Agent Operis");
    });

    it("should have installer icons", () => {
      expect(content).toContain("installerIcon: resources/icon.ico");
      expect(content).toContain("uninstallerIcon: resources/icon.ico");
      expect(content).toContain("installerHeaderIcon: resources/icon.ico");
    });

    it("should not delete app data on uninstall", () => {
      expect(content).toContain("deleteAppDataOnUninstall: false");
    });

    it("should include custom NSIS script", () => {
      expect(content).toContain("include: installer.nsh");
    });
  });

  describe("extraResources", () => {
    it("should bundle gateway dist", () => {
      expect(content).toContain('from: "../../dist"');
      expect(content).toContain('to: "gateway"');
    });

    it("should exclude control-ui from gateway bundle", () => {
      expect(content).toContain('- "!control-ui/**"');
    });

    it("should exclude sourcemaps from gateway", () => {
      expect(content).toContain('- "!**/*.map"');
    });

    it("should exclude .d.ts from gateway", () => {
      expect(content).toContain('- "!**/*.d.ts"');
    });

    it("should bundle client-web UI", () => {
      expect(content).toContain('from: "../../dist/control-ui"');
      expect(content).toContain('to: "client-web"');
    });

    it("should bundle cloudflared binary", () => {
      expect(content).toContain('from: "resources/cloudflared.exe"');
      expect(content).toContain('to: "cloudflared.exe"');
    });

    it("should bundle setup.html", () => {
      expect(content).toContain('from: "resources/setup.html"');
      expect(content).toContain('to: "setup.html"');
    });

    it("should bundle tray icons", () => {
      expect(content).toContain('from: "resources/tray-green.ico"');
      expect(content).toContain('from: "resources/tray-yellow.ico"');
      expect(content).toContain('from: "resources/tray-red.ico"');
      expect(content).toContain('from: "resources/tray-gray.ico"');
    });

    it("should have comment explaining gateway resources", () => {
      expect(content).toContain("# Gateway dist");
    });

    it("should have comment explaining client-web resources", () => {
      expect(content).toContain("# Client-web UI build");
    });

    it("should have comment explaining setup page", () => {
      expect(content).toContain("# First-run setup page");
    });
  });

  describe("File exclusions", () => {
    it("should include dist-electron", () => {
      expect(content).toContain('- "dist-electron/**/*"');
    });

    it("should exclude node-pty", () => {
      expect(content).toContain('- "!node_modules/@lydell/node-pty/**"');
    });

    it("should exclude playwright-core", () => {
      expect(content).toContain('- "!node_modules/playwright-core/**"');
    });

    it("should exclude sourcemaps from files", () => {
      // The files section should also exclude .map files
      const filesSection = content.split("files:")[1];
      expect(filesSection).toContain('- "!**/*.map"');
    });
  });
});

describe("installer.nsh", () => {
  let content: string;

  beforeAll(() => {
    const nshPath = path.join(__dirname, "..", "..", "installer.nsh");
    content = fs.readFileSync(nshPath, "utf-8");
  });

  it("should exist and be readable", () => {
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
  });

  it("should define customUnInstall macro", () => {
    expect(content).toContain("!macro customUnInstall");
    expect(content).toContain("!macroend");
  });

  it("should delete auto-start registry key on uninstall", () => {
    expect(content).toContain("DeleteRegValue HKCU");
    expect(content).toContain("CurrentVersion\\Run");
    expect(content).toContain("AgentOperis");
  });
});

describe("download-cloudflared.mjs", () => {
  let content: string;

  beforeAll(() => {
    const scriptPath = path.join(__dirname, "..", "..", "scripts", "download-cloudflared.mjs");
    content = fs.readFileSync(scriptPath, "utf-8");
  });

  it("should exist and be readable", () => {
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
  });

  it("should pin cloudflared version", () => {
    expect(content).toMatch(/CF_VERSION\s*=\s*"/);
  });

  it("should download from GitHub releases", () => {
    expect(content).toContain("github.com/cloudflare/cloudflared/releases");
  });

  it("should target windows-amd64", () => {
    expect(content).toContain("cloudflared-windows-amd64.exe");
  });

  it("should skip download if file exists", () => {
    expect(content).toContain("already exists, skipping download");
  });

  it("should output to resources/cloudflared.exe", () => {
    expect(content).toContain("resources");
    expect(content).toContain("cloudflared.exe");
  });

  it("should handle redirects", () => {
    expect(content).toContain("redirect");
  });
});

describe("package.json build scripts", () => {
  let pkg: Record<string, any>;

  beforeAll(() => {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  });

  it("should have prebuild script for cloudflared download", () => {
    expect(pkg.scripts.prebuild).toContain("download-cloudflared");
  });

  it("should have build:gateway script", () => {
    expect(pkg.scripts["build:gateway"]).toBeDefined();
    expect(pkg.scripts["build:gateway"]).toContain("pnpm build");
  });

  it("should have build:electron script", () => {
    expect(pkg.scripts["build:electron"]).toContain("tsc");
  });

  it("should have build:installer script", () => {
    expect(pkg.scripts["build:installer"]).toContain("electron-builder");
    expect(pkg.scripts["build:installer"]).toContain("--win");
  });

  it("should have full build chain", () => {
    const build = pkg.scripts.build;
    expect(build).toContain("build:gateway");
    expect(build).toContain("build:electron");
    expect(build).toContain("build:installer");
  });

  it("build chain should run in correct order", () => {
    const build = pkg.scripts.build;
    const gatewayIdx = build.indexOf("build:gateway");
    const electronIdx = build.indexOf("build:electron");
    const installerIdx = build.indexOf("build:installer");
    expect(gatewayIdx).toBeLessThan(electronIdx);
    expect(electronIdx).toBeLessThan(installerIdx);
  });

  it("should have dev script", () => {
    expect(pkg.scripts.dev).toContain("tsc");
    expect(pkg.scripts.dev).toContain("electron");
  });
});
