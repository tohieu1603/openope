import { html, nothing } from "lit";
import type {
  ScheduleKind,
  EveryUnit,
  SessionTarget,
  WakeMode,
  PayloadKind,
  DeliveryMode,
} from "../workflow-types";
import type { WorkflowProps } from "./workflow";
import {
  SCHEDULE_OPTIONS,
  EVERY_UNIT_OPTIONS,
  SESSION_OPTIONS,
  WAKE_MODE_OPTIONS,
  PAYLOAD_OPTIONS,
  DELIVERY_MODE_OPTIONS,
  CHANNEL_OPTIONS,
} from "./workflow-helpers";

export function renderFormCard(props: WorkflowProps) {
  const { form, saving, onFormChange, onSubmit } = props;
  const isValid =
    form.name.trim() &&
    form.prompt.trim() &&
    (form.scheduleKind !== "at" || form.atDatetime) &&
    (form.scheduleKind !== "cron" || form.cronExpr.trim()) &&
    (form.scheduleKind !== "every" || form.everyAmount >= 1);

  return html`
    <div class="wf-card-panel">
      <div class="wf-card-title">Tạo Workflow</div>
      <div class="wf-card-sub">Tạo công việc tự động theo lịch.</div>

      <!-- Basic Info -->
      <div class="wf-form-grid">
        <label class="wf-field">
          <span>Tên</span>
          <input
            .value=${form.name}
            placeholder="VD: Báo cáo buổi sáng"
            @input=${(e: Event) => onFormChange({ name: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="wf-field">
          <span>Mô tả</span>
          <input
            .value=${form.description}
            placeholder="Mô tả ngắn (tuỳ chọn)"
            @input=${(e: Event) =>
              onFormChange({
                description: (e.target as HTMLInputElement).value,
              })}
          />
        </label>
      </div>

      <!-- Schedule -->
      <div class="wf-form-grid" style="margin-top: 12px;">
        <label class="wf-field">
          <span>Lịch chạy</span>
          <operis-select
            .value=${form.scheduleKind}
            .options=${SCHEDULE_OPTIONS}
            @change=${(e: CustomEvent) =>
              onFormChange({ scheduleKind: e.detail.value as ScheduleKind })}
          ></operis-select>
        </label>
        ${
          form.scheduleKind === "at"
            ? html`
              <label class="wf-field">
                <span>Thời gian</span>
                <input
                  type="datetime-local"
                  .value=${form.atDatetime}
                  @input=${(e: Event) =>
                    onFormChange({
                      atDatetime: (e.target as HTMLInputElement).value,
                    })}
                />
              </label>
            `
            : form.scheduleKind === "every"
              ? html`
                <label class="wf-field">
                  <span>Mỗi</span>
                  <input
                    type="number"
                    min="1"
                    .value=${String(form.everyAmount)}
                    @input=${(e: Event) =>
                      onFormChange({
                        everyAmount: parseInt((e.target as HTMLInputElement).value, 10) || 1,
                      })}
                  />
                </label>
                <label class="wf-field">
                  <span>Đơn vị</span>
                  <operis-select
                    .value=${form.everyUnit}
                    .options=${EVERY_UNIT_OPTIONS}
                    @change=${(e: CustomEvent) =>
                      onFormChange({ everyUnit: e.detail.value as EveryUnit })}
                  ></operis-select>
                </label>
              `
              : html`
                <label class="wf-field">
                  <span>Biểu thức</span>
                  <input
                    .value=${form.cronExpr}
                    placeholder="0 9 * * *"
                    @input=${(e: Event) =>
                      onFormChange({
                        cronExpr: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
                <label class="wf-field">
                  <span>Múi giờ</span>
                  <input
                    .value=${form.cronTz}
                    placeholder="UTC"
                    @input=${(e: Event) =>
                      onFormChange({
                        cronTz: (e.target as HTMLInputElement).value,
                      })}
                  />
                </label>
              `
        }
      </div>

      <!-- Execution -->
      <div class="wf-form-grid" style="margin-top: 12px;">
        <label class="wf-field">
          <span>Phiên</span>
          <operis-select
            .value=${form.sessionTarget}
            .options=${SESSION_OPTIONS}
            @change=${(e: CustomEvent) =>
              onFormChange({ sessionTarget: e.detail.value as SessionTarget })}
          ></operis-select>
        </label>
        <label class="wf-field">
          <span>Đánh thức</span>
          <operis-select
            .value=${form.wakeMode}
            .options=${WAKE_MODE_OPTIONS}
            @change=${(e: CustomEvent) => onFormChange({ wakeMode: e.detail.value as WakeMode })}
          ></operis-select>
        </label>
        <label class="wf-field">
          <span>Loại payload</span>
          <operis-select
            .value=${form.payloadKind}
            .options=${PAYLOAD_OPTIONS}
            @change=${(e: CustomEvent) =>
              onFormChange({ payloadKind: e.detail.value as PayloadKind })}
          ></operis-select>
        </label>
        <label class="wf-field wf-field-checkbox">
          <span>Bật</span>
          <input
            type="checkbox"
            .checked=${form.enabled}
            @change=${(e: Event) =>
              onFormChange({ enabled: (e.target as HTMLInputElement).checked })}
          />
        </label>
      </div>

      <!-- Delivery (for agentTurn) -->
      ${
        form.payloadKind === "agentTurn"
          ? html`
            <div class="wf-form-grid" style="margin-top: 12px;">
              <label class="wf-field">
                <span>Delivery</span>
                <operis-select
                  .value=${form.deliveryMode}
                  .options=${DELIVERY_MODE_OPTIONS}
                  @change=${(e: CustomEvent) =>
                    onFormChange({
                      deliveryMode: e.detail.value as DeliveryMode,
                    })}
                ></operis-select>
              </label>
              <label class="wf-field">
                <span>Timeout (giây)</span>
                <input
                  type="number"
                  min="0"
                  .value=${String(form.timeout)}
                  @input=${(e: Event) =>
                    onFormChange({
                      timeout: parseInt((e.target as HTMLInputElement).value, 10) || 0,
                    })}
                />
              </label>
              ${
                form.deliveryMode === "announce"
                  ? html`
                    <label class="wf-field">
                      <span>Channel</span>
                      <operis-select
                        .value=${form.deliveryChannel || "last"}
                        .options=${CHANNEL_OPTIONS}
                        @change=${(e: CustomEvent) =>
                          onFormChange({ deliveryChannel: e.detail.value })}
                      ></operis-select>
                    </label>
                    <label class="wf-field">
                      <span>To</span>
                      <input
                        .value=${form.deliveryTo}
                        placeholder="+1555… hoặc chat id"
                        @input=${(e: Event) =>
                          onFormChange({
                            deliveryTo: (e.target as HTMLInputElement).value,
                          })}
                      />
                    </label>
                  `
                  : nothing
              }
            </div>
          `
          : nothing
      }

      <!-- Task/Message -->
      <label class="wf-field" style="margin-top: 12px;">
        <span
          >${form.payloadKind === "systemEvent" ? "System text" : "Tin nhắn cho AI"}</span
        >
        <textarea
          .value=${form.prompt}
          rows="4"
          placeholder="VD: Kiểm tra email mới và tóm tắt những email quan trọng"
          @input=${(e: Event) => onFormChange({ prompt: (e.target as HTMLTextAreaElement).value })}
        ></textarea>
      </label>

      <!-- Submit -->
      <div class="wf-row" style="margin-top: 14px;">
        <button
          class="wf-btn wf-btn-primary"
          ?disabled=${saving || !isValid}
          @click=${onSubmit}
        >
          ${saving ? "Đang tạo…" : "Tạo workflow"}
        </button>
      </div>
    </div>
  `;
}
