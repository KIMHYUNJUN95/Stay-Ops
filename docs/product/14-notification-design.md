# Notification Design

## Purpose

Notifications should make sure important operational events reach the right people at the right time.

The first version should avoid noisy notifications and focus on events that need action.

## Notification Channels

Initial channels:

- Push notification
- In-app notification center

Future channels:

- Email
- Slack

## Required Notification Events

## Order Requests

### Order Request Approved

Trigger:

- Office Admin approves an order request.

Recipient:

- Requester

Content:

- Request approved

### Order Request Rejected

Trigger:

- Office Admin rejects an order request.

Recipient:

- Requester

Content:

- Request rejected
- Rejection reason

### Order Request — Order Processed (주문 처리)

Trigger:

- Office Admin marks an order request as ordered (주문 처리 완료, status → `ordered`).
- Note: `delivery_date` is **required** at the time of this transition (captured in the action modal).

Recipient:

- Requester

Content:

- Order processing completed.
- Expected delivery date (from `delivery_date` field, stored as date-only `YYYY-MM-DD`).
- Date should be displayed in Asia/Tokyo operational timezone.

Implementation status (implemented 2026-06-03):

- `delivery_date` field is captured and stored at the time of order processing.
- `delivery_start_date` and `delivery_end_date` fields support delivery range mode.
- Notification dispatch to the requester is **implemented** via `createOrderProcessedNotification()` in `src/lib/notifications/create.ts`.
- The notification payload includes: `orderId`, `orderTitle`, `buildingName`, `roomLabel`, `status`, `deliveryDate`, `deliveryStartDate`, `deliveryEndDate`, `processedByUserId`.
- Self-notification is suppressed: if the processor and the requester are the same user, no notification is created.
- A dedupe key (`order_processed:{orderId}`) prevents duplicate notifications per order.
- The `schemaUnavailable` fallback is in place: if the `notifications` table does not yet exist, the action silently skips notification creation with a server-side warning log.
- i18n key for future notification message with date: `mobile.orderDetail.orderProcessedWithDeliveryDate` (ko/ja/en).

## Announcements

### New Announcement

Trigger:

- Announcement is published.

Recipient:

- Targeted users

### Important Announcement

Trigger:

- Announcement is marked important.

Recipient:

- Targeted users

Behavior:

- Stronger visual priority in notification center
- May also be shown as app-open popup if configured

## Maintenance

### Urgent Maintenance Request

Trigger:

- Maintenance request is created with urgent priority.

Recipient candidates:

- Field Manager
- Office Admin
- Owner if configured

## Lost and Found

### Disposal Scheduled

Trigger:

- Lost item automatically moves to disposal_scheduled.

Recipient candidates:

- Office Admin
- Field Manager

## Cleaning

### Cleaning Overdue

Trigger:

- A cleaning timer is still in progress after 16:00.

Reason:

- Cleaning normally starts around 10:00 and should be completed by 16:00 at the latest.

Recipient candidates:

- Staff member with active cleaning timer
- Field Manager
- Office Admin if configured

Frequency:

- Send once at/after 16:00.
- Do not repeat by default.

## Cleaning Time Rule

Default operational rule:

```txt
Cleaning starts around 10:00
Cleaning should be completed by 16:00
If cleaning is still in progress after 16:00 -> send overdue notification
```

## Todo / Shared Task

Implemented (2026-06-11). Todo / Shared Task has full in-app notification coverage for its first
slice. All are org-scoped, fan out only to a task's current participants (private personal tasks never
leak), and dedupe per recipient via the `notifications` `unique (recipient_user_id, dedupe_key)`
constraint. Each deep-links to `/mobile/tasks/{id}`.

| Event | `notification_type` | Trigger | Actor self-notify? |
|---|---|---|---|
| Shared with me | `task_shared` | `createTask` (with recipients), `shareTaskWithUsers` | No |
| Update-log activity (progress note) | `task_updated` (`event: note`) | `addTaskUpdate` | No |
| Shared task edited (core) | `task_updated` (`event: edited`) | `updateTaskCore` | No |
| Reopened | `task_updated` (`event: reopened`) | `reopenTask` | No |
| Completed | `task_completed` | `completeTask` | No |
| Due today (due soon) | `task_due_soon` | daily cron `/api/tasks/reminders` | n/a (system) |
| Overdue | `task_overdue` | daily cron `/api/tasks/reminders` | n/a (system) |

Notes:

- **Update-log activity reuses `task_updated`** but stays distinct via `payload.event = note` (its own
  title/body), rather than adding another enum value — the smallest coherent path.
- **Due-soon / overdue are time-based system reminders** evaluated once daily (08:00 JST) by the
  CRON_SECRET-guarded `/api/tasks/reminders` endpoint. Due soon = active task due today (Tokyo);
  overdue = active task due before today (Tokyo). Exactly one reminder per task per recipient (ever),
  so there is no escalating-repeat spam and no recurring-instance/scheduler engine — just a narrow
  daily evaluation. Because there is no actor, the task's author is intentionally reminded about their
  own deadline.

## Implementation Status Summary (as of 2026-06-11)

| Event | Status |
|---|---|
| Order processed (주문 처리) | Implemented -- in-app only |
| Task shared / update / completed / due-soon / overdue | Implemented -- in-app only |
| Order approved | Planned -- not implemented |
| Order rejected | Planned -- not implemented |
| Important announcement | Planned -- not implemented |
| Urgent maintenance | Planned -- not implemented |
| Disposal scheduled (lost item) | Planned -- not implemented |
| Cleaning overdue | Planned -- not implemented |
| Web Push (push channel) | Post-MVP -- not implemented |

The in-app notification center (`/mobile/notifications`) and the `notifications` table are live. Active dispatch paths: `order_processed` and the Todo / Shared Task types above.

## Open Questions

- Should overdue alert go to Office Admin immediately or only after extra delay?
- Should urgent maintenance notify all Field Managers or only selected managers?
- Should users be able to mute some notification types?
- Should announcements always send push notifications or only important ones?
