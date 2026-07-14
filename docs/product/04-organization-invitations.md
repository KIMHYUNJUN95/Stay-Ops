# Organization and Invitations

## Requirement

StayOps must support company/workspace separation from the beginning.

The first workspace will be the company's internal workspace, but the product should be designed so other companies can use StayOps later without data mixing.

## Current User Scale

Initial internal usage:

- About 10 employees
- More than 40 part-time staff
- More users expected over time

## Recommended Model

Use a multi-tenant organization model.

Core entities:

```txt
Organization
User
Membership
Role
Invitation
Invite Code
Property
Room
```

## Organization

An organization represents one company/customer.

Examples:

- Our company
- Future hotel customer A
- Future accommodation operator B

Every important record should belong to an organization.

Examples:

- Properties
- Rooms
- Tasks
- Lost items
- Maintenance requests
- Cleaning records
- Announcements
- Inventory records
- Orders

## Membership

A user can belong to one or more organizations.

Membership stores:

- User
- Organization
- Role
- Status
- Joined date

Status candidates:

- Invited
- Active
- Suspended
- Removed

## User Profile

Each user should have a personal profile connected to their account.

Profile fields may include:

- Name
- Date of birth
- Phone number
- Profile photo
- Preferred language

All organization members should be able to see the user directory and call other members by phone button.

## Signup Required Information

Required during signup:

- Authentication method (`Google` or `email + password`)
- Name
- Date of birth
- Phone number
- Preferred language
- Team invite code

Optional after signup:

- Profile photo

## Social Login Profile Completion

Google login is supported alongside standard email signup/login (`email + password`).

Email magic-link is no longer part of the planned authentication model.

**Important product rule: Google login is only an authentication method.**

Google account profile data must NOT be trusted as final operational profile data and must NOT be auto-prefilled into required fields. Reason: many staff are international students, working-holiday workers, or non-Japanese residents whose Google profiles may reflect old countries, old phone numbers, or non-operational name formats. Operational data quality is more important than convenience.

After any Google login:

- The user's email is confirmed from Google.
- The user must still manually enter and confirm all required profile fields.
- No Google profile data (name, phone, profile image) is auto-applied.
- The user cannot enter the app until onboarding is complete.

Required onboarding fields before app access (applies equally to email and Google login):

- Name (entered manually)
- Date of birth (entered manually)
- Phone number (entered manually; stored in international format)
- Preferred language (selected manually)
- Valid team invite code (to join an organization)

Important onboarding rules:

- Authentication success alone does not grant product access.
- Users without a valid team invite code can authenticate, but they cannot use any StayOps feature.
- Incomplete accounts must always return to `continue onboarding`, not to the normal app.
- The same onboarding rules apply to both Google and email signup.

Implementation note (2026-06-03):

- Google OAuth is wired via `supabase.auth.signInWithOAuth({ provider: "google" })`.
- After Google callback, `getOnboardingState()` determines if profile is complete.
- If profile is missing → routed to `/onboarding` profile step.
- If profile complete but no membership → routed to `/onboarding` invite-code step.
- If membership is suspended → routed to the blocked state on `/auth/login` with a logout action.
- If membership is removed → routed to the blocked state on `/auth/login` by default; the user may explicitly enter a re-join flow with another valid invite code.
- If the authenticated account is disabled at the Auth level → routed to the blocked state on `/auth/login`.
- Google login button is live on `/auth/login`; `prompt: "select_account"` forces account selection on each login attempt.
- The profile-setup wizard now exposes an explicit return-to-login action on every step so users who
  entered with the wrong Google/email account can leave onboarding immediately. The action signs the
  user out and returns to `/auth/login` while preserving the chosen language.

## Email Signup / Login

Standard email signup/login is also required.

Rules:

- Email signup uses `email + password`
- Email verification is required before onboarding is considered complete
- Password reset uses reset-email flow
- Password policy:
  - minimum 8 characters
  - letter + number required
  - special character optional
- Login attempts for email/password should be rate-limited

## Account Identity Rules

- Same email address should map to one StayOps account
- Google login and email/password login should attach to the same account when the email matches
- Phone number is an account-level unique value
- If an account exists but onboarding is incomplete, re-signup should resume the same account instead of creating a duplicate

Implementation note:

- Same-email Google/email account attachment currently depends on **Supabase Auth automatic identity linking + confirmed email settings**. StayOps app code explicitly handles duplicate/incomplete-account resume on the email-signup path, but Google sign-in itself relies on the Supabase-side linking policy.
- Phone number uniqueness remains account-level. If onboarding hits the unique `profiles.phone_number`
  rule, the user is returned to the phone-number step and told to either enter a different number or
  return to login and use the existing account that already owns that number.

