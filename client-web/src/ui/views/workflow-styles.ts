import { html } from "lit";

export const workflowStyles = html`<style>
  /* Metrics cards row */
  .wf-metrics-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  @media (max-width: 640px) {
    .wf-metrics-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .wf-metric-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .wf-metric-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }
  .wf-metric-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .wf-metric-value {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--text);
    line-height: 1.1;
  }
  .wf-metric-ok {
    color: var(--ok);
  }
  .wf-metrics-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
  }

  /* Collapsible form */
  .wf-form-collapse {
    margin-bottom: 20px;
  }

  /* === Card Panel (moltbot-style) === */
  .wf-card-panel {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 20px;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }
  .wf-card-panel:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-md);
  }
  .wf-card-title {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--text-strong, var(--text));
  }
  .wf-card-sub {
    color: var(--muted);
    font-size: 13px;
    margin-top: 6px;
    line-height: 1.5;
  }

  /* === Stats Grid (moltbot-style) === */
  .wf-stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-top: 16px;
  }
  @media (min-width: 600px) {
    .wf-stat-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }
  .wf-stat {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }
  .wf-stat:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }
  .wf-stat-label {
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .wf-stat-value {
    font-size: 24px;
    font-weight: 700;
    margin-top: 6px;
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .wf-stat-ok {
    color: var(--ok);
  }

  /* === Row & Button (moltbot-style) === */
  .wf-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
  }
  .wf-muted {
    color: var(--muted);
    font-size: 13px;
  }
  .wf-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    padding: 9px 16px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .wf-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-strong);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }
  .wf-btn:active {
    background: var(--secondary);
    transform: translateY(0);
    box-shadow: none;
  }
  .wf-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .wf-btn-primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-foreground, #fff);
  }
  .wf-btn-primary:hover {
    background: var(--accent-hover, var(--accent));
    border-color: var(--accent-hover, var(--accent));
  }

  /* === Form Grid (moltbot-style) === */
  .wf-form-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    margin-top: 16px;
  }
  .wf-field {
    display: grid;
    gap: 6px;
  }
  .wf-field.full {
    grid-column: 1 / -1;
  }
  .wf-field span {
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
  }
  .wf-field input,
  .wf-field textarea,
  .wf-field select {
    border: 1px solid var(--border);
    background: var(--card);
    border-radius: var(--radius-md);
    padding: 8px 12px;
    outline: none;
    font-size: 14px;
    font-family: inherit;
    color: var(--text);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }
  .wf-field input:focus,
  .wf-field textarea:focus,
  .wf-field select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-subtle);
  }
  .wf-field input::placeholder,
  .wf-field textarea::placeholder {
    color: var(--muted);
  }
  .wf-field textarea {
    min-height: 100px;
    resize: vertical;
    font-family: var(--mono, monospace);
    line-height: 1.5;
  }
  .wf-field-checkbox {
    grid-template-columns: auto 1fr;
    align-items: center;
  }
  .wf-field-checkbox input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  /* Section header with running badge */
  .wf-section-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .wf-section-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-strong, var(--text));
  }
  .wf-running-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: var(--accent-subtle);
    border: 1px solid var(--accent);
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }
  .wf-running-badge-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    animation: wf-pulse 1.5s ease-in-out infinite;
  }
  @keyframes wf-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.3);
    }
  }
  @keyframes wf-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Workflow cards */
  .wf-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .wf-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: all 0.15s ease;
  }
  .wf-card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-md);
  }
  .wf-card-paused {
    opacity: 0.7;
  }
  .wf-card-running {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-subtle);
  }
  .wf-card-selected {
    border-color: var(--accent);
    background: var(--accent-subtle);
  }
  .wf-card-main {
    display: flex;
    gap: 16px;
    padding: 20px;
  }
  .wf-card-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--secondary);
    border-radius: var(--radius-md);
    color: var(--muted);
    flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .wf-card-icon-active {
    background: var(--accent-subtle);
    color: var(--accent);
  }
  .wf-card-icon-running {
    background: var(--accent);
    color: var(--accent-foreground);
    animation: wf-icon-pulse 2s ease-in-out infinite;
  }
  @keyframes wf-icon-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
  .wf-card-icon svg {
    width: 24px;
    height: 24px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.5;
  }
  .wf-card-content {
    flex: 1;
    min-width: 0;
  }
  .wf-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .wf-card-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-strong, var(--text));
  }
  .wf-card-desc {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--text-secondary, var(--text));
    opacity: 0.85;
  }
  .wf-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    border-radius: var(--radius-full);
  }
  .wf-status-active {
    background: var(--ok-subtle);
    color: var(--ok);
  }
  .wf-status-paused {
    background: var(--warn-subtle);
    color: var(--warn);
  }
  .wf-status-running {
    background: var(--accent-subtle);
    color: var(--accent);
  }
  .wf-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  .wf-status-dot-pulse {
    animation: wf-pulse 1.5s ease-in-out infinite;
  }
  .wf-card-meta {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .wf-meta-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
  }
  .wf-meta-icon {
    width: 14px;
    height: 14px;
  }
  .wf-meta-icon svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
  }
  .wf-run-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--muted);
  }
  .wf-meta-success .wf-run-dot {
    background: var(--ok);
  }
  .wf-meta-ok .wf-run-dot {
    background: var(--ok);
  }
  .wf-meta-error .wf-run-dot {
    background: var(--danger);
  }
  .wf-meta-tag {
    padding: 2px 8px;
    background: var(--secondary);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .wf-meta-next {
    color: var(--accent);
    background: var(--accent-subtle);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
  }
  .wf-card-prompt {
    margin-top: 12px;
    padding: 10px 14px;
    background: var(--bg);
    border-radius: var(--radius-md);
    font-size: 12.5px;
    color: var(--text-strong, var(--text));
    line-height: 1.5;
    border: 1px solid var(--border);
    overflow: hidden;
    max-height: 120px;
  }
  .wf-card-actions {
    display: flex;
    gap: 8px;
    padding: 12px 20px;
    background: var(--bg-muted);
    border-top: 1px solid var(--border);
  }
  .wf-action {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 500;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .wf-action:hover {
    background: var(--bg-hover);
    border-color: var(--border-strong);
  }
  .wf-action svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
  }
  .wf-action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }
  .wf-action-run:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .wf-action-delete {
    margin-left: auto;
    padding: 8px;
  }
  .wf-action-delete span {
    display: none;
  }
  .wf-action-delete:hover {
    border-color: var(--danger);
    color: var(--danger);
    background: var(--danger-subtle);
  }
  .wf-action-active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-subtle);
  }
  .wf-action-active svg {
    transform: rotate(180deg);
  }

  /* Expanded details */
  .wf-card-expanded {
    border-color: var(--accent);
  }
  .wf-card-details {
    padding: 16px 20px;
    padding-left: 84px;
    background: var(--card);
    border-top: 1px solid var(--border);
  }
  .wf-details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .wf-detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .wf-detail-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .wf-detail-value {
    font-size: 15px;
    color: var(--text);
  }
  .wf-detail-prompt {
    margin-top: 16px;
  }
  .wf-detail-prompt-text {
    margin-top: 8px;
    padding: 14px 18px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    font-size: 14px;
    color: var(--text);
    line-height: 1.55;
  }

  /* Run history */
  .wf-runs-section {
    margin-top: 24px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
  }
  .wf-runs-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .wf-runs-header-left {
    flex: 1;
  }
  .wf-runs-title {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-strong, var(--text));
  }
  .wf-runs-sub {
    margin: 0;
    font-size: 13px;
    color: var(--muted);
  }
  .wf-runs-close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--muted);
    cursor: pointer;
  }
  .wf-runs-close:hover {
    background: var(--bg-hover);
    color: var(--text);
  }
  .wf-runs-close svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
  }
  .wf-runs-list,
  .wf-right-runs-list {
    display: flex;
    flex-direction: column;
  }
  .wf-run-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s ease;
  }
  .wf-run-item:last-child {
    border-bottom: none;
  }
  .wf-run-item:hover {
    background: var(--bg-hover);
  }
  .wf-run-indicator {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .wf-run-indicator-ok {
    background: var(--ok-subtle);
    color: var(--ok);
  }
  .wf-run-indicator-err {
    background: var(--danger-subtle);
    color: var(--danger);
  }
  .wf-run-body {
    flex: 1;
    min-width: 0;
  }
  .wf-run-top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .wf-run-status {
    font-size: 13px;
    font-weight: 600;
  }
  .wf-run-status-ok {
    color: var(--ok);
  }
  .wf-run-status-error {
    color: var(--danger);
  }
  .wf-run-time {
    font-size: 12px;
    color: var(--muted);
  }
  .wf-run-summary {
    font-size: 12px;
    color: var(--text);
    margin-top: 4px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .wf-run-error {
    font-size: 12px;
    color: var(--danger);
    margin-top: 4px;
  }
  .wf-run-duration {
    font-size: 12px;
    color: var(--muted);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    margin-top: 4px;
  }
  .wf-runs-empty,
  .wf-right-runs-empty {
    padding: 32px 20px;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
  }
  .wf-runs-loading,
  .wf-right-runs-loading {
    padding: 32px 20px;
    text-align: center;
  }

  /* Empty state */
  .wf-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 24px;
    text-align: center;
    background: var(--card);
    border: 2px dashed var(--border);
    border-radius: var(--radius-xl);
  }
  .wf-empty-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-subtle);
    border-radius: var(--radius-lg);
    color: var(--accent);
    margin-bottom: 16px;
  }
  .wf-empty-icon svg {
    width: 28px;
    height: 28px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.5;
  }
  .wf-empty-title {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-strong, var(--text));
  }
  .wf-empty-desc {
    margin: 0 0 20px;
    font-size: 13px;
    color: var(--muted);
    max-width: 280px;
  }

  /* Loading */
  .wf-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 48px 24px;
  }
  .wf-loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: wf-spin 0.8s linear infinite;
    margin-bottom: 16px;
  }
  .wf-loading-text {
    font-size: 14px;
    color: var(--muted);
  }

  /* === Split panel layout === */
  .wf-split-panel {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    grid-template-rows: 1fr;
    gap: 14px;
    height: clamp(400px, 65vh, 900px);
  }
  @media (max-width: 900px) {
    .wf-split-panel {
      grid-template-columns: 1fr;
      height: auto;
    }
  }
  .wf-split-left {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    min-height: 0;
    padding-right: 6px;
  }
  .wf-split-right {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow-y: auto;
    min-height: 0;
  }

  /* === Progress panel (activity feed) === */
  .wf-progress-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: auto;
    min-height: 0;
  }
  .wf-progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .wf-progress-phase {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
  }
  .wf-progress-phase-done {
    color: var(--ok);
  }
  .wf-progress-elapsed {
    font-size: 13px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  /* Thinking indicator */
  .wf-thinking {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--accent-subtle, rgba(0,0,0,.03));
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
    overflow: hidden;
    max-height: 72px;
  }
  .wf-thinking-icon {
    flex-shrink: 0;
    font-size: 14px;
    margin-top: 1px;
  }
  .wf-thinking-text {
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  /* Activity list (tool calls feed) */
  .wf-act-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .wf-act-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
    transition: background .15s;
  }
  .wf-act-item:hover {
    background: var(--hover, rgba(0,0,0,.03));
  }
  .wf-act-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 11px;
    font-weight: 700;
  }
  .wf-act-done .wf-act-dot {
    background: var(--ok-subtle, rgba(34,197,94,.12));
    color: var(--ok);
  }
  .wf-act-active .wf-act-dot {
    background: var(--accent-subtle, rgba(59,130,246,.12));
    color: var(--accent);
  }
  .wf-act-error .wf-act-dot {
    background: var(--danger-subtle, rgba(239,68,68,.12));
    color: var(--danger);
  }
  .wf-act-spinner {
    display: block;
    width: 10px;
    height: 10px;
    border: 2px solid var(--accent);
    border-top-color: transparent;
    border-radius: 50%;
    animation: wf-spin .8s linear infinite;
  }
  @keyframes wf-spin {
    to { transform: rotate(360deg); }
  }
  .wf-act-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .wf-act-name {
    font-weight: 500;
    color: var(--text);
  }
  .wf-act-detail {
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wf-act-time {
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .wf-act-empty {
    text-align: center;
    padding: 24px 16px;
    font-size: 13px;
    color: var(--muted);
    font-style: italic;
  }

  /* Finished result bar */
  .wf-progress-result {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
  }
  .wf-progress-status-ok {
    background: var(--ok-subtle, rgba(34,197,94,.08));
    color: var(--ok);
  }
  .wf-progress-status-error {
    background: var(--danger-subtle, rgba(239,68,68,.08));
    color: var(--danger);
  }

  /* Empty right panel */
  .wf-empty-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    min-height: 200px;
  }
  .wf-empty-panel-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    margin-bottom: 12px;
    opacity: 0.5;
  }
  .wf-empty-panel-icon svg {
    width: 32px;
    height: 32px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.5;
  }

  /* Right panel header */
  .wf-right-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  .wf-right-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-strong, var(--text));
  }
  .wf-right-sub {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--muted);
  }

  /* Markdown content reset */
  .wf-md p { margin: 0 0 4px; }
  .wf-md p:last-child { margin-bottom: 0; }
  .wf-md br { line-height: 0.5; }
  .wf-md ul, .wf-md ol { margin: 4px 0; padding-left: 20px; }
  .wf-md li { margin: 1px 0; }
  .wf-md h1, .wf-md h2, .wf-md h3, .wf-md h4, .wf-md h5, .wf-md h6 {
    margin: 6px 0 2px; font-size: inherit; font-weight: 600;
  }
  .wf-md h1 { font-size: 1.15em; }
  .wf-md h2 { font-size: 1.1em; }
  .wf-md pre {
    background: var(--bg-deeper, rgba(0,0,0,.2));
    border-radius: 6px; padding: 8px 10px;
    overflow-x: auto; font-size: 12px;
    margin: 4px 0;
  }
  .wf-md code {
    background: var(--bg-deeper, rgba(0,0,0,.15));
    padding: 1px 4px; border-radius: 3px; font-size: 0.9em;
  }
  .wf-md pre code { background: none; padding: 0; }
  .wf-md blockquote {
    border-left: 3px solid var(--border);
    margin: 4px 0; padding: 2px 10px;
    color: var(--muted);
  }
  .wf-md table {
    border-collapse: collapse; width: 100%; margin: 4px 0; font-size: 12px;
  }
  .wf-md th, .wf-md td {
    border: 1px solid var(--border); padding: 4px 8px; text-align: left;
  }
  .wf-md th { background: var(--bg-muted); font-weight: 600; }

  /* Run detail modal */
  .wf-modal-backdrop {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,.6);
    display: flex; align-items: center; justify-content: center;
    animation: wfFadeIn .15s ease;
    backdrop-filter: blur(4px);
  }
  @keyframes wfFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .wf-modal {
    background: var(--bg); border: 1px solid var(--border);
    border-radius: 16px; width: 92%; max-width: 620px; max-height: 82vh;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 24px 80px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.04);
    animation: wfSlideUp .2s cubic-bezier(.16,1,.3,1);
  }
  @keyframes wfSlideUp { from { transform: translateY(16px) scale(.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }

  /* Header */
  .wf-modal-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
  }
  .wf-modal-header-left {
    display: flex; align-items: center; gap: 14px;
  }
  .wf-modal-icon {
    width: 42px; height: 42px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; font-weight: 700; flex-shrink: 0;
  }
  .wf-modal-icon-ok { background: rgba(34,197,94,.12); color: var(--ok, #22c55e); }
  .wf-modal-icon-err { background: rgba(239,68,68,.12); color: var(--danger, #ef4444); }
  .wf-modal-header-text { display: flex; flex-direction: column; gap: 4px; }
  .wf-modal-title { margin: 0; font-size: 17px; font-weight: 600; }
  .wf-modal-meta {
    display: flex; align-items: center; gap: 6px;
    font-size: 13px; color: var(--muted);
  }
  .wf-modal-meta-sep { opacity: .4; }
  .wf-modal-close {
    background: none; border: none; color: var(--muted);
    cursor: pointer; padding: 8px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    transition: all .15s; margin: -4px -4px 0 0;
  }
  .wf-modal-close:hover { background: var(--bg-muted); color: var(--fg); }
  .wf-modal-close svg { width: 18px; height: 18px; }

  /* Body */
  .wf-modal-body {
    padding: 24px; overflow-y: auto; flex: 1;
    font-size: 14px; line-height: 1.7;
  }
  .wf-modal-error {
    margin-top: 16px; padding: 12px 14px;
    background: rgba(239,68,68,.06);
    border: 1px solid rgba(239,68,68,.15);
    border-radius: 10px; color: var(--danger);
  }

  /* Footer */
  .wf-modal-footer {
    padding: 14px 24px;
    border-top: 1px solid var(--border);
    display: flex; justify-content: flex-end;
  }
  .wf-modal-close-btn {
    padding: 8px 24px; border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-muted); color: var(--fg);
    font-size: 13px; font-weight: 500;
    cursor: pointer; transition: all .15s;
  }
  .wf-modal-close-btn:hover {
    background: var(--bg-deeper, rgba(255,255,255,.08));
    border-color: var(--border-strong, var(--border));
  }
</style>`;
