-- Recurring task instances: store each occurrence as a real task row.
-- A recurrence series is identified by `recurrence_series_id`; each row in the series
-- carries its own `recurrence_instance_date`.

alter table public.tasks
  add column if not exists recurrence_series_id uuid,
  add column if not exists recurrence_instance_date date;

create index if not exists tasks_recurrence_series_idx
  on public.tasks (organization_id, recurrence_series_id, recurrence_instance_date)
  where recurrence_series_id is not null;

create unique index if not exists tasks_recurrence_series_date_unique_idx
  on public.tasks (organization_id, recurrence_series_id, recurrence_instance_date)
  where recurrence_series_id is not null
    and recurrence_instance_date is not null;

-- Existing recurring tasks become the first known occurrence of their own series when they
-- already have a date anchor. Legacy repeating tasks with no date stay label-only until edited.
update public.tasks
set
  recurrence_series_id = id,
  recurrence_instance_date = coalesce((due_at at time zone 'Asia/Tokyo')::date, scheduled_date)
where recurrence_rule is not null
  and recurrence_series_id is null
  and coalesce((due_at at time zone 'Asia/Tokyo')::date, scheduled_date) is not null;
