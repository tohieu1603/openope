export interface SessionDisplayInput {
  key: string;
  label?: string;
  displayName?: string;
  updatedAt?: number | null;
}

// Channel name → friendly label
const CHANNEL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
  whatsapp: "WhatsApp",
  signal: "Signal",
  bluebubbles: "iMessage",
  matrix: "Matrix",
  email: "Email",
  msteams: "Teams",
  zalo: "Zalo",
};

/** Parse session key into a human-readable fallback name */
export function resolveSessionFallbackName(key: string): string {
  if (key === "global") return "Global";

  // agent:<agentId>:<rest>
  const parts = key.split(":");
  if (parts[0] !== "agent" || parts.length < 3) return key;

  const agentId = parts[1];
  const rest = parts.slice(2).join(":");

  // Main session: agent:x:main
  if (rest === "main") return `Main Session (${agentId})`;

  // Subagent: agent:x:subagent:UUID
  if (rest.startsWith("subagent:")) return `Subagent (${agentId})`;

  // Cron: agent:x:cron:job-id or agent:x:cron:job-id:run:run-id
  if (rest.startsWith("cron:")) {
    const cronParts = rest.split(":");
    const jobId = cronParts[1] ?? "";
    return cronParts.includes("run") ? `Cron Run: ${jobId}` : `Cron Job: ${jobId}`;
  }

  // Channel DM/group: agent:x:<channel>:direct:<id> or agent:x:<channel>:group:<id>
  for (const [ch, label] of Object.entries(CHANNEL_LABELS)) {
    if (parts[2] === ch) {
      if (rest.includes(":group:")) return `${label} Group`;
      if (rest.includes(":channel:")) return `${label} Channel`;
      if (rest.includes(":thread:")) return `${label} Thread`;
      if (rest.includes(":direct:")) {
        const peerId = parts[parts.length - 1] ?? "";
        return `${label} · ${peerId}`;
      }
      return label;
    }
  }

  // Custom key: agent:x:something
  return `${agentId}:${rest}`;
}

/** Classify session key kind */
export function classifySessionKey(key: string): "direct" | "group" | "global" | "unknown" {
  if (key === "global") return "global";
  if (/:group:|:channel:/.test(key)) return "group";
  if (key.startsWith("agent:")) return "direct";
  return "unknown";
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "vừa xong";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

/** Resolve display name with priority: label → displayName → fallbackName */
export function formatSessionDisplay(s: SessionDisplayInput): {
  label: string;
  description: string;
} {
  const fallback = resolveSessionFallbackName(s.key);

  // Priority: label → displayName → fallbackName
  let name: string;
  if (s.label?.trim()) {
    name = s.label.trim();
  } else if (s.displayName?.trim()) {
    name = s.displayName.trim();
  } else {
    name = fallback;
  }

  const timePart = s.updatedAt ? formatRelativeTime(s.updatedAt) : "";
  return { label: name, description: timePart };
}
