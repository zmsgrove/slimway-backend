-- Migration 031: Add allow_cancel_within_24h to branch_settings
-- When enabled, all staff roles can cancel bookings less than 24h before start

ALTER TABLE branch_settings
  ADD COLUMN IF NOT EXISTS allow_cancel_within_24h bool NOT NULL DEFAULT false;
