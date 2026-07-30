-- ── task_occurrence_state ─────────────────────────────────────────────────────
-- Per-occurrence state for recurring tasks. As of 2026-07-30 recurring tasks no longer
-- roll forward on completion (see docs/planning/01-decision-log.md "롤포워드 폐지"): a recurring
-- task is a single row carrying `recurrence_rule` + a FIXED anchor (`recurrence_instance_date`),
-- and each scheduled occurrence date is shown independently. The recurring row's
-- `status`/`completed_at` no longer represent completion — THIS table is the source of truth for
-- whether a given (task, occurrence_date) was completed / skipped / carried to today.
--   state = 'completed'  → that date's occurrence is done (completed_by_user_id set)
--         = 'skipped'    → overdue occurrence dismissed ("삭제"); kept forever, never re-appears
--         = 'moved'      → overdue occurrence carried to `moved_to_date` ("오늘로 가져오기");
--                          a carry-over one-off task is created separately for that date
-- Overdue occurrence = scheduled date < today with NO row here (i.e. still open).
create table public.task_occurrence_state (
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  state text not null check (state in ('completed', 'skipped', 'moved')),
  completed_by_user_id uuid references public.profiles(id) on delete set null,
  moved_to_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, occurrence_date)
);

create index task_occurrence_state_org_idx
  on public.task_occurrence_state (organization_id, occurrence_date);
create index task_occurrence_state_task_idx
  on public.task_occurrence_state (task_id);

create trigger task_occurrence_state_set_updated_at
before update on public.task_occurrence_state
for each row execute function public.set_updated_at();

alter table public.task_occurrence_state enable row level security;

-- Read: participants only — same rule as task_updates (SECURITY DEFINER is_task_participant).
create policy "participants can read occurrence state"
on public.task_occurrence_state
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_task_participant(task_id))
);

-- Writes go through server actions (service-role). Keep authenticated read-only here.
grant select on public.task_occurrence_state to authenticated;
grant all on public.task_occurrence_state to service_role;
