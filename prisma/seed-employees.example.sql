-- TEMPLATE (committed). Copy to seed-employees.sql and replace with real data;
-- the real file is gitignored because it holds employee PII.
--
-- Dashboard-owned employee directory. Phone numbers do NOT live here — they
-- live solely in employee_numbers (one employee -> many numbers, each with
-- is_primary / is_active). This table is just the person.
--
-- Rebuilds from scratch (drops employee_numbers first because of its FK). Run
-- this BEFORE seed-employee-numbers.sql.

DROP TABLE IF EXISTS employee_numbers;
DROP TABLE IF EXISTS employees;

CREATE TABLE employees (
  id             BIGINT PRIMARY KEY,
  name           TEXT,
  email          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  twenty_user_id TEXT,
  emp_id         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_email ON employees (email);

INSERT INTO employees (id, name, email, is_active, twenty_user_id, emp_id, created_at) VALUES
  (1, 'Example One', 'one@example.com', TRUE, '00000000-0000-0000-0000-000000000001', 'EMP001', '2026-01-01 09:00:00'),
  (2, 'Example Two', 'two@example.com', TRUE, NULL,                                   'EMP002', '2026-01-02 09:00:00');
