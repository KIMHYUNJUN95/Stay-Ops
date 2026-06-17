# Attendance / Payroll Technical Design

Status: Refined technical draft (policy baseline confirmed 2026-06-17)

## Purpose

This document turns the confirmed attendance / hourly-pay policy into an implementation-ready technical direction.

Important boundary:

- attendance capture is approved for build
- hourly gross-pay calculation is approved within the narrow rules confirmed on 2026-06-17
- taxes, insurance, deductions, and salaried payroll remain outside this system

## Delivery Phases

### Phase A — Attendance Core

- site master
- QR issuance / rotation
- GPS + QR clock-in / clock-out
- shared staff / hourly attendance UI
- break tracking
- own attendance history
- correction / exception request flow
- admin review queue
- failure attempt logging

### Phase B — Hourly Pay Core

- employment type history
- hourly rate history
- real-time expected pay for hourly workers
- per-person month snapshots
- admin dashboard

### Phase C — Export and Extended Methods

- monthly bulk Excel export
- per-person Excel export
- export audit logs
- Wi-Fi attendance activation in a future non-PWA-capable delivery path

## Architectural Direction

### Session-first model

Do **not** model attendance only as loose event rows.

Recommended core model:

- one `attendance_session` per work session
- one-to-many `attendance_breaks`
- one-to-many `attendance_attempt_logs`
- one-to-many `attendance_correction_requests`
- one-to-many `attendance_session_audits`

Reason:

- the product rules are session-centric
- monthly pay needs closed-session aggregation
- correction, reopening, and audit history are easier to manage on a stable session identity

## Recommended Tables

### `attendance_sites`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
name text not null
property_id uuid references properties(id)
latitude numeric not null
longitude numeric not null
allowed_radius_meters integer not null default 100
wifi_ssids text[] not null default '{}'
is_active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- owner-only maintenance
- one site may hold multiple allowed SSIDs
- Wi-Fi is modeled now even though PWA activation is deferred

### `attendance_qr_tokens`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
site_id uuid not null references attendance_sites(id)
token text not null unique
is_active boolean not null default true
issued_at timestamptz not null default now()
revoked_at timestamptz
replaced_by_token_id uuid references attendance_qr_tokens(id)
created_by_user_id uuid not null references profiles(id)
```

Constraints / behavior:

- enforce one active token per site at a time
- reissue deactivates the previous token

### `attendance_sessions`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
operating_date date not null
status text not null
review_state text not null default 'normal'

clock_in_at timestamptz
clock_in_site_id uuid references attendance_sites(id)
clock_in_method text
clock_in_qr_token_id uuid references attendance_qr_tokens(id)
clock_in_latitude numeric
clock_in_longitude numeric
clock_in_accuracy_meters numeric
clock_in_device_info jsonb not null default '{}'

clock_out_at timestamptz
clock_out_site_id uuid references attendance_sites(id)
clock_out_method text
clock_out_qr_token_id uuid references attendance_qr_tokens(id)
clock_out_latitude numeric
clock_out_longitude numeric
clock_out_accuracy_meters numeric
clock_out_device_info jsonb not null default '{}'

manual_created boolean not null default false
manual_created_by_user_id uuid references profiles(id)
manual_created_reason text

invalidated_at timestamptz
invalidated_by_user_id uuid references profiles(id)
invalidated_reason text

created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `status` values:

```txt
open
completed
reopened
invalid
```

Recommended `review_state` values:

```txt
normal
review_required
pending_correction
approved_correction
rejected_correction
```

Recommended `clock_*_method` values:

```txt
gps_qr
gps_wifi
manual
```

Notes:

- PWA first release should only create `gps_qr` or `manual`
- `gps_wifi` is reserved for later activation
- one user may have only one `status='open'` session at a time
- `operating_date` should use Tokyo date derived from clock-in
- midnight-crossing sessions are not normal; mark `review_required`

### `attendance_breaks`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
session_id uuid not null references attendance_sessions(id)
started_at timestamptz not null
ended_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- multiple breaks per session allowed
- clock-out must be blocked if any break row is still open
- hourly paid minutes exclude only recorded break time

### `attendance_attempt_logs`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
attempted_at timestamptz not null default now()
action_type text not null
resolved_site_id uuid references attendance_sites(id)
method text not null
success boolean not null
failure_reason text
latitude numeric
longitude numeric
accuracy_meters numeric
device_info jsonb not null default '{}'
created_at timestamptz not null default now()
```

Recommended `action_type` values:

```txt
clock_in
clock_out
break_start
break_end
```

Recommended `failure_reason` values:

```txt
gps_denied
gps_unavailable
outside_radius
qr_invalid
qr_scan_failed
wifi_not_supported
wifi_not_matched
open_break_blocks_clock_out
midnight_crossing
open_session_exists
```

Notes:

- attempt logs are admin-visible only
- attempt logs do not affect payroll directly

### `attendance_correction_requests`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
session_id uuid references attendance_sessions(id)
requested_by_user_id uuid not null references profiles(id)
status text not null default 'requested'
reason_type text not null
memo text
desired_clock_in_at timestamptz
desired_clock_out_at timestamptz
desired_clock_in_site_id uuid references attendance_sites(id)
desired_clock_out_site_id uuid references attendance_sites(id)
image_urls text[] not null default '{}'
review_comment text
reviewed_by_user_id uuid references profiles(id)
reviewed_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `status` values:

```txt
requested
in_review
approved
rejected
```

Recommended `reason_type` values:

```txt
missing_clock_in
missing_clock_out
wrong_time
wrong_site
auth_failed
other
```

Notes:

- photos optional, max 5
- reject comment required
- approve comment optional
- approved request must result in admin-confirmed final values, not auto-apply the request verbatim

