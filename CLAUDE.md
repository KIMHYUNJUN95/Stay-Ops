# CLAUDE.md

## Purpose

This file defines project-specific rules for Claude and other AI coding agents working on StayOps.

StayOps is not a generic Next.js demo. It is an operations product for accommodation teams. UI changes, permission changes, workflow changes, and data-model changes can create real operational risk. Keep docs and code aligned at all times.

## Highest Priority Rules

1. Reply to the user in Korean by default.
2. Read the relevant Markdown docs before changing code.
3. If behavior, UI, permissions, routes, statuses, or data shape changes, update the related docs in the same work cycle.
4. `docs/` is part of the source of truth. If docs and code disagree, identify which side is correct and update the other side.
5. After code changes, run `npm run lint` and `npm run build` unless blocked.
6. Do not silently change the tech stack, role model, deletion policy, multilingual strategy, or PWA-first direction.
7. A task is not complete until both code and the matching Markdown docs are updated together in the same completion cycle.
8. Before any code modification, implementation, or feature addition, explicitly ask the user whether work should start. Do not begin coding or editing implementation files until the user clearly says to start.
9. For any feature addition, modification, or behavior change, always update the matching Markdown documentation in the same work cycle to keep docs and implementation aligned. This is mandatory and must never be skipped.

## Read These First

Before making changes, read in this order:

1. `README.md`
2. `docs/planning/01-decision-log.md`
3. `docs/planning/04-project-workflow.md`
4. `docs/planning/05-ai-collaboration-rules.md`
5. `docs/planning/06-current-status.md`
6. `docs/engineering/07-environment-setup.md`
7. Relevant files under `docs/product`, `docs/engineering`, and `docs/design`

## Project Snapshot

- Product: StayOps
- Domain: accommodation and hotel operations
- Users: field staff, part-time staff, office/admin staff
- Languages: Korean, Japanese, English from the start
- Direction: mobile PWA plus admin web in one product

## Current Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Supabase Auth / Postgres / Storage / RLS
- Beds24 integration

Primary commands:

```bash
npm run dev
npm run lint
npm run build
npm run cleaning:normalize-room-labels
```

## Important Directories

- `src/app`: routes, server actions, API routes
- `src/components`: shared UI and domain components
- `src/lib`: i18n, session, Supabase, Beds24, domain helpers
- `src/config`: roles, navigation, routes
- `src/types/database.ts`: generated or maintained DB types
- `supabase/migrations`: database migrations
- `docs`: planning, product, design, engineering source of truth
- `scripts/dev`: local maintenance and backfill scripts

## Core Project Contracts

### 1. Documentation-first workflow

StayOps follows this baseline workflow:

```txt
Plan -> Design -> Document -> Implement -> Test -> Review -> Update documentation
```

For bug fixes, investigation and patching can be fast, but final completion still requires doc sync.

Completion rule:

- Every time a task finishes, update the relevant Markdown docs in the same cycle.
- Treat code changes and doc changes as one unit of completion.
- If implementation changed from the original plan while coding, update the docs again before closing the task.

### 2. Multilingual support is mandatory

- Do not add visible UI text as one-off hardcoded strings.
- Check `src/lib/i18n.ts` first.
- If new copy is needed, add `ko`, `ja`, and `en` together.
- Fallback behavior exists, but new UI should not depend on missing translations.
- This is a **hard rule for every feature addition and every feature modification**.
- Do **not** hardcode Korean UI text temporarily "just for now" during implementation.
- New UI/UX, status labels, validation copy, action labels, empty states, and modal text must be
  designed and implemented as **multilingual from the start** (`ko`, `ja`, `en` together).

### 3. Mobile shell is a shared contract

For `/mobile/*`, treat `src/components/shell/mobile-shell.tsx` as a global contract.

- Keep the scroll-aware top chrome behavior.
- Keep the two-line hamburger menu trigger pattern (shorter bottom line).
- Keep the left slide-out menu behavior.
- Keep the flat **ivory** bottom tab bar with center FAB (rounded top corners, `border-radius: 22px 22px 0 0`). The FAB opens the bottom-bar editor sheet where the user can pick up to 4 tabs. Tabs persist to `profiles.bottom_nav_tabs`.
- Keep the warm **ivory** chrome base: page/shell background (`bg-background`), sidebar, and bottom tab bar are ivory; **cards/sheets stay white** (`bg-surface`) so they lift off the canvas. The brand accent is **deep ink navy/indigo** (`--primary`), not teal/green — do not reintroduce teal/green as the brand color. Liquid Glass accents stay selective (floating sheets, cards, chips, overlays); the global background and tab bar remain solid.
- Do not reintroduce page-specific stacked mobile headers.
- Do not revert to a floating capsule or full-glass tab bar without an explicit design decision.
- **Bottom sheets are a shared contract.** Every slide-up bottom sheet must use the canonical
  **`BottomSheet`** component (`src/components/shell/bottom-sheet.tsx`): slate scrim (`bg-slate-950/45`)
  that fades transparent on drag-down, `bg-surface` `rounded-t-[24px]` `max-w-[460px]` surface, 38px
  `bg-slate-200` grab handle, drag-to-dismiss + scrim-tap + Esc (NO top-right X button), portal to
  `<body>`, body-scroll lock. Do not hand-roll a new sheet shell or introduce warm/tinted scrims,
  other radii, or an X-close. The Liquid Glass order "처리" sheet and center-aligned confirm/delete
  modals are intentional exceptions. See `docs/product/16-mobile-navigation.md` → "Bottom Sheet —
  Canonical Visual Standard".

