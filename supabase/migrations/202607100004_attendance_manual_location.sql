-- Manual attendance location (2026-07-10)
--
-- Field staff sometimes work off-site or forget to clock in/out, so a payroll admin enters the session
-- by hand. Instead of forcing a registered work-site (attendance_sites), the manual entry can carry a
-- free-text location. `manual_location` holds that typed value; when present it is the authoritative
-- location label shown in per-user payroll exports (falls back to the site name otherwise).

alter table public.attendance_sessions
  add column if not exists manual_location text;
