-- Migration 015: Slot waitlist

CREATE TABLE IF NOT EXISTS slot_waitlist (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  client_id   uuid        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  device_type text        NOT NULL,
  date        date        NOT NULL,
  time_start  time        NULL,
  notes       text        NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS slot_waitlist_branch_date_idx ON slot_waitlist(branch_id, date);
