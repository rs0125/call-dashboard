// Display helpers. Note: the DB uses BigInt for id/duration columns (GORM
// uint/int -> Postgres int8), so anything crossing into JSON must be coerced.

export function fmtDuration(seconds: number | bigint | null | undefined): string {
  const s = Number(seconds ?? 0);
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

// Exotel call statuses we treat as a connected/answered conversation.
const ANSWERED = new Set(["completed", "in-progress", "in-call"]);

export function isAnswered(status: string | null | undefined): boolean {
  return ANSWERED.has((status ?? "").toLowerCase());
}

// Maps an Exotel call status to one of the portal's semantic badge variants.
export function statusBadgeClass(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (isAnswered(s)) return "badge badge-approved";
  if (s === "no-answer" || s === "missed" || s === "busy")
    return "badge badge-pending";
  if (s === "failed" || s === "canceled") return "badge badge-rejected";
  return "badge";
}

export function directionLabel(direction: string | null | undefined): "Inbound" | "Outbound" | "—" {
  const d = (direction ?? "").toLowerCase();
  if (d.startsWith("outbound")) return "Outbound";
  if (d === "inbound" || d === "incoming") return "Inbound";
  return "—";
}
