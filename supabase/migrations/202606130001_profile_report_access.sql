-- Daily-report generation permission flag.
--
-- The AI daily-report generator (Todo 완료/기록 tab) is staff-only. Effective permission is
-- "regular staff (any role except part_time_staff) OR this flag is true", so owners/office_admins
-- can grant report access to the few part-timers who work in a management capacity.
-- Default false: part-timers have no access until explicitly granted; regular staff are covered by
-- the role check and never need the flag.
alter table public.profiles
  add column if not exists can_generate_report boolean not null default false;

comment on column public.profiles.can_generate_report is
  'Per-user override granting access to the AI daily-report generator. Effective access = role != part_time_staff OR this flag. Toggled by owner/office_admin in admin user management.';
