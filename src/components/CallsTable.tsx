import Link from "next/link";
import type { CallRow, CallSort, SortOrder } from "@/lib/queries";
import { StatusBadge, DirectionBadge } from "./Badge";
import { ConversationButton } from "./ConversationModal";
import { fmtDateTime, fmtDuration, directionLabel } from "@/lib/format";

export type SortState = {
  sort: CallSort;
  order: SortOrder;
  hrefFor: (col: CallSort) => string;
};

function Leg({
  number,
  employee,
}: {
  number: string | null;
  employee: { id: number; name: string | null } | null;
}) {
  return (
    <div>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.82rem" }}>
        {number ?? "—"}
      </div>
      {employee ? (
        <Link
          href={`/employees/${employee.id}`}
          style={{ fontSize: "0.78rem", fontWeight: 600 }}
        >
          {employee.name ?? "employee"}
        </Link>
      ) : (
        <div style={{ fontSize: "0.78rem", color: "var(--slate)" }}>external</div>
      )}
    </div>
  );
}

// A header cell. When `sortable` + `col` are given it renders a sort link with
// an active ↑/↓ indicator; otherwise it's a plain label.
function Th({
  label,
  col,
  sortable,
  num,
}: {
  label: string;
  col?: CallSort;
  sortable?: SortState;
  num?: boolean;
}) {
  const className = num ? "num" : undefined;
  if (!col || !sortable) return <th className={className}>{label}</th>;

  const active = sortable.sort === col;
  const arrow = active ? (sortable.order === "asc" ? " ↑" : " ↓") : "";
  return (
    <th className={className}>
      <Link
        href={sortable.hrefFor(col)}
        style={{
          color: active ? "var(--blue)" : "var(--slate)",
          fontWeight: active ? 700 : 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        <span style={{ opacity: active ? 1 : 0.4 }}>{arrow || " ⇅"}</span>
      </Link>
    </th>
  );
}

export function CallsTable({
  calls,
  sortable,
}: {
  calls: CallRow[];
  sortable?: SortState;
}) {
  return (
    <div className="card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="admin-table">
        <thead>
          <tr>
            <Th label="Direction" col="direction" sortable={sortable} />
            <Th label="From" col="from" sortable={sortable} />
            <Th label="To" col="to" sortable={sortable} />
            <Th label="When" col="when" sortable={sortable} />
            <Th label="Status" col="status" sortable={sortable} />
            <Th label="Talk" col="talk" sortable={sortable} num />
            <th>Rec</th>
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => (
            <tr key={c.id}>
              <td>
                <DirectionBadge label={directionLabel(c.direction)} />
              </td>
              <td>
                <Leg number={c.from} employee={c.fromEmployee} />
              </td>
              <td>
                <Leg number={c.to} employee={c.toEmployee} />
              </td>
              <td style={{ whiteSpace: "nowrap", color: "var(--slate)" }}>
                {fmtDateTime(c.startTime)}
              </td>
              <td>
                <StatusBadge status={c.status} />
              </td>
              <td className="num">{fmtDuration(c.conversationDuration)}</td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  {c.recordingUrl ? (
                    <a href={c.recordingUrl} target="_blank" rel="noopener noreferrer">
                      ▶ play
                    </a>
                  ) : (
                    <span style={{ color: "var(--slate)" }}>—</span>
                  )}
                  {c.hasTranscript ? <ConversationButton call={c} /> : null}
                </div>
              </td>
            </tr>
          ))}
          {calls.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                style={{ textAlign: "center", color: "var(--slate)", padding: "2rem" }}
              >
                No calls match these filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
