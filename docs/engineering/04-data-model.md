# Data Model

## Purpose

This document defines the initial Supabase/PostgreSQL data model for StayOps.

The model must support:

- Multi-tenant organizations
- PWA mobile field app
- Admin web app
- Role-based permissions
- Korean/Japanese/English UI
- Beds24 reservation calendar
- Cleaning timer records
- Maintenance requests
- Lost and found
- Order requests
- Announcements
- User directory
- Notifications
- Recurring work scheduler
- Linen defect registration (approved post-MVP batch, 2026-06-09)
- Personal todo / shared task inbox (approved post-MVP batch)
- Internal board (approved post-MVP batch)
- Staff suggestions / feedback (approved post-MVP batch)
- Attendance / clock-in-out + hourly payroll (Steps 1–14 implemented; admin web dashboard deferred)

## Core Principles

## 1. Organization Isolation

Every business record must belong to an organization.

Core rule:

```txt
organization_id is required on every operational table.
```

## 2. Internal IDs + External IDs

StayOps should use internal UUID primary keys.

External systems such as Beds24 should be mapped through external ID fields.

Example:

```txt
external_provider = "beds24"
external_id = "..."
```

## 3. Role-Based Access

Permissions should be enforced with:

- Application-level checks
- Supabase Row Level Security

Do not rely only on hiding UI buttons.

## 4. Hard Delete Policy

User-triggered deletion is hard delete in MVP.

Important:

- Show confirmation popup before delete.
- Be careful with foreign keys and cascading behavior.

## 5. Attachments

Implementation note (updated): The actual MVP implementation stores image URLs directly on each feature table as `image_urls text[]` rather than using a shared `attachments` table. The shared table approach was the original design intent but was not used in practice. Each table (lost_items, maintenance_reports, order_requests, announcements) stores its own `image_urls text[]` column. The Supabase Storage bucket for request images is `request-images`; the bucket for announcement images is `announcement-images`.

## Core Tables

Implementation note:

- The first implementation migration is `supabase/migrations/202605090001_initial_foundation.sql`.
- The first migration intentionally covers only the foundation tables needed before authentication and onboarding:
  - organizations
  - profiles
  - memberships
  - invite_codes
  - platform_admins
  - audit_logs
- Feature tables such as properties, rooms, reservations, cleaning records, requests, announcements, notifications, and recurring work should be added in later migrations after the auth/invite foundation is connected and tested.

## organizations

Represents a company/workspace.

Fields:

```txt
id uuid primary key
name text not null
slug text unique
status text not null
created_at timestamptz
updated_at timestamptz
```

## profiles

Extends Supabase auth users.

Fields:

```txt
id uuid primary key references auth.users(id)
name text not null
birth_date date                                   -- added migration 202606180004; replaces age
gender profile_gender                             -- added migration 202607030002; nullable for legacy accounts
hire_date date                                    -- added migration 202607060001; self-entered, annual-leave accrual basis
phone_number text                                 -- unique (partial index, excludes NULL/empty)
last_used_organization_id uuid references organizations(id) on delete set null  -- added 202606180004
profile_photo_url text
preferred_language text not null
theme_preference text not null default 'system'  -- schema only; NOT used by the app (light-mode-only since 2026-06-08)
bottom_nav_tabs text[] not null default '{home,calendar,requests,announcements}'
can_generate_report boolean not null default false
created_at timestamptz
updated_at timestamptz
```

Auth/onboarding notes (updated 2026-06-18):

- `birth_date` is the active operational field. `age` is the legacy column from initial DB gen; kept for backward compat but not used in onboarding logic. Do not add new code that reads `age`.
- `gender` is collected during onboarding for payroll/employment-facing exports and records. Current allowed values are `female` and `male`. It is intentionally nullable so already-onboarded accounts are not forced back through onboarding.
- `phone_number` is stored in international format and enforced as account-level unique via the partial unique index `profiles_phone_number_unique` (excludes NULL and empty). Migration `202606180004`.
- `last_used_organization_id` tracks the last organization the user actively signed into — used for multi-org routing so login returns to the right org. Nullable (NULL = first login or single-org user).
- Users may edit `name`, `birth_date`, `phone_number`, and `gender` later. The current `/account` UI surfaces `birth_date` and `gender` specifically so legacy accounts can fill missing profile fields without being forced back through onboarding.
- `preferred_language` is chosen during onboarding and becomes the user's top-priority locale after join.

`can_generate_report` (migration `supabase/migrations/202606130001_profile_report_access.sql`) is a
per-user override for the Todo **daily-report generator** (업무일지; free, template-based — no LLM).
Default `false`. The report
permission is `role != 'part_time_staff' OR can_generate_report = true`, so regular staff are covered
by the role check and never need the flag; it is toggled per-user by owner/office_admin in admin user
management for the few part-timers who work in a management capacity. See
`docs/engineering/05-rls-permissions.md` and `docs/product/18-todo-task-workflow.md` (2026-06-13).

`bottom_nav_tabs` stores the user's customized mobile bottom-bar tabs (ordered ids, max 4 enforced in app logic). Added in `supabase/migrations/202606080001_profile_bottom_nav.sql`. Selectable ids match the mobile side-menu nav items (`home`, `calendar`, `cleaning`, `requests`, `announcements`, `notifications`, `directory`).

`hire_date` (migration `202607060001`) is self-entered by the employee from the "hire date missing"
screen (`src/components/attendance/leave-exception.tsx`, `missing` variant → `setAnnualLeaveBaselineAction`
in `src/app/mobile/attendance/leave/actions.ts`). It is the basis for annual-leave accrual — see
`annual_leave_baselines` below and `docs/product/26-annual-leave-workflow.md`. There is no admin
edit UI for it yet (planned per that doc, not built); salary-based-only exclusion of hourly staff is
also not yet enforced at this layer.

Language values:

```txt
ko
ja
en
```

Theme values (schema only — the app no longer reads or writes `theme_preference`; light-mode-only since 2026-06-08, dark mode deferred until post-launch):

```txt
system
light
dark
```

## memberships

Connects users to organizations.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
role text not null
status text not null
joined_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Role values:

```txt
owner
office_admin
cs_staff
field_manager
staff
part_time_staff
```

Developer/Super Admin is not stored as an organization membership role. It uses `platform_admins`.

Status values:

```txt
invited
active
suspended
removed
```

## invite_codes

Invite codes for onboarding, especially part-time staff.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
code text unique not null
name text not null
default_role text not null
expires_at timestamptz not null
max_uses integer not null
used_count integer not null default 0
is_active boolean not null default true
created_by_user_id uuid references profiles(id)
created_at timestamptz
updated_at timestamptz
```

Business rules (2026-06-18 planning baseline):

- Invite code resolves both `organization_id` and the signup-facing role category
- `owner` invite code: one-time use
- all other role categories: `expires_at = within 3 months`, `max_uses = 100` by default
- Invite-code management UI is deferred; initial org/owner/code bootstrap is manual DB/admin-script work
- Additional organizations can be joined by reusing the same account and entering another valid invite code

## platform_admins

Platform-level admin access.

This is separate from organization memberships.

Fields:

```txt
id uuid primary key
user_id uuid not null references profiles(id)
role text not null
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

Role values:

```txt
developer_super_admin
```

Purpose:

- Create organizations during MVP
- Access all organizations for support/debugging
- Manage platform-level settings later

## audit_logs

Records important admin/platform actions.

MVP does not need a full audit log UI, but important actions should be stored.

Fields:

```txt
id uuid primary key
organization_id uuid references organizations(id)
actor_user_id uuid references profiles(id)
action text not null
target_type text
target_id uuid
metadata jsonb
created_at timestamptz
```

Example actions:

```txt
organization.created
membership.role_changed
membership.deactivated
invite_code.created
request.deleted
reservation.manual_checkout_updated
platform_admin.used
```

Notes:

- `organization_id` can be null for platform-level actions.
- Super Admin actions should be recorded.
- Important role and permission changes should be recorded.

## properties

