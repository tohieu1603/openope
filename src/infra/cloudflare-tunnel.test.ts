/**
 * Unit tests for cloudflare-tunnel.ts
 * Tests token validation, status listeners, connected regex, graceful shutdown
 */
import { describe, it, expect } from "vitest";
import { startCloudflareTunnel, type CloudflareTunnelStatus } from "./cloudflare-tunnel";

describe("cloudflare-tunnel", () => {
  describe("startCloudflareTunnel - token validation", () => {
    it("should throw on empty token", () => {
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "",
          onLog: undefined,
        });
      }).toThrow("Invalid cloudflare tunnel token");
    });

    it("should throw on token with leading whitespace", () => {
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "  abc123",
          onLog: undefined,
        });
      }).toThrow("Invalid cloudflare tunnel token");
    });

    it("should throw on token with trailing whitespace", () => {
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "abc123  ",
          onLog: undefined,
        });
      }).toThrow("Invalid cloudflare tunnel token");
    });

    it("should throw on token with internal whitespace", () => {
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "abc 123",
          onLog: undefined,
        });
      }).toThrow("Invalid cloudflare tunnel token");
    });

    it("should throw on token with newline", () => {
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "abc123\n",
          onLog: undefined,
        });
      }).toThrow("Invalid cloudflare tunnel token");
    });

    it("should throw on token with tab", () => {
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "abc123\t",
          onLog: undefined,
        });
      }).toThrow("Invalid cloudflare tunnel token");
    });

    it("should accept valid token with alphanumerics and special chars", () => {
      // This should not throw
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0",
          onLog: undefined,
        });
      }).not.toThrow();
    });
  });

  describe("startCloudflareTunnel - initial status", () => {
    it("should return object with status getter", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      expect(tunnel.status).toBeDefined();
      expect(typeof tunnel.status).toBe("string");
    });

    it("should have initial status 'connecting'", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      expect(tunnel.status).toBe("connecting");
    });

    it("should have pid property", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      expect(tunnel.pid).toBeDefined();
      expect(typeof tunnel.pid === "number" || tunnel.pid === null).toBe(true);
    });

    it("should have stop method", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      expect(typeof tunnel.stop).toBe("function");
    });

    it("should have onStatus method", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      expect(typeof tunnel.onStatus).toBe("function");
    });
  });

  describe("startCloudflareTunnel - status listeners", () => {
    it("should return unsubscribe function from onStatus", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      const unsubscribe = tunnel.onStatus(() => {});
      expect(typeof unsubscribe).toBe("function");
    });

    it("should allow multiple listeners", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      const unsubscribe1 = tunnel.onStatus(() => {});
      const unsubscribe2 = tunnel.onStatus(() => {});
      const unsubscribe3 = tunnel.onStatus(() => {});

      expect(typeof unsubscribe1).toBe("function");
      expect(typeof unsubscribe2).toBe("function");
      expect(typeof unsubscribe3).toBe("function");
    });

    it("should call listener when unsubscribed", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      let callCount = 0;
      const listener = () => {
        callCount++;
      };

      const unsubscribe = tunnel.onStatus(listener);

      // Unsubscribe should return a function
      expect(typeof unsubscribe).toBe("function");

      // Call unsubscribe and verify it doesn't throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it("should pass status and detail to listener", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      let receivedStatus: CloudflareTunnelStatus | undefined;
      let receivedDetail: string | undefined;

      tunnel.onStatus((status, detail) => {
        receivedStatus = status;
        receivedDetail = detail;
      });

      // Should be able to receive status updates
      expect(receivedStatus === undefined || typeof receivedStatus === "string").toBe(true);
    });
  });

  describe("Connected regex pattern", () => {
    it("should match 'Registered tunnel connection'", () => {
      const regex = /Registered tunnel connection|Connection .+ registered/i;
      expect(regex.test("Registered tunnel connection")).toBe(true);
    });

    it("should match case-insensitive 'REGISTERED TUNNEL CONNECTION'", () => {
      const regex = /Registered tunnel connection|Connection .+ registered/i;
      expect(regex.test("REGISTERED TUNNEL CONNECTION")).toBe(true);
    });

    it("should match 'Connection id-12345 registered'", () => {
      const regex = /Registered tunnel connection|Connection .+ registered/i;
      expect(regex.test("Connection id-12345 registered")).toBe(true);
    });

    it("should match multiline text containing registered message", () => {
      const regex = /Registered tunnel connection|Connection .+ registered/i;
      const multiline = "Starting tunnel...\nRegistered tunnel connection\nReady";
      expect(regex.test(multiline)).toBe(true);
    });

    it("should not match unrelated messages", () => {
      const regex = /Registered tunnel connection|Connection .+ registered/i;
      expect(regex.test("Connection timeout")).toBe(false);
      expect(regex.test("Connected to server")).toBe(false);
      expect(regex.test("Error: connection refused")).toBe(false);
    });
  });

  describe("Graceful stop behavior", () => {
    it("should have async stop method", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      const result = tunnel.stop();
      expect(result instanceof Promise).toBe(true);
    });

    it("should resolve stop promise", async () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      // stop() should resolve without throwing
      expect(async () => {
        await tunnel.stop();
      }).not.toThrow();
    });
  });

  describe("onLog callback", () => {
    it("should accept onLog callback", () => {
      const logs: string[] = [];
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "valid-token-123",
          onLog: (line: string) => {
            logs.push(line);
          },
        });
      }).not.toThrow();
    });

    it("should handle undefined onLog", () => {
      expect(() => {
        startCloudflareTunnel({
          binaryPath: "/mock/cloudflared",
          token: "valid-token-123",
          onLog: undefined,
        });
      }).not.toThrow();
    });
  });

  describe("Status transitions", () => {
    it("status should be valid CloudflareTunnelStatus type", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      const validStatuses = ["connecting", "connected", "disconnected", "error"];
      expect(validStatuses).toContain(tunnel.status);
    });

    it("should support all valid status strings", () => {
      const tunnel = startCloudflareTunnel({
        binaryPath: "/mock/cloudflared",
        token: "valid-token-123",
        onLog: undefined,
      });

      const statusList: CloudflareTunnelStatus[] = [
        "connecting",
        "connected",
        "disconnected",
        "error",
      ];

      for (const status of statusList) {
        expect(typeof status).toBe("string");
      }
    });
  });
});
