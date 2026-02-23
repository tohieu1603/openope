/**
 * Settings View - Redesigned
 * Full-featured settings page with sidebar navigation
 */

import { html, nothing } from "lit";
import type { ChannelStatus, ChannelId } from "../channels-api";
import type { Tab } from "../navigation";
import type { UserProfile } from "../user-api";
import { icons } from "../icons";

export interface SettingsProps {
  user: UserProfile | null;
  loading: boolean;
  saving: boolean;
  error?: string;
  successMessage?: string;
  // Profile
  editingName: boolean;
  nameValue: string;
  onEditName: () => void;
  onCancelEditName: () => void;
  onNameChange: (value: string) => void;
  onSaveName: () => void;
  // Channels
  channels: ChannelStatus[];
  channelsLoading: boolean;
  connectingChannel?: ChannelId;
  onConnectChannel: (channel: ChannelId) => void;
  onDisconnectChannel: (channel: ChannelId) => void;
  onRefreshChannels: () => void;
  // Security
  showPasswordForm: boolean;
  onTogglePasswordForm: () => void;
  onChangePassword: (current: string, newPassword: string) => void;
  // Navigation
  onNavigate: (tab: Tab) => void;
}

// Channel brand colors
const CHANNEL_BRANDS: Record<ChannelId, { color: string; bgColor: string; gradient: string }> = {
  whatsapp: {
    color: "#25D366",
    bgColor: "rgba(37, 211, 102, 0.1)",
    gradient: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
  },
  telegram: {
    color: "#0088cc",
    bgColor: "rgba(0, 136, 204, 0.1)",
    gradient: "linear-gradient(135deg, #0088cc 0%, #229ED9 100%)",
  },
  zalo: {
    color: "#0068FF",
    bgColor: "rgba(0, 104, 255, 0.1)",
    gradient: "linear-gradient(135deg, #0068FF 0%, #0052CC 100%)",
  },
};

// Channel SVG icons
const channelIcons = {
  whatsapp: html`
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  `,
  telegram: html`
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      />
    </svg>
  `,
  zalo: html`
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.044-.377-.088-.612-.088-.873 0-1.647.498-2.031 1.262-.044-.873-.611-1.262-1.212-1.262-.564 0-1.032.323-1.262.813-.006-.01-.31-.813-1.458-.813-.976 0-1.703.672-1.857 1.545l-.025.002c-.168-.844-.82-1.545-1.83-1.545-.977 0-1.673.645-1.858 1.486-.23.108-.382.329-.382.581v4.145c0 .361.292.653.653.653h.327c.36 0 .653-.292.653-.653v-2.965c.005-.415.302-.784.75-.784.444 0 .75.315.75.75v3c0 .36.292.652.652.652h.327c.36 0 .653-.292.653-.652v-3c0-.435.306-.75.75-.75.448 0 .75.369.755.784v2.966c0 .36.293.652.653.652h.327c.36 0 .653-.292.653-.652v-3.25c.206.16.46.25.745.25.449 0 .751.369.756.784v2.216c0 .36.292.652.652.652h.327c.36 0 .653-.292.653-.652v-2.466c0-.872-.535-1.61-1.271-1.933.005-.05.009-.101.009-.152 0-.435-.306-.75-.75-.75-.29 0-.544.158-.683.392-.181-.573-.72-.992-1.36-.992-.285 0-.549.087-.774.231-.236-.44-.694-.731-1.22-.731z"
      />
    </svg>
  `,
};

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTokenBalance(balance: number): string {
  if (balance >= 1000000) {
    return (balance / 1000000).toFixed(1) + "M";
  }
  if (balance >= 1000) {
    return (balance / 1000).toFixed(1) + "K";
  }
  return balance.toLocaleString();
}

function formatRole(role: string | undefined): string {
  const roleKey = (role || "user").toLowerCase();
  const roleMap: Record<string, string> = {
    admin: "Quản trị viên",
    user: "Người dùng",
    moderator: "Điều hành viên",
  };
  return roleMap[roleKey] || roleMap.user;
}

