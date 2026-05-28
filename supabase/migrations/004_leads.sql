-- v1.4.0 — Leads

CREATE TABLE IF NOT EXISTS leads (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id),
  full_name     text not null,
  phone         text,
  source        text default 'manual',
  status        text default 'new' check (status in ('new','in_work','waiting','success','fail')),
  assigned_to   uuid references profiles(id),
  notes         text,
  client_id     uuid references clients(id),
  created_by    uuid references profiles(id),
  archived_at   timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

CREATE TABLE IF NOT EXISTS lead_comments (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  author_id   uuid references profiles(id),
  text        text not null,
  created_at  timestamptz default now()
);

GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.lead_comments TO service_role;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_comments DISABLE ROW LEVEL SECURITY;