Buildings, hotels, or standalone accommodations.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
name text not null
display_name_ko text
display_name_ja text
display_name_en text
property_type text not null
address text
status text not null
external_provider text
external_property_id text
created_at timestamptz
updated_at timestamptz
```

## rooms

Rooms or units inside a property.

Migration: `supabase/migrations/202605240001_properties_rooms.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_id uuid not null references properties(id)
room_label text not null           -- canonical room label (e.g. "201", "A301")
status room_status not null        -- active | inactive
external_provider text             -- "beds24" for Beds24-synced rooms
external_room_id text              -- Beds24 unitId
external_minimum_stay integer      -- from Beds24 inventory API; null = unknown/unclassified
created_at timestamptz
updated_at timestamptz
```

Status values (room_status enum):

```txt
active
inactive
```

Note: `external_minimum_stay` determines whether a Beds24 room is classified as active or inactive. Rooms with `external_minimum_stay < 50` are treated as active; `null` or `>= 50` are treated as inactive. This is used by `getActiveRoomLabels()` to decide which rooms render on the calendar.

## reservations

Beds24 reservation data used for calendar display.

Migration: `supabase/migrations/202605220001_reservations.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
property_name text not null        -- free text from Beds24 payload, not a FK to properties
room_label text not null           -- free text from Beds24 payload, not a FK to rooms
source text not null               -- channel name: "Booking.com", "Airbnb", "Direct", etc.
source_reservation_id text not null -- Beds24 booking ID (may include "::room::{label}" suffix for multi-room)
guest_name text not null
guest_count integer
check_in_date date not null        -- Beds24 firstNight date
check_out_date date not null       -- lastNight + 1 calendar day
status reservation_status not null
raw_payload jsonb                  -- original Beds24 webhook payload for recovery/debugging
created_at timestamptz not null
updated_at timestamptz not null
unique (organization_id, source, source_reservation_id)
```

Status values (reservation_status enum):

```txt
confirmed
checked_in
checked_out
cancelled
no_show
```

Notes:
- property_name and room_label are free text (not FKs) because Beds24 sends string labels. The `properties` and `rooms` tables are maintained in parallel for room master management but are not enforced as FKs here.
- check_out_date uses exclusive semantics: guest checks out on check_out_date morning, not the night before.
- Cancelled and no_show reservations are excluded from all calendar renders and counts.
- source_reservation_id may encode room assignment as "{originalId}::room::{label}" to support multi-room bookings under the same unique constraint.
- Realtime is enabled on this table (migration `202605260002_enable_reservations_realtime.sql`).

## beds24_webhook_events

Observability log for Beds24 reservation ingestion. Records every inbound webhook batch and every reconciliation run with its processing result, so a dropped or never-delivered webhook is detectable instead of silently missing. See `docs/product/15-reservation-calendar.md` → "Webhook Reliability".

Migration: `supabase/migrations/202606100001_beds24_webhook_events.sql`

Fields:

```txt
id uuid primary key
organization_id uuid references organizations(id) on delete set null  -- nullable: webhook may fail to resolve org
trigger_source text not null            -- 'webhook' | 'reconciliation' (CHECK constrained)
http_status integer
processed_count integer not null        -- bookings in the batch / rows fetched by reconciliation
succeeded_count integer not null
failed_count integer not null
modes text[] not null                   -- per-result processing modes (upserted, missing_required_fields, ...)
booking_summary jsonb not null          -- compact [{bookId,status,mode}] (webhook) or window/skip summary (reconciliation)
error_message text
received_at timestamptz not null
created_at timestamptz not null
```

Notes:
- This is platform/operational data, not org business data: readable only by platform admins, writable only by the service role (webhook + cron paths).
- `booking_summary` is intentionally a compact summary, NOT the full raw payload — enough to trace a specific reservation without storing bulk PII. The full payload still lives in `reservations.raw_payload` for recovered rows.
- Written by `src/lib/beds24/webhook-events.ts` from the webhook route and the reconciliation route; logging failures are swallowed and never block the ingestion response.

## cleaning_sessions

Cleaning timer and completion records.

Migration: `supabase/migrations/202605210001_cleaning_sessions.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
staff_user_id uuid not null references profiles(id)
room_label text not null          -- canonical "PropertyName RoomLabel" string, not a FK
task_label text not null          -- task type key (checkout_cleaning, simple_cleaning, long_stay_cleaning)
status cleaning_status not null
cleaning_date date not null       -- JST operating date (Asia/Tokyo)
started_at timestamptz not null
completed_at timestamptz
duration_seconds integer
notes text
created_at timestamptz not null
updated_at timestamptz not null
```

Status values (cleaning_status enum):

```txt
in_progress
completed
```

Note: room_label and property are stored as free text rather than FKs to properties/rooms tables because cleaning sessions predate the room master and must survive property data changes. The room master (properties/rooms tables) is used for display and filtering but is not enforced as a FK here.

## maintenance_reports

Maintenance/field issue records.

Migrations: `supabase/migrations/202605210007_maintenance_reports.sql`,
`supabase/migrations/202607090003_reservation_calendar_linking_and_notes.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
reported_by_user_id uuid not null references profiles(id)
room_label text not null           -- free text, matches cleaning_sessions.room_label pattern
reservation_id uuid references reservations(id) on delete set null
guest_name text                    -- reservation-linked guest snapshot
issue_title text not null
description text
category text                      -- optional category key
status maintenance_status not null
image_urls text[] not null default '{}'
cleaning_session_id uuid references cleaning_sessions(id)  -- set when created during active cleaning
created_at timestamptz not null
updated_at timestamptz not null
```

Status values (maintenance_status enum):

```txt
open
in_progress
resolved
closed
```

Note: room is stored as free text `room_label` (same pattern as cleaning_sessions). There is no
property_id or room_id FK. When created from an active cleaning session, `cleaning_session_id` is
set automatically. When created from the reservation calendar linked action, `reservation_id` and
`guest_name` can be stored as optional context snapshots after the server re-validates that the
reservation belongs to the same organization and matches the selected property / room.

## lost_items

Lost and found records.

Migrations: `supabase/migrations/202605210006_lost_items.sql`,
`supabase/migrations/202607090003_reservation_calendar_linking_and_notes.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
reported_by_user_id uuid not null references profiles(id)
room_label text not null           -- free text, matches cleaning_sessions.room_label pattern
property_name text                 -- optional building snapshot for reservation-linked create
reservation_id uuid references reservations(id) on delete set null
guest_name text                    -- reservation-linked guest snapshot
item_name text not null
found_at timestamptz not null
status lost_item_status not null
image_urls text[] not null default '{}'
memo text
cleaning_session_id uuid references cleaning_sessions(id)  -- set when created during active cleaning
created_at timestamptz not null
updated_at timestamptz not null
```

Status values (lost_item_status enum):

```txt
registered
stored
disposal_scheduled
disposed
```

Note: retrieval tracking / disposal extensions are still future scope, but `property_name`,
`reservation_id`, and `guest_name` are now implemented as optional context snapshots for
reservation-linked create flows. The workflow still keeps `room_label` as the primary free-text
location field.

## reservation_internal_notes

Per-reservation internal operator memo used by the admin reservation calendar inspector.

Migration: `supabase/migrations/202607090003_reservation_calendar_linking_and_notes.sql`

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id) on delete cascade
reservation_id uuid not null references reservations(id) on delete cascade
updated_by_user_id uuid references profiles(id) on delete set null
note text not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
unique (organization_id, reservation_id)
```

Notes:
- One note row per reservation per organization.
- Empty save from the admin calendar deletes the row instead of storing blank text.
- This table is operational metadata owned by StayOps, distinct from Beds24 reservation source data.
- Read access is intentionally broader than write access: all active organization members can read
  the note, while create / update / delete remains limited to the privileged reservation-calendar
  operator roles.

## order_requests

Free-text supply/amenity requests. Multiple items per request stored as JSONB.

Migrations: `202606010001_order_requests.sql`, `202606010002_order_requests_delivery_date.sql`, `202606020001_order_requests_delivery_range.sql`

