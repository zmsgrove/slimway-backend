-- Slimway CRM — Migration 002 (v1.4.x)

-- subscriptions: soft delete
alter table subscriptions
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

-- clients: status (draft from lead, active after completion)
alter table clients
  add column if not exists status text not null default 'active'
    check (status in ('active', 'draft'));

-- audit_log
create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid references branches(id),
  entity_type  text not null,
  entity_id    uuid not null,
  action       text not null,
  actor_id     uuid references auth.users(id),
  actor_name   text,
  details      jsonb,
  created_at   timestamptz default now()
);

create index if not exists audit_log_entity_id_idx on audit_log(entity_id);
create index if not exists audit_log_branch_id_idx  on audit_log(branch_id);
create index if not exists audit_log_created_at_idx on audit_log(created_at desc);
