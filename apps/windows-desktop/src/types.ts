/**
 * IPC channel names and shared types for main <-> renderer communication
 */

/** IPC channel names used between main <-> renderer */
export const IPC = {
  GET_GATEWAY_PORT: "get-gateway-port",
  GATEWAY_STATUS: "gateway-status",
  TUNNEL_STATUS: "tunnel-status",
  GET_GATEWAY_LOGS: "get-gateway-logs",
  GET_GATEWAY_LOG_PATH: "get-gateway-log-path",
} as const;

export const GATEWAY_PORT = 18789;

export type GatewayStatus = "stopped" | "starting" | "running" | "error";
export type TunnelStatus = "disconnected" | "connecting" | "connected" | "error";
