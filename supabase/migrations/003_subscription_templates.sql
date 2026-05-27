-- Slimway CRM — Migration 003
-- v1.2.1 — Subscription Templates

create table subscription_templates (
  id                    uuid primary key default gen_random_uuid(),
  branch_id             uuid not null references branches(id) on delete cascade,
  name                  text not null,
  slot_1_type           text not null check (slot_1_type in ('vacuactiv','rollshape','infrastep','infrashape')),
  slot_1_duration_min   int  not null,
  slot_1_sessions_total int  not null,
  slot_2_type           text check (slot_2_type in ('vacuactiv','rollshape','infrastep','infrashape')),
  slot_2_duration_min   int,
  slot_2_sessions_total int,
  validity_days         int  not null default 30,
  price                 numeric(10,2),
  is_active             boolean not null default true,
  created_at            timestamptz default now()
);

create index subscription_templates_branch_idx on subscription_templates(branch_id);
alter table subscription_templates enable row level security;
