-- Slimway CRM — Migration 002
-- v1.2.0 — Devices, Subscriptions, Schedule Slots, Bookings v2

-- =====================
-- DEVICES (тренажёры)
-- =====================
create table devices (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references branches(id) on delete cascade,
  type         text not null check (type in ('vacuactiv', 'rollshape', 'infrastep', 'infrashape')),
  number       text not null,
  device_group text not null default 'A' check (device_group in ('A', 'B')),
  status       text not null default 'active' check (status in ('active', 'maintenance', 'disabled')),
  created_at   timestamptz default now()
);

create index devices_branch_id_idx on devices(branch_id);

-- =====================
-- SUBSCRIPTIONS (абонементы v1.2)
-- =====================
create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  branch_id             uuid not null references branches(id),
  name                  text not null,
  slot_1_type           text not null check (slot_1_type in ('vacuactiv', 'rollshape', 'infrastep', 'infrashape')),
  slot_1_duration_min   int  not null,
  slot_1_sessions_total int  not null,
  slot_1_sessions_left  int  not null,
  slot_2_type           text check (slot_2_type in ('vacuactiv', 'rollshape', 'infrastep', 'infrashape')),
  slot_2_duration_min   int,
  slot_2_sessions_total int,
  slot_2_sessions_left  int,
  date_start            date not null,
  date_end              date,
  price                 numeric(10,2),
  status                text not null default 'active' check (status in ('active', 'frozen', 'expired')),
  created_at            timestamptz default now()
);

create index subscriptions_client_id_idx  on subscriptions(client_id);
create index subscriptions_branch_id_idx  on subscriptions(branch_id);
create index subscriptions_status_idx     on subscriptions(status);

-- =====================
-- SCHEDULE_SLOTS (ячейки расписания)
-- =====================
create table schedule_slots (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id),
  device_id  uuid not null references devices(id) on delete cascade,
  date       date not null,
  time_start time not null,
  time_end   time not null,
  status     text not null default 'free' check (status in ('free', 'booked', 'blocked', 'maintenance')),
  booking_id uuid,           -- populated on booking; no FK to avoid circular dep
  created_at timestamptz default now(),
  unique(device_id, date, time_start)
);

create index schedule_slots_branch_date_idx  on schedule_slots(branch_id, date);
create index schedule_slots_device_date_idx  on schedule_slots(device_id, date);
create index schedule_slots_status_idx       on schedule_slots(status);

-- =====================
-- BOOKINGS_V2 (бронирования v1.2)
-- =====================
create table bookings_v2 (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references clients(id),
  subscription_id          uuid not null references subscriptions(id),
  branch_id                uuid not null references branches(id),
  date                     date not null,
  slot_1_schedule_slot_id  uuid not null references schedule_slots(id),
  slot_2_schedule_slot_id  uuid references schedule_slots(id),
  created_by               uuid not null references profiles(id),
  created_at               timestamptz default now()
);

create index bookings_v2_client_id_idx   on bookings_v2(client_id);
create index bookings_v2_branch_date_idx on bookings_v2(branch_id, date);

-- =====================
-- RLS
-- =====================
alter table devices        enable row level security;
alter table subscriptions  enable row level security;
alter table schedule_slots enable row level security;
alter table bookings_v2    enable row level security;
