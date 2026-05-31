-- Migration 011: FK constraints for PostgREST relationships (v1.6.3.x)

-- FK для employees.profile_id → profiles.id
ALTER TABLE employees
  ADD CONSTRAINT IF NOT EXISTS employees_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- FK для task_checklist_items.task_id → tasks.id
ALTER TABLE task_checklist_items
  ADD CONSTRAINT IF NOT EXISTS task_checklist_items_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

-- FK для task_checklist_groups.task_id → tasks.id
ALTER TABLE task_checklist_groups
  ADD CONSTRAINT IF NOT EXISTS task_checklist_groups_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
