/**
 * Settings View — Polished minimal layout
 * Full-width grouped sections with refined styling
 */

import { html, nothing } from "lit";
import type { Tab } from "../navigation";
import type { UserProfile } from "../user-api";
import { DISABLED_CHANNELS, type ChannelStatus, type ChannelId } from "../channels-api";
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
  zaloQrBase64?: string | null;
  zaloQrStatus?: string | null;
  onConnectChannel: (channel: ChannelId) => void;
  onDisconnectChannel: (channel: ChannelId) => void;
  onRefreshChannels: () => void;
  onCancelZaloQr?: () => void;
  // Security
  showPasswordForm: boolean;
  onTogglePasswordForm: () => void;
  onChangePassword: (current: string, newPassword: string) => void;
  // API Key
  apiKeyValue: string;
  apiKeyLoading: boolean;
  apiKeySaving: boolean;
  apiKeyHasKey: boolean;
  onApiKeyChange: (value: string) => void;
  onSaveApiKey: () => void;
  // Navigation
  onNavigate: (tab: Tab) => void;
}

// Channel brand colors
const CHANNEL_COLORS: Record<ChannelId, string> = {
  whatsapp: "#25D366",
  telegram: "#0088cc",
  zalo: "#0068FF",
};

// Channel SVG icons
const channelIcons: Record<ChannelId, ReturnType<typeof html>> = {
  whatsapp: html`
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  `,
  telegram: html`
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path
        d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      />
    </svg>
  `,
  zalo: html`
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path
        d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 8.16c-.169-.044-.377-.088-.612-.088-.873 0-1.647.498-2.031 1.262-.044-.873-.611-1.262-1.212-1.262-.564 0-1.032.323-1.262.813-.006-.01-.31-.813-1.458-.813-.976 0-1.703.672-1.857 1.545l-.025.002c-.168-.844-.82-1.545-1.83-1.545-.977 0-1.673.645-1.858 1.486-.23.108-.382.329-.382.581v4.145c0 .361.292.653.653.653h.327c.36 0 .653-.292.653-.653v-2.965c.005-.415.302-.784.75-.784.444 0 .75.315.75.75v3c0 .36.292.652.652.652h.327c.36 0 .653-.292.653-.652v-3c0-.435.306-.75.75-.75.448 0 .75.369.755.784v2.966c0 .36.293.652.653.652h.327c.36 0 .653-.292.653-.652v-3.25c.206.16.46.25.745.25.449 0 .751.369.756.784v2.216c0 .36.292.652.652.652h.327c.36 0 .653-.292.653-.652v-2.466c0-.872-.535-1.61-1.271-1.933.005-.05.009-.101.009-.152 0-.435-.306-.75-.75-.75-.29 0-.544.158-.683.392-.181-.573-.72-.992-1.36-.992-.285 0-.549.087-.774.231-.236-.44-.694-.731-1.22-.731z"
      />
    </svg>
  `,
};

function formatTokenBalance(balance: number): string {
  if (balance >= 1_000_000) return (balance / 1_000_000).toFixed(1) + "M";
  if (balance >= 1_000) return (balance / 1_000).toFixed(1) + "K";
  return balance.toLocaleString();
}

