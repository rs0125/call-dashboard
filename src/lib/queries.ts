import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// All `id`/duration columns are Postgres int8 -> JS bigint. Coerce at the
// query boundary so the rest of the app deals in plain numbers/strings.
const n = (v: bigint | number | null | Prisma.Decimal | string): number =>
  v == null ? 0 : Number(v);

// The phone match key: strip non-digits, keep the last 10 (mirrors the Go
// service's util.NormalizePhone). employees.phone_key is a stored generated
// column with the same expression, so the join is an indexed equality. We
// normalize the call legs inline.
const FROM_KEY = Prisma.sql`right(regexp_replace(coalesce(c.from_number, ''), '[^0-9]', '', 'g'), 10)`;
const TO_KEY = Prisma.sql`right(regexp_replace(coalesce(c.to_number, ''), '[^0-9]', '', 'g'), 10)`;

// A call counts as ANSWERED iff it logged conversation time. This is the single
// source of truth for answered/missed, robust across both directions.
//
// We do NOT use the parent `status` here: Exotel marks EVERY inbound parent leg
// 'completed' the moment the call reaches the exophone/flow, even when the agent
// never picks up (no-answer, busy, or the caller hangs up during ringing). Those
// unanswered inbound calls all log conversation_duration = 0, while genuinely
// connected calls log > 0. (Outbound status agrees with this too, so the same
// rule is correct for both.) Each query aliases the call row as `c`.
const ANSWERED = Prisma.sql`coalesce(c.conversation_duration, 0) > 0`;
const NOT_ANSWERED = Prisma.sql`coalesce(c.conversation_duration, 0) = 0`;

// The outcome reason for a call that did NOT connect lives in different places
// per direction: OUTBOUND carries it on the parent `status` (no-answer / busy /
// failed), while INBOUND parent status is always 'completed', so the agent leg
// (leg2_status) holds the real reason (no-answer / canceled / busy). An empty/
// unknown agent leg (call never reached an agent) falls through to "no answer".
// Lowercased; '' when truly unknown. Each query aliases the call row as `c`.
const EFF_STATUS = Prisma.sql`lower(coalesce(
  CASE WHEN lower(c.direction) IN ('inbound','incoming')
       THEN nullif(c.leg2_status, '')
       ELSE c.status END, ''))`;

// Per-bucket count fragments over the NOT-answered calls, by effective status.
// no_answer is the catch-all (no-answer / missed / empty / anything unmapped) so
// busy + failed + canceled + no_answer == (total - answered) for any direction.
const CNT_BUSY = Prisma.sql`COUNT(*) FILTER (WHERE ${NOT_ANSWERED} AND ${EFF_STATUS} = 'busy')`;
const CNT_FAILED = Prisma.sql`COUNT(*) FILTER (WHERE ${NOT_ANSWERED} AND ${EFF_STATUS} = 'failed')`;
const CNT_CANCELED = Prisma.sql`COUNT(*) FILTER (WHERE ${NOT_ANSWERED} AND ${EFF_STATUS} = 'canceled')`;
const CNT_NO_ANSWER = Prisma.sql`COUNT(*) FILTER (WHERE ${NOT_ANSWERED} AND ${EFF_STATUS} NOT IN ('busy','failed','canceled'))`;

