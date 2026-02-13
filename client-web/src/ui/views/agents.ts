// Agents view for Client Web - ported from ui/src/ui/views/agents.ts
import { html, nothing } from "lit";
import type {
  AgentFileEntry,
  AgentsFilesListResult,
  AgentsListResult,
  AgentIdentityResult,
  ChannelAccountSnapshot,
  ChannelsStatusSnapshot,
  CronJob,
  CronStatus,
  SkillStatusEntry,
  SkillStatusReport,
} from "../agent-types";
import {
  expandToolGroups,
  normalizeToolName,
  resolveToolProfilePolicy,
} from "../tool-policy";
import { formatAgo, formatMs } from "../format-utils";
import {
  formatCronPayload,
  formatCronSchedule,
  formatNextRun,
} from "../cron-presenter";

export type AgentsPanel = "overview" | "files" | "tools" | "skills" | "channels" | "cron";

export type AgentsProps = {
  loading: boolean;
  error: string | null;
  agentsList: AgentsListResult | null;
  selectedAgentId: string | null;
  activePanel: AgentsPanel;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  channelsLoading: boolean;
  channelsError: string | null;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsLastSuccess: number | null;
  cronLoading: boolean;
  cronStatus: CronStatus | null;
  cronJobs: CronJob[];
  cronError: string | null;
  agentFilesLoading: boolean;
  agentFilesError: string | null;
  agentFilesList: AgentsFilesListResult | null;
  agentFileActive: string | null;
  agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>;
  agentFileSaving: boolean;
  agentIdentityLoading: boolean;
  agentIdentityError: string | null;
  agentIdentityById: Record<string, AgentIdentityResult>;
  agentSkillsLoading: boolean;
  agentSkillsReport: SkillStatusReport | null;
  agentSkillsError: string | null;
  agentSkillsAgentId: string | null;
  skillsFilter: string;
  onRefresh: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectPanel: (panel: AgentsPanel) => void;
  onLoadFiles: (agentId: string) => void;
  onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void;
  onFileSave: (name: string) => void;
  onToolsProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onToolsOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void;
  onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
  onChannelsRefresh: () => void;
  onCronRefresh: () => void;
  onSkillsFilterChange: (next: string) => void;
  onSkillsRefresh: () => void;
  onAgentSkillToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onAgentSkillsClear: (agentId: string) => void;
  onAgentSkillsDisableAll: (agentId: string) => void;
};

const TOOL_SECTIONS = [
  {
    id: "fs",
    label: "Files",
    tools: [
      { id: "read", label: "read", description: "Read file contents" },
      { id: "write", label: "write", description: "Create or overwrite files" },
      { id: "edit", label: "edit", description: "Make precise edits" },
      { id: "apply_patch", label: "apply_patch", description: "Patch files (OpenAI)" },
    ],
  },
  {
    id: "runtime",
    label: "Runtime",
    tools: [
      { id: "exec", label: "exec", description: "Run shell commands" },
      { id: "process", label: "process", description: "Manage background processes" },
    ],
  },
  {
    id: "web",
    label: "Web",
    tools: [
      { id: "web_search", label: "web_search", description: "Search the web" },
      { id: "web_fetch", label: "web_fetch", description: "Fetch web content" },
    ],
  },
  {
    id: "memory",
    label: "Memory",
    tools: [
      { id: "memory_search", label: "memory_search", description: "Semantic search" },
      { id: "memory_get", label: "memory_get", description: "Read memory files" },
    ],
  },
  {
    id: "sessions",
    label: "Sessions",
    tools: [
      { id: "sessions_list", label: "sessions_list", description: "List sessions" },
      { id: "sessions_history", label: "sessions_history", description: "Session history" },
      { id: "sessions_send", label: "sessions_send", description: "Send to session" },
      { id: "sessions_spawn", label: "sessions_spawn", description: "Spawn sub-agent" },
      { id: "session_status", label: "session_status", description: "Session status" },
    ],
  },
  {
    id: "ui",
    label: "UI",
    tools: [
      { id: "browser", label: "browser", description: "Control web browser" },
      { id: "canvas", label: "canvas", description: "Control canvases" },
    ],
  },
  {
    id: "messaging",
    label: "Messaging",
    tools: [{ id: "message", label: "message", description: "Send messages" }],
  },
  {
    id: "automation",
    label: "Automation",
    tools: [
      { id: "cron", label: "cron", description: "Schedule tasks" },
      { id: "gateway", label: "gateway", description: "Gateway control" },
    ],
  },
  {
    id: "nodes",
    label: "Nodes",
    tools: [{ id: "nodes", label: "nodes", description: "Nodes + devices" }],
  },
  {
    id: "agents",
    label: "Agents",
    tools: [{ id: "agents_list", label: "agents_list", description: "List agents" }],
  },
  {
    id: "media",
    label: "Media",
    tools: [{ id: "image", label: "image", description: "Image understanding" }],
  },
];

const PROFILE_OPTIONS = [
  { id: "minimal", label: "Minimal" },
  { id: "coding", label: "Coding" },
  { id: "messaging", label: "Messaging" },
  { id: "full", label: "Full" },
] as const;

type ToolPolicy = {
  allow?: string[];
  deny?: string[];
};

type AgentConfigEntry = {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: unknown;
  skills?: string[];
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

type ConfigSnapshot = {
  agents?: {
    defaults?: { workspace?: string; model?: unknown; models?: Record<string, { alias?: string }> };
    list?: AgentConfigEntry[];
  };
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

// ─── Helpers ─────────────────────────────────────────────

function normalizeAgentLabel(agent: { id: string; name?: string; identity?: { name?: string } }) {
  return agent.name?.trim() || agent.identity?.name?.trim() || agent.id;
}

function isLikelyEmoji(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 16) return false;
  let hasNonAscii = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charCodeAt(i) > 127) { hasNonAscii = true; break; }
  }
  if (!hasNonAscii) return false;
  if (trimmed.includes("://") || trimmed.includes("/") || trimmed.includes(".")) return false;
  return true;
}

function resolveAgentEmoji(
  agent: { identity?: { emoji?: string; avatar?: string } },
  agentIdentity?: AgentIdentityResult | null,
) {
  const identityEmoji = agentIdentity?.emoji?.trim();
  if (identityEmoji && isLikelyEmoji(identityEmoji)) return identityEmoji;
  const agentEmoji = agent.identity?.emoji?.trim();
  if (agentEmoji && isLikelyEmoji(agentEmoji)) return agentEmoji;
  const identityAvatar = agentIdentity?.avatar?.trim();
  if (identityAvatar && isLikelyEmoji(identityAvatar)) return identityAvatar;
  const avatar = agent.identity?.avatar?.trim();
  if (avatar && isLikelyEmoji(avatar)) return avatar;
  return "";
}

function agentBadgeText(agentId: string, defaultId: string | null) {
  return defaultId && agentId === defaultId ? "default" : null;
}

function formatBytes(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex += 1; }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function resolveAgentConfig(config: Record<string, unknown> | null, agentId: string) {
  const cfg = config as ConfigSnapshot | null;
  const list = cfg?.agents?.list ?? [];
  const entry = list.find((agent) => agent?.id === agentId);
  return { entry, defaults: cfg?.agents?.defaults, globalTools: cfg?.tools };
}

type AgentContext = {
  workspace: string;
  model: string;
  identityName: string;
  identityEmoji: string;
  skillsLabel: string;
  isDefault: boolean;
};

function buildAgentContext(
  agent: AgentsListResult["agents"][number],
  configForm: Record<string, unknown> | null,
  agentFilesList: AgentsFilesListResult | null,
  defaultId: string | null,
  agentIdentity?: AgentIdentityResult | null,
): AgentContext {
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles =
    agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace =
    workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const modelLabel = config.entry?.model
    ? resolveModelLabel(config.entry?.model)
    : resolveModelLabel(config.defaults?.model);
  const identityName =
    agentIdentity?.name?.trim() ||
    agent.identity?.name?.trim() ||
    agent.name?.trim() ||
    config.entry?.name ||
    agent.id;
  const identityEmoji = resolveAgentEmoji(agent, agentIdentity) || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  return {
    workspace,
    model: modelLabel,
    identityName,
    identityEmoji,
    skillsLabel: skillFilter ? `${skillCount} selected` : "all skills",
    isDefault: Boolean(defaultId && agent.id === defaultId),
  };
}

