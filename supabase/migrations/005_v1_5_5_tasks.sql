-- v1.5.5: tasks status + checklist groups

-- 1. Extend tasks status constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('new', 'today', 'week', 'long', 'done', 'closed', 'pending_close'));

-- 2. Checklist groups
CREATE TABLE IF NOT EXISTS task_checklist_groups (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Add group_id to checklist items
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES task_checklist_groups(id) ON DELETE SET NULL;