// Dashboard blocklist: calls touching these employees (matched by email, so it
// survives number changes) are hidden from every call view — used to suppress
// internal test traffic (e.g. Raghav's own line). Configured via
// DASHBOARD_BLOCKED_EMPLOYEE_EMAILS (comma-separated). Empty = nothing hidden.
const BLOCKED_EMAILS: string[] = (
  process.env.DASHBOARD_BLOCKED_EMPLOYEE_EMAILS ?? ""
)
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// SQL predicate (for a call aliased `c`) that is true when NEITHER leg's number
// belongs to a blocked employee. Returns null when the blocklist is empty so
// callers can skip it entirely.
function blockedCallExpr(): Prisma.Sql | null {
  if (BLOCKED_EMAILS.length === 0) return null;
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM employee_numbers en
    JOIN employees e ON e.id = en.employee_id
    WHERE lower(e.email) IN (${Prisma.join(BLOCKED_EMAILS)})
      AND (en.phone_key = ${FROM_KEY} OR en.phone_key = ${TO_KEY})
  )`;
}

// Same predicate prefixed with AND (or empty), for queries that append it to an
// existing WHERE rather than build a conditions array.
function blockedCallClause(): Prisma.Sql {
  const expr = blockedCallExpr();
  return expr ? Prisma.sql`AND ${expr}` : Prisma.empty;
}

export type EmployeeStat = {
  id: number;
  name: string;
  phoneNumber: string;
  email: string | null;
  active: boolean;
  // All counts are attributed by the AGENT leg (see the function comment below):
  // outbound calls the employee dialed + inbound calls they answered.
  totalCalls: number;
  answered: number;
  talkSeconds: number;
  lastCallAt: Date | null;
  // Per-direction breakdown. outbound.total = calls made; inbound.total =
  // calls received (these replace the former duplicate made/received fields).
  inbound: EmpDirStats;
  outbound: EmpDirStats;
};

export type EmpDirStats = {
  total: number;
  answered: number;
  talkSeconds: number;
};

// Per-employee call stats, attributed by the AGENT leg (matching the Go
// service's assign.FromCall):
//   inbound  -> the agent is the To leg (who answered)
//   outbound -> the agent is the From leg (who dialed)
// So a call is the employee's when (inbound AND they're To) OR (outbound AND
// they're From). outbound.total = calls they dialed; inbound.total = calls they
// answered. (The other party being an employee does NOT credit them — e.g. the
// caller on an inbound call isn't the one who took it.)
//
// withCallsOnly (default) drops employees with zero calls via a HAVING clause,
// so the whole list comes back in a single query with no empty rows.
// employeeId scopes the aggregation to one person (detail page).
export async function getEmployeeStats(
  {
    withCallsOnly = true,
    since,
    employeeId,
  }: { withCallsOnly?: boolean; since?: Date; employeeId?: number } = {},
): Promise<EmployeeStat[]> {
  const having = withCallsOnly
    ? Prisma.sql`HAVING COUNT(c.id) > 0`
    : Prisma.empty;
  const sinceClause = since
    ? Prisma.sql`AND c.start_time >= ${since}`
    : Prisma.empty;
  // Scope the whole aggregation to one employee (detail page) instead of the
  // entire fleet — avoids the per-employee LATERAL running for everyone.
  const employeeClause = employeeId
    ? Prisma.sql`WHERE e.id = ${employeeId}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      name: string | null;
      phone_number: string | null;
      email: string | null;
      is_active: boolean;
      total_calls: bigint;
      answered: bigint;
      talk_seconds: bigint;
      last_call_at: Date | null;
      in_total: bigint;
      in_answered: bigint;
      in_talk: bigint;
      out_total: bigint;
      out_answered: bigint;
      out_talk: bigint;
    }>
  >`
    SELECT
      e.id, e.name, e.email, e.is_active,
      (SELECT phone_number FROM employee_numbers
        WHERE employee_id = e.id AND is_primary LIMIT 1)                          AS phone_number,
      COUNT(c.id)                                                                  AS total_calls,
      COUNT(*) FILTER (WHERE ${ANSWERED})                                          AS answered,
      COALESCE(SUM(c.conversation_duration), 0)                                    AS talk_seconds,
      MAX(c.start_time)                                                            AS last_call_at,
      COUNT(*) FILTER (WHERE c.dir_in)                                             AS in_total,
      COUNT(*) FILTER (WHERE c.dir_in AND ${ANSWERED})                             AS in_answered,
      COALESCE(SUM(c.conversation_duration) FILTER (WHERE c.dir_in), 0)            AS in_talk,
      COUNT(*) FILTER (WHERE c.dir_out)                                            AS out_total,
      COUNT(*) FILTER (WHERE c.dir_out AND ${ANSWERED})                            AS out_answered,
      COALESCE(SUM(c.conversation_duration) FILTER (WHERE c.dir_out), 0)           AS out_talk
    FROM employees e
    LEFT JOIN LATERAL (
      SELECT
        c.id, c.status, c.conversation_duration, c.start_time,
        lower(c.direction) IN ('inbound','incoming') AS dir_in,
        lower(c.direction) LIKE 'outbound%'          AS dir_out
      FROM calls c
      WHERE (
              (lower(c.direction) IN ('inbound','incoming')
               AND ${TO_KEY}   IN (SELECT phone_key FROM employee_numbers WHERE employee_id = e.id))
           OR (lower(c.direction) LIKE 'outbound%'
               AND ${FROM_KEY} IN (SELECT phone_key FROM employee_numbers WHERE employee_id = e.id))
            )
            ${sinceClause}
            ${blockedCallClause()}
    ) c ON true
    ${employeeClause}
    GROUP BY e.id
    ${having}
    ORDER BY total_calls DESC, e.name ASC
  `;

  return rows.map((r) => ({
    id: n(r.id),
    name: r.name ?? "(unnamed)",
    phoneNumber: r.phone_number ?? "—",
    email: r.email,
    active: r.is_active,
    totalCalls: n(r.total_calls),
    answered: n(r.answered),
    talkSeconds: n(r.talk_seconds),
    lastCallAt: r.last_call_at,
    inbound: {
      total: n(r.in_total),
      answered: n(r.in_answered),
      talkSeconds: n(r.in_talk),
    },
    outbound: {
      total: n(r.out_total),
      answered: n(r.out_answered),
      talkSeconds: n(r.out_talk),
    },
  }));
}

