-- Task reminder notification types (due-soon + overdue) for Todo / Shared Task.
--
-- Additive enum values only. These are emitted by the daily `/api/tasks/reminders`
-- cron (see vercel.json) — there is no instance generation or scheduler engine, just a
-- once-daily evaluation that fans out a single deduped reminder per task per recipient.
--
-- `ALTER TYPE ... ADD VALUE` adds the labels idempotently; they are not used elsewhere in
-- this migration, so no in-transaction usage conflict.
alter type public.notification_type add value if not exists 'task_due_soon';
alter type public.notification_type add value if not exists 'task_overdue';
