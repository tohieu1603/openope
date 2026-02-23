/**
 * Channels API Service
 * Handles channel connections for messaging apps
 */

import { apiRequest } from "./auth-api";

// Channel types
export type ChannelId = "whatsapp" | "telegram" | "zalo";

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

// Get all channels status — merges gateway status + Zalo DB status
export async function getChannelsStatus(): Promise<ChannelStatus[]> {
  // Start with defaults
  let channels = getDefaultChannels();

  // Try fetching from gateway (WhatsApp, Telegram)
  try {
    const result = await apiRequest<ChannelsResponse>("/channels/status");
    if (Array.isArray(result?.channels)) {
      channels = result.channels;
    }
  } catch {
    // Gateway not available, keep defaults
  }

  // Fetch Zalo connection status from DB
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
    } else {
      channels.push({
        id: "zalo",
        name: "Zalo",
        icon: "zalo",
        connected: zalo.connected,
        lastConnectedAt: zalo.connectedAt ? new Date(zalo.connectedAt).getTime() : undefined,
        accountName: zalo.zaloName,
      });
    }
  } catch {
    // Zalo API not available, keep default
  }

  return channels;
}

// Connect a channel
export async function connectChannel(
  channelId: ChannelId,
): Promise<{ success: boolean; message?: string }> {
  return apiRequest(`/channels/${channelId}/connect`, {
    method: "POST",
  });
}

// Disconnect a channel
export async function disconnectChannel(channelId: ChannelId): Promise<{ success: boolean }> {
  return apiRequest(`/channels/${channelId}/disconnect`, {
    method: "POST",
  });
}
