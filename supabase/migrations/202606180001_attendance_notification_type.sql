-- Attendance notifications (Step 14) — one discriminated notification type carries every attendance
-- event via `payload.event` (correction_created / abnormal_session / open_session_reminder), mirroring
-- the existing `suggestion_activity` / `task_updated` pattern (no enum value per event).
-- `ADD VALUE IF NOT EXISTS` is idempotent.
alter type public.notification_type add value if not exists 'attendance_activity';
