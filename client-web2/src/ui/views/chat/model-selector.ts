/**
 * Model Selection Dropdown
 * Compact dropdown above chat input for switching AI models via gateway sessions.patch
 */

import { html, nothing } from "lit";

export interface ModelEntry {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface ModelSelectorProps {
  models: ModelEntry[];
  currentModel: string | null;
  loading: boolean;
  disabled: boolean;
  onModelChange: (modelId: string) => void;
}

/** Short display label: "provider / model-name" */
function modelLabel(m: ModelEntry): string {
  const short = m.name || m.id;
  return `${m.provider} / ${short}`;
}

export function renderModelSelector(props: ModelSelectorProps) {
  const { models, currentModel, loading, disabled, onModelChange } = props;

  if (loading) {
    return html`
      <span class="ms-loading">...</span>
    `;
  }
  if (!models.length) return nothing;

  const handleChange = (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value) onModelChange(value);
  };

  return html`
    <style>
      .ms-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .ms-select {
        appearance: none;
        background: var(--bg-muted, #1a1a2e);
        color: var(--text, #e0e0e0);
        border: 1px solid var(--border, #333);
        border-radius: 6px;
        padding: 4px 24px 4px 8px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        outline: none;
        max-width: 220px;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 6px center;
        transition: border-color 0.15s;
      }
      .ms-select:hover:not(:disabled) { border-color: var(--accent, #6366f1); }
      .ms-select:focus { border-color: var(--accent, #6366f1); }
      .ms-select:disabled { opacity: 0.5; cursor: not-allowed; }
      .ms-label {
        font-size: 11px;
        color: var(--muted, #888);
        font-weight: 500;
      }
      .ms-loading {
        font-size: 11px;
        color: var(--muted, #888);
      }
    </style>
    <div class="ms-wrap">
      <span class="ms-label">Model</span>
      <select
        class="ms-select"
        .value=${currentModel || ""}
        @change=${handleChange}
        ?disabled=${disabled}
      >
        ${models.map(
          (m) => html`
            <option value=${m.id} ?selected=${m.id === currentModel}>
              ${modelLabel(m)}${m.reasoning ? " (thinking)" : ""}
            </option>
          `,
        )}
      </select>
    </div>
  `;
}
