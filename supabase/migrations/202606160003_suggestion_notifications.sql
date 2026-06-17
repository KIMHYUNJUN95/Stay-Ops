-- Staff Suggestions — notification type (Step 7).
-- See docs/product/22-staff-suggestions-workflow.md and docs/product/14-notification-design.md.
--
-- One discriminated notification type carries every suggestion event via `payload.event`
-- (created | referenced | status | comment), mirroring the existing `task_updated` pattern — this
-- avoids adding a separate enum value per event. `ADD VALUE IF NOT EXISTS` is idempotent.
alter type public.notification_type add value if not exists 'suggestion_activity';
