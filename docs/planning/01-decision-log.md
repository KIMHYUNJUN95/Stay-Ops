# Decision Log

This file records important project decisions.

## 2026-06-16

### Todo Recurrence — switch to Todoist-style single live task (no pre-materialization)

Decision: Recurring Todo tasks are no longer pre-materialized into one `tasks` row per date across a
window. A recurring task is a **single live row** that **rolls forward to its next occurrence on
completion** (and rolls back on undo); the **calendar shows future occurrences as virtual previews**
computed from the rule (display only, no DB rows).

Why: the previous window-materializer flooded the date-agnostic tabs (관리함/공유함) with
duplicate-looking entries (a daily task generated ~50 rows). This is the standard Todoist model and
is storage-efficient (one row per series; previews computed only for the visible month).

Impact:
- `materializeRecurringTasks` deprecated and removed from all read paths; `completeTask` /
  `reopenTask` now roll the series date forward/back.
- One-time cleanup migration `202606160002_collapse_recurring_instances.sql` collapsed existing
  instances to one row per series (applied; 98 rows removed in the dev project).
- See `docs/product/18-todo-task-workflow.md` → Recurring Tasks (As-built 2026-06-16).

### Staff Suggestions / Feedback Box — First-Slice Planning Refinement

Decision: The first Staff Suggestions slice will remain a structured person-directed feedback workflow, not a discussion board and not a public visibility feed. Scope is:

- one required recipient
- optional referenced users
- `Sent / Received / Referenced` lists
- status lifecycle: `submitted` -> `reviewing` -> `on_hold` -> `completed`
- recipient-only status ownership
- participant comments with photo attachments
- notifications for create / reference / status / comment

Additional rules:

- the author may edit/delete the main suggestion only while status is `submitted`
- the recipient is the only user who can change status
- referenced users can read and comment only
- `on_hold` requires a hold reason
- `completed` requires a completion note
- comments stay available at every status and comment edit/delete is comment-author only

Deferred:

- anonymous posting
- broad organization-wide visibility
- votes / reactions
- non-photo attachments
- admin-only moderation flow

Reason:

- keeps the feature distinct from the Internal Board
- keeps confidentiality tied to explicit participants
- makes ownership clear by assigning status to the recipient only

Consequence: Product `22`, tech-design `12`, user-role notes, data-model notes, and RLS guidance must stay aligned with this first-slice rule set.

Status: Planned direction confirmed for design (2026-06-16)

## 2026-06-18

### Auth / Signup / Organization Join Policy Reset

Decision: the login/onboarding policy was redefined before implementation changes. The product now
targets the following auth model:

- Support **Google login/signup** and **standard email + password signup/login**
- Remove **email magic-link** from the product plan
- Treat Google as an **authentication method only**
- Do **not** import Google profile name/phone into StayOps operational profile fields

Required onboarding fields after authentication:

- name
- date of birth
- phone number
- preferred language
- team invite code

Rules:

- Authentication alone does not grant app access
- Users without a valid team invite code cannot use any StayOps features
- Incomplete users must always return to onboarding
- Email signup requires email verification
- Password reset uses reset-email flow
- Password policy: minimum 8 chars, letter + number required, special char optional
- Email login attempts should be temporarily rate-limited after repeated failures

Identity rules:

- The same email address maps to a single StayOps account
- Google and email/password should attach to the same account when the email matches
- Phone number is account-level unique
- If signup is retried on an incomplete account, resume onboarding instead of creating a duplicate account

Invite-code rules:

- Team invite code determines **organization + signup role category**
- Signup categories:
  - Part-time Staff
  - Office Staff
  - Field Staff
  - Part-time Staff (Manager)
  - Owner
- `Owner` invite code is one-time only
- All other invite codes are multi-use with:
  - 3-month validity
  - max 100 joins
- Invite-code success should show the resolved organization and role before final join

Organization rules:

- A user can belong to multiple organizations
- Login should auto-enter the last-used organization
- Organization switching is in-app, not on every login
- Joining an additional organization uses a new team invite code only (no need to re-enter full profile)

Organization-creation rules:

- The first person who creates an organization becomes that organization's first owner
- Not everyone can freely create organizations
- New organization creation requires an allowed organization-creation path/code
- Until dashboard management exists, the initial organization / first owner / initial invite codes are
  bootstrapped manually in the database

Data / account rules:

- Name is organization-visible by default
- Phone number is private by default
- Date of birth is private by default and viewable only by the user plus tightly limited admin access
- Users may edit name / date of birth / phone number later
- Team invite code is not editable after join
- Organization leave and full account deletion are separate actions
- Account deletion requires re-authentication and should preserve operational records while removing
  account access

Status: Confirmed planning baseline (2026-06-18). Implementation and schema cleanup still pending.

## 2026-05-04

### Project Name

Decision: Use `StayOps` as the working project name.

Reason:

- Works better than a hotel-only name if the app later expands to ryokan, motel, pension, guesthouse, residence, or serviced apartment operations.
- Short and easy to use in Korean, Japanese, and English contexts.

Status: Working decision

### Initial Languages

Decision: Support Korean, Japanese, and English.

Status: Confirmed

### Multilingual Implementation Priority

Decision: Korean, Japanese, and English should all be supported from the first implementation. Do not build Korean-only UI first and translate later.

Implementation note:

- Initial app UI localization is centralized in `src/lib/i18n.ts`.
- Korean remains the default fallback, but production UI should not rely on Korean-only hardcoded component strings.
- Authenticated screens should use the user's `profiles.preferred_language` value.

Status: Confirmed

### Language Selection

Decision: Users select their app language during signup and can change it later from My Profile.

Status: Confirmed

### Signup Required Information

Decision: Signup requires name, email or social login, language selection, invitation link or invite code, and phone number. Age and profile photo are optional after signup.

Status: **Superseded by 2026-06-18 auth reset** — current target fields are name, date of birth,
phone number, preferred language, and team invite code.

### Social Login Profile Completion

Decision: Social login may prefill email, name, and profile photo when available, but users must confirm or enter missing required fields. Prefilled profile information should be editable.

Status: **Superseded by 2026-06-18 auth reset** — Google profile data should not auto-fill StayOps
operational profile fields.

### Product Type

Decision: Native app for hotel operations, used by both field staff and office/admin staff.

Status: Confirmed

### Initial Users

Decision: Start with the company's own office staff, on-site staff, and part-time staff.

The product will be tested and improved through internal real-world use before considering public release.

Status: Confirmed

### Initial Business Model Context

Decision: The first operating environment is a mix of hotel operations and Airbnb-style property operations.

Status: Confirmed

### Property Structure

Decision: StayOps must support both multi-room buildings and standalone house-style properties.

Status: Confirmed

### Beds24 Integration

Decision: StayOps should integrate with Beds24 because the company uses Beds24 as its channel manager and already has an internal system using the Beds24 API.

Primary goal:

- Bring reservation, occupancy, availability, room, and property schedule data into StayOps.