function resolveModelLabel(model?: unknown): string {
  if (!model) return "-";
  if (typeof model === "string") return model.trim() || "-";
  if (typeof model === "object" && model) {
    const record = model as { primary?: string; fallbacks?: string[] };
    const primary = record.primary?.trim();
    if (primary) {
      const fallbackCount = Array.isArray(record.fallbacks) ? record.fallbacks.length : 0;
      return fallbackCount > 0 ? `${primary} (+${fallbackCount} fallback)` : primary;
    }
  }
  return "-";
}

function normalizeModelValue(label: string): string {
  const match = label.match(/^(.+) \(\+\d+ fallback\)$/);
  return match ? match[1] : label;
}

function resolveModelPrimary(model?: unknown): string | null {
  if (!model) return null;
  if (typeof model === "string") { const trimmed = model.trim(); return trimmed || null; }
  if (typeof model === "object" && model) {
    const record = model as Record<string, unknown>;
    const candidate =
      typeof record.primary === "string" ? record.primary
        : typeof record.model === "string" ? record.model
          : typeof record.id === "string" ? record.id
            : typeof record.value === "string" ? record.value : null;
    return candidate?.trim() || null;
  }
  return null;
}

function resolveModelFallbacks(model?: unknown): string[] | null {
  if (!model || typeof model === "string") return null;
  if (typeof model === "object" && model) {
    const record = model as Record<string, unknown>;
    const fallbacks = Array.isArray(record.fallbacks)
      ? record.fallbacks : Array.isArray(record.fallback) ? record.fallback : null;
    return fallbacks ? fallbacks.filter((entry): entry is string => typeof entry === "string") : null;
  }
  return null;
}

