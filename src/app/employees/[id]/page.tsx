import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmployee, getEmployeeStats, getCalls } from "@/lib/queries";
import { StatCard } from "@/components/StatCard";
import { CallsTable } from "@/components/CallsTable";
import { fmtDuration } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const employee = await getEmployee(id);
  if (!employee) notFound();

  const [stats, { calls, total }] = await Promise.all([
    getEmployeeStats(),
    getCalls({ employeeId: id, pageSize: 100 }),
  ]);
  const stat = stats.find((s) => s.id === id);

  const answerRate =
    stat && stat.totalCalls
      ? Math.round((stat.answered / stat.totalCalls) * 100)
      : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <Link href="/" className="sub" style={{ color: "var(--slate)" }}>
            ← Overview
          </Link>
          <h1 style={{ marginTop: "0.4rem" }}>{employee.name}</h1>
          <p className="sub">
            {employee.numbers.map((num, i) => (
              <span key={num.phone}>
                {i > 0 ? " · " : ""}
                <span style={{ fontFamily: "ui-monospace, monospace" }}>
                  {num.phone}
                </span>
                {num.label || !num.isActive ? (
                  <span style={{ color: "var(--slate)" }}>
                    {" "}
                    ({[num.label, num.isActive ? null : "retired"]
                      .filter(Boolean)
                      .join(", ")})
                  </span>
                ) : null}
              </span>
            ))}
            {employee.email ? ` · ${employee.email}` : ""}
            {employee.active ? (
              <span style={{ marginLeft: "0.5rem", color: "var(--ok)" }}>
                ● active
              </span>
            ) : (
              <span style={{ marginLeft: "0.5rem", color: "var(--slate)" }}>
                ○ inactive
              </span>
            )}
          </p>
        </div>
        <Link href={`/calls?employee=${id}`} className="btn btn-secondary">
          View all calls →
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <StatCard label="Total calls" value={stat?.totalCalls ?? 0} />
        <StatCard label="Made" value={stat?.made ?? 0} />
        <StatCard label="Received" value={stat?.received ?? 0} />
        <StatCard
          label="Answered"
          value={stat?.answered ?? 0}
          sub={stat?.totalCalls ? `${answerRate}% rate` : undefined}
          tone="approved"
        />
        <StatCard label="Talk time" value={fmtDuration(stat?.talkSeconds)} />
      </div>

      <div className="section-label">
        Calls — showing {calls.length} of {total.toLocaleString()}
      </div>
      <CallsTable calls={calls} />
    </div>
  );
}
