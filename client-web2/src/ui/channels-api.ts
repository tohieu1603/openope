/**
 * Channels API Service
 * Handles channel connections for messaging apps
 */

import { apiRequest } from "./auth-api";
import { waitForConnection } from "./gateway-client";

// Channel types
export type ChannelId = "whatsapp" | "telegram" | "zalo";

// Channels not yet available for connection (button disabled)
export const DISABLED_CHANNELS: ChannelId[] = ["whatsapp"];

export interface ChannelStatus {
  id: ChannelId;
  name: string;
  icon: string;
  connected: boolean;
  lastConnectedAt?: number;
  error?: string;
  /** Connected account display name (e.g. Zalo user name) */
  accountName?: string;
}

export interface ChannelsResponse {
  channels: ChannelStatus[];
}

// Default channel definitions
export const CHANNEL_DEFINITIONS: Record<ChannelId, { name: string; icon: string }> = {
  whatsapp: { name: "WhatsApp", icon: "whatsapp" },
  telegram: { name: "Telegram", icon: "telegram" },
  zalo: { name: "Zalo", icon: "zalo" },
};

// Get default channels (fallback)
function getDefaultChannels(): ChannelStatus[] {
  return Object.entries(CHANNEL_DEFINITIONS).map(([id, def]) => ({
    id: id as ChannelId,
    name: def.name,
    icon: def.icon,
    connected: false,
  }));
}

// Get all channels status from backend + gateway
export async function getChannelsStatus(): Promise<ChannelStatus[]> {
  const channels = getDefaultChannels();

  // Fetch gateway channels.status for Telegram (and other gateway-managed channels)
  try {
    const gw = await waitForConnection(3000);
    const res = await gw.request<{
      channels?: Record<string, { configured?: boolean; linked?: boolean }>;
      channelAccounts?: Record<
        string,
        Array<{ accountId: string; connected?: boolean; linked?: boolean; name?: string }>
      >;
    }>("channels.status", { probe: false });
    if (res?.channels) {
      for (const ch of channels) {
        const summary = res.channels[ch.id];
        if (!summary) continue;
        // Use linked (= actually connected and working) as the connected indicator
        if (typeof summary.linked === "boolean") {
          ch.connected = summary.linked;
        } else if (typeof summary.configured === "boolean") {
          ch.connected = summary.configured;
        }
        // Get account name from first account if available
        const accounts = res.channelAccounts?.[ch.id];
        if (accounts?.[0]?.name) {
          ch.accountName = accounts[0].name;
        }
      }
    }
  } catch {
    // Gateway not available, fall through to operis-api checks
  }

  // Fetch Zalo connection status from operis-api (overrides gateway if available)
  try {
    const zalo = await apiRequest<{
      connected: boolean;
      zaloUid?: string;
      zaloName?: string;
      connectedAt?: string;
    }>("/zalo/channel");
    const idx = channels.findIndex((c) => c.id === "zalo");
    if (idx >= 0) {
      channels[idx].connected = zalo.connected;
      if (zalo.connectedAt) {
        channels[idx].lastConnectedAt = new Date(zalo.connectedAt).getTime();
      }
      if (zalo.zaloName) {
        channels[idx].accountName = zalo.zaloName;
      }
    }
  } catch {
    // Zalo API not available, keep default
  }

  return channels;
}

// Connect a channel — Zalo uses its own dedicated API endpoint
export async function connectChannel(
  channelId: ChannelId,
): Promise<{ success: boolean; message?: string; sessionToken?: string }> {
  if (channelId === "zalo") {
    const result = await apiRequest<{ sessionToken: string }>("/zalo/connect", { method: "POST" });
    return { success: true, sessionToken: result.sessionToken };
  }
  return apiRequest(`/channels/${channelId}/connect`, { method: "POST" });
}

// Disconnect a channel — Zalo uses its own dedicated API endpoint
export async function disconnectChannel(channelId: ChannelId): Promise<{ success: boolean }> {
  if (channelId === "zalo") {
    const result = await apiRequest<{ disconnected: boolean }>("/zalo/disconnect", {
      method: "POST",
    });
    return { success: result.disconnected };
  }
  return apiRequest(`/channels/${channelId}/disconnect`, { method: "POST" });
}
