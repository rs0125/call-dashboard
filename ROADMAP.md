# Calls Dashboard — Feature Roadmap

Candidate features for the Calls Dashboard, for prioritisation. Grouped by theme,
each with what it does, why it matters, rough effort, and technical notes.

## Context (where we are today)

The dashboard is a **read-only** view over the same database the Go
`exotel-call-service` writes to. Already shipped:

- **Google sign-in** with an email **whitelist** (managed in Supabase).
- **Overview** — inbound/outbound call stats across time windows (today → all time).
- **Calls table** — filter by employee, direction, status, number, and date range;
  sortable; shareable filter URLs.
- **Recording playback** — streams archived recordings inline (custom play/pause
  player), sourced from our private storage, no Exotel login needed.
- **Transcripts** — per-call conversation view (speech-to-text already runs in the
  backend).
- **Per-employee pages** — each employee's calls and stats.

**Key architectural note for all new work:** anything that *writes* data uses
new dashboard-owned tables (or external APIs). We never modify the Go service's
call/contact tables directly. This keeps the two systems cleanly separated.

---

## Priority summary

| # | Feature | Value | Effort | Notes |
|---|---------|-------|--------|-------|
| 1 | AI call summaries | High | M | Uses transcripts we already store |
| 2 | Transcript search | High | M | "Find calls mentioning X" |
| 3 | Click-to-call | High | M–L | First interactive feature |
| 4 | Missed-call / callback queue | High | S–M | Follow-up workflow |
| 5 | Call disposition tagging | Med | M | Structured outcomes |
| 6 | Trends & charts | Med | M | Time-series, heatmaps |
| 7 | Sticky audio player | Med | S | Quality-of-life |
| 8 | Saved filter views | Low–Med | S | Builds on shareable URLs |
| 9 | Whitelist admin UI | Med | M | Replaces manual SQL |
| 10 | Employee/number admin UI | Med | M | Replaces manual SQL |
| 11 | Read-only storage credentials | — | S | Security hardening |

*Effort: S = ~1 day, M = ~2–4 days, L = ~1 week+. Indicative, not committed.*

---

## 1. AI call summaries  ·  Value: High  ·  Effort: M

**What:** For each call with a transcript, generate a short AI summary — a 2-line
recap, key action items, customer sentiment, and a detected topic/category. Shown
in the conversation view; optionally generated automatically every night.

**Why it matters:** We already run speech-to-text and store full transcripts, but
nobody reads them end-to-end. Summaries turn that raw text into something a manager
can skim in seconds — spot unhappy customers, missed follow-ups, recurring themes.
This is the single biggest "unlock the data we already have" opportunity.

**How:** Send the transcript to Claude (Anthropic API). Cache the result in a new
`call_summaries` table so we only pay to summarise each call once. A "Summarise"
button for on-demand use, plus an optional nightly batch job for new calls.

**Dependencies / cost:** Anthropic API key + small per-call LLM cost (fractions of
a cent with the efficient models). New dashboard-owned table. No backend changes.

**Risks:** Transcript quality (esp. regional languages) affects summary quality.
Mitigated by showing the summary alongside the transcript, not replacing it.

---

## 2. Transcript search  ·  Value: High  ·  Effort: M

**What:** A search box that finds every call where a word or phrase was spoken —
"refund", "cancel", a product name, a competitor. Results link straight to the
call + transcript.

