-- Migration 014: Subscription transfers

CREATE TABLE IF NOT EXISTS subscription_transfers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  from_client_id  uuid        NOT NULL REFERENCES clients(id),
  to_client_id    uuid        NOT NULL REFERENCES clients(id),
  transferred_by  uuid        NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_transfers_subscription_id_idx ON subscription_transfers(subscription_id);
