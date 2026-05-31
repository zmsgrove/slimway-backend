-- 022_automation_rules.sql — v1.6.9
CREATE TABLE IF NOT EXISTS automation_rules (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  trigger_type        text        NOT NULL,
  trigger_value       text        NULL,
  action_type         text        NOT NULL DEFAULT 'create_task',
  task_title_template text        NOT NULL,
  task_priority       text        NOT NULL DEFAULT 'medium',
  assign_to_role      text        NULL,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_branch ON automation_rules(branch_id);