## Team Invite Codes

Invite codes are the gate that turns an authenticated account into an active organization member.

Current business rules:

- Team invite code determines:
  - target organization
  - onboarding role category
- Invite codes are multi-use by default
- Normal staff codes:
  - valid for 3 months
  - maximum 100 joins
- Owner invite code:
  - one-time use only
- Invite code validation succeeds first, then the app shows the resolved organization + role before final membership activation
- If a signup is retried for an email that already has an incomplete StayOps account, the app sends the user to sign in and continue that existing onboarding flow instead of creating a duplicate account

Current onboarding role categories:

- Part-time Staff
- Office Staff
- Field Staff
- Part-time Staff (Manager)
- Owner

Important:

- These are the **signup/invite categories** that users see during onboarding.
- Final internal role/permission mapping may still be normalized during implementation, but the invite-code UX must expose these five business-facing categories.

## Organization Creation

Organization creation is not open to every public signup.

Rules:

- A new organization can be created only through an allowed organization-creation path
- The user who creates the first organization becomes that organization's first owner
- General public signups cannot create arbitrary organizations

Current temporary operating rule:

- Until invite-code management UI is built in the future admin dashboard, the initial organization / first owner / initial invite codes are bootstrapped manually in the database
- This is operational bootstrap data, not a normal self-service workflow

## Staff Onboarding Options

### Option 1: Email Invitation

Admin invites a user by email.

Good for:

- Employees
- Managers
- Admin users
- Controlled access

Flow:

```txt
Admin enters email
Invitation is created
User receives invitation
User signs up/logs in
User joins organization with assigned role
```

### Option 2: Team Invite Code

Admin creates an invite code for a role, property, or team.

Good for:

- Part-time staff
- Larger onboarding
- Temporary staff

Flow:

```txt
Admin creates team invite code
Staff authenticates
Staff completes required onboarding
Staff enters code
System resolves organization + role
User confirms the result
User joins organization immediately
```

## Invite Code Fields

Invite codes should include:

```txt
id
organization_id
code
name
default_role
expires_at
max_uses
used_count
is_active
created_by_user_id
created_at
updated_at
```

Required settings when creating an invite code:

- Code name
- Default role category
- Expiration date
- Maximum number of uses
- Active/inactive status

Example:

```txt
Name: 2026 Spring Part-time
Default role: Part-time Staff
Expires at: 2026-06-30
Max uses: 50
Status: Active
```

Recommended defaults:

- Default role category should be explicit
- Invite codes should be revocable
- Expired codes cannot be used
- Codes that reach max uses cannot be used
- Organization + role should be previewed to the user before final join

Recommended first operating defaults:

- `Owner` code: one-time use
- other role codes: 3 months + 100 uses

### Option 3: Signup Approval

User requests to join an organization and admin approves.

Good for:

- Future public release
- Companies where admin wants full control

## Recommended First Implementation

Use a hybrid approach:

- Google login and email/password login as auth entry methods
- Team invite code as the membership gate
- Manual DB bootstrap for the first organization / first owner / first codes until dashboard tooling exists
- Role is required for every membership

Current recommended setup flow:

```txt
Allowed user enters organization-creation path
User authenticates
User completes onboarding
User creates the first organization
User becomes that organization's first owner
Initial invite codes are prepared manually in DB for now
Employees / field staff / part-time staff authenticate
Users complete onboarding and enter team invite code
Users join the organization immediately
Owner later manages members / roles / code lifecycle from dashboard (when built)
```

Implementation notes (current as of 2026-06-18):

- Email magic-link has been **removed**. Auth methods are email+password and Google OAuth only.
- `/onboarding` profile completion now collects the required operational profile fields — **name, date of birth (`birthDate`), gender (`gender`), phone number, preferred language, and (optionally at this step) invite code**. New/incomplete accounts still go through this onboarding gate. For already-active legacy users, missing `birth_date` and/or `gender` is now completed from `/account` instead of forcing them back through the new-user onboarding intro.
- Invite-code join uses a **verify → preview → confirm** flow: `previewInviteCode` validates the code without consuming it and shows the resolved **organization name + user-facing role category** (the five business-facing categories, mapped from the DB role via `roleToInviteCategory`) before the user commits. Final join is still the atomic `join_organization_with_invite_code` RPC. This matches the rule "validation succeeds first, then the app shows the resolved organization + role before final membership activation."
- The pre-auth language selection persists via the `stayops_locale` cookie and is honored on `/onboarding`, so the chosen locale survives the login → callback → onboarding chain; the completed profile stores `preferred_language`.
- `/onboarding` handles profile completion and invite-code organization joining.
- If the profile is already complete but there is still no membership, `/onboarding` stays in the same redesigned wizard and jumps directly to the invite-code step instead of falling back to a legacy join-only form. That membership-only invite step also exposes an explicit return-to-login action so a stuck test account is not trapped on the page.
- Onboarding is required for all new users regardless of login method. Google users are not exempt.
- `/admin/settings/organization` lets Developer / Super Admin create organizations.
- Organization creation can attach the current Developer / Super Admin user as organization `owner`.
- `/admin/users/invites` lets developers and `manage_users` delegates create invite codes (moved from
  `/admin/settings/invite-codes` on 2026-07-13 — the old path now redirects there; see
  `docs/planning/01-decision-log.md` → 2026-07-13).
