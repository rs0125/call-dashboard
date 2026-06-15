import { statusBadgeClass } from "@/lib/format";

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span style={{ color: "var(--slate)" }}>—</span>;
  return <span className={statusBadgeClass(status)}>{status}</span>;
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
