import Link from "next/link";
import type { EmployeeStat, DirectionStats } from "@/lib/queries";
import { StatCard } from "./StatCard";
import { fmtDuration } from "@/lib/format";

type Dir = "inbound" | "outbound";

// Presentational: Inbound (left) and Outbound (right) side by side. Each column
// has the direction's summary cards on top and its per-employee table below.
// Data is passed in (the parent fetches it once). `previous` + `prevLabel`
// drive the small "X <era>" comparison line under each card.
export function DirectionBreakdown({
  inbound,
  outbound,
  employees,
  previous,
  prevLabel,
}: {
  inbound: DirectionStats;
  outbound: DirectionStats;
  employees: EmployeeStat[];
  previous?: { inbound: DirectionStats; outbound: DirectionStats } | null;
  prevLabel?: string | null;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: "1.5rem",
        alignItems: "start",
      }}
    >
      <DirectionColumn
        title="Inbound"
        icon="↓"
        dir="inbound"
        stats={inbound}
        prev={previous?.inbound}
        prevLabel={prevLabel}
        employees={employees}
      />
      <DirectionColumn
        title="Outbound"
        icon="↑"
        dir="outbound"
        stats={outbound}
        prev={previous?.outbound}
        prevLabel={prevLabel}
        employees={employees}
      />
    </div>
  );
}

function DirectionColumn({
  title,
  icon,
  dir,
  stats,
  prev,
  prevLabel,
  employees,
}: {
  title: string;
  icon: string;
  dir: Dir;
  stats: DirectionStats;
  prev?: DirectionStats;
  prevLabel?: string | null;
  employees: EmployeeStat[];
}) {
  const answerRate = stats.total
    ? Math.round((stats.answered / stats.total) * 100)
    : 0;

  // Small "X <era>" line for a card, or undefined when there's no prior period.
  const hist = (v: string | number) =>
    prev && prevLabel ? `${v} ${prevLabel}` : undefined;

  // Employees active in this direction, busiest first.
  const rows = employees
    .filter((e) => e[dir].total > 0)
    .sort((a, b) => b[dir].total - a[dir].total);

  return (
    <section>
      <div className="section-label">
        {icon} {title}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "0.75rem",
          marginBottom: "1rem",
        }}
      >
        <StatCard
          label="Calls"
          value={stats.total.toLocaleString()}
          hist={hist(prev ? prev.total.toLocaleString() : "")}
        />
        <StatCard
          label="Answered"
          value={stats.answered.toLocaleString()}
          sub={stats.total ? `${answerRate}% answer rate` : undefined}
          hist={hist(prev ? prev.answered.toLocaleString() : "")}
          tone="approved"
        />
        <StatCard
          label="No answer"
          value={stats.missed.toLocaleString()}
          hist={hist(prev ? prev.missed.toLocaleString() : "")}
          tone={stats.missed > 0 ? "pending" : undefined}
        />
        <StatCard
          label="Talk time"
          value={fmtDuration(stats.talkSeconds)}
          hist={hist(prev ? (prev.talkSeconds ? fmtDuration(prev.talkSeconds) : "0s") : "")}
        />
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="admin-table admin-table-clickable">
          <thead>
            <tr>
              <th>Employee</th>
              <th className="num">Calls</th>
              <th className="num">Answered</th>
              <th className="num">Talk</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const d = e[dir];
              return (
                <tr key={e.id}>
                  <td className="title-cell">
                    <div className="title">
                      <Link href={`/employees/${e.id}`}>{e.name}</Link>
                    </div>
                    <div className="desc">{e.phoneNumber}</div>
                  </td>
                  <td className="num">{d.total.toLocaleString()}</td>
                  <td className="num">
                    {d.answered}
                    {d.total ? (
                      <span style={{ color: "var(--slate)" }}>
                        {" "}
                        ({Math.round((d.answered / d.total) * 100)}%)
                      </span>
                    ) : null}
                  </td>
                  <td className="num">{fmtDuration(d.talkSeconds)}</td>
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--slate)", padding: "1.5rem" }}>
                  No {title.toLowerCase()} calls.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
