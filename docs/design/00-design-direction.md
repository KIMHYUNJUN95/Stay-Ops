# Design Direction

## Current Status

The main StayOps visual direction is confirmed.

Current design status:

- Apple-inspired Liquid Glass accents with strong business-app readability are the confirmed direction.
- The mobile shell uses a clean pure-white base; Liquid Glass is applied selectively to high-value surfaces such as floating navigation, cards, chips, and bottom sheets.
- Google Stitch is being used for planning and screen direction.
- Multiple mobile and admin web screens have passed as v1 working directions.
- Admin Reservation Calendar is deferred from final Stitch acceptance and should be implemented as a custom dense room/date timeline if Stitch cannot produce the required layout.
- Remaining design closeout work includes App Splash / Launch Screen, role-based visibility review, and final Stitch progress cleanup.

## App Splash / Launch Screen

StayOps should include a short app launch experience for the mobile app/PWA.

Direction:

- White or bright gray-white background.
- StayOps app logo centered on the screen.
- Very brief display when the app starts, similar to familiar consumer app launch screens.
- Calm, clean, and not decorative.
- No marketing copy.

Current status:

- Required for app polish.
- Final logo is not designed yet.
- Use a temporary `Stay Ops` wordmark or placeholder mark until the official logo is created.
- The interim wordmark renders as `Stay Ops` (with a space) in a serif italic typeface (Noto Serif, weight 600). It is shared across all shells/entry screens via the `.wordmark` class in `src/app/globals.css` (font loaded in `src/app/layout.tsx` as `--font-wordmark`). Applied in the mobile shell header + side menu, admin shell, dev entry, and the login/onboarding headers (`dictionary.app.name`).
- The mobile top chrome is flat and borderless: no capsule outline/ring/glass/shadow — just the centered wordmark (20px, `#1c2b2a`) between two 38px circular buttons (bg `#eef1f2`, icon `#3a4a49`) on a plain white background, laid out `justify-between`.

## Product Feeling

StayOps should feel:

- Fast
- Clear
- Professional
- Calm
- Reliable
- Easy for busy staff
- Modern
- Apple-inspired

It should not feel like:

- A marketing landing page
- A social app
- A decorative dashboard
- A complicated enterprise tool

## Design Priorities

### 1. Speed

Hotel staff may use the app while standing, walking, answering guests, or handling urgent work.

Important actions should be quick:

- Register lost item
- Report maintenance issue
- Create order request
- Update status
- Add photo

### 2. Clarity

Every task should clearly show:

- What happened
- Where it happened
- Who owns it
- What status it is in
- What needs to happen next

### 3. Role-Based Simplicity

Different roles should see different priorities.

Examples:

- Front desk needs search and guest-facing information.
- Maintenance needs assigned work and completion actions.
- Admin needs overview, filters, and assignment controls.

## Client-Specific Design

### Mobile App

The mobile app should be optimized for:

- Fast field entry
- Photo capture
- Assigned tasks
- Push notifications
- Simple status updates
- Staff schedules

### Admin Web App

The admin web app should be optimized for:

- Calendar and schedule overview
- Check-in/check-out review
- Cleaning status tracking
- Staff and role management
- Task assignment
- Filtering and search
- Bulk review
- Reports and operational visibility
- Beds24 reservation/occupancy views
- Maintenance, lost and found, order requests, and announcements
- User directory and role management
- Recurring work management

## Early UI Direction

Possible design direction:

- PWA-first mobile field interface
- Admin web operations console
- Pure-white mobile shell with selective Apple-inspired liquid glass accents
- Bottom tab navigation: Home, Calendar, Cleaning, Requests, Announcements
- Clear status chips
- Compact task cards
- Fast create button
- Photo-first issue reporting
- Calm neutral base with meaningful status colors

## Visual Style Direction

Confirmed direction:

- Pure-white operational base with selective Apple-inspired Liquid Glass surfaces
- Light mode only for the MVP/internal rollout (dark mode deferred until post-launch — see "Light and Dark Mode" below)

Important interpretation for StayOps:

