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
- If membership is suspended → blocked with a clear message and a logout option.
- If membership is removed → blocked with a clear message and a logout option.
- Google login button is live on `/auth/login`; `prompt: "select_account"` forces account selection on each login attempt.

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

Implementation notes (current as of 2026-06-03):

- Legacy implementation still has email magic-link login + Google OAuth live on `/auth/login`, but
  this is now **outdated relative to the 2026-06-18 target policy**.
- `/onboarding` handles profile completion, invite-code organization joining, and first-user Developer / Super Admin setup.
- Onboarding is required for all new users regardless of login method. Google users are not exempt.
- The first-user admin claim is allowed only while `platform_admins` is empty.
- `/admin/settings/organization` lets Developer / Super Admin create organizations.
- Organization creation can attach the current Developer / Super Admin user as organization `owner`.
- `/admin/settings/invite-codes` lets Developer / Super Admin, Owner, and Office Admin create invite codes.
- The first invite-code implementation supports `staff` and `part_time_staff` as default roles.
- Invite codes can be listed and deactivated from the admin settings UI.
- Invite code error handling distinguishes: expired, inactive, max-uses exceeded, and invalid/not-found.
- Membership state access control: `active` allows access; `suspended` and `removed` show a blocked screen with logout option; `invited` prompts for invite code.
- Logout is accessible from `/account` and clears the session fully, redirecting to `/auth/login`.
- Phone number is required and validated at both onboarding and account editing (7-15 digits, allows +, spaces, hyphens, parentheses).

Future public release can add:

- Self-serve company signup
- Free plan creation
- Billing
- Automatic organization creation

Initial organization roles:

- Owner
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
