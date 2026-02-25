import { html, nothing } from "lit";
import type { WorkflowRun } from "../workflow-api";
import { formatMs } from "./workflow-helpers";

export function renderRunItem(entry: WorkflowRun) {
  return html`
    <div class="wf-run-item">
      <div class="wf-run-main">
        <div class="wf-run-status wf-run-status-${entry.status}">
          ${entry.status}
        </div>
        <div class="wf-run-summary">${entry.summary ?? ""}</div>
        ${entry.error ? html`<div class="wf-run-error">${entry.error}</div>` : nothing}
      </div>
      <div class="wf-run-meta">
        <div>${formatMs(entry.ts)}</div>
        <div class="wf-run-duration">${entry.durationMs ?? 0}ms</div>
      </div>
    </div>
  `;
}
