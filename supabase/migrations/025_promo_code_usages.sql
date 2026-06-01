-- Migration 025: promo_code_usages + max_uses_per_client column

ALTER TABLE promo_codes
  ADD COLUMN IF NOT EXISTS max_uses_per_client int NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS promo_code_usages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id  uuid        NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  client_id      uuid        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promo_code_usages_promo_code_id_idx ON promo_code_usages(promo_code_id);
CREATE INDEX IF NOT EXISTS promo_code_usages_client_id_idx     ON promo_code_usages(client_id);
