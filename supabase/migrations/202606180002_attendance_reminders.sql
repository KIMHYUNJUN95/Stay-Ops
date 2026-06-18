-- Attendance — 18:30 open-session reminder state (Step 14).
--
-- Minimal once-per-Tokyo-day state for the worker open-session reminder: at most one row per user per
-- operating date. `response` records the user's answer ('still_working' suppresses the prompt for the
-- rest of the day; 'left_work' routes them to the correction flow and does NOT auto clock-out). Writes
-- go through the service-role reminder action; the row is readable by its owner (+ platform admin).

create table public.attendance_open_session_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  operating_date date not null,
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  check (response is null or response in ('still_working', 'left_work')),
  unique (user_id, operating_date)
);

create index attendance_open_session_reminders_user_idx
  on public.attendance_open_session_reminders(user_id, operating_date desc);

alter table public.attendance_open_session_reminders enable row level security;

create policy "users read own open-session reminders"
on public.attendance_open_session_reminders
for select
using (auth.uid() is not null and (user_id = auth.uid() or public.is_platform_admin()));

grant select, insert, update, delete on public.attendance_open_session_reminders to authenticated;
grant all on public.attendance_open_session_reminders to service_role;
