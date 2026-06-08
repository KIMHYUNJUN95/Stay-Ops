# Documentation Index

## Purpose

This index helps humans and AI assistants understand the StayOps documentation structure.

Status labels:

```txt
Confirmed: Decision is currently accepted.
Draft: Direction exists but needs more review before implementation.
Future: Documented for later, not MVP.
Living: Must be updated continuously.
```

## Start Here

| Document | Status | Purpose |
|---|---:|---|
| [README](../README.md) | Living | Project entry point |
| [Project Brief](./planning/00-project-brief.md) | Living | Product summary and context |
| [Decision Log](./planning/01-decision-log.md) | Living | Confirmed decisions |
| [Project Workflow](./planning/04-project-workflow.md) | Confirmed | How the project is run |
| [AI Collaboration Rules](./planning/05-ai-collaboration-rules.md) | Confirmed | Rules for Codex/Claude/Cursor/other AI |
| [Implementation Plan](./engineering/06-implementation-plan.md) | Draft | Phase-based build plan |

## Planning Docs

| Document | Status | Purpose |
|---|---:|---|
| [Project Brief](./planning/00-project-brief.md) | Living | Project identity and context |
| [Decision Log](./planning/01-decision-log.md) | Living | Source of confirmed decisions |
| [Next Meeting Agenda](./planning/02-next-meeting-agenda.md) | Draft | Early planning agenda |
| [MVP Priority](./planning/03-mvp-priority.md) | Confirmed | First mobile workflow priorities |
| [Project Workflow](./planning/04-project-workflow.md) | Confirmed | Work process |
| [AI Collaboration Rules](./planning/05-ai-collaboration-rules.md) | Confirmed | Shared AI rules |
| [Current Status](./planning/06-current-status.md) | Living | Completed/in-progress/remaining tracker |

## Product Docs

| Document | Status | Purpose |
|---|---:|---|
| [Product Requirements](./product/00-product-requirements.md) | Living | Overall product requirements |
| [User Roles](./product/01-user-roles.md) | Confirmed | Role definitions |
| [Feature Map](./product/02-feature-map.md) | Living | Product module map |
| [Multilingual Strategy](./product/03-multilingual-strategy.md) | Confirmed | Korean/Japanese/English rules |
| [Organization and Invitations](./product/04-organization-invitations.md) | Confirmed | Org, membership, invite flow |
| [Admin Web IA](./product/05-admin-web-ia.md) | Confirmed | Admin sidebar and screen structure |
| [Property and Room Model](./product/06-property-room-model.md) | Confirmed | Property/room structure |
| [Cleaning Workflow](./product/07-cleaning-workflow.md) | Confirmed | Cleaning timer and records |
| [Maintenance Workflow](./product/08-maintenance-workflow.md) | Confirmed | Maintenance request workflow |
| [Lost and Found Workflow](./product/09-lost-found-workflow.md) | Confirmed | Lost item lifecycle |
| [Order Request Workflow](./product/10-order-request-workflow.md) | Confirmed | Order/supply request workflow |
| [Announcement Workflow](./product/11-announcement-workflow.md) | Confirmed | Announcements and comments |
| [Recurring Work Scheduler](./product/12-recurring-work-scheduler.md) | Confirmed | Periodic work management |
| [Inventory Future Module](./product/13-inventory-future-module.md) | Future | Inventory later |
| [Notification Design](./product/14-notification-design.md) | Draft | Notification triggers |
| [Reservation Calendar](./product/15-reservation-calendar.md) | Confirmed | Beds24 calendar requirements |
| [Mobile Navigation](./product/16-mobile-navigation.md) | Confirmed | Mobile tabs and home layout |
| [User Profile and Directory](./product/17-user-profile-directory.md) | Confirmed | Profile and user directory |
| [Todo / Task Workflow](./product/18-todo-task-workflow.md) | Draft | CS follow-up and operational task memory |

## Design Docs

| Document | Status | Purpose |
|---|---:|---|
| [Design Direction](./design/00-design-direction.md) | Confirmed | Pure-white base + selective Liquid Glass + readability |
| [Google Stitch Handoff](./design/01-stitch-handoff.md) | Confirmed | How to pass Stitch designs |
| [Stitch Screen List](./design/02-stitch-screen-list.md) | Draft | First Stitch screens and prompts |

## Engineering Docs

| Document | Status | Purpose |
|---|---:|---|
| [Technical Options](./engineering/00-technical-options.md) | Confirmed | Selected MVP stack and alternatives |
| [Beds24 Integration](./engineering/01-beds24-integration.md) | Draft | Webhook integration design |
| [Platform Architecture](./engineering/02-platform-architecture.md) | Confirmed | PWA/admin/backend architecture |
| [Deployment Strategy](./engineering/03-deployment-strategy.md) | Confirmed | Vercel/PWA/internal deployment |
| [Data Model](./engineering/04-data-model.md) | Draft | Supabase/PostgreSQL schema draft |
| [RLS Permissions](./engineering/05-rls-permissions.md) | Draft | Supabase RLS policy direction |
| [Implementation Plan](./engineering/06-implementation-plan.md) | Draft | Development phases |
| [Environment Setup](./engineering/07-environment-setup.md) | Draft | Environment variables and service setup |

## Implementation Readiness Checklist

Before coding begins:

- [ ] First Stitch screens created or at least Mobile Home and Cleaning Timer created
- [ ] Data model reviewed
- [ ] RLS permission draft reviewed
- [x] Supabase project decision confirmed
- [ ] Vercel account/deployment owner confirmed
- [ ] Environment variable names drafted
- [x] i18n key strategy confirmed
- [x] Theme token strategy confirmed (light-mode-only; dark mode deferred until post-launch)

## Open Decisions To Resolve Soon

- Which PDF export library to use
- Exact Supabase project setup ownership
- Exact Vercel project/account ownership
- Beds24 webhook event details
- Whether CS Staff can export cleaning records by default
- How hard delete should handle records with attachments

## Maintenance Rule

When a document changes status or a new document is added, update this index.