export type DirectionStats = {
  total: number;
  answered: number;
  // Distinct not-answered outcomes. They sum to (total - answered).
  noAnswer: number; // rang but nobody picked up (+ unknown/abandoned-in-flow)
  busy: number; // line busy
  failed: number; // telephony failure (couldn't place/connect the call)
  canceled: number; // caller hung up before the agent connected
  talkSeconds: number;
};

export type Overview = {
  inbound: DirectionStats;
  outbound: DirectionStats;
  totalCalls: number;
  unmatchedCalls: number; // no employee on either leg
};

// One time-window's data for the overview: company direction summary +
// per-employee breakdown.
export type OverviewWindow = {
  inbound: DirectionStats;
  outbound: DirectionStats;
  totalCalls: number;
  unmatchedCalls: number;
  employees: EmployeeStat[];
};

// A time window the bundle should compute. [since, until) — null = unbounded on
// that end (e.g. "all time" = both null; "today" = since set, until null).
// isCurrent windows get the per-employee breakdown; previous-period windows
// (the "X yesterday / last week" comparisons) only need the direction summary.
export type OverviewPeriod = {
  key: string;
  since: Date | null;
  until: Date | null;
  isCurrent: boolean;
};

// Builds a SQL `VALUES (key, since, until), …` fragment for a CROSS JOIN LATERAL.
// Casting each timestamp param to timestamptz lets NULLs (unbounded ends)
// coexist with real bounds in the same column.
function periodValues(periods: OverviewPeriod[]): Prisma.Sql {
  return Prisma.join(
    periods.map(
      (p) =>
        Prisma.sql`(${p.key}, ${p.since}::timestamptz, ${p.until}::timestamptz)`,
    ),
    ", ",
  );
}

