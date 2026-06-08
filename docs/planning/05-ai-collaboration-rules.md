# AI Collaboration Rules

## Purpose

StayOps may be worked on with multiple AI tools such as Codex, Claude, Cursor, and others.

This document defines shared rules so all AI assistants follow the same project direction.

## Primary Rule

Before changing code, read the relevant Markdown documents.

Important docs:

- `README.md`
- `docs/planning/01-decision-log.md`
- `docs/planning/04-project-workflow.md`
- Relevant product documents in `docs/product`
- Relevant design documents in `docs/design`
- Relevant engineering documents in `docs/engineering`

## Documentation Must Stay Updated

Any AI that changes behavior, UI, data structure, permissions, or workflow must update the related Markdown docs.

Mandatory order for every change cycle:

```txt
1. Update relevant Markdown docs first (or at minimum in the same cycle before completion)
2. Implement code to match the documented direction
3. Run verification (lint/build/tests)
4. Re-sync docs if implementation-level details changed during coding
```

No feature work is considered complete until docs and code are aligned.

Additional completion rule:

- Every completed task must update the related Markdown docs in the same work cycle.
- "The code is done, docs later" is not an acceptable completion state.
- If coding changed the implementation details, the docs must be reconciled again before the task is closed.

Examples:

- New field added to maintenance request -> update maintenance workflow doc.
- Role permission changed -> update user roles and decision log.
- UI navigation changed -> update mobile/admin navigation docs.
- Tech stack changed -> update engineering docs and decision log.
- Notification changed -> update notification design doc.

## Do Not Invent Against Existing Decisions

AI assistants must not silently override confirmed decisions.

If a confirmed decision seems wrong:

```txt
1. Explain the concern
2. Propose a change
3. Wait for user confirmation
4. Update decision log if changed
```

## Current Confirmed Direction

Key confirmed decisions:

- PWA-first MVP
- Next.js App Router + TypeScript
- Supabase Auth/PostgreSQL/Storage/RLS
- Vercel deployment
- Korean/Japanese/English from the first implementation
- Pure-white operational UI with selective Apple-inspired Liquid Glass accents and strong readability
- Light mode only (dark mode deferred until post-launch; removed 2026-06-08)
- Beds24 webhook integration
- Mobile and admin web in one product
- Organization-based multi-tenant structure

## Code Style Principles

When implementation begins:

- Use TypeScript.
- Avoid hardcoded UI strings.
- Use i18n keys for all visible UI text. An automated guard (`npm run check:i18n`, part of `npm test`) fails on hardcoded Korean/Japanese/Kanji literals under `src/app` / `src/components`; legitimate domain data must use an `i18n-ignore` directive with justification.
- Use shared types where possible.
- Keep permissions enforced server-side/database-side, not only in UI.
- Keep mobile PWA and admin web behavior role-aware.
- Prefer small, testable modules.
- Implement code in line with the documented StayOps project flow (`docs/planning/04-project-workflow.md`).
- Do not skip planning/flow constraints even under fast iteration; code quality and workflow consistency are both required.
- If implementation pressure conflicts with the documented flow, pause and update docs/decision log first, then continue coding.

## Project-Flow-First Coding Rule

All assistants must treat the project workflow as an implementation contract, not a reference note.

- Required baseline sequence: `Plan -> Design -> Document -> Implement -> Test -> Review -> Update documentation`.
- For bug-fix hotpaths, investigation and patching can be immediate, but final output must still include doc sync in the same cycle.
- Any behavior that diverges from current docs must be documented before the cycle is closed.

## Design Principles

- Follow Stitch designs when provided.
- Keep Liquid Glass readable and selective.
- Support light mode only (dark mode deferred until post-launch).
- Check Korean, Japanese, and English text lengths.
- Do not prioritize decoration over operational clarity.

### Mandatory Mobile Design Consistency (Hard Rule)

- This rule is mandatory and non-optional.
- Any change to `/mobile/*` must preserve one coherent mobile system: pure-white shell/background, strong readability, and selective Apple-style Liquid Glass accents.
- Liquid Glass is not a full-screen treatment. Use it for floating navigation, bottom sheets, overlays, cards, chips, or other surfaces where translucency improves perceived quality without reducing clarity.
- `MobileShell` is the shared behavior baseline: scroll-aware top chrome, two-line hamburger menu trigger with a shorter bottom line, 78% slide-out side menu, and floating liquid-glass capsule bottom navigation.
- Mixed visual quality between mobile tabs is not acceptable. If consistency is not achieved, the task is incomplete.

## Data and Permission Principles

- Every business record must belong to an organization.
- Do not leak data across organizations.
- Use role-based permissions.
- Part-time Staff can create/view requests but cannot change statuses.
- Order request processing is office-level.
- Price/revenue data should not be shown in StayOps MVP.

## Communication Rule

When an AI makes a change, it should summarize:

- What changed
- Which files changed
- Whether docs were updated
- What remains undecided

## Red Flag Rule

Stop and ask before:

- Changing the selected tech stack
- Changing role permissions
- Changing data deletion behavior
- Adding paid services
- Adding Apple Developer / Google Play dependency
- Changing multilingual strategy
- Changing PWA-first direction
