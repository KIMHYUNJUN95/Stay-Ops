# Platform Architecture

## Required Clients

StayOps must support two clients from the beginning:

## 1. Mobile Field App

Primary users:

- On-site staff
- Part-time staff
- Housekeeping staff
- Maintenance staff
- Front desk staff

Primary jobs:

- Check assigned tasks
- Create field reports
- Register lost items
- Submit maintenance requests
- Submit order requests
- Take and upload photos
- Receive push notifications
- View personal/team schedules
- Update task status quickly
- Start and complete cleaning records

Initial recommended implementation:

- PWA/mobile web first
- Native app later if needed

## 2. Admin Web App

Primary users:

- Owner
- Admin
- Office staff
- Managers

Primary jobs:

- View dashboard
- Manage staff
- Manage roles and permissions
- Assign tasks
- Review work status
- View calendar and occupancy
- Review Beds24 reservation data
- Manage announcements
- Manage inventory
- Search and filter records

## Shared Backend

Both clients should use the same backend and database.

Recommended principle:

- Mobile app and admin web app are separate clients.
- Business data lives in one shared backend.
- Permissions decide what each user can see and do.
- One account can access field mode and admin mode depending on role.

## Multi-Tenant Requirement

StayOps must be multi-tenant from the beginning.

Each company/customer should be represented as an organization/workspace. All operational data must belong to an organization so future public release is possible without redesigning the database.

Core rule:

```txt
Every business record needs organization_id.
```

MVP organization creation rule:

```txt
Only Developer/Super Admin can create organizations.
Users join organizations through invitation or invite code.
Self-serve organization signup is deferred until public release planning.
```

Accommodation model:

```txt
Organization
  -> Property
      -> Room / Unit
```

Standalone Airbnb-style properties can use one default room/unit. Hotel-style buildings can contain many rooms.

Role structure:

```txt
Platform:
- Developer/Super Admin

Organization:
- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff
```

## Authentication

Current implementation foundation:

- The initial app uses a temporary mock session provider before Supabase Auth is connected.
- Mock session shape includes `organization`, `user`, `role`, and preferred app mode.
- The provider exists only to stabilize shell, routing, and role-aware UI architecture early.
- Real authentication and authorization must be implemented with Supabase Auth, memberships, platform admins, and RLS.

Required authentication methods:

- Email login
- Google login

Desired authentication method:

- Apple login

Apple login is especially important if the iOS app supports third-party social login.

## Platform Distribution Requirement

The mobile app must be usable on both iOS and Android before public store release.

The admin web app must also show notifications through an in-app notification center.

## Candidate Architecture

```txt
Mobile PWA (Next.js)
        |
        | API / SDK
        v
Shared Backend + Database
        ^
        | API / SDK
Admin Web App (Next.js)

Integration Layer
        |
        +-- Beds24
        +-- Push notifications
        +-- Future external services
```

## Current Recommended Direction

Confirmed MVP direction:

- Mobile: Next.js PWA/mobile web first
- Admin web: Next.js
- Backend/database: Supabase
- Integration layer: Next.js Route Handlers and/or Supabase Edge Functions
- Deployment: Vercel

Later native option:

- React Native + Expo when Apple Developer / Google Play setup is ready

## Key Architecture Questions

- Should mobile and admin live in one monorepo?
- Should both clients share TypeScript types?
- Should backend functions live in the same repo?
- Should admin web be included in MVP or built immediately after mobile foundation?
- Which permissions are enforced in backend/database policies?

## Offline Scope

MVP does not include full offline mode.

Required MVP behavior:

- Show clear network error messages.
- Prevent accidental form loss where possible.
- Retry failed saves/uploads where practical.
- Do not promise offline-first behavior.

Future:

- Draft saving
- Deferred photo upload
- Recent calendar cache
- Recent announcement cache
