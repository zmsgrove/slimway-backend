-- Migration 013: Promo codes

CREATE TABLE IF NOT EXISTS promo_codes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id      uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code           text        NOT NULL,
  discount_type  text        NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
  discount_value numeric     NOT NULL DEFAULT 0,
  max_uses       int         NULL,
  uses_count     int         NOT NULL DEFAULT 0,
  expires_at     date        NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, code)
);

CREATE INDEX IF NOT EXISTS promo_codes_branch_id_idx ON promo_codes(branch_id);
CREATE INDEX IF NOT EXISTS promo_codes_code_idx ON promo_codes(code);