Fields:

```txt
id                    uuid primary key default gen_random_uuid()
organization_id       uuid not null references organizations(id) on delete cascade
reported_by_user_id   uuid not null references profiles(id) on delete restrict
building_name         text not null
room_label            text not null default '-'
title                 text not null
description           text
reason                text
urgency               order_request_urgency not null default 'normal'
status                order_request_status not null default 'requested'
items                 jsonb not null default '[]'    -- array of {id, name, quantity, link, memo, imageUrls?}
delivery_date         date                            -- single delivery date; populated at ordered transition
delivery_start_date   date                            -- range start (mutually exclusive with delivery_date)
delivery_end_date     date                            -- range end; constraint: start <= end, both null or both set
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
```

Constraint: `order_requests_delivery_range_valid` ensures delivery_start_date and delivery_end_date are either both null or both set with start <= end.

Enums:

```txt
order_request_status:  requested | approved | ordered | received | closed
order_request_urgency: normal | high
```

Note: per-transition audit columns are not in the MVP schema. The `status` enum value tracks workflow state. Per-item photo URLs are stored inside `items[].imageUrls` within the JSONB column.

## announcements

Internal notices.

Migrations: `202605100001_announcements.sql`, `202605100003_announcement_images.sql`, and related hardening migrations.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
title text not null
content text not null
created_by_user_id uuid not null references profiles(id)
target_scope text not null
target_property_ids uuid[]
target_roles text[]
is_important boolean not null default false
is_pinned boolean not null default false
show_popup_on_app_open boolean not null default false
popup_until timestamptz
allow_comments boolean not null default true
status text not null default 'draft'   -- draft | published | archived
image_urls text[] not null default '{}' -- up to 5 announcement images in announcement-images bucket
published_at timestamptz
archived_at timestamptz
created_at timestamptz
updated_at timestamptz
```

## attachments (not implemented)

Note: The shared `attachments` table design was planned but not implemented. All feature tables (lost_items, maintenance_reports, order_requests, announcements) store image URLs directly in an `image_urls text[]` column. This is the current production approach.

File limits per feature:

```txt
lost_item images: max 5
maintenance_report images: max 5
order request per-item images: max 5 per item
announcement images: max 5
```

Storage buckets:

```txt
request-images   -- shared image bucket; path: {org_id}/{request_type}/{request_id}/{filename}
                 -- request_type whitelist (storage RLS): lost-items, maintenance-reports,
                 -- order-images, linen-returns, task-images, task-update-images, suggestion-images
                 -- (suggestion-images added 202606160004; part_time_staff may upload only there)
announcement-images -- announcement images
                 -- path: {org_id}/{announcement_id}/{filename}
```

## announcement_reads

Read tracking.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
announcement_id uuid not null references announcements(id)
user_id uuid not null references profiles(id)
read_at timestamptz not null
```

## announcement_comments

Announcement comments.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
announcement_id uuid not null references announcements(id)
user_id uuid not null references profiles(id)
content text not null
created_at timestamptz
updated_at timestamptz
```

## notifications

In-app notification center records.

Base migration: `supabase/migrations/202606030001_notifications.sql`. Enum values were later extended
by `supabase/migrations/202606100003_todo_tasks.sql` (task activity) and
`supabase/migrations/202606110001_task_reminder_notifications.sql` (task reminders).

The notifications table now backs three dispatch surfaces:
- order processing notifications
- Todo / Shared Task activity (shared / update / completed)
- Todo / Shared Task time-based reminders (due-soon / overdue)

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
recipient_user_id uuid not null references profiles(id)
type notification_type not null    -- enum (see values below)
href text not null                 -- in-app navigation target on tap
source_type text not null          -- e.g. "order_request", "task"
source_id uuid not null            -- FK-equivalent to the source record
dedupe_key text not null           -- unique per (recipient, event) to prevent duplicates
payload jsonb not null default '{}' -- event-specific data (order/task title, delivery date, event, etc.)
read_at timestamptz                -- null = unread
created_at timestamptz not null
unique (recipient_user_id, dedupe_key)
```

Notification type values (notification_type enum, as implemented):

```txt
order_processed
task_shared
task_updated
task_completed
task_due_soon
task_overdue
project_shared
suggestion_activity
```

Implementation notes:
- `order_processed` is dispatched when an order request status transitions to `ordered` (and reused,
  with a `kind: "delivery_updated"` payload flag, for a later delivery-date edit).
- `suggestion_activity` (migration `202606160003_suggestion_notifications.sql`) is one type for all
  Staff Suggestions events, distinguished by `payload.event` (`created` / `referenced` / `status` /
  `comment`); fan-out only to valid participants, deep-linking to `/mobile/suggestions/{id}`.
- `task_shared` / `task_updated` / `task_completed` are event-driven from the task server actions and
  fan out only to a task's current participants (org-scoped). `task_updated` is one type distinguished
  by `payload.event` — `edited` (author core edit), `note` (update-log activity), `reopened`.
- `task_due_soon` / `task_overdue` are time-based system reminders produced only by the daily
  `/api/tasks/reminders` cron (`src/lib/notifications/task-reminders.ts`): due-soon = active task due
  today (Tokyo), overdue = active task due before today. The `unique (recipient_user_id, dedupe_key)`
  constraint (key `task_due_soon|task_overdue:<taskId>`) limits each task to one reminder per recipient,
  so the cron never re-spams. See `docs/product/14-notification-design.md` for the full matrix.
- Self-notifications are suppressed for event-driven types (the actor is excluded from recipients).
  Reminders have no actor, so a task's author is intentionally reminded about their own deadline.
- A `schemaUnavailable` graceful fallback is used if the migration has not yet been applied; the
  notifications UI shows an info card instead of crashing.
- Push notifications are not yet implemented; in-app only.

## recurring_work_templates

Recurring work definitions.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
title text not null
description text
property_id uuid references properties(id)
room_id uuid references rooms(id)
frequency_type text not null
frequency_interval integer
created_by_user_id uuid references profiles(id)
is_active boolean not null default true
created_at timestamptz
updated_at timestamptz
```

## recurring_work_occurrences

Generated recurring work instances.

Fields:

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
template_id uuid references recurring_work_templates(id)
property_id uuid references properties(id)
room_id uuid references rooms(id)
due_date date not null
status text not null
completed_by_user_id uuid references profiles(id)
completed_at timestamptz
notes text
created_at timestamptz
updated_at timestamptz
```

# Post-MVP Feature Batch Tables (approved 2026-06-09)

The tables below back the approved post-MVP batch. Full column types, enums, indexes, and RLS detail live in the per-feature technical-design docs (`docs/engineering/08`–`12`); the definitions here are the canonical inventory. The three `linen_*` tables (migration `202606100002_linen_returns.sql`) and the three task tables
(`tasks` / `task_participants` / `task_updates`, migration `202606100003_todo_tasks.sql`) are
**implemented**; the rest are not implemented yet.

## linen_items

Implemented. Selectable linen item catalog. Org-scoped with nullable `building_name`
(`NULL` = available for all buildings; a value scopes the item to one canonical building name).
Building is the canonical property name (text), not a `properties` FK — consistent with the rest
of the app. Current default global set per org is 7 items
(`duvet_single, duvet_double, mattress_single, mattress_double, pillow, towel, mat`); older
generic defaults are retired from the active picker but kept for historical rows. See
`docs/engineering/08-linen-defect-technical-design.md` → "As-Built".

```txt
id uuid primary key
organization_id uuid not null references organizations(id) on delete cascade
building_name text                 -- NULL = all buildings
code text
name text not null
category text
is_active boolean not null default true
display_order integer not null default 0
created_by_user_id uuid references profiles(id) on delete set null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## linen_return_records

Implemented. Building-scoped linen return header. One row = one return registration event.
`building_name` is the canonical property name (text), matching `order_requests.building_name`.
No status column in the first slice.

```txt
id uuid primary key
organization_id uuid not null references organizations(id) on delete cascade
building_name text not null
note text
image_urls text[] not null default '{}'
registered_by_user_id uuid not null references profiles(id) on delete restrict
registered_at timestamptz not null default now()
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

