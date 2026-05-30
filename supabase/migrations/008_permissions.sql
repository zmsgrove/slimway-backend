-- Migration 008: permission_overrides table (v1.6.2)

CREATE TABLE IF NOT EXISTS permission_overrides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role       text NOT NULL,
  resource   text NOT NULL,
  action     text NOT NULL,
  state      text NOT NULL CHECK (state IN ('allow','deny','locked')),
  set_by     text NOT NULL,
  branch_id  uuid NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, resource, action, branch_id)
);

-- locked state validation is enforced at the backend level, not via constraint
