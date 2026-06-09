# Attendance / Clock-In-Out / Payroll Workflow

Status: Draft

## Purpose

This workflow replaces the current paper timecard process with a PWA-first attendance system and, later, hourly payroll calculation for eligible workers.

Main goals:

- Let workers clock in and clock out from real work sites.
- Use stable on-site QR codes and device location to improve proof quality.
- Support hourly wage calculation for part-time workers and other hourly roles.
- Let salaried employees record attendance without using hourly payroll calculation.

## Scope Caution

Current StayOps docs still describe attendance as out of scope for the first MVP.

This document captures a newly requested direction and should be treated as a planned scope change until explicitly confirmed.

## Why This Module Exists

Current pain points:

- paper timecard workflow
- changing work locations
- different hourly rates by person
- need for admin-controlled role and wage changes
- need for export later

This module is not only attendance logging.

It also needs a path to:

- employment type control
- wage-rate control
- monthly payroll calculation
- export

## User Groups

### Attendance Users

- Staff
- Part-time Staff
- Field Manager
- other active members if attendance is enabled for them

### Payroll Users

- hourly workers only

### Salaried Users

- can use attendance logging
- excluded from hourly pay calculation

### Admin Users

Recommended baseline:

- Owner
- Office Admin
- CS Staff
- possibly Field Manager for limited operational review

## Core Concepts

### Site Master

Attendance must be tied to a workplace/site.

Each site should have:

- stable site identity
- stable QR code
- location data

### Stable QR Code

QR code rule:

- printed and physically attached on site
- should not change casually
- must remain usable over time

### GPS Proof

Baseline direction:

- QR scan alone is not enough
- clock-in/out should also capture device location

Future direction:

- Wi-Fi + GPS can be added later when native app or stronger device capabilities are available

### Employment Type

The system must distinguish:

- hourly
- salaried

This must be admin-controlled, not hardcoded.

### Hourly Rate Management

Hourly rate differs by worker.

Recommended data rule:

- rates should support effective dates
- historical calculations should not change when a future rate changes

## Attendance Flow

Recommended baseline:

```txt
Worker opens attendance screen
Scan site QR
Grant GPS permission
Clock in
Later repeat for clock out
Own attendance history updates
Admin review screen updates
```

## Payroll Flow

Recommended phase order:

1. attendance capture
2. employment type and wage management
3. hourly payroll calculation
4. export

Do not start with export before the pay rules are fixed.

## Required Functional Areas

### Worker Side

- scan QR
- capture GPS
- clock in
- clock out
- view own records

### Admin Side

- site management
- QR management
- employment-type management
- hourly-rate management
- attendance review
- correction flow
- export

## Suggested Fields

High-level required areas:

```txt
site
qr token
timestamp
gps coordinates
user
clock event type
employment type
hourly rate history
pay period
pay calculation result
```

## Important Policy Questions

These must be defined before payroll implementation:

- break deduction
- rounding rules
- lateness handling
- overtime handling
- overnight shifts
- holiday rules
- payroll closing date
- correction approval flow

## PWA Constraints

Real-device testing is mandatory because:

- camera behavior differs by browser
- geolocation permissions differ by device
- background behavior is weaker than native apps

## Suggested First MVP Slice

Recommended first live slice:

1. site master
2. stable QR issuance
3. QR + GPS clock in/out
4. own history
5. admin attendance log review

Recommended second slice:

6. employment type management
7. hourly rate history

Recommended third slice:

8. payroll calculation
9. export

## Open Questions

- Should Field Manager be allowed to review only or also correct records?
- What exact roles are considered hourly workers?
- Should users be able to clock into multiple sites on the same day?
- What should happen if QR is valid but GPS permission is denied?
- Is an anonymous correction request needed?
