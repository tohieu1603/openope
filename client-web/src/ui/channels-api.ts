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

// Get all channels status
export async function getChannelsStatus(): Promise<ChannelStatus[]> {
  try {
    const result = await apiRequest<ChannelsResponse>("/channels/status");
    // Safety check: ensure we always return an array
    if (Array.isArray(result?.channels)) {
      return result.channels;
    }
    // API returned unexpected format, use defaults
    return getDefaultChannels();
  } catch {
    // Return default disconnected status if API not available
    return getDefaultChannels();
  }
}

// Connect a channel
export async function connectChannel(channelId: ChannelId): Promise<{ success: boolean; message?: string }> {
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
