-- Migration 026: add is_auto flag to tasks

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_auto boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tasks_is_auto_idx ON tasks(is_auto) WHERE is_auto = true;