// THE overview query path — replaces the old per-window fan-out (~19 serial
// queries) with exactly TWO set-based queries, so the endpoint is robust even
// at connection_limit=1 (the Vercel/Supabase pooler default that was causing
// P2024 connection-pool timeouts). Each call is paired with every window it
// falls into via a VALUES lateral, then aggregated by window key in one pass.
//
//   Query A: company direction stats + unmatched, for ALL periods (current +
//            previous), bucketed inbound/outbound.
//   Query B: per-employee per-direction stats, for the CURRENT windows only
//            (agent-leg attribution, identical rule to getEmployeeStats).
export async function getOverviewBundle(
  periods: OverviewPeriod[],
): Promise<Record<string, OverviewWindow>> {
  const current = periods.filter((p) => p.isCurrent);

  // --- Query A: company-level direction + unmatched, all periods at once. ---
  const rowsA = await prisma.$queryRaw<
    Array<{
      window_key: string;
      bucket: string;
      total: bigint;
      answered: bigint;
      no_answer: bigint;
      busy: bigint;
      failed: bigint;
      canceled: bigint;
      talk_seconds: bigint;
      unmatched: bigint;
    }>
  >`
    SELECT
      w.key AS window_key,
      CASE
        WHEN lower(c.direction) IN ('inbound','incoming') THEN 'inbound'
        WHEN lower(c.direction) LIKE 'outbound%'          THEN 'outbound'
        ELSE 'other'
      END AS bucket,
      COUNT(*)                                                                   AS total,
      COUNT(*) FILTER (WHERE ${ANSWERED})                                         AS answered,
      ${CNT_NO_ANSWER}                                                            AS no_answer,
      ${CNT_BUSY}                                                                 AS busy,
      ${CNT_FAILED}                                                               AS failed,
      ${CNT_CANCELED}                                                             AS canceled,
      COALESCE(SUM(c.conversation_duration), 0)                                  AS talk_seconds,
      COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM employee_numbers en
        WHERE en.phone_key = ${FROM_KEY} OR en.phone_key = ${TO_KEY}
      ))                                                                         AS unmatched
    FROM calls c
    CROSS JOIN LATERAL (VALUES ${periodValues(periods)}) AS w(key, since, until)
    WHERE (w.since IS NULL OR c.start_time >= w.since)
      AND (w.until IS NULL OR c.start_time <  w.until)
      ${blockedCallClause()}
    GROUP BY w.key, bucket
  `;

  // --- Query B: per-employee per-direction, current windows only. ---
  const rowsB =
    current.length === 0
      ? []
      : await prisma.$queryRaw<
          Array<{
            id: bigint;
            name: string | null;
            email: string | null;
            is_active: boolean;
            phone_number: string | null;
            window_key: string;
            in_total: bigint;
            in_answered: bigint;
            in_talk: bigint;
            out_total: bigint;
            out_answered: bigint;
            out_talk: bigint;
            last_call_at: Date | null;
          }>
        >`
    SELECT
      e.id, e.name, e.email, e.is_active,
      (SELECT phone_number FROM employee_numbers
        WHERE employee_id = e.id AND is_primary LIMIT 1)                          AS phone_number,
      w.key AS window_key,
      COUNT(*) FILTER (WHERE c.dir_in)                                            AS in_total,
      COUNT(*) FILTER (WHERE c.dir_in AND ${ANSWERED})                             AS in_answered,
      COALESCE(SUM(c.conversation_duration) FILTER (WHERE c.dir_in), 0)           AS in_talk,
      COUNT(*) FILTER (WHERE c.dir_out)                                           AS out_total,
      COUNT(*) FILTER (WHERE c.dir_out AND ${ANSWERED})                            AS out_answered,
      COALESCE(SUM(c.conversation_duration) FILTER (WHERE c.dir_out), 0)          AS out_talk,
      MAX(c.start_time)                                                           AS last_call_at
    FROM employees e
    JOIN LATERAL (
      SELECT
        c.status, c.conversation_duration, c.start_time,
        lower(c.direction) IN ('inbound','incoming') AS dir_in,
        lower(c.direction) LIKE 'outbound%'          AS dir_out
      FROM calls c
      WHERE (
              (lower(c.direction) IN ('inbound','incoming')
               AND ${TO_KEY}   IN (SELECT phone_key FROM employee_numbers WHERE employee_id = e.id))
           OR (lower(c.direction) LIKE 'outbound%'
               AND ${FROM_KEY} IN (SELECT phone_key FROM employee_numbers WHERE employee_id = e.id))
            )
            ${blockedCallClause()}
    ) c ON true
    CROSS JOIN LATERAL (VALUES ${periodValues(current)}) AS w(key, since, until)
    WHERE (w.since IS NULL OR c.start_time >= w.since)
      AND (w.until IS NULL OR c.start_time <  w.until)
    GROUP BY e.id, w.key
  `;

  // Assemble: one OverviewWindow per period key.
  const result: Record<string, OverviewWindow> = {};
  const empty: DirectionStats = {
    total: 0,
    answered: 0,
    noAnswer: 0,
    busy: 0,
    failed: 0,
    canceled: 0,
    talkSeconds: 0,
  };
  for (const p of periods) {
    result[p.key] = {
      inbound: { ...empty },
      outbound: { ...empty },
      totalCalls: 0,
      unmatchedCalls: 0,
      employees: [],
    };
  }

  for (const r of rowsA) {
    const win = result[r.window_key];
    if (!win) continue;
    win.totalCalls += n(r.total);
    win.unmatchedCalls += n(r.unmatched);
    const stats: DirectionStats = {
      total: n(r.total),
      answered: n(r.answered),
      noAnswer: n(r.no_answer),
      busy: n(r.busy),
      failed: n(r.failed),
      canceled: n(r.canceled),
      talkSeconds: n(r.talk_seconds),
    };
    if (r.bucket === "inbound") win.inbound = stats;
    else if (r.bucket === "outbound") win.outbound = stats;
    // 'other' contributes to totalCalls/unmatched only (no column rendered).
  }

  for (const r of rowsB) {
    const win = result[r.window_key];
    if (!win) continue;
    win.employees.push({
      id: n(r.id),
      name: r.name ?? "(unnamed)",
      phoneNumber: r.phone_number ?? "—",
      email: r.email,
      active: r.is_active,
      totalCalls: n(r.in_total) + n(r.out_total),
      answered: n(r.in_answered) + n(r.out_answered),
      talkSeconds: n(r.in_talk) + n(r.out_talk),
      lastCallAt: r.last_call_at,
      inbound: {
        total: n(r.in_total),
        answered: n(r.in_answered),
        talkSeconds: n(r.in_talk),
      },
      outbound: {
        total: n(r.out_total),
        answered: n(r.out_answered),
        talkSeconds: n(r.out_talk),
      },
    });
  }

  // Stable order within each window (the per-direction tables re-sort anyway).
  for (const win of Object.values(result)) {
    win.employees.sort(
      (a, b) => b.totalCalls - a.totalCalls || a.name.localeCompare(b.name),
    );
  }

  return result;
}

