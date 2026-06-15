-- Call Dashboard sign-in whitelist (idempotent — safe to re-run).
--
-- The SOLE authority over who may sign in. Google OAuth proves "you own this
-- email"; this table decides "this email is allowed in". An email absent here
-- (or present with is_active = false) is rejected at the OAuth callback AND on
-- every subsequent request, so flipping is_active off revokes access instantly.
--
-- This is NOT employee PII tied to call attribution (that lives in employees /
-- employee_numbers). It is purely an access-control list, so the template is
-- committed and you edit rows directly in Supabase.
--
-- Apply with the DIRECT url (port 5432), same as the seeds:
--   npx prisma db execute --url "$DIRECT_URL" --file prisma/whitelist.sql

CREATE TABLE IF NOT EXISTS call_dashboard_whitelist (
  email      TEXT PRIMARY KEY,
  name       TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Match on lower(email): Google emails are case-insensitive, and the app looks
-- rows up by the lowercased address.
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_dashboard_whitelist_email_lower
  ON call_dashboard_whitelist (lower(email));

-- Seed the people who should have access. Edit this list (or manage rows
-- directly in Supabase). ON CONFLICT keeps re-runs idempotent without clobbering
-- an is_active toggle you made by hand.
INSERT INTO call_dashboard_whitelist (email, name, is_active) VALUES
  ('raghav@wareongo.com', 'Raghav', TRUE)
ON CONFLICT (email) DO NOTHING;