Status: Confirmed as required, detailed implementation TBD

### Existing Internal System Stack

Decision: The current internal system is a web app with multiple API automations and uses Firebase, React Native, and Node.js.

Integrated services include:

- Google Sheets
- Notion
- Slack
- Beds24

Status: Confirmed

### Relationship to Existing Internal System

Decision: StayOps can be designed separately from the existing internal system.

Reason:

- The existing internal system focuses on price updates, occupancy, sales, inventory-related operations, and automation.
- StayOps focuses on on-site staff work, communication, tasks, schedules, and field operations.
- StayOps does not need to inherit the existing system's technical stack by default.

Status: Confirmed

### Client Platforms

Decision: StayOps needs both a native mobile app and an admin web app.

Reason:

- On-site staff and part-time staff need a fast mobile workflow.
- Office/admin users need a web interface for management, oversight, calendar work, and operational control.

Status: Confirmed

### First Mobile Workflow Priorities

Decision: The most important mobile workflows are maintenance issue registration, lost item registration, cleaning start/completion with timer, order/supply requests, and announcements.

Attendance and clock-in/out are excluded because another app already handles them.

Status: Confirmed — **the attendance/clock-in-out exclusion was reversed on 2026-06-09. See "2026-06-09 / Feature Batch Scope Decision → Attendance / Clock-In-Out + Payroll" below. The rest of this priority list still stands.**

### Cleaning Assignment Scope

Decision: Cleaning staff/personnel assignment is excluded from StayOps first scope because a separate system is already used for that.

StayOps should focus on cleaning execution tracking: start, timer, completion, and room/property record.

Status: Confirmed

### Authentication Methods

Decision: StayOps should support email login and Google login. Apple login is desirable, especially for iOS.

Status: Confirmed, implementation details TBD

### Signup and Google First-Login Policy

Decision:

- StayOps must provide an explicit signup flow in addition to login.
- Google login is an authentication entry only; first-time Google users are not considered fully onboarded.
- After Google auth succeeds, users must complete required member profile fields before app access is granted.
- Required profile fields after Google auth: name, phone number, preferred language, and invite code (or valid invite link) according to onboarding policy.
- If Google provides prefilled values (for example name/email), users can edit them and must confirm completion.

Status: Confirmed (2026-06-02)

### Organization Model

Decision: StayOps must support company/workspace separation from the beginning.

Reason:

- The company currently has about 10 employees and more than 40 part-time staff.
- More users will be added over time.
- Future public release requires each company/customer to have separated data.

Status: Confirmed

### Staff Onboarding

Decision: Recommended onboarding approach is invite-based plus invite-code support.

Reason:

- Admin email invitations are safer for employees and managers.
- Invite codes are convenient for part-time staff and larger onboarding.
- Admin approval and role assignment should protect access.

Status: Recommended

### Initial Role Structure

Decision: Use the following initial roles:

- Developer/Super Admin
- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff

Maintenance responsibility belongs under Field Manager rather than a separate role for the first version.

Status: Confirmed

### Part-Time Staff Data Access

Decision: Part-time staff can see all guest/reservation information except price/revenue-related information.

Reason:

- Field work requires visibility into room/property and guest information.
- Price and revenue information is not needed for part-time field work.

Status: Confirmed

### Check-In and Check-Out Rules

Decision: Default check-in time is fixed at 16:00. Default check-out time is 10:00.

Early check-out can change the expected check-out time by about 1 to 3 hours and must be entered manually by CS staff because this information is received through direct guest communication.

Status: Confirmed

### Current Property Names

Decision: Current known properties are Arakicho A, Arakicho B, Kabukicho, Takadanobaba, Okubo A, Okubo B, and Okubo C.

Status: Confirmed as current working names

### Upcoming Hotel Property

Decision: A larger hotel-style building is expected around July with about 26 rooms, but the name, room numbers, and detailed structure are not decided yet because it is still under construction.

Status: Known future requirement

### Admin Web Core Areas

Decision: The admin web app must treat calendar/occupancy, check-in/check-out, cleaning status, maintenance, lost and found, order/supply requests, and announcements as core frequently used areas.

Staff management and inventory are also important admin areas.

Status: Confirmed

### Cleaning Timer Behavior

Decision: Cleaning staff select a room/property, tap start cleaning, tap complete cleaning, and StayOps records total cleaning duration.

One staff member may clean up to about 2 rooms/properties per day.

Status: Confirmed

### Cleaning-Linked Issue Reporting

Decision: During an active cleaning record, staff should be able to report lost items and maintenance issues without leaving the cleaning context. The created records should automatically link to the cleaning record, property, and room/unit.

Status: Confirmed

### Cleaning Photo Strategy

Decision: Completion photos are useful, but uploading about 30 photos per room may create high server/storage cost.

MVP recommendation:

- Do not require bulk completion photo upload.
- Use optional compressed photos for issue evidence.
- Prefer photos on lost item or maintenance reports instead of normal cleaning completion.

Status: Recommended

### Maintenance Request Fields

Decision: Maintenance requests need room/property, problem description, photos, priority, reporter, processing status, and memo.

Status: Confirmed

### Maintenance Categories

Decision: Initial categories are electric, water, air conditioning/heating, Wi-Fi, furniture, appliance, cleaning condition, supplies, damage, and other.

Status: Confirmed

### Maintenance Meaning

Decision: Maintenance is not limited to broken items. It also covers missing items, operational issues, and anything part-time staff cannot resolve themselves.

Status: Confirmed

### Lost and Found Fields

Decision: Lost item records need found property/room, item name, photos, found date/time, reporter, guest/reservation link, retrieval tracking, memo, and status.

Storage location is not required for MVP.

Status: Confirmed

### Lost and Found Auto-Fill Rules

Decision: Lost item creation should use different auto-fill behavior depending on entry point.

From active cleaning timer:

- Property/room auto-filled from the active cleaning room.
- Found date/time auto-filled from registration time.
- Reporter auto-filled from current user.
- Guest/reservation auto-suggested from that room's checkout guest when available.
- Before final submit, show a confirmation popup asking whether the auto-filled room is correct.
- Provide a pencil/edit action for correction.

From Lost and Found tab:

- User selects property/room manually.
- After room selection, app shows the most recent checkout guest for that room as suggested reservation/customer link.
- User can edit or clear the suggested link.
- Found date/time and reporter remain auto-filled.

Status: Confirmed

### Lost and Found Retrieval Meaning

Decision: Retrieval means the customer/guest has picked up or received the lost item.

It does not mean staff internally collected the item from the room.

Status: Confirmed

### Lost and Found Retrieval Processing

Decision: Retrieval processing does not need a detailed required form in the first version.

The staff member who gives the item to the guest or arranges shipment can mark the item as retrieved. The app should record who processed retrieval and when.

Status: Confirmed

### Order Request Flow

