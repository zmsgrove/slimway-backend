-- Migration 024: API Keys table
-- v1.6.5b — REST API Keys для внешних интеграций

CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name         text NOT NULL,
  key_hash     text NOT NULL UNIQUE,
  key_prefix   text NOT NULL,
  scopes       jsonb NOT NULL DEFAULT '[]',
  is_active    bool NOT NULL DEFAULT true,
  last_used_at timestamptz NULL,
  expires_at   timestamptz NULL,
  created_by   uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_keys_branch_id_idx ON api_keys(branch_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx  ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_keys_is_active_idx ON api_keys(is_active);
