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
  totalCalls: number; // calls the employee is involved in (either leg)
  made: number; // employee is the `from` leg
  received: number; // employee is the `to` leg
  answered: number;
  talkSeconds: number;
  lastCallAt: Date | null;
  // Per-direction breakdown of the employee's involved calls.
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
// they're From). `made` = outbound calls they dialed; `received` = inbound
// calls they answered. (The other party being an employee does NOT credit
// them — e.g. the caller on an inbound call isn't the one who took it.)
//
// withCallsOnly (default) drops employees with zero calls via a HAVING clause,
// so the whole list comes back in a single query with no empty rows.
export async function getEmployeeStats(
  {
    withCallsOnly = true,
    since,
  }: { withCallsOnly?: boolean; since?: Date } = {},
): Promise<EmployeeStat[]> {
  const having = withCallsOnly
    ? Prisma.sql`HAVING COUNT(c.id) > 0`
    : Prisma.empty;
  const sinceClause = since
    ? Prisma.sql`AND c.start_time >= ${since}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    Array<{
      id: bigint;
      name: string | null;
      phone_number: string | null;
      email: string | null;
      is_active: boolean;
      total_calls: bigint;
      made: bigint;
      received: bigint;
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
      COUNT(*) FILTER (WHERE c.dir_out)                                            AS made,
      COUNT(*) FILTER (WHERE c.dir_in)                                             AS received,
      COUNT(*) FILTER (WHERE lower(c.status) IN ('completed','in-progress','in-call')) AS answered,
      COALESCE(SUM(c.conversation_duration), 0)                                    AS talk_seconds,
      MAX(c.start_time)                                                            AS last_call_at,
      COUNT(*) FILTER (WHERE c.dir_in)                                             AS in_total,
      COUNT(*) FILTER (WHERE c.dir_in AND lower(c.status) IN ('completed','in-progress','in-call')) AS in_answered,
      COALESCE(SUM(c.conversation_duration) FILTER (WHERE c.dir_in), 0)            AS in_talk,
      COUNT(*) FILTER (WHERE c.dir_out)                                            AS out_total,
      COUNT(*) FILTER (WHERE c.dir_out AND lower(c.status) IN ('completed','in-progress','in-call')) AS out_answered,
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
    made: n(r.made),
    received: n(r.received),
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
  missed: number;
  talkSeconds: number;
};

export type DirectionSummary = {
  inbound: DirectionStats;
  outbound: DirectionStats;
  totalCalls: number;
};

// Company-level call stats bucketed by direction, over an optional
// [since, until) window. Used for both a window's current period and its
// preceding period (for the "X yesterday / last week / …" comparisons).
export async function getDirectionStats(
  since?: Date,
  until?: Date,
): Promise<DirectionSummary> {
  const conds: Prisma.Sql[] = [];
  if (since) conds.push(Prisma.sql`start_time >= ${since}`);
  if (until) conds.push(Prisma.sql`start_time < ${until}`);
  const blocked = blockedCallExpr();
  if (blocked) conds.push(blocked);
  const where =
    conds.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`
      : Prisma.empty;

  const buckets = await prisma.$queryRaw<
    Array<{
      bucket: string;
      total: bigint;
      answered: bigint;
      missed: bigint;
      talk_seconds: bigint;
    }>
  >`
    SELECT
      CASE
        WHEN lower(direction) IN ('inbound','incoming') THEN 'inbound'
        WHEN lower(direction) LIKE 'outbound%'          THEN 'outbound'
        ELSE 'other'
      END AS bucket,
      COUNT(*)                                                                   AS total,
      COUNT(*) FILTER (WHERE lower(status) IN ('completed','in-progress','in-call')) AS answered,
      COUNT(*) FILTER (WHERE lower(status) IN ('no-answer','missed','busy','failed')) AS missed,
      COALESCE(SUM(conversation_duration), 0)                                    AS talk_seconds
    FROM calls c
    ${where}
    GROUP BY bucket
  `;

  const empty: DirectionStats = { total: 0, answered: 0, missed: 0, talkSeconds: 0 };
  const pick = (bucket: string): DirectionStats => {
    const r = buckets.find((b) => b.bucket === bucket);
    return r
      ? {
          total: n(r.total),
          answered: n(r.answered),
          missed: n(r.missed),
          talkSeconds: n(r.talk_seconds),
        }
      : { ...empty };
  };

  return {
    inbound: pick("inbound"),
    outbound: pick("outbound"),
    totalCalls: buckets.reduce((s, b) => s + n(b.total), 0),
  };
}

export type Overview = {
  inbound: DirectionStats;
  outbound: DirectionStats;
  totalCalls: number;
  totalEmployees: number;
  activeEmployees: number;
  unmatchedCalls: number; // no employee on either leg
};

export async function getOverview(since?: Date): Promise<Overview> {
  const unmatchedSince = since
    ? Prisma.sql`AND c.start_time >= ${since}`
    : Prisma.empty;

  const [dir, employees, activeEmployees, unmatched] = await Promise.all([
    getDirectionStats(since),
    prisma.employees.count(),
    prisma.employees.count({ where: { is_active: true } }),
    prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n
      FROM calls c
      WHERE NOT EXISTS (
        SELECT 1 FROM employee_numbers en
        WHERE en.phone_key = ${FROM_KEY} OR en.phone_key = ${TO_KEY}
      )
      ${unmatchedSince}
      ${blockedCallClause()}
    `,
  ]);

  return {
    inbound: dir.inbound,
    outbound: dir.outbound,
    totalCalls: dir.totalCalls,
    totalEmployees: employees,
    activeEmployees,
    unmatchedCalls: n(unmatched[0]?.n ?? 0),
  };
}

export type OverviewWindow = {
  overview: Overview;
  employees: EmployeeStat[];
};

// Everything one time-window section needs: direction summary + per-employee
// breakdown, both scoped to `since` (undefined = all time).
export async function getOverviewWindow(since?: Date): Promise<OverviewWindow> {
  const [overview, employees] = await Promise.all([
    getOverview(since),
    getEmployeeStats({ since }),
  ]);
  return { overview, employees };
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
  duration: bigint | null;
  conversation_duration: bigint | null;
  recording_url: string | null;
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
        c.start_time, c.duration, c.conversation_duration, c.recording_url,
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
    sort,
    order,
    calls: rows.map((c) => ({
      id: n(c.id),
      exotelSid: c.exotel_sid,
      from: c.from_number,
      to: c.to_number,
      direction: c.direction,
      status: c.status,
      startTime: c.start_time,
      duration: n(c.duration),
      conversationDuration: n(c.conversation_duration),
      recordingUrl: c.recording_url,
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
