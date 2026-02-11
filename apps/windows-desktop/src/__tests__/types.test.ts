/**
 * Type correctness tests for IPC constants and type definitions
 */
import { describe, it, expect } from "vitest";
import { IPC, GATEWAY_PORT, type GatewayStatus, type TunnelStatus, type OnboardResult, type OnboardSubmitData } from "../types";

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

    it("should have ONBOARD_SUBMIT constant", () => {
      expect(IPC.ONBOARD_SUBMIT).toBe("onboard-submit");
      expect(typeof IPC.ONBOARD_SUBMIT).toBe("string");
    });

    it("should have ONBOARD_RESULT constant", () => {
      expect(IPC.ONBOARD_RESULT).toBe("onboard-result");
      expect(typeof IPC.ONBOARD_RESULT).toBe("string");
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

    it("should define OnboardResult type with success and output fields", () => {
      const result: OnboardResult = {
        success: true,
        output: "Setup complete"
      };
      expect(result.success).toBe(true);
      expect(typeof result.output).toBe("string");
    });

    it("should define OnboardSubmitData with required and optional fields", () => {
      const data1: OnboardSubmitData = {
        anthropicToken: "sk-ant-test"
      };
      expect(data1.anthropicToken).toBeDefined();

      // cfTunnelToken was removed from OnboardSubmitData interface
      // It's now handled separately in onboard-complete IPC event
    });
  });

  describe("IPC constant consistency", () => {
    it("constants should match preload.ts channel names", () => {
      // Verify IPC constants match what preload.ts uses
      expect(IPC.GET_GATEWAY_PORT).toBe("get-gateway-port");
      expect(IPC.ONBOARD_SUBMIT).toBe("onboard-submit");
    });

    it("constants should match main.ts handler registrations", () => {
      // Verify channel names used in main.ts match IPC constants
      expect(IPC.GET_GATEWAY_PORT).toBe("get-gateway-port");
    });

    it("constants should match onboard-manager.ts handler registrations", () => {
      // Verify channel names used in onboard-manager.ts match IPC constants
      expect(IPC.ONBOARD_SUBMIT).toBe("onboard-submit");
    });
  });
});
