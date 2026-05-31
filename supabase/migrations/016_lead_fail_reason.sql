-- Migration 016: Lead fail reason

ALTER TABLE leads ADD COLUMN IF NOT EXISTS fail_reason text NULL;
