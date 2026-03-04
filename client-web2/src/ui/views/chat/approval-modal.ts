/**
 * Tool Approval Modal
 * Shows pending exec approval requests with command details and countdown timer.
 * User can allow-once, allow-always, or deny.
 */

import { html, nothing } from "lit";
import type { ExecApprovalDecision } from "../../gateway-client";

export interface ApprovalRequest {
  id: string;
  command: string;
  cwd?: string | null;
  agentId?: string | null;
  expiresAtMs: number;
}

export interface ApprovalModalProps {
  requests: ApprovalRequest[];
  onResolve: (id: string, decision: ExecApprovalDecision) => void;
}

export function renderApprovalModal(props: ApprovalModalProps) {
  const { requests, onResolve } = props;
  if (requests.length === 0) return nothing;

  const req = requests[0]; // Show one at a time
  const remaining = Math.max(0, Math.ceil((req.expiresAtMs - Date.now()) / 1000));

  return html`
    <style>
      .am-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(4px);
      }
      .am-modal {
        background: var(--card, #1e1e2e);
        border: 1px solid var(--border, #333);
        border-radius: 12px;
        padding: 24px;
        max-width: 520px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      }
      .am-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text, #e0e0e0);
        margin: 0 0 16px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .am-title-icon {
        width: 20px;
        height: 20px;
        color: var(--warning, #f59e0b);
      }
      .am-command {
        background: var(--bg-muted, #1a1a2e);
        border: 1px solid var(--border, #333);
        border-radius: 8px;
        padding: 12px;
        font-family: "SF Mono", "Fira Code", monospace;
        font-size: 13px;
        color: var(--text, #e0e0e0);
        word-break: break-all;
        white-space: pre-wrap;
        margin-bottom: 12px;
        max-height: 200px;
        overflow-y: auto;
      }
      .am-meta {
        font-size: 12px;
        color: var(--muted, #888);
        margin-bottom: 16px;
      }
      .am-countdown {
        font-size: 12px;
        color: var(--warning, #f59e0b);
        font-weight: 500;
        margin-bottom: 16px;
      }
      .am-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .am-btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid var(--border, #333);
        transition: all 0.15s;
      }
      .am-btn--deny {
        background: transparent;
        color: var(--danger, #ef4444);
        border-color: var(--danger, #ef4444);
      }
      .am-btn--deny:hover {
        background: var(--danger, #ef4444);
        color: white;
      }
      .am-btn--allow {
        background: var(--accent, #6366f1);
        color: white;
        border-color: var(--accent, #6366f1);
      }
      .am-btn--allow:hover {
        opacity: 0.9;
      }
      .am-btn--always {
        background: var(--success, #22c55e);
        color: white;
        border-color: var(--success, #22c55e);
      }
      .am-btn--always:hover {
        opacity: 0.9;
      }
      .am-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        border-radius: 10px;
        background: var(--danger, #ef4444);
        color: white;
        font-size: 11px;
        font-weight: 600;
        padding: 0 6px;
        margin-left: auto;
      }
    </style>
    <div class="am-overlay">
      <div class="am-modal">
        <h3 class="am-title">
          <svg class="am-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Tool Approval Required
          ${requests.length > 1 ? html`<span class="am-badge">${requests.length}</span>` : nothing}
        </h3>
        <div class="am-command">${req.command}</div>
        ${req.cwd ? html`<div class="am-meta">cwd: ${req.cwd}</div>` : nothing}
        ${req.agentId ? html`<div class="am-meta">agent: ${req.agentId}</div>` : nothing}
        <div class="am-countdown">Expires in ${remaining}s</div>
        <div class="am-actions">
          <button class="am-btn am-btn--deny" @click=${() => onResolve(req.id, "deny")}>
            Deny
          </button>
          <button class="am-btn am-btn--always" @click=${() => onResolve(req.id, "allow-always")}>
            Always Allow
          </button>
          <button class="am-btn am-btn--allow" @click=${() => onResolve(req.id, "allow-once")}>
            Allow
          </button>
        </div>
      </div>
    </div>
  `;
}
