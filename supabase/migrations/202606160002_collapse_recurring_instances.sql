-- Collapse pre-materialized recurring task instances into a single live task per series.
--
-- Background: the previous recurrence model pre-generated one `tasks` row per date across a
-- ~2-month window, which flooded the date-agnostic tabs (관리함/공유함) with duplicate-looking
-- entries. The model is now Todoist-style — a recurring task is ONE live row that rolls forward on
-- completion (see `completeTask`); the calendar expands future occurrences virtually.
--
-- This one-time cleanup keeps, for each `recurrence_series_id`, the single most relevant occurrence
-- (prefer an open task; among those the nearest upcoming one on/after today, else the most recent),
-- and deletes the rest. Deletes cascade to `task_participants` / `task_updates` (ON DELETE CASCADE).

with ranked as (
  select
    id,
    recurrence_series_id,
    row_number() over (
      partition by recurrence_series_id
      order by
        (status not in ('completed', 'cancelled')) desc,                                   -- open first
        (recurrence_instance_date >= (now() at time zone 'Asia/Tokyo')::date) desc,         -- upcoming first
        case
          when recurrence_instance_date >= (now() at time zone 'Asia/Tokyo')::date
          then recurrence_instance_date
        end asc nulls last,                                                                 -- nearest upcoming
        recurrence_instance_date desc                                                       -- else most recent
    ) as rn
  from public.tasks
  where recurrence_series_id is not null
    and recurrence_instance_date is not null
)
delete from public.tasks t
using ranked r
where t.id = r.id
  and r.rn > 1;
