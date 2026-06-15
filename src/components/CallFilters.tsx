"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Employee = { id: number; name: string };

// Filter bar for the calls table. Selects apply instantly; the number search
// applies on submit/Enter (debounce-free to keep it predictable). Sort params
// are preserved; any filter change resets to page 1.
export function CallFilters({
  employees,
  statuses,
}: {
  employees: Employee[];
  statuses: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("q") ?? "");
  useEffect(() => {
    setSearch(params.get("q") ?? "");
  }, [params]);

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page"); // any filter change goes back to page 1
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`);
    });
  }

  const employeeId = params.get("employee") ?? "";
  const direction = params.get("direction") ?? "";
  const status = params.get("status") ?? "";

  const activeCount =
    (employeeId ? 1 : 0) +
    (direction ? 1 : 0) +
    (status ? 1 : 0) +
    (params.get("q") ? 1 : 0);

  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: "1rem",
        marginBottom: "1.5rem",
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div className="field" style={{ marginBottom: 0, minWidth: "160px" }}>
        <label htmlFor="f-employee">Employee</label>
        <select
          id="f-employee"
          value={employeeId}
          onChange={(e) => apply({ employee: e.target.value || null })}
        >
          <option value="">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field" style={{ marginBottom: 0, minWidth: "140px" }}>
        <label htmlFor="f-direction">Direction</label>
        <select
          id="f-direction"
          value={direction}
          onChange={(e) => apply({ direction: e.target.value || null })}
        >
          <option value="">Any direction</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
      </div>

      <div className="field" style={{ marginBottom: 0, minWidth: "140px" }}>
        <label htmlFor="f-status">Status</label>
        <select
          id="f-status"
          value={status}
          onChange={(e) => apply({ status: e.target.value || null })}
        >
          <option value="">Any status</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <form
        className="field"
        style={{ marginBottom: 0, minWidth: "170px" }}
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: search.trim() || null });
        }}
      >
        <label htmlFor="f-q">Number</label>
        <input
          id="f-q"
          type="text"
          value={search}
          placeholder="from / to · Enter"
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      <button
        type="button"
        className="btn btn-secondary"
        disabled={activeCount === 0}
        onClick={() =>
          apply({ employee: null, direction: null, status: null, q: null })
        }
      >
        Reset{activeCount ? ` (${activeCount})` : ""}
      </button>
    </div>
  );
}
