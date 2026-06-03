# Multilingual Strategy

## Supported Languages

Initial languages:

- Korean: `ko`
- Japanese: `ja`
- English: `en`

## Principle

Multilingual support should be designed from the beginning, not added later.

Korean, Japanese, and English should all be treated as first-class supported languages from the first implementation, even if this takes more time.

Do not build Korean-only UI first with plans to translate later.

## App Language

Each user should be able to choose their own app language.

Language should be selected during signup.

Users should also be able to change their language later from My Profile.

Example:

- Korean manager uses Korean
- Japanese front desk staff uses Japanese
- English-speaking staff uses English

All users should still work in the same operational records.

## Data Language

There are two types of text:

### System Text

Examples:

- Buttons
- Labels
- Status names
- Error messages
- Navigation

These must be translated through app localization files.

### User-Entered Text

Examples:

- Maintenance description
- Lost item note
- Comment
- Order reason

These should remain as entered by the user.

Automatic translation can be considered later, but it is not part of the first MVP.

## Localization Keys

Use stable keys instead of hardcoded UI strings.

Example:

```txt
lostFound.title
maintenance.status.inProgress
orderRequest.action.approve
```

Hardcoded UI strings are not allowed in production UI.

Every UI label, button, status, validation message, empty state, popup, and notification text should use localization keys.

## Current Implementation Notes

- The main localization dictionary lives in `src/lib/i18n.ts`.
- Announcement-specific copy lives in `src/lib/announcement-i18n.ts`.
- Supported locale codes are `ko`, `ja`, and `en`.
- Korean is the fallback/default locale when no user preference is available.
- Authenticated app UI should use `profiles.preferred_language`.
- Navigation labels, role labels, login, onboarding, mobile shell, admin shell, and the development entry screen should read from the dictionary.
- Brand names such as `StayOps` may remain literal unless a future branding decision changes them.
- Feature modules must add all new visible strings to the dictionary in Korean, Japanese, and English before shipping.

## Date, Time, and Number Format

The app should format dates and times based on language or user preference.

Examples:

- Korean: 2026년 5월 4일
- Japanese: 2026年5月4日
- English: May 4, 2026

## Important Warning

Do not store translated status names as the source of truth.

Use internal status codes.

Example:

```txt
status: "in_progress"
```

Then display:

- Korean: 진행 중
- Japanese: 対応中
- English: In progress

## 2026-05-23 i18n Repair Note

- `src/lib/i18n.ts` was repaired after mojibake/fallback leakage caused mixed-language UI across multiple pages.
- Architecture: `FALLBACK_DICTIONARY` (English) + `localeOverrides` per locale + `mergeDictionary` deep merge. `en: {}` uses FALLBACK directly.
- `getDictionary(locale)` now applies locale-specific overrides for Korean and Japanese across app/admin/mobile/auth/onboarding/cleaning/request/calendar/profile surfaces.
- English remains the fallback for missing keys.
- New feature strings must be added to all three locales in the same implementation cycle.

## 2026-05-23 Japanese Completeness Pass

- All production-visible Japanese translations added in a second pass.
- Surfaces covered: admin settings, admin user errors/success, request image upload, mobile home snapshot, cleaning session list/table/toasts/errors, lost item linked form modal/errors, maintenance linked form modal/errors, onboarding errors.
- No English-visible UI string should remain for Japanese users on currently implemented production pages. Dev-only pages such as `/`, dev entry, and the foundation preview may still use English.
- `announcement-i18n.ts` stores Korean/Japanese strings as Unicode escape sequences (`\uXXXX`), which decode correctly at runtime.
