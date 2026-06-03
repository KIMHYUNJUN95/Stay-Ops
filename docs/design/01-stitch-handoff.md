# Google Stitch Handoff

## Purpose

Google Stitch will be used to create wireframes, screen layouts, and visual directions for StayOps.

The implementation workflow should make it easy to compare Stitch designs with actual PWA/admin web screens.

## Best Ways to Share Stitch Designs

## 1. Screenshot Export

Best for quick review.

Send:

- Full-screen screenshot
- Mobile and desktop versions if available
- One screenshot per screen/state

Useful for:

- Layout review
- Visual direction
- Screen-by-screen implementation

## 2. Figma Export or Figma Paste

Best for precise design handoff if available.

Send:

- Figma link
- Specific frame names
- Screenshots of selected frames if link access is limited

Useful for:

- Spacing
- Typography
- Component structure
- Design system extraction

## 3. HTML/CSS or Generated Code Export

Best as visual reference, not final production code.

Send:

- Exported code files
- Preview screenshot
- Notes about which screen/state it represents

Important:

- Generated code should be treated as reference.
- Production code should follow the actual StayOps stack and architecture.

## 4. Prompt + Result

Best for design iteration history.

Send:

- Stitch prompt
- Result screenshot
- What you liked
- What you want changed

Useful for:

- Understanding design intent
- Recreating variants
- Building a consistent design language

## Recommended Handoff Format

For each screen, provide:

```txt
Screen name:
Device:
Role:
State:
Stitch screenshot or Figma frame:
Important interactions:
Notes:
```

Example:

```txt
Screen name: Mobile Field Home
Device: iPhone
Role: Part-time Staff
State: Active cleaning timer
Stitch screenshot: attached
Important interactions:
- Start cleaning
- Report lost item
- Report maintenance
- Read announcement popup
Notes:
- Keep timer visible at all times
```

## Priority Screens to Design First

Recommended first Stitch screens:

- Mobile login
- Mobile field home
- Active cleaning timer
- Maintenance quick report
- Lost item quick report
- Order request form
- Announcement list/detail
- Admin dashboard
- Admin calendar/occupancy
- Admin cleaning status

## Liquid Glass Notes

The visual direction is Apple-inspired Liquid Glass.

Implementation notes:

- Use glass surfaces carefully.
- Avoid low-contrast text.
- Avoid excessive blur on data-heavy admin screens.
- Use stronger solid backgrounds for forms and tables if readability suffers.
- Test Korean, Japanese, and English text in the same layout.
- Prefer readable Liquid Glass over decorative Liquid Glass.