Decision: Staff/part-time staff create order requests. Office Admin reviews and approves or rejects. If rejected, the requester receives a notification with the rejection reason. If approved, Office Admin orders/prepares the item and marks it as ordered/completed. The requester receives a notification when ordering is completed.

Status: Confirmed

### Order Request Fields

Decision: Order requests require property/building, item name, quantity, optional photo, optional product/reference URL, optional reason, requester, status, and memo.

Order requests are property/building-level, not room-level.

Status: Confirmed

### Inventory Scope

Decision: Inventory management is not included in the first MVP because the detailed requirements are not decided yet.

It should remain documented as a future module.

Status: Confirmed

### Cleaning Overdue Notification

Decision: Cleaning normally starts around 10:00 and should be completed by 16:00 at the latest. If a cleaning timer is still in progress after 16:00, StayOps should send one overdue notification to the responsible staff and manager/admin recipients.

Status: Confirmed

### Mobile Internal Distribution

Decision: StayOps must be usable on both iPhone and Android before public store release.

Public App Store / Google Play release is not planned immediately, but the app should be designed for future release.

Status: Confirmed

### Developer Account Status

Decision: The company does not currently have Apple Developer or Google Play Console accounts.

These accounts must be prepared before reliable internal iOS/Android distribution.

Status: Confirmed

### Initial Cost Constraint

Decision: StayOps must start as free/low-cost as possible.

Apple Developer account will likely not be created immediately and should be prepared later before native app release.

Status: Confirmed

### Initial Platform Strategy

Decision: Because the project must start free/low-cost and Apple Developer account is not available yet, the first implementation should strongly consider PWA-first.

Native Expo app can be considered later before store release or when stable native mobile push becomes necessary.

Status: Recommended

### Initial Hosting

Decision: Use Vercel for the initial internal PWA/admin web deployment. Company domain can be connected later if available.

Status: Confirmed

### Reservation Calendar Requirements

Decision: Beds24 reservation calendar must show date, property/building, room/unit, guest name, check-in date, check-out date, number of guests, and whether there is an empty room/property for the selected day.

Mobile must include a TimeTree-like monthly calendar by property/building, plus separate views for today's check-ins, today's check-outs, guests staying today, and empty rooms/properties.

Status: Confirmed

### Reservation Calendar Date Range

Decision: StayOps reservation calendar only needs current month plus the next 2 months for MVP.

Historical data from 2022 onward is available in the existing internal system but does not need to be shown in StayOps.

Status: Confirmed

### Beds24 Webhook Strategy

Decision: Use Beds24 webhooks instead of frequent polling/scheduled sync as the primary reservation update strategy.

Reason:

- Better real-time behavior.
- Avoid unnecessary server/API cost.
- Beds24 official documentation supports booking webhooks and recommends avoiding high-frequency GET calls.

Status: Confirmed as preferred strategy

### Reservation Status Visibility

Decision: Show only confirmed/valid reservations in the reservation calendar. Cancelled reservations should be removed from the visible calendar and should not count as occupied.

Status: Confirmed

### Reservation Memo Visibility

Decision: Beds24 reservation notes/memos are not required in the MVP reservation calendar or reservation detail popup.

Status: Confirmed

### Empty Room Definition

Decision: A room/property is considered empty on a date when there is no reservation bar on that date. Cleaning status is not part of the empty-room calculation for MVP.

Status: Confirmed

### Earliest Empty Availability List

Decision: StayOps should include a list that shows the earliest empty availability from today onward, including today. Users can view this for the selected property/building or for all properties/buildings. When all properties are selected, show the earliest empty availability per property/building.

Status: Confirmed

### Mobile Bottom Navigation

Decision: Use five mobile bottom tabs: Home, Calendar, Cleaning, Requests, and Announcements.

Home includes quick actions for start cleaning, maintenance issue, lost item, and order request.

Status: Confirmed

### User Profile and Directory

Decision: Users need a My Profile feature to edit their own basic information such as name, age, and phone number. StayOps also needs a user directory where organization members can see all registered members and call them with a phone button.

Status: Confirmed

### Admin Web Navigation

Decision: Use the following admin web sidebar for MVP: Dashboard, Calendar, Check-In/Out, Cleaning, Maintenance, Lost & Found, Orders, Announcements, Recurring Work, Users, Settings.

Inventory is excluded from MVP navigation and remains a future module.

Status: Confirmed

### Mobile Home Priority

Decision: Mobile Home should show active cleaning timer first, then important/popup announcements, today check-in/check-out summary, quick action buttons, and today's my activity records.

Today's my activity records are automatically created from user actions such as cleaning start and cleaning completion.

Status: Confirmed

### Cleaning Room Selection

Decision: Cleaning start should primarily select room/property from today's check-out list. Search-based property/room selection should also be available as a secondary method.

Status: Confirmed

### Cleaning Completion Confirmation

Decision: When staff taps Complete Cleaning, show a confirmation popup before final completion. The popup should show room/property, cleaning start time, and approximate elapsed time. Special notes are optional and not required.

Status: Confirmed

### Cleaning Timer Shortcuts

Decision: Active cleaning timer screen should show shortcuts for lost item registration, maintenance issue registration, special note, and cleaning completion. Lost item and maintenance records created from the timer must also appear in the normal Requests tab/admin web lists.

Status: Confirmed

### Cleaning Record Export

Decision: Office/admin users and Field Manager or higher roles need to export cleaning records as Korean Excel or PDF files. Exports should include who cleaned which room/property, when, and total duration.

Status: Confirmed

### Request Visibility

Decision: Maintenance requests, lost item records, and order requests can be created and viewed by all users. The mobile Requests tab should also include a "My registrations" view for records created by the current user.

Status: Confirmed

### Request Status Change Permission

Decision: Request status changes are allowed for Field Manager, Admin, Office Staff, and Staff roles in general. Part-time Staff cannot change statuses.

Order request approval/rejection/ordered processing is more restricted: only Office Staff, CS Staff, Admin, Owner, and equivalent office-level roles can process order request statuses.

Status: Confirmed

### CS Order Request Permission

Decision: CS Staff is treated as office-level for order request processing in MVP.

Status: Confirmed

### Request Edit and Delete Permission

Decision: Any user can edit/delete records they created. Part-time Staff can only edit/delete their own records.

Status: Confirmed

### Delete Behavior

Decision: User-triggered deletion should be hard delete in MVP. A confirmation popup must be shown before deletion.

Status: Confirmed

### Photo Upload Limits

Decision: Maintenance requests, lost items, order requests, and announcements can each support up to 5 photos/images.

Cleaning completion photo upload is deferred for MVP. If the company later accepts storage cost for public release or expanded internal use, cleaning completion may support up to about 30 photos per room.

Status: Confirmed

### Image Compression Policy

Decision: Images should be automatically resized and compressed before upload for MVP.

Recommended settings:

- Long edge max 1600px
- JPEG/WebP compression
- Quality around 70-80%

If the company later accepts higher storage/bandwidth cost, image quality can be upgraded.