function parseFallbackList(value: string): string[] {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

type ConfiguredModelOption = { value: string; label: string };

function resolveConfiguredModels(configForm: Record<string, unknown> | null): ConfiguredModelOption[] {
  const cfg = configForm as ConfigSnapshot | null;
  const models = cfg?.agents?.defaults?.models;
  if (!models || typeof models !== "object") return [];
  const options: ConfiguredModelOption[] = [];
  for (const [modelId, modelRaw] of Object.entries(models)) {
    const trimmed = modelId.trim();
    if (!trimmed) continue;
    const alias = modelRaw && typeof modelRaw === "object" && "alias" in modelRaw
      ? typeof (modelRaw as { alias?: unknown }).alias === "string"
        ? (modelRaw as { alias?: string }).alias?.trim() : undefined
      : undefined;
    const label = alias && alias !== trimmed ? `${alias} (${trimmed})` : trimmed;
    options.push({ value: trimmed, label });
  }
  return options;
}

function buildModelOptions(configForm: Record<string, unknown> | null, current?: string | null) {
  const options = resolveConfiguredModels(configForm);
  const hasCurrent = current ? options.some((option) => option.value === current) : false;
  if (current && !hasCurrent) options.unshift({ value: current, label: `Current (${current})` });
  if (options.length === 0) return html`<option value="" disabled>No configured models</option>`;
  return options.map((option) => html`<option value=${option.value}>${option.label}</option>`);
}

// ─── Tool policy resolution ──────────────────────────────

type CompiledPattern =
  | { kind: "all" }
  | { kind: "exact"; value: string }
  | { kind: "regex"; value: RegExp };

function compilePattern(pattern: string): CompiledPattern {
  const normalized = normalizeToolName(pattern);
  if (!normalized) return { kind: "exact", value: "" };
  if (normalized === "*") return { kind: "all" };
  if (!normalized.includes("*")) return { kind: "exact", value: normalized };
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return { kind: "regex", value: new RegExp(`^${escaped.replaceAll("\\*", ".*")}$`) };
}

function compilePatterns(patterns?: string[]): CompiledPattern[] {
  if (!Array.isArray(patterns)) return [];
  return expandToolGroups(patterns).map(compilePattern).filter((p) => p.kind !== "exact" || p.value.length > 0);
}

function matchesAny(name: string, patterns: CompiledPattern[]) {
  for (const pattern of patterns) {
    if (pattern.kind === "all") return true;
    if (pattern.kind === "exact" && name === pattern.value) return true;
    if (pattern.kind === "regex" && pattern.value.test(name)) return true;
  }
  return false;
}

function isAllowedByPolicy(name: string, policy?: ToolPolicy) {
  if (!policy) return true;
  const normalized = normalizeToolName(name);
  const deny = compilePatterns(policy.deny);
  if (matchesAny(normalized, deny)) return false;
  const allow = compilePatterns(policy.allow);
  if (allow.length === 0) return true;
  if (matchesAny(normalized, allow)) return true;
  if (normalized === "apply_patch" && matchesAny("exec", allow)) return true;
  return false;
}

function matchesList(name: string, list?: string[]) {
  if (!Array.isArray(list) || list.length === 0) return false;
  const normalized = normalizeToolName(name);
  const patterns = compilePatterns(list);
  if (matchesAny(normalized, patterns)) return true;
  if (normalized === "apply_patch" && matchesAny("exec", patterns)) return true;
  return false;
}

// ─── Inline CSS ──────────────────────────────────────────

const AGENTS_STYLES = html`<style>
  .agents-layout { display: grid; grid-template-columns: 280px 1fr; gap: 20px; min-height: 500px; }
  @media (max-width: 900px) { .agents-layout { grid-template-columns: 1fr; } }
  .agents-sidebar { display: flex; flex-direction: column; gap: 0; }
  .agents-main { display: flex; flex-direction: column; gap: 16px; }

  /* Sidebar agent list */
  .agent-list { display: flex; flex-direction: column; gap: 8px; }
  .agent-row {
    display: flex; align-items: center; gap: 12px; padding: 12px 14px;
    background: transparent; border: 1px solid transparent;
    border-radius: var(--radius-md); cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
    text-align: left; width: 100%; position: relative;
  }
  .agent-row:hover {
    background: var(--bg-hover);
    border-color: var(--border-strong);
    transform: translateY(-1px);
  }
  .agent-row.active {
    background: linear-gradient(135deg, var(--accent-subtle) 0%, rgba(255,92,92,0.08) 100%);
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-subtle), var(--shadow-sm);
  }
  .agent-row.active::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 60%;
    background: var(--accent);
    border-radius: 0 2px 2px 0;
  }

  /* Avatar styling with gradient ring */
  .agent-avatar {
    width: 40px; height: 40px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--card) 100%);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 600;
    color: var(--text-strong, var(--text));
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    transition: all var(--duration-normal) var(--ease-out);
  }
  .agent-row:hover .agent-avatar {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-md);
  }
  .agent-row.active .agent-avatar {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-subtle), var(--shadow-md);
  }

  .agent-info { flex: 1; min-width: 0; }
  .agent-title { font-size: 14px; font-weight: 500; color: var(--text-strong, var(--text)); }
  .agent-sub { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }

  /* Pills and badges */
  .agent-pill {
    padding: 3px 10px;
    background: var(--accent-subtle);
    border: 1px solid rgba(255,92,92,0.3);
    border-radius: var(--radius-full);
    font-size: 11px;
    color: var(--accent);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .agent-pill.warn {
    background: var(--warn-subtle, rgba(245,158,11,0.15));
    border-color: rgba(245,158,11,0.3);
    color: var(--warn, #f59e0b);
  }

  /* Agent header with larger avatar */
  .agent-header { padding: 20px; }
  .agent-header-main { display: flex; align-items: center; gap: 16px; }
  .agent-header-meta { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  .agent-avatar--lg {
    width: 64px; height: 64px; font-size: 32px;
    background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--card) 100%);
    border: 2px solid var(--border);
    box-shadow: 0 0 0 3px var(--accent-subtle), var(--shadow-lg);
    position: relative;
  }
  .agent-avatar--lg::before {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: var(--radius-md);
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    opacity: 0.15;
    z-index: -1;
  }

  /* Pill-style tabs with smooth transitions */
  .agent-tabs {
    display: flex; gap: 8px; flex-wrap: wrap;
    padding: 6px;
    background: var(--bg-elevated);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border);
  }
  .agent-tab {
    padding: 10px 18px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font-size: 13px; font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
    position: relative;
  }
  .agent-tab:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }
  .agent-tab.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-foreground, #fff);
    box-shadow: 0 0 0 2px rgba(255,92,92,0.2), var(--shadow-md);
  }

  /* Cards with subtle depth */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px;
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--duration-normal) var(--ease-out);
  }
  .card:hover {
    box-shadow: var(--shadow-md);
  }
  .card-title { font-size: 15px; font-weight: 600; color: var(--text-strong, var(--text)); }
  .card-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }

  .row { display: flex; align-items: center; gap: 12px; }
  .muted { color: var(--muted); font-size: 13px; }
  .mono { font-family: var(--mono, monospace); }

  /* Buttons with subtle shadow on hover */
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 8px 16px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 13px; font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
    box-shadow: var(--shadow-sm);
  }
  .btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-strong);
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }
  .btn:active {
    transform: translateY(0);
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
  .btn--sm { padding: 6px 12px; font-size: 12px; }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-foreground, #fff);
    box-shadow: 0 0 0 1px rgba(255,92,92,0.1), var(--shadow-md);
  }
  .btn.primary:hover {
    box-shadow: 0 0 0 2px rgba(255,92,92,0.2), var(--shadow-lg);
  }
  .btn.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-foreground, #fff);
  }

  /* Callouts with left accent border */
  .callout {
    padding: 12px 16px;
    border-radius: var(--radius-md);
    font-size: 13px;
    border-left: 3px solid transparent;
  }
  .callout.danger {
    background: var(--danger-subtle, rgba(239,68,68,0.1));
    color: var(--danger, #ef4444);
    border-left-color: var(--danger);
  }
  .callout.info {
    background: var(--accent-subtle);
    color: var(--accent);
    border-left-color: var(--accent);
  }

  /* Agent context grid with gradient backgrounds */
  .agents-overview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
  .agent-kv {
    padding: 14px 18px;
    background: linear-gradient(135deg, var(--bg-elevated) 0%, var(--card) 100%);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    transition: all var(--duration-normal) var(--ease-out);
  }
  .agent-kv:hover {
    border-color: var(--border-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }
  .agent-kv .label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }
  .agent-kv > div:last-child { font-size: 14px; margin-top: 4px; font-weight: 500; }
  .agent-kv-sub { font-size: 12px; }

  .agent-model-select { display: grid; gap: 12px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field span { font-size: 13px; color: var(--muted); font-weight: 500; }
  .field textarea, .field input, .field select {
    border: 1px solid var(--border);
    background: var(--card);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    font-size: 13px;
    font-family: var(--mono, monospace);
    color: var(--text);
    outline: none;
    transition: all var(--duration-normal) var(--ease-out);
  }
  .field textarea:focus, .field input:focus, .field select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-subtle);
  }
  .field textarea { min-height: 300px; resize: vertical; }

  /* Files */
  .agent-files-grid { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr); gap: 16px; }
  @media (max-width: 700px) { .agent-files-grid { grid-template-columns: 1fr; } }
  .agent-files-list { display: grid; gap: 8px; }
  .agent-file-row {
    display: flex; justify-content: space-between; align-items: center;
    gap: 12px; width: 100%; text-align: left;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
    padding: 12px 14px;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
  }
  .agent-file-row:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }
  .agent-file-row.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    box-shadow: 0 0 0 2px var(--accent-subtle), var(--shadow-md);
  }
  .agent-file-name { font-weight: 600; }
  .agent-file-meta { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .agent-files-editor {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px;
    background: var(--card);
    box-shadow: var(--shadow-sm);
  }
  .agent-file-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .agent-file-title { font-weight: 600; }
  .agent-file-sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
  .agent-file-actions { display: flex; gap: 8px; }

  /* Grid helpers */
  .grid { display: grid; gap: 20px; }
  .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 900px) { .grid-cols-2 { grid-template-columns: 1fr; } }

  /* Stats with large numbers */
  .stat-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
  .stat-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .stat-value {
    font-size: 28px;
    font-weight: 700;
    margin-top: 8px;
    letter-spacing: -0.03em;
    line-height: 1.1;
    background: linear-gradient(135deg, var(--text-strong) 0%, var(--text) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* Lists with hover lift */
  .agents-layout .list { display: grid; gap: 10px; container-type: inline-size; }
  .agents-layout .list-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(200px, 260px);
    gap: 16px; align-items: start;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px;
    background: var(--card);
    transition: all var(--duration-normal) var(--ease-out);
  }
  .agents-layout .list-item:hover {
    border-color: var(--border-strong);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
  }
  .agents-layout .list-main { display: grid; gap: 4px; min-width: 0; }
  .agents-layout .list-title { font-weight: 500; }
  .agents-layout .list-sub { color: var(--muted); font-size: 12px; }
  .agents-layout .list-meta { text-align: right; color: var(--muted); font-size: 12px; display: grid; gap: 4px; min-width: 200px; }
  @container (max-width: 560px) { .agents-layout .list-item { grid-template-columns: 1fr; } .agents-layout .list-meta { min-width: 0; text-align: left; } }

  /* Chips with smooth animations */
  .chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    padding: 5px 12px;
    color: var(--muted);
    background: var(--secondary);
    transition: all var(--duration-fast) var(--ease-out);
  }
  .chip:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }
  .chip-ok {
    color: var(--ok, #22c55e);
    border-color: rgba(34, 197, 94, 0.3);
    background: var(--ok-subtle, rgba(34, 197, 94, 0.1));
  }
  .chip-warn {
    color: var(--warn, #f59e0b);
    border-color: rgba(245, 158, 11, 0.3);
    background: var(--warn-subtle, rgba(245, 158, 11, 0.1));
  }

  /* Toggle switches with smooth animation and glow */
  .cfg-toggle { position: relative; flex-shrink: 0; }
  .cfg-toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
  .cfg-toggle__track {
    display: block;
    width: 50px;
    height: 28px;
    border-radius: 14px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    position: relative;
    cursor: pointer;
    transition: all var(--duration-normal) var(--ease-out);
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.1);
  }
  .cfg-toggle__track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--muted);
    transition: all var(--duration-normal) var(--ease-out);
    box-shadow: var(--shadow-sm);
  }
  .cfg-toggle input:checked + .cfg-toggle__track {
    background: var(--ok-subtle, rgba(34, 197, 94, 0.2));
    border-color: rgba(34, 197, 94, 0.5);
  }
  .cfg-toggle input:checked + .cfg-toggle__track::after {
    transform: translateX(22px);
    background: var(--ok, #22c55e);
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.4), var(--shadow-md);
  }
  .cfg-toggle input:focus + .cfg-toggle__track {
    box-shadow: 0 0 0 3px var(--accent-subtle), inset 0 1px 3px rgba(0,0,0,0.1);
  }
  .cfg-toggle:hover .cfg-toggle__track {
    border-color: var(--border-strong);
  }

  /* Tools section with clean cards */
  .agent-tools-meta { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .agent-tools-buttons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .agent-tools-grid { display: grid; gap: 16px; }
  .agent-tools-section {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 14px;
    background: var(--bg-elevated);
    transition: all var(--duration-normal) var(--ease-out);
  }
  .agent-tools-section:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }
  .agent-tools-header {
    font-weight: 600;
    margin-bottom: 12px;
    font-size: 13px;
    color: var(--text-strong);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .agent-tools-list { display: grid; gap: 10px 12px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .agent-tool-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
    position: relative;
    transition: all var(--duration-normal) var(--ease-out);
  }
  .agent-tool-row::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 0;
    background: var(--accent);
    border-radius: 0 2px 2px 0;
    transition: height var(--duration-normal) var(--ease-out);
  }
  .agent-tool-row:hover {
    border-color: var(--border-strong);
    transform: translateX(2px);
  }
  .agent-tool-row:hover::before {
    height: 60%;
  }
  .agent-tool-title { font-weight: 600; font-size: 13px; }
  .agent-tool-sub { color: var(--muted); font-size: 11px; margin-top: 2px; }

  /* Skills section with accent underlines */
  .agent-skills-groups { display: grid; gap: 16px; }
  .agent-skills-group {
    display: grid;
    gap: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 14px;
    background: var(--bg-elevated);
  }
  .agent-skills-group summary { list-style: none; }
  .agent-skills-header {
    display: flex;
    align-items: center;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-strong);
    cursor: pointer;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 2px solid transparent;
    transition: all var(--duration-normal) var(--ease-out);
  }
  .agent-skills-header:hover {
    color: var(--accent);
    border-bottom-color: var(--accent-subtle);
  }
  .agent-skills-header > span:last-child { margin-left: auto; }
  .agent-skills-group summary::-webkit-details-marker { display: none; }
  .agent-skills-group summary::marker { content: ""; }
  .agent-skills-header::after {
    content: "▸";
    font-size: 12px;
    color: var(--muted);
    transition: transform var(--duration-normal) var(--ease-out);
    margin-left: 8px;
  }
  .agent-skills-group[open] .agent-skills-header::after { transform: rotate(90deg); }
  .agent-skills-group[open] .agent-skills-header {
    border-bottom-color: var(--accent);
  }
  .agent-skill-row { align-items: flex-start; gap: 18px; }
  .agent-skill-row .list-meta { display: flex; align-items: flex-start; justify-content: flex-end; min-width: auto; }
  .skills-grid { grid-template-columns: 1fr; }

  /* Filters */
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
  .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; font-weight: 500; }

  /* Cron job cards */
  .cron-jobs-list { display: grid; gap: 12px; }
  .cron-job-card {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    background: var(--card);
    border-left: 3px solid var(--border-strong);
    transition: all var(--duration-normal) var(--ease-out);
  }
  .cron-job-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }
  .cron-job-card.cron-status--ok { border-left-color: var(--ok); }
  .cron-job-card.cron-status--error { border-left-color: var(--danger); }
  .cron-job-card.cron-status--idle { border-left-color: var(--info, #3b82f6); }
  .cron-job-card.cron-status--disabled { border-left-color: var(--warn); opacity: 0.75; }
  .cron-job-card.cron-status--disabled:hover { opacity: 1; }
  .cron-job-header {
    display: flex; align-items: center; gap: 10px;
  }
  .cron-job-indicator {
    width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    background: var(--border-strong);
    box-shadow: 0 0 0 2px var(--card);
  }
  .cron-status--ok .cron-job-indicator { background: var(--ok); box-shadow: 0 0 6px var(--ok-subtle); }
  .cron-status--error .cron-job-indicator { background: var(--danger); box-shadow: 0 0 6px var(--danger-subtle); }
  .cron-status--idle .cron-job-indicator { background: var(--info, #3b82f6); }
  .cron-status--disabled .cron-job-indicator { background: var(--warn); }
  .cron-job-title {
    font-weight: 600; font-size: 14px;
    color: var(--text-strong);
  }
  .cron-job-desc {
    color: var(--muted); font-size: 12px;
    margin-top: 6px; padding-left: 18px;
    line-height: 1.5;
  }
  .cron-job-tags {
    display: flex; flex-wrap: wrap; gap: 8px;
    margin-top: 10px; padding-left: 18px;
  }
  .cron-tag {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 12px; font-weight: 500;
    color: var(--muted);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius-full);
    padding: 4px 10px;
  }
  .cron-tag svg { opacity: 0.6; }
  .cron-job-footer {
    margin-top: 12px; padding-left: 18px;
    display: grid; gap: 10px;
  }
  .cron-job-state-row {
    display: flex; flex-wrap: wrap; gap: 6px 14px;
    align-items: center;
    font-size: 12px;
    font-family: var(--mono, monospace);
    color: var(--muted);
    padding: 8px 12px;
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
  }
  .cron-state-item { display: inline-flex; align-items: center; gap: 4px; }
  .cron-state-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  .cron-state-val { font-weight: 500; }
  .cron-status--ok .cron-state-val.cron-state--status { color: var(--ok); }
  .cron-status--error .cron-state-val.cron-state--status { color: var(--danger); }
  .cron-state-sep { color: var(--border-strong); }
  .cron-job-payload {
    font-size: 12px; color: var(--muted);
    line-height: 1.6;
    padding: 8px 12px;
    background: var(--bg-elevated);
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    max-height: 72px; overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  }
</style>`;

// ─── Main render ─────────────────────────────────────────

export function renderAgents(props: AgentsProps) {
  const agents = props.agentsList?.agents ?? [];
  const defaultId = props.agentsList?.defaultId ?? null;
  const selectedId = props.selectedAgentId ?? defaultId ?? agents[0]?.id ?? null;
  const selectedAgent = selectedId
    ? (agents.find((agent) => agent.id === selectedId) ?? null)
    : null;

  return html`
    ${AGENTS_STYLES}
    <div class="agents-layout">
      <section class="card agents-sidebar">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Agents</div>
            <div class="card-sub">${agents.length} configured.</div>
          </div>
          <button class="btn btn--sm" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </button>
        </div>
        ${props.error
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
          : nothing}
        <div class="agent-list" style="margin-top: 12px;">
          ${agents.length === 0
            ? html`<div class="muted">No agents found.</div>`
            : agents.map((agent) => {
                const badge = agentBadgeText(agent.id, defaultId);
                const emoji = resolveAgentEmoji(agent, props.agentIdentityById[agent.id] ?? null);
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
                      <div class="agent-title">${normalizeAgentLabel(agent)}</div>
                      <div class="agent-sub mono">${agent.id}</div>
                    </div>
                    ${badge ? html`<span class="agent-pill">${badge}</span>` : nothing}
                  </button>
                `;
              })}
        </div>
      </section>
      <section class="agents-main">
        ${!selectedAgent
          ? html`
              <div class="card">
                <div class="card-title">Select an agent</div>
                <div class="card-sub">Pick an agent to inspect its workspace and tools.</div>
              </div>
            `
          : html`
            ${renderAgentHeader(selectedAgent, defaultId, props.agentIdentityById[selectedAgent.id] ?? null)}
            ${renderAgentTabs(props.activePanel, (panel) => props.onSelectPanel(panel))}
            ${props.activePanel === "overview"
              ? renderAgentOverview({
                  agent: selectedAgent, defaultId, configForm: props.configForm,
                  agentFilesList: props.agentFilesList,
                  agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                  agentIdentityError: props.agentIdentityError,
                  agentIdentityLoading: props.agentIdentityLoading,
                  configLoading: props.configLoading, configSaving: props.configSaving,
                  configDirty: props.configDirty, onConfigReload: props.onConfigReload,
                  onConfigSave: props.onConfigSave, onModelChange: props.onModelChange,
                  onModelFallbacksChange: props.onModelFallbacksChange,
                }) : nothing}
            ${props.activePanel === "files"
              ? renderAgentFiles({
                  agentId: selectedAgent.id, agentFilesList: props.agentFilesList,
                  agentFilesLoading: props.agentFilesLoading, agentFilesError: props.agentFilesError,
                  agentFileActive: props.agentFileActive, agentFileContents: props.agentFileContents,
                  agentFileDrafts: props.agentFileDrafts, agentFileSaving: props.agentFileSaving,
                  onLoadFiles: props.onLoadFiles, onSelectFile: props.onSelectFile,
                  onFileDraftChange: props.onFileDraftChange, onFileReset: props.onFileReset,
                  onFileSave: props.onFileSave,
                }) : nothing}
            ${props.activePanel === "tools"
              ? renderAgentTools({
                  agentId: selectedAgent.id, configForm: props.configForm,
                  configLoading: props.configLoading, configSaving: props.configSaving,
                  configDirty: props.configDirty, onProfileChange: props.onToolsProfileChange,
                  onOverridesChange: props.onToolsOverridesChange,
                  onConfigReload: props.onConfigReload, onConfigSave: props.onConfigSave,
                }) : nothing}
            ${props.activePanel === "skills"
              ? renderAgentSkills({
                  agentId: selectedAgent.id, report: props.agentSkillsReport,
                  loading: props.agentSkillsLoading, error: props.agentSkillsError,
                  activeAgentId: props.agentSkillsAgentId, configForm: props.configForm,
                  configLoading: props.configLoading, configSaving: props.configSaving,
                  configDirty: props.configDirty, filter: props.skillsFilter,
                  onFilterChange: props.onSkillsFilterChange, onRefresh: props.onSkillsRefresh,
                  onToggle: props.onAgentSkillToggle, onClear: props.onAgentSkillsClear,
                  onDisableAll: props.onAgentSkillsDisableAll,
                  onConfigReload: props.onConfigReload, onConfigSave: props.onConfigSave,
                }) : nothing}
            ${props.activePanel === "channels"
              ? renderAgentChannels({
                  agent: selectedAgent, defaultId, configForm: props.configForm,
                  agentFilesList: props.agentFilesList,
                  agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                  snapshot: props.channelsSnapshot, loading: props.channelsLoading,
                  error: props.channelsError, lastSuccess: props.channelsLastSuccess,
                  onRefresh: props.onChannelsRefresh,
                }) : nothing}
            ${props.activePanel === "cron"
              ? renderAgentCron({
                  agent: selectedAgent, defaultId, configForm: props.configForm,
                  agentFilesList: props.agentFilesList,
                  agentIdentity: props.agentIdentityById[selectedAgent.id] ?? null,
                  jobs: props.cronJobs, status: props.cronStatus,
                  loading: props.cronLoading, error: props.cronError,
                  onRefresh: props.onCronRefresh,
                }) : nothing}
          `}
      </section>
    </div>
  `;
}

// ─── Sub-renders ─────────────────────────────────────────

function renderAgentHeader(
  agent: AgentsListResult["agents"][number],
  defaultId: string | null,
  agentIdentity: AgentIdentityResult | null,
) {
  const badge = agentBadgeText(agent.id, defaultId);
  const displayName = normalizeAgentLabel(agent);
  const subtitle = agent.identity?.theme?.trim() || "Agent workspace and routing.";
  const emoji = resolveAgentEmoji(agent, agentIdentity);
  return html`
    <section class="card agent-header">
      <div class="agent-header-main">
        <div class="agent-avatar agent-avatar--lg">${emoji || displayName.slice(0, 1)}</div>
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

