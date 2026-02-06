/**
 * Channels View - Vietnamese Only
 * Connect messaging apps: WhatsApp, Telegram, Zalo
 */

import { html, nothing } from "lit";
import { icons } from "../icons";
import type { ChannelStatus, ChannelId } from "../channels-api";

export interface ChannelsProps {
  channels: ChannelStatus[];
  loading: boolean;
  error?: string;
  connectingChannel?: ChannelId;
  onConnect: (channel: ChannelId) => void;
  onDisconnect: (channel: ChannelId) => void;
  onRefresh: () => void;
}

// Channel brand colors and icons
const CHANNEL_BRANDS: Record<ChannelId, { color: string; bgColor: string }> = {
  whatsapp: { color: "#25D366", bgColor: "rgba(37, 211, 102, 0.1)" },
  telegram: { color: "#0088cc", bgColor: "rgba(0, 136, 204, 0.1)" },
  zalo: { color: "#0068FF", bgColor: "rgba(0, 104, 255, 0.1)" },
};

// Channel SVG icons
const channelIcons = {
  whatsapp: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`,
  telegram: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
  zalo: html`<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 17.07c-.292.146-.878.438-1.61.438-1.024 0-1.61-.585-2.049-1.024-.439-.439-.878-1.024-1.024-1.756-.146-.732-.146-1.61 0-2.342.146-.732.585-1.317 1.024-1.756.439-.439 1.025-1.024 2.049-1.024.732 0 1.318.292 1.61.438V8.39c-.585-.146-1.171-.292-1.903-.292-1.318 0-2.488.439-3.366 1.317-.878.878-1.317 2.049-1.317 3.366v.293c0 1.317.439 2.488 1.317 3.366.878.878 2.048 1.317 3.366 1.317.732 0 1.318-.146 1.903-.292v-1.61zm-8.54-6.098H6.39v6.39h1.317v-2.342h1.61c1.024 0 1.756-.293 2.195-.732.439-.439.732-1.024.732-1.756 0-.732-.293-1.317-.732-1.756-.439-.439-1.171-.585-2.195-.585l-.963-.219zm.146 2.927H7.707v-1.903H9.5c.439 0 .732.146.878.293.146.146.293.439.293.732s-.147.585-.293.732c-.146.146-.439.146-.878.146z"/></svg>`,
};

function formatLastConnected(timestamp: number | undefined): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return `${diffDays} ngày trước`;
}

export function renderChannels(props: ChannelsProps) {
  const { channels, loading, error, connectingChannel, onConnect, onDisconnect, onRefresh } = props;

  const renderChannelCard = (channel: ChannelStatus) => {
    const brand = CHANNEL_BRANDS[channel.id];
    const isConnecting = connectingChannel === channel.id;
    const isZalo = channel.id === "zalo"; // Zalo coming soon

    return html`
      <div class="channel-card" style="--channel-color: ${brand.color}; --channel-bg: ${brand.bgColor};">
        <div class="channel-header">
          <div class="channel-icon" style="background: ${brand.bgColor}; color: ${brand.color};">
            ${channelIcons[channel.id]}
          </div>
          <div class="channel-info">
            <div class="channel-name">${channel.name}</div>
            <div class="channel-status ${channel.connected ? "connected" : ""}">
              ${isZalo
                ? "Sắp ra mắt"
                : channel.connected
                  ? "Đã kết nối"
                  : "Chưa kết nối"}
            </div>
          </div>
        </div>

        ${channel.connected && channel.lastConnectedAt ? html`
          <div class="channel-meta">
            <span class="channel-meta-label">Kết nối lần cuối:</span>
            <span class="channel-meta-value">${formatLastConnected(channel.lastConnectedAt)}</span>
          </div>
        ` : nothing}

        ${channel.error ? html`
          <div class="channel-error">${channel.error}</div>
        ` : nothing}

        <div class="channel-actions">
          ${isZalo ? html`
            <button class="btn btn-secondary" disabled>
              Sắp ra mắt
            </button>
          ` : channel.connected ? html`
            <button
              class="btn btn-danger-outline"
              @click=${() => onDisconnect(channel.id)}
              ?disabled=${isConnecting}
            >
              Ngắt kết nối
            </button>
          ` : html`
            <button
              class="btn btn-primary"
              style="background: ${brand.color}; border-color: ${brand.color};"
              @click=${() => onConnect(channel.id)}
              ?disabled=${isConnecting}
            >
              ${isConnecting ? "Đang kết nối..." : "Kết nối"}
            </button>
          `}
        </div>
      </div>
    `;
  };

  return html`
    <style>
      .channels-container {
        max-width: 900px;
        margin: 0 auto;
      }

      .channels-header {
        margin-bottom: 24px;
      }

      .channels-header h2 {
        font-size: 20px;
        font-weight: 600;
        color: var(--text-strong);
        margin: 0 0 8px;
      }

      .channels-header p {
        font-size: 14px;
        color: var(--muted);
        margin: 0;
      }

      .channels-actions {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 16px;
      }

      .channels-error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #ef4444;
        padding: 12px 16px;
        border-radius: var(--radius-md);
        font-size: 14px;
        margin-bottom: 16px;
      }

      .channels-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 20px;
      }

      .channel-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
        transition: all 0.2s ease;
      }

      .channel-card:hover {
        border-color: var(--channel-color);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      }

      .channel-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 16px;
      }

      .channel-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .channel-icon svg {
        width: 28px;
        height: 28px;
      }

      .channel-info {
        flex: 1;
        min-width: 0;
      }

      .channel-name {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-strong);
        margin-bottom: 4px;
      }

      .channel-status {
        font-size: 13px;
        color: var(--muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .channel-status.connected {
        color: #22c55e;
      }

      .channel-status.connected::before {
        content: "";
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
      }

      .channel-meta {
        font-size: 13px;
        color: var(--muted);
        margin-bottom: 16px;
        padding: 8px 12px;
        background: var(--bg-muted);
        border-radius: var(--radius-sm);
      }

      .channel-meta-label {
        margin-right: 4px;
      }

      .channel-meta-value {
        color: var(--text);
      }

      .channel-error {
        font-size: 13px;
        color: #ef4444;
        margin-bottom: 16px;
        padding: 8px 12px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: var(--radius-sm);
      }

      .channel-actions {
        display: flex;
        gap: 8px;
      }

      .channel-actions .btn {
        flex: 1;
      }

      .btn-danger-outline {
        background: transparent;
        border: 1px solid rgba(239, 68, 68, 0.5);
        color: #ef4444;
      }

      .btn-danger-outline:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.1);
        border-color: #ef4444;
      }

      .channels-loading {
        display: flex;
        justify-content: center;
        padding: 48px;
      }

      .channels-loading::after {
        content: "";
        width: 32px;
        height: 32px;
        border: 3px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @media (max-width: 640px) {
        .channels-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>

    <div class="channels-container">
      <div class="channels-header">
        <h2>Kết nối ứng dụng nhắn tin</h2>
        <p>Liên kết tài khoản của bạn với các ứng dụng nhắn tin để nhận và gửi tin nhắn</p>
      </div>

      <div class="channels-actions">
        <button class="btn btn-secondary" @click=${onRefresh} ?disabled=${loading}>
          ${icons.refresh}
          Làm mới
        </button>
      </div>

      ${error ? html`<div class="channels-error">${error}</div>` : nothing}

      ${loading ? html`
        <div class="channels-loading"></div>
      ` : html`
        <div class="channels-grid">
          ${channels.map(renderChannelCard)}
        </div>
      `}
    </div>
  `;
}