**Why it matters:** Today you can filter by number/employee/date, but not by what
was *said*. This is how managers actually investigate ("show me all the cancellation
calls this month").

**How:** Postgres full-text search (or trigram) over the stored transcript text.
Add it as another filter on the calls page.

**Dependencies:** A search index on the transcript column (one-time DB change).
No new services.

---

## 3. Click-to-call  ·  Value: High  ·  Effort: M–L

**What:** A "Call" button next to a customer number that dials the customer from
the logged-in employee's own line via Exotel — no copying numbers into a phone.

**Why it matters:** Turns the dashboard from a reporting tool into a working tool.
This is the natural next step now that sign-in and per-employee identity are in place.

**How:** Call Exotel's "Connect two numbers" API from the dashboard, using the
employee's primary number (already in our data) and the customer number.

**Dependencies:** Exotel API credentials + outbound-calling permission on the
account. First feature that performs an external action, so needs care around
permissions (who can call) and rate limits.

**Risks:** Outbound calling has cost and abuse considerations — gate behind the
whitelist and log every initiated call.

---

## 4. Missed-call / callback queue  ·  Value: High  ·  Effort: S–M

**What:** A focused view of inbound calls that went unanswered, sorted by recency,
so nothing slips through. Mark as "handled" once followed up.

**Why it matters:** Missed inbound calls are lost business. There's no surfacing of
them today — they're buried in the full calls list.

**How:** Filtered query on call status + direction (data we already have). The
"handled" flag needs a small dashboard-owned table. Pairs perfectly with
click-to-call (#3) for one-click follow-up.

---

## 5. Call disposition tagging  ·  Value: Med  ·  Effort: M

**What:** Let agents/managers tag a call's outcome — "interested", "callback",
"not relevant", "wrong number", etc. Filter and report on these tags.

**Why it matters:** Adds structured business meaning the raw telephony feed doesn't
have. Enables questions like "how many interested leads this week?"

**How:** New dashboard-owned `call_dispositions` table; a tag selector on each call;
tags become a filter + a breakdown on the overview.

---

## 6. Trends & charts  ·  Value: Med  ·  Effort: M

**What:** Time-series and visual analytics — calls per day, answer-rate trend over
time, busiest-hours heatmap, per-employee comparison charts.

**Why it matters:** The overview shows point-in-time totals per window but no
*trend*. Charts answer "are we improving?" and "when are we busiest?".

**How:** Aggregate queries (the data is all there) + a lightweight charting library.

---

## 7. Sticky audio player  ·  Value: Med  ·  Effort: S

**What:** Keep a recording playing while you scroll the table or open a transcript,
via a small persistent player bar, instead of playback stopping on navigation.

**Why it matters:** Quality-of-life for anyone reviewing several recordings in a row.

**How:** Lift the existing player into a persistent layout slot. UI-only.

---

## 8. Saved filter views  ·  Value: Low–Med  ·  Effort: S

**What:** Save a named set of filters ("Ravi's missed calls this week") and switch
between them quickly.

**Why it matters:** Power users re-apply the same filters constantly. Filters are
already encoded in the URL (so views are inherently shareable) — this just adds
naming + a menu on top.

**How:** Store saved views per user (small table or even browser-local to start).

---

## 9. Whitelist admin UI  ·  Value: Med  ·  Effort: M

**What:** A small admin screen to add/remove/deactivate who can sign in, instead of
editing the database by hand.

**Why it matters:** Onboarding/offboarding currently needs a developer running SQL.
An admin UI hands that to a manager.

**How:** CRUD over the existing `call_dashboard_whitelist` table, gated behind a new
"admin" role (a flag on the whitelist).

---

## 10. Employee / number admin UI  ·  Value: Med  ·  Effort: M

**What:** Manage the employee directory and their phone numbers (add a new hire,
retire an old number) from the UI.

**Why it matters:** Same as #9 — today this is seeded via SQL files. Accurate
employee↔number mapping is what makes call attribution correct, so keeping it
current matters.

**How:** CRUD over the dashboard-owned employee tables, admin-gated.

---

## 11. Read-only storage credentials  ·  Value: Hardening  ·  Effort: S

**What:** Give the dashboard its own **read-only** storage credentials, scoped to
just the recordings bucket, instead of reusing the backend's full read/write key.

**Why it matters:** The dashboard only ever *plays* recordings — it never needs
write access. A scoped read-only key limits the damage if the dashboard's
environment is ever compromised. Not a current leak (credentials aren't in source
control) — this is defence-in-depth.

**How:** Create a restricted API token in Cloudflare (read-only, single bucket),
swap it into the dashboard's environment. ~5-minute change.

---

## Suggested sequencing

1. **AI call summaries (#1)** — highest value, leverages data we already collect.
2. **Transcript search (#2)** — complements summaries; same underlying data.
3. **Click-to-call (#3) + Missed-call queue (#4)** — make it an action tool.
4. **Disposition tagging (#5)** + **Trends (#6)** — richer reporting.
5. **Admin UIs (#9, #10)** — reduce developer involvement in day-to-day ops.
6. **Polish (#7, #8)** and **hardening (#11)** — fit in alongside the above.