## linen_return_record_items

Implemented. Child item lines under one `linen_return_records` row. `unique (return_record_id,
linen_item_id)` blocks the same item appearing twice in one record (quantities are summed into a
single line instead).

```txt
id uuid primary key
return_record_id uuid not null references linen_return_records(id) on delete cascade
linen_item_id uuid not null references linen_items(id) on delete restrict
quantity integer not null check (quantity > 0)
sort_order integer not null default 0
created_at timestamptz not null default now()
unique (return_record_id, linen_item_id)
```

## tasks

Implemented (migration `202606100003_todo_tasks.sql`). One canonical task + `task_participants`
(one set, author + participants) + `task_updates` (unified log). Private by default; sharing adds
participant rows. `priority`/`status` are text+check (not enums). Notification enum gained
`task_shared` / `task_updated` / `task_completed`; task photos reuse the `request-images` bucket
(`task-images` / `task-update-images` subfolders). All writes go through service-role server
actions with explicit permission checks; reads are RLS-scoped via `is_task_participant()`.

Personal todo / shared task inbox. Private by default, but expandable to one shared task with participant set and common status. See `docs/engineering/09-todo-task-technical-design.md`.

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
created_by_user_id uuid not null references profiles(id)
title text not null
description text
property_id uuid references properties(id)
room_id uuid references rooms(id)
reservation_id uuid references reservations(id)
guest_name text
scheduled_date date
due_at timestamptz
all_day boolean not null default true
time_label text
priority text not null default 'normal'   -- normal | important | urgent
status text not null default 'open'        -- open | in_progress | completed | cancelled
is_inbox boolean not null default true
is_shared boolean not null default false
recurrence_rule text
tags text[]
image_urls text[]
completed_by_user_id uuid references profiles(id)
completed_at timestamptz
created_at timestamptz
updated_at timestamptz
```

Note (2026-06-13): `completed_at` / `completed_by_user_id` (and `status`) are **actively written
again** by the re-introduced complete/reopen actions (`completeTask` / `reopenTask` in
`src/app/mobile/tasks/[id]/actions.ts`). They are no longer dormant — completing a task stamps
`completed_at` (its Tokyo date drives the Completed/기록 tab grouping) and the completing user, and
reopening clears them.

## task_participants

Current participant set for each task.

```txt
id uuid primary key
task_id uuid not null references tasks(id)
user_id uuid not null references profiles(id)
role text not null            -- author | participant
is_first_recipient boolean not null default false
added_by_user_id uuid references profiles(id)
created_at timestamptz
```

## task_updates

Unified task update-log. Covers participant notes plus small system entries such as edited/shared/completed/reopened.

```txt
id uuid primary key
task_id uuid not null references tasks(id)
created_by_user_id uuid references profiles(id)
update_type text not null     -- note | system_edited | system_shared | status_changed | completed | reopened
body text
image_urls text[]
created_at timestamptz
```

## board_posts / board_post_reads / board_comments / board_reactions

자유 게시판 피드. **마이그레이션 `supabase/migrations/202606250001_board.sql` 적용 완료 (2026-06-25).**  
전체 기능 명세: `docs/product/23-board-workflow.md`.

```txt
-- board_posts
id uuid primary key default gen_random_uuid()
organization_id uuid not null references organizations(id) on delete cascade
created_by_user_id uuid not null references profiles(id) on delete restrict
title text                                 -- 선택 (nullable)
content text not null                      -- check: trim 길이 > 0
tags text[] not null default '{}'
image_urls text[] not null default '{}'    -- 최대 5개 (check constraint)
file_attachments jsonb not null default '[]'  -- FileAttachment[] (최대 5개)
is_pinned boolean not null default false
pinned_at timestamptz
pinned_by_user_id uuid references profiles(id) on delete set null
allow_comments boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()  -- set_updated_at() trigger
deleted_at timestamptz                     -- soft delete