export const CALL_SORTS = [
  "when",
  "from",
  "to",
  "direction",
  "status",
  "talk",
] as const;
export type CallSort = (typeof CALL_SORTS)[number];
export type SortOrder = "asc" | "desc";

// Maps a sort key to its SQL column. Whitelisted (no string interpolation of
// user input into SQL).
const SORT_COLUMN: Record<CallSort, Prisma.Sql> = {
  when: Prisma.sql`c.start_time`,
  from: Prisma.sql`c.from_number`,
  to: Prisma.sql`c.to_number`,
  direction: Prisma.sql`c.direction`,
  status: Prisma.sql`c.status`,
  talk: Prisma.sql`c.conversation_duration`,
};

export type CallFilters = {
  employeeId?: number;
  direction?: "inbound" | "outbound";
  status?: string;
  search?: string; // matches from/to number
  dateFrom?: Date; // start_time >= this instant
  dateUntil?: Date; // start_time < this instant (exclusive upper bound)
  sort?: CallSort;
  order?: SortOrder;
  page?: number;
  pageSize?: number;
};

type RawCallRow = {
  id: bigint;
  exotel_sid: string;
  from_number: string | null;
  to_number: string | null;
  direction: string | null;
  status: string | null;
  start_time: Date | null;
  conversation_duration: bigint | null;
  recording_r2_key: string | null;
  has_transcript: boolean;
  from_emp_id: bigint | null;
  from_emp_name: string | null;
  to_emp_id: bigint | null;
  to_emp_name: string | null;
};

