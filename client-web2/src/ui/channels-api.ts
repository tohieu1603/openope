/**
 * Channels API Service
 * Handles channel connections via gateway WS
 */

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

// Map UI channel IDs to gateway channel IDs
const GATEWAY_CHANNEL_MAP: Partial<Record<ChannelId, string>> = {
  zalo: "zalozcajs",
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

// Get all channels status from gateway
export async function getChannelsStatus(): Promise<ChannelStatus[]> {
  const channels = getDefaultChannels();

  try {
    const gw = await waitForConnection(3000);
    const res = await gw.request<{
      channels?: Record<string, { configured?: boolean; linked?: boolean; running?: boolean }>;
      channelAccounts?: Record<
        string,
        Array<{
          accountId: string;
          configured?: boolean;
          linked?: boolean;
          running?: boolean;
          name?: string;
        }>
      >;
    }>("channels.status", { probe: false });
    if (res?.channels) {
      for (const ch of channels) {
        // Check both the UI channel ID and the gateway channel ID
        const gwId = GATEWAY_CHANNEL_MAP[ch.id] ?? ch.id;
        const summary = res.channels[ch.id] ?? res.channels[gwId];
        if (!summary) continue;
        if (typeof summary.linked === "boolean") {
          ch.connected = summary.linked;
        } else if (typeof summary.running === "boolean") {
          ch.connected = summary.running && summary.configured !== false;
        } else if (typeof summary.configured === "boolean") {
          ch.connected = summary.configured;
        }
        const accounts = res.channelAccounts?.[ch.id] ?? res.channelAccounts?.[gwId];
        if (accounts?.[0]?.name) {
          ch.accountName = accounts[0].name;
        }
      }
    }
  } catch {
    // Gateway not available
  }

  return channels;
}

// Start Zalo QR login via gateway — returns QR data URL
export async function startZaloQrLogin(params?: {
  force?: boolean;
}): Promise<{ qrDataUrl?: string; message: string }> {
  const gw = await waitForConnection(5000);
  return gw.request<{ qrDataUrl?: string; message: string }>("web.login.start", {
    force: params?.force ?? true,
  });
}

// Wait for Zalo QR login to complete via gateway
export async function waitZaloQrLogin(params?: {
  timeoutMs?: number;
}): Promise<{ connected: boolean; message: string }> {
  const gw = await waitForConnection(5000);
  const serverTimeout = params?.timeoutMs ?? 120_000;
  return gw.request<{ connected: boolean; message: string }>("web.login.wait", {
    timeoutMs: serverTimeout,
  });
}

// Check if a specific channel is configured (has credentials)
export async function isChannelConfigured(channelId: ChannelId): Promise<boolean> {
  try {
    const gw = await waitForConnection(3000);
    const gwId = GATEWAY_CHANNEL_MAP[channelId] ?? channelId;
    const res = await gw.request<{
      channels?: Record<string, { configured?: boolean }>;
    }>("channels.status", { probe: false });
    const summary = res?.channels?.[channelId] ?? res?.channels?.[gwId];
    return summary?.configured === true;
  } catch {
    return false;
  }
}

// Save Telegram bot token to gateway config via config.patch
export async function saveTelegramBotToken(token: string): Promise<void> {
  const gw = await waitForConnection(5000);
  const snapshot = await gw.request<{ hash: string }>("config.get", {});
  const baseHash = snapshot?.hash ?? "";
  await gw.request("config.patch", {
    baseHash,
    raw: JSON.stringify({
      channels: { telegram: { botToken: token } },
    }),
  });
}

// Disconnect a channel via gateway
export async function disconnectChannel(channelId: ChannelId): Promise<{ success: boolean }> {
  const gw = await waitForConnection(5000);
  const gwId = GATEWAY_CHANNEL_MAP[channelId] ?? channelId;
  const res = await gw.request<{ cleared?: boolean }>("channels.logout", {
    channel: gwId,
  });
  return { success: Boolean(res?.cleared) };
}
