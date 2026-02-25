import { html, nothing } from "lit";
import type { CronProgressState, CronToolEntry } from "../workflow-types";

/** Map tool name to a short Vietnamese label. */
function toolLabel(name: string): string {
  const map: Record<string, string> = {
    read: "Đọc file",
    write: "Ghi file",
    edit: "Chỉnh sửa",
    shell: "Chạy lệnh",
    exec: "Thực thi",
    browser: "Duyệt web",
    search: "Tìm kiếm",
    fetch: "Tải dữ liệu",
    message: "Gửi tin nhắn",
  };
  return map[name] ?? name;
}

/** Map high-level phase to Vietnamese. */
function phaseLabel(phase: string): string {
  const map: Record<string, string> = {
    initializing: "Khởi tạo",
    prompting: "Gửi prompt",
    executing: "Đang xử lý",
    delivering: "Gửi kết quả",
  };
  return map[phase] ?? phase;
}

function renderToolEntry(t: CronToolEntry) {
  const isDone = !!t.finishedAtMs;
  const isError = t.isError;
  const elapsed = ((t.finishedAtMs ?? Date.now()) - t.startedAtMs) / 1000;
  const stateClass = isError ? "wf-act-error" : isDone ? "wf-act-done" : "wf-act-active";

  return html`
    <div class="wf-act-item ${stateClass}">
      <div class="wf-act-dot">
        ${isError ? "✗" : isDone ? "✓" : html`<span class="wf-act-spinner"></span>`}
      </div>
      <div class="wf-act-body">
        <span class="wf-act-name">${toolLabel(t.name)}</span>
        ${t.detail ? html`<span class="wf-act-detail">${t.detail}</span>` : nothing}
      </div>
      <span class="wf-act-time">${elapsed.toFixed(1)}s</span>
    </div>
  `;
}

export function renderProgressTimeline(progress: CronProgressState | undefined) {
  if (!progress) return nothing;

  const isFinished = !!progress.finishedAtMs;
  const elapsed = (progress.finishedAtMs ?? Date.now()) - progress.startedAtMs;

  return html`
    <div class="wf-progress-panel">
      <!-- Header: phase + elapsed -->
      <div class="wf-progress-header">
        <span class="wf-progress-phase ${isFinished ? "wf-progress-phase-done" : ""}">
          ${isFinished
            ? progress.status === "error" ? "Lỗi" : "Hoàn tất"
            : phaseLabel(progress.phase)}
        </span>
        <span class="wf-progress-elapsed">${(elapsed / 1000).toFixed(1)}s</span>
      </div>

      <!-- Thinking indicator -->
      ${!isFinished && progress.thinkingText
        ? html`
          <div class="wf-thinking">
            <span class="wf-thinking-icon">💭</span>
            <span class="wf-thinking-text">${progress.thinkingText}</span>
          </div>
        `
        : nothing}

      <!-- Tool call feed -->
      ${progress.toolCalls.length > 0
        ? html`
          <div class="wf-act-list">
            ${progress.toolCalls.map(renderToolEntry)}
          </div>
        `
        : !isFinished
          ? html`<div class="wf-act-empty">Đang chờ hoạt động...</div>`
          : nothing}

      <!-- Finished status -->
      ${isFinished
        ? html`
          <div class="wf-progress-result wf-progress-status-${progress.status ?? "ok"}">
            ${progress.status === "error" ? "Thất bại" : "Thành công"}
            — ${progress.toolCalls.length} thao tác, ${(elapsed / 1000).toFixed(1)}s
          </div>
        `
        : nothing}
    </div>
  `;
}
