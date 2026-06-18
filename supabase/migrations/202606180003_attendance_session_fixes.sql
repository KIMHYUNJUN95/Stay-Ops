-- Attendance bug fixes (2026-06-18)
--
-- 1. Add target_month to attendance_correction_requests so session-less (exception)
--    requests can be matched to the month being finalized during eligibility checks.
--    Backfill: existing rows without a session are left NULL (they predate the field
--    and will not block future finalizations — acceptable for data already in flight).
--
-- 2. Fix the unique constraint on attendance_open_session_reminders to include
--    organization_id, enforcing org isolation at the DB level and allowing the same
--    user+date pair to exist across different organizations.

-- ── 1. target_month on correction requests ────────────────────────────────────

alter table public.attendance_correction_requests
  add column if not exists target_month date;

-- Partial index: only session-less rows need fast lookup by target_month.
create index if not exists attendance_correction_requests_sessionless_month_idx
  on public.attendance_correction_requests(organization_id, requested_by_user_id, target_month)
  where session_id is null;

-- ── 2. Org-scoped unique constraint on open-session reminders ────────────────

alter table public.attendance_open_session_reminders
  drop constraint if exists attendance_open_session_reminders_user_id_operating_date_key;

alter table public.attendance_open_session_reminders
  add constraint attendance_open_session_reminders_org_user_date_key
  unique (organization_id, user_id, operating_date);