function renderAgentTabs(active: AgentsPanel, onSelect: (panel: AgentsPanel) => void) {
  const tabs: Array<{ id: AgentsPanel; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "files", label: "Files" },
    { id: "tools", label: "Tools" },
    { id: "skills", label: "Skills" },
    { id: "channels", label: "Channels" },
    { id: "cron", label: "Workflow" },
  ];
  return html`
    <div class="agent-tabs">
      ${tabs.map((tab) => html`
        <button class="agent-tab ${active === tab.id ? "active" : ""}" type="button"
          @click=${() => onSelect(tab.id)}>${tab.label}</button>
      `)}
    </div>
  `;
}

function renderAgentOverview(params: {
  agent: AgentsListResult["agents"][number]; defaultId: string | null;
  configForm: Record<string, unknown> | null; agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null; agentIdentityLoading: boolean;
  agentIdentityError: string | null; configLoading: boolean; configSaving: boolean;
  configDirty: boolean; onConfigReload: () => void; onConfigSave: () => void;
  onModelChange: (agentId: string, modelId: string | null) => void;
  onModelFallbacksChange: (agentId: string, fallbacks: string[]) => void;
}) {
  const { agent, configForm, agentFilesList, agentIdentity, agentIdentityLoading, agentIdentityError,
    configLoading, configSaving, configDirty, onConfigReload, onConfigSave, onModelChange, onModelFallbacksChange } = params;
  const config = resolveAgentConfig(configForm, agent.id);
  const workspaceFromFiles = agentFilesList && agentFilesList.agentId === agent.id ? agentFilesList.workspace : null;
  const workspace = workspaceFromFiles || config.entry?.workspace || config.defaults?.workspace || "default";
  const model = config.entry?.model ? resolveModelLabel(config.entry?.model) : resolveModelLabel(config.defaults?.model);
  const defaultModel = resolveModelLabel(config.defaults?.model);
  const modelPrimary = resolveModelPrimary(config.entry?.model) || (model !== "-" ? normalizeModelValue(model) : null);
  const defaultPrimary = resolveModelPrimary(config.defaults?.model) || (defaultModel !== "-" ? normalizeModelValue(defaultModel) : null);
  const effectivePrimary = modelPrimary ?? defaultPrimary ?? null;
  const modelFallbacks = resolveModelFallbacks(config.entry?.model);
  const fallbackText = modelFallbacks ? modelFallbacks.join(", ") : "";
  const identityName = agentIdentity?.name?.trim() || agent.identity?.name?.trim() || agent.name?.trim() || config.entry?.name || "-";
  const resolvedEmoji = resolveAgentEmoji(agent, agentIdentity);
  const identityEmoji = resolvedEmoji || "-";
  const skillFilter = Array.isArray(config.entry?.skills) ? config.entry?.skills : null;
  const skillCount = skillFilter?.length ?? null;
  const identityStatus = agentIdentityLoading ? "Loading…" : agentIdentityError ? "Unavailable" : "";
  const isDefault = Boolean(params.defaultId && agent.id === params.defaultId);

  return html`
    <section class="card">
      <div class="card-title">Overview</div>
      <div class="card-sub">Workspace paths and identity metadata.</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv"><div class="label">Workspace</div><div class="mono">${workspace}</div></div>
        <div class="agent-kv"><div class="label">Primary Model</div><div class="mono">${model}</div></div>
        <div class="agent-kv"><div class="label">Identity Name</div><div>${identityName}</div>
          ${identityStatus ? html`<div class="agent-kv-sub muted">${identityStatus}</div>` : nothing}</div>
        <div class="agent-kv"><div class="label">Default</div><div>${isDefault ? "yes" : "no"}</div></div>
        <div class="agent-kv"><div class="label">Identity Emoji</div><div>${identityEmoji}</div></div>
        <div class="agent-kv"><div class="label">Skills Filter</div><div>${skillFilter ? `${skillCount} selected` : "all skills"}</div></div>
      </div>
      <div class="agent-model-select" style="margin-top: 20px;">
        <div class="label">Model Selection</div>
        <div class="row" style="gap: 12px; flex-wrap: wrap;">
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>Primary model${isDefault ? " (default)" : ""}</span>
            <select .value=${effectivePrimary ?? ""} ?disabled=${!configForm || configLoading || configSaving}
              @change=${(e: Event) => onModelChange(agent.id, (e.target as HTMLSelectElement).value || null)}>
              ${isDefault ? nothing : html`<option value="">${defaultPrimary ? `Inherit default (${defaultPrimary})` : "Inherit default"}</option>`}
              ${buildModelOptions(configForm, effectivePrimary ?? undefined)}
            </select>
          </label>
          <label class="field" style="min-width: 260px; flex: 1;">
            <span>Fallbacks (comma-separated)</span>
            <input .value=${fallbackText} ?disabled=${!configForm || configLoading || configSaving}
              placeholder="provider/model, provider/model"
              @input=${(e: Event) => onModelFallbacksChange(agent.id, parseFallbackList((e.target as HTMLInputElement).value))} />
          </label>
        </div>
        <div class="row" style="justify-content: flex-end; gap: 8px;">
          <button class="btn btn--sm" ?disabled=${configLoading} @click=${onConfigReload}>Reload Config</button>
          <button class="btn btn--sm primary" ?disabled=${configSaving || !configDirty} @click=${onConfigSave}>
            ${configSaving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </section>
  `;
}

