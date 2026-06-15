"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Employee = { id: number; name: string };

const IST_MS = 5.5 * 60 * 60 * 1000;

// Today (or `daysAgo` before) as a YYYY-MM-DD calendar date at IST — matches the
// IST day boundaries the server applies to the from/to params.
function istDateStr(daysAgo = 0): string {
  const d = new Date(Date.now() + IST_MS);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Filter bar for the calls table. Selects + dates apply instantly; the number
// search applies on submit/Enter. Sort params are preserved; any filter change
// resets to page 1. Active filters are echoed as removable chips below.
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
  const q = params.get("q") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const employeeName = (id: string) =>
    employees.find((e) => String(e.id) === id)?.name ?? `#${id}`;

  // Which preset (if any) the current from/to matches, for active highlighting.
  const presets: { label: string; days: number }[] = [
    { label: "Today", days: 0 },
    { label: "7d", days: 6 },
    { label: "30d", days: 29 },
  ];
  const activePreset = presets.find(
    (p) => from === istDateStr(p.days) && to === istDateStr(0),
  );

  // Active-filter chips: [param keys, human label].
  const chips: { keys: Record<string, null>; label: string }[] = [];
  if (employeeId)
    chips.push({ keys: { employee: null }, label: `Employee: ${employeeName(employeeId)}` });
  if (direction)
    chips.push({ keys: { direction: null }, label: direction === "inbound" ? "Inbound" : "Outbound" });
  if (status) chips.push({ keys: { status: null }, label: `Status: ${status}` });
  if (q) chips.push({ keys: { q: null }, label: `No. “${q}”` });
  if (from || to)
    chips.push({
      keys: { from: null, to: null },
      label:
        activePreset?.label ??
        `${from || "…"} → ${to || "…"}`,
    });

  const activeCount = chips.length;

  const resetAll = () =>
    apply({ employee: null, direction: null, status: null, q: null, from: null, to: null });

  return (
    <div
      className="card filters"
      style={{
        marginBottom: "1.5rem",
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      <div className="filters-head">
        <div className="filters-title">
          <FunnelIcon />
          <span>Filters</span>
          {activeCount > 0 ? <span className="filters-count">{activeCount}</span> : null}
        </div>
        <button
          type="button"
          className="btn-icon"
          disabled={activeCount === 0}
          onClick={resetAll}
          style={{ color: activeCount === 0 ? "var(--slate)" : "var(--bad)" }}
        >
          Clear all
        </button>
      </div>

      <div className="filters-grid">
        <div className="field">
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

        <div className="field">
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

        <div className="field">
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
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q: search.trim() || null });
          }}
        >
          <label htmlFor="f-q">Number</label>
          <div className="input-icon">
            <SearchIcon />
            <input
              id="f-q"
              type="text"
              value={search}
              placeholder="from / to · Enter"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </form>

        <div className="field field-daterange">
          <label>Date range</label>
          <div className="date-range">
            <div className="date-field">
              <label htmlFor="f-from" className="date-label">
                From
              </label>
              <input
                id="f-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => apply({ from: e.target.value || null })}
              />
            </div>
            <div className="date-field">
              <label htmlFor="f-to" className="date-label">
                To
              </label>
              <input
                id="f-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => apply({ to: e.target.value || null })}
              />
            </div>
            <div className="preset-row">
              {presets.map((p) => {
                const on = activePreset?.label === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={`preset-btn${on ? " on" : ""}`}
                    aria-pressed={on}
                    onClick={() =>
                      apply({ from: istDateStr(p.days), to: istDateStr(0) })
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {activeCount > 0 ? (
        <div className="chips">
          {chips.map((c) => (
            <span key={c.label} className="chip">
              {c.label}
              <button
                type="button"
                aria-label={`Remove ${c.label}`}
                onClick={() => apply(c.keys)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FunnelIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
