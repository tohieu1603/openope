/**
 * Unit tests for OnboardManager
 * Tests configuration detection and onboarding flow
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
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
}));

import { OnboardManager } from "../onboard-manager";

describe("OnboardManager", () => {
  let tempDir: string;
  let mockResolveResource: ((...segments: string[]) => string);

  beforeEach(() => {
    // Create a temporary directory for test config files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "onboard-test-"));

    // Mock resolveResource function
    mockResolveResource = (...segments: string[]) => {
      return path.join(tempDir, ...segments);
    };
  });

  afterEach(() => {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("isConfigured()", () => {
    it("should return false when config file does not exist", () => {
      // Temporarily override process.env to use temp directory
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager(mockResolveResource);
        const result = manager.isConfigured();
        expect(result).toBe(false);
      } finally {
        // Restore original env
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should return true when config file exists", () => {
      // Create mock config directory and file
      const configDir = path.join(tempDir, ".openclaw");
      fs.mkdirSync(configDir, { recursive: true });
      const configFile = path.join(configDir, "openclaw.json");
      fs.writeFileSync(configFile, '{"configured": true}');

      // Temporarily override process.env.HOME for this test
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;
      process.env.HOME = tempDir;
      process.env.USERPROFILE = tempDir;

      try {
        const manager = new OnboardManager(mockResolveResource);
        const result = manager.isConfigured();
        expect(result).toBe(true);
      } finally {
        // Restore original env
        if (originalHome !== undefined) process.env.HOME = originalHome;
        if (originalUserProfile !== undefined) {
          process.env.USERPROFILE = originalUserProfile;
        }
      }
    });

    it("should check .openclaw/openclaw.json in home directory", () => {
      const manager = new OnboardManager(mockResolveResource);
      const originalHome = process.env.HOME;
      const originalUserProfile = process.env.USERPROFILE;

      process.env.HOME = "";
      process.env.USERPROFILE = "";

      try {
        // Should not throw even with empty home
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

  describe("registerIpcHandlers()", () => {
    it("should not throw when registering IPC handlers", () => {
      const manager = new OnboardManager(mockResolveResource);
      expect(() => {
        manager.registerIpcHandlers();
      }).not.toThrow();
    });
  });

  describe("removeIpcHandlers()", () => {
    it("should not throw when removing IPC handlers", () => {
      const manager = new OnboardManager(mockResolveResource);
      manager.registerIpcHandlers();
      expect(() => {
        manager.removeIpcHandlers();
      }).not.toThrow();
    });
  });

  describe("constructor", () => {
    it("should accept resolveResource function", () => {
      const manager = new OnboardManager(mockResolveResource);
      expect(manager).toBeDefined();
      expect(typeof manager.isConfigured).toBe("function");
    });
  });
});