function renderAgentContextCard(context: AgentContext, subtitle: string) {
  return html`
    <section class="card">
      <div class="card-title">Agent Context</div>
      <div class="card-sub">${subtitle}</div>
      <div class="agents-overview-grid" style="margin-top: 16px;">
        <div class="agent-kv"><div class="label">Workspace</div><div class="mono">${context.workspace}</div></div>
        <div class="agent-kv"><div class="label">Primary Model</div><div class="mono">${context.model}</div></div>
        <div class="agent-kv"><div class="label">Identity Name</div><div>${context.identityName}</div></div>
        <div class="agent-kv"><div class="label">Identity Emoji</div><div>${context.identityEmoji}</div></div>
        <div class="agent-kv"><div class="label">Skills Filter</div><div>${context.skillsLabel}</div></div>
        <div class="agent-kv"><div class="label">Default</div><div>${context.isDefault ? "yes" : "no"}</div></div>
      </div>
    </section>
  `;
}

// ─── Channels ────────────────────────────────────────────

type ChannelSummaryEntry = { id: string; label: string; accounts: ChannelAccountSnapshot[] };

function resolveChannelLabel(snapshot: ChannelsStatusSnapshot, id: string) {
  const meta = snapshot.channelMeta?.find((entry) => entry.id === id);
  if (meta?.label) return meta.label;
  return snapshot.channelLabels?.[id] ?? id;
}

function resolveChannelEntries(snapshot: ChannelsStatusSnapshot | null): ChannelSummaryEntry[] {
  if (!snapshot) return [];
  const ids = new Set<string>();
  for (const id of snapshot.channelOrder ?? []) ids.add(id);
  for (const entry of snapshot.channelMeta ?? []) ids.add(entry.id);
  for (const id of Object.keys(snapshot.channelAccounts ?? {})) ids.add(id);
  const ordered: string[] = [];
  const seed = snapshot.channelOrder?.length ? snapshot.channelOrder : Array.from(ids);
  for (const id of seed) { if (!ids.has(id)) continue; ordered.push(id); ids.delete(id); }
  for (const id of ids) ordered.push(id);
  return ordered.map((id) => ({ id, label: resolveChannelLabel(snapshot, id), accounts: snapshot.channelAccounts?.[id] ?? [] }));
}

