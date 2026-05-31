-- Migration 012: Add freeze_until column to clients table

ALTER TABLE clients ADD COLUMN IF NOT EXISTS freeze_until date NULL;
