import { t } from "../../i18n";
import { icons, type IconName } from "../../icons";

export function formatTime(timestamp?: string | Date | number): string {
  if (!timestamp) return "";
  const date =
    typeof timestamp === "number"
      ? new Date(timestamp)
      : typeof timestamp === "string"
        ? new Date(timestamp)
        : timestamp;
  const now = new Date();
  const time = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Check if same day
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return time;

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isYesterday) return `Hôm qua ${time}`;

  // Check if same year
  const isSameYear = date.getFullYear() === now.getFullYear();
  if (isSameYear) {
    return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")} ${time}`;
  }

  // Different year - show full date
  return `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()} ${time}`;
}

export const suggestions = [
  // {
  //   icon: icons.image,
  //   label: t("chatSuggestionImage"),
  //   prompt: "Tạo hình ảnh về",
  // },
  {
    icon: icons.pencil,
    label: t("chatSuggestionWrite"),
    prompt: "Giúp tôi viết",
  },
  {
    icon: icons.graduationCap,
    label: t("chatSuggestionLearn"),
    prompt: "Dạy tôi về",
  },
  {
    icon: icons.coffee,
    label: t("chatSuggestionDay"),
    prompt: "Giúp tôi lên kế hoạch",
  },
];

// ── Tool display resolution (matching original tool-display.ts) ──

export const TOOL_DISPLAY_MAP: Record<
  string,
  { icon: IconName; title: string; detailKeys?: string[] }
> = {
  bash: { icon: "wrench", title: "Bash", detailKeys: ["command"] },
  process: { icon: "wrench", title: "Process", detailKeys: ["sessionId"] },
  read: { icon: "fileText", title: "Read", detailKeys: ["path"] },
  write: { icon: "penLine", title: "Write", detailKeys: ["path"] },
  edit: { icon: "penLine", title: "Edit", detailKeys: ["path"] },
  attach: { icon: "paperclip", title: "Attach", detailKeys: ["path", "url", "fileName"] },
  browser: { icon: "globe", title: "Browser" },
  canvas: { icon: "image", title: "Canvas" },
  nodes: { icon: "smartphone", title: "Nodes" },
  cron: { icon: "loader", title: "Cron" },
  gateway: { icon: "plug", title: "Gateway" },
  discord: { icon: "messageSquare", title: "Discord" },
  slack: { icon: "messageSquare", title: "Slack" },
};

export function resolveToolIcon(name: string): IconName {
  return TOOL_DISPLAY_MAP[name.toLowerCase()]?.icon ?? "puzzle";
}

export function resolveToolLabel(name: string): string {
  const spec = TOOL_DISPLAY_MAP[name.toLowerCase()];
  if (spec) return spec.title;
  // Default: capitalize and replace underscores
  const cleaned = name.replace(/_/g, " ").trim();
  if (!cleaned) return "Tool";
  return cleaned
    .split(/\s+/)
    .map((w) => (w.length <= 2 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

const PREVIEW_MAX_LINES = 2;
const PREVIEW_MAX_CHARS = 100;

export function getTruncatedPreview(text: string): string {
  const lines = text.split("\n").slice(0, PREVIEW_MAX_LINES);
  let preview = lines.join("\n");
  if (preview.length > PREVIEW_MAX_CHARS) {
    preview = preview.slice(0, PREVIEW_MAX_CHARS) + "…";
  } else if (text.split("\n").length > PREVIEW_MAX_LINES) {
    preview += "…";
  }
  return preview;
}

export function shortenHomePath(input: string): string {
  if (!input) return input;
  return input.replace(/\/Users\/[^/]+/g, "~").replace(/\/home\/[^/]+/g, "~");
}