function summarizeChannelAccounts(accounts: ChannelAccountSnapshot[]) {
  let connected = 0, configured = 0, enabled = 0;
  for (const account of accounts) {
    const probeOk = account.probe && typeof account.probe === "object" && "ok" in account.probe
      ? Boolean((account.probe as { ok?: unknown }).ok) : false;
    if (account.connected === true || account.running === true || probeOk) connected += 1;
    if (account.configured) configured += 1;
    if (account.enabled) enabled += 1;
  }
  return { total: accounts.length, connected, configured, enabled };
}

function renderAgentChannels(params: {
  agent: AgentsListResult["agents"][number]; defaultId: string | null;
  configForm: Record<string, unknown> | null; agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null; snapshot: ChannelsStatusSnapshot | null;
  loading: boolean; error: string | null; lastSuccess: number | null; onRefresh: () => void;
}) {
  const context = buildAgentContext(params.agent, params.configForm, params.agentFilesList, params.defaultId, params.agentIdentity);
  const entries = resolveChannelEntries(params.snapshot);
  const lastSuccessLabel = params.lastSuccess ? formatAgo(params.lastSuccess) : "never";
  return html`
    <section class="grid grid-cols-2">
      ${renderAgentContextCard(context, "Workspace, identity, and model configuration.")}
      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Channels</div>
            <div class="card-sub">Gateway-wide channel status snapshot.</div>
          </div>
          <button class="btn btn--sm" ?disabled=${params.loading} @click=${params.onRefresh}>
            ${params.loading ? "Refreshing…" : "Refresh"}</button>
        </div>
        <div class="muted" style="margin-top: 8px;">Last refresh: ${lastSuccessLabel}</div>
        ${params.error ? html`<div class="callout danger" style="margin-top: 12px;">${params.error}</div>` : nothing}
        ${!params.snapshot ? html`<div class="callout info" style="margin-top: 12px">Load channels to see live status.</div>` : nothing}
        ${entries.length === 0
          ? html`<div class="muted" style="margin-top: 16px">No channels found.</div>`
          : html`
            <div class="list" style="margin-top: 16px;">
              ${entries.map((entry) => {
                const summary = summarizeChannelAccounts(entry.accounts);
                const status = summary.total ? `${summary.connected}/${summary.total} connected` : "no accounts";
                const config = summary.configured ? `${summary.configured} configured` : "not configured";
                const enabled = summary.total ? `${summary.enabled} enabled` : "disabled";
                return html`
                  <div class="list-item">
                    <div class="list-main">
                      <div class="list-title">${entry.label}</div>
                      <div class="list-sub mono">${entry.id}</div>
                    </div>
                    <div class="list-meta">
                      <div>${status}</div><div>${config}</div><div>${enabled}</div>
                    </div>
                  </div>
                `;
              })}
            </div>
          `}
      </section>
    </section>
  `;
}

// ─── Cron ────────────────────────────────────────────────

function renderAgentCron(params: {
  agent: AgentsListResult["agents"][number]; defaultId: string | null;
  configForm: Record<string, unknown> | null; agentFilesList: AgentsFilesListResult | null;
  agentIdentity: AgentIdentityResult | null; jobs: CronJob[]; status: CronStatus | null;
  loading: boolean; error: string | null; onRefresh: () => void;
}) {
  const context = buildAgentContext(params.agent, params.configForm, params.agentFilesList, params.defaultId, params.agentIdentity);
  const jobs = params.jobs.filter((job) => job.agentId === params.agent.id);
  return html`
    <section class="grid grid-cols-2">
      ${renderAgentContextCard(context, "Workspace and scheduling targets.")}
      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Scheduler</div>
            <div class="card-sub">Gateway cron status.</div>
          </div>
          <button class="btn btn--sm" ?disabled=${params.loading} @click=${params.onRefresh}>
            ${params.loading ? "Refreshing…" : "Refresh"}</button>
        </div>
        <div class="stat-grid" style="margin-top: 16px;">
          <div class="stat"><div class="stat-label">Enabled</div>
            <div class="stat-value">${params.status ? (params.status.enabled ? "Yes" : "No") : "n/a"}</div></div>
          <div class="stat"><div class="stat-label">Jobs</div>
            <div class="stat-value">${params.status?.jobs ?? "n/a"}</div></div>
          <div class="stat"><div class="stat-label">Next wake</div>
            <div class="stat-value">${formatNextRun(params.status?.nextWakeAtMs ?? null)}</div></div>
        </div>
        ${params.error ? html`<div class="callout danger" style="margin-top: 12px;">${params.error}</div>` : nothing}
      </section>
    </section>
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Workflows</div>
          <div class="card-sub">Automated workflows targeting this agent.</div>
        </div>
        <span class="chip" style="font-size: 13px; font-weight: 600;">${jobs.length} workflow${jobs.length !== 1 ? "s" : ""}</span>
      </div>
      ${jobs.length === 0
        ? html`<div class="muted" style="margin-top: 16px">No workflows assigned.</div>`
        : html`
          <div class="cron-jobs-list" style="margin-top: 16px;">
            ${jobs.map((job) => {
              const state = job.state ?? {};
              const lastStatus = state.lastStatus ?? "n/a";
              const nextRun = state.nextRunAtMs ? formatMs(state.nextRunAtMs) : "n/a";
              const lastRun = state.lastRunAtMs ? formatMs(state.lastRunAtMs) : "n/a";
              const isOk = lastStatus === "ok";
              const isError = lastStatus === "error";
              const statusClass = job.enabled ? (isOk ? "cron-status--ok" : isError ? "cron-status--error" : "cron-status--idle") : "cron-status--disabled";
              return html`
              <div class="cron-job-card ${statusClass}">
                <div class="cron-job-header">
                  <div class="cron-job-indicator"></div>
                  <div class="cron-job-title">${job.name}</div>
                  <span class="chip ${job.enabled ? "chip-ok" : "chip-warn"}" style="margin-left: auto; font-size: 11px;">
                    ${job.enabled ? "enabled" : "disabled"}</span>
                </div>
                <div class="cron-job-tags">
                  <span class="cron-tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    ${formatCronSchedule(job)}
                  </span>
                  <span class="cron-tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 3v4M8 3v4"/></svg>
                    ${job.sessionTarget ?? "default"}
                  </span>
                </div>
                <div class="cron-job-footer">
                  <div class="cron-job-state-row">
                    <span class="cron-state-item"><span class="cron-state-label">status</span> <span class="cron-state-val cron-state--status">${lastStatus}</span></span>
                    <span class="cron-state-sep">·</span>
                    <span class="cron-state-item"><span class="cron-state-label">next</span> <span class="cron-state-val">${nextRun}</span></span>
                    <span class="cron-state-sep">·</span>
                    <span class="cron-state-item"><span class="cron-state-label">last</span> <span class="cron-state-val">${lastRun}</span></span>
                  </div>
                  <div class="cron-job-payload">${formatCronPayload(job)}</div>
                </div>
              </div>
            `;})}
          </div>
        `}
    </section>
  `;
}

// ─── Files ───────────────────────────────────────────────

