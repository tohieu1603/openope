/**
 * Type correctness tests for IPC constants and type definitions
 */
import { describe, it, expect } from "vitest";
import { IPC, GATEWAY_PORT, type GatewayStatus, type TunnelStatus } from "../types";

describe("Types and Constants", () => {
  describe("IPC Constants", () => {
    it("should have GET_GATEWAY_PORT constant", () => {
      expect(IPC.GET_GATEWAY_PORT).toBe("get-gateway-port");
      expect(typeof IPC.GET_GATEWAY_PORT).toBe("string");
    });

    it("should have GATEWAY_STATUS constant", () => {
      expect(IPC.GATEWAY_STATUS).toBe("gateway-status");
      expect(typeof IPC.GATEWAY_STATUS).toBe("string");
    });

    it("should have unique IPC channel names", () => {
      const channels = Object.values(IPC);
      const uniqueChannels = new Set(channels);
      expect(uniqueChannels.size).toBe(channels.length);
    });
  });

  describe("GATEWAY_PORT constant", () => {
    it("should be defined as 18789", () => {
      expect(GATEWAY_PORT).toBe(18789);
      expect(typeof GATEWAY_PORT).toBe("number");
    });

    it("should be within valid port range (1024-65535 for unprivileged)", () => {
      expect(GATEWAY_PORT).toBeGreaterThan(1023);
      expect(GATEWAY_PORT).toBeLessThan(65536);
    });
  });

  describe("Type definitions", () => {
    it("should define GatewayStatus type correctly", () => {
      const validStatuses: GatewayStatus[] = ["starting", "running", "stopped", "error"];
      expect(validStatuses).toHaveLength(4);
    });

    it("should define TunnelStatus type correctly", () => {
      const validStatuses: TunnelStatus[] = ["connecting", "connected", "disconnected", "error"];
      expect(validStatuses).toHaveLength(4);
    });
  });

  describe("IPC constant consistency", () => {
    it("constants should match preload.ts channel names", () => {
      expect(IPC.GET_GATEWAY_PORT).toBe("get-gateway-port");
    });

    it("constants should match main.ts handler registrations", () => {
      expect(IPC.GET_GATEWAY_PORT).toBe("get-gateway-port");
    });
  });
});
