-- ── task_occurrence_order ─────────────────────────────────────────────────────
-- 원격 프로젝트 적용 완료: 2026-07-30.
-- Per-occurrence manual sort position for recurring tasks (2026-07-30).
--
-- Why a separate table instead of a `sort_order` column on `task_occurrence_state`:
-- that table's contract is "**no row = the occurrence is still open**" — `outstandingOverdueOccurrences`
-- treats every date carrying a row as resolved. Storing an ordering row there would silently make
-- overdue occurrences disappear from the backlog. Ordering has a different lifecycle (it exists for
-- occurrences that are neither completed nor skipped), so it gets its own table and the state
-- table's invariant stays intact.
--
-- One-off tasks keep using `tasks.sort_order` (one row, one date, one position). A recurring task is
-- ONE row shown on many dates, so its position must be keyed by (task, date) — that is this table.
-- A list for a given date is sorted by merging the two sources; see `src/lib/tasks.ts`.
--
-- Absence of a row simply means "not manually positioned yet" and falls back to priority order.
create table public.task_occurrence_order (
  task_id uuid not null references public.tasks(id) on delete cascade,
  occurrence_date date not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, occurrence_date)
);

-- The list read is always "one org, one date" — this index serves it directly.
create index task_occurrence_order_org_date_idx
  on public.task_occurrence_order (organization_id, occurrence_date);
create index task_occurrence_order_task_idx
  on public.task_occurrence_order (task_id);

create trigger task_occurrence_order_set_updated_at
before update on public.task_occurrence_order
for each row execute function public.set_updated_at();

alter table public.task_occurrence_order enable row level security;

-- Read: participants only — same rule as task_occurrence_state / task_updates.
create policy "participants can read occurrence order"
on public.task_occurrence_order
for select
using (
  auth.uid() is not null
  and (public.is_platform_admin() or public.is_task_participant(task_id))
);

-- Writes go through server actions (service-role). Keep authenticated read-only here.
grant select on public.task_occurrence_order to authenticated;
grant all on public.task_occurrence_order to service_role;