Status: Confirmed

### Offline Scope

Decision: MVP does not include full offline mode. The app should instead handle network errors clearly, prevent accidental form loss where possible, and retry failed saves/uploads where practical.

Status: Confirmed

### Mobile Reservation Calendar Layout

Decision: The mobile monthly calendar should use a date-based month view with reservation bars inside date cells. Tapping a reservation bar opens guest/reservation details.

Status: Confirmed

### Reservation Bar Display

Decision: Reservation bars should display guest name and number of guests only. Tapping the reservation bar opens a popup/detail panel with full guest and reservation information.

Status: Confirmed

### Reservation Phone Actions

Decision: Reservation detail popup should support both copying the phone number and calling the phone number.

Status: Confirmed

### MVP Organization Creation Flow

Decision: Use the recommended MVP organization onboarding flow.

Rules:

- Only Developer/Super Admin can create organizations during MVP.
- General users cannot create companies/workspaces by themselves.
- Employees join by email invitation.
- Part-time staff join by invite code.
- Owner/Office Admin can manage invitations, invite codes, roles, and deactivation.

Status: **Superseded by 2026-06-18 auth reset** — target rule is organization creation through an
allowed organization-creation path/code, with the first creator becoming the first owner.

### Invite Code Policy

Decision: Invite codes should support code name, default role, expiration date, maximum uses, and active/inactive status.

Recommended default role for part-time onboarding is Part-time Staff.

Status: Confirmed

### Post-Login Routing

Decision: Use one account system with role-based default routing and mode switching.

Default route:

- Developer/Super Admin, Owner, Office Admin, and CS Staff enter admin web.
- Field Manager, Staff, and Part-time Staff enter mobile field home.

Mode switching:

- Admin-capable roles can switch between admin mode and field mode.
- Staff and Part-time Staff only access field mode.

Status: Confirmed

### Order Request Item Input

Decision: Order item names should be free-text input rather than fixed catalog selection for the first version.

Reason:

- Amenities and supplies vary too much.
- New items may need to be requested depending on situation.

Status: Confirmed

### Order Request Price Scope

Decision: Order request MVP should not include price, estimated cost, unit cost, cost center, or budget fields.

Reason:

- Requesters should be able to submit quickly from the field.
- Price-related work is not needed for the initial order request workflow.
- Product/reference URL is enough when the requester knows where the item can be purchased.

Status: Confirmed

### Order Request Non-Scope

Decision: Order request MVP should not include payment, shipping, delivery tracking, arrival tracking, courier, tracking number, or receiving/stock-arrival workflows.

Reason:

- The feature exists so field staff can ask the office for needed supplies/items.
- The important information is which property/building needs what item, how many, and who requested it.
- Purchasing, payment, and delivery details are outside the first workflow.

Status: Confirmed

### Order Request Multiple Items

Decision: One order request can include up to 40 requested item rows.

Rules:

- Each item row should at minimum support item name and quantity.
- Optional URL/photo/reason/memo can be included without making the requester-side UI feel like a spreadsheet.
- Requester-side UX must stay simple despite supporting multiple items.

Status: Confirmed

### Order Request Requester Simplicity

Decision: Order request screens should preserve full workflow functionality while keeping the requester-side experience simple and low-friction.

Rules:

- Requester creates a quick request with property/building, item name, quantity, optional URL, optional photo, optional reason/memo.
- Office-level roles handle approve/reject/ordered processing.
- Office-side workflow can show more actions, but requester-side screens should not look like purchasing/admin forms.

Status: Confirmed

### Announcement Write Permission

Decision: All roles except Part-time Staff can create announcements.

Status: Confirmed

### Announcement Targeting

Decision: Announcements should support everyone, specific property/building, specific role, and combined targeting.

Status: Confirmed

### Announcement Features

Decision: Announcements need read tracking, important/pinned settings, comments, up to 5 images, and optional app-open popup display.

Status: Confirmed

### Announcement Comment Permission

Decision: Users who can view an announcement can comment on it. For an everyone-targeted announcement, everyone can comment.

Status: Confirmed

### Work Scheduler Meaning

Decision: The work scheduler is separate from the Beds24 reservation calendar.

It is for recurring property/room operational work such as weed removal, air conditioner filter work, waxing, and other periodic annual/seasonal work.

Status: Confirmed

### Todo / Task Purpose

Decision: Todo/Tasks should work as a lightweight operational memory and follow-up system, especially for CS staff.

Purpose:

- Remember guest-related follow-ups.
- Track room/property-specific notes that need action.
- Record customer promises or special handling.
- Help staff avoid forgetting small operational details.

Todo/Tasks should feel fast and convenient like Todoist, while staying connected to StayOps properties, rooms, guests, and reservations.

Status: Confirmed

### Recurring Work Creation Permission

Decision: Existing recurring work items will initially be entered by Developer/Super Admin. Field Managers also need permission to create recurring work schedules.

Recommended creation/edit roles:

- Developer / Super Admin
- Owner
- Office Admin
- Field Manager

Status: Confirmed

### Lost and Found Statuses

Decision: Initial lost item statuses are registered, stored, disposal_scheduled, and disposed.

Status: Confirmed

### Lost and Found Storage Policy

Decision: The company generally stores lost items for 2 weeks. Expensive items may be stored longer in rare cases.

Requested automation:

- If retrieval does not happen, automatically move the item to disposal_scheduled after 30 days.
- If there is still no action after an additional period, automatically delete or finalize the record.

Recommended implementation detail:

- Prefer disposed/archived over immediate hard deletion to preserve operational history.

Status: Confirmed policy, final deletion/archive details TBD

### Technical Stack

Decision: Use Next.js App Router + TypeScript PWA-first, Tailwind CSS v4, shadcn/ui/Radix UI, Supabase Auth/PostgreSQL/Storage/RLS, Vercel, Web Push/in-app notifications, and Beds24 webhook integration for MVP.

Supporting libraries:

- React Hook Form
- Zod
- TanStack Query
- TanStack Table
- Lucide Icons
- ExcelJS
- PDF export library TBD

React Native/Expo can be added later when native app store release becomes necessary.

Status: Confirmed

### Design Direction

Decision: Use a pure-white operational base with selective Apple-inspired Liquid Glass accents and stronger business-app readability.

Layouts and wireframes will be created with Google Stitch.

Status: Confirmed

### Theme Modes

Original decision: StayOps must support both light mode and dark mode for mobile PWA and admin web screens.

Status: **Superseded (2026-06-08)** — Dark mode is deferred until after the official launch. For the MVP and internal rollout, StayOps is **light-mode-only**. All dark-mode code, styling (`dark:` utilities, dark CSS variable blocks), theme state/persistence, and theme-toggle UI have been removed. The `profiles.theme_preference` column/enum remains in the database (already-applied migration, `not null default 'system'`) but is no longer read or written by the app; its removal is out of scope for now (see Current Status). Dark mode may be revisited post-launch as a fresh slice.

