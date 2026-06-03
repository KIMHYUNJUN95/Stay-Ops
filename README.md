# StayOps

StayOps is a multilingual hotel and accommodation operations platform for field staff and office/admin staff.

The project starts as an internal company operations app and may later become a public product for other accommodation operators.

## Current Status

Stage:

```txt
Internal rollout ready — Phase 13 QA in progress
```

Core MVP modules are substantially implemented. Auth, onboarding, cleaning workflow, lost-found, maintenance, order requests, announcements, notifications, reservation calendar (Beds24 webhook), CSV exports, profile/directory, and admin web are all live. Remote Supabase migrations are current. See `docs/planning/06-current-status.md` for the full implementation log.

## Development

Install dependencies:

```bash
npm install
```

Run the local development server:

```bash
npm run dev
```

Open:

```txt
http://127.0.0.1:3000
```

Validate the app:

```bash
npm run lint
npm run build
```

## Local Supabase Setup

Create or update `.env.local` with values from the Supabase dashboard:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://sspdgzkytkpmquqsfaup.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Keep the service role key server-only and never paste it into chat or documentation.

## Product Scope

StayOps supports:

- Mobile PWA for field staff and part-time staff
- Admin web app for office/admin users
- Hotel-style buildings
- Airbnb-style standalone properties
- Korean, Japanese, and English
- Light mode and dark mode
- Pure-white operational UI with selective Apple-inspired Liquid Glass accents and strong readability

Core MVP modules:

- Auth and invite flow
- Organization/workspace
- User profile and directory
- Reservation calendar with Beds24 webhook data
- Cleaning timer and cleaning records
- Maintenance requests
- Lost and found
- Order/supply requests
- Announcements
- Notifications
- Recurring work scheduler
- Cleaning record export

Future modules:

- Full inventory management
- Native iOS/Android app with Expo
- Public signup and billing

## Confirmed MVP Tech Stack

```txt
Next.js App Router
TypeScript
PWA-first
Tailwind CSS v4
shadcn/ui + Radix UI
Lucide Icons
Supabase Auth
Supabase PostgreSQL
Supabase Storage
Supabase RLS
Vercel
Web Push + in-app notification center
Beds24 Webhook
React Hook Form
Zod
TanStack Query
TanStack Table
ExcelJS
PDF export library TBD
```

## Deployment Direction

Initial:

```txt
Vercel free/low-cost deployment
*.vercel.app domain
PWA internal use
```

Later:

```txt
Company domain
Apple Developer account
Google Play Console account
React Native / Expo native app if needed
App Store / Google Play release
```

## Documentation Is Source of Truth

All planning, design, technical, and workflow decisions must be reflected in Markdown files.

If code changes behavior, permissions, UI flow, data structure, or technical direction, update the related docs in the same work cycle.

Important:

```txt
No major feature should exist only in code.
```

## Start Reading Here

Read these first:

- [Documentation Index](./docs/INDEX.md)
- [Project Brief](./docs/planning/00-project-brief.md)
- [Decision Log](./docs/planning/01-decision-log.md)
- [Project Workflow](./docs/planning/04-project-workflow.md)
- [AI Collaboration Rules](./docs/planning/05-ai-collaboration-rules.md)
- [Implementation Plan](./docs/engineering/06-implementation-plan.md)
- [Environment Setup](./docs/engineering/07-environment-setup.md)

## Product Docs

- [Product Requirements](./docs/product/00-product-requirements.md)
- [User Roles](./docs/product/01-user-roles.md)
- [Feature Map](./docs/product/02-feature-map.md)
- [Multilingual Strategy](./docs/product/03-multilingual-strategy.md)
- [Organization and Invitations](./docs/product/04-organization-invitations.md)
- [Admin Web IA](./docs/product/05-admin-web-ia.md)
- [Property and Room Model](./docs/product/06-property-room-model.md)
- [Cleaning Workflow](./docs/product/07-cleaning-workflow.md)
- [Maintenance Workflow](./docs/product/08-maintenance-workflow.md)
- [Lost and Found Workflow](./docs/product/09-lost-found-workflow.md)
- [Order Request Workflow](./docs/product/10-order-request-workflow.md)
- [Announcement Workflow](./docs/product/11-announcement-workflow.md)
- [Recurring Work Scheduler](./docs/product/12-recurring-work-scheduler.md)
- [Inventory Future Module](./docs/product/13-inventory-future-module.md)
- [Notification Design](./docs/product/14-notification-design.md)
- [Reservation Calendar](./docs/product/15-reservation-calendar.md)
- [Mobile Navigation](./docs/product/16-mobile-navigation.md)
- [User Profile and Directory](./docs/product/17-user-profile-directory.md)

## Design Docs

- [Design Direction](./docs/design/00-design-direction.md)
- [Google Stitch Handoff](./docs/design/01-stitch-handoff.md)
- [Stitch Screen List](./docs/design/02-stitch-screen-list.md)

## Engineering Docs

- [Technical Options](./docs/engineering/00-technical-options.md)
- [Beds24 Integration](./docs/engineering/01-beds24-integration.md)
- [Platform Architecture](./docs/engineering/02-platform-architecture.md)
- [Deployment Strategy](./docs/engineering/03-deployment-strategy.md)
- [Data Model](./docs/engineering/04-data-model.md)
- [RLS Permissions](./docs/engineering/05-rls-permissions.md)
- [Implementation Plan](./docs/engineering/06-implementation-plan.md)

## Work Process

Use this workflow:

```txt
Plan
Design
Document
Implement
Test
Review
Update docs
Repeat
```

For each feature:

```txt
1. Confirm requirements
2. Update docs
3. Design in Stitch if UI-heavy
4. Implement small vertical slice
5. Test mobile/admin, light/dark, ko/ja/en
6. Update docs if implementation differs
```

## AI Collaboration

Codex, Claude, Cursor, and other AI tools must:

- Read relevant docs before making changes
- Follow confirmed decisions
- Update docs when behavior changes
- Not silently change tech stack, permissions, deletion behavior, i18n strategy, or PWA-first direction

## Next Practical Steps

1. Paste Supabase anon and service role keys into `.env.local`.
2. Apply `supabase/migrations/202605090001_initial_foundation.sql` to the Supabase project.
3. Sign in at `/auth/login`, complete `/onboarding`, and claim the first Developer / Super Admin if this is the first setup account.
4. Continue Super Admin organization creation and invite-code management UI.
3. Start project setup after core design direction is visible.
