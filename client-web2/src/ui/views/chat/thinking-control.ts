/**
 * Thinking Level Control
 * Segmented button group for setting AI thinking/reasoning level via sessions.patch
 */

import { html } from "lit";

export type ThinkingLevel = "off" | "low" | "medium" | "high";

export interface ThinkingControlProps {
  level: ThinkingLevel | null;
  disabled: boolean;
  onLevelChange: (level: ThinkingLevel) => void;
}

const LEVELS: { value: ThinkingLevel; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];

export function renderThinkingControl(props: ThinkingControlProps) {
  const { level, disabled, onLevelChange } = props;
  const current = level || "off";

  return html`
    <style>
      .tc-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .tc-label {
        font-size: 11px;
        color: var(--muted, #888);
        font-weight: 500;
      }
      .tc-group {
        display: inline-flex;
        border: 1px solid var(--border, #333);
        border-radius: 6px;
        overflow: hidden;
      }
      .tc-btn {
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 500;
        border: none;
        background: var(--bg-muted, #1a1a2e);
        color: var(--muted, #888);
        cursor: pointer;
        transition: all 0.15s;
        border-right: 1px solid var(--border, #333);
      }
      .tc-btn:last-child { border-right: none; }
      .tc-btn:hover:not(:disabled):not(.active) {
        background: var(--bg-hover, #252540);
        color: var(--text, #e0e0e0);
      }
      .tc-btn.active {
        background: var(--accent, #6366f1);
        color: white;
      }
      .tc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    </style>
    <div class="tc-wrap">
      <span class="tc-label">Thinking</span>
      <div class="tc-group">
        ${LEVELS.map(
          (l) => html`
            <button
              class="tc-btn ${current === l.value ? "active" : ""}"
              @click=${() => onLevelChange(l.value)}
              ?disabled=${disabled}
            >
              ${l.label}
            </button>
          `,
        )}
      </div>
    </div>
  `;
}
