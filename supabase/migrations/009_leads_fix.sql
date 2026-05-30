-- 009_leads_fix.sql
-- v1.6.2.x: Fix leads.assigned_to FK (should store profile_id, not employee_id)
-- and ensure permission_overrides table exists

-- Drop FK constraint on leads.assigned_to (was pointing to employees.id)
-- After this, assigned_to stores profile_id (UUID), validated at backend level
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;

-- Ensure permission_overrides table exists (migration 008 may not have been applied)
CREATE TABLE IF NOT EXISTS permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  state text NOT NULL CHECK (state IN ('allow','deny','locked')),
  set_by text NOT NULL,
  branch_id uuid NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, resource, action, branch_id)
);
