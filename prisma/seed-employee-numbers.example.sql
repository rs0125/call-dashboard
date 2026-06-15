-- TEMPLATE (committed). Copy to seed-employee-numbers.sql and replace with real
-- data; the real file is gitignored because it holds employee phone numbers.
--
-- The SOLE source of truth for employee phone numbers. One employee -> many
-- numbers; calls are joined to employees through this table by phone_key
-- (last-10-digits, mirroring the Go service's normalization).
--
--   is_primary : the display number (exactly one per employee, enforced).
--   is_active  : false = retired. Retired numbers stay mapped so historical
--                calls on the old number still attribute to the employee.
--   phone_key  : generated, UNIQUE -> a number belongs to exactly one employee,
--                so each call leg resolves to at most one employee.
--
-- Run AFTER seed-employees.sql (which drops this table).

CREATE TABLE employee_numbers (
  id           BIGSERIAL PRIMARY KEY,
  employee_id  BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  phone_key    TEXT GENERATED ALWAYS AS
                 (NULLIF(right(regexp_replace(phone_number, '[^0-9]', '', 'g'), 10), '')) STORED
);

CREATE UNIQUE INDEX uq_employee_numbers_phone_key ON employee_numbers (phone_key);
-- At most one primary number per employee.
CREATE UNIQUE INDEX uq_employee_numbers_one_primary
  ON employee_numbers (employee_id) WHERE is_primary;
CREATE INDEX idx_employee_numbers_employee_id ON employee_numbers (employee_id);

INSERT INTO employee_numbers (employee_id, phone_number, is_primary, label) VALUES
  (1, '+910000000001', TRUE,  'primary'),
  (1, '+910000000011', FALSE, 'poc'),     -- example: a second line for the same employee
  (2, '+910000000002', TRUE,  'primary');