### Theme Preference

Original decision: Users can choose System, Light, or Dark theme. Default is System.

Status: **Superseded (2026-06-08)** — The theme preference control has been removed from account/profile flows along with the rest of dark mode. Deferred until post-launch.

### Project Workflow

Decision: StayOps should follow a plan/design/document/implement/test/review/update-docs workflow.

Any feature change, requirement change, permission change, UI flow change, data model change, or technical change must update the related Markdown files.

Status: Confirmed

### AI Collaboration Rules

Decision: Codex, Claude, Cursor, and any other AI tools working on StayOps must follow shared Markdown documentation as the source of truth and update docs when making project changes.

Status: Confirmed

### Initial Data Model

Decision: Use Supabase/PostgreSQL with organization-based tables for profiles, memberships, invite codes, properties, rooms, reservations, cleaning records, maintenance requests, lost items, order requests, announcements, notifications, and recurring work.

Every operational business record must include `organization_id`.

Status: Drafted

### Attachment Model

Decision: Use a shared `attachments` table instead of storing photo URL arrays directly on each feature table.

Status: Confirmed

### Platform Admin Model

Decision: Store Developer/Super Admin access in a separate `platform_admins` table, not inside organization memberships.

Status: Confirmed

### Audit Logs

Decision: Add an `audit_logs` table to record important admin/platform actions. A full audit log UI is not required for MVP, but important actions should be stored.

Status: Confirmed

### RLS Permission Draft

Decision: Create a dedicated RLS permissions document for Supabase/PostgreSQL policies. RLS must enforce organization isolation and key role-based permissions.

Status: Drafted

### Implementation Plan

Decision: Use a phase-based MVP implementation plan from planning/design preparation through project setup, auth, app shells, core workflows, Beds24 calendar, notifications, exports, and internal rollout.

Status: Drafted

### Stitch Screen List

Decision: Create a dedicated Stitch screen list with first design targets and prompt drafts for core mobile and admin screens.

Status: Drafted

### Accepted Stitch Screens

Decision: The following Stitch screens are accepted as v1 working design directions:

- Login / Signup basic direction
- Mobile Home basic direction
- Active Cleaning Timer basic direction
- Mobile Requests Tab basic direction
- Mobile Announcements list / detail / popup
- Mobile User Profile / Directory / Edit Profile / User Detail
- Admin Dashboard
- Admin Cleaning Status
- Admin Maintenance
- Admin Lost & Found
- Admin Order Requests
- Admin Announcements
- Admin Recurring Work
- Admin Users
- Admin Check-In / Check-Out

New Request Menu v1 is structurally accepted but needs more Liquid Glass polish later.

Remaining design work:

- App Splash / Launch Screen
- Role-based screen and button visibility review
- Final Stitch progress documentation cleanup

Status: Confirmed

### App Splash / Launch Screen

Decision: StayOps should show a brief splash/launch screen when the mobile app/PWA first opens.

Direction:

- Use a white or bright gray-white background.
- Show the StayOps app logo centered on the screen.
- Keep the splash brief, similar to common app launch experiences such as Instagram or Facebook.
- Do not use the splash as a marketing page.
- The final StayOps logo is not designed yet, so the splash screen remains required but final visual design depends on later logo work.
- Temporary designs may use a StayOps wordmark or placeholder logo.

Status: Confirmed requirement; logo design pending

### Reservation Calendar Visual Rules

Decision: Reservation calendar date numbers must always remain visible even when reservation bars exist on that date. Reservation bars should be real multi-day bars spanning check-in to check-out, not small isolated labels that hide the date.

Reservation source/channel should control bar color:

- Booking.com / Booking: blue or blue-teal family
- Airbnb: soft light pink family
- Direct/other: neutral gray family

The company's existing internal room/date calendar is an important reference for reservation density and multi-day bar behavior. Mobile still needs a readable monthly view, while admin web should strongly consider a room-by-date timeline grid.

Status: Confirmed

### Reservation Calendar Design Scope

Decision: Mobile and admin web reservation calendar directions are both documented.

Mobile calendar must avoid large unused bottom whitespace. The monthly grid should use the available vertical space efficiently above the bottom navigation.

Admin web reservation calendar should use a dense channel-manager-style room/date grid for office users. It should prioritize scanning many rooms and many dates over large card layouts. A selected reservation detail inspector or collapsible drawer is useful, but it is secondary to the grid.

Status: Confirmed

### Admin Reservation Calendar Stitch Outcome

Decision: The Admin Reservation Calendar Stitch exploration is not accepted as a final v1 design.

Reason:

- Stitch repeatedly produced sparse timelines, over-emphasized detail panels, or rate/inventory-style screens.
- The required admin calendar is closer to a high-density channel-manager grid than a normal SaaS calendar.
- The final UI likely needs a custom data-grid/timeline component during implementation.

Confirmed structural direction:

- Dense room/date grid.
- Support many rooms and many dates.
- Optional room sub-rows such as Status, Min Stay, and Reservation.
- Reservation bars span check-in to check-out.
- Reservation bars display guest name and number of guests only.
- Booking.com/Booking uses blue-teal, Airbnb uses soft light pink, Direct/Other uses neutral gray.
- No price, revenue, payment, rate, sales, or inventory data in StayOps MVP.
- Selected reservation detail surface may show guest, property, room, dates, guests, channel, phone, Copy, and Call. Mobile uses a slide-up bottom sheet; admin web may use an inspector/drawer if needed.
- Earliest available list remains required.

Status: Confirmed structural direction; final Stitch v1 not accepted

### Large-Building Mobile Calendar Strategy

Decision: For buildings with many rooms, such as the upcoming 26-room hotel or any property with about 28 rooms, StayOps should not attempt to show every room's reservations inside one normal mobile monthly date-cell calendar.

Recommended mobile structure:

- Month view: property-level monthly overview and selected-room/small-property calendar
- Rooms view: room-by-date timeline for the selected building, with enough date density for practical scanning
- Lists view: check-in today, check-out today, staying today, empty today, and earliest empty

Reason:

- A normal month grid becomes unreadable when many room reservations compete inside each date cell.
- Mobile needs a separate dense room timeline or operational lists for large buildings.

Status: Confirmed

### Rooms Timeline Date Density

Decision: The mobile Rooms timeline must show more useful date information than a narrow 3-day view. The default should support a practical 7-day range, with an optional 14-day compact view for broader scanning.

Rules:

- Sticky room column.
- Horizontally scrollable date area if needed.
- Clear date range and scroll affordance.
- Compact reservation labels in wider date ranges.
- 14-day mode can prioritize occupancy shape over full guest names.

Status: Confirmed

### Rooms Timeline Density Modes

Decision: For large buildings, Rooms view should separate detail reading from broad occupancy scanning.

Modes:

- Detail mode: fewer days, readable guest labels.
- Overview mode: more dates, compact occupancy bars/cells, guest names hidden by default.

Reason:

