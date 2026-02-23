/**
 * Zalo API Service
 * QR login flow and channel management via Operis API
 */

import { apiRequest } from "./auth-api";

export interface ZaloConnectResult {
  sessionToken: string;
}

export interface ZaloStatusResult {
  status: "pending" | "qr_ready" | "scanned" | "success" | "error";
  qrBase64: string | null;
  zaloUid: string | null;
  zaloName: string | null;
  error: string | null;
}

export interface ZaloChannelResult {
  connected: boolean;
  zaloUid?: string;
  zaloName?: string;
  connectedAt?: string;
}

/** Start Zalo QR login — returns sessionToken for polling */
export async function connectZalo(): Promise<ZaloConnectResult> {
  return apiRequest<ZaloConnectResult>("/zalo/connect", { method: "POST" });
}

/** Poll QR/login status */
export async function getZaloStatus(sessionToken: string): Promise<ZaloStatusResult> {
  return apiRequest<ZaloStatusResult>(`/zalo/status?token=${encodeURIComponent(sessionToken)}`);
}

/** Get Zalo channel info */
export async function getZaloChannel(): Promise<ZaloChannelResult> {
  return apiRequest<ZaloChannelResult>("/zalo/channel");
}

/** Disconnect Zalo */
export async function disconnectZalo(): Promise<{ disconnected: boolean }> {
  return apiRequest<{ disconnected: boolean }>("/zalo/disconnect", { method: "POST" });
}
