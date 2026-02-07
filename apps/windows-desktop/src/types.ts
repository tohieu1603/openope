/** Shared types for Agent Operis Desktop App */

export type GatewayStatus = "starting" | "running" | "stopped" | "error";

export type TunnelStatus = "connecting" | "connected" | "disconnected" | "error";

export type OnboardResult = {
  success: boolean;
  output: string;
};

export type OnboardSubmitData = {
  anthropicToken: string;
  cfTunnelToken?: string;
};

/** IPC channel names used between main <-> renderer */
export const IPC = {
  GET_GATEWAY_PORT: "get-gateway-port",
  GATEWAY_STATUS: "gateway-status",
  ONBOARD_SUBMIT: "onboard-submit",
  ONBOARD_RESULT: "onboard-result",
} as const;

export const GATEWAY_PORT = 18789;
