# Exotel Calls Dashboard

A standalone **Next.js (App Router) + Prisma** dashboard showing every call
across every employee, split by inbound/outbound with per-employee stats.

It reads the **same Supabase Postgres** as `../exotel-call-service` (the Go
service) but is otherwise **fully decoupled** — it talks to the database
directly and never calls the Go HTTP API.

## Stack

- Next.js 15 (App Router, RSC) · React 19 · TypeScript
- Prisma 6 (PostgreSQL)
- **No Tailwind** — plain CSS copied verbatim from the Employee Reimbursement
  Portal's design system (`src/app/globals.css`, Manrope font, Wareongo palette).
  Keep it in sync with `../EmployeeReimbursementPortal/app/globals.css`.

## Architecture

- **The Go service owns the call schema.** It runs `AutoMigrate` over
  `contacts`, `assignments`, `calls`. The dashboard treats those as read-only
  and gets its models by introspection (`pnpm db:pull`) — never run dashboard
  migrations against them.
- **The dashboard owns two tables** (it creates/seeds only these):
  - `employees` — the person: `id, name, email, is_active, twenty_user_id,
    emp_id, created_at`. **No phone columns.**
  - `employee_numbers` — the **sole source of truth for phone numbers**
    (one employee → many): `phone_number`, generated unique `phone_key`
    (last-10-digits), `is_primary` (the display number, one per employee),
    `is_active` (retired numbers stay mapped so old calls still attribute),
    `label`.
- **Calls are joined to employees through `employee_numbers`** by the
  normalized phone key — `calls.assigned_contact_id` is unused (all NULL).
- **Attribution is by the AGENT leg, per direction** (matching the Go service's
  `assign.FromCall`): inbound → the agent is the **To** leg (answerer);
  outbound → the agent is the **From** leg (dialer). The other party being an
  employee does *not* credit them.
- **Serverless-ready (Vercel):** runtime uses the Supabase **transaction pooler
  (6543, `?pgbouncer=true`)** via `DATABASE_URL`; introspection uses the
  **direct connection (5432)** via `DIRECT_URL`.

## Setup

```bash
pnpm install
cp .env.example .env          # fill in DATABASE_URL (6543) + DIRECT_URL (5432)

# Seed the dashboard-owned tables (copy the templates, fill in real data):
cp prisma/seed-employees.example.sql        prisma/seed-employees.sql
cp prisma/seed-employee-numbers.example.sql prisma/seed-employee-numbers.sql
# edit both with real employees + numbers, then apply (employees FIRST):
npx prisma db execute --url "$DIRECT_URL" --file prisma/seed-employees.sql
npx prisma db execute --url "$DIRECT_URL" --file prisma/seed-employee-numbers.sql

pnpm db:pull                  # introspect (regenerates prisma/schema.prisma)
pnpm db:generate              # generate the Prisma client
pnpm dev                      # http://localhost:3000
```

> The real `prisma/seed-*.sql` are **gitignored** (employee PII). Only the
> `*.example.sql` templates are committed.

## Run notes

- Use **`pnpm dev`** (just that — `pnpm dev run` fails: it reads "run" as a dir).
- **Never run `pnpm build` while `pnpm dev` is running** — both write to `.next`
  and corrupt it (`__webpack_modules__[moduleId] is not a function`). To
  typecheck without touching `.next`, use `npx tsc --noEmit`. To recover a
  corrupted state: `rm -rf .next` then a single `pnpm dev`.

## Pages

| Route             | What it shows                                                              |
| ----------------- | -------------------------------------------------------------------------- |
| `/`               | Stacked time-window sections (Today → Past week → Past month → Past 6 months → All time); each window = Inbound (left) / Outbound (right) summary cards + a per-direction employee table. |
| `/calls`          | All calls — sortable columns, auto-applying filters (employee/direction/status/number), paginated. |
| `/employees/[id]` | One employee's numbers, stat cards (made/received/answered/talk), and their calls. |
| `GET /api/overview` | JSON for all time windows (direction summary + per-direction employee stats), fetched once by the overview. |

## Conventions

- **Never expose `emp_id`** (a unique internal key) in UI or API.
- **No spend/price/cost** anywhere — intentionally removed.

## Roadmap (scaffolded, not built)

1. Google login (Auth.js/NextAuth, domain allowlist) keyed off `employees.email`
   — env placeholders are in `.env.example`.
2. Click-to-call via Exotel Connect using the employee's primary number.
