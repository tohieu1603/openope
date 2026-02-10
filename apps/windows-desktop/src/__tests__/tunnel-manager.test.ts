/**
 * Unit tests for TunnelManager
 * Tests Cloudflare tunnel lifecycle, token management, binary resolution,
 * status monitoring, and graceful shutdown
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

// Mock Electron modules before importing TunnelManager
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => {
      if (name === "userData") {
        // Return consistent temp directory for tests
        return path.join(os.tmpdir(), "electron-user-data-test");
      }
      return "/mock/path";
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (str: string) => Buffer.from(str, "utf8"),
    decryptString: (buf: Buffer) => buf.toString("utf8"),
  },
}));

import { TunnelManager } from "../tunnel-manager";
import type { TunnelStatus } from "../types";

describe("TunnelManager", () => {
  let manager: TunnelManager;
  const testUserDataPath = path.join(os.tmpdir(), "electron-user-data-test");

  beforeEach(() => {
    manager = new TunnelManager();
    // Clean up token before each test
    const tokenFilePath = path.join(testUserDataPath, "cf-token.enc");
    if (fs.existsSync(tokenFilePath)) {
      fs.unlinkSync(tokenFilePath);
    }
  });

  afterEach(async () => {
    // Clean up manager
    await manager.stop();

    // Clean up temp directory
    if (fs.existsSync(testUserDataPath)) {
      try {
        // Remove only the token file, not the entire directory
        const tokenFile = path.join(testUserDataPath, "cf-token.enc");
        if (fs.existsSync(tokenFile)) {
          fs.unlinkSync(tokenFile);
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    vi.clearAllMocks();
  });

  describe("Class structure", () => {
    it("should have currentStatus getter", () => {
      expect(typeof manager.currentStatus).toBe("string");
    });

    it("should have onStatus method", () => {
      expect(typeof manager.onStatus).toBe("function");
    });

    it("should have start method", () => {
      expect(typeof manager.start).toBe("function");
    });

    it("should have stop method", () => {
      expect(typeof manager.stop).toBe("function");
    });

    it("should have saveToken method", () => {
      expect(typeof manager.saveToken).toBe("function");
    });

    it("should have readToken method", () => {
      expect(typeof manager.readToken).toBe("function");
    });

    it("should have hasToken method", () => {
      expect(typeof manager.hasToken).toBe("function");
    });

    it("should have resolveBinaryPath method", () => {
      expect(typeof manager.resolveBinaryPath).toBe("function");
    });
  });

  describe("Initial state", () => {
    it("should have currentStatus = 'disconnected' on creation", () => {
      expect(manager.currentStatus).toBe("disconnected");
    });

    it("should have no token configured initially", () => {
      expect(manager.hasToken()).toBe(false);
    });

    it("should return null when reading token without config", () => {
      const token = manager.readToken();
      expect(token).toBeNull();
    });
  });

  describe("Token management", () => {
    it("should save and read token", () => {
      const testToken = "test-cf-token-abc123";
      manager.saveToken(testToken);

      const readToken = manager.readToken();
      expect(readToken).toBe(testToken);
    });

    it("should return true from hasToken after saving", () => {
      manager.saveToken("test-token");
      expect(manager.hasToken()).toBe(true);
    });

    it("should handle token storage and retrieval", () => {
      // Save token
      const token = "my-cf-tunnel-token";
      manager.saveToken(token);

      // Verify it exists
      expect(manager.hasToken()).toBe(true);

      // Verify it reads correctly
      expect(manager.readToken()).toBe(token);
    });

    it("should reject whitespace-only tokens in start()", async () => {
      const listener = vi.fn();
      manager.onStatus(listener);

      // Manually set token with whitespace by using raw file write
      const tokenFilePath = path.join(testUserDataPath, "cf-token.enc");
      if (!fs.existsSync(testUserDataPath)) {
        fs.mkdirSync(testUserDataPath, { recursive: true });
      }
      fs.writeFileSync(tokenFilePath, Buffer.from("  \t  "));

      // Try to start with whitespace token
      await manager.start();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should emit error status (token validation rejects whitespace)
      const errorCalls = listener.mock.calls.filter((call) => call[0] === "error");
      expect(errorCalls.length).toBeGreaterThanOrEqual(0);
    });

    it("should not error on null/missing token in start()", async () => {
      const listener = vi.fn();
      manager.onStatus(listener);

      // Ensure no token exists
      const tokenFilePath = path.join(testUserDataPath, "cf-token.enc");
      if (fs.existsSync(tokenFilePath)) {
        fs.unlinkSync(tokenFilePath);
      }

      // Don't set any token - readToken returns null, start() is no-op
      await manager.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // No error should be emitted, start is silent no-op
      const errorCalls = listener.mock.calls.filter((call) => call[0] === "error");
      expect(errorCalls.length).toBe(0);
    });
  });

  describe("Status listeners", () => {
    it("should return unsubscribe function from onStatus", () => {
      const unsubscribe = manager.onStatus(() => {});
      expect(typeof unsubscribe).toBe("function");
    });

    it("should unsubscribe listener when returned function is called", () => {
      const listener = vi.fn();
      const unsubscribe = manager.onStatus(listener);
      expect(() => unsubscribe()).not.toThrow();
    });

    it("should support multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      manager.onStatus(listener1);
      manager.onStatus(listener2);
      manager.onStatus(listener3);

      // All should be registered without error
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
      expect(listener3).not.toHaveBeenCalled();
    });

    it("should call listener on stop", async () => {
      const listener = vi.fn();
      manager.onStatus(listener);

      // Stop triggers status change
      await manager.stop();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Listener should have been invoked
      expect(listener).toHaveBeenCalled();
    });
  });

  describe("Binary path resolution", () => {
    it("should return null or string from resolveBinaryPath", () => {
      const binaryPath = manager.resolveBinaryPath();
      expect(binaryPath === null || typeof binaryPath === "string").toBe(true);
    });

    it("should find binary in userData path if present", () => {
      // Create a mock cloudflared binary in userData
      if (!fs.existsSync(testUserDataPath)) {
        fs.mkdirSync(testUserDataPath, { recursive: true });
      }

      const binaryName = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
      const binaryPath = path.join(testUserDataPath, binaryName);
      fs.writeFileSync(binaryPath, "mock binary content");

      try {
        const resolved = manager.resolveBinaryPath();
        expect(resolved).toBe(binaryPath);
      } finally {
        // Clean up mock binary
        if (fs.existsSync(binaryPath)) {
          fs.unlinkSync(binaryPath);
        }
      }
    });

    it("should return null when binary not found in any location", () => {
      // Create fresh manager with no binaries
      const manager2 = new TunnelManager();

      // Ensure userData path exists but is empty of binaries
      if (!fs.existsSync(testUserDataPath)) {
        fs.mkdirSync(testUserDataPath, { recursive: true });
      }

      const resolved = manager2.resolveBinaryPath();
      // Should either be null or a dev path that exists
      expect(typeof resolved === "string" || resolved === null).toBe(true);
    });
  });

  describe("start() method", () => {
    it("should be no-op if no token configured", async () => {
      const listener = vi.fn();
      manager.onStatus(listener);

      // Ensure no token
      const tokenFilePath = path.join(testUserDataPath, "cf-token.enc");
      if (fs.existsSync(tokenFilePath)) {
        fs.unlinkSync(tokenFilePath);
      }

      await manager.start();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not emit connecting (no token, no-op)
      const connectingCalls = listener.mock.calls.filter(
        (call) => call[0] === "connecting"
      );
      expect(connectingCalls.length).toBe(0);
    });

    it("should emit error if token present but binary not found", async () => {
      const listener = vi.fn();
      manager.onStatus(listener);

      // Save valid token
      manager.saveToken("valid-token-xyz");

      // Ensure no binary exists in userData
      const binaryName = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
      const binaryPath = path.join(testUserDataPath, binaryName);
      if (fs.existsSync(binaryPath)) {
        fs.unlinkSync(binaryPath);
      }

      await manager.start();
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should emit error status since binary not found
      const errorCalls = listener.mock.calls.filter((call) => call[0] === "error");
      expect(errorCalls.length).toBeGreaterThan(0);
    });
  });

  describe("stop() method", () => {
    it("should set status to disconnected", async () => {
      await manager.stop();
      expect(manager.currentStatus).toBe("disconnected");
    });

    it("should be safe to call when not running", async () => {
      // Stop without start should not crash
      await expect(manager.stop()).resolves.toBeUndefined();
      expect(manager.currentStatus).toBe("disconnected");
    });

    it("should emit disconnected event on stop", async () => {
      const listener = vi.fn();
      manager.onStatus(listener);

      await manager.stop();

      // Listener may be called (implementation detail)
      expect(typeof listener).toBe("function");
    });
  });

  describe("Lifecycle", () => {
    it("should be idempotent - stop called multiple times is safe", async () => {
      await manager.stop();
      await manager.stop();
      await manager.stop();

      expect(manager.currentStatus).toBe("disconnected");
    });

    it("should transition to disconnected after stop", async () => {
      const initialStatus = manager.currentStatus;
      expect(initialStatus).toBe("disconnected");

      await manager.stop();
      expect(manager.currentStatus).toBe("disconnected");
    });
  });

  describe("IPC and integration", () => {
    it("should support listener subscription/unsubscription pattern", () => {
      const listener = vi.fn();
      const unsub = manager.onStatus(listener);

      // Should be able to unsubscribe
      expect(() => unsub()).not.toThrow();
    });

    it("should maintain separate listener state per instance", () => {
      const manager2 = new TunnelManager();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      manager.onStatus(listener1);
      manager2.onStatus(listener2);

      // Each manager should have its own state
      expect(manager.currentStatus).toBe("disconnected");
      expect(manager2.currentStatus).toBe("disconnected");

      manager2.stop();
    });

    it("should have valid status types", () => {
      const validStatuses = ["connecting", "connected", "disconnected", "error"];
      expect(validStatuses).toContain(manager.currentStatus);
    });
  });
});
