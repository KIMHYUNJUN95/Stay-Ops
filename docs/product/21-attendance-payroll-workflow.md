# Attendance / Clock-In-Out / Payroll Workflow

Status: Refined planning draft (policy baseline confirmed 2026-06-17)

## Purpose

This module replaces paper-based attendance tracking and becomes the source of truth for:

- real attendance records for salaried staff
- real attendance records for hourly workers
- monthly gross wage calculation for hourly workers only

This module does **not** handle:

- staff scheduling
- tax, insurance, or deductions
- salaried payroll calculation

Scheduling is handled in another app. StayOps only handles actual attendance records and hourly gross-pay calculation.

## Scope Summary

### Included

- site-based clock-in / clock-out
- QR-based attendance for the first PWA release
- GPS proof for every successful attendance event
- break tracking
- own attendance history
- own monthly wage view for hourly workers
- correction / exception request flow
- admin review
- monthly per-person finalization
- monthly gross labor dashboard for limited admins
- Excel export

### Deferred / Limited

- `GPS + Wi-Fi` attendance is part of the long-term design, but **PWA cannot use it yet**
- in the PWA UI, Wi-Fi attendance should appear as `준비중`
- taxes, insurance, deductions, and company-side payroll processing remain outside this module

## User Model

### Salaried Staff

- use this module for attendance / work record only
- do not receive wage calculation here

### Hourly Workers

- use this module for attendance
- monthly gross pay is calculated from approved attendance data
- hourly users are typically `part_time_staff` or equivalent hourly contracts

### Privileged Admins

- `owner`
- explicitly designated `attendance_payroll_admin`

These privileged admins can:

- review all attendance
- approve / reject correction requests
- manually create attendance sessions
- manage hourly rates and employment type history
- finalize / reopen monthly payroll snapshots
- export payroll data
- view total labor dashboards

### Owner-only Authority

Only the `owner` can manage:

- site master
- site coordinates / radius
- site Wi-Fi SSID configuration
- site QR issuance / replacement

## Core Operating Rules

### Session Model

- attendance is recorded as a **work session**
- one session starts at `clock in`
- one session ends at `clock out`
- a user may have only **one open session at a time**
- a user may have multiple sessions in one day, but only after closing the prior session

### Site Model

- every attendance action is tied to a registered site
- free-text locations are not allowed
- clock-in site and clock-out site may differ
- both must be registered sites
- both must be stored in the session record

### Date Boundary

- all attendance dates use `Asia/Tokyo`
- overnight work is not considered a normal operating case
- if a session crosses midnight, it becomes a review-required abnormal session
- the next day can still start a new session

## Authentication Rules

### PWA First Release

Active method:

- `GPS + QR`

Designed but not active in PWA:

- `GPS + Wi-Fi`

PWA reason:

- browser/PWA delivery should expose Wi-Fi attendance as `준비중`
- the data model should still reserve Wi-Fi method support for a later non-web or extended release

### GPS Rule

- GPS is mandatory
- every successful attendance action requires GPS
- each site has:
  - reference latitude / longitude
  - allowed radius in meters
- default allowed radius: `100m`
- per-site override allowed

If GPS is missing or denied:

- normal attendance fails
- user must use correction / exception request

### QR Rule

- each site has one active QR token at a time
- QR is printed and fixed on-site
- replacement is allowed
- reissuing a QR deactivates the previous token

### Wi-Fi Rule

- Wi-Fi is a long-term supported method in the design
- one site may hold multiple allowed SSIDs
- site SSIDs are distinct per building in the current operating assumption
- PWA release keeps Wi-Fi disabled and marked `준비중`

## Attendance UX

### Successful Clock-In / Clock-Out

On success, show immediately:

- clock-in complete / clock-out complete
- recognized site
- timestamp
- authentication method
- current open-session state
- today cumulative work time

### Failure Handling

On failure, show a specific reason such as:

- GPS permission denied
- outside allowed radius
- QR scan failed
- Wi-Fi unavailable or unsupported in current PWA release
- open break prevents clock-out
- midnight-crossing abnormal state

Then offer:

- retry
- correction / exception request

## Break Policy

### Shared Rules

- the same attendance UI is used by salaried staff and hourly workers
- break start / break end actions are available in the shared UI

### Hourly Workers

- breaks are free-form and may occur multiple times in one session
- only recorded break time is excluded from paid time
- no automatic break deduction
- if an hourly worker does not take a break, all worked time remains paid
- if a break is forgotten or overstated, correction request is used

### Strict Break Closure

- clock-out is blocked while a break is still open
- user must close the break before clocking out
- if the user closes the break late and overstates unpaid time, they can submit a correction request

### Salaried Staff

- salaried users may still record breaks for attendance history
- this module does not calculate salaried pay from those breaks

## Open Session / Missing Clock-Out Rules

- if a user forgets to clock out, the session remains abnormal
- the system does **not** auto-close the session
- the user may still start a new session the next day
- the old session becomes `review required`
- abnormal or incomplete sessions do not enter hourly pay until resolved

### 6:30 PM Reminder

- if a user still has an open work session after `18:30` Tokyo time, show one reminder that day
- choices:
  - `still working`
  - `already left work`
- `still working` keeps the session open and does not ask again that day
- `already left work` does **not** auto clock-out; it sends the user to correction / incomplete-session handling

## Correction / Exception Requests

### Who Can Request

- users may request correction for their own records only
- requestable period: current month + previous month
- older records require admin handling only

