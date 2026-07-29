-- Soft-delete for tasks (enables "실행 취소 / Undo" on delete, Todoist-style).
-- User-triggered task deletion switches from hard DELETE to setting `deleted_at`; the undo toast
-- (and a `restoreTask` action) clears it. All task list/detail reads must filter `deleted_at is null`
-- (enforced in the query libs, not RLS — RLS still sees soft-deleted rows so the owner can restore).
-- Deletion-policy change approved 2026-07-29 (see docs/planning/01-decision-log.md). No automatic
-- purge yet; soft-deleted rows are retained until a future cleanup job.
alter table public.tasks add column if not exists deleted_at timestamptz;

-- Partial index keyed on the common list scope, covering only live rows.
create index if not exists tasks_live_org_idx on public.tasks (organization_id) where deleted_at is null;

comment on column public.tasks.deleted_at is
  'Soft-delete timestamp. NULL = live. Set on user delete, cleared on undo/restore. All task list/detail reads filter deleted_at is null.';
