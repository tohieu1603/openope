import {
  getChannelsStatus,
  startZaloQrLogin,
  waitZaloQrLogin,
  disconnectChannel,
  CHANNEL_DEFINITIONS,
  type ChannelStatus,
  type ChannelId,
} from "./channels-api";
/**
 * Channel domain action functions.
 */
import { showToast } from "./components/operis-toast";

export interface ChannelHost {
  channels: ChannelStatus[];
  channelsLoading: boolean;
  channelsError: string | null;
  channelsConnecting: ChannelId | null;
  zaloQrBase64: string | null;
  zaloQrStatus: string | null;
}

export async function loadChannels(host: ChannelHost) {
  host.channelsLoading = true;
  host.channelsError = null;
  try {
    host.channels = await getChannelsStatus();
  } catch (err) {
    host.channelsError = err instanceof Error ? err.message : "Không thể tải kênh";
    // Fallback to default channels
    host.channels = Object.entries(CHANNEL_DEFINITIONS).map(([id, def]) => ({
      id: id as ChannelId,
      name: def.name,
      icon: def.icon,
      connected: false,
    }));
  } finally {
    host.channelsLoading = false;
  }
}

export async function handleChannelConnect(host: ChannelHost, channelId: ChannelId) {
  host.channelsConnecting = channelId;
  host.channelsError = null;
  try {
    if (channelId === "zalo") {
      host.zaloQrStatus = "pending";
      host.zaloQrBase64 = null;
      const startResult = await startZaloQrLogin({ force: true });

      if (startResult.qrDataUrl) {
        host.zaloQrBase64 = startResult.qrDataUrl;
        host.zaloQrStatus = "qr_ready";
      }
      // Wait for login completion in background (caller handles startZaloLoginWait)
      return; // Don't clear channelsConnecting — QR modal stays open
    }

    await loadChannels(host);
    showToast("Đã kết nối kênh", "success");
  } catch (err) {
    console.error("[channels] connect error:", err);
    host.channelsError = err instanceof Error ? err.message : "Không thể kết nối kênh";
    showToast(err instanceof Error ? err.message : "Không thể kết nối kênh", "error");
    host.zaloQrStatus = null;
    host.zaloQrBase64 = null;
    host.channelsConnecting = null;
  }
}

/** Wait for Zalo QR login completion. Call after handleChannelConnect for Zalo. */
export async function startZaloLoginWait(host: ChannelHost) {
  try {
    const result = await waitZaloQrLogin({ timeoutMs: 120_000 });
    if (result.connected) {
      stopZaloPolling(host);
      host.channelsConnecting = null;
      showToast("Đã kết nối Zalo", "success");
      await loadChannels(host);
    } else {
      stopZaloPolling(host);
      host.channelsConnecting = null;
      host.channelsError = result.message || "Kết nối Zalo thất bại";
    }
  } catch {
    stopZaloPolling(host);
    host.channelsConnecting = null;
    host.channelsError = "Mất kết nối khi chờ quét mã QR";
  }
}

export function stopZaloPolling(host: ChannelHost) {
  host.zaloQrBase64 = null;
  host.zaloQrStatus = null;
}

export async function handleChannelDisconnect(host: ChannelHost, channelId: ChannelId) {
  host.channelsConnecting = channelId;
  host.channelsError = null;
  try {
    await disconnectChannel(channelId);
    await loadChannels(host);
    showToast("Đã ngắt kết nối kênh", "success");
  } catch (err) {
    host.channelsError = err instanceof Error ? err.message : "Không thể ngắt kết nối kênh";
    showToast(err instanceof Error ? err.message : "Không thể ngắt kết nối kênh", "error");
  } finally {
    host.channelsConnecting = null;
  }
}
