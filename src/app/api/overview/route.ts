import { NextResponse } from "next/server";
import { getOverviewBundle, type OverviewPeriod } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";

// One endpoint, fetched once by the overview, returning every time window
// (current period + the matching previous period for "X yesterday / last
// week / …" comparisons) so the page renders all sections from one round trip.
export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;
const IST_OFFSET = 5.5 * 60 * 60 * 1000; // Asia/Kolkata = UTC+5:30

// Start of the IST day `daysAgo` days back, returned as a UTC instant.
function istMidnight(now: Date, daysAgo = 0): Date {
  const ist = new Date(now.getTime() + IST_OFFSET);
  const istMid = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() - daysAgo,
  );
  return new Date(istMid - IST_OFFSET);
}

export async function GET() {
  // Layouts don't guard route handlers — enforce the session here too.
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayMid = istMidnight(now);

  // since = start of current window; prev = the equivalent preceding period
  // [prevSince, prevUntil) used for the comparison line.
  const windows = [
    {
      key: "today",
      title: "Today",
      since: todayMid,
      prevLabel: "yesterday",
      prevSince: istMidnight(now, 1),
      prevUntil: todayMid,
    },
    {
      key: "week",
      title: "Past week",
      since: new Date(now.getTime() - 7 * DAY),
      prevLabel: "last week",
      prevSince: new Date(now.getTime() - 14 * DAY),
      prevUntil: new Date(now.getTime() - 7 * DAY),
    },
    {
      key: "month",
      title: "Past month",
      since: new Date(now.getTime() - 30 * DAY),
      prevLabel: "last month",
      prevSince: new Date(now.getTime() - 60 * DAY),
      prevUntil: new Date(now.getTime() - 30 * DAY),
    },
    {
      key: "halfYear",
      title: "Past 6 months",
      since: new Date(now.getTime() - 182 * DAY),
      prevLabel: "prev 6 months",
      prevSince: new Date(now.getTime() - 364 * DAY),
      prevUntil: new Date(now.getTime() - 182 * DAY),
    },
    {
      key: "all",
      title: "All time",
      since: undefined,
      prevLabel: null,
      prevSince: undefined,
      prevUntil: undefined,
    },
  ] as const;

  // Flatten every window into periods for the consolidated 2-query bundle:
  // each current window + its previous-comparison period (keyed `<key>_prev`).
  // Current windows get the per-employee breakdown; previous ones are summary
  // only (isCurrent: false).
  const periods: OverviewPeriod[] = [];
  for (const w of windows) {
    periods.push({ key: w.key, since: w.since ?? null, until: null, isCurrent: true });
    if (w.prevSince) {
      periods.push({
        key: `${w.key}_prev`,
        since: w.prevSince,
        until: w.prevUntil,
        isCurrent: false,
      });
    }
  }

  const bundle = await getOverviewBundle(periods);

  const data = windows.map((w) => {
    const cur = bundle[w.key];
    const prev = w.prevSince ? bundle[`${w.key}_prev`] : null;
    return {
      key: w.key,
      title: w.title,
      prevLabel: w.prevLabel,
      previous: prev
        ? { inbound: prev.inbound, outbound: prev.outbound }
        : null,
      overview: {
        inbound: cur.inbound,
        outbound: cur.outbound,
        totalCalls: cur.totalCalls,
        unmatchedCalls: cur.unmatchedCalls,
      },
      employees: cur.employees,
    };
  });

  return NextResponse.json({ windows: data });
}