- Mobile cannot show 28 rooms, many dates, reservation durations, and full guest names all at once without becoming unreadable.
- Staff need both quick occupancy overview and tappable detail access.

Status: Confirmed

### Rooms Overview Visual Direction

Decision: Rooms Overview should use a compact occupancy timeline style: room numbers on the left, dates across the top, and horizontal colored reservation bars spanning dates. Guest names are hidden in this overview to maximize date density.

Interaction:

- Tap a reservation bar to open reservation detail.
- Use channel colors for reservation bars.

Status: Confirmed

### Environment Setup

Decision: Create an environment setup document that lists required environment variable names and service setup without storing real secret values.

Status: Drafted

## 2026-06-08

### Mobile Bottom Navigation — Center Action Button

Decision: Replace the five-tab floating capsule bottom bar with a center-action ("추가") FAB design — four tabs (Home, Calendar / Requests, Announcements) split 2 / 2 around a raised central teal `#0e7c72` button.

Consequence:

- "Cleaning" can no longer occupy a bottom tab. It moved to the side menu (hamburger) and remains reachable at `/mobile/cleaning`.
- The four side tabs are **per-user customizable** (all four slots). The center FAB ("편집", pencil icon) opens a bottom-bar editor sheet: a 2-column colour-category tile grid of the selectable feature pool where the user toggles up to 4 tabs (≥1 required). Selection is persisted **per user in Supabase** (`profiles.bottom_nav_tabs`) and synced across devices.

Implementation:

- DB: migration `supabase/migrations/202606080001_profile_bottom_nav.sql` adds `profiles.bottom_nav_tabs text[]` (default `{home,calendar,requests,announcements}`). The existing "users can update own profile" RLS policy already covers it. `src/types/database.ts` updated.
- `src/config/navigation.ts`: `mobileBottomNavigation` (defaults) plus `MAX_BOTTOM_NAV_TABS`, `defaultBottomNavTabIds`, `customizableBottomNavItems`, `resolveBottomNavItems`, `sanitizeBottomNavTabIds`.
- `src/lib/session.ts` reads `bottom_nav_tabs` defensively (falls back to defaults if the column is absent) and exposes `session.user.bottomNavTabs`.
- `src/app/account/actions.ts` `updateBottomNavTabs` server action persists the sanitized list.
- `.tabbar` + `.add-sheet*` / `.add-grid` / `.add-tile*` styles in `src/app/globals.css`; bar + editor `createOpen` sheet in `src/components/shell/mobile-shell.tsx`. Tile colours use `oklch` with fixed lightness/chroma and hue-only variation (`LAUNCHER_META`).

Status: Working decision (requires the migration to be applied on the linked Supabase project)

### Mobile Bottom Navigation — Design Token Unification

Decision: All hardcoded hex values in the bottom tab bar and editor sheet (`#0e7c72`, `#aab2b6`, `#dfe4e6`, `#f1f3f4`, `#9aa3a8`, `#3a4a49`, `#1c2b2a`) are replaced with design tokens from `globals.css :root` (`var(--primary)`, `var(--muted-foreground)`, `var(--border)`, `var(--muted)`, `var(--foreground)`, `var(--surface)`, `hsl(var(--primary-hsl) / ...)`) so the bar derives from the single token source of truth.

Exception: `.add-tile`/`.add-tile__badge` `oklch` launcher hue colours are intentional decorative tones and remain as-is.

Status: Confirmed

### Wordmark Color — Unified to `text-foreground`

Decision: The "Stay Ops" wordmark in both mobile shell (top header) and admin shell (sidebar) uses `text-foreground` (neutral dark) for consistency. Previously the admin wordmark used `text-primary` (teal). The admin identity badge (square teal `S` icon) still uses `bg-primary`/`text-primary-foreground` so brand color remains present.

Status: Confirmed

### Center FAB Label — `editBottomBar` Instead of `edit`

Decision: The center FAB button label and aria-label use `dictionary.common.editBottomBar` ("하단바 편집" / "下部バーを編集" / "Edit bottom bar") instead of the generic `dictionary.common.edit` ("편집") to unambiguously indicate its purpose (customize the bottom bar) and prevent confusion with content-editing actions.

Status: Confirmed

## 2026-06-09

### Feature Batch Scope Decision

Decision: The five new features captured in `docs/planning/15-feature-batch-plan.md` (Linen Defect Registration, Personal Todo / Shared Task Inbox, Staff Suggestions / Feedback Box, Internal Board, Attendance / Clock-In-Out + Payroll) are approved as a **post-MVP feature batch**. They are no longer "candidate only" — they are the confirmed next build scope after the Phase 6–13 MVP.

Build order (confirmed): 1) Linen Defect → 2) Personal Todo / Shared Task Inbox → 3) Staff Suggestions / Feedback Box → 4) Internal Board → 5) Attendance / Clock-In-Out + Payroll.

Reason:

- The batch plan was drafted 2026-06-08 and reviewed 2026-06-09; the user confirmed the scope change.
- The first four features do not conflict with any prior confirmed exclusion.
- This decision is the governing source of truth. `15-feature-batch-plan.md` moves from "Draft / Candidate" to "Approved scope."

Status: Confirmed (2026-06-09)

### Attendance / Clock-In-Out + Payroll — Scope Change (Approved)

Decision: Attendance / clock-in-out and hourly payroll are now **in scope** for StayOps. This explicitly reverses the earlier "First Mobile Workflow Priorities" exclusion (attendance excluded because another app handles it) and the "Out of Scope → Attendance / Clock-In and Clock-Out" entry in `docs/planning/03-mvp-priority.md`.

Scope nuance (important):

- **Attendance capture** (PWA QR + device GPS clock-in/out, attendance logs) is approved for implementation.
- **Payroll calculation** stays **design-only / deferred** until the company defines the wage rules: rounding, break deduction, lateness, overtime, overnight shifts, holiday handling, payroll closing date, and the correction/approval flow. Payroll math must not be coded before those rules are confirmed (see `docs/product/21-attendance-payroll-workflow.md` "Important Policy Questions" and `docs/engineering/11-attendance-payroll-technical-design.md` "Current Blockers").
- Operating-date boundaries for attendance/payroll periods must follow the project Asia/Tokyo convention (see CLAUDE.md §6); the exact period-boundary rule is part of the deferred wage policy.

Reason: The user approved the scope change on 2026-06-09 when asked directly whether to approve or keep it blocked.

Status: Confirmed (2026-06-09) — attendance capture buildable now; payroll calc blocked on wage-policy definition.

### Attendance / Payroll Policy Baseline — Refined

Decision: On **2026-06-17**, the attendance / payroll feature policy was refined enough to support an implementation-ready product spec and technical design for:

- session-based attendance capture
- GPS + QR attendance in the first PWA release
- future `GPS + Wi-Fi` design kept in the model but **disabled in current PWA UI as 준비중**
- hourly-worker gross-pay calculation only
- per-person monthly finalization / reopen / snapshot / export

