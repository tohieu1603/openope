// Nodes view for Client Web
// Based on moltbot nodes view structure
import { html, nothing } from "lit";
import type { NodeInfo, DevicePairingList, PendingDevice, PairedDevice, DeviceTokenSummary } from "../agent-types";

export type NodesProps = {
  loading: boolean;
  nodes: NodeInfo[];
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  onRefresh: () => void;
  onDevicesRefresh: () => void;
  onDeviceApprove: (requestId: string) => void;
  onDeviceReject: (requestId: string) => void;
  onDeviceRotate: (deviceId: string, role: string, scopes?: string[]) => void;
  onDeviceRevoke: (deviceId: string, role: string) => void;
};

function formatAgo(ts?: number | null): string {
  if (!ts) return "n/a";
  const diff = Date.now() - ts;
  if (diff < 60000) return "vừa xong";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`;
  return `${Math.floor(diff / 86400000)} ngày trước`;
}

function formatList(arr?: string[]): string {
  if (!arr || arr.length === 0) return "-";
  return arr.join(", ");
}

export function renderNodes(props: NodesProps) {
  return html`
    <style>
      /* Nodes card */
      .nodes-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; margin-bottom: 20px; }
      .nodes-card-title { font-size: 15px; font-weight: 600; color: var(--text-strong, var(--text)); }
      .nodes-card-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
      .nodes-row { display: flex; align-items: center; gap: 12px; }
      .nodes-muted { color: var(--muted); font-size: 13px; }
      .nodes-btn {
        display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px;
        background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md);
        font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease;
      }
      .nodes-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
      .nodes-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .nodes-btn--sm { padding: 6px 12px; font-size: 12px; }
      .nodes-btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-foreground, #fff); }
      .nodes-btn.danger { background: var(--danger, #dc2626); border-color: var(--danger, #dc2626); color: #fff; }
      .callout { padding: 12px 16px; border-radius: var(--radius-md); font-size: 13px; }
      .callout.danger { background: var(--danger-subtle, #fee2e2); color: var(--danger, #dc2626); }

      /* List */
      .nodes-list { display: flex; flex-direction: column; gap: 12px; }
      .nodes-list-item {
        display: flex; justify-content: space-between; gap: 16px; padding: 16px;
        border: 1px solid var(--border); border-radius: var(--radius-md); flex-wrap: wrap;
      }
      .nodes-list-main { flex: 1; min-width: 250px; }
      .nodes-list-title { font-size: 14px; font-weight: 500; color: var(--text-strong, var(--text)); }
      .nodes-list-sub { font-size: 13px; color: var(--muted); margin-top: 4px; font-family: var(--mono, monospace); }
      .nodes-list-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }

      /* Chip row */
      .nodes-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .nodes-chip {
        padding: 2px 8px; background: var(--secondary); border-radius: var(--radius-full);
        font-size: 11px; color: var(--muted);
      }
      .nodes-chip-ok { background: var(--ok-subtle, #dcfce7); color: var(--ok, #16a34a); }
      .nodes-chip-warn { background: var(--warn-subtle, #fef3c7); color: var(--warn, #d97706); }

      /* Token row */
      .nodes-token-row {
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
        padding: 8px; background: var(--bg-subtle, var(--secondary)); border-radius: var(--radius-md);
      }
    </style>

    ${renderDevices(props)}
    ${renderNodesList(props)}
  `;
}

function renderDevices(props: NodesProps) {
  const list = props.devicesList ?? { pending: [], paired: [] };
  const pending = Array.isArray(list.pending) ? list.pending : [];
  const paired = Array.isArray(list.paired) ? list.paired : [];

  return html`
    <section class="nodes-card">
      <div class="nodes-row" style="justify-content: space-between;">
        <div>
          <div class="nodes-card-title">Thiết bị</div>
          <div class="nodes-card-sub">Yêu cầu ghép nối và role tokens.</div>
        </div>
        <button class="nodes-btn" ?disabled=${props.devicesLoading} @click=${props.onDevicesRefresh}>
          ${props.devicesLoading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>
      ${props.devicesError ? html`<div class="callout danger" style="margin-top: 12px;">${props.devicesError}</div>` : nothing}
      <div class="nodes-list" style="margin-top: 16px;">
        ${pending.length > 0 ? html`
          <div class="nodes-muted" style="margin-bottom: 4px;">Đang chờ</div>
          ${pending.map(req => renderPendingDevice(req, props))}
        ` : nothing}
        ${paired.length > 0 ? html`
          <div class="nodes-muted" style="margin-top: 12px; margin-bottom: 4px;">Đã ghép nối</div>
          ${paired.map(device => renderPairedDevice(device, props))}
        ` : nothing}
        ${pending.length === 0 && paired.length === 0 ? html`
          <div class="nodes-muted">Chưa có thiết bị nào được ghép nối.</div>
        ` : nothing}
      </div>
    </section>
  `;
}

function renderPendingDevice(req: PendingDevice, props: NodesProps) {
  const name = req.displayName?.trim() || req.deviceId;
  const age = typeof req.ts === "number" ? formatAgo(req.ts) : "n/a";
  const role = req.role?.trim() ? `role: ${req.role}` : "role: -";
  const repair = req.isRepair ? " · repair" : "";
  const ip = req.remoteIp ? ` · ${req.remoteIp}` : "";

  return html`
    <div class="nodes-list-item">
      <div class="nodes-list-main">
        <div class="nodes-list-title">${name}</div>
        <div class="nodes-list-sub">${req.deviceId}${ip}</div>
        <div class="nodes-muted" style="margin-top: 6px;">${role} · yêu cầu ${age}${repair}</div>
      </div>
      <div class="nodes-list-meta">
        <div class="nodes-row" style="justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
          <button class="nodes-btn nodes-btn--sm primary" @click=${() => props.onDeviceApprove(req.requestId)}>
            Chấp nhận
          </button>
          <button class="nodes-btn nodes-btn--sm" @click=${() => props.onDeviceReject(req.requestId)}>
            Từ chối
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderPairedDevice(device: PairedDevice, props: NodesProps) {
  const name = device.displayName?.trim() || device.deviceId;
  const ip = device.remoteIp ? ` · ${device.remoteIp}` : "";
  const roles = `roles: ${formatList(device.roles)}`;
  const scopes = `scopes: ${formatList(device.scopes)}`;
  const tokens = Array.isArray(device.tokens) ? device.tokens : [];

  return html`
    <div class="nodes-list-item">
      <div class="nodes-list-main">
        <div class="nodes-list-title">${name}</div>
        <div class="nodes-list-sub">${device.deviceId}${ip}</div>
        <div class="nodes-muted" style="margin-top: 6px;">${roles} · ${scopes}</div>
        ${tokens.length === 0 ? html`
          <div class="nodes-muted" style="margin-top: 6px;">Tokens: none</div>
        ` : html`
          <div class="nodes-muted" style="margin-top: 10px;">Tokens</div>
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
            ${tokens.map(token => renderTokenRow(device.deviceId, token, props))}
          </div>
        `}
      </div>
    </div>
  `;
}

function renderTokenRow(deviceId: string, token: DeviceTokenSummary, props: NodesProps) {
  const status = token.revokedAtMs ? "revoked" : "active";
  const scopes = `scopes: ${formatList(token.scopes)}`;
  const when = formatAgo(token.rotatedAtMs ?? token.createdAtMs ?? token.lastUsedAtMs ?? null);

  return html`
    <div class="nodes-token-row">
      <div class="nodes-list-sub" style="font-size: 12px;">${token.role} · ${status} · ${scopes} · ${when}</div>
      <div class="nodes-row" style="justify-content: flex-end; gap: 6px; flex-wrap: wrap;">
        <button class="nodes-btn nodes-btn--sm"
          @click=${() => props.onDeviceRotate(deviceId, token.role, token.scopes)}>
          Rotate
        </button>
        ${token.revokedAtMs ? nothing : html`
          <button class="nodes-btn nodes-btn--sm danger"
            @click=${() => props.onDeviceRevoke(deviceId, token.role)}>
            Revoke
          </button>
        `}
      </div>
    </div>
  `;
}

function renderNodesList(props: NodesProps) {
  return html`
    <section class="nodes-card">
      <div class="nodes-row" style="justify-content: space-between;">
        <div>
          <div class="nodes-card-title">Nodes</div>
          <div class="nodes-card-sub">Thiết bị đã ghép nối và live links.</div>
        </div>
        <button class="nodes-btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>
      <div class="nodes-list" style="margin-top: 16px;">
        ${props.nodes.length === 0 ? html`
          <div class="nodes-muted">Không tìm thấy node nào.</div>
        ` : props.nodes.map(node => renderNode(node))}
      </div>
    </section>
  `;
}

function renderNode(node: NodeInfo) {
  const connected = Boolean(node.connected);
  const paired = Boolean(node.paired);
  const title = node.displayName?.trim() || node.nodeId || "unknown";
  const caps = Array.isArray(node.caps) ? node.caps : [];
  const commands = Array.isArray(node.commands) ? node.commands : [];

  return html`
    <div class="nodes-list-item">
      <div class="nodes-list-main">
        <div class="nodes-list-title">${title}</div>
        <div class="nodes-list-sub">
          ${node.nodeId || ""}
          ${node.remoteIp ? ` · ${node.remoteIp}` : ""}
          ${node.version ? ` · ${node.version}` : ""}
        </div>
        <div class="nodes-chip-row">
          <span class="nodes-chip">${paired ? "paired" : "unpaired"}</span>
          <span class="nodes-chip ${connected ? 'nodes-chip-ok' : 'nodes-chip-warn'}">
            ${connected ? "connected" : "offline"}
          </span>
          ${caps.slice(0, 8).map(c => html`<span class="nodes-chip">${String(c)}</span>`)}
          ${commands.slice(0, 6).map(c => html`<span class="nodes-chip">${String(c)}</span>`)}
        </div>
      </div>
    </div>
  `;
}