-- board_post_reads  (복합 PK: post_id + user_id)
post_id uuid not null references board_posts(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
read_at timestamptz not null default now()

-- board_comments
id uuid primary key default gen_random_uuid()
post_id uuid not null references board_posts(id) on delete cascade
organization_id uuid not null references organizations(id) on delete cascade
created_by_user_id uuid not null references profiles(id) on delete restrict
content text not null                      -- 평문; @이름 / @ALL 토큰을 그대로 저장
image_urls text[] not null default '{}'    -- 최대 3개 (check constraint)
mentioned_user_ids uuid[] not null default '{}'  -- 멘션된 멤버 UUID 배열 (GIN 인덱스)
mention_all boolean not null default false       -- true = @ALL 전체 멘션
created_at timestamptz not null default now()
deleted_at timestamptz

-- board_reactions  (복합 PK: post_id + user_id + emoji)
post_id uuid not null references board_posts(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
emoji text not null
created_at timestamptz not null default now()
```

Indexes: `board_posts_feed_idx (organization_id, created_at desc) where deleted_at is null` · `board_posts_pinned_idx (organization_id, is_pinned, pinned_at desc) where deleted_at is null` · `board_comments_post_idx (post_id, created_at asc) where deleted_at is null` · `board_comments_mentions_idx USING gin (mentioned_user_ids) where deleted_at is null` (2026-06-25, @멘션 UUID 배열 포함 여부 검색용)

> 별도 mention 테이블 미사용: UUID 배열 컬럼 + GIN 인덱스로 충분, 알림은 시점에 발송하므로 영속 관계 불필요.

Storage: 이미지 → `request-images` 버킷 (`board-posts/` / `board-comments/` 서브폴더, part_time_staff 허용). 첨부 파일 → `board-attachments` 버킷 (private, 서명 URL 방향). 경로: `{org_id}/{post_id}/{filename}`.

Permissions: 전체 활성 멤버 (part_time_staff 포함) → SELECT·INSERT. 작성자 또는 owner/office_admin → UPDATE·DELETE.

## staff_suggestions

Structured feedback thread with one required recipient, optional referenced users, recipient-owned status, and participant comments. **Schema implemented (Step 1, 2026-06-16) — migration `supabase/migrations/202606160001_staff_suggestions.sql`.** Server actions / queries / notifications are NOT wired yet (later steps). See `docs/engineering/12-staff-suggestions-technical-design.md`.

```txt
id uuid primary key default gen_random_uuid()
organization_id uuid not null references organizations(id) on delete cascade
created_by_user_id uuid not null references profiles(id) on delete restrict
recipient_user_id uuid not null references profiles(id) on delete restrict
title text not null
body text not null
category text
status text not null default 'submitted'   -- submitted | reviewing | on_hold | completed
hold_reason text
completion_note text
property_id uuid references properties(id) on delete set null
property_name text
room_id uuid references rooms(id) on delete set null
room_label text
image_urls text[] not null default '{}'
created_at timestamptz not null default now()
updated_at timestamptz not null default now()  -- maintained by set_updated_at() trigger
```

CHECK constraints (as built):
- `status in ('submitted','reviewing','on_hold','completed')`
- `char_length(trim(title)) > 0`, `char_length(trim(body)) > 0`
- `recipient_user_id <> created_by_user_id` (cannot address own author)
- `coalesce(array_length(image_urls,1),0) <= 5` (max 5 photos; re-applied server-side)
- `status <> 'on_hold' or trim(hold_reason) <> ''` (hold needs a reason)
- `status <> 'completed' or trim(completion_note) <> ''` (completion needs a note)

Indexes: `(organization_id, created_by_user_id, created_at desc)` Sent · `(organization_id, recipient_user_id, created_at desc)` Received · `(organization_id, status, created_at desc)` status · `(organization_id, property_id, created_at desc)` context.

```txt
staff_suggestion_references
  id uuid primary key default gen_random_uuid()
  organization_id uuid not null references organizations(id) on delete cascade
  suggestion_id uuid not null references staff_suggestions(id) on delete cascade
  user_id uuid not null references profiles(id) on delete cascade
  created_at timestamptz not null default now()
  unique (suggestion_id, user_id)
```

Indexes: `(suggestion_id)` join lookups · `(organization_id, user_id, created_at desc)` Referenced list. (Author/recipient duplication of a referenced user is excluded server-side at write time, not by a DB constraint.)

```txt
staff_suggestion_comments
  id uuid primary key default gen_random_uuid()
  organization_id uuid not null references organizations(id) on delete cascade
  suggestion_id uuid not null references staff_suggestions(id) on delete cascade
  created_by_user_id uuid not null references profiles(id) on delete restrict
  body text
  image_urls text[] not null default '{}'
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()  -- set_updated_at() trigger
```

CHECK constraints: `coalesce(array_length(image_urls,1),0) <= 5` (max 5 photos) · not fully empty (`trim(body) <> '' or array_length(image_urls,1) > 0`). Index: `(suggestion_id, created_at asc)` thread loading.

Visibility helper: `public.can_view_staff_suggestion(target_suggestion_id uuid)` — `SECURITY DEFINER`, returns true if `auth.uid()` is the author, the recipient, or a referenced user (used by the three SELECT policies; bypasses RLS to avoid recursion).

Permissions note: read access is limited to author + recipient + referenced users (+ platform admin). Only the recipient changes status. Referenced users can comment but cannot change status or edit the main suggestion. The author edits/deletes the main suggestion only while `submitted`; comment edit/delete is always comment-author only. These mutation rules are enforced in server actions (later steps); RLS currently grants read-only to participants and routes all writes through the service role.

## bug_reports

StayOps 앱/시스템 버그 및 제품 문제 신고. **1차 구현 (2026-06-25).** Migration: `supabase/migrations/<timestamp>_bug_reports.sql` (DB engineer 결과 확인 후 파일명 갱신 필요).

```txt
id                    uuid primary key default gen_random_uuid()
organization_id       uuid not null references organizations(id) on delete cascade
reported_by_user_id   uuid not null references profiles(id) on delete restrict
title                 text not null
description           text not null
image_urls            text[] not null default '{}'
status                text not null default 'submitted'
reviewed_by_user_id   uuid references profiles(id) on delete set null
closed_by_user_id     uuid references profiles(id) on delete set null
closed_at             timestamptz
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
```

CHECK constraints:
- `char_length(trim(title)) > 0`
- `char_length(trim(description)) > 0`
- `coalesce(array_length(image_urls, 1), 0) <= 5`
- `status in ('submitted', 'reviewing', 'fixed', 'closed')`

Indexes:
- `bug_reports_org_created_idx (organization_id, created_at desc)`
- `bug_reports_reporter_idx (organization_id, reported_by_user_id, created_at desc)`
- `bug_reports_status_idx (organization_id, status, created_at desc)`

Storage: 이미지 → `request-images` 버킷, path: `{organization_id}/bug-reports/{report_id}/{filename}`, 최대 5장.

Permissions: 작성자 본인 SELECT/DELETE(submitted만) · 리뷰어(`owner`, `office_admin`) SELECT · 모든 활성 멤버 INSERT · 리뷰어 status UPDATE. 모든 쓰기는 서비스롤 서버 액션 경유. 자세한 RLS 명세: `docs/engineering/05-rls-permissions.md` → `bug_reports`.

## Attendance / Payroll tables

**As-built — Step 1 schema (2026-06-17), migration `202606170001_attendance_payroll.sql`.** The refined
attendance/payroll policy (decision-log 2026-06-17) is a **session-first** model, not loose event rows.
This supersedes the earlier `attendance_events` / `employment_profiles` draft. Full column-by-column
spec lives in `docs/engineering/11-attendance-payroll-technical-design.md`; this is the data-model
summary. All tables are organization-scoped, carry timestamps, and have **read-only RLS** (no write
policies — all writes go through service-role server actions in later steps; see
`docs/engineering/05-rls-permissions.md`).

Permission foundation:

- `memberships.attendance_payroll_admin boolean not null default false` — explicit per-membership
  attendance/payroll privilege (separate from the broad role names).
- `can_manage_attendance_payroll(org)` SECURITY DEFINER helper = platform admin, OR an active member
  who is the org `owner` or carries the `attendance_payroll_admin` flag. Site master / QR issuance stays
  **owner-only** (enforced in app logic via `has_org_role(org, ['owner'])`).

Tables (11):

| Table | Purpose / key columns |
|---|---|
| `attendance_sites` | registered sites; `latitude`/`longitude`/`allowed_radius_meters` (default **100**), `wifi_ssids text[]` (modeled, PWA-inactive), `is_active`. Owner-managed. |
| `attendance_qr_tokens` | one **active token per site** (partial unique on `site_id where is_active`); reissue revokes + links `replaced_by_token_id`. |
| `attendance_sessions` | the core work session; `status` (open/completed/reopened/invalid), `review_state` (normal/review_required/pending_correction/approved_correction/rejected_correction), separate clock-in/out `*_at/_site_id/_method/_qr_token_id/_lat/_long/_accuracy/_device_info`, `operating_date` (Tokyo), `manual_created*`, `manual_location` (free-text work location for off-site / manual entries, migration `202607100004`; overrides the site name in per-user payroll exports), `invalidated*`. **One `open` session per user** (partial unique on `user_id where status='open'`). Methods: `gps_qr`/`gps_wifi`/`manual`. |
| `attendance_breaks` | multiple breaks per session; `started_at`/`ended_at` (open while null). Clock-out-blocked-by-open-break is server-enforced. |
| `attendance_attempt_logs` | every attempt (success/failure) for admin diagnostics; `action_type`, `method`, `failure_reason` (gps_denied/outside_radius/qr_*/wifi_*/open_break_blocks_clock_out/midnight_crossing/open_session_exists). Admin-visible only; no payroll effect. |
| `attendance_correction_requests` | user-submitted corrections; `status` (requested/in_review/approved/rejected), `reason_type`, `target_month` (YYYY-MM-01, migration `202606180003`), `desired_clock_in/out_at/_site_id`, `memo`, `image_urls` (**max 5**), `review_comment`/`reviewed_*`. |
| `attendance_session_audits` | append-only manager-action trail; `action_type` (manual_create/manual_update/invalidate/restore/correction_apply/reopen/finalize), mandatory `reason`, `before_json`/`after_json`. |
| `employment_type_history` | per-person `employment_type` (hourly/salaried) with `effective_from`/`effective_to`. Past never reinterpreted. |
| `hourly_rate_history` | per-person `hourly_rate` with `effective_from`/`effective_to`. Past never changes. This remains the base contractual/default rate layer; one-off busy-day allowances must not be stored here. |
| `attendance_pay_allowances` | **Implemented (2026-07-10, migration `202607100001`).** Date-based attendance allowance layer for busy/short-staffed days. Columns: `target_date`, nullable `target_user_id` (null = all hourly workers), `allowance_type` (`daily_fixed` / `hourly_extra` — calculation method), `amount_yen`, `category` (`regular` = 추가수당 / `special` = 특별수당, renamed from `reason_type` in migration `202607100003`; decides which payroll column the amount lands in), `memo`, `status` (`active` / `cancelled`), creator/canceller audit fields. Separate from `hourly_rate_history`; reflected into payroll calculation (`attendance-pay.ts`, split into 추가수당/특별수당 buckets) and preserved in the finalized snapshot's `allowance_breakdown jsonb` column. Read-only RLS (own targeted rows or payroll admin); create/cancel via service-role actions only, blocked for a finalized user-month. |
| `attendance_month_snapshots` | per-person per-month payroll snapshot; `status` (draft/finalized/superseded/reopened), `total_paid_minutes`, `gross_amount`, `rate_breakdown jsonb`, `supersedes_snapshot_id`. Migration `202607030003_attendance_finalized_snapshot_unique.sql` enforces at most one `finalized` row per `(organization_id, user_id, target_month)` while preserving historical reopened/superseded rows. |
| `attendance_export_logs` | export audit trail; `export_scope` (monthly_bulk/single_user), `target_month`, `snapshot_ids uuid[]`, `exported_by_user_id`. |
| `transport_reimbursement_reports` | per-user-month transport-cost ledger (migration `202606260001`), **separate from payroll** (`attendance_month_snapshots`). `target_month` (1st of Tokyo month), `status` (draft/submitted/reviewing/approved/rejected/**changes_requested** — the last added in migration `202607030001`; worker-editable like draft/rejected, i.e. "sent back for fixes, please resubmit"), `submitted_at`/`reviewed_at`/`reviewed_by_user_id`/`review_note`, `total_amount_cached` (convenience; items are source of truth). Unique `(organization_id, user_id, target_month)`. Admin review transitions: submitted/reviewing/changes_requested → approved \| rejected \| changes_requested; approved/rejected → **reopen** (back to submitted, drops out of the payroll total until re-approved). |
| `transport_reimbursement_items` | reimbursable transport entries (many per report); `usage_date`, `amount_yen` (>0), `entry_mode` (linked/manual), optional `attendance_session_id`/`property_id`/`room_id`, `work_context jsonb` (building/room/cleaning summary), `memo`, `sort_order`. FKs to session/property/room are `on delete set null`. |
| `transport_reimbursement_item_images` | receipt/proof images per item; `storage_path`, `sort_order`. Image count enforced in app. Storage: `request-images/{org}/transport-reimbursements/{report_id}/{item_id}/{file}` (5-part path). |

Attendance/payroll integrity hardening (2026-07-03):

- Admin manual session writes and correction approval validate chronological order; completed sessions must have `clock_out_at > clock_in_at`.
- Overnight manual clock-out times are resolved to the next Tokyo date when the same-day time would be earlier than clock-in, then flagged for review when crossing Tokyo midnight.
- Finalized user-months are locked against manual session edits, invalidation, restore, and correction approval that would change pay-affecting data.
- Session-less exception approvals create a completed manual attendance session with audit trail.
- Admin payroll/transport views include active members plus inactive members with month activity/snapshots/reports, preventing resigned staff from disappearing from accounting exports.
- Attendance allowances (implemented 2026-07-10) are locked by the same finalized-month rule: once a
  user-month has a finalized snapshot, allowance creation/cancellation for that user-month is blocked
  until reopen and
  re-finalize.

**Step 2 (2026-06-17):** site/QR **backend** — migration `202606170002_issue_attendance_qr_fn.sql` adds
the atomic `issue_attendance_qr(org, site, created_by, token)` function (deactivate old → insert new →
link `replaced_by_token_id`, preserving one-active-per-site). Helpers in `src/lib/attendance-sites.ts`
(create/update/activate site, issue/reissue/revoke QR, list/get/active-QR/history reads). The owner-only
**admin UI is deferred to the web dashboard**; a dev-only `GET /api/dev/attendance/temp-qr` provisions a
temp site + scannable QR for app testing.

**Step 3 (2026-06-17):** worker **GPS + QR clock-in/out** writes `attendance_sessions` (one `open` per
user; Tokyo `operating_date`; clock-in/out site, method `gps_qr`, QR token ref, lat/long/accuracy,
device info; clock-out flags `review_required` when it crosses midnight) and logs every attempt to
`attendance_attempt_logs`. Via `submitAttendanceScan` (`src/app/mobile/attendance/actions.ts`,
service-role); the open session is read by `getCurrentOpenSession` (`src/lib/attendance-sessions.ts`).
In-app QR decode uses the `jsqr` dependency. `attendance_session_audits` are still untouched (manager
edits are a later step).

**Step 4 (2026-06-17):** **break tracking** writes `attendance_breaks` (`startBreak`/`endBreak` in
`src/app/mobile/attendance/actions.ts`): one open break at a time, multiple breaks per session, each row
kept individually (open break has `ended_at` null). Clock-out is blocked while a break is open
(`open_break_blocks_clock_out`). Break rows are not logged to `attendance_attempt_logs` (that table is
GPS/QR-oriented). `getCurrentOpenSession` derives the on-break flag + closed-break total + count for the
home.

**Step 5 (2026-06-17):** worker **self-view history** reads `attendance_sessions` + `attendance_breaks`
(+ `attendance_sites` for names) via `src/lib/attendance-history.ts` (`getAttendanceHistory`,
`getAttendanceTodaySummary`) — **strictly self-scoped** (`user_id` = authenticated user + org; no
client-supplied target). No writes, no pay calc; shapes leave room for later correction/pay indicators.
New screen `/mobile/attendance/history`.

**Step 6 (2026-06-17):** **correction / exception requests** write `attendance_correction_requests`
(`createAttendanceCorrectionRequest` in `src/app/mobile/attendance/actions.ts`) — self-only, current or
previous Tokyo month only, reason + desired in/out times + desired site + memo + image_urls (≤5). The
request **never mutates the session** (admin confirms later). Session-linked or session-less (exception).
Photos use the `request-images` bucket's new `attendance-corrections/` folder (storage migration
`202606170003_attendance_correction_storage.sql`). Reads via `src/lib/attendance-corrections.ts`
(self-scoped); the latest per-session status is surfaced on the history screen.

**Step 7 (2026-06-17):** **admin correction review** — `src/lib/attendance-review.ts` (org-wide review
queue + `isAttendancePayrollAdmin` gate) and `src/app/admin/attendance/actions.ts` (approve / reject /
in-review, owner+`attendance_payroll_admin` only). **Approve** updates the linked `attendance_sessions`
row with admin-confirmed final values (review_state → `approved_correction`, open→completed when both
ends present) and writes an `attendance_session_audits` row (`correction_apply`, before/after). **Reject**
(comment required) updates only the request row (no session change). The review-queue **UI is in the web
dashboard (deferred)**; this is the backend.

**Step 8 (2026-06-17):** **manual admin management** (`src/app/admin/attendance/actions.ts`:
`createManualAttendanceSession` / `updateAttendanceSessionAdmin` / `invalidateAttendanceSession` /
`restoreAttendanceSession` (added 2026-07-02), owner+`attendance_payroll_admin` only). Create sets
`manual_created` + `manual_created_by_user_id` + `manual_created_reason` (methods `manual`); update
edits clock-in/out times+sites+review_state; invalidate sets `status='invalid'` +
`invalidated_at/_by_user_id/_reason` (**never hard-deletes**); restore is invalidate's explicit reverse
(recomputes `status` from the session's own clock-in/out, clears the `invalidated_*` fields, resets
`review_state`, blocked on a conflicting open session). Every action requires a reason and writes an
`attendance_session_audits` row (`manual_create` / `manual_update` / `invalidate` / `restore`,
before/after). No admin web UI beyond the queue panel's restore relabel (deferred otherwise).

**Step 10 (2026-06-18):** **hourly expected-pay** reads `attendance_sessions` + `attendance_breaks` +
`hourly_rate_history` + `employment_type_history` (effective-date resolution) via `src/lib/attendance-pay.ts`
(`getMonthlyPayView`, self-scoped) — usable sessions only, 1-min paid units, breaks excluded, monthly gross
rounded to 10 yen; no writes, no finalization. `attendance_pay_allowances` (implemented 2026-07-10) adds
a separate date-based allowance layer (`daily_fixed` / `hourly_extra`) without changing base hourly-rate
history; `expectedGross` in the pay view now means base wage + allowance (rounded once at the monthly
layer).
New self screen `/mobile/attendance/pay`. The employment/rate
**management** writes (Step 9) are still pending (deferred web dashboard); a dev route
`/api/dev/attendance/seed-pay` seeds `employment_type_history` / `hourly_rate_history` for testing.

**Step 11 (2026-06-18):** **monthly finalization** writes `attendance_month_snapshots`
(`finalizeAttendanceMonth` / `reopenAttendanceMonth`, owner+`attendance_payroll_admin`). Eligibility
(`src/lib/attendance-finalization.ts`) blocks finalize while review-required / pending-correction / open
sessions or an existing finalized snapshot remain. Finalize inserts `status='finalized'`
(target_month=`YYYY-MM-01`, total_paid_minutes, gross_amount [10-yen rounded], rate_breakdown jsonb,
finalized_by/at, supersedes_snapshot_id); prior non-superseded rows → `superseded` (history preserved).
Reopen flips `finalized` → `reopened` (expected pay resumes). Finalize/reopen are audited in the generic
`audit_logs` table (`attendance_month_finalize` / `attendance_month_reopen`, reason in metadata) — no
schema change. The worker self pay view reflects the finalized snapshot; admin finalize/reopen UI is
deferred (web dashboard).

**Step 12 (2026-06-18):** **payroll-totals data layer** (`src/lib/attendance-payroll-totals.ts`,
`getPayrollTotals(org, ym)`) reads `attendance_month_snapshots` (finalized total) + recomputed expected
pay per hourly worker + `attendance_sessions`/`attendance_sites` (site rollup by clock-in site). Returns
finalized vs expected labor totals, unfinalized worker count, and per-site totals. **No writes, no UI**
(dashboard deferred); owner/`attendance_payroll_admin` gate enforced by the caller.

**Step 13 (2026-06-18):** **finalized-only export** (`src/lib/attendance-export.ts` `runPayrollExport` +
`exportMonthlyPayroll` / `exportUserPayroll`) reads `attendance_month_snapshots` (status='finalized'
only) + `profiles` (names), serializes a structured CSV (interim, until the operator Excel template), and
writes an `attendance_export_logs` row (organization_id, target_month, export_scope monthly_bulk/single_user,
user_id, snapshot_ids[], exported_by_user_id, meta). owner/`attendance_payroll_admin` only. No export UI
(deferred); a dev route `/api/dev/attendance/export` streams the CSV for testing.

**Step 14 (2026-06-18):** **notifications** use the shared `notifications` table + new `attendance_activity`
enum value (migration `202606180001`). New table `attendance_open_session_reminders` (migration
`202606180002`, unique per `(organization_id, user_id, operating_date)` — org-scoped per migration
`202606180003`) holds the once-per-Tokyo-day 18:30 reminder response (`still_working` / `left_work`).
Admin alerts (correction_created, abnormal_session) target owner / `attendance_payroll_admin`; the worker
reminder targets the worker. Scheduled scan `GET /api/attendance/reminders` (CRON_SECRET). In-app only.

**Bug-fix pass (2026-06-18)** — migration `202606180003_attendance_session_fixes.sql`:
- Added `target_month date` column to `attendance_correction_requests` (enables per-month export and
  session-less corrections outside the current month).
- Changed `attendance_open_session_reminders` unique constraint from `(user_id, operating_date)` to
  `(organization_id, user_id, operating_date)` — organization isolation was missing.
- Added partial index on `attendance_correction_requests` for session-less corrections
  (`session_id IS NULL`).
- Fixed finalization order bug in `finalizeAttendanceMonth` (insert new row before superseding prior).

Wi-Fi attendance (`gps_wifi`) is modeled but **not active** in the PWA. Shared row types +
status/method/reason unions + constants live in `src/lib/attendance.ts`.

## annual_leave_baselines

**Phase 1 backend only (implemented 2026-07-06), migration `202607060001_annual_leave_hire_date_baseline.sql`.**
Scope is intentionally narrow — only `profiles.hire_date` (see above) + this baseline table. The
request-submission / approval / e-signature / document-generation workflow in
`docs/product/26-annual-leave-workflow.md` is still a planning draft and is NOT implemented.

One row per user: the employee's self-entered "as of today" starting balance for the two pools
tracked by `src/lib/annual-leave.ts` (`computeAnnualLeaveSummary`) — 유급 휴가 (base) and 특별휴가
(one-time 4-year bonus). The accrual schedule itself (10/11/12/14/16/18/20d + 4-year +4d bonus, 2-year
lapse) is computed in app code from `hire_date`, not stored.

```txt
id uuid primary key default gen_random_uuid()
organization_id uuid not null references organizations(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
base_amount numeric(5,1) not null default 0    -- 유급 휴가 pool, as of baseline_date
bonus_amount numeric(5,1) not null default 0   -- 특별휴가 pool, as of baseline_date (usually 0)
baseline_date date not null                    -- Tokyo date the baseline was recorded (auto, = today at save time)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()  -- set_updated_at() trigger
unique (organization_id, user_id)
```

RLS: read-only (self row, or org owner/`attendance_payroll_admin`/platform admin org-wide) — same
shape as `transport_reimbursement_reports`. All writes go through the service-role server action
`setAnnualLeaveBaselineAction` (`src/app/mobile/attendance/leave/actions.ts`), which also sets
`profiles.hire_date`. Self-service upsert — one row per user, overwritten (not versioned) on
re-save. Reads: `getMyAnnualLeaveSummary` (`src/lib/annual-leave-server.ts`) returns null when either
`hire_date` or this row is missing, which routes the mobile screen to the "hire date missing"
self-entry form instead of the balance view.

Not yet implemented (as of this table alone): usage deduction from real submitted/approved leave
requests, an admin edit UI for `hire_date` or this baseline, and enforcement that only salary-based
(non-hourly) employees see this feature. `annual_leave_requests` below adds the request side —
`usedDays`/`specialUsedDays` are still not wired into `computeAnnualLeaveSummary` calls yet (the
requests exist and are readable, but the balance screen doesn't subtract approved usage from them
yet, since there's no approval action to produce an "approved" row in the first place).

## annual_leave_requests

**Phase 2 backend. Stage 1 (request submission/cancellation, implemented 2026-07-06) and stage 2
(admin approval review, implemented 2026-07-07) are both live** — migration
`202607060002_annual_leave_requests.sql` (no new migration was needed for stage 2; it reuses the
approval/reject columns already defined here). Only document output (PDF/print replicating the paper
form, stage 3) remains NOT implemented — see `docs/product/26-annual-leave-workflow.md`.

Confirmed policy this schema encodes:

- approver = any member with `memberships.leave_approver_role` set — either one approving completes
  the request (no sequential chain)
- attachments are optional
- e-signature is an approval "stamp" (button click; name + timestamp recorded on approval), not a
  drawn signature
- 경조휴가(`annual`)/기타(`other`) requests never affect the accrual pools; 유급휴가(`paid`) draws
  the base pool; 특별휴가(`special`) draws the bonus pool only (see `src/lib/annual-leave.ts`)

```txt
id uuid primary key default gen_random_uuid()
organization_id uuid not null references organizations(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade
applicant_name text not null          -- snapshot at submit time, survives later profile name changes
leave_type text not null              -- annual(경조) | paid(유급) | special(특별휴가) | other(기타)
start_date date not null
end_date date not null                -- check: end_date >= start_date
duration_unit text not null default 'full'  -- full | am | pm
days_count numeric(4,1) not null      -- allows .5 for half-day
reason text not null
emergency_contact text not null
image_urls text[] not null default '{}'     -- optional, max 5
status text not null default 'requested'    -- draft | requested | approved | rejected | cancelled
submitted_at timestamptz              -- null while draft
approved_by_user_id uuid references profiles(id) on delete set null
approved_role text                    -- department_head | senior_managing_director (stage 2, unused yet)
approved_at timestamptz
rejected_by_user_id uuid references profiles(id) on delete set null
rejected_reason text
rejected_at timestamptz
cancelled_at timestamptz
cancelled_by_user_id uuid references profiles(id) on delete set null  -- admin revoke or self-cancel (202607090001)
cancelled_reason text                 -- optional (202607090001)
document_number text                  -- 休暇届 no. AL-YYYY-MM-NNN, assigned on approval (202607080001)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()  -- set_updated_at() trigger
```

**Stage 3 — 休暇届 document (implemented 2026-07-08):** `document_number` (migration
`202607080001_annual_leave_document_number.sql`) holds the printable form number `AL-YYYY-MM-NNN`
(`YYYY-MM` = approval month, Asia/Tokyo; `NNN` = zero-padded per-org/month sequence), assigned on approval
(best-effort, never blocks the approval). A partial unique index `(organization_id, document_number)`
guards collisions; the migration backfills existing approved rows. No separate documents table — the A4
休暇届 is derived from the request row + approver name; the 문서 sub-tab reads it via `listLeaveDocuments`.

Permission foundation: `memberships.leave_approver_role text` (values `department_head` = 대표/CEO,
`senior_managing_director` = 전무, matching the two stamp boxes on the paper form's 결재란 — 부서장
column is filled by the company's 대표) + `is_leave_approver(org)` SECURITY DEFINER helper, same
shape as `attendance_payroll_admin`/`can_manage_attendance_payroll` but a role enum instead of a
boolean since the (not-yet-built) printed document needs to know which stamp box an approval fills.

**Stage 2 (implemented 2026-07-07):** `approved_by_user_id`/`approved_role`/`approved_at` and
`rejected_by_user_id`/`rejected_reason`/`rejected_at` are now actually written by the admin approval
queue at `/admin/attendance/leave`, via `approveLeaveRequestForApprover` /
`rejectLeaveRequestForApprover` (`src/lib/annual-leave-approvals-server.ts`, service-role,
organization-isolated, re-verifies `is_leave_approver`). Approve transitions `status: requested →
approved` only from `requested`; reject transitions to `rejected` with an optional (not required)
reason, per confirmed policy. Usage deduction into `computeAnnualLeaveSummary`'s `usedDays`/
`specialUsedDays` is still not wired — approval does not yet affect the balance calculation itself.

RLS: read-only (self row, or `is_leave_approver(org)`/platform admin org-wide) — no write policies;
all writes go through service-role server actions `submitLeaveRequestAction` /
`cancelLeaveRequestAction` / `deleteLeaveRequestDraftAction`
(`src/app/mobile/attendance/leave/actions.ts`). `submitLeaveRequestAction` takes an optional
`requestId`: omitted → insert a new row; present → `updateDraftLeaveRequest` overwrites that row in
place (only while it's still `status = 'draft'`) and, if not saving as a draft again, transitions it
to `requested` — this is how "임시저장" (save draft) is resumed and finished from
`/mobile/attendance/leave/new?id=<id>`. `deleteLeaveRequestDraft` (only callable while still `draft`)
hard-deletes a draft — surfaced as a swipe-to-delete row in `leave-history.tsx` (reuses the
`notification-list.tsx` `SwipeItem` interaction). Storage: optional evidence images reuse
`request-images` at `{org_id}/annual-leave-requests/{request_id}/{filename}` (max 5, same convention
as attendance-corrections/transport-reimbursements).

**Team calendar visibility (2026-07-06, migration `202607060003_annual_leave_approved_visibility.sql`).**
Confirmed: the mobile leave calendar (L5) shows every employee's **approved** leave, including the
viewer's own — an additive SELECT policy `annual_leave_requests_org_approved_select`
(`status = 'approved' AND has_active_membership(org)`) grants this on top of the existing
self-or-approver policy. Pending/rejected/draft/cancelled requests are never visible org-wide.
Query: `listApprovedLeaveForMonth` (`src/lib/annual-leave-requests-server.ts`), rendered by
`leave-calendar.tsx` with real month/year navigation (`?ym=` query) — replacing the earlier
hardcoded July-2026 mock calendar.

## membership_permission_overrides

**Schema designed only (2026-07-09, migration `202607090002_membership_permission_overrides.sql`);
the feature (admin UI + grant/revoke server actions) is NOT implemented yet.** See
`docs/product/27-permission-override-workflow.md`.

Purpose: let `owner` / `developer_super_admin` grant one specific person a specific, named,
**time-bound** feature exception **without** changing their role and without a new migration per
exception type. This is additive to — not a replacement for — the six-role model and the three
existing per-feature flags (`memberships.attendance_payroll_admin`, `memberships.leave_approver_role`,
`profiles.can_generate_report`), none of which this migration touches.

```txt
id uuid primary key default gen_random_uuid()
organization_id uuid not null references organizations(id) on delete cascade
user_id uuid not null references profiles(id) on delete cascade   -- the person receiving the exception
permission_key text not null           -- OPEN whitelist, no DB enum/CHECK (managed in app code, src/config/roles.ts style)
granted_by_user_id uuid references profiles(id) on delete set null
reason text not null                   -- mandatory reason (audit)
expires_at timestamptz not null        -- time-bound BY DESIGN; no permanent grants through this system
revoked_at timestamptz                 -- null = still active (if not expired)
revoked_by_user_id uuid references profiles(id) on delete set null
created_at timestamptz not null default now()
-- check: granted_by_user_id <> user_id   -- DB-level self-grant guard (double defense; server action also checks)
```

Design notes:
- `permission_key` is intentionally free `text` with **no CHECK/enum** — the whitelist is an open
  question (see doc 27) and will be enforced in application code once a concrete first use case locks
  it down, so new keys never require a migration. It can never be `"role"`; role changes stay on the
  existing role-change flow (`updateMemberRole`).
- `expires_at` is `not null` — no permanent/indefinite grants through this system by policy.
- No `updated_at` (revoke is a one-shot write of `revoked_at`/`revoked_by_user_id`); no `set_updated_at`
  trigger.
- Actor columns (`granted_by_user_id`/`revoked_by_user_id`) use `on delete set null` so the audit row
  survives an actor's profile deletion — same convention as `reviewed_by_user_id`/`approved_by_user_id`
  elsewhere.

New SECURITY DEFINER helper `has_permission_override(org, user, key) → boolean` (same style as
`has_org_role`/`is_platform_admin`): true iff an **active** row exists (`revoked_at is null AND
expires_at > now()`). It is **created but not wired into any other table's RLS** — a prepared building
block. Each feature adopts it later by adding `OR has_permission_override(...)` next to its existing
`has_org_role(...)` check; that adoption is out of scope for this migration.

Indexes: partial `(organization_id, user_id, permission_key) where revoked_at is null` (helper hot
path) + `(organization_id, user_id)` (admin browse). RLS: read-only, owner/platform-admin only — see
`docs/engineering/05-rls-permissions.md`.

## Storage buckets — batch note

Linen/board/todo image uploads reuse the existing 5-file client-compressed pattern. The linen tech-design proposes a dedicated `linen-images` bucket as an alternative to reusing `request-images`; pick one at implementation and keep org-id in the storage path (decision pending — see `docs/engineering/08`).

## Initial RLS Direction

Basic rules:

- Users can only access rows for organizations where they have active membership.
- Developer/Super Admin can access all organizations.
- Part-time Staff can create/view requests but cannot change statuses.
- Order request processing is office-level only.
- Price/revenue data is not stored in StayOps MVP reservation tables.

## Resolved Decisions

- CS Staff is treated as office-level for order request processing (can approve/reject/process orders).
- Shared `attachments` table is not used. Each feature table stores `image_urls text[]` directly.
- Hard delete is the MVP policy. Cascades or blocks are handled per-table per FK.
- Reservation raw payloads are stored in `reservations.raw_payload jsonb` for recovery. A separate `beds24_webhook_events` table stores ingestion processing results (webhook + reconciliation) for observability — it is a result log, not raw-payload storage.

## Open Questions

- Which exact actions must be audit logged in MVP?
- Should hard delete cascade related records or be blocked when related records exist (currently varies by table)?
- Will age and profile photo be added to the profile editing screen?
## 2026-07-10 Reservation Calendar Metadata

### `public.property_operation_infos`

Organization-scoped shared building-operation metadata used by both admin and mobile calendars.

- `organization_id`
- `canonical_name`
- `address_ko`
- `address_ja`
- `address_en`
- `shared_access jsonb`
- `room_access jsonb`
- `note`
- timestamps

Constraints / behavior:

- unique on `(organization_id, canonical_name)`
- stores overrides on top of the static property seed metadata
- intended for shared address, access, and ops-note editing from admin calendar
