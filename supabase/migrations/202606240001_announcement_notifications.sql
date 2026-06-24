-- Important announcement notifications (Step 15).
-- One discriminated notification type carries important-announcement events via `payload.event`,
-- mirroring the existing `suggestion_activity` / `attendance_activity` pattern.
-- `ADD VALUE IF NOT EXISTS` is idempotent.
alter type public.notification_type add value if not exists 'announcement_activity';