function renderAgentFiles(params: {
  agentId: string; agentFilesList: AgentsFilesListResult | null;
  agentFilesLoading: boolean; agentFilesError: string | null;
  agentFileActive: string | null; agentFileContents: Record<string, string>;
  agentFileDrafts: Record<string, string>; agentFileSaving: boolean;
  onLoadFiles: (agentId: string) => void; onSelectFile: (name: string) => void;
  onFileDraftChange: (name: string, content: string) => void;
  onFileReset: (name: string) => void; onFileSave: (name: string) => void;
}) {
  const list = params.agentFilesList?.agentId === params.agentId ? params.agentFilesList : null;
  const files = list?.files ?? [];
  const active = params.agentFileActive ?? null;
  const activeEntry = active ? (files.find((file) => file.name === active) ?? null) : null;
  const baseContent = active ? (params.agentFileContents[active] ?? "") : "";
  const draft = active ? (params.agentFileDrafts[active] ?? baseContent) : "";
  const isDirty = active ? draft !== baseContent : false;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Core Files</div>
          <div class="card-sub">Bootstrap persona, identity, and tool guidance.</div>
        </div>
        <button class="btn btn--sm" ?disabled=${params.agentFilesLoading}
          @click=${() => params.onLoadFiles(params.agentId)}>
          ${params.agentFilesLoading ? "Loading…" : "Refresh"}</button>
      </div>
      ${list ? html`<div class="muted mono" style="margin-top: 8px;">Workspace: ${list.workspace}</div>` : nothing}
      ${params.agentFilesError ? html`<div class="callout danger" style="margin-top: 12px;">${params.agentFilesError}</div>` : nothing}
      ${!list
        ? html`<div class="callout info" style="margin-top: 12px">Load the agent workspace files to edit core instructions.</div>`
        : html`
          <div class="agent-files-grid" style="margin-top: 16px;">
            <div class="agent-files-list">
              ${files.length === 0
                ? html`<div class="muted">No files found.</div>`
                : files.map((file) => renderAgentFileRow(file, active, () => params.onSelectFile(file.name)))}
            </div>
            <div class="agent-files-editor">
              ${!activeEntry
                ? html`<div class="muted">Select a file to edit.</div>`
                : html`
                  <div class="agent-file-header">
                    <div>
                      <div class="agent-file-title mono">${activeEntry.name}</div>
                      <div class="agent-file-sub mono">${activeEntry.path}</div>
                    </div>
                    <div class="agent-file-actions">
                      <button class="btn btn--sm" ?disabled=${!isDirty}
                        @click=${() => params.onFileReset(activeEntry.name)}>Reset</button>
                      <button class="btn btn--sm primary" ?disabled=${params.agentFileSaving || !isDirty}
                        @click=${() => params.onFileSave(activeEntry.name)}>
                        ${params.agentFileSaving ? "Saving…" : "Save"}</button>
                    </div>
                  </div>
                  ${activeEntry.missing ? html`<div class="callout info" style="margin-top: 10px">This file is missing. Saving will create it in the agent workspace.</div>` : nothing}
                  <label class="field" style="margin-top: 12px;">
                    <span>Content</span>
                    <textarea .value=${draft}
                      @input=${(e: Event) => params.onFileDraftChange(activeEntry.name, (e.target as HTMLTextAreaElement).value)}></textarea>
                  </label>
                `}
            </div>
          </div>
        `}
    </section>
  `;
}

function renderAgentFileRow(file: AgentFileEntry, active: string | null, onSelect: () => void) {
  const status = file.missing ? "Missing" : `${formatBytes(file.size)} · ${formatAgo(file.updatedAtMs ?? null)}`;
  return html`
    <button type="button" class="agent-file-row ${active === file.name ? "active" : ""}" @click=${onSelect}>
      <div>
        <div class="agent-file-name mono">${file.name}</div>
        <div class="agent-file-meta">${status}</div>
      </div>
      ${file.missing ? html`<span class="agent-pill warn">missing</span>` : nothing}
    </button>
  `;
}

// ─── Tools ───────────────────────────────────────────────

function renderAgentTools(params: {
  agentId: string; configForm: Record<string, unknown> | null;
  configLoading: boolean; configSaving: boolean; configDirty: boolean;
  onProfileChange: (agentId: string, profile: string | null, clearAllow: boolean) => void;
  onOverridesChange: (agentId: string, alsoAllow: string[], deny: string[]) => void;
  onConfigReload: () => void; onConfigSave: () => void;
}) {
  const config = resolveAgentConfig(params.configForm, params.agentId);
  const agentTools = config.entry?.tools ?? {};
  const globalTools = config.globalTools ?? {};
  const profile = agentTools.profile ?? globalTools.profile ?? "full";
  const profileSource = agentTools.profile ? "agent override" : globalTools.profile ? "global default" : "default";
  const hasAgentAllow = Array.isArray(agentTools.allow) && agentTools.allow.length > 0;
  const hasGlobalAllow = Array.isArray(globalTools.allow) && globalTools.allow.length > 0;
  const editable = Boolean(params.configForm) && !params.configLoading && !params.configSaving && !hasAgentAllow;
  const alsoAllow = hasAgentAllow ? [] : Array.isArray(agentTools.alsoAllow) ? agentTools.alsoAllow : [];
  const deny = hasAgentAllow ? [] : Array.isArray(agentTools.deny) ? agentTools.deny : [];
  const basePolicy = hasAgentAllow
    ? { allow: agentTools.allow ?? [], deny: agentTools.deny ?? [] }
    : (resolveToolProfilePolicy(profile) ?? undefined);
  const toolIds = TOOL_SECTIONS.flatMap((section) => section.tools.map((tool) => tool.id));

  const resolveAllowed = (toolId: string) => {
    const baseAllowed = isAllowedByPolicy(toolId, basePolicy);
    const extraAllowed = matchesList(toolId, alsoAllow);
    const denied = matchesList(toolId, deny);
    return { allowed: (baseAllowed || extraAllowed) && !denied, baseAllowed, denied };
  };
  const enabledCount = toolIds.filter((toolId) => resolveAllowed(toolId).allowed).length;

  const updateTool = (toolId: string, nextEnabled: boolean) => {
    const nextAllow = new Set(alsoAllow.map((e) => normalizeToolName(e)).filter((e) => e.length > 0));
    const nextDeny = new Set(deny.map((e) => normalizeToolName(e)).filter((e) => e.length > 0));
    const baseAllowed = resolveAllowed(toolId).baseAllowed;
    const normalized = normalizeToolName(toolId);
    if (nextEnabled) { nextDeny.delete(normalized); if (!baseAllowed) nextAllow.add(normalized); }
    else { nextAllow.delete(normalized); nextDeny.add(normalized); }
    params.onOverridesChange(params.agentId, [...nextAllow], [...nextDeny]);
  };

  const updateAll = (nextEnabled: boolean) => {
    const nextAllow = new Set(alsoAllow.map((e) => normalizeToolName(e)).filter((e) => e.length > 0));
    const nextDeny = new Set(deny.map((e) => normalizeToolName(e)).filter((e) => e.length > 0));
    for (const toolId of toolIds) {
      const baseAllowed = resolveAllowed(toolId).baseAllowed;
      const normalized = normalizeToolName(toolId);
      if (nextEnabled) { nextDeny.delete(normalized); if (!baseAllowed) nextAllow.add(normalized); }
      else { nextAllow.delete(normalized); nextDeny.add(normalized); }
    }
    params.onOverridesChange(params.agentId, [...nextAllow], [...nextDeny]);
  };

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Tool Access</div>
          <div class="card-sub">Profile + per-tool overrides for this agent. <span class="mono">${enabledCount}/${toolIds.length}</span> enabled.</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm" ?disabled=${!editable} @click=${() => updateAll(true)}>Enable All</button>
          <button class="btn btn--sm" ?disabled=${!editable} @click=${() => updateAll(false)}>Disable All</button>
          <button class="btn btn--sm" ?disabled=${params.configLoading} @click=${params.onConfigReload}>Reload Config</button>
          <button class="btn btn--sm primary" ?disabled=${params.configSaving || !params.configDirty} @click=${params.onConfigSave}>
            ${params.configSaving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      ${!params.configForm ? html`<div class="callout info" style="margin-top: 12px">Load the gateway config to adjust tool profiles.</div>` : nothing}
      ${hasAgentAllow ? html`<div class="callout info" style="margin-top: 12px">This agent is using an explicit allowlist in config. Tool overrides are managed in the Config tab.</div>` : nothing}
      ${hasGlobalAllow ? html`<div class="callout info" style="margin-top: 12px">Global tools.allow is set. Agent overrides cannot enable tools that are globally blocked.</div>` : nothing}
      <div class="agent-tools-meta" style="margin-top: 16px;">
        <div class="agent-kv"><div class="label">Profile</div><div class="mono">${profile}</div></div>
        <div class="agent-kv"><div class="label">Source</div><div>${profileSource}</div></div>
        ${params.configDirty ? html`<div class="agent-kv"><div class="label">Status</div><div class="mono">unsaved</div></div>` : nothing}
      </div>
      <div class="agent-tools-presets" style="margin-top: 16px;">
        <div class="label">Quick Presets</div>
        <div class="agent-tools-buttons">
          ${PROFILE_OPTIONS.map((option) => html`
            <button class="btn btn--sm ${profile === option.id ? "active" : ""}" ?disabled=${!editable}
              @click=${() => params.onProfileChange(params.agentId, option.id, true)}>${option.label}</button>
          `)}
          <button class="btn btn--sm" ?disabled=${!editable}
            @click=${() => params.onProfileChange(params.agentId, null, false)}>Inherit</button>
        </div>
      </div>
      <div class="agent-tools-grid" style="margin-top: 20px;">
        ${TOOL_SECTIONS.map((section) => html`
          <div class="agent-tools-section">
            <div class="agent-tools-header">${section.label}</div>
            <div class="agent-tools-list">
              ${section.tools.map((tool) => {
                const { allowed } = resolveAllowed(tool.id);
                return html`
                  <div class="agent-tool-row">
                    <div>
                      <div class="agent-tool-title mono">${tool.label}</div>
                      <div class="agent-tool-sub">${tool.description}</div>
                    </div>
                    <label class="cfg-toggle">
                      <input type="checkbox" .checked=${allowed} ?disabled=${!editable}
                        @change=${(e: Event) => updateTool(tool.id, (e.target as HTMLInputElement).checked)} />
                      <span class="cfg-toggle__track"></span>
                    </label>
                  </div>
                `;
              })}
            </div>
          </div>
        `)}
      </div>
    </section>
  `;
}

