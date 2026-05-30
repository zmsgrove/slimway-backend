-- v1.6.1 — add missing columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS desired_template_id uuid;

UPDATE leads SET status_changed_at = created_at WHERE status_changed_at IS NULL;
