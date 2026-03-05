export interface SessionDisplayInput {
  key: string;
  label?: string;
  updatedAt?: number | null;
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

export function formatSessionDisplay(s: SessionDisplayInput): {
  label: string;
  description: string;
} {
  const cleanKey = s.key.replace(
    /:?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    "",
  );
  const label = s.label ? `${s.label} (${cleanKey})` : cleanKey;
  const timePart = s.updatedAt ? formatRelativeTime(s.updatedAt) : "";
  return { label, description: timePart };
}
