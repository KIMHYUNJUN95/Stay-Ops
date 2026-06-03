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
- Age
- Phone number
- Profile photo
- Preferred language

All organization members should be able to see the user directory and call other members by phone button.

## Signup Required Information

Required during signup:

- Name
- Email or social login
- Language selection
- Invitation link or invite code
- Phone number

Optional after signup:

- Age
- Profile photo

## Social Login Profile Completion

Google login is supported alongside email magic-link. Both methods share the same onboarding and session flow.

**Important product rule: Google login is only an authentication method.**

Google account profile data must NOT be trusted as final operational profile data and must NOT be auto-prefilled into required fields. Reason: many staff are international students, working-holiday workers, or non-Japanese residents whose Google profiles may reflect old countries, old phone numbers, or non-operational name formats. Operational data quality is more important than convenience.

After any Google login:

- The user's email is confirmed from Google.
- The user must still manually enter and confirm all required profile fields.
- No Google profile data (name, phone, profile image) is auto-applied.
- The user cannot enter the app until onboarding is complete.

Required fields before app access (applies equally to email and Google login):

- Name (entered manually)
- Phone number (entered manually; validated for reasonable format)
- Preferred language (selected manually)
- Valid invite code / team code (to join an organization)

Implementation note (2026-06-03):

- Google OAuth is wired via `supabase.auth.signInWithOAuth({ provider: "google" })`.
- After Google callback, `getOnboardingState()` determines if profile is complete.
- If profile is missing → routed to `/onboarding` profile step.
- If profile complete but no membership → routed to `/onboarding` invite-code step.
- If membership is suspended → blocked with a clear message and a logout option.
- If membership is removed → blocked with a clear message and a logout option.
- Google login button is live on `/auth/login`; `prompt: "select_account"` forces account selection on each login attempt.

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

### Option 2: Invite Code

Admin creates an invite code for a role, property, or team.

Good for:

- Part-time staff
- Larger onboarding
- Temporary staff

Flow:

```txt
Admin creates invite code
Staff signs up
Staff enters code
User joins organization
Admin can review or approve if required
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
- Default role
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

Recommended first default:

- Default role: Part-time Staff
- Invite codes should be revocable
- Expired codes cannot be used
- Codes that reach max uses cannot be used

### Option 3: Signup Approval

User requests to join an organization and admin approves.

Good for:

- Future public release
- Companies where admin wants full control

## Recommended First Implementation

Use a hybrid approach:

- Email invitation for employees/admins
- Invite code for part-time staff
- Admin can deactivate or remove users
- Role is required for every member

MVP organization creation rule:

- Only Developer/Super Admin can create organizations.
- General users cannot create organizations during MVP.
- Staff can only join through invitation or invite code.

Initial setup flow:

```txt
Developer/Super Admin logs in
Developer/Super Admin creates company organization
Developer/Super Admin or Owner registers properties/buildings
Owner/Office Admin invites employees by email
Owner/Office Admin creates invite codes for part-time staff
Staff/part-time staff sign up
Users join the organization through invitation/code
Owner/Office Admin manages roles and deactivation
```

Implementation notes (current as of 2026-06-03):

- Email magic-link login and Google OAuth are both live on `/auth/login`.
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
