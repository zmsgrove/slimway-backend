-- Slimway CRM — Migration 001
-- v1.0.0 initial schema

-- Расширения
create extension if not exists "uuid-ossp";

-- =====================
-- BRANCHES (филиалы)
-- =====================
create table branches (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  city          text,
  owner_id      uuid references auth.users(id),
  is_franchise  boolean default false,
  created_at    timestamptz default now()
);

-- =====================
-- PROFILES (пользователи)
-- =====================
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  branch_id   uuid references branches(id),
  role        text not null check (role in ('owner','franchisee','admin','trainer')),
  full_name   text,
  phone       text,
  created_at  timestamptz default now()
);

-- Автосоздание профиля при регистрации
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, role)
  values (
    new.id,
    coalesce(new.raw_app_meta_data->>'role', 'admin')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =====================
-- CLIENTS (клиенты)
-- =====================
create table clients (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id),
  full_name   text not null,
  phone       text,
  email       text,
  birth_date  date,
  notes       text,
  is_deleted  boolean default false,
  created_at  timestamptz default now()
);

create index clients_branch_id_idx on clients(branch_id);
create index clients_full_name_idx on clients using gin(to_tsvector('russian', full_name));

-- =====================
-- MEMBERSHIPS (абонементы)
-- =====================
create table memberships (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  branch_id       uuid not null references branches(id),
  type            text not null check (type in ('sessions', 'unlimited', 'period')),
  total_sessions  int,
  used_sessions   int default 0,
  start_date      date not null,
  end_date        date,
  price           numeric(10,2),
  status          text default 'active' check (status in ('active', 'frozen', 'expired')),
  created_at      timestamptz default now()
);

create index memberships_client_id_idx on memberships(client_id);
create index memberships_branch_id_idx on memberships(branch_id);

-- =====================
-- SCHEDULE (расписание)
-- =====================
create table schedule (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id),
  trainer_id    uuid references profiles(id),
  title         text not null,
  starts_at     timestamptz not null,
  duration_min  int default 60,
  capacity      int default 10,
  created_at    timestamptz default now()
);

create index schedule_branch_id_idx on schedule(branch_id);
create index schedule_starts_at_idx on schedule(starts_at);

-- =====================
-- BOOKINGS (записи)
-- =====================
create table bookings (
  id              uuid primary key default gen_random_uuid(),
  schedule_id     uuid not null references schedule(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  membership_id   uuid references memberships(id),
  status          text default 'booked' check (status in ('booked', 'attended', 'cancelled')),
  created_at      timestamptz default now(),
  unique(schedule_id, client_id)
);

create index bookings_schedule_id_idx on bookings(schedule_id);
create index bookings_client_id_idx on bookings(client_id);

-- =====================
-- RLS — включаем на всех таблицах
-- Изоляция данных через backend (service_role обходит RLS).
-- Политики ниже — на случай прямых запросов с фронта в будущем.
-- =====================
alter table branches    enable row level security;
alter table profiles    enable row level security;
alter table clients     enable row level security;
alter table memberships enable row level security;
alter table schedule    enable row level security;
alter table bookings    enable row level security;

-- Базовая политика: пользователь видит только записи своего филиала
create policy "branch_isolation_clients" on clients
  using (
    branch_id in (
      select branch_id from profiles where id = auth.uid()
    )
  );

create policy "branch_isolation_memberships" on memberships
  using (
    branch_id in (
      select branch_id from profiles where id = auth.uid()
    )
  );

create policy "branch_isolation_schedule" on schedule
  using (
    branch_id in (
      select branch_id from profiles where id = auth.uid()
    )
  );

-- Профиль видит только свой
create policy "own_profile" on profiles
  using (id = auth.uid());
