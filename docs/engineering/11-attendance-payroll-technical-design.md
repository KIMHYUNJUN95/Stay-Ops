# Attendance / Payroll Technical Design

Status: Draft

## Purpose

This document defines the recommended technical direction for attendance capture, employment type management, hourly rate management, payroll calculation, and export.

## Important Delivery Rule

This feature should be implemented in phases.

Do not start with payroll calculation before the attendance-proof flow and policy rules are confirmed.

## Phase Order

### Phase A

- site master
- stable QR issuance
- PWA QR + GPS clock-in/out
- own history
- admin attendance log review

### Phase B

- employment type management
- hourly rate history

### Phase C

- payroll calculation
- export

## Recommended Tables

### `attendance_sites`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
name text not null
property_id uuid references properties(id)
latitude numeric
longitude numeric
allowed_radius_meters integer
is_active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

### `attendance_qr_tokens`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
site_id uuid not null references attendance_sites(id)
token text not null unique
is_active boolean not null default true
issued_at timestamptz not null default now()
revoked_at timestamptz
```

### `attendance_events`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
site_id uuid not null references attendance_sites(id)
qr_token_id uuid references attendance_qr_tokens(id)
event_type text not null
captured_at timestamptz not null default now()
latitude numeric
longitude numeric
gps_accuracy_meters numeric
device_info jsonb not null default '{}'
created_at timestamptz not null default now()
```

Recommended `event_type` values:

```txt
clock_in
clock_out
manual_correction
```

### `employment_profiles`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
employment_type text not null
attendance_enabled boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `employment_type` values:

```txt
hourly
salaried
```

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

### Possible later tables

- `payroll_periods`
- `payroll_calculations`
- `attendance_corrections`
- `attendance_exports`

## QR Design

Recommended rule:

- issue a stable token per site
- print QR with a URL-safe token payload
- validate server-side

Do not rely on:

- client-only QR validation
- visible plain site names with no server verification

## GPS Design

Recommended baseline:

- capture coordinates and reported accuracy
- compare with site coordinates if geofence policy is adopted

Important:

- do not hard-fail product design until the company defines the exact GPS acceptance rule

## RLS Direction

### Worker access

- users can read their own attendance events
- users insert their own attendance events through controlled server action

### Admin access

- authorized office/admin roles read organization-wide attendance data
- only authorized roles manage sites, employment types, rates, and exports

## Server Actions / Routes

Recommended actions:

- `clockInWithQr`
- `clockOutWithQr`
- `createAttendanceSite`
- `updateAttendanceSite`
- `issueAttendanceQr`
- `setEmploymentType`
- `setHourlyRate`
- `calculatePayrollPeriod`
- `exportPayrollPeriod`

## Current Blockers

Before payroll implementation, the product still needs explicit rules for:

- rounding
- break deduction
- overtime
- holiday handling
- overnight handling
- approval/correction model
- export sheet structure

Until those rules are defined, payroll code should remain in design only.
