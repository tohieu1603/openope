import { html, nothing } from "lit";
import { pathForTab } from "../navigation";
import { resolveSessionFallbackName } from "./chat/chat-session-display";

// Inline types (mirrored from original UI types)
type GatewaySessionRow = {
  key: string;
  kind: "direct" | "group" | "global" | "unknown";
  label?: string;
  displayName?: string;
  surface?: string;
  subject?: string;
  room?: string;
  space?: string;
  updatedAt: number | null;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  elevatedLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
};

type SessionsListResult = {
  ts: number;
  path: string;
  count: number;
  defaults: { model: string | null; contextTokens: number | null };
  sessions: GatewaySessionRow[];
};

function formatAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTokens(row: GatewaySessionRow): string {
  if (row.totalTokens == null) return "—";
  const total = row.totalTokens ?? 0;
  const ctx = row.contextTokens ?? 0;
  if (ctx) {
    const pct = Math.round((total / ctx) * 100);
    return `${(total / 1000).toFixed(1)}k / ${(ctx / 1000).toFixed(0)}k (${pct}%)`;
  }
  return `${(total / 1000).toFixed(1)}k`;
}

function tokenPercent(row: GatewaySessionRow): number {
  if (!row.totalTokens || !row.contextTokens) return 0;
  return Math.min(100, Math.round((row.totalTokens / row.contextTokens) * 100));
}

/** Strip UUID suffixes from session keys for display */
function shortName(key: string): string {
  // Remove UUID patterns (8-4-4-4-12 hex) from the key
  return key.replace(/:?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "");
}

// Determine if session is "alive" (updated within last 5 min)
function isAlive(row: GatewaySessionRow): boolean {
  if (!row.updatedAt) return false;
  return Date.now() - row.updatedAt < 5 * 60 * 1000;
}

const THINK_LEVELS = ["", "off", "minimal", "low", "medium", "high"] as const;
const BINARY_THINK_LEVELS = ["", "off", "on"] as const;
const VERBOSE_LEVELS = [
  { value: "", label: "kế thừa" },
  { value: "off", label: "tắt" },
  { value: "on", label: "bật" },
] as const;
const REASONING_LEVELS = ["", "off", "on", "stream"] as const;

function normalizeProviderId(provider?: string | null): string {
  if (!provider) return "";
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") return "zai";
  return normalized;
}

function isBinaryThinkingProvider(provider?: string | null): boolean {
  return normalizeProviderId(provider) === "zai";
}

function resolveThinkLevelOptions(provider?: string | null): readonly string[] {
  return isBinaryThinkingProvider(provider) ? BINARY_THINK_LEVELS : THINK_LEVELS;
}

function resolveThinkLevelDisplay(value: string, isBinary: boolean): string {
  if (!isBinary) return value;
  if (!value || value === "off") return value;
  return "on";
}

function resolveThinkLevelPatchValue(value: string, isBinary: boolean): string | null {
  if (!value) return null;
  if (!isBinary) return value;
  if (value === "on") return "low";
  return value;
}

export type SessionsProps = {
  loading: boolean;
  result: SessionsListResult | null;
  error: string | null;
  activeMinutes: string;
  limit: string;
  includeGlobal: boolean;
  includeUnknown: boolean;
  basePath: string;
  /** Available agents for session creation */
  agents?: { id: string; name?: string }[];
  onFiltersChange: (next: {
    activeMinutes: string;
    limit: string;
    includeGlobal: boolean;
    includeUnknown: boolean;
  }) => void;
  onRefresh: () => void;
  onPatch: (
    key: string,
    patch: {
      label?: string | null;
      thinkingLevel?: string | null;
      verboseLevel?: string | null;
      reasoningLevel?: string | null;
    },
  ) => void;
  onDelete: (key: string) => void;
  onOpenSession: (key: string) => void;
  onCreateSession?: (key: string) => void;
};