- The invite-code default-role picker supports `staff`, `part_time_staff`, `office_admin`, and
  `field_manager` (extended 2026-07-09 — the first implementation only had `staff`/
  `part_time_staff`; `office_admin`/`field_manager` were always defined in `INVITE_CATEGORIES` /
  `inviteCategoryToRole` (`src/config/roles.ts`) but the creation UI never exposed them until now).
  `owner` and `cs_staff` remain deliberately excluded from self-service invite-code creation: `owner`
  needs a separate single-use-code flow that is not built yet, and `cs_staff` has no invite category
  at all (admin-assigned only, by design). Both stay as manual role changes at `/admin/users/[id]`.
- Invite codes can be listed, **activated / deactivated, and deleted** from the `/admin/users/invites` UI.
  - **Deactivate / Activate** (`deactivateInviteCode` / `activateInviteCode`) toggle `is_active`. Active
    codes show a "Deactivate" button; inactive codes show an "Activate" button — so a deactivated code
    can be turned back on. The row is always kept (usage history preserved). Re-activating does not
    override expiry/max-use limits — those are still checked at join time.
  - **Delete** (`deleteInviteCode`, 2026-07-14) hard-deletes the code row (MVP hard-delete policy),
    org-scoped, behind a `.ovconfirm` inline confirmation. Available for **both active and inactive**
    codes. Members who already joined with the code **keep their memberships** — only the code record
    is removed. Both actions use the same `canManageInvites` gate as creation.
- **Invite conditions/limits** enforced by `validateInviteCode`: **expiry** (`expires_at`), **max uses**
  (`max_uses` vs `used_count`), and **active flag** (`is_active`). The default role a code grants is
  capped at what the issuer may assign.
- Invite code error handling distinguishes: expired, inactive, max-uses exceeded, and invalid/not-found.
- Membership state access control: `active` allows access; `suspended` shows a blocked screen with logout; `removed` shows a blocked screen by default but can move into a re-join flow with another valid invite code; `invited` prompts for invite code.
- Logout is accessible from `/account` and clears the session fully, redirecting to `/auth/login`.
- Phone number is required and validated at both onboarding and account editing (7-15 digits, allows +, spaces, hyphens, parentheses).

Future public release can add:

- Self-serve company signup
- Free plan creation
- Billing
- Automatic organization creation

Initial organization roles:

- Owner
- Senior Managing Director (전무) — added 2026-07-13, fully owner-equivalent; see
  `docs/product/01-user-roles.md` → "Senior Managing Director (전무)"
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff

Developer/Super Admin is a platform-level role and should not be treated as a normal organization member role.

## Security Rules

Required:

- Users can only access records within their organization.
- Role permissions must be checked on backend/database level.
- Removed users should lose access immediately.
- Invite codes should expire or be revocable.
- Part-time staff can view guest/reservation information except price/revenue fields.

## Post-Login Routing

Use one account system for both mobile/PWA field screens and admin web screens.

Default routing:

```txt
Developer / Super Admin -> Admin web
Owner -> Admin web
Senior Managing Director (전무) -> Admin web
Office Admin -> Admin web
CS Staff -> Admin web
Field Manager -> Mobile field home
Staff -> Mobile field home
Part-time Staff -> Mobile field home
```

Mode switching:

```txt
Developer / Super Admin: Admin mode + Field mode
Owner: Admin mode + Field mode
Senior Managing Director (전무): Admin mode + Field mode
Office Admin: Admin mode + Field mode
CS Staff: Admin mode + Field mode
Field Manager: Field mode + Admin mode
Staff: Field mode only
Part-time Staff: Field mode only
```

Device-aware behavior:

- Desktop/large screen should prefer admin web for admin-capable roles.
- Phone screen should prefer field home for field-oriented roles.

## Open Questions

- Should invite codes be role-specific? Confirmed for MVP: yes, default role is required.
- Should invite codes be property-specific?
- Should part-time staff require admin approval after using a code?
- Should one user be allowed to belong to multiple organizations?
- Should staff accounts be allowed to use personal email addresses?
