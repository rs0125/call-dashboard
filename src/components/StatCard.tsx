export function StatCard({
  label,
  value,
  sub,
  hist,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  hist?: string; // small historical comparison line, e.g. "3 yesterday"
  tone?: "pending" | "approved";
}) {
  return (
    <div className={`card stat-card${tone ? ` stat-card--${tone}` : ""}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub ? <p className="stat-sub">{sub}</p> : null}
      {hist ? (
        <p
          className="stat-sub"
          style={{ fontSize: "0.78rem", opacity: 0.8, marginTop: "0.15rem" }}
        >
          {hist}
        </p>
      ) : null}
    </div>
  );
}
