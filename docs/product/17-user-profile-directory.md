# User Profile and Directory

## Purpose

StayOps needs personal profile management and a company user directory.

Users should be able to manage their own basic information, and all members should be able to see who is registered in the organization.

## My Profile

Each user should be able to view and edit their own profile.

Editable fields:

```txt
name
age
phone_number
profile_photo
preferred_language
```

(Theme preference was removed 2026-06-08 — the app is light-mode-only; dark mode deferred post-launch. The `profiles.theme_preference` DB column remains in schema only and is not used by the app.)

Language selection:

- User selects language during signup.
- User can change language later from My Profile.

Signup required fields:

- Name
- Email or social login
- Language
- Invitation link or invite code
- Phone number

Implementation note:

- Initial profile completion is available at `/onboarding`.
- The current onboarding flow captures name, date of birth, gender, phone number, preferred language, and an optional invite code.
- Phone number stays an account-level unique field. If onboarding submission hits a duplicate number,
  the wizard now returns the user to the phone step and explains that they must either enter a
  different number or go back to login and use the existing account that already owns that number.
- Age and profile photo remain deferred to the later My Profile screen.

Optional after signup:

- Age
- Profile photo

Social login may prefill email, name, and profile photo, but the user can edit profile information.

Theme preference:

- Removed 2026-06-08. The app is light-mode-only for the MVP/internal rollout; dark mode (and the System/Light/Dark preference) is deferred until post-launch. The `profiles.theme_preference` column still exists in the DB but is no longer read or written by the app.

Implementation note:

- `/account` now provides the first editable My Profile screen.
- The current version supports name, date of birth, phone number, language, and gender.
- Existing accounts with missing `birth_date` and/or `gender` are not forced back into onboarding; instead, `/account` shows a gentle completion prompt and lets the user save the missing fields there.
- Mobile `date of birth` input now uses the same full-width field width contract as the other profile inputs, so the native date control does not overflow or render wider than the surrounding form fields on mobile WebKit.
- The page is reachable from the account icon in both admin and mobile shells.
- Age and profile photo are still deferred.

Possible future fields:

```txt
nickname
emergency_contact
department/team
memo
```

## User Directory

All registered organization members should be visible in a user directory.

Purpose:

- See who has joined
- Find staff contact information
- Call another staff member quickly
- Check role

Directory should show:

```txt
name
role
phone_number
profile_photo
status
```

Implementation notes:

Mobile directory (`/mobile/directory`):

- Available in the mobile shell as the directory tab (bottom tab or side menu).
- Shows all active/invited org members sorted by role priority, then name.
- Each member card shows: avatar initial, name, role label, phone number (if set), and a call button.
- The call button is a `tel:` link; it opens the native dialer on mobile.
- Members without a phone number show a disabled call button.
- Uses service-role query to load memberships and profiles (bypasses RLS for directory visibility).

Admin user management (`/admin/users`):

- Lists all members with name, email, phone, role, status, and joined date.
- Supports search by name/email/phone, and filter by role, status, and organization scope.
- Role and status update actions are available for Developer/Super Admin, Owner, and Office Admin.
- Self role/status changes from this page are blocked to prevent accidental lockout.

Admin user detail (`/admin/users/[id]`):

- Shows full member profile: name, email (from auth), phone, age (if set), role, status, joined date.
- Admin can update role and membership status directly from this page.
- Scope guard: non-super-admin can only view members of their own organization.

## Phone Action

Users should be able to tap a phone button to call another user.

Mobile/PWA behavior:

```txt
tel:{phone_number}
```

## Visibility

Confirmed:

- Organization members can see other organization members.
- Members can see phone numbers for calling.

Open privacy questions:

- Should age be visible to everyone or only editable in My Profile?
- Should phone number be required?
- Should deactivated users appear in the directory?

## Admin Management

Admin-capable roles should be able to:

- View all users
- Search users
- Filter by role/status
- Change role
- Deactivate user

Regular users should not be able to change another user's role or status.