Confirmed policy baseline:

- One open session per user at a time; multiple sessions per day allowed after clock-out.
- Sites are required; free-text attendance locations are not allowed.
- Clock-in site and clock-out site may differ, but both must be registered sites.
- GPS is mandatory for successful attendance.
- PWA first release uses **GPS + QR** only; Wi-Fi remains planned but inactive in PWA.
- Breaks are recorded explicitly; hourly workers are paid only for worked minutes excluding recorded breaks.
- No automatic break deduction.
- No overtime, holiday, public-holiday, or night premiums in the first payroll slice.
- Hourly pay uses 1-minute units and rounds the final monthly gross to the nearest 10 yen.
- Taxes, insurance, deductions, and salaried payroll remain outside StayOps.
- Users can see only their own attendance / pay; only `owner` and explicit `attendance_payroll_admin` users can see org-wide payroll data, finalize months, reopen, and export.
- Site master remains owner-only.

Reason: The user confirmed these operating rules directly while refining the attendance / payroll MD documents on 2026-06-17.

Consequence:

- `docs/product/21-attendance-payroll-workflow.md` and `docs/engineering/11-attendance-payroll-technical-design.md` move from generic draft placeholders to implementation-ready refined drafts.
- `docs/planning/06-current-status.md` should no longer describe hourly payroll as completely undefined; the remaining blocker is the export template and the deferred Wi-Fi activation path, not the core hourly gross-pay policy itself.

Status: Confirmed policy baseline (2026-06-17)

### Internal Board — Part-Time Write Permission

Decision: In the Internal Board feature, **all active organization roles including Part-Time Staff can create posts.** This is intentionally different from Announcements, where Part-Time Staff cannot create (see "Announcement Write Permission").

Reason:

- The Internal Board is a lighter, everyday team-communication space with no required read tracking or popup, so the stricter announcement authorship limit does not apply.
- The user confirmed allowing part-time posting on 2026-06-09.

Consequence: This is a role-permission expansion relative to the announcement model and must be reflected in `docs/product/01-user-roles.md`, `docs/product/20-internal-board-workflow.md`, and the Internal Board RLS in `docs/engineering/05-rls-permissions.md`.

Status: Confirmed (2026-06-09)

### Personal Todo — Private-by-Default and Sharing

Decision: Personal todos/tasks are **private to the owner by default** and become visible to others only when explicitly assigned or shared. This refines (does not replace) the earlier "Todo / Task Purpose" decision, which defined purpose only and was silent on visibility.

Open implementation point (still to confirm during build): the teammate-share mechanism — one shared task record with multi-user visibility vs. a sender/recipient copy model (`task_transfers`). This must be resolved before the Todo slice is implemented. See `docs/product/18-todo-task-workflow.md`.

Status: Confirmed direction (2026-06-09); share mechanism TBD before build.

### Staff Suggestions — Visibility Model

Decision: The earlier `public_team` / `employee_only` visibility direction was later replaced on **2026-06-16** by a participant-scoped model: author + one required recipient + optional referenced users. There is no broad visibility mode in the current first-slice plan.

Consequence: Product, RLS, and data-model docs must follow the newer participant-scoped rule instead of the older two-visibility-mode draft.

Status: Superseded on 2026-06-16

## 2026-06-10

### Beds24 Webhook Reliability — Observability + Daily Reconciliation

Decision: Add a webhook ingestion observability log plus a daily reconciliation safety net to prevent silently-dropped Beds24 webhooks from leaving reservations missing from the calendar.

Context:

- A confirmed reservation (`5843903602`, Kabukicho 302, check-in 2026-06-08) was found missing from the calendar. Root cause: the booking was never written to the DB — its webhook never reached the processing path — and there was no log of webhook delivery, so the loss was invisible until an operator noticed the calendar gap.

Implementation:

- New table `beds24_webhook_events` (migration `202606100001_beds24_webhook_events.sql`) logs every inbound webhook batch and every reconciliation run (trigger source, http status, counts, modes, compact booking summary). Platform-admin read, service-role write.
- New production endpoint `/api/beds24/reconcile` re-pulls the operational window (current month + next month) from Beds24 `/bookings` and upserts anything missing. Idempotent; the production counterpart to the dev-only backfill route.
- Vercel Cron (`vercel.json`, `0 19 * * *` UTC = 04:00 Asia/Tokyo) runs the reconcile endpoint **once daily**, within the free Hobby plan's cron limit. Authorized via `CRON_SECRET` (or `BEDS24_WEBHOOK_SECRET` for manual runs).

Policy:

- This does NOT reverse the "Beds24 Webhook Strategy" decision. Webhooks remain primary/real-time; reconciliation is a low-frequency (daily) catch-up safety net, not polling. The daily cadence (vs. more frequent, which would require Vercel Pro) was chosen by the user to respect the "free/low-cost" constraint.

Reason: The user explicitly asked to prevent this class of silent ingestion miss from recurring and to document it. Daily-cron cadence confirmed by the user on 2026-06-10.

Status: Confirmed (2026-06-10). Requires `CRON_SECRET` set on the Vercel project for the cron to be authorized in production.

### Brand Palette — Ivory chrome + Navy accent (teal retired)

Decision: Replace the global brand color and shell chrome. The former teal primary
(`hsl(177 100% 24%)`) is retired; the brand accent (`--primary`) is now **deep ink
navy/indigo** (`hsl(223 46% 32%)`). The page/shell background, sidebar, and bottom tab bar
use a warm **ivory** base (`--background hsl(42 38% 96%)`); cards/sheets stay white
(`--surface`) to lift off the ivory canvas.

Scope: App-wide (mobile + admin), via `src/app/globals.css` tokens that cascade to all
`--primary`/`bg-background` usages, plus the few hardcoded teal classes in the sidebar
gradient (`mobile-shell.tsx`), the `.tabbar` (`globals.css`), and the auth login / onboarding
screens which were migrated to `--primary` tokens.

Reason: The user found the teal-dominant sidebar/bottom bar too green and requested an ivory
chrome with a harmonious non-green accent; navy was chosen for a premium, hospitality-ops feel
that pairs with ivory and unifies with the existing blue order/maintenance accents.

Notes: Semantic success greens (e.g. `emerald-*` confirmation states in announcements) were
intentionally left as functional status colors, not brand color. Mobile-shell contract docs
(`CLAUDE.md`, `docs/product/16-mobile-navigation.md`) updated to the ivory/navy base.

Status: Confirmed (2026-06-10).

## 2026-06-13

### Todo Completion Re-introduced + 완료/기록 Tab

Decision: Re-introduce task completion in the mobile Todo workspace (it had been removed in the
2026-06-12 IA cleanup) and add a **Completed (완료/기록)** top tab. Tapping a task card's status
circle completes/reopens it (undo toast); `completeTask` / `reopenTask` stamp/clear `status` +
`completed_at` + `completed_by_user_id`, write an update-log row, and (on complete) fan out a
`task_completed` notification. The Completed tab groups completed tasks by their Tokyo completion day
(`tokyoDateOf(completed_at)`), newest first.

