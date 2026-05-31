-- Migration 019: Supplier orders

CREATE TABLE IF NOT EXISTS supplier_orders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id   uuid        NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  supplier_id uuid        NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'delivered', 'cancelled')),
  notes       text        NULL,
  total_amount numeric     NULL,
  ordered_at  date        NOT NULL DEFAULT CURRENT_DATE,
  delivered_at date       NULL,
  created_by  uuid        NULL REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_order_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES supplier_orders(id) ON DELETE CASCADE,
  item_name   text        NOT NULL,
  quantity    int         NOT NULL DEFAULT 1,
  unit_price  numeric     NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_orders_branch_idx ON supplier_orders(branch_id);
