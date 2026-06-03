-- Migration 032: Soft delete for subscription_templates + finish_slot
-- finish_slot: 1-4, designates which slot is the "finish device" in a booking

ALTER TABLE subscription_templates
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE subscription_templates
  ADD COLUMN IF NOT EXISTS finish_slot int NULL CHECK (finish_slot IN (1, 2, 3, 4));

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS finish_slot int NULL CHECK (finish_slot IN (1, 2, 3, 4));