export function renderSessions(props: SessionsProps) {
  const rows = props.result?.sessions ?? [];
  const count = rows.length;

  return html`
    <style>
      /* ── Animations ── */
      @keyframes ses-fade-up {
        from { opacity: 0; transform: translateY(16px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes ses-slide-in {
        from { opacity: 0; transform: translateX(-12px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes ses-pulse-dot {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.7); }
      }
      @keyframes ses-shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      @keyframes ses-bar-fill {
        from { width: 0; }
      }
      @keyframes ses-count-pop {
        0% { transform: scale(1); }
        50% { transform: scale(1.15); }
        100% { transform: scale(1); }
      }
      @keyframes ses-spin {
        to { transform: rotate(360deg); }
      }

      /* ── Layout ── */
      .ses-wrap { display: flex; flex-direction: column; gap: 20px; }

      .ses-toolbar {
        display: flex; align-items: center; justify-content: space-between;
        flex-wrap: wrap; gap: 12px;
        animation: ses-slide-in 0.4s ease-out;
      }
      .ses-toolbar-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

      .ses-count {
        font-size: 12px; font-weight: 700; color: var(--accent);
        background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15));
        padding: 5px 14px; border-radius: 20px;
        animation: ses-count-pop 0.5s ease-out 0.3s both;
        backdrop-filter: blur(4px);
      }

      .ses-filter-row {
        display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
      }
      .ses-filter-input {
        width: 68px; padding: 6px 10px; font-size: 13px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--card); color: var(--text);
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .ses-filter-input:focus {
        outline: none; border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
      }
      .ses-filter-label {
        font-size: 12px; color: var(--muted, #71717a); white-space: nowrap;
      }
      .ses-check {
        display: flex; align-items: center; gap: 5px; font-size: 12px;
        color: var(--muted, #71717a); cursor: pointer; user-select: none;
        transition: color 0.15s;
      }
      .ses-check:hover { color: var(--text); }
      .ses-check input { margin: 0; accent-color: var(--accent); }

      .ses-refresh {
        padding: 7px 18px; font-size: 13px; font-weight: 600;
        border: 1px solid var(--border); border-radius: 10px;
        background: var(--card); color: var(--text); cursor: pointer;
        transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
        position: relative; overflow: hidden;
      }
      .ses-refresh::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent, rgba(99,102,241,0.08), transparent);
        transform: translateX(-100%);
        transition: transform 0.4s ease;
      }
      .ses-refresh:hover {
        border-color: var(--accent); color: var(--accent);
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99,102,241,0.15);
      }
      .ses-refresh:hover::after { transform: translateX(100%); }
      .ses-refresh:active { transform: translateY(0) scale(0.97); }
      .ses-refresh:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
      .ses-refresh--loading { color: var(--accent); border-color: var(--accent); }

      /* ── Grid ── */
      .ses-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 14px;
      }

      /* ── Card ── */
      .ses-card {
        border: 1px solid var(--border); border-radius: 14px;
        background: var(--card); padding: 18px;
        display: flex; flex-direction: column; gap: 14px;
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        animation: ses-fade-up 0.45s ease-out both;
        position: relative; overflow: hidden;
      }
      /* Staggered entrance per card */
      .ses-card:nth-child(1) { animation-delay: 0.05s; }
      .ses-card:nth-child(2) { animation-delay: 0.1s; }
      .ses-card:nth-child(3) { animation-delay: 0.15s; }
      .ses-card:nth-child(4) { animation-delay: 0.2s; }
      .ses-card:nth-child(5) { animation-delay: 0.25s; }
      .ses-card:nth-child(6) { animation-delay: 0.3s; }
      .ses-card:nth-child(7) { animation-delay: 0.35s; }
      .ses-card:nth-child(8) { animation-delay: 0.4s; }
      .ses-card:nth-child(n+9) { animation-delay: 0.45s; }

      .ses-card::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
        background: linear-gradient(90deg, var(--accent), rgba(139,92,246,0.8), var(--accent));
        opacity: 0; transition: opacity 0.3s;
      }
      .ses-card:hover {
        border-color: rgba(99,102,241,0.4);
        transform: translateY(-3px);
        box-shadow:
          0 0 0 1px rgba(99,102,241,0.08),
          0 8px 24px rgba(0,0,0,0.1),
          0 2px 8px rgba(99,102,241,0.06);
      }
      .ses-card:hover::before { opacity: 1; }

      /* Alive indicator glow */
      .ses-card--alive {
        border-color: rgba(34,197,94,0.25);
      }
      .ses-card--alive::before {
        background: linear-gradient(90deg, #22c55e, #4ade80, #22c55e);
        opacity: 0.6;
      }

      /* ── Header ── */
      .ses-card-header {
        display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;
      }
      .ses-card-key {
        font-family: var(--mono, 'SF Mono', monospace); font-size: 13px; font-weight: 600;
        color: var(--accent); text-decoration: none; word-break: break-all;
        line-height: 1.3;
        transition: color 0.2s, text-shadow 0.2s;
      }
      .ses-card-key:hover {
        text-decoration: underline;
        text-shadow: 0 0 12px rgba(99,102,241,0.3);
      }
      .ses-card-key-text {
        font-family: var(--mono, 'SF Mono', monospace); font-size: 13px; font-weight: 600;
        color: var(--text); word-break: break-all; line-height: 1.3;
      }

      .ses-card-meta {
        display: flex; gap: 6px; flex-wrap: wrap; align-items: center; flex-shrink: 0;
      }
      .ses-badge {
        font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 6px;
        text-transform: uppercase; letter-spacing: 0.04em;
        transition: transform 0.2s;
      }
      .ses-badge:hover { transform: scale(1.05); }
      .ses-badge-kind {
        background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.12));
        color: var(--accent);
      }
      .ses-badge-time {
        background: rgba(161,161,170,0.1); color: var(--muted, #71717a);
      }
      .ses-badge-alive {
        display: flex; align-items: center; gap: 4px;
        background: rgba(34,197,94,0.1); color: #22c55e;
      }
      .ses-alive-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
        animation: ses-pulse-dot 2s ease-in-out infinite;
      }

      /* ── Token bar ── */
      .ses-token-bar { display: flex; flex-direction: column; gap: 5px; }
      .ses-token-info {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 12px; color: var(--muted, #71717a);
      }
      .ses-token-track {
        height: 5px; border-radius: 5px;
        background: rgba(161,161,170,0.12);
        overflow: hidden;
      }
      .ses-token-fill {
        height: 100%; border-radius: 5px;
        background: linear-gradient(90deg, var(--accent), rgba(139,92,246,0.9));
        animation: ses-bar-fill 0.8s cubic-bezier(0.4,0,0.2,1) both;
        transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
        position: relative;
      }
      .ses-token-fill::after {
        content: ''; position: absolute; inset: 0;
        background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%);
        background-size: 200% 100%;
        animation: ses-shimmer 2s infinite linear;
      }
      .ses-token-fill--warn {
        background: linear-gradient(90deg, #f59e0b, #fbbf24);
      }
      .ses-token-fill--danger {
        background: linear-gradient(90deg, #ef4444, #f87171);
      }

      /* ── Label ── */
      .ses-label-input {
        width: 100%; padding: 7px 12px; font-size: 13px;
        border: 1px solid var(--border); border-radius: 8px;
        background: transparent; color: var(--text);
        transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
      }
      .ses-label-input:hover { background: rgba(99,102,241,0.03); }
      .ses-label-input:focus {
        outline: none; border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
        background: rgba(99,102,241,0.03);
      }
      .ses-label-input::placeholder { color: var(--muted, #71717a); opacity: 0.4; }

      /* ── Controls ── */
      .ses-controls { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
      .ses-control { display: flex; flex-direction: column; gap: 4px; }
      .ses-control-label {
        font-size: 10px; font-weight: 600; color: var(--muted, #71717a);
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      .ses-control select {
        padding: 6px 8px; font-size: 12px;
        border: 1px solid var(--border); border-radius: 7px;
        background: var(--card); color: var(--text);
        appearance: none; cursor: pointer;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 6px center;
        padding-right: 22px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .ses-control select:hover { border-color: rgba(99,102,241,0.3); }
      .ses-control select:focus {
        outline: none; border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
      }

      /* ── Footer ── */
      .ses-card-footer {
        display: flex; justify-content: flex-end; padding-top: 6px;
        border-top: 1px solid rgba(161,161,170,0.08);
      }
      .ses-delete {
        font-size: 12px; font-weight: 500; padding: 5px 14px; border-radius: 7px;
        border: 1px solid rgba(239,68,68,0.15); background: transparent;
        color: rgba(239,68,68,0.7); cursor: pointer;
        transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
      }
      .ses-delete:hover {
        background: rgba(239,68,68,0.1); color: #ef4444;
        border-color: rgba(239,68,68,0.3);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px rgba(239,68,68,0.15);
      }
      .ses-delete:active { transform: translateY(0) scale(0.96); }
      .ses-delete:disabled { opacity: 0.3; cursor: not-allowed; transform: none; box-shadow: none; }

      /* ── Empty / Store / Error ── */
      .ses-empty {
        text-align: center; padding: 60px 24px; color: var(--muted, #71717a);
        font-size: 14px; animation: ses-fade-up 0.5s ease-out;
      }
      .ses-empty-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.3; }
      .ses-store {
        font-size: 11px; color: var(--muted, #71717a); opacity: 0.5;
        animation: ses-slide-in 0.3s ease-out;
      }
      .ses-error {
        padding: 12px 16px; border-radius: 10px; font-size: 13px;
        border: 1px solid rgba(239,68,68,0.25);
        background: rgba(239,68,68,0.06); color: #ef4444;
        animation: ses-fade-up 0.3s ease-out;
      }

      /* ── Loading skeleton ── */
      .ses-skeleton {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px;
      }
      .ses-skeleton-card {
        border: 1px solid var(--border); border-radius: 14px;
        background: var(--card); padding: 18px; height: 220px;
        background: linear-gradient(90deg, var(--card) 25%, rgba(99,102,241,0.04) 50%, var(--card) 75%);
        background-size: 200% 100%;
        animation: ses-shimmer 1.5s infinite ease-in-out;
      }

      /* ── Create session ── */
      .ses-create {
        border: 1px dashed var(--border); border-radius: 12px;
        background: rgba(99,102,241,0.03); padding: 14px 16px;
        transition: border-color 0.2s, background 0.2s;
      }
      .ses-create:hover {
        border-color: rgba(99,102,241,0.3);
        background: rgba(99,102,241,0.05);
      }
      .ses-create-row {
        display: flex; gap: 8px; align-items: flex-end;
      }
      .ses-create-field {
        display: flex; flex-direction: column; gap: 4px;
      }
      .ses-create-label {
        font-size: 10px; font-weight: 600; color: var(--muted, #71717a);
        text-transform: uppercase; letter-spacing: 0.06em;
      }
      .ses-create-type {
        padding: 7px 10px; font-size: 13px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--card); color: var(--text);
        appearance: none; cursor: pointer;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
        padding-right: 26px; min-width: 110px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .ses-create-type:focus {
        outline: none; border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
      }
      .ses-create-input {
        flex: 1; padding: 7px 12px; font-size: 13px;
        font-family: var(--mono, 'SF Mono', monospace);
        border: 1px solid var(--border); border-radius: 8px;
        background: transparent; color: var(--text);
        transition: border-color 0.2s, box-shadow 0.2s, opacity 0.2s;
      }
      .ses-create-input:disabled {
        opacity: 0.5; cursor: not-allowed;
      }
      .ses-create-input:not(:disabled):focus {
        outline: none; border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
      }
      .ses-create-input::placeholder { color: var(--muted, #71717a); opacity: 0.5; }
      .ses-create-btn {
        padding: 7px 20px; font-size: 13px; font-weight: 600;
        border: 1px solid var(--accent); border-radius: 8px;
        background: linear-gradient(135deg, var(--accent), rgba(139,92,246,0.9));
        color: #fff; cursor: pointer; white-space: nowrap;
        transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
      }
      .ses-create-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(99,102,241,0.3);
      }
      .ses-create-btn:active { transform: translateY(0) scale(0.97); }
      .ses-create-agent {
        padding: 7px 10px; font-size: 13px;
        border: 1px solid var(--border); border-radius: 8px;
        background: var(--card); color: var(--text);
        appearance: none; cursor: pointer;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
        padding-right: 26px; min-width: 120px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .ses-create-agent:focus {
        outline: none; border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
      }
    </style>

    <div class="ses-wrap">
      <!-- Toolbar -->
      <div class="ses-toolbar">
        <div class="ses-toolbar-left">
          <span class="ses-count">${count} nhật ký</span>
          <div class="ses-filter-row">
            <span class="ses-filter-label">Hoạt động</span>
            <input class="ses-filter-input" .value=${props.activeMinutes}
              @input=${(e: Event) =>
                props.onFiltersChange({
                  activeMinutes: (e.target as HTMLInputElement).value,
                  limit: props.limit,
                  includeGlobal: props.includeGlobal,
                  includeUnknown: props.includeUnknown,
                })} />
            <span class="ses-filter-label">phút</span>

            <span class="ses-filter-label" style="margin-left:4px">Giới hạn</span>
            <input class="ses-filter-input" style="width:52px" .value=${props.limit}
              @input=${(e: Event) =>
                props.onFiltersChange({
                  activeMinutes: props.activeMinutes,
                  limit: (e.target as HTMLInputElement).value,
                  includeGlobal: props.includeGlobal,
                  includeUnknown: props.includeUnknown,
                })} />

            <label class="ses-check">
              <input type="checkbox" .checked=${props.includeGlobal}
                @change=${(e: Event) =>
                  props.onFiltersChange({
                    activeMinutes: props.activeMinutes,
                    limit: props.limit,
                    includeGlobal: (e.target as HTMLInputElement).checked,
                    includeUnknown: props.includeUnknown,
                  })} />
              Toàn cục
            </label>
            <label class="ses-check">
              <input type="checkbox" .checked=${props.includeUnknown}
                @change=${(e: Event) =>
                  props.onFiltersChange({
                    activeMinutes: props.activeMinutes,
                    limit: props.limit,
                    includeGlobal: props.includeGlobal,
                    includeUnknown: (e.target as HTMLInputElement).checked,
                  })} />
              Không rõ
            </label>
          </div>
        </div>
        <button class="ses-refresh ${props.loading ? "ses-refresh--loading" : ""}"
          ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      <!-- Create new session -->
      ${
        props.onCreateSession
          ? html`
            <div class="ses-create" style="animation: ses-slide-in 0.4s ease-out;">
              <div class="ses-create-row">
                <div class="ses-create-field">
                  <span class="ses-create-label">Agent</span>
                  <select class="ses-create-agent">
                    ${(props.agents ?? []).map(
                      (a) => html`<option value=${a.id}>${a.name || a.id}</option>`,
                    )}
                    ${
                      !props.agents || props.agents.length === 0
                        ? html`
                            <option value="main">main</option>
                          `
                        : nothing
                    }
                  </select>
                </div>
                <div class="ses-create-field">
                  <span class="ses-create-label">Loại</span>
                  <select class="ses-create-type"
                    @change=${(e: Event) => {
                      const type = (e.target as HTMLSelectElement).value;
                      const row = (e.target as HTMLElement).closest(".ses-create-row")!;
                      const input = row.querySelector<HTMLInputElement>(".ses-create-input");
                      if (!input) return;
                      if (type === "main") {
                        input.value = "main";
                        input.disabled = true;
                      } else if (type === "subagent") {
                        input.value = crypto.randomUUID().slice(0, 8);
                        input.disabled = true;
                      } else {
                        input.value = "";
                        input.disabled = false;
                        input.focus();
                      }
                    }}>
                    <option value="main">Main</option>
                    <option value="custom">Custom</option>
                    <option value="subagent">Subagent</option>
                  </select>
                </div>
                <div class="ses-create-field" style="flex:1">
                  <span class="ses-create-label">Session key</span>
                  <input class="ses-create-input" placeholder="Nhập session key..."
                    value="main" disabled />
                </div>
                <div class="ses-create-field">
                  <span class="ses-create-label">&nbsp;</span>
                  <button class="ses-create-btn" @click=${(e: Event) => {
                    const row = (e.target as HTMLElement).closest(".ses-create-row")!;
                    const agentId =
                      row.querySelector<HTMLSelectElement>(".ses-create-agent")!.value;
                    const type = row.querySelector<HTMLSelectElement>(".ses-create-type")!.value;
                    const input = row.querySelector<HTMLInputElement>(".ses-create-input")!;
                    const suffix = input.value.trim();
                    if (!suffix) return;
                    let key: string;
                    if (type === "main") key = "agent:" + agentId + ":main";
                    else if (type === "subagent")
                      key = "agent:" + agentId + ":subagent:" + crypto.randomUUID();
                    else key = "agent:" + agentId + ":" + suffix;
                    props.onCreateSession!(key);
                  }}>Tạo</button>
                </div>
              </div>
            </div>
          `
          : nothing
      }

      ${props.error ? html`<div class="ses-error">${props.error}</div>` : nothing}
      ${props.result ? html`<div class="ses-store">Kho: ${props.result.path}</div>` : nothing}

      <!-- Loading skeleton -->
      ${
        props.loading && rows.length === 0
          ? html`
        <div class="ses-skeleton">
          ${[1, 2, 3].map(
            () =>
              html`
                <div class="ses-skeleton-card"></div>
              `,
          )}
        </div>
      `
          : nothing
      }

      <!-- Cards grid -->
      ${
        !props.loading && rows.length === 0
          ? html`
              <div class="ses-empty">
                <div class="ses-empty-icon">📭</div>
                Không có nhật ký nào.
              </div>
            `
          : rows.length > 0
            ? html`<div class="ses-grid">
            ${rows.map((row) => renderCard(row, props.basePath, props.onPatch, props.onDelete, props.onOpenSession, props.loading))}
          </div>`
            : nothing
      }
    </div>
  `;
}

