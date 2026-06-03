-- Migration 028: add status, confirmed_by, confirmed_at to bookings_v2

ALTER TABLE bookings_v2
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_v2_status_idx ON bookings_v2(status) WHERE status = 'pending';
