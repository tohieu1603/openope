/**
 * Tests for electron-builder.yml configuration
 * Validates paths, structure, and resource configuration
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

  it("should have Windows build configuration", () => {
    expect(content).toContain("win:");
    expect(content).toContain("target: nsis");
    expect(content).toContain("icon: resources/icon.ico");
  });

  it("should have NSIS installer configuration", () => {
    expect(content).toContain("nsis:");
    expect(content).toContain("oneClick: false");
    expect(content).toContain("perMachine: false");
    expect(content).toContain("allowToChangeInstallationDirectory: true");
  });

  it("should have NSIS icon paths", () => {
    expect(content).toContain("installerIcon: resources/icon.ico");
    expect(content).toContain("uninstallerIcon: resources/icon.ico");
    expect(content).toContain("installerHeaderIcon: resources/icon.ico");
  });

  it("should have extraResources configuration", () => {
    expect(content).toContain("extraResources:");
  });

  it("should include gateway resources", () => {
    expect(content).toContain('from: "../../dist"');
    expect(content).toContain('to: "gateway"');
    expect(content).toContain('filter:');
    expect(content).toContain('- "**/*"');
    expect(content).toContain('- "!control-ui/**"');
  });

  it("should include client-web UI resources", () => {
    expect(content).toContain('from: "../../dist/control-ui"');
    expect(content).toContain('to: "client-web"');
  });

  it("should include setup.html resources", () => {
    expect(content).toContain('from: "resources/setup.html"');
    expect(content).toContain('to: "setup.html"');
  });

  it("should have files configuration", () => {
    expect(content).toContain("files:");
    expect(content).toContain('- "dist-electron/**/*"');
    expect(content).toContain('- "!node_modules"');
  });

  it("should use correct gateway dist path", () => {
    expect(content).toContain('from: "../../dist"');
    expect(content).toMatch(/from:\s*"\.\.\/\.\.\/(dist|control-ui)"/);
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
