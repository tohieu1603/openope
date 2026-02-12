/**
 * Unit tests for OnboardManager
 * Tests configuration detection, minimal config creation, and Electron config
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Mock Electron before importing OnboardManager
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === "home") return os.homedir();
      return "";
    }),
  },
}));

import { OnboardManager } from "../onboard-manager";

describe("OnboardManager", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test config files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "onboard-test-"));
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("isConfigured()", () => {
    it("should return false when config file does not exist", () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        const result = manager.isConfigured();
        expect(result).toBe(false);
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should return true when config file exists", () => {
      const configDir = path.join(tempDir, ".openclaw");
      fs.mkdirSync(configDir, { recursive: true });
      const configFile = path.join(configDir, "openclaw.json");
      fs.writeFileSync(configFile, '{"configured": true}');

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        const result = manager.isConfigured();
        expect(result).toBe(true);
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should check .openclaw/openclaw.json in home directory", () => {
      const manager = new OnboardManager();
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      process.env.HOME = "";
      process.env.USERPROFILE = "";

      try {
        const result = manager.isConfigured();
        expect(typeof result).toBe("boolean");
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });
  });

  describe("createMinimalConfig()", () => {
    it("should create config file with gateway settings", () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        manager.createMinimalConfig();

        const configFile = path.join(tempDir, ".openclaw", "openclaw.json");
        expect(fs.existsSync(configFile)).toBe(true);

        const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
        expect(config.gateway.mode).toBe("local");
        expect(config.gateway.auth.mode).toBe("token");
        expect(config.gateway.auth.token).toBeDefined();
        expect(config.gateway.auth.token.length).toBe(48); // 24 bytes * 2 hex chars
        expect(config.gateway.port).toBe(18789);
        expect(config.gateway.bind).toBe("loopback");
        expect(config.gateway.controlUi.enabled).toBe(false);
        expect(config.hooks.enabled).toBe(true);
        expect(config.hooks.token).toBeDefined();
        expect(config.hooks.token.length).toBe(48); // 24 bytes * 2 hex chars
        expect(config.browser.defaultProfile).toBe("openclaw");
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should create config directory if it does not exist", () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        const configDir = path.join(tempDir, ".openclaw");
        expect(fs.existsSync(configDir)).toBe(false);

        manager.createMinimalConfig();
        expect(fs.existsSync(configDir)).toBe(true);
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });
  });

  describe("readGatewayToken()", () => {
    it("should return token from config file", () => {
      const configDir = path.join(tempDir, ".openclaw");
      fs.mkdirSync(configDir, { recursive: true });
      const configFile = path.join(configDir, "openclaw.json");
      fs.writeFileSync(configFile, JSON.stringify({
        gateway: { auth: { token: "test-token-123" } }
      }));

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        expect(manager.readGatewayToken()).toBe("test-token-123");
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should return null when config file does not exist", () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        expect(manager.readGatewayToken()).toBeNull();
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });
  });

  describe("ensureElectronConfig() hooks", () => {
    it("should add hooks config to existing config without hooks", () => {
      const configDir = path.join(tempDir, ".openclaw");
      fs.mkdirSync(configDir, { recursive: true });
      const configFile = path.join(configDir, "openclaw.json");
      fs.writeFileSync(configFile, JSON.stringify({
        gateway: { mode: "local", auth: { mode: "token", token: "test" } },
      }));

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        manager.ensureElectronConfig();

        const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
        expect(config.hooks.enabled).toBe(true);
        expect(config.hooks.token).toBeDefined();
        expect(config.hooks.token.length).toBe(48);
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should preserve existing hooks token", () => {
      const configDir = path.join(tempDir, ".openclaw");
      fs.mkdirSync(configDir, { recursive: true });
      const configFile = path.join(configDir, "openclaw.json");
      fs.writeFileSync(configFile, JSON.stringify({
        gateway: { mode: "local" },
        hooks: { enabled: true, token: "existing-hooks-token" },
      }));

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        manager.ensureElectronConfig();

        const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
        expect(config.hooks.token).toBe("existing-hooks-token");
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });
  });

  describe("ensureElectronConfig() browser", () => {
    it("should set noSandbox to true", () => {
      const configDir = path.join(tempDir, ".openclaw");
      fs.mkdirSync(configDir, { recursive: true });
      const configFile = path.join(configDir, "openclaw.json");
      fs.writeFileSync(configFile, JSON.stringify({
        gateway: { mode: "local" },
        browser: { defaultProfile: "openclaw" },
      }));

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        manager.ensureElectronConfig();

        const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
        expect(config.browser.noSandbox).toBe(true);
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should remove stale executablePath when file does not exist", () => {
      const configDir = path.join(tempDir, ".openclaw");
      fs.mkdirSync(configDir, { recursive: true });
      const configFile = path.join(configDir, "openclaw.json");
      fs.writeFileSync(configFile, JSON.stringify({
        gateway: { mode: "local" },
        browser: {
          defaultProfile: "openclaw",
          executablePath: "C:\\nonexistent\\path\\chrome.exe",
        },
      }));

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        manager.ensureElectronConfig();

        const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
        expect(config.browser.executablePath).toBeUndefined();
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });
  });

  describe("ensureAgentAuthStore()", () => {
    it("should create agent directory and auth-profiles.json", () => {
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        manager.ensureAgentAuthStore();

        const authPath = path.join(tempDir, ".openclaw", "agents", "main", "agent", "auth-profiles.json");
        expect(fs.existsSync(authPath)).toBe(true);

        const store = JSON.parse(fs.readFileSync(authPath, "utf-8"));
        expect(store.version).toBe(1);
        expect(store.profiles["anthropic:default"]).toEqual({
          type: "token", provider: "anthropic", token: "",
        });
        expect(store.profiles["anthropic:manual"]).toEqual({
          type: "token", provider: "anthropic", token: "",
        });
        expect(store.lastGood).toEqual({ anthropic: "anthropic:default" });
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should not overwrite existing auth-profiles.json", () => {
      const agentDir = path.join(tempDir, ".openclaw", "agents", "main", "agent");
      fs.mkdirSync(agentDir, { recursive: true });
      const authPath = path.join(agentDir, "auth-profiles.json");
      const existing = { version: 1, profiles: { "anthropic:default": { type: "api_key", key: "sk-test" } } };
      fs.writeFileSync(authPath, JSON.stringify(existing));

      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager();
        manager.ensureAgentAuthStore();

        const store = JSON.parse(fs.readFileSync(authPath, "utf-8"));
        expect(store.profiles["anthropic:default"]).toBeDefined();
        expect(store.profiles["anthropic:default"].key).toBe("sk-test");
      } finally {
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });
  });

  describe("constructor", () => {
    it("should create instance without arguments", () => {
      const manager = new OnboardManager();
      expect(manager).toBeDefined();
      expect(typeof manager.isConfigured).toBe("function");
      expect(typeof manager.createMinimalConfig).toBe("function");
      expect(typeof manager.readGatewayToken).toBe("function");
      expect(typeof manager.ensureElectronConfig).toBe("function");
      expect(typeof manager.ensureAgentAuthStore).toBe("function");
    });
  });
});
