-- Migration 010: suppliers table (v1.6.3.x)
-- Таблица поставщиков для модуля склада (не была создана в предыдущих миграциях)

CREATE TABLE IF NOT EXISTS suppliers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name         text NOT NULL,
  contact_name text NULL,
  phone        text NULL,
  email        text NULL,
  notes        text NULL,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_branch_id_idx ON suppliers(branch_id);