### `attendance_session_audits`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
session_id uuid not null references attendance_sessions(id)
actor_user_id uuid not null references profiles(id)
action_type text not null
reason text not null
before_json jsonb not null default '{}'
after_json jsonb not null default '{}'
created_at timestamptz not null default now()
```

Recommended `action_type` values:

```txt
manual_create
manual_update
invalidate
correction_apply
reopen
finalize
```

### `employment_type_history`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
employment_type text not null
effective_from date not null
effective_to date
created_by_user_id uuid not null references profiles(id)
created_at timestamptz not null default now()
```

Recommended `employment_type` values:

```txt
hourly
salaried
```

Notes:

- effective date applies to the full Tokyo operating date
- history must not reinterpret the past

### `hourly_rate_history`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
hourly_rate numeric not null
effective_from date not null
effective_to date
created_by_user_id uuid not null references profiles(id)
created_at timestamptz not null default now()
```

Notes:

- the rate effective date also applies to the full operating day
- final hourly gross result is rounded to nearest 10 yen

### `attendance_month_snapshots`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
target_month date not null
status text not null
total_paid_minutes integer not null
gross_amount numeric not null
rate_breakdown jsonb not null default '[]'
finalized_by_user_id uuid references profiles(id)
finalized_at timestamptz
supersedes_snapshot_id uuid references attendance_month_snapshots(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `status` values:

```txt
draft
finalized
superseded
reopened
```

Notes:

- one user-month may have multiple historical snapshots
- only one current non-superseded row should be treated as current

### `attendance_export_logs`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
target_month date not null
export_scope text not null
user_id uuid references profiles(id)
snapshot_ids uuid[] not null default '{}'
exported_by_user_id uuid not null references profiles(id)
created_at timestamptz not null default now()
meta jsonb not null default '{}'
```

Recommended `export_scope` values:

```txt
monthly_bulk
single_user
```

### Authorization Flag

Recommended membership-level flag:

```txt
memberships.attendance_payroll_admin boolean not null default false
```

Reason:

- org-scoped privilege
- separate from broad role names
- matches the product rule: `owner + explicitly designated users`

## Derived Rules

### Paid Minutes

For hourly users only:

```txt
paid_minutes
= completed session minutes
- sum(closed break minutes)
```

Exclude from paid calculation:

- open sessions
- incomplete sessions
- review-required sessions
- pending correction sessions
- invalid sessions

Include after resolution:

- approved corrections
- reviewed manual sessions

### Gross Amount

For each resolved day:

```txt
gross = hourly_rate * (paid_minutes / 60)
```

Monthly total:

- sum all gross segments by effective rate
- round final per-person monthly gross to nearest 10 yen

### No Premium Layers

Do not add:

- overtime multiplier
- holiday multiplier
- public-holiday multiplier
- night multiplier

These are intentionally out of scope for now.

## PWA Implementation Constraints

### GPS

- use Geolocation API
- require explicit permission
- store latitude / longitude / accuracy
- compare against site coordinates and allowed radius

### QR

- use camera-based QR scan in mobile PWA
- QR identifies site token server-side

### Wi-Fi

- model `gps_wifi` in schema and business rules
- in the current PWA release, do not activate it
- show Wi-Fi attendance in UI as `준비중`
- do not attempt pseudo-SSID logic in browser-only code

## Suggested Server Actions / Routes

### Worker-side

- `clockInWithQr`
- `clockOutWithQr`
- `startBreak`
- `endBreak`
- `createAttendanceCorrectionRequest`

### Admin-side

- `createAttendanceSite`
- `updateAttendanceSite`
- `issueAttendanceQr`
- `revokeAttendanceQr`
- `createManualAttendanceSession`
- `updateAttendanceSession`
- `invalidateAttendanceSession`
- `reviewAttendanceCorrectionRequest`
- `setEmploymentType`
- `setHourlyRate`
- `finalizeAttendanceMonthForUser`
- `reopenAttendanceMonthForUser`
- `exportAttendanceMonth`
- `exportAttendanceUserMonth`

### Shared Queries

- `getMyAttendanceSessions`
- `getMyAttendanceMonthSummary`
- `getAttendanceReviewQueue`
- `getAttendanceDashboard`
- `getAttendanceSiteCostSummary`

## RLS Direction

### Default user access

- read own sessions
- read own breaks
- read own correction requests
- read own month summaries
- no direct client-side writes to authoritative payroll data

### Privileged admin access

- `owner` and `attendance_payroll_admin` read org-wide attendance and payroll data
- site master writes should still remain owner-only in application logic

### Service-role writes

Recommended pattern:

- authoritative attendance mutations go through controlled server actions
- RLS may remain conservative/read-focused for complex payroll-sensitive tables

## Finalization Rules

A user-month cannot finalize while any of these exist:

- `review_required` sessions
- `requested` or `in_review` correction requests
- open sessions
- reopened month state

Finalization should:

- compute paid minutes and gross amount
- persist a snapshot
- record audit action

Reopen should:

- preserve prior finalized snapshot as history
- create a reopen trail
- require reason

## Notifications Direction

Worker-facing:

- 18:30 open-session reminder, once per Tokyo day
- correction request outcome

Admin-facing:

- new correction / exception request
- incomplete session detected
- midnight-crossing abnormal session

## Export Rules

- export only finalized data
- support monthly bulk and single-user export
- exclude unresolved / draft / reopened records
- template content remains pending from operator
- store export audit trail

## Current Build Notes

- Phase A can be built now with `GPS + QR`
- Wi-Fi attendance is designed but must remain disabled in the PWA release
- hourly gross-pay logic is now sufficiently defined for implementation
- tax/deduction integration should not be added here
