# Todoist Admin Console (Legacy Route: `/admin/recurring-work`)

Status: Renamed direction confirmed on 2026-07-22.

## Purpose

The admin sidebar item previously labeled `Recurring Work` is now exposed to users as `Todoist` and is intended to manage the same task workspace used on mobile.

This document supersedes the older separate recurring-work scheduler direction for the current product surface.

## Current Product Direction

- Mobile and admin should point at one shared Todoist/task domain.
- User-facing naming is `Todoist` on both surfaces.
- The current desktop route may temporarily remain `/admin/recurring-work`, but that is a route legacy, not a product name.
- Future desktop work should focus on management/oversight for the same task workspace rather than inventing a second standalone scheduler.

## Relationship To Mobile

- Mobile route: `/mobile/tasks`
- Mobile label: `Todoist`
- Admin route for now: `/admin/recurring-work`
- Admin label: `Todoist`

Both surfaces should refer to the same concept and avoid presenting `Recurring Work` as a separate end-user feature.

## What This Admin Surface Should Eventually Manage

- Today / Tomorrow / Inbox / Shared / Completed / Calendar task visibility
- Project-based work organization
- Shared-task monitoring and follow-up
- Oversight and management actions that are harder to do efficiently on mobile

## Retired Direction

The older idea of a separate `Recurring Work Scheduler` for end users is retired from the current IA. Any future formal facility-routine planning should be reconsidered as an explicit new module, not assumed to still be this screen.