### Request Reasons

- missing clock-in
- missing clock-out
- wrong time
- wrong site
- GPS / QR / Wi-Fi authentication failure
- other

### Request Payload

Users may submit:

- desired clock-in time
- desired clock-out time
- desired clock-in site
- desired clock-out site
- memo
- optional photos, up to 5

Users cannot directly change the original record.

### Admin Resolution

- correction state:
  - `requested`
  - `in_review`
  - `approved`
  - `rejected`
- reject comment is required
- approve comment is optional
- final corrected value is always admin-confirmed, not user-self-applied

## Admin Review

### Review Priority

Admin review should surface items in this order:

1. review-required sessions
2. sessions with correction requests
3. incomplete sessions
4. normal completed sessions

### Review Filters

- all
- review required
- correction requested
- incomplete
- manually created
- not finalized this month

Additional filters:

- user name
- date range
- site

### Review Fields

Minimum row data:

- user
- date
- clock-in time / site
- clock-out time / site
- auth method
- break total
- paid duration
- status
- correction request presence

## Audit and Deletion Policy

- attendance records are never hard-deleted
- original records remain preserved
- corrections, invalidations, and superseding actions must leave an audit trail
- manager-side actions require a mandatory reason

Minimum audit history must include:

- actor
- timestamp
- before values
- after values
- reason

### Manual Admin Creation

- `owner` and `attendance_payroll_admin` may manually create a session
- manual records must store:
  - `manual_created = true`
  - creator
  - creation time
  - creation reason

Manual records follow the same correction, review, payroll, snapshot, and export rules as normal records.

## Employment Type and Rate Rules

### Employment Type

- employment type is not inferred only from role
- it is stored per person and managed by privileged admins
- recommended values:
  - `hourly`
  - `salaried`

### Employment Type History

- employment type changes are historical
- change applies from the effective date
- past records never get reinterpreted
- the effective date applies to the whole day

### Hourly Rate

- hourly rate differs per person
- rate changes are historical
- past records never change
- a rate change applies from the effective date
- the effective date applies to the whole day

## Hourly Pay Calculation Rules

This module calculates **gross principal only**.

### Included

- paid work minutes
- approved corrected records
- manually created records once approved/valid

### Excluded

- taxes
- insurance
- deductions
- holiday premiums
- overtime premiums
- night premiums

### Calculation Rules

- work time is tracked in 1-minute units
- hourly workers accumulate paid minutes continuously
- paid time excludes recorded break time
- only closed / resolved sessions count
- review-required, incomplete, or pending-correction records are excluded until resolved
- final gross amount is rounded to the nearest `10 yen`

## Monthly View for Hourly Workers

Hourly workers can see:

- current month expected pay before finalization
- finalized pay after monthly close
- cumulative paid time
- rate segments if rates changed within the month
- excluded record count
- daily breakdown:
  - sessions
  - clock-in / clock-out times
  - break total
  - paid time
  - daily gross amount

They cannot see:

- other users' pay
- total labor cost

## Monthly Finalization

### Finalization Unit

- finalization is done per person per month
- one problematic worker must not block all other workers

### Month Boundary

- month = `1st` through `last day`
- Tokyo operating date

### Finalization Rule

- finalization is manual only
- only `owner` and `attendance_payroll_admin` can finalize
- finalization is blocked if any of these remain:
  - review-required sessions
  - pending correction requests
  - incomplete sessions
  - reopened state

### Snapshot Rule

When finalizing a user-month, store a snapshot that includes:

- target month
- user
- total paid time
- pay by rate segment
- final gross amount
- finalizer
- finalized timestamp

If reopened later:

- prior snapshot remains as superseded history
- a new snapshot is generated on re-finalization

## Dashboard and Visibility

### Default User Visibility

- users can see only their own attendance records
- hourly users can see only their own pay

### Privileged Visibility

Only `owner` and `attendance_payroll_admin` can see:

- organization-wide attendance
- other users' hourly pay
- monthly payroll finalization queue
- monthly total labor dashboards
- export

### Dashboard Metrics

Show both:

- finalized labor total
- expected labor total

Also show:

- number of unfinalized workers
- site-based labor totals

For first slice, site cost rollup is based on the **clock-in site**.

## Export

- monthly bulk export supported
- per-person export supported
- export includes finalized data only
- draft / reopened / unresolved records are excluded
- template is required but still pending from the operator
- Google Sheets compatibility may be added later, but template definition is still pending

Export history must be stored:

- who exported
- when
- which month
- which finalized version set

## Notifications

### Worker-facing

- one daily 18:30 open-session reminder
- correction request status updates

### Admin-facing

Notify `owner` and `attendance_payroll_admin` immediately for:

- correction / exception request created
- incomplete session created
- midnight-crossing abnormal session

## Phase Plan

### Phase A

- site master
- QR issuance / replacement
- GPS + QR attendance in PWA
- Wi-Fi method shown as `준비중`
- shared attendance UI
- own attendance history
- correction / exception requests
- admin review

### Phase B

- employment type history
- hourly rate history
- hourly expected pay
- monthly finalization snapshots
- dashboard

### Phase C

- Excel export
- Google Sheets follow-up if required
- future Wi-Fi activation in a non-PWA or expanded delivery path

## Remaining Open Items

- final Excel export template is still pending from the operator
- future Wi-Fi activation method depends on the final app delivery form beyond the current PWA
