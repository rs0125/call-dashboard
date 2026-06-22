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

// A call was actually answered iff it logged conversation time. We rely on talk
// time rather than `status` because Exotel marks every INBOUND parent leg
// 'completed' the moment the call reaches the exophone/flow — even when the
// agent never picks up (no-answer / busy / caller hangs up while ringing). Those
// unanswered calls log conversation_duration = 0. (Mirrors `ANSWERED` in
// queries.ts, the source of truth for the stats.)
export function isConnected(
  conversationDuration: number | bigint | null | undefined,
): boolean {
  return Number(conversationDuration ?? 0) > 0;
}

// User-facing outcome for a single call row. A 'completed' call that never
// connected (no talk time) is really a missed/"no answer" call — show that
// instead of the misleading 'completed' the Exotel parent leg reports.
export function callOutcomeLabel(
  status: string | null | undefined,
  conversationDuration: number | bigint | null | undefined,
): string {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" && !isConnected(conversationDuration)) return "no answer";
  return status ?? "—";
}

// Maps a call to one of the portal's semantic badge variants. When talk time is
// provided it drives the verdict (answered = green); otherwise we fall back to
// the raw status string.
export function statusBadgeClass(
  status: string | null | undefined,
  conversationDuration?: number | bigint | null,
): string {
  const s = (status ?? "").toLowerCase();
  if (conversationDuration !== undefined) {
    if (isConnected(conversationDuration)) return "badge badge-approved";
    if (s === "failed" || s === "canceled") return "badge badge-rejected";
    // completed-but-no-talk, no-answer, missed, busy, … → not answered.
    return "badge badge-pending";
  }
  if (s === "completed" || s === "in-progress" || s === "in-call")
    return "badge badge-approved";
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
