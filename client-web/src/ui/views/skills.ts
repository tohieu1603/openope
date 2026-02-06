// Skills view for Client Web
// Based on moltbot skills view structure
import { html, nothing } from "lit";
import type { SkillStatusEntry, SkillStatusReport, SkillMessageMap } from "../agent-types";

type SkillGroup = {
  id: string;
  label: string;
  skills: SkillStatusEntry[];
};

const SKILL_SOURCE_GROUPS: Array<{ id: string; label: string; sources: string[] }> = [
  { id: "workspace", label: "Workspace Skills", sources: ["openclaw-workspace"] },
  { id: "built-in", label: "Built-in Skills", sources: ["openclaw-bundled"] },
  { id: "installed", label: "Installed Skills", sources: ["openclaw-managed"] },
  { id: "extra", label: "Extra Skills", sources: ["openclaw-extra"] },
];

function groupSkills(skills: SkillStatusEntry[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const def of SKILL_SOURCE_GROUPS) {
    groups.set(def.id, { id: def.id, label: def.label, skills: [] });
  }
  const builtInGroup = SKILL_SOURCE_GROUPS.find(g => g.id === "built-in");
  const other: SkillGroup = { id: "other", label: "Other Skills", skills: [] };
  for (const skill of skills) {
    const match = skill.bundled ? builtInGroup : SKILL_SOURCE_GROUPS.find(g => g.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = SKILL_SOURCE_GROUPS.map(g => groups.get(g.id)).filter((g): g is SkillGroup => Boolean(g && g.skills.length > 0));
  if (other.skills.length > 0) {
    ordered.push(other);
  }
  return ordered;
}

function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "…";
}

export type SkillsProps = {
  loading: boolean;
  report: SkillStatusReport | null;
  error: string | null;
  filter: string;
  edits: Record<string, string>;
  busyKey: string | null;
  messages: SkillMessageMap;
  onFilterChange: (next: string) => void;
  onRefresh: () => void;
  onToggle: (skillKey: string, enabled: boolean) => void;
  onEdit: (skillKey: string, value: string) => void;
  onSaveKey: (skillKey: string) => void;
  onInstall: (skillKey: string, name: string, installId: string) => void;
};

export function renderSkills(props: SkillsProps) {
  const skills = props.report?.skills ?? [];
  const filter = props.filter.trim().toLowerCase();
  const filtered = filter
    ? skills.filter(skill => [skill.name, skill.description, skill.source].join(" ").toLowerCase().includes(filter))
    : skills;
  const groups = groupSkills(filtered);

  return html`
    <style>
      /* Skills card */
      .skills-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; }
      .skills-card-title { font-size: 15px; font-weight: 600; color: var(--text-strong, var(--text)); }
      .skills-card-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
      .skills-row { display: flex; align-items: center; gap: 12px; }
      .skills-muted { color: var(--muted); font-size: 13px; }
      .skills-btn {
        display: inline-flex; align-items: center; justify-content: center; padding: 8px 16px;
        background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md);
        font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease;
      }
      .skills-btn:hover { background: var(--bg-hover); border-color: var(--border-strong); }
      .skills-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .callout { padding: 12px 16px; border-radius: var(--radius-md); font-size: 13px; }
      .callout.danger { background: var(--danger-subtle, #fee2e2); color: var(--danger, #dc2626); }

      /* Filters */
      .skills-filters { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
      .skills-field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 200px; }
      .skills-field span { font-size: 13px; color: var(--muted); font-weight: 500; }
      .skills-field input {
        border: 1px solid var(--border); background: var(--card); border-radius: var(--radius-md);
        padding: 8px 12px; font-size: 14px; color: var(--text); outline: none;
      }
      .skills-field input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-subtle); }

      /* Skills groups */
      .skills-groups { display: flex; flex-direction: column; gap: 16px; }
      .skills-group { border: 1px solid var(--border); border-radius: var(--radius-md); overflow: hidden; }
      .skills-group-header {
        display: flex; align-items: center; justify-content: space-between; padding: 12px 16px;
        background: var(--bg-subtle, var(--secondary)); cursor: pointer; user-select: none;
        font-size: 14px; font-weight: 600;
      }
      .skills-group-header:hover { background: var(--bg-hover); }

      /* Skills list */
      .skills-list { display: flex; flex-direction: column; }
      .skills-item {
        display: flex; justify-content: space-between; gap: 16px; padding: 16px;
        border-top: 1px solid var(--border); flex-wrap: wrap;
      }
      .skills-item-main { flex: 1; min-width: 250px; }
      .skills-item-title { font-size: 14px; font-weight: 500; color: var(--text-strong, var(--text)); }
      .skills-item-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
      .skills-item-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }

      /* Chip row */
      .skills-chip-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .skills-chip {
        padding: 2px 8px; background: var(--secondary); border-radius: var(--radius-full);
        font-size: 11px; color: var(--muted);
      }
      .skills-chip-ok { background: var(--ok-subtle, #dcfce7); color: var(--ok, #16a34a); }
      .skills-chip-warn { background: var(--warn-subtle, #fef3c7); color: var(--warn, #d97706); }

      /* API key field */
      .skills-api-field { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
      .skills-api-field span { font-size: 12px; color: var(--muted); }
      .skills-api-field input {
        border: 1px solid var(--border); background: var(--card); border-radius: var(--radius-md);
        padding: 6px 10px; font-size: 13px; color: var(--text); outline: none; width: 200px;
      }
      .skills-api-field input:focus { border-color: var(--accent); }
    </style>

    <section class="skills-card">
      <div class="skills-row" style="justify-content: space-between;">
        <div>
          <div class="skills-card-title">Skills</div>
          <div class="skills-card-sub">Bundled, managed, và workspace skills.</div>
        </div>
        <button class="skills-btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>

      <div class="skills-filters" style="margin-top: 14px;">
        <label class="skills-field">
          <span>Tìm kiếm</span>
          <input .value=${props.filter}
            @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
            placeholder="Search skills" />
        </label>
        <div class="skills-muted">${filtered.length} hiển thị</div>
      </div>

      ${props.error ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>` : nothing}

      ${filtered.length === 0 ? html`
        <div class="skills-muted" style="margin-top: 16px;">Không tìm thấy skill nào.</div>
      ` : html`
        <div class="skills-groups" style="margin-top: 16px;">
          ${groups.map(group => {
            const collapsedByDefault = group.id === "workspace" || group.id === "built-in";
            return html`
              <details class="skills-group" ?open=${!collapsedByDefault}>
                <summary class="skills-group-header">
                  <span>${group.label}</span>
                  <span class="skills-muted">${group.skills.length}</span>
                </summary>
                <div class="skills-list">
                  ${group.skills.map(skill => renderSkill(skill, props))}
                </div>
              </details>
            `;
          })}
        </div>
      `}
    </section>
  `;
}

function renderSkill(skill: SkillStatusEntry, props: SkillsProps) {
  const busy = props.busyKey === skill.skillKey;
  const apiKey = props.edits[skill.skillKey] ?? "";
  const message = props.messages[skill.skillKey] ?? null;
  const canInstall = skill.install.length > 0 && skill.missing.bins.length > 0;
  const showBundledBadge = Boolean(skill.bundled && skill.source !== "openclaw-bundled");
  const missing = [
    ...skill.missing.bins.map(b => `bin:${b}`),
    ...skill.missing.env.map(e => `env:${e}`),
    ...skill.missing.config.map(c => `config:${c}`),
    ...skill.missing.os.map(o => `os:${o}`),
  ];
  const reasons: string[] = [];
  if (skill.disabled) reasons.push("disabled");
  if (skill.blockedByAllowlist) reasons.push("blocked by allowlist");

  return html`
    <div class="skills-item">
      <div class="skills-item-main">
        <div class="skills-item-title">${skill.emoji ? `${skill.emoji} ` : ""}${skill.name}</div>
        <div class="skills-item-sub">${clampText(skill.description, 140)}</div>
        <div class="skills-chip-row">
          <span class="skills-chip">${skill.source}</span>
          ${showBundledBadge ? html`<span class="skills-chip">bundled</span>` : nothing}
          <span class="skills-chip ${skill.eligible ? 'skills-chip-ok' : 'skills-chip-warn'}">
            ${skill.eligible ? "eligible" : "blocked"}
          </span>
          ${skill.disabled ? html`<span class="skills-chip skills-chip-warn">disabled</span>` : nothing}
        </div>
        ${missing.length > 0 ? html`<div class="skills-muted" style="margin-top: 6px;">Missing: ${missing.join(", ")}</div>` : nothing}
        ${reasons.length > 0 ? html`<div class="skills-muted" style="margin-top: 6px;">Reason: ${reasons.join(", ")}</div>` : nothing}
      </div>
      <div class="skills-item-meta">
        <div class="skills-row" style="justify-content: flex-end; flex-wrap: wrap;">
          <button class="skills-btn" ?disabled=${busy}
            @click=${() => props.onToggle(skill.skillKey, skill.disabled)}>
            ${skill.disabled ? "Bật" : "Tắt"}
          </button>
          ${canInstall ? html`
            <button class="skills-btn" ?disabled=${busy}
              @click=${() => props.onInstall(skill.skillKey, skill.name, skill.install[0].id)}>
              ${busy ? "Đang cài…" : skill.install[0].label}
            </button>
          ` : nothing}
        </div>
        ${message ? html`
          <div class="skills-muted" style="color: ${message.kind === 'error' ? 'var(--danger, #dc2626)' : 'var(--ok, #16a34a)'};">
            ${message.message}
          </div>
        ` : nothing}
        ${skill.primaryEnv ? html`
          <div class="skills-api-field">
            <span>API key</span>
            <input type="password" .value=${apiKey}
              @input=${(e: Event) => props.onEdit(skill.skillKey, (e.target as HTMLInputElement).value)} />
          </div>
          <button class="skills-btn" style="margin-top: 8px;" ?disabled=${busy}
            @click=${() => props.onSaveKey(skill.skillKey)}>Lưu key</button>
        ` : nothing}
      </div>
    </div>
  `;
}
