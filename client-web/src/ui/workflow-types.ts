// Workflow types for Client Web
// Matches Admin UI's Cron types for full compatibility

import type { CronActivity, CronProgressStep } from "./gateway-client";

/** A resolved tool call entry for UI rendering. */
export type CronToolEntry = {
  id: string;
  name: string;
  detail?: string;
  startedAtMs: number;
  finishedAtMs?: number;
  isError?: boolean;
};

/** Ephemeral progress state for a running workflow (not persisted). */
export type CronProgressState = {
  jobId: string;
  /** High-level phase (kept for header display). */
  phase: CronProgressStep;
  /** Live tool calls in order. */
  toolCalls: CronToolEntry[];
  /** Latest thinking text from assistant. */
  thinkingText?: string;
  startedAtMs: number;
  finishedAtMs?: number;
  status?: "ok" | "error" | "skipped";
};

export type { CronActivity };

export type ScheduleKind = "every" | "at" | "cron";
export type EveryUnit = "minutes" | "hours" | "days";
export type SessionTarget = "main" | "isolated";
export type WakeMode = "next-heartbeat" | "now";
export type PayloadKind = "systemEvent" | "agentTurn";
export type DeliveryMode = "announce" | "none";

export type WorkflowSchedule = {
  kind: ScheduleKind;
  // For "every" - repeat interval
  everyAmount?: number;
  everyUnit?: EveryUnit;
  // For "at" - one-time run
  atDatetime?: string; // ISO datetime string
  // For "cron" - cron expression
  cronExpr?: string;
  cronTz?: string;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  schedule: WorkflowSchedule;
  prompt: string;
  notifyMe: boolean;
  enabled: boolean;
  sessionTarget?: SessionTarget;
  wakeMode?: WakeMode;
  payloadKind?: PayloadKind;
  timeout?: number;
  lastRunAt?: number;
  lastRunStatus?: "success" | "error" | "running" | "ok";
  nextRunAt?: number;
  createdAtMs?: number;
  updatedAtMs?: number;
  agentId?: string;
};

export type WorkflowFormState = {
  name: string;
  description: string;
  enabled: boolean;
  agentId: string;
  // Schedule
  scheduleKind: ScheduleKind;
  everyAmount: number;
  everyUnit: EveryUnit;
  atDatetime: string;
  cronExpr: string;
  cronTz: string;
  // Execution
  sessionTarget: SessionTarget;
  wakeMode: WakeMode;
  payloadKind: PayloadKind;
  timeout: number;
  postToMainPrefix: string;
  // Delivery (for agentTurn with isolated session)
  deliveryMode: DeliveryMode;
  deliveryChannel: string;
  deliveryTo: string;
  // Task
  prompt: string;
  notifyMe: boolean;
};

export const DEFAULT_WORKFLOW_FORM: WorkflowFormState = {
  name: "",
  description: "",
  enabled: true,
  agentId: "",
  scheduleKind: "every",
  everyAmount: 1,
  everyUnit: "days",
  atDatetime: "",
  cronExpr: "0 9 * * *",
  cronTz: "",
  // Note: "main" session requires payload.kind="systemEvent"
  // "isolated" allows payload.kind="agentTurn" (send message to AI)
  sessionTarget: "isolated",
  wakeMode: "now",
  payloadKind: "agentTurn",
  timeout: 300,
  postToMainPrefix: "",
  // Delivery settings (for isolated + agentTurn)
  deliveryMode: "announce",
  deliveryChannel: "last",
  deliveryTo: "",
  prompt: "",
  notifyMe: false,
};

// Validate form before conversion
// Gateway rules: main→systemEvent only, isolated→agentTurn only
export function validateWorkflowForm(form: WorkflowFormState): string | null {
  const name = form.name.trim();
  const prompt = form.prompt.trim();

  if (!name) return "Tên workflow không được để trống";
  if (!prompt) return "Nội dung công việc không được để trống";
  if (form.scheduleKind === "at" && !form.atDatetime) return "Vui lòng chọn thời gian chạy";
  if (form.scheduleKind === "cron" && !form.cronExpr.trim())
    return "Biểu thức cron không được để trống";
  if (form.scheduleKind === "every" && form.everyAmount < 1) return "Chu kỳ phải lớn hơn 0";
  return null; // Valid
}

