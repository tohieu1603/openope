// Agents view for Client Web
// Based on moltbot agents view structure
import { html, nothing } from "lit";
import type {
  Agent,
  AgentsListResult,
  AgentIdentityResult,
  AgentFileEntry,
  AgentsFilesListResult,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
} from "../agent-types";

export type AgentsPanel =
  | "overview"
  | "files"
  | "tools"
  | "skills"
  | "cron"
  | "channels";

export type AgentsProps = {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;
  // Config state
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  // Files state
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  // Identity state
  agentIdentityById: Record<string, AgentIdentityResult>;
  // Channels state
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  // Cron state
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronError: string | null;
  // Callbacks
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentsPanel) => void;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  onChannelsRefresh: () => void;
  onCronRefresh: () => void;
};

function normalizeAgentLabel(agent: Agent) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function resolveAgentEmoji(agent: Agent): string {
  const emoji = agent.identity?.emoji?.trim();
  if (emoji && emoji.length <= 16 && !emoji.includes("/")) {
    return emoji;
  }
  return "";
}

function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatAgo(ts?: number | null): string {
  if (!ts) return "n/a";
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function renderAgents(props: AgentsProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  const selectedId =
    props.selectedAgentId ?? defaultId ?? agents[0]?.id ?? null;
  const selectedAgent = selectedId
    ? (agents.find((a) => a.id === selectedId) ?? null)
    : null;

  return html`
    <style>
      /* Agents layout */
      .agents-layout {
        display: grid;
        grid-template-columns: 280px 1fr;
        gap: 20px;
        min-height: 500px;
      }
      @media (max-width: 900px) {
        .agents-layout {
          grid-template-columns: 1fr;
        }
      }

      /* Agent sidebar */
      .agents-sidebar {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
      }
      .agents-main {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* Agent list */
      .agent-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .agent-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        width: 100%;
      }
      .agent-row:hover {
        background: var(--bg-hover);
        border-color: var(--border);
      }
      .agent-row.active {
        background: var(--accent-subtle);
        border-color: var(--accent);
      }
      .agent-avatar {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-md);
        background: var(--secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 600;
        color: var(--text-strong, var(--text));
      }
      .agent-info {
        flex: 1;
        min-width: 0;
      }
      .agent-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--text-strong, var(--text));
      }
      .agent-sub {
        font-size: 12px;
        color: var(--muted);
        font-family: var(--mono, monospace);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .agent-pill {
        padding: 2px 8px;
        background: var(--accent-subtle);
        border: 1px solid var(--accent);
        border-radius: var(--radius-full);
        font-size: 11px;
        color: var(--accent);
      }

      /* Agent header */
      .agent-header {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
      }
      .agent-header-main {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .agent-header-meta {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
      }
      .agent-avatar--lg {
        width: 56px;
        height: 56px;
        font-size: 28px;
      }

      /* Agent tabs */
      .agent-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .agent-tab {
        padding: 8px 16px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .agent-tab:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .agent-tab.active {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accent-foreground, #fff);
      }

      /* Card styles */
      .card {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: 20px;
      }
      .card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-strong, var(--text));
      }
      .card-sub {
        font-size: 13px;
        color: var(--muted);
        margin-top: 4px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .muted {
        color: var(--muted);
        font-size: 13px;
      }
      .mono {
        font-family: var(--mono, monospace);
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn--sm {
        padding: 6px 12px;
        font-size: 12px;
      }
      .btn.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--accent-foreground, #fff);
      }
      .callout {
        padding: 12px 16px;
        border-radius: var(--radius-md);
        font-size: 13px;
      }
      .callout.danger {
        background: var(--danger-subtle, #fee2e2);
        color: var(--danger, #dc2626);
      }
      .callout.info {
        background: var(--accent-subtle);
        color: var(--accent);
      }

      /* Files */
      .agent-files-grid {
        display: grid;
        grid-template-columns: 240px 1fr;
        gap: 16px;
      }
      @media (max-width: 700px) {
        .agent-files-grid {
          grid-template-columns: 1fr;
        }
      }
      .agent-files-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .agent-file-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px;
        background: transparent;
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        width: 100%;
      }
      .agent-file-row:hover {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .agent-file-row.active {
        background: var(--accent-subtle);
        border-color: var(--accent);
      }
      .agent-file-name {
        font-size: 13px;
        font-weight: 500;
        font-family: var(--mono, monospace);
      }
      .agent-file-meta {
        font-size: 11px;
        color: var(--muted);
        margin-top: 4px;
      }
      .agent-file-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .agent-file-title {
        font-size: 14px;
        font-weight: 600;
        font-family: var(--mono, monospace);
      }
      .agent-file-sub {
        font-size: 12px;
        color: var(--muted);
        font-family: var(--mono, monospace);
        margin-top: 4px;
      }
      .agent-file-actions {
        display: flex;
        gap: 8px;
      }
      .agent-files-editor {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .field span {
        font-size: 13px;
        color: var(--muted);
        font-weight: 500;
      }
      .field textarea {
        border: 1px solid var(--border);
        background: var(--card);
        border-radius: var(--radius-md);
        padding: 12px;
        font-size: 13px;
        font-family: var(--mono, monospace);
        color: var(--text);
        min-height: 300px;
        resize: vertical;
        outline: none;
      }
      .field textarea:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px var(--accent-subtle);
      }

      /* Overview grid */
      .agents-overview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }
      .agent-kv {
        padding: 12px 16px;
        background: var(--bg-subtle, var(--secondary));
        border-radius: var(--radius-md);
      }
      .agent-kv .label {
        font-size: 11px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 500;
      }
      .agent-kv > div:last-child {
        font-size: 14px;
        margin-top: 4px;
        font-weight: 500;
      }
    </style>

    <div class="agents-layout">
      <section class="agents-sidebar">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Agents</div>
            <div class="card-sub">${agents.length} đã cấu hình.</div>
          </div>
          <button
            class="btn btn--sm"
            ?disabled=${props.loading}
            @click=${props.onRefresh}
          >
            ${props.loading ? "Đang tải…" : "Làm mới"}
          </button>
        </div>
        ${props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">
              ${props.error}
            </div>`
          : nothing}
        <div class="agent-list" style="margin-top: 16px;">
          ${agents.length === 0
            ? html`<div class="muted">Không tìm thấy agent nào.</div>`
            : agents.map((agent) => {
                const badge =
                  defaultId && agent.id === defaultId ? "default" : null;
                const emoji = resolveAgentEmoji(agent);
                return html`
                  <button
                    type="button"
                    class="agent-row ${selectedId === agent.id ? "active" : ""}"
                    @click=${() => props.onSelectAgent(agent.id)}
                  >
                    <div class="agent-avatar">
                      ${emoji || normalizeAgentLabel(agent).slice(0, 1)}
                    </div>
                    <div class="agent-info">
                      <div class="agent-title">
                        ${normalizeAgentLabel(agent)}
                      </div>
                      <div class="agent-sub">${agent.id}</div>
                    </div>
                    ${badge
                      ? html`<span class="agent-pill">${badge}</span>`
                      : nothing}
                  </button>
                `;
              })}
        </div>
      </section>

      <section class="agents-main">
        ${!selectedAgent
          ? html`
              <div class="card">
                <div class="card-title">Chọn một agent</div>
                <div class="card-sub">
                  Chọn agent để xem workspace và công cụ.
                </div>
              </div>
            `
          : html`
              ${renderAgentHeader(selectedAgent, defaultId)}
              ${renderAgentTabs(props.activePanel, (panel) =>
                props.onSelectPanel(panel),
              )}
              ${props.activePanel === "overview"
                ? renderAgentOverview(selectedAgent, defaultId)
                : nothing}
              ${props.activePanel === "files"
                ? renderAgentFiles({
                    agentId: selectedAgent.id,
                    agentFilesList: props.agentFilesList,
                    agentFilesLoading: props.agentFilesLoading,
                    agentFilesError: props.agentFilesError,
                    agentFileActive: props.agentFileActive,
                    agentFileContents: props.agentFileContents,
                    agentFileDrafts: props.agentFileDrafts,
                    agentFileSaving: props.agentFileSaving,
                    onLoadFiles: props.onLoadFiles,
                    onSelectFile: props.onSelectFile,
                    onFileDraftChange: props.onFileDraftChange,
                    onFileReset: props.onFileReset,
                    onFileSave: props.onFileSave,
                  })
                : nothing}
              ${props.activePanel === "tools"
                ? renderAgentTools(selectedAgent)
                : nothing}
              ${props.activePanel === "skills"
                ? renderAgentSkillsPlaceholder(selectedAgent)
                : nothing}
            `}
      </section>
    </div>
  `;
}

function renderAgentHeader(agent: Agent, defaultId: string | null) {
  const badge = defaultId && agent.id === defaultId ? "default" : null;
  const displayName = normalizeAgentLabel(agent);
  const subtitle =
    agent.identity?.theme?.trim() || "Agent workspace và routing.";
  const emoji = resolveAgentEmoji(agent);

  return html`
    <section class="agent-header">
      <div class="agent-header-main">
        <div class="agent-avatar agent-avatar--lg">
          ${emoji || displayName.slice(0, 1)}
        </div>
        <div>
          <div class="card-title">${displayName}</div>
          <div class="card-sub">${subtitle}</div>
        </div>
      </div>
      <div class="agent-header-meta">
        <div class="mono">${agent.id}</div>
        ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
      </div>
    </section>
  `;
}

function renderAgentTabs(
  active: AgentsPanel,
  onSelect: (panel: AgentsPanel) => void,
) {
  const tabs: Array<{ id: AgentsPanel; label: string }> = [
    { id: "overview", label: "Tổng quan" },
    { id: "files", label: "Files" },
    { id: "tools", label: "Tools" },
    { id: "skills", label: "Skills" },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="agent-tab ${active === tab.id ? "active" : ""}"
            type="button"
            @click=${() => onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

function renderAgentOverview(agent: Agent, defaultId: string | null) {
  const identityName =
    agent.identity?.name?.trim() || agent.name?.trim() || agent.id;
  const identityEmoji = resolveAgentEmoji(agent) || "-";
  const isDefault = Boolean(defaultId && agent.id === defaultId);

  return html`
    <section class="card">
      <div class="card-title">Tổng quan</div>
      <div class="card-sub">Workspace paths và identity metadata.</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv">
          <div class="label">Identity Name</div>
          <div>${identityName}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Identity Emoji</div>
          <div>${identityEmoji}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Default</div>
          <div>${isDefault ? "yes" : "no"}</div>
        </div>
        <div class="agent-kv">
          <div class="label">Theme</div>
          <div>${agent.identity?.theme?.trim() || "-"}</div>
        </div>
      </div>
    </section>
  `;
}

function renderAgentFiles(params: {
  agentId: string;
  agentFilesList: AgentsFilesListResult | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
}) {
  const list =
    params.agentFilesList?.agentId === params.agentId
      ? params.agentFilesList
      : null;
  const files = list?.files ?? [];
  const active = params.agentFileActive ?? null;
  const activeEntry = active
    ? (files.find((f) => f.name === active) ?? null)
    : null;
  const baseContent = active ? (params.agentFileContents[active] ?? "") : "";
  const draft = active ? (params.agentFileDrafts[active] ?? baseContent) : "";
  const isDirty = active ? draft !== baseContent : false;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Core Files</div>
          <div class="card-sub">
            Bootstrap persona, identity, và tool guidance.
          </div>
        </div>
        <button
          class="btn btn--sm"
          ?disabled=${params.agentFilesLoading}
          @click=${() => params.onLoadFiles(params.agentId)}
        >
          ${params.agentFilesLoading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>
      ${list
        ? html`<div class="muted mono" style="margin-top: 8px;">
            Workspace: ${list.workspace}
          </div>`
        : nothing}
      ${params.agentFilesError
        ? html`<div class="callout danger" style="margin-top: 12px;">
            ${params.agentFilesError}
          </div>`
        : nothing}
      ${!list
        ? html`
            <div class="callout info" style="margin-top: 12px">
              Tải workspace files để chỉnh sửa.
            </div>
          `
        : html`
            <div class="agent-files-grid" style="margin-top: 16px;">
              <div class="agent-files-list">
                ${files.length === 0
                  ? html`<div class="muted">Không tìm thấy file.</div>`
                  : files.map((file) => {
                      const status = file.missing
                        ? "Missing"
                        : `${formatBytes(file.size)} · ${formatAgo(file.updatedAtMs)}`;
                      return html`
                        <button
                          type="button"
                          class="agent-file-row ${active === file.name
                            ? "active"
                            : ""}"
                          @click=${() => params.onSelectFile(file.name)}
                        >
                          <div>
                            <div class="agent-file-name">${file.name}</div>
                            <div class="agent-file-meta">${status}</div>
                          </div>
                          ${file.missing
                            ? html`<span
                                class="agent-pill"
                                style="background: var(--warn-subtle); border-color: var(--warn); color: var(--warn);"
                                >missing</span
                              >`
                            : nothing}
                        </button>
                      `;
                    })}
              </div>
              <div class="agent-files-editor">
                ${!activeEntry
                  ? html`<div class="muted">Chọn file để chỉnh sửa.</div>`
                  : html`
                      <div class="agent-file-header">
                        <div>
                          <div class="agent-file-title">
                            ${activeEntry.name}
                          </div>
                          <div class="agent-file-sub">${activeEntry.path}</div>
                        </div>
                        <div class="agent-file-actions">
                          <button
                            class="btn btn--sm"
                            ?disabled=${!isDirty}
                            @click=${() => params.onFileReset(activeEntry.name)}
                          >
                            Reset
                          </button>
                          <button
                            class="btn btn--sm primary"
                            ?disabled=${params.agentFileSaving || !isDirty}
                            @click=${() => params.onFileSave(activeEntry.name)}
                          >
                            ${params.agentFileSaving ? "Đang lưu…" : "Lưu"}
                          </button>
                        </div>
                      </div>
                      ${activeEntry.missing
                        ? html`
                            <div class="callout info" style="margin-top: 10px">
                              File này đang thiếu. Lưu sẽ tạo file mới.
                            </div>
                          `
                        : nothing}
                      <label class="field" style="margin-top: 12px;">
                        <span>Content</span>
                        <textarea
                          .value=${draft}
                          @input=${(e: Event) =>
                            params.onFileDraftChange(
                              activeEntry.name,
                              (e.target as HTMLTextAreaElement).value,
                            )}
                        ></textarea>
                      </label>
                    `}
              </div>
            </div>
          `}
    </section>
  `;
}

function renderAgentTools(agent: Agent) {
  return html`
    <section class="card">
      <div class="card-title">Tool Access</div>
      <div class="card-sub">Profile và per-tool overrides cho agent này.</div>
      <div class="callout info" style="margin-top: 16px;">
        Quản lý tool access sẽ được bổ sung sau.
      </div>
    </section>
  `;
}

function renderAgentSkillsPlaceholder(agent: Agent) {
  return html`
    <section class="card">
      <div class="card-title">Skills</div>
      <div class="card-sub">Per-agent skill allowlist và workspace skills.</div>
      <div class="callout info" style="margin-top: 16px;">
        Xem trang Skills để quản lý tất cả skills.
      </div>
    </section>
  `;
}
