-- Migration 017: Task recurring + module linking

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_type text NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS related_id   uuid NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recur_rule   text NULL CHECK (recur_rule IN ('daily', 'weekly', 'monthly'));
