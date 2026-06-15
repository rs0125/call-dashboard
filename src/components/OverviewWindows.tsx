"use client";

import { useEffect, useState } from "react";
import type { EmployeeStat, DirectionStats } from "@/lib/queries";
import { DirectionBreakdown } from "./DirectionBreakdown";

type Window = {
  key: string;
  title: string;
  prevLabel: string | null;
  previous: { inbound: DirectionStats; outbound: DirectionStats } | null;
  overview: {
    inbound: DirectionStats;
    outbound: DirectionStats;
    totalCalls: number;
    unmatchedCalls: number;
  };
  employees: EmployeeStat[];
};

// Fetches every time window once from /api/overview, then renders one
// accordion section per window (Today → Past week → Past month → Past 6 months
// → All time). Today is open by default; the rest reveal on click.
export function OverviewWindows() {
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set(["today"]));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/overview")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => !cancelled && setWindows(d.windows as Window[]))
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (error) {
    return (
      <div className="card" style={{ color: "var(--bad)" }}>
        Failed to load overview: {error}
      </div>
    );
  }

  if (!windows) {
    return (
      <div style={{ display: "grid", gap: "1rem" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card">
            <span className="skeleton skeleton-line short" />
            <span className="skeleton skeleton-block" style={{ marginTop: "0.75rem" }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {windows.map((w) => {
        const isOpen = openKeys.has(w.key);
        return (
          <section key={w.key}>
            <button
              type="button"
              onClick={() => toggle(w.key)}
              aria-expanded={isOpen}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "0.75rem",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                borderBottom: "var(--stroke) solid var(--blue)",
                padding: "0.3rem 0.1rem 0.5rem",
                cursor: "pointer",
                color: "var(--blue)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  transition: "transform 0.15s ease",
                  transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  fontSize: "0.8rem",
                  lineHeight: 1,
                }}
              >
                ▶
              </span>
              <h2 style={{ margin: 0 }}>{w.title}</h2>
              <span style={{ color: "var(--slate)", fontSize: "0.85rem", fontWeight: 500 }}>
                {w.overview.totalCalls.toLocaleString()} calls
                {w.overview.unmatchedCalls > 0
                  ? ` · ${w.overview.unmatchedCalls} external`
                  : ""}
              </span>
            </button>

            {isOpen ? (
              <div style={{ marginTop: "1.1rem" }}>
                <DirectionBreakdown
                  inbound={w.overview.inbound}
                  outbound={w.overview.outbound}
                  employees={w.employees}
                  previous={w.previous}
                  prevLabel={w.prevLabel}
                />
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
