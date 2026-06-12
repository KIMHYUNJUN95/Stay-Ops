-- Manual drag-reorder for the Todo "Today" view.
-- See docs/product/18-todo-task-workflow.md and docs/engineering/09-todo-task-technical-design.md.
--
-- sort_order is a nullable manual sort key. NULL = unranked (the app falls back to priority/date
-- order, preserving the pre-reorder behaviour). When a user drag-reorders a Today section, every
-- card in that section is assigned a sequential sort_order (0..n). The value is global to the task
-- (not per-user) for MVP — a shared task reordered by one member moves for everyone who sees it in
-- their Today view.

alter table public.tasks
  add column if not exists sort_order integer;

comment on column public.tasks.sort_order is
  'Manual drag-reorder key for the Todo Today view. NULL = unranked (priority/date fallback).';