export async function getCalls(filters: CallFilters = {}) {
  const pageSize = Math.min(filters.pageSize ?? 50, 200);
  const page = Math.max(filters.page ?? 1, 1);

  const conds: Prisma.Sql[] = [];
  if (filters.status) conds.push(Prisma.sql`c.status = ${filters.status}`);
  if (filters.direction === "inbound")
    conds.push(Prisma.sql`lower(c.direction) IN ('inbound','incoming')`);
  if (filters.direction === "outbound")
    conds.push(Prisma.sql`lower(c.direction) LIKE 'outbound%'`);
  if (filters.dateFrom)
    conds.push(Prisma.sql`c.start_time >= ${filters.dateFrom}`);
  if (filters.dateUntil)
    conds.push(Prisma.sql`c.start_time < ${filters.dateUntil}`);
  if (filters.search) {
    const like = `%${filters.search}%`;
    conds.push(
      Prisma.sql`(c.from_number LIKE ${like} OR c.to_number LIKE ${like})`,
    );
  }
  // Agent-leg attribution (same rule as getEmployeeStats): an employee "owns"
  // an inbound call when they're the To leg, an outbound call when From.
  if (filters.employeeId)
    conds.push(
      Prisma.sql`(
        (lower(c.direction) IN ('inbound','incoming') AND et.id = ${filters.employeeId})
        OR (lower(c.direction) LIKE 'outbound%' AND ef.id = ${filters.employeeId})
      )`,
    );

  const blocked = blockedCallExpr();
  if (blocked) conds.push(blocked);

  const where =
    conds.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`
      : Prisma.empty;

  // Resolve each leg to an employee THROUGH employee_numbers (a number belongs
  // to one employee). ef = employee on the `from` leg, et = on the `to` leg.
  const joins = Prisma.sql`
    FROM calls c
    LEFT JOIN employee_numbers enf ON enf.phone_key = ${FROM_KEY}
    LEFT JOIN employees ef ON ef.id = enf.employee_id
    LEFT JOIN employee_numbers ent ON ent.phone_key = ${TO_KEY}
    LEFT JOIN employees et ON et.id = ent.employee_id
    ${where}
  `;

  const sort: CallSort = filters.sort ?? "when";
  const order = filters.order === "asc" ? "asc" : "desc";
  const dir = order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  // Stable tiebreak on id so equal sort values page deterministically.
  const orderBy = Prisma.sql`ORDER BY ${SORT_COLUMN[sort]} ${dir} NULLS LAST, c.id ${dir}`;

  const [rows, totalRows] = await Promise.all([
    prisma.$queryRaw<RawCallRow[]>`
      SELECT
        c.id, c.exotel_sid, c.from_number, c.to_number, c.direction, c.status,
        c.start_time, c.conversation_duration,
        NULLIF(c.recording_r2_key, '') AS recording_r2_key,
        (c.transcript IS NOT NULL) AS has_transcript,
        ef.id AS from_emp_id, ef.name AS from_emp_name,
        et.id AS to_emp_id, et.name AS to_emp_name
      ${joins}
      ${orderBy}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `,
    prisma.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n ${joins}`,
  ]);

  const total = n(totalRows[0]?.n ?? 0);

  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    calls: rows.map((c) => ({
      id: n(c.id),
      exotelSid: c.exotel_sid,
      from: c.from_number,
      to: c.to_number,
      direction: c.direction,
      status: c.status,
      startTime: c.start_time,
      conversationDuration: n(c.conversation_duration),
      // Play via our own endpoint (presigned R2), not the auth-walled Exotel URL.
      // Null until the Go service has archived the recording to R2.
      recordingUrl: c.recording_r2_key
        ? `/api/calls/${n(c.id)}/recording`
        : null,
      hasTranscript: c.has_transcript,
      fromEmployee: c.from_emp_id
        ? { id: n(c.from_emp_id), name: c.from_emp_name }
        : null,
      toEmployee: c.to_emp_id
        ? { id: n(c.to_emp_id), name: c.to_emp_name }
        : null,
    })),
  };
}