// Convert form state to Cron API format
// Must match gateway CronAddParamsSchema exactly
export function formToCronPayload(form: WorkflowFormState) {
  // Validate first
  const validationError = validateWorkflowForm(form);
  if (validationError) {
    throw new Error(validationError);
  }

  // Build schedule object
  let schedule: { kind: string; everyMs?: number; atMs?: number; expr?: string; tz?: string };

  if (form.scheduleKind === "every") {
    // Ensure everyAmount is at least 1
    const amount = Math.max(1, form.everyAmount || 1);
    let everyMs = amount;
    switch (form.everyUnit) {
      case "minutes":
        everyMs *= 60 * 1000;
        break;
      case "hours":
        everyMs *= 60 * 60 * 1000;
        break;
      case "days":
        everyMs *= 24 * 60 * 60 * 1000;
        break;
    }
    schedule = { kind: "every", everyMs };
  } else if (form.scheduleKind === "at") {
    const atMs = form.atDatetime ? new Date(form.atDatetime).getTime() : Date.now();
    schedule = { kind: "at", atMs };
  } else {
    schedule = { kind: "cron", expr: form.cronExpr.trim() };
    if (form.cronTz?.trim()) schedule.tz = form.cronTz.trim();
  }

  // Use payload kind from form directly (user can choose freely)
  const effectivePayloadKind = form.payloadKind;
  const promptText = form.prompt.trim();

  // Build payload based on payloadKind
  // agentTurn: { kind, message, deliver?, channel?, to? }
  // systemEvent: { kind, text }
  type AgentTurnPayload = {
    kind: "agentTurn";
    message: string;
    model?: string;
    deliver?: boolean;
    channel?: string;
    to?: string;
  };
  type SystemEventPayload = {
    kind: "systemEvent";
    text: string;
  };

  let payload: AgentTurnPayload | SystemEventPayload;

  if (effectivePayloadKind === "agentTurn") {
    const agentPayload: AgentTurnPayload = {
      kind: "agentTurn",
      message: promptText,
      model: "byteplus/kimi-k2.5",
    };

    // Delivery settings go INSIDE payload for agentTurn
    if (form.deliveryMode === "announce") {
      agentPayload.deliver = true;
      const channel = form.deliveryChannel.trim() || "last";
      agentPayload.channel = channel;
      const to = form.deliveryTo.trim();
      if (to) {
        agentPayload.to = to;
      }
    }

    payload = agentPayload;
  } else {
    // systemEvent - uses "text" field
    payload = {
      kind: "systemEvent",
      text: promptText,
    };
  }

  // Build result matching gateway CronAddParamsSchema
  const result: Record<string, unknown> = {
    name: form.name.trim(),
    enabled: form.enabled,
    schedule,
    sessionTarget: form.sessionTarget,
    wakeMode: form.wakeMode,
    payload,
  };

  // Only add description if non-empty
  const desc = form.description.trim();
  if (desc) {
    result.description = desc;
  }

  // Add agentId if non-empty
  const agentId = form.agentId.trim();
  if (agentId) {
    result.agentId = agentId;
  }

  // Add isolation object for isolated sessions with postToMainPrefix
  if (form.sessionTarget === "isolated" && form.postToMainPrefix.trim()) {
    result.isolation = {
      postToMainPrefix: form.postToMainPrefix.trim(),
    };
  }

  return result;
}

// Vietnamese unit labels
const UNIT_LABELS_VI: Record<EveryUnit, { singular: string; plural: string }> = {
  minutes: { singular: "phút", plural: "phút" },
  hours: { singular: "giờ", plural: "giờ" },
  days: { singular: "ngày", plural: "ngày" },
};

// Format schedule for display (Vietnamese)
export function formatSchedule(schedule: WorkflowSchedule): string {
  if (!schedule) return "Chưa đặt lịch";

  switch (schedule.kind) {
    case "every": {
      const amount = schedule.everyAmount ?? 1;
      const unit = schedule.everyUnit ?? "days";
      const unitLabel = UNIT_LABELS_VI[unit]?.plural ?? unit;
      return `Mỗi ${amount} ${unitLabel}`;
    }
    case "at": {
      if (!schedule.atDatetime) return "Chạy một lần";
      const date = new Date(schedule.atDatetime);
      return `Lúc ${date.toLocaleString("vi-VN")}`;
    }
    case "cron": {
      return schedule.cronExpr ? `Cron: ${schedule.cronExpr}` : "Lịch tùy chỉnh";
    }
    default:
      return "Không xác định";
  }
}

// Parse cron schedule from API to our format
export function parseCronSchedule(cronJob: {
  schedule?: { kind?: string; everyMs?: number; atMs?: number; expr?: string; tz?: string };
}): WorkflowSchedule {
  const sched = cronJob.schedule;
  if (!sched) return { kind: "every", everyAmount: 1, everyUnit: "days" };

  if (sched.kind === "every" && sched.everyMs) {
    const ms = sched.everyMs;
    if (ms >= 24 * 60 * 60 * 1000) {
      return {
        kind: "every",
        everyAmount: Math.floor(ms / (24 * 60 * 60 * 1000)),
        everyUnit: "days",
      };
    } else if (ms >= 60 * 60 * 1000) {
      return { kind: "every", everyAmount: Math.floor(ms / (60 * 60 * 1000)), everyUnit: "hours" };
    } else {
      return { kind: "every", everyAmount: Math.floor(ms / (60 * 1000)), everyUnit: "minutes" };
    }
  }

  if (sched.kind === "at" && sched.atMs) {
    return { kind: "at", atDatetime: new Date(sched.atMs).toISOString() };
  }

  if (sched.kind === "cron" && sched.expr) {
    return { kind: "cron", cronExpr: sched.expr, cronTz: sched.tz };
  }

  return { kind: "every", everyAmount: 1, everyUnit: "days" };
}
