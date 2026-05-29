-- Slimway CRM — Migration 006
-- v1.6.0: Theme preferences per user

alter table profiles
  add column if not exists theme_preference jsonb;

comment on column profiles.theme_preference is
  'User theme preference: {"mode":"dark"|"light","accent":"teal"|"purple"|"blue"|"green"|"orange"|"pink"|"gray"}';
