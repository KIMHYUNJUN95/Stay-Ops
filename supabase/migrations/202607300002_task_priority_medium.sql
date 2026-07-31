-- Task priority becomes 4 levels (Todoist P1–P4) on the UI (2026-07-30). Internally we keep the
-- existing word values and add ONE new tier `medium` (P3), avoiding a data migration:
--   urgent = 우선순위 1 (red) · important = 우선순위 2 (orange) · medium = 우선순위 3 (blue) ·
--   normal = 우선순위 4 (gray, default). Ladder: urgent > important > medium > normal.
alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks
  add constraint tasks_priority_check
  check (priority in ('normal', 'important', 'urgent', 'medium'));
