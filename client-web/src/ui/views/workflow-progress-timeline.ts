import { html, nothing } from "lit";
import type { CronProgressState } from "../workflow-types";
import { PROGRESS_MILESTONES } from "../workflow-types";

export function renderProgressTimeline(progress: CronProgressState | undefined) {
  if (!progress) return nothing;

  const doneSteps = progress.steps;
  const isFinished = !!progress.finishedAtMs;
  const elapsed = (progress.finishedAtMs ?? Date.now()) - progress.startedAtMs;

  return html`
    <div class="wf-progress-panel">
      <h4 class="wf-progress-title">
        ${isFinished ? "Hoàn tất" : "Đang chạy..."}
      </h4>
      <div class="wf-progress-list">
        ${PROGRESS_MILESTONES.map(({ step, label }) => {
          const isDone = doneSteps.includes(step);
          const isActive = !isFinished && progress.currentStep === step && !isDone;
          const stateClass = isDone
            ? "wf-milestone-done"
            : isActive
              ? "wf-milestone-active"
              : "wf-milestone-pending";
          return html`
            <div class="wf-milestone ${stateClass}">
              <div class="wf-milestone-dot">
                ${isDone ? html`&#10003;` : isActive ? html`&#9679;` : nothing}
              </div>
              <div class="wf-milestone-info">
                <div class="wf-milestone-label">${label}</div>
                ${isActive && progress.detail
                  ? html`<div class="wf-milestone-detail">${progress.detail}</div>`
                  : nothing}
              </div>
            </div>
          `;
        })}
      </div>
      <div class="wf-progress-elapsed">
        ${isFinished
          ? html`<span class="wf-progress-status-${progress.status ?? "ok"}">
              ${progress.status === "error" ? "Lỗi" : "Thành công"}
            </span> &mdash; ${(elapsed / 1000).toFixed(1)}s`
          : html`Thời gian: ${(elapsed / 1000).toFixed(1)}s`}
      </div>
    </div>
  `;
}