export type CallRow = Awaited<ReturnType<typeof getCalls>>["calls"][number];

// Minimal employee list ({id, name}) for the calls-page filter dropdown. Only
// lists employees attributed (by the AGENT leg, same rule as getCalls) to at
// least one non-blocked call, so every option yields results when selected —
// no empty dropdown entries. Cheap: one indexed pass over calls (DISTINCT on
// the agent-leg employee), not the heavy per-employee aggregation.
export async function getEmployeeOptions(): Promise<
  Array<{ id: number; name: string }>
> {
  const rows = await prisma.$queryRaw<Array<{ id: bigint; name: string | null }>>`
    SELECT DISTINCT e.id, e.name
    FROM calls c
    JOIN employee_numbers en ON en.phone_key = CASE
      WHEN lower(c.direction) IN ('inbound','incoming') THEN ${TO_KEY}
      WHEN lower(c.direction) LIKE 'outbound%'          THEN ${FROM_KEY}
    END
    JOIN employees e ON e.id = en.employee_id
    WHERE TRUE ${blockedCallClause()}
    ORDER BY e.name ASC
  `;
  return rows.map((e) => ({ id: n(e.id), name: e.name ?? "(unnamed)" }));
}

// Distinct statuses present in the data — powers the filter dropdown.
export async function getDistinctStatuses(): Promise<string[]> {
  const rows = await prisma.calls.findMany({
    where: { status: { not: null } },
    distinct: ["status"],
    select: { status: true },
    orderBy: { status: "asc" },
  });
  return rows.map((r) => r.status!).filter(Boolean);
}

export type TranscriptSegment = {
  speaker: string;
  start: number;
  end: number;
  text: string;
};

export type CallTranscript = {
  method: string; // "dual-channel" | "diarization"
  model: string;
  channels: number;
  source: string;
  languageCode: string;
  text: string;
  segments: TranscriptSegment[];
  transcribedAt: string | null;
};

// The R2 object key for a call's archived recording (set by the Go service's
// archiver). Null/empty when the recording hasn't been archived to R2 yet.
// GORM stores unset strings as '' rather than NULL, so treat '' as absent.
export async function getRecordingKey(id: number): Promise<string | null> {
  const row = await prisma.calls.findUnique({
    where: { id },
    select: { recording_r2_key: true },
  });
  const key = row?.recording_r2_key;
  return key ? key : null;
}

// Fetches one call's stored transcript (written by the Go STT pipeline into the
// calls.transcript jsonb). Returns null when the call has no transcript yet.
export async function getCallTranscript(
  id: number,
): Promise<CallTranscript | null> {
  const row = await prisma.calls.findUnique({
    where: { id },
    select: { transcript: true },
  });
  const t = row?.transcript as Record<string, unknown> | null | undefined;
  if (!t) return null;
  const segments = Array.isArray(t.segments)
    ? (t.segments as TranscriptSegment[])
    : [];
  return {
    method: String(t.method ?? ""),
    model: String(t.model ?? ""),
    channels: Number(t.channels ?? 0),
    source: String(t.source ?? ""),
    languageCode: String(t.language_code ?? ""),
    text: String(t.text ?? ""),
    segments,
    transcribedAt: t.transcribed_at ? String(t.transcribed_at) : null,
  };
}

export async function getEmployee(id: number) {
  const e = await prisma.employees.findUnique({
    where: { id },
    include: {
      employee_numbers: { orderBy: [{ is_primary: "desc" }, { label: "asc" }] },
    },
  });
  if (!e) return null;
  return {
    id: n(e.id),
    name: e.name ?? "(unnamed)",
    email: e.email,
    twentyUserId: e.twenty_user_id,
    active: e.is_active,
    createdAt: e.created_at,
    numbers: e.employee_numbers.map((num) => ({
      phone: num.phone_number,
      label: num.label,
      isPrimary: num.is_primary,
      isActive: num.is_active,
    })),
  };
}
