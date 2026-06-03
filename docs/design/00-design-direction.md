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
- Use a temporary StayOps wordmark or placeholder mark until the official logo is created.

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
- Light mode and dark mode support

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

StayOps must support:

- Light mode
- Dark mode

Each user should be able to use the mode that fits their device/work environment.

Theme options:

- System
- Light
- Dark

Default:

- System

Implementation notes:

- Use design tokens for colors, glass surfaces, borders, shadows, and status colors.
- Liquid Glass effects must be tuned separately for light and dark mode.
- Important operational text must remain high contrast in both modes.
- Mobile PWA screens and admin web screens must both support light/dark mode.

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
- Should the first MVP include dark mode?
- Should each hotel be able to customize logo/color?