// ─── Skills ──────────────────────────────────────────────

type SkillGroup = { id: string; label: string; skills: SkillStatusEntry[] };

const SKILL_SOURCE_GROUPS: Array<{ id: string; label: string; sources: string[] }> = [
  { id: "workspace", label: "Workspace Skills", sources: ["openclaw-workspace"] },
  { id: "built-in", label: "Built-in Skills", sources: ["openclaw-bundled"] },
  { id: "installed", label: "Installed Skills", sources: ["openclaw-managed"] },
  { id: "extra", label: "Extra Skills", sources: ["openclaw-extra"] },
];

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  const builtInGroup = SKILL_SOURCE_GROUPS.find((group) => group.id === "built-in");
  const other: SkillGroup = { id: "other", label: "Other Skills", skills: [] };
  for (const skill of skills) {
    const match = skill.bundled ? builtInGroup : SKILL_SOURCE_GROUPS.find((group) => group.sources.includes(skill.source));
    if (match) groups.get(match.id)?.skills.push(skill);
    else other.skills.push(skill);
  }
  const ordered = SKILL_SOURCE_GROUPS.map((group) => groups.get(group.id)).filter(
    (group): group is SkillGroup => Boolean(group && group.skills.length > 0),
  );
  if (other.skills.length > 0) ordered.push(other);
  return ordered;
}

function renderAgentSkills(params: {
  agentId: string; report: SkillStatusReport | null; loading: boolean;
  error: string | null; activeAgentId: string | null;
  configForm: Record<string, unknown> | null; configLoading: boolean;
  configSaving: boolean; configDirty: boolean; filter: string;
  onFilterChange: (next: string) => void; onRefresh: () => void;
  onToggle: (agentId: string, skillName: string, enabled: boolean) => void;
  onClear: (agentId: string) => void; onDisableAll: (agentId: string) => void;
  onConfigReload: () => void; onConfigSave: () => void;
}) {
  const editable = Boolean(params.configForm) && !params.configLoading && !params.configSaving;
  const config = resolveAgentConfig(params.configForm, params.agentId);
  const allowlist = Array.isArray(config.entry?.skills) ? config.entry?.skills : undefined;
  const allowSet = new Set((allowlist ?? []).map((name) => name.trim()).filter(Boolean));
  const usingAllowlist = allowlist !== undefined;
  const reportReady = Boolean(params.report && params.activeAgentId === params.agentId);
  const rawSkills = reportReady ? (params.report?.skills ?? []) : [];
  const filter = params.filter.trim().toLowerCase();
  const filtered = filter
    ? rawSkills.filter((skill) => [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter))
    : rawSkills;
  const groups = groupSkills(filtered);
  const enabledCount = usingAllowlist ? rawSkills.filter((skill) => allowSet.has(skill.name)).length : rawSkills.length;
  const totalCount = rawSkills.length;

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Skills</div>
          <div class="card-sub">Per-agent skill allowlist and workspace skills.
            ${totalCount > 0 ? html` <span class="mono">${enabledCount}/${totalCount}</span>` : nothing}</div>
        </div>
        <div class="row" style="gap: 8px;">
          <button class="btn btn--sm" ?disabled=${!editable} @click=${() => params.onClear(params.agentId)}>Use All</button>
          <button class="btn btn--sm" ?disabled=${!editable} @click=${() => params.onDisableAll(params.agentId)}>Disable All</button>
          <button class="btn btn--sm" ?disabled=${params.configLoading} @click=${params.onConfigReload}>Reload Config</button>
          <button class="btn btn--sm" ?disabled=${params.loading} @click=${params.onRefresh}>${params.loading ? "Loading…" : "Refresh"}</button>
          <button class="btn btn--sm primary" ?disabled=${params.configSaving || !params.configDirty} @click=${params.onConfigSave}>
            ${params.configSaving ? "Saving…" : "Save"}</button>
        </div>
      </div>
      ${!params.configForm ? html`<div class="callout info" style="margin-top: 12px">Load the gateway config to set per-agent skills.</div>` : nothing}
      ${usingAllowlist
        ? html`<div class="callout info" style="margin-top: 12px">This agent uses a custom skill allowlist.</div>`
        : html`<div class="callout info" style="margin-top: 12px">All skills are enabled. Disabling any skill will create a per-agent allowlist.</div>`}
      ${!reportReady && !params.loading ? html`<div class="callout info" style="margin-top: 12px">Load skills for this agent to view workspace-specific entries.</div>` : nothing}
      ${params.error ? html`<div class="callout danger" style="margin-top: 12px;">${params.error}</div>` : nothing}
      <div class="filters" style="margin-top: 14px;">
        <label class="field" style="flex: 1;">
          <span>Filter</span>
          <input .value=${params.filter} @input=${(e: Event) => params.onFilterChange((e.target as HTMLInputElement).value)} placeholder="Search skills" />
        </label>
        <div class="muted">${filtered.length} shown</div>
      </div>
      ${filtered.length === 0
        ? html`<div class="muted" style="margin-top: 16px">No skills found.</div>`
        : html`
          <div class="agent-skills-groups" style="margin-top: 16px;">
            ${groups.map((group) => renderAgentSkillGroup(group, {
              agentId: params.agentId, allowSet, usingAllowlist, editable, onToggle: params.onToggle,
            }))}
          </div>
        `}
    </section>
  `;
}

function renderAgentSkillGroup(group: SkillGroup, params: {
  agentId: string; allowSet: Set<string>; usingAllowlist: boolean;
  editable: boolean; onToggle: (agentId: string, skillName: string, enabled: boolean) => void;
}) {
  const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
  return html`
    <details class="agent-skills-group" ?open=${!collapsedByDefault}>
      <summary class="agent-skills-header">
        <span>${group.label}</span>
        <span class="muted">${group.skills.length}</span>
      </summary>
      <div class="list skills-grid">
        ${group.skills.map((skill) => renderAgentSkillRow(skill, params))}
      </div>
    </details>
  `;
}

function renderAgentSkillRow(skill: SkillStatusEntry, params: {
  agentId: string; allowSet: Set<string>; usingAllowlist: boolean;
  editable: boolean; onToggle: (agentId: string, skillName: string, enabled: boolean) => void;
}) {
  const enabled = params.usingAllowlist ? params.allowSet.has(skill.name) : true;
  const missing = [
    ...skill.missing.bins.map((b) => `bin:${b}`),
    ...skill.missing.env.map((e) => `env:${e}`),
    ...skill.missing.config.map((c) => `config:${c}`),
    ...skill.missing.os.map((o) => `os:${o}`),
  ];
  const reasons: string[] = [];
  if (skill.disabled) reasons.push("disabled");
  if (skill.blockedByAllowlist) reasons.push("blocked by allowlist");
  return html`
    <div class="list-item agent-skill-row">
      <div class="list-main">
        <div class="list-title">${skill.emoji ? `${skill.emoji} ` : ""}${skill.name}</div>
        <div class="list-sub">${skill.description}</div>
        <div class="chip-row" style="margin-top: 6px;">
          <span class="chip">${skill.source}</span>
          <span class="chip ${skill.eligible ? "chip-ok" : "chip-warn"}">${skill.eligible ? "eligible" : "blocked"}</span>
          ${skill.disabled ? html`<span class="chip chip-warn">disabled</span>` : nothing}
        </div>
        ${missing.length > 0 ? html`<div class="muted" style="margin-top: 6px;">Missing: ${missing.join(", ")}</div>` : nothing}
        ${reasons.length > 0 ? html`<div class="muted" style="margin-top: 6px;">Reason: ${reasons.join(", ")}</div>` : nothing}
      </div>
      <div class="list-meta">
        <label class="cfg-toggle">
          <input type="checkbox" .checked=${enabled} ?disabled=${!params.editable}
            @change=${(e: Event) => params.onToggle(params.agentId, skill.name, (e.target as HTMLInputElement).checked)} />
          <span class="cfg-toggle__track"></span>
        </label>
      </div>
    </div>
  `;
}
