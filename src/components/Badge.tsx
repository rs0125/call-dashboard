import { statusBadgeClass, callOutcomeLabel } from "@/lib/format";

// When `conversationDuration` is passed, the badge reflects whether the call
// actually connected (talk time > 0) rather than the raw Exotel status, so a
// 'completed' inbound call that nobody answered reads as "no answer".
export function StatusBadge({
  status,
  conversationDuration,
}: {
  status: string | null | undefined;
  conversationDuration?: number | null;
}) {
  if (!status) return <span style={{ color: "var(--slate)" }}>—</span>;
  const label =
    conversationDuration !== undefined
      ? callOutcomeLabel(status, conversationDuration)
      : status;
  return (
    <span className={statusBadgeClass(status, conversationDuration)}>
      {label}
    </span>
  );
}

export function DirectionBadge({
  label,
}: {
  label: "Inbound" | "Outbound" | "—";
}) {
  if (label === "—") return <span style={{ color: "var(--slate)" }}>—</span>;
  return (
    <span className="badge">
      {label === "Inbound" ? "↓ " : "↑ "}
      {label}
    </span>
  );
}
