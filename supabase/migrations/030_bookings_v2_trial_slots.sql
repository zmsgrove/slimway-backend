-- Migration 030: Add slot_3 and slot_4 schedule slot columns to bookings_v2
-- Needed for trial subscriptions that book all 4 slots simultaneously

ALTER TABLE bookings_v2
  ADD COLUMN IF NOT EXISTS slot_3_schedule_slot_id uuid REFERENCES schedule_slots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slot_4_schedule_slot_id uuid REFERENCES schedule_slots(id) ON DELETE SET NULL;