export function renderSettings(props: SettingsProps) {
  const {
    user,
    loading,
    saving,
    error,
    successMessage,
    editingName,
    nameValue,
    onEditName,
    onCancelEditName,
    onNameChange,
    onSaveName,
    channels,
    channelsLoading,
    connectingChannel,
    onConnectChannel,
    onDisconnectChannel,
    onRefreshChannels,
    showPasswordForm,
    onTogglePasswordForm,
    onChangePassword,
    onNavigate,
  } = props;

  // Password form handler
  const handlePasswordSubmit = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const currentInput = form.querySelector('input[name="current"]') as HTMLInputElement;
    const newInput = form.querySelector('input[name="new"]') as HTMLInputElement;
    const confirmInput = form.querySelector('input[name="confirm"]') as HTMLInputElement;

    if (newInput.value !== confirmInput.value) {
      alert("Mật khẩu xác nhận không khớp");
      return;
    }

    onChangePassword(currentInput.value, newInput.value);
    form.reset();
  };

  // Render channel card
  const renderChannelCard = (channel: ChannelStatus) => {
    const brand = CHANNEL_BRANDS[channel.id];
    const isConnecting = connectingChannel === channel.id;

    return html`
      <div class="st-channel-card ${channel.connected ? "connected" : ""}" style="--ch-color: ${brand.color}; --ch-bg: ${brand.bgColor}; --ch-gradient: ${brand.gradient};">
        <div class="st-channel-icon">${channelIcons[channel.id]}</div>
        <div class="st-channel-info">
          <span class="st-channel-name">${channel.name}</span>
          <span class="st-channel-status">
            ${
              channel.connected
                ? html`
                    <span class="st-status-dot"></span>
                  `
                : nothing
            }
            ${channel.connected ? channel.accountName || "Đã kết nối" : "Chưa kết nối"}
          </span>
        </div>
        <div class="st-channel-action">
          ${
            channel.connected
              ? html`
            <button class="st-btn-channel disconnect" @click=${() => onDisconnectChannel(channel.id)} ?disabled=${isConnecting}>
              Ngắt
            </button>
          `
              : html`
            <button class="st-btn-channel connect" @click=${() => onConnectChannel(channel.id)} ?disabled=${isConnecting}>
              ${isConnecting ? "..." : "Kết nối"}
            </button>
          `
          }
        </div>
      </div>
    `;
  };

  return html`
    <style>
      .st-page {
        display: grid;
        grid-template-columns: 1fr;
        gap: 20px;
        padding-bottom: 40px;
      }

      /* Toast */
      .st-toast {
        position: fixed;
        top: 80px;
        right: 24px;
        padding: 12px 20px;
        border-radius: var(--radius-lg);
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 100;
        animation: stSlideIn 0.3s ease;
        box-shadow: var(--shadow-lg);
      }
      .st-toast svg { width: 18px; height: 18px; stroke: currentColor; fill: none; stroke-width: 2; }
      .st-toast.error { background: #fee2e2; color: #dc2626; }
      .st-toast.success { background: #dcfce7; color: #16a34a; }
      @keyframes stSlideIn {
        from { opacity: 0; transform: translateX(20px); }
        to { opacity: 1; transform: translateX(0); }
      }

      .st-loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
      }
      .st-loading::after {
        content: "";
        width: 40px;
        height: 40px;
        border: 3px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: stSpin 0.8s linear infinite;
      }
      @keyframes stSpin { to { transform: rotate(360deg); } }

      /* Profile Hero */
      .st-hero {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl);
        padding: 32px;
        display: flex;
        gap: 28px;
        align-items: center;
      }

      .st-avatar {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        font-weight: 700;
        color: white;
        text-transform: uppercase;
        flex-shrink: 0;
        box-shadow: 0 8px 24px rgba(var(--accent-rgb), 0.3);
      }

      .st-profile-info { flex: 1; }

      .st-name-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 4px;
      }

      .st-name {
        font-size: 26px;
        font-weight: 700;
        color: var(--text-strong);
        line-height: 1.2;
      }

      .st-role-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: var(--accent-subtle);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
        border-radius: var(--radius-full);
      }

      .st-email {
        font-size: 15px;
        color: var(--muted);
        margin-bottom: 16px;
      }

      .st-edit-btn {
        background: var(--bg-muted);
        border: 1px solid var(--border);
        color: var(--text);
        width: 32px;
        height: 32px;
        border-radius: var(--radius-md);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
      }
      .st-edit-btn:hover { background: var(--bg-hover); color: var(--accent); border-color: var(--accent); }
      .st-edit-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }

      .st-edit-form {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
      }
      .st-edit-form input {
        flex: 1;
        max-width: 300px;
        padding: 10px 14px;
        font-size: 18px;
        font-weight: 600;
        border: 2px solid var(--accent);
        border-radius: var(--radius-md);
        background: var(--bg);
        color: var(--text);
        outline: none;
      }
      .st-edit-form button {
        padding: 10px 16px;
        font-size: 14px;
        font-weight: 600;
        border-radius: var(--radius-md);
        border: none;
        cursor: pointer;
        transition: all 0.15s;
      }
      .st-edit-form .st-save-btn { background: var(--accent); color: white; }
      .st-edit-form .st-save-btn:hover { filter: brightness(1.1); }
      .st-edit-form .st-cancel-btn { background: var(--bg-muted); color: var(--text); border: 1px solid var(--border); }

      /* Stats Row */
      .st-stats {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }

      .st-stat {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 18px;
        background: var(--bg);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        transition: all 0.2s;
      }
      .st-stat.clickable { cursor: pointer; }
      .st-stat.clickable:hover { border-color: var(--accent); background: var(--bg-hover); transform: translateY(-2px); }

      .st-stat-icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .st-stat-icon svg { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 2; }
      .st-stat-icon.joined { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
      .st-stat-icon.tokens { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
      .st-stat-icon.topup { background: rgba(34, 197, 94, 0.15); color: #22c55e; }

      .st-stat-content { display: flex; flex-direction: column; }
      .st-stat-label { font-size: 12px; color: var(--muted); font-weight: 500; }
      .st-stat-value { font-size: 16px; font-weight: 700; color: var(--text-strong); }

      /* Grid Layout */
      .st-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
      }
      @media (min-width: 1400px) {
        .st-grid { grid-template-columns: repeat(4, 1fr); }
      }
      @media (max-width: 900px) {
        .st-grid { grid-template-columns: 1fr; }
      }

      /* Card */
      .st-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-xl);
        overflow: hidden;
      }

      .st-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px;
        border-bottom: 1px solid var(--border);
      }

      .st-card-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 15px;
        font-weight: 600;
        color: var(--text-strong);
      }
      .st-card-title svg { width: 18px; height: 18px; stroke: var(--accent); fill: none; stroke-width: 2; }

      .st-card-body { padding: 20px; }

      .st-refresh-btn {
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--muted);
        width: 32px;
        height: 32px;
        border-radius: var(--radius-md);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
      }
      .st-refresh-btn:hover { background: var(--bg-hover); color: var(--accent); }
      .st-refresh-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }

      /* Channels */
      .st-channels-grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .st-channel-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        transition: all 0.2s;
      }
      .st-channel-card:hover { border-color: var(--ch-color); }
      .st-channel-card.connected { background: var(--ch-bg); border-color: var(--ch-color); }

      .st-channel-icon {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-md);
        background: var(--ch-gradient);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
      }
      .st-channel-icon svg { width: 22px; height: 22px; }

      .st-channel-info { flex: 1; min-width: 0; }
      .st-channel-name { display: block; font-size: 14px; font-weight: 600; color: var(--text-strong); }
      .st-channel-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--muted);
      }
      .st-channel-card.connected .st-channel-status { color: var(--ch-color); }

      .st-status-dot {
        width: 6px;
        height: 6px;
        background: currentColor;
        border-radius: 50%;
      }

      .st-btn-channel {
        padding: 8px 14px;
        font-size: 12px;
        font-weight: 600;
        border-radius: var(--radius-md);
        border: none;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .st-btn-channel.connect { background: var(--ch-gradient); color: white; }
      .st-btn-channel.connect:hover:not(:disabled) { filter: brightness(1.1); }
      .st-btn-channel.disconnect { background: transparent; border: 1px solid rgba(239, 68, 68, 0.4); color: #ef4444; }
      .st-btn-channel.disconnect:hover:not(:disabled) { background: rgba(239, 68, 68, 0.1); }
      .st-btn-channel.disabled { background: var(--bg-muted); color: var(--muted); cursor: not-allowed; }
      .st-btn-channel:disabled { opacity: 0.6; cursor: not-allowed; }

      .st-channels-loading {
        display: flex;
        justify-content: center;
        padding: 30px;
      }
      .st-channels-loading::after {
        content: "";
        width: 24px;
        height: 24px;
        border: 2px solid var(--border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: stSpin 0.7s linear infinite;
      }

      /* Settings List */
      .st-list { display: flex; flex-direction: column; }

      .st-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 0;
        border-bottom: 1px solid var(--border);
      }
      .st-item:last-child { border-bottom: none; }

      .st-item-info { flex: 1; }
      .st-item-label { font-size: 14px; font-weight: 500; color: var(--text-strong); }
      .st-item-desc { font-size: 12px; color: var(--muted); margin-top: 2px; }

      .st-item-action {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .st-btn {
        padding: 8px 14px;
        font-size: 13px;
        font-weight: 500;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
        cursor: pointer;
        transition: all 0.15s;
      }
      .st-btn:hover:not(:disabled) { background: var(--bg-muted); border-color: var(--accent); color: var(--accent); }
      .st-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .st-btn.primary { background: var(--accent); color: white; border-color: var(--accent); }
      .st-btn.primary:hover:not(:disabled) { filter: brightness(1.1); }
      .st-btn.danger { color: #ef4444; border-color: rgba(239, 68, 68, 0.4); }
      .st-btn.danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.1); }

      /* Password Form */
      .st-password-form {
        margin-top: 16px;
        padding: 20px;
        background: var(--bg);
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
      }

      .st-form-row { margin-bottom: 14px; }
      .st-form-row:last-of-type { margin-bottom: 0; }

      .st-form-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--text);
        margin-bottom: 6px;
      }

      .st-form-input {
        width: 100%;
        padding: 10px 14px;
        font-size: 14px;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--card);
        color: var(--text);
        box-sizing: border-box;
        transition: border-color 0.15s;
      }
      .st-form-input:focus { outline: none; border-color: var(--accent); }

      .st-form-actions {
        display: flex;
        gap: 10px;
        margin-top: 16px;
      }

      /* Quick Actions */
      .st-quick-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      @media (min-width: 1400px) {
        .st-quick-grid { grid-template-columns: repeat(4, 1fr); }
      }

      .st-quick-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: all 0.2s;
      }
      .st-quick-card:hover { border-color: var(--accent); background: var(--bg-hover); transform: translateY(-2px); }

      .st-quick-icon {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .st-quick-icon svg { width: 22px; height: 22px; stroke: currentColor; fill: none; stroke-width: 2; }
      .st-quick-icon.billing { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
      .st-quick-icon.docs { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
      .st-quick-icon.workflow { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
      .st-quick-icon.chat { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }

      .st-quick-content { flex: 1; min-width: 0; }
      .st-quick-title { font-size: 14px; font-weight: 600; color: var(--text-strong); }
      .st-quick-desc { font-size: 12px; color: var(--muted); margin-top: 2px; }

      /* Toggle Switch */
      .st-toggle {
        position: relative;
        width: 44px;
        height: 24px;
        background: var(--border);
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .st-toggle.active { background: var(--accent); }
      .st-toggle::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 20px;
        height: 20px;
        background: white;
        border-radius: 50%;
        transition: transform 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .st-toggle.active::after { transform: translateX(20px); }

      /* Responsive */
      @media (max-width: 640px) {
        .st-hero { flex-direction: column; text-align: center; padding: 24px; }
        .st-stats { justify-content: center; }
        .st-quick-grid { grid-template-columns: 1fr; }
      }
      @media (min-width: 1400px) {
        .st-hero { padding: 40px; gap: 36px; }
        .st-avatar { width: 120px; height: 120px; font-size: 48px; }
        .st-name { font-size: 30px; }
      }
    </style>

    <div class="st-page">
      ${error ? html`<div class="st-toast error">${icons.alertCircle} ${error}</div>` : nothing}
      ${successMessage ? html`<div class="st-toast success">${icons.check} ${successMessage}</div>` : nothing}

      ${
        loading
          ? html`
              <div class="st-loading"></div>
            `
          : html`
        <!-- Profile Hero -->
        <div class="st-hero">
          <div class="st-avatar">${user?.name?.[0] || user?.email?.[0] || "U"}</div>
          <div class="st-profile-info">
            ${
              editingName
                ? html`
              <div class="st-edit-form">
                <input
                  type="text"
                  .value=${nameValue}
                  @input=${(e: InputEvent) => onNameChange((e.target as HTMLInputElement).value)}
                  ?disabled=${saving}
                  placeholder="Nhập tên của bạn"
                  autofocus
                />
                <button class="st-save-btn" @click=${onSaveName} ?disabled=${saving}>
                  ${saving ? "Đang lưu..." : "Lưu"}
                </button>
                <button class="st-cancel-btn" @click=${onCancelEditName} ?disabled=${saving}>Hủy</button>
              </div>
            `
                : html`
              <div class="st-name-row">
                <span class="st-name">${user?.name || "Chưa đặt tên"}</span>
                <span class="st-role-badge">${formatRole(user?.role)}</span>
                <button class="st-edit-btn" @click=${onEditName} title="Chỉnh sửa tên">
                  ${icons.pencil}
                </button>
              </div>
            `
            }
            <div class="st-email">${user?.email || "-"}</div>

            <div class="st-stats">
              <div class="st-stat">
                <div class="st-stat-icon joined">${icons.calendar}</div>
                <div class="st-stat-content">
                  <span class="st-stat-label">Tham gia</span>
                  <span class="st-stat-value">${formatDate(user?.createdAt)}</span>
                </div>
              </div>
              <div class="st-stat clickable" @click=${() => onNavigate("billing")}>
                <div class="st-stat-icon tokens">${icons.zap}</div>
                <div class="st-stat-content">
                  <span class="st-stat-label">Token còn lại</span>
                  <span class="st-stat-value">${formatTokenBalance(user?.tokenBalance || 0)}</span>
                </div>
              </div>
              <div class="st-stat clickable" @click=${() => onNavigate("billing")}>
                <div class="st-stat-icon topup">${icons.creditCard}</div>
                <div class="st-stat-content">
                  <span class="st-stat-label">Nạp thêm</span>
                  <span class="st-stat-value">Mua token</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Grid Layout -->
        <div class="st-grid">
          <!-- Channels Card -->
          <div class="st-card">
            <div class="st-card-header">
              <div class="st-card-title">${icons.link} Kênh kết nối</div>
              <button class="st-refresh-btn" @click=${onRefreshChannels} ?disabled=${channelsLoading} title="Làm mới">
                ${icons.refresh}
              </button>
            </div>
            <div class="st-card-body">
              ${
                channelsLoading
                  ? html`
                      <div class="st-channels-loading"></div>
                    `
                  : html`
                <div class="st-channels-grid">
                  ${channels.map(renderChannelCard)}
                </div>
              `
              }
            </div>
          </div>

          <!-- Security Card -->
          <div class="st-card">
            <div class="st-card-header">
              <div class="st-card-title">${icons.shield} Bảo mật</div>
            </div>
            <div class="st-card-body">
              <div class="st-list">
                <div class="st-item">
                  <div class="st-item-info">
                    <div class="st-item-label">Mật khẩu</div>
                    <div class="st-item-desc">Thay đổi mật khẩu đăng nhập</div>
                  </div>
                  <div class="st-item-action">
                    <button class="st-btn" @click=${onTogglePasswordForm}>
                      ${showPasswordForm ? "Hủy" : "Đổi mật khẩu"}
                    </button>
                  </div>
                </div>

                ${
                  showPasswordForm
                    ? html`
                  <form class="st-password-form" @submit=${handlePasswordSubmit}>
                    <div class="st-form-row">
                      <label class="st-form-label">Mật khẩu hiện tại</label>
                      <input class="st-form-input" type="password" name="current" required ?disabled=${saving} />
                    </div>
                    <div class="st-form-row">
                      <label class="st-form-label">Mật khẩu mới</label>
                      <input class="st-form-input" type="password" name="new" required minlength="6" ?disabled=${saving} />
                    </div>
                    <div class="st-form-row">
                      <label class="st-form-label">Xác nhận mật khẩu</label>
                      <input class="st-form-input" type="password" name="confirm" required minlength="6" ?disabled=${saving} />
                    </div>
                    <div class="st-form-actions">
                      <button type="submit" class="st-btn primary" ?disabled=${saving}>
                        ${saving ? "Đang xử lý..." : "Cập nhật"}
                      </button>
                    </div>
                  </form>
                `
                    : nothing
                }

                <div class="st-item">
                  <div class="st-item-info">
                    <div class="st-item-label">Xác thực 2 bước (2FA)</div>
                    <div class="st-item-desc">Bảo vệ tài khoản với mã xác thực</div>
                  </div>
                  <div class="st-item-action">
                    <button class="st-btn" disabled>Sắp có</button>
                  </div>
                </div>

                <div class="st-item">
                  <div class="st-item-info">
                    <div class="st-item-label">Phiên đăng nhập</div>
                    <div class="st-item-desc">Quản lý các thiết bị đang đăng nhập</div>
                  </div>
                  <div class="st-item-action">
                    <button class="st-btn" disabled>Xem</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Preferences Card -->
          <div class="st-card">
            <div class="st-card-header">
              <div class="st-card-title">${icons.settings} Tùy chọn</div>
            </div>
            <div class="st-card-body">
              <div class="st-list">
                <div class="st-item">
                  <div class="st-item-info">
                    <div class="st-item-label">Thông báo email</div>
                    <div class="st-item-desc">Nhận thông báo qua email</div>
                  </div>
                  <div class="st-item-action">
                    <div class="st-toggle active"></div>
                  </div>
                </div>

                <div class="st-item">
                  <div class="st-item-info">
                    <div class="st-item-label">Thông báo workflow</div>
                    <div class="st-item-desc">Nhận thông báo khi workflow hoàn thành</div>
                  </div>
                  <div class="st-item-action">
                    <div class="st-toggle active"></div>
                  </div>
                </div>

                <div class="st-item">
                  <div class="st-item-info">
                    <div class="st-item-label">Ngôn ngữ</div>
                    <div class="st-item-desc">Tiếng Việt</div>
                  </div>
                  <div class="st-item-action">
                    <button class="st-btn" disabled>Thay đổi</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Actions Card -->
          <div class="st-card">
            <div class="st-card-header">
              <div class="st-card-title">${icons.zap} Truy cập nhanh</div>
            </div>
            <div class="st-card-body">
              <div class="st-quick-grid">
                <div class="st-quick-card" @click=${() => onNavigate("billing")}>
                  <div class="st-quick-icon billing">${icons.creditCard}</div>
                  <div class="st-quick-content">
                    <div class="st-quick-title">Thanh toán</div>
                    <div class="st-quick-desc">Nạp token & lịch sử</div>
                  </div>
                </div>
                <div class="st-quick-card" @click=${() => onNavigate("workflow")}>
                  <div class="st-quick-icon workflow">${icons.workflow}</div>
                  <div class="st-quick-content">
                    <div class="st-quick-title">Workflows</div>
                    <div class="st-quick-desc">Tự động hóa công việc</div>
                  </div>
                </div>
                <div class="st-quick-card" @click=${() => onNavigate("docs")}>
                  <div class="st-quick-icon docs">${icons.book}</div>
                  <div class="st-quick-content">
                    <div class="st-quick-title">Tài liệu</div>
                    <div class="st-quick-desc">Hướng dẫn sử dụng</div>
                  </div>
                </div>
                <div class="st-quick-card" @click=${() => onNavigate("chat")}>
                  <div class="st-quick-icon chat">${icons.messageSquare}</div>
                  <div class="st-quick-content">
                    <div class="st-quick-title">Chat với AI</div>
                    <div class="st-quick-desc">Bắt đầu trò chuyện</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="st-card" style="border-color: rgba(239, 68, 68, 0.3);">
          <div class="st-card-header" style="background: rgba(239, 68, 68, 0.05);">
            <div class="st-card-title" style="color: #ef4444;">
              ${icons.alertTriangle} Vùng nguy hiểm
            </div>
          </div>
          <div class="st-card-body">
            <div class="st-list">
              <div class="st-item">
                <div class="st-item-info">
                  <div class="st-item-label">Xuất dữ liệu</div>
                  <div class="st-item-desc">Tải xuống tất cả dữ liệu của bạn</div>
                </div>
                <div class="st-item-action">
                  <button class="st-btn" disabled>Xuất</button>
                </div>
              </div>
              <div class="st-item">
                <div class="st-item-info">
                  <div class="st-item-label">Xóa tài khoản</div>
                  <div class="st-item-desc">Xóa vĩnh viễn tài khoản và tất cả dữ liệu</div>
                </div>
                <div class="st-item-action">
                  <button class="st-btn danger" disabled>Xóa tài khoản</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
      }
    </div>
  `;
}
