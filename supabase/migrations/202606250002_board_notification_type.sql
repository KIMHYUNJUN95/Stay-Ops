-- Board (자유 게시판) — notification type (Page 3).
-- See docs/product/23-board-workflow.md and docs/product/14-notification-design.md.
--
-- One discriminated notification type carries every board event via `payload.event` (currently only
-- `commented` — a new comment notifies the post author), mirroring the suggestion_activity /
-- attendance_activity pattern. `ADD VALUE IF NOT EXISTS` is idempotent and must run on its own
-- (a new enum value cannot be used in the same transaction that adds it).
alter type public.notification_type add value if not exists 'board_activity';
