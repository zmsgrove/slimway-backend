CREATE TABLE IF NOT EXISTS branch_settings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id            uuid NOT NULL UNIQUE REFERENCES branches(id) ON DELETE CASCADE,
  working_hours_start  time NULL DEFAULT '09:00',
  working_hours_end    time NULL DEFAULT '22:00',
  timezone             text NULL DEFAULT 'Asia/Almaty',
  currency             text NULL DEFAULT 'KZT',
  contact_phone        text NULL,
  contact_email        text NULL,
  website              text NULL,
  address              text NULL,
  booking_interval_min int  NULL DEFAULT 60,
  max_bookings_per_day int  NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
