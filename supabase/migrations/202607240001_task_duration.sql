-- Task time-block duration (minutes). NULL = 기간 없음 (no duration). Only meaningful when the task
-- has a time-of-day (time_label). Single-day block: the task spans [time_label, time_label+duration].
alter table public.tasks add column if not exists duration_minutes integer;
comment on column public.tasks.duration_minutes is 'Optional time-block length in minutes for a timed task (Todoist-style 기간). NULL = no duration.';
