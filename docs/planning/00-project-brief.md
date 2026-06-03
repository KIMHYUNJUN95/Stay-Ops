# Project Brief

## Project Name

StayOps

## Meaning

StayOps combines:

- Stay: accommodation, lodging, hotel stays
- Ops: operations

Working meaning:

> An operations app for accommodation teams.

## Product Goal

Build a native app that helps hotel teams manage everyday on-site work quickly, clearly, and collaboratively.

The app should work for:

- Front desk staff
- Housekeeping staff
- Maintenance staff
- Office/admin staff
- Managers
- Part-time staff

## Initial User

The first users are the company's own office staff, on-site staff, and part-time staff.

StayOps will start as an internal operations app used in real work. After the product is proven internally, the long-term goal is to consider public release for other accommodation operators.

## Platform Direction

StayOps must include:

- Native mobile app for on-site staff and part-time staff
- Admin web app for office/admin work

The product is used in the field, but office/admin users also need a web interface for management, oversight, and operational control.

## Initial Business Context

The company operates a mixed accommodation model:

- Hotel-style operations
- Airbnb-style property operations

This means the app should support both structured hotel workflows and flexible property-based operations.

The company's properties include:

- Buildings with multiple rooms
- Standalone house-style properties

The app must therefore support both room-based and property-based operational structures.

## Existing System Context

The company currently uses Beds24 as a channel manager and already has an internal system built with the Beds24 API.

StayOps should eventually integrate with Beds24 to bring reservation, occupancy, and availability data into the app.

Important calendar use case:

- See which guest is staying on which date
- See which rooms/properties are occupied
- See which rooms/properties are available
- Understand schedules in a calendar view similar to TimeTree

The existing internal system is a separate web app and includes integrations with:

- Google Sheets
- Notion
- Slack
- Beds24
- Other automation APIs

Known existing technology of that separate system:

- Firebase database
- React Native
- Node.js

Important distinction:

The existing system focuses on price updates, inventory-related management, occupancy, sales, and operational automation. StayOps has a different product focus: on-site staff work, internal tasks, communication, scheduling, and field operations.

StayOps does not need to follow the existing system's technical stack unless it is still the best option after independent evaluation.

## Problem

Hotel operations often happen across fragmented channels:

- Paper notes
- Personal messenger apps
- Verbal handoffs
- Spreadsheets
- Photos stored on personal phones
- Delayed follow-up between front desk, housekeeping, maintenance, and office teams

This causes:

- Missed tasks
- Unclear ownership
- Slow response times
- Lost history
- Hard-to-search records
- Poor visibility for managers

## Product Promise

StayOps gives hotel teams one shared place to register, assign, track, and complete operational work.

## Initial Scope

The first version should focus on real hotel work, not broad generic task management.

Primary modules:

- Lost and found
- Maintenance requests
- Order and supply requests
- Notifications
- Task status tracking
- Photos and comments
- Role-based access
- Todo/task management
- Announcements
- Internal board
- Work scheduler
- Inventory management

Highest-frequency mobile workflows for the first version:

- Register maintenance issues
- Register lost items
- Start cleaning
- Complete cleaning
- Track cleaning timer
- Create order/supply requests
- Read announcements

Attendance and clock-in/out are not part of the first scope because the company already uses another app for that.

Cleaning staff assignment is also not part of the first scope because the company already uses a separate system for cleaning personnel assignment.

StayOps should focus on cleaning execution records:

- Start cleaning
- Complete cleaning
- Track elapsed cleaning time
- Connect cleaning records to room/property when needed

## Important Product Principles

- Native mobile-first workflow
- Admin web support from the beginning
- Fast task registration
- Clear ownership
- Multilingual from the beginning
- Free to start
- Useful for small hotels first
- Expandable to multi-branch hotel groups later