If shared mobile shell behavior changes, also review and update:

- `docs/product/16-mobile-navigation.md`
- `docs/planning/04-project-workflow.md`
- `docs/planning/06-current-status.md`

### 4. Respect Supabase client boundaries

- Do not mix browser and server Supabase usage carelessly.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code.
- Keep service-role usage in server-only paths.
- When auth routing changes, inspect `middleware.ts` carefully.

### 5. Organization isolation and permissions are server concerns

- All business records are organization-scoped by default.
- Do not rely on UI-only permission checks.
- Enforce access in server actions, queries, and RLS-compatible logic.
- Existing role rules such as part-time restrictions and office-level order processing are intentional. Verify before changing.

### 6. Tokyo timezone matters

This project uses Tokyo operating dates in several important flows.

- Do not casually use raw UTC date slicing for operational logic.
- Review existing patterns before changing cleaning dates, calendar logic, or order delivery dates.

### 7. Upload and storage rules are not arbitrary

- Image upload limit is generally 5 files per feature. **Exception (2026-06-15):** project tasks
  (`tasks.project_id` set) allow up to 20 task-level photos; regular tasks and update-log photos stay
  at 5. Implemented via a `maxImages` prop (uploader + create/edit form) with the cap re-applied
  server-side. See `docs/engineering/09-todo-task-technical-design.md` → Images.
- Client-side compression is part of the current policy.
- Storage path validation and RLS expectations already exist. Do not bypass them casually.

### 8. Deletion policy is sensitive

- MVP user-triggered deletion is hard delete by default.
- Keep confirmation UX for destructive actions.
- Do not switch to soft delete or retention-heavy behavior without explicit user approval.

## High-Risk Change Areas

### i18n

- File: `src/lib/i18n.ts`
- All new visible strings must be translated across `ko`, `ja`, and `en`
- This includes status labels, validation errors, modal copy, and navigation labels

### Auth and routing

- Files: `middleware.ts`, `src/lib/session.ts`, `src/lib/admin-session.ts`, `src/lib/dev-auth.ts`
- Login, onboarding, callback handling, and role redirects are easy regression points
- Track `next` query behavior and protected-route behavior carefully

### Shared mobile UX

- File: `src/components/shell/mobile-shell.tsx`
- Pull-to-refresh, header hide/show, sidebar behavior, and bottom tabs affect many screens at once

### Database and migrations

- Files: `supabase/migrations/*`, `src/types/database.ts`
- Add new migrations; do not rewrite already-applied history casually
- In-app notifications require `supabase/migrations/202606030001_notifications.sql` on the linked Supabase project (run via Dashboard SQL editor or `supabase db push` when CLI is linked)
- Leave remote-history placeholder migrations alone unless there is a very strong reason
- If schema changes, update DB types and related docs in the same cycle

### Beds24

- Files: `src/lib/beds24/*`, `src/app/api/beds24/*`, `src/app/api/dev/beds24/*`
- Webhook-first is a confirmed direction
- Do not regress toward frequent polling without user approval
- Never print tokens or secrets into docs or chat

## Working Style

### Default execution order

1. Read relevant docs and current implementation.
2. Define the impact area.
3. Update docs first if behavior is changing.
4. Make the smallest coherent code change.
5. Run `npm run lint`.
6. Run `npm run build`.
7. Re-sync docs to actual implementation details.

### Ask before changing these

Stop and confirm with the user before changing:

- role permissions
- deletion behavior
- multilingual strategy
- PWA-first direction
- major tech-stack direction
- any implementation that conflicts with a documented confirmed decision

## When Docs Must Be Updated

Update related docs when changing:

- fields
- statuses
- permissions
- route or entry flow
- mobile or admin IA
- storage rules
- RLS or org-isolation behavior
- notification behavior
- calendar calculation rules

Commonly related docs:

- `docs/planning/01-decision-log.md`
- `docs/planning/06-current-status.md`
- `docs/product/07-cleaning-workflow.md`
- `docs/product/08-maintenance-workflow.md`
- `docs/product/09-lost-found-workflow.md`
- `docs/product/10-order-request-workflow.md`
- `docs/product/11-announcement-workflow.md`
- `docs/product/15-reservation-calendar.md`
- `docs/product/16-mobile-navigation.md`
- `docs/engineering/04-data-model.md`
- `docs/engineering/05-rls-permissions.md`
- `docs/engineering/07-environment-setup.md`

## Secrets and Local Files

- Never paste real secret values into docs or chat.
- Especially protect:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Supabase anon and service keys
  - Beds24 API tokens and webhook secret
  - OAuth secrets
  - VAPID private key
- Do not dump full contents of `.env`, `.env.local`, or `cookies.txt`.

## Do Not Touch Casually

- `node_modules/`
- `.next/`
- old applied migrations
- documented role names, statuses, and product terminology without checking the docs first

## Verification

Current baseline verification after code changes:

```bash
npm run lint
npm run build
```

If the change is user-facing, also verify when relevant:

- mobile and admin flows both still work
- `ko`, `ja`, and `en` strings exist
- permission differences still hold
- empty and error states still render correctly

## Expected Reporting Style

- Report in Korean to the user.
- State what changed and which docs were updated.
- If verification was not run, say so explicitly.
- If domain behavior is unclear, ground decisions in existing docs and implementation first.