- Use subtle translucency, blur, depth, and layered surfaces only where they add clarity or polish.
- Do not make the whole mobile app glass. Keep the global shell/background solid and calm.
- Prefer restrained Liquid Glass refinements on floating bottom navigation, popup/bottom-sheet surfaces, and selected mobile cards/chips; keep admin data surfaces more solid when readability matters.
- Keep operational readability higher priority than decoration.
- Avoid making the UI too flashy for field work.
- Status colors must remain clear and accessible.
- Admin tables, calendars, and forms must stay dense and easy to scan.
- Use solid or lightly translucent surfaces behind important text.
- Avoid low contrast glass panels for critical data.

### Admin Dashboard Shared UI Contract

The admin dashboard uses one operations-console design system. The current implementation baseline is
`src/components/admin/admin-console.css` plus reusable primitives in `src/components/admin/shared`.

- Reuse shared admin primitives before creating feature-local controls.
- Month/date/time pickers, chip filters, reason modals, side-panel behavior, status chips, cards, tables,
  and action bars should remain visually and interaction-wise consistent across `/admin/*`.
- Shared formatting/downloading helpers that affect visible output, such as yen formatting and status-pill
  mappings, should live with the admin shared layer when multiple admin pages use the same result.
- New admin pages may extend the shared system, but should not introduce a second visual language or
  one-off control set unless a documented decision explains why.
- Multilingual length checks (`ko`, `ja`, `en`) are part of the design acceptance criteria for shared
  admin controls.

## Mandatory Mobile Visual Consistency Rule (Do Not Break)

This is a hard project rule and must always be enforced:

- All mobile pages under `/mobile/*` must share one coherent visual system based on a pure-white shell, high readability, and selective Liquid Glass accents.
- Liquid Glass is a partial treatment, not a full-screen theme. Apply it to floating navigation, bottom sheets, important cards, chips, and overlays when it improves polish without harming readability.
- The current shared `MobileShell` behavior is the baseline: pure-white background, scroll-aware top chrome, floating capsule bottom navigation, and slide-out side menu.
- No mobile page is allowed to mix unrelated visual languages once touched.
- If a page is implemented or modified and cannot meet this consistency level in the same cycle, the change is not considered complete.

Required consistency checkpoints for every mobile page update:

1. The shell/background stays visually unified and pure white unless an explicit page-level exception is approved.
2. Glass accents are used intentionally and consistently, not as a blanket background treatment.
3. Header/body/cards/controls feel like one design family.
4. Calendar, Cleaning, Requests, Announcements, and Home have consistent interaction polish.
5. Readability and accessibility remain stronger than visual decoration.

## Light and Dark Mode

**Status (2026-06-08): Light mode only. Dark mode is deferred until after the official launch.**

For the MVP and internal rollout StayOps ships light-mode-only. All dark-mode code, styling, theme state, and the theme-toggle UI have been removed (see `docs/planning/06-current-status.md` → "Dark mode removed"). The previous System/Light/Dark theme preference no longer exists.

Implementation notes (current):

- Use design tokens for colors, glass surfaces, borders, shadows, and status colors. The light `:root` token set in `src/app/globals.css` is the single source of truth.
- Important operational text must remain high contrast.

Post-launch (deferred): dark mode may be reintroduced as a fresh slice. If it is, Liquid Glass effects must be tuned separately for dark mode and both mobile PWA and admin web must support it, with the decision log updated first.

## Design Source Workflow

Screen wireframes and layouts will be created with Google Stitch.

Implementation should follow Stitch outputs, but the final product must still respect:

- Real operational workflows
- Responsive PWA constraints
- Accessibility
- Multilingual text length
- Data-heavy admin screens

## Open Design Questions

- Should the app feel more like a mobile task manager or an operations control panel?
- Should admins use a web dashboard later?
- Which admin web features must be included in the first MVP?
- ~~Should the first MVP include dark mode?~~ Resolved 2026-06-08: no — light mode only for MVP; dark mode deferred until post-launch.
- Should each hotel be able to customize logo/color?