function renderCard(
  row: GatewaySessionRow,
  basePath: string,
  onPatch: SessionsProps["onPatch"],
  onDelete: SessionsProps["onDelete"],
  onOpenSession: SessionsProps["onOpenSession"],
  disabled: boolean,
) {
  const rawThinking = row.thinkingLevel ?? "";
  const isBinaryThinking = isBinaryThinkingProvider(row.modelProvider);
  const thinking = resolveThinkLevelDisplay(rawThinking, isBinaryThinking);
  const thinkLevels = resolveThinkLevelOptions(row.modelProvider);
  const verbose = row.verboseLevel ?? "";
  const reasoning = row.reasoningLevel ?? "";
  const name = row.label || row.displayName || resolveSessionFallbackName(row.key);
  const canLink = row.kind !== "global";
  const pct = tokenPercent(row);
  const alive = isAlive(row);

  return html`
    <div class="ses-card ${alive ? "ses-card--alive" : ""}">
      <!-- Header -->
      <div class="ses-card-header">
        <div style="flex:1;min-width:0">
          ${
            canLink
              ? html`<a href="#" class="ses-card-key" @click=${(e: Event) => {
                  e.preventDefault();
                  onOpenSession(row.key);
                }}>${name}</a>`
              : html`<span class="ses-card-key-text">${name}</span>`
          }
        </div>
        <div class="ses-card-meta">
          ${
            alive
              ? html`
                  <span class="ses-badge ses-badge-alive"><span class="ses-alive-dot"></span>trực tuyến</span>
                `
              : nothing
          }
          <span class="ses-badge ses-badge-kind">${row.kind}</span>
          ${
            row.updatedAt
              ? html`<span class="ses-badge ses-badge-time">${formatAgo(row.updatedAt)}</span>`
              : nothing
          }
        </div>
      </div>

      <!-- Label -->
      <input class="ses-label-input" .value=${row.label ?? ""} ?disabled=${disabled}
        placeholder="Tên cuộc hội thoại"
        @change=${(e: Event) => {
          const value = (e.target as HTMLInputElement).value.trim();
          onPatch(row.key, { label: value || null });
        }} />

      <!-- Token bar -->
      <div class="ses-token-bar">
        <div class="ses-token-info">
          <span>Token</span>
          <span>${formatTokens(row)}</span>
        </div>
        <div class="ses-token-track">
          <div class="ses-token-fill ${pct >= 95 ? "ses-token-fill--danger" : pct >= 80 ? "ses-token-fill--warn" : ""}"
            style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Controls hidden -->

      <!-- Footer -->
      <div class="ses-card-footer">
        <button class="ses-delete" ?disabled=${disabled} @click=${() => onDelete(row.key)}>
          Xóa
        </button>
      </div>
    </div>
  `;
}
