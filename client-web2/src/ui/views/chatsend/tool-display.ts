/**
 * Tool display resolution - adapted from openclaw2/ui/src/ui/tool-display.ts.
 * Deep imports (tool-display.json, tool-display-common.js) replaced with inline implementations.
 */
import type { IconName } from "../../icons.ts";

type ToolDisplayActionSpec = {
  label?: string;
  detailKeys?: string[];
};

type ToolDisplaySpec = {
  icon?: string;
  title?: string;
  label?: string;
  detailKeys?: string[];
  actions?: Record<string, ToolDisplayActionSpec>;
};

export type ToolDisplay = {
  name: string;
  icon: IconName;
  title: string;
  label: string;
  verb?: string;
  detail?: string;
};

const EMOJI_ICON_MAP: Record<string, IconName> = {
  "🧩": "puzzle",
  "🛠️": "wrench",
  "🧰": "wrench",
  "📖": "fileText",
  "✍️": "edit",
  "📝": "penLine",
  "📎": "paperclip",
  "🌐": "globe",
  "📺": "monitor",
  "🧾": "fileText",
  "🔐": "settings",
  "💻": "monitor",
  "🔌": "plug",
  "💬": "messageSquare",
};

const TOOL_MAP: Record<string, ToolDisplaySpec> = {
  bash: { icon: "wrench", title: "Bash", detailKeys: ["command"] },
  exec: { icon: "wrench", title: "Exec", detailKeys: ["command"] },
  process: { icon: "wrench", title: "Process", detailKeys: ["sessionId"] },
  read: { icon: "fileText", title: "Read", detailKeys: ["path"] },
  write: { icon: "edit", title: "Write", detailKeys: ["path"] },
  edit: { icon: "penLine", title: "Edit", detailKeys: ["path"] },
  attach: { icon: "paperclip", title: "Attach", detailKeys: ["path"] },
  browse: { icon: "globe", title: "Browse", detailKeys: ["url"] },
  web_search: { icon: "globe", title: "Web Search", detailKeys: ["query"] },
  web_fetch: { icon: "globe", title: "Web Fetch", detailKeys: ["url"] },
  screenshot: { icon: "monitor", title: "Screenshot" },
  navigate: { icon: "globe", title: "Navigate", detailKeys: ["url", "targetUrl"] },
  click: { icon: "monitor", title: "Click", detailKeys: ["element", "node"] },
  type: { icon: "monitor", title: "Type", detailKeys: ["text"] },
  slack: { icon: "messageSquare", title: "Slack" },
};

function normalizeToolName(name?: string): string {
  return (name ?? "tool").trim();
}

function defaultTitle(name: string): string {
  const cleaned = name.replace(/_/g, " ").trim();
  if (!cleaned) {
    return "Tool";
  }
  return cleaned
    .split(/\s+/)
    .map((part) =>
      part.length <= 2 && part.toUpperCase() === part
        ? part
        : `${part.at(0)?.toUpperCase() ?? ""}${part.slice(1)}`,
    )
    .join(" ");
}

function coerceDisplayValue(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? "";
    if (!firstLine) {
      return undefined;
    }
    if (firstLine.length > 160) {
      return `${firstLine.slice(0, 157)}…`;
    }
    return firstLine;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  return undefined;
}

function shortenHomeInString(input: string): string {
  if (!input) {
    return input;
  }
  const patterns = [
    { re: /^\/Users\/[^/]+(\/|$)/, replacement: "~$1" },
    { re: /^\/home\/[^/]+(\/|$)/, replacement: "~$1" },
    { re: /^C:\\Users\\[^\\]+(\\|$)/i, replacement: "~$1" },
  ] as const;
  for (const pattern of patterns) {
    if (pattern.re.test(input)) {
      return input.replace(pattern.re, pattern.replacement);
    }
  }
  return input;
}

export function resolveToolDisplay(params: {
  name?: string;
  args?: unknown;
  meta?: string;
}): ToolDisplay {
  const name = normalizeToolName(params.name);
  const key = name.toLowerCase();
  const spec = TOOL_MAP[key];
  const icon = (spec?.icon ?? "puzzle") as IconName;
  const title = spec?.title ?? defaultTitle(name);
  const label = spec?.label ?? title;

  let detail: string | undefined;
  const args = params.args as Record<string, unknown> | undefined;
  if (args && spec?.detailKeys) {
    for (const dk of spec.detailKeys) {
      const val = coerceDisplayValue(args[dk]);
      if (val) {
        detail = val;
        break;
      }
    }
  }
  if (detail) {
    detail = shortenHomeInString(detail);
  }

  return { name, icon, title, label, detail };
}

export function formatToolDetail(display: ToolDisplay): string | undefined {
  if (!display.detail) {
    return undefined;
  }
  return `with ${display.detail}`;
}

export function formatToolSummary(display: ToolDisplay): string {
  const detail = formatToolDetail(display);
  return detail ? `${display.label}: ${detail}` : display.label;
}