Reason: Operators need to mark work done and review a dated completion history; the prior removal left
the existing `completed_*` columns dormant. The `task_completed` notification enum value is now active.

Status: Confirmed (2026-06-13).

### Daily Report Generator (staff-only) — free template, no LLM

Decision: Add a Korean daily work report ("업무일지") to the Todo Completed tab. A **보고서** button on
each day group calls `generateDailyReport(date)`, which gathers the caller's own completed tasks for
that Tokyo date and returns a date-headed bullet list, shown in an editable, copyable bottom sheet.

The generator is **free and template-based — no LLM, no API key, no per-use cost**. It builds the
report deterministically and applies a local `tidy()` pass for light auto-correction (whitespace,
leading bullet glyphs, punctuation spacing); the header suffix is localized (업무일지 / 業務日報 /
Daily report).

> Superseded sub-decision: an LLM-backed variant (`@anthropic-ai/sdk`, `claude-haiku-4-5`,
> `ANTHROPIC_API_KEY`) was prototyped first, but the user opted for the free template because the
> Claude consumer subscription cannot authenticate the API and pay-as-you-go billing was not wanted.
> The SDK + key were removed. Re-introducing them behind the same `generateDailyReport` contract
> remains the upgrade path if richer 맞춤법 correction is later desired. **No LLM dependency is
> currently in the stack.**

Permission — **staff-only**: `canGenerateDailyReport(role, can_generate_report)` =
`role != 'part_time_staff' OR profiles.can_generate_report = true`, enforced in the server action (a
forbidden caller gets a "권한 없음" popup). New column
`profiles.can_generate_report boolean not null default false` (migration
`202606130001_profile_report_access.sql`, applied to the linked Supabase project) is toggled per-user
by owner/office_admin in admin user management (`updateMemberReportAccess`) for the few part-timers in
a management capacity.

Status: Confirmed (2026-06-13). No env var required.

### Mobile-first login routing

Decision: the product must no longer show a manual "choose dashboard vs mobile" landing screen.
Entry routing should be automatic by device.

Rules:

- **Desktop / PC access** should go directly to the **admin dashboard/web surface**
- **Mobile / tablet access** should go directly to the **mobile app surface** (`/mobile`)
- The old root-level manual chooser / dev-style entry screen must be removed from the real product flow
- Any future "open mobile version from dashboard" behavior should live **inside the dashboard**, not on
  the public root entry screen

Implementation direction:

- On `/`, phones/tablets are redirected straight to `/mobile` instead of showing the desktop/dev
  entry chooser.
- On `/`, desktop users should be routed straight into the admin/dashboard side rather than seeing a
  version-choice landing page.
- On `/auth/login`, phones/tablets force the post-login destination to `/mobile`
  (`effectiveNext`), overriding both the role-based admin default (`state.redirectTo`) and any
  `?next=/admin/...` value.
- On mobile devices, the dev-seed login collapses to a single test-admin button labeled
  **Stay Ops E2E Admin** for local QA only.

Reason: users should never have to decide between "dashboard version" and "mobile version" on the
first screen. The correct surface should be selected automatically by device. `effectiveNext`
still flows through `signInWithEmail`/`signInWithGoogle` → `/auth/callback`
(`dest = safeNext || state.redirectTo`), so it is honored end-to-end; middleware only guards
auth and does not re-route by role, so `/mobile` sticks on phones. The desktop side should
eventually stop rendering `DevEntry` entirely and go straight to dashboard routing.

Status: Confirmed (2026-06-10), expanded on 2026-06-18. **Follow-up implementation still required
for the desktop root route to replace `DevEntry` with direct dashboard routing.**

### Bottom sheets — iOS drag-to-dismiss; header close (X) removed

Decision: All mobile **bottom sheets** share one iOS-style drag-to-dismiss interaction via a single
primitive, `useSheetDragDismiss` (`src/components/shell/use-sheet-drag-dismiss.ts`). Drag the grab
handle / header down to dismiss — release past `max(80px, 25% of sheet height)` or a downward flick
≥ 0.5 px/ms dismisses (reusing each sheet's existing slide-out + `onClose`), otherwise it snaps back;
the scrim dims in proportion to the drag. Each sheet keeps its own open/close lifecycle and only
spreads `handleProps` on the handle/header, tags the container `data-sheet`, and applies
`sheetStyle` / `scrimStyle`. Now that the slide dismisses, the **top-right close (X) buttons were
removed** from these sheets; scrim tap and Esc remain as alternate exits.

Approach chosen: a shared hook (Option A), not a `BottomSheet` wrapper component (Option B), because
each sheet has a slightly different layout / duration / close path and wrapping all of them carried a
higher regression risk than leaving each sheet's markup intact and wiring the hook in.

Scope: covered — bottom-bar editor (`mobile-shell`), Tasks quick-add / Calendar day sheet /
long-press menu (`tasks-workspace`), share picker, context picker, report sheet, project create
(`projects-board`), project members (`project-detail-view`), photo gallery (`photo-gallery`),
calendar reservation detail (`mobile-calendar-view`), and the order action sheet's draggable
(`isOrdered`) variant. Excluded (not bottom sheets) — center-aligned confirm/delete/rename dialogs,
the cleaning confirmation card, fixed action bars, the side menu, and the photo lightbox carousel.
Kept X icons that serve other roles (remove-participant, chip clear, search clear, select-mode
cancel, lightbox close, centered dialogs).

Note: sheets portal to `<body>` but React synthetic touch events bubble through the React tree into
the shell's pull-to-refresh / swipe-nav handlers, which dragged the background screen down with the
sheet; the hook stops touch propagation on the handle so only the sheet moves.

Status: Confirmed (2026-06-15). Canonical contract: Product `16` → "2026-06-15 Bottom Sheets —
iOS-style Drag-to-Dismiss".

### Todo recurrence uses real task instances

Decision: Todo recurrence is no longer label-only. Repeating tasks now generate **real `tasks` rows**
per occurrence date, tied together by `recurrence_series_id` and stamped with
`recurrence_instance_date`.

Rules:

- a repeat rule requires a date anchor (`scheduled_date` or `due_at`)
- the task the user saves is the **first real occurrence**
- future occurrences are materialized as actual rows inside the active task window
- the **latest occurrence row's** repeat rule is what continues the series forward
- clearing repeat on the latest occurrence stops future auto-generation from that point
- `custom` remains round-trip only; auto-generation runs only for the standard rules
  (`daily`, `weekly`, `monthly`, `weekdays`, `weekends`)

Reason:

- the user explicitly required repeating tasks to actually appear on their repeated dates in
  Today/Tomorrow rather than stay as a label-only reminder
- real rows preserve completion history, update-log history, and per-day visibility consistently

Status: Confirmed (2026-06-15).
