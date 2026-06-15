import Link from "next/link";
import {
  getCalls,
  getDistinctStatuses,
  getEmployeeOptions,
  CALL_SORTS,
  type CallSort,
  type SortOrder,
} from "@/lib/queries";
import { CallsTable, type SortState } from "@/components/CallsTable";
import { CallFilters } from "@/components/CallFilters";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const employeeId = one(sp.employee) ? Number(one(sp.employee)) : undefined;
  const direction = one(sp.direction) as "inbound" | "outbound" | undefined;
  const status = one(sp.status) || undefined;
  const search = one(sp.q) || undefined;
  const page = Number(one(sp.page) || "1");

  const sortParam = one(sp.sort);
  const sort: CallSort = CALL_SORTS.includes(sortParam as CallSort)
    ? (sortParam as CallSort)
    : "when";
  const order: SortOrder = one(sp.order) === "asc" ? "asc" : "desc";

  const [{ calls, total, totalPages, pageSize }, statuses, employees] =
    await Promise.all([
      getCalls({ employeeId, direction, status, search, sort, order, page }),
      getDistinctStatuses(),
      getEmployeeOptions(),
    ]);

  // Preserve all non-page params when building links.
  const currentParams = () => {
    const p = new URLSearchParams();
    if (employeeId) p.set("employee", String(employeeId));
    if (direction) p.set("direction", direction);
    if (status) p.set("status", status);
    if (search) p.set("q", search);
    if (sort !== "when") p.set("sort", sort);
    if (order !== "desc") p.set("order", order);
    return p;
  };

  const pageHref = (target: number) => {
    const p = currentParams();
    p.set("page", String(target));
    return `/calls?${p.toString()}`;
  };

  // Clicking a column: same column flips order, new column starts descending.
  const sortable: SortState = {
    sort,
    order,
    hrefFor: (col) => {
      const p = currentParams();
      const nextOrder: SortOrder =
        sort === col && order === "desc" ? "asc" : "desc";
      if (col === "when") p.delete("sort");
      else p.set("sort", col);
      if (nextOrder === "desc") p.delete("order");
      else p.set("order", nextOrder);
      p.delete("page");
      const qs = p.toString();
      return qs ? `/calls?${qs}` : "/calls";
    },
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>All calls</h1>
          <p className="sub">
            {total.toLocaleString()} calls · page {page} of {totalPages}
          </p>
        </div>
      </div>

      <CallFilters
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        statuses={statuses}
      />

      <CallsTable calls={calls} sortable={sortable} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "1rem",
        }}
      >
        <span className="sub" style={{ color: "var(--slate)" }}>
          Showing up to {pageSize} per page
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn btn-secondary">
              ← Prev
            </Link>
          ) : null}
          {page < totalPages ? (
            <Link href={pageHref(page + 1)} className="btn btn-secondary">
              Next →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
