-- 023_timesheet.sql — v1.6.9
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  employee_id uuid        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending',
  hours       numeric(5,2) NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, employee_id, date)
);

CREATE INDEX IF NOT EXISTS idx_timesheet_branch_date ON timesheet_entries(branch_id, date);
