// Format utilities ported from ui/src/ui/format.ts

export function formatMs(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return "n/a";
  }
  return new Date(ms).toLocaleString();
}

export function formatAgo(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return "n/a";
  }
  const diff = Date.now() - ms;
  const absDiff = Math.abs(diff);
  const suffix = diff < 0 ? "from now" : "ago";
  const sec = Math.round(absDiff / 1000);
  if (sec < 60) {
    return diff < 0 ? "just now" : `${sec}s ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m ${suffix}`;
  }
  const hr = Math.round(min / 60);
  if (hr < 48) {
    return `${hr}h ${suffix}`;
  }
  const day = Math.round(hr / 24);
  return `${day}d ${suffix}`;
}

export function formatDurationMs(ms?: number | null): string {
  if (!ms && ms !== 0) {
    return "n/a";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const sec = Math.round(ms / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hr = Math.round(min / 60);
  if (hr < 48) {
    return `${hr}h`;
  }
  const day = Math.round(hr / 24);
  return `${day}d`;
}

export function formatList(arr?: string[]): string {
  if (!arr || arr.length === 0) {
    return "-";
  }
  return arr.join(", ");
}

export function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.substring(0, maxLen) + "…";
}