function formatRole(role: string | undefined): string {
  const map: Record<string, string> = { admin: "Admin", user: "User", moderator: "Mod" };
  return map[(role || "user").toLowerCase()] || "User";
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
    zaloQrBase64,
    zaloQrStatus,
    onConnectChannel,
    onDisconnectChannel,
    onRefreshChannels,
    onCancelZaloQr,
    showPasswordForm,
    onTogglePasswordForm,
    onChangePassword,
    apiKeyValue,
    apiKeyLoading,
    apiKeySaving,
    apiKeyHasKey,
    onApiKeyChange,
    onSaveApiKey,
    onNavigate,
  } = props;

  const handlePasswordSubmit = (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const cur = (form.querySelector('input[name="current"]') as HTMLInputElement).value;
    const nw = (form.querySelector('input[name="new"]') as HTMLInputElement).value;
    const confirm = (form.querySelector('input[name="confirm"]') as HTMLInputElement).value;
    if (nw !== confirm) {
      alert("Mật khẩu xác nhận không khớp");
      return;
    }
    onChangePassword(cur, nw);
    form.reset();
  };

  const renderChannel = (ch: ChannelStatus) => {
    const color = CHANNEL_COLORS[ch.id];
    const isConnecting = connectingChannel === ch.id;
    const isDisabled = DISABLED_CHANNELS.includes(ch.id);
    return html`
      <div class="st-row st-row--hover">
        <div class="st-ch-icon" style="background: ${color}20; color: ${color};">
          ${channelIcons[ch.id]}
        </div>
        <div class="st-row-body">
          <span class="st-row-title">${ch.name}</span>
          ${
            ch.connected
              ? html`<span class="st-row-desc st-connected"><span class="st-dot"></span>${ch.accountName || "Đã kết nối"}</span>`
              : html`<span class="st-row-desc">${isDisabled ? "Sắp ra mắt" : "Chưa kết nối"}</span>`
          }
        </div>
        <div class="st-row-end">
          ${
            ch.connected
              ? html`<button class="st-btn st-btn--ghost st-btn--danger" @click=${() => onDisconnectChannel(ch.id)} ?disabled=${isConnecting}>Ngắt</button>`
              : html`<button class="st-btn st-btn--ghost" @click=${() => onConnectChannel(ch.id)} ?disabled=${isConnecting || isDisabled}>
                ${isDisabled ? "Sắp có" : isConnecting ? "..." : "Kết nối"}</button>`
          }
        </div>
      </div>
    `;
  };

  return html`
    <style>
      /* ---- Settings page layout ---- */
      .st-page {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-bottom: 48px;
      }

      /* Toast */
      .st-toast { position: fixed; top: 80px; right: 24px; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 500; z-index: 100; animation: stFade 0.25s ease; backdrop-filter: blur(8px); }
      .st-toast.error { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
      .st-toast.success { background: rgba(34,197,94,0.12); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }
      @keyframes stFade { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

      .st-loading { display: flex; justify-content: center; padding: 80px 0; }
      .st-loading::after { content: ""; width: 28px; height: 28px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: stSpin 0.7s linear infinite; }
      @keyframes stSpin { to { transform: rotate(360deg); } }

      /* ---- Profile card (full width) ---- */
      .st-profile {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 20px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
      }
      .st-avatar {
        width: 52px; height: 52px; border-radius: 14px;
        background: var(--accent);
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; font-weight: 700; color: white;
        text-transform: uppercase; flex-shrink: 0;
      }
      .st-profile-body { flex: 1; min-width: 0; }
      .st-profile-row { display: flex; align-items: center; gap: 8px; }
      .st-profile-name { font-size: 17px; font-weight: 600; color: var(--text-strong); }
      .st-profile-role {
        font-size: 10px; padding: 2px 8px; border-radius: 4px;
        background: var(--accent); color: white;
        font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
      }
      .st-profile-email { font-size: 13px; color: var(--muted); margin-top: 2px; }
      .st-profile-edit {
        background: none; border: none; color: var(--muted); cursor: pointer;
        padding: 6px; display: flex; border-radius: 6px; transition: all 0.15s;
      }
      .st-profile-edit:hover { color: var(--text-strong); background: var(--bg-muted); }
      .st-profile-edit svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }

      .st-edit-inline { display: flex; align-items: center; gap: 8px; }
      .st-edit-inline input {
        padding: 7px 12px; font-size: 14px; border: 1px solid var(--border);
        border-radius: 8px; background: var(--bg); color: var(--text);
        outline: none; width: 220px; transition: border-color 0.15s;
      }
      .st-edit-inline input:focus { border-color: var(--accent); }
      .st-edit-inline button { padding: 7px 14px; font-size: 12px; font-weight: 600; border-radius: 8px; border: none; cursor: pointer; transition: all 0.15s; }
      .st-edit-save { background: var(--accent); color: white; }
      .st-edit-save:hover { filter: brightness(1.1); }
      .st-edit-cancel { background: var(--bg-muted); color: var(--text); }
      .st-edit-cancel:hover { background: var(--border); }

      /* ---- Card / Group ---- */
      .st-card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
      }
      .st-card-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px 10px;
        font-size: 12px; font-weight: 600; text-transform: uppercase;
        letter-spacing: 0.04em; color: var(--muted);
      }
      .st-card-header button {
        background: none; border: none; color: var(--muted); cursor: pointer;
        padding: 4px; display: flex; border-radius: 6px; transition: all 0.15s;
      }
      .st-card-header button:hover { color: var(--text-strong); background: var(--bg-muted); }
      .st-card-header button svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 2; }

      /* ---- Row ---- */
      .st-row {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 18px;
        border-top: 1px solid var(--border);
        transition: background 0.12s;
      }
      .st-row:first-child, .st-card-header + .st-row { border-top: none; }
      .st-row--hover:hover { background: var(--bg-muted); }
      .st-row--clickable { cursor: pointer; }
      .st-row-body { flex: 1; min-width: 0; }
      .st-row-title { display: block; font-size: 14px; color: var(--text-strong); font-weight: 500; }
      .st-row-desc { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; }
      .st-row-desc.st-connected { color: #4ade80; display: flex; align-items: center; gap: 5px; }
      .st-row-end { flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
      .st-row-value { font-size: 15px; font-weight: 600; color: var(--text-strong); font-variant-numeric: tabular-nums; }
      .st-row-chevron { width: 16px; height: 16px; color: var(--muted); }
      .st-row-chevron svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; }

      .st-dot { width: 6px; height: 6px; background: #4ade80; border-radius: 50%; flex-shrink: 0; }
      .st-dot-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .st-dot-status.active { background: #4ade80; box-shadow: 0 0 6px rgba(74,222,128,0.4); }

      /* Channel icon */
      .st-ch-icon {
        width: 36px; height: 36px; border-radius: 10px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }

      /* ---- Buttons ---- */
      .st-btn {
        padding: 7px 14px; font-size: 13px; font-weight: 500;
        border-radius: 8px; border: 1px solid var(--border);
        background: var(--bg); color: var(--text);
        cursor: pointer; transition: all 0.15s;
      }
      .st-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .st-btn:disabled { opacity: 0.35; cursor: not-allowed; }
      .st-btn--primary { background: var(--accent); color: white; border-color: var(--accent); }
      .st-btn--primary:hover:not(:disabled) { filter: brightness(1.1); color: white; }
      .st-btn--ghost { background: none; border-color: transparent; }
      .st-btn--ghost:hover:not(:disabled) { background: var(--bg-muted); border-color: transparent; color: var(--accent); }
      .st-btn--danger { color: #f87171; }
      .st-btn--danger:hover:not(:disabled) { color: #ef4444; background: rgba(239,68,68,0.08); }

      /* API Key input row */
      .st-apikey { display: flex; gap: 8px; align-items: center; padding: 10px 18px 14px; }
      .st-apikey input {
        flex: 1; padding: 8px 12px; font-size: 13px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--bg); color: var(--text); outline: none;
        box-sizing: border-box; transition: border-color 0.15s;
      }
      .st-apikey input:focus { border-color: var(--accent); }

      /* Password form */
      .st-pw-form { padding: 14px 18px; border-top: 1px solid var(--border); }
      .st-pw-field { margin-bottom: 12px; }
      .st-pw-field:last-of-type { margin-bottom: 0; }
      .st-pw-label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; font-weight: 500; }
      .st-pw-input {
        width: 100%; padding: 8px 12px; font-size: 13px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--bg); color: var(--text);
        box-sizing: border-box; outline: none; transition: border-color 0.15s;
      }
      .st-pw-input:focus { border-color: var(--accent); }
      .st-pw-actions { display: flex; gap: 8px; margin-top: 14px; }

      /* Toggle */
      .st-toggle {
        position: relative; width: 38px; height: 22px;
        background: var(--border); border-radius: 11px;
        cursor: pointer; transition: background 0.2s; flex-shrink: 0;
        border: none;
      }
      .st-toggle.on { background: var(--accent); }
      .st-toggle::after {
        content: ""; position: absolute; top: 3px; left: 3px;
        width: 16px; height: 16px; background: white; border-radius: 50%;
        transition: transform 0.2s;
      }
      .st-toggle.on::after { transform: translateX(16px); }

      /* Channels loading */
      .st-ch-loading { padding: 24px; display: flex; justify-content: center; }
      .st-ch-loading::after { content: ""; width: 22px; height: 22px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: stSpin 0.7s linear infinite; }

      /* Zalo QR modal */
      .st-qr-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .st-qr-modal { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; width: 340px; max-width: 90vw; }
      .st-qr-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
      .st-qr-header h3 { margin: 0; font-size: 17px; font-weight: 600; color: var(--text-strong); }
      .st-qr-close { background: none; border: none; font-size: 22px; color: var(--muted); cursor: pointer; padding: 4px; border-radius: 6px; transition: all 0.15s; }
      .st-qr-close:hover { background: var(--bg-muted); color: var(--text-strong); }
      .st-qr-body { text-align: center; }
      .st-qr-hint { font-size: 13px; color: var(--muted); margin: 0 0 14px; }
      .st-qr-img { width: 220px; height: 220px; border-radius: 12px; border: 1px solid var(--border); }
      .st-qr-loading { padding: 36px 0; }
      .st-qr-loading p { font-size: 13px; color: var(--muted); margin: 14px 0 0; }
      .st-qr-spinner { width: 28px; height: 28px; border: 2px solid var(--border); border-top-color: #0068FF; border-radius: 50%; animation: stSpin 0.7s linear infinite; margin: 0 auto; }

      /* Danger card */
      .st-card--danger { border-color: rgba(239,68,68,0.15); }
      .st-card--danger .st-card-header { color: #f87171; }

      @media (max-width: 640px) {
        .st-page { padding: 0 4px 40px; }
      }
    </style>

    <div class="st-page">
      ${error ? html`<div class="st-toast error">${error}</div>` : nothing}
      ${successMessage ? html`<div class="st-toast success">${successMessage}</div>` : nothing}

      ${
        loading
          ? html`
              <div class="st-loading"></div>
            `
          : html`

        <!-- Profile -->
        <div class="st-profile">
          <div class="st-avatar">${user?.name?.[0] || user?.email?.[0] || "U"}</div>
          <div class="st-profile-body">
            ${
              editingName
                ? html`
              <div class="st-edit-inline">
                <input type="text" .value=${nameValue}
                  @input=${(e: InputEvent) => onNameChange((e.target as HTMLInputElement).value)}
                  ?disabled=${saving} placeholder="Tên của bạn" autofocus />
                <button class="st-edit-save" @click=${onSaveName} ?disabled=${saving}>${saving ? "..." : "Lưu"}</button>
                <button class="st-edit-cancel" @click=${onCancelEditName}>Hủy</button>
              </div>
            `
                : html`
              <div class="st-profile-row">
                <span class="st-profile-name">${user?.name || "Chưa đặt tên"}</span>
                <span class="st-profile-role">${formatRole(user?.role)}</span>
                <button class="st-profile-edit" @click=${onEditName} title="Chỉnh sửa">${icons.pencil}</button>
              </div>
            `
            }
            <div class="st-profile-email">${user?.email || "-"}</div>
          </div>
          <div class="st-row-end">
            <div class="st-row-value" style="cursor: pointer;" @click=${() => onNavigate("billing")}
              title="Xem chi tiết token">
              ${formatTokenBalance(user?.tokenBalance || 0)} token
            </div>
          </div>
        </div>

        <!-- Kênh kết nối -->
        <div class="st-card">
          <div class="st-card-header">
            <span>Kênh kết nối</span>
            <button @click=${onRefreshChannels} ?disabled=${channelsLoading} title="Làm mới">${icons.refresh}</button>
          </div>
          ${
            channelsLoading
              ? html`
                  <div class="st-ch-loading"></div>
                `
              : channels.map(renderChannel)
          }
        </div>

        <!-- Tài khoản -->
        <div class="st-card">
          <div class="st-card-header">Tài khoản</div>
          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">API Key</span>
              <span class="st-row-desc">${apiKeyHasKey ? "Đã cấu hình" : "Chưa cấu hình"}</span>
            </div>
            ${
              apiKeyHasKey
                ? html`
                    <div class="st-dot-status active" title="Đã cấu hình"></div>
                  `
                : nothing
            }
          </div>
          ${
            apiKeyLoading
              ? nothing
              : html`
            <div class="st-apikey">
              <input type="password"
                placeholder="${apiKeyHasKey ? "Nhập key mới để thay thế..." : "sk_..."}"
                .value=${apiKeyValue}
                @input=${(e: InputEvent) => onApiKeyChange((e.target as HTMLInputElement).value)}
                ?disabled=${apiKeySaving} />
              <button class="st-btn st-btn--primary" @click=${onSaveApiKey}
                ?disabled=${apiKeySaving || !apiKeyValue.trim()}>
                ${apiKeySaving ? "..." : "Lưu"}
              </button>
            </div>
          `
          }
        </div>

        <!-- Bảo mật -->
        <div class="st-card">
          <div class="st-card-header">Bảo mật</div>
          <div class="st-row st-row--hover">
            <div class="st-row-body">
              <span class="st-row-title">Mật khẩu</span>
              <span class="st-row-desc">Thay đổi mật khẩu đăng nhập</span>
            </div>
            <div class="st-row-end">
              <button class="st-btn" @click=${onTogglePasswordForm}>${showPasswordForm ? "Hủy" : "Đổi"}</button>
            </div>
          </div>

          ${
            showPasswordForm
              ? html`
            <form class="st-pw-form" @submit=${handlePasswordSubmit}>
              <div class="st-pw-field">
                <label class="st-pw-label">Mật khẩu hiện tại</label>
                <input class="st-pw-input" type="password" name="current" required ?disabled=${saving} />
              </div>
              <div class="st-pw-field">
                <label class="st-pw-label">Mật khẩu mới</label>
                <input class="st-pw-input" type="password" name="new" required minlength="6" ?disabled=${saving} />
              </div>
              <div class="st-pw-field">
                <label class="st-pw-label">Xác nhận</label>
                <input class="st-pw-input" type="password" name="confirm" required minlength="6" ?disabled=${saving} />
              </div>
              <div class="st-pw-actions">
                <button type="submit" class="st-btn st-btn--primary" ?disabled=${saving}>${saving ? "..." : "Cập nhật"}</button>
              </div>
            </form>
          `
              : nothing
          }

          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">Xác thực 2 bước (2FA)</span>
            </div>
            <div class="st-row-end">
              <button class="st-btn" disabled>Sắp có</button>
            </div>
          </div>

          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">Phiên đăng nhập</span>
            </div>
            <div class="st-row-end">
              <button class="st-btn" disabled>Xem</button>
            </div>
          </div>
        </div>

        <!-- Tùy chọn -->
        <div class="st-card">
          <div class="st-card-header">Tùy chọn</div>
          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">Thông báo email</span>
            </div>
            <button class="st-toggle on"></button>
          </div>
          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">Thông báo workflow</span>
            </div>
            <button class="st-toggle on"></button>
          </div>
          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">Ngôn ngữ</span>
            </div>
            <span style="font-size: 13px; color: var(--muted);">Tiếng Việt</span>
          </div>
        </div>

        <!-- Vùng nguy hiểm -->
        <div class="st-card st-card--danger">
          <div class="st-card-header">Vùng nguy hiểm</div>
          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">Xuất dữ liệu</span>
              <span class="st-row-desc">Tải về tất cả dữ liệu của bạn</span>
            </div>
            <div class="st-row-end">
              <button class="st-btn" disabled>Xuất</button>
            </div>
          </div>
          <div class="st-row">
            <div class="st-row-body">
              <span class="st-row-title">Xóa tài khoản</span>
              <span class="st-row-desc">Xóa vĩnh viễn tài khoản và dữ liệu</span>
            </div>
            <div class="st-row-end">
              <button class="st-btn st-btn--danger" disabled>Xóa</button>
            </div>
          </div>
        </div>
      `
      }

      <!-- Zalo QR modal -->
      ${
        connectingChannel === "zalo" && zaloQrStatus
          ? html`
        <div class="st-qr-overlay" @click=${onCancelZaloQr}>
          <div class="st-qr-modal" @click=${(e: Event) => e.stopPropagation()}>
            <div class="st-qr-header">
              <h3>Kết nối Zalo</h3>
              <button class="st-qr-close" @click=${onCancelZaloQr}>&times;</button>
            </div>
            <div class="st-qr-body">
              ${
                zaloQrBase64
                  ? html`
                  <p class="st-qr-hint">Mở ứng dụng Zalo &rarr; Quét mã QR</p>
                  <img class="st-qr-img" src="${zaloQrBase64}" alt="Zalo QR" />
                `
                  : html`
                  <div class="st-qr-loading">
                    <div class="st-qr-spinner"></div>
                    <p>${zaloQrStatus === "scanned" ? "Đã quét — đang xác nhận..." : "Đang tạo mã QR..."}</p>
                  </div>
                `
              }
            </div>
          </div>
        </div>
      `
          : nothing
      }
    </div>
  `;
}
