# Current Status

## Purpose

This document tracks what has been completed, what is in progress, and what remains for the StayOps MVP.

Use this together with:

- `docs/planning/04-project-workflow.md`
- `docs/engineering/06-implementation-plan.md`
- `docs/planning/01-decision-log.md`

## Current Build Stage

```txt
Phase 13: QA and Internal Rollout — in progress (2026-06-04)
```

All core MVP implementation phases (6–12) are substantially complete. Phase 13 (QA and internal rollout) is now the active phase. Controlled internal rollout may begin once the required pre-rollout steps in `docs/planning/13-qa-checklist.md` section 12 are completed. Phase 13 remains open until browser E2E verification is finished and the first staff batch is successfully onboarded.

See `docs/planning/13-qa-checklist.md` for the full system QA checklist and release-readiness summary.  
See `docs/planning/14-rollout-guide.md` for the internal rollout guide.

## Approved Post-MVP Feature Batch (confirmed 2026-06-09)

A five-feature batch was approved on 2026-06-09 as the next build scope after the Phase 6–13 MVP. Two slices have since shipped first cuts (Linen Defect Registration, Personal Todo / Shared Task); the rest are documented and queued. Source of truth: `docs/planning/15-feature-batch-plan.md` and `docs/planning/01-decision-log.md` (2026-06-09 entries).

Build order and readiness:

1. **Linen Defect Registration** — **First slice implemented (2026-06-10).** Mobile linen return ledger is live under `/mobile/linen-return/*` (side-menu entry `linen-return`). All five screens shipped: building picker, building-scoped list, create, detail (permission-gated edit/delete), and ledger (record + item-summary, registrant/item filters, month navigation). Tables `linen_items`, `linen_return_records`, `linen_return_record_items` (migration `202606100002_linen_returns.sql`); photos reuse the `request-images` bucket (`linen-returns/` subfolder). Building = canonical property name (text). **2026-06-15 hardening:** repeated saves by the same user for the same building on the same Tokyo operating day now auto-merge into one header record (same item = quantity sum, new item = appended line). Deferred: building-specific item master UI, admin web. The migration must be applied to the linked Supabase project (Dashboard SQL editor or `supabase db push`). See Product `19` + Tech-design `08` "As-Built".
2. **Personal Todo / Shared Task Inbox** — **First slice implemented (2026-06-10), hardened through 2026-06-15.** Mobile Todo/Shared Task is live under `/mobile/tasks/*` (side-menu entry `tasks`): six views (Today / Tomorrow / Inbox(관리함) / Sent(공유함) / Completed(완료/기록) / Calendar), quick add + detailed create/edit, task detail with unified update log (text + photos), participant management, and context linking to building · room · reservation · guest. Tables `tasks`, `task_participants`, `task_updates` (migration `202606100003_todo_tasks.sql`); photos reuse the `request-images` bucket (`task-images` / `task-update-images`). Hardening shipped fail-safe create/share behavior, author-editable task photos, update-log photo upload, client-side title+author/date filtering, month-based task calendar navigation, custom date/time pickers, and body-portaled sheets over the mobile shell. **2026-06-12 IA adjustment:** the extra intermediate tab was removed from the mobile UI; manual complete / reopen controls were temporarily removed in the same pass but **re-introduced on 2026-06-13** — see the Completion bullet below. **2026-06-15 recurrence hardening:** repeat rules now generate real task-instance rows (`recurrence_series_id`, `recurrence_instance_date`) instead of a label-only reminder. Current workspace: `Today / Tomorrow / Inbox(관리함) / Sent(공유함) / Completed(완료/기록) / Calendar` (six views). `status` / `completed_*` columns are now active (used by completeTask / reopenTask). Notification expansion added `task_due_soon` + `task_overdue` via the daily CRON-secret task reminders endpoint; shared + update-log notifications remain active. **Activation status:** `202606110001_task_reminder_notifications.sql` is applied on the linked Supabase project; the remaining manual step is still setting `CRON_SECRET` in the Vercel project env so `/api/tasks/reminders` is authorized.

Task Context Link — design + partial data layer (2026-06-12): four-screen context-linking UI allowing a task to be optionally attached to a building · room · reservation · guest. **Full data layer (2026-06-12):** `fetchRoomReservations` server action (`src/app/mobile/tasks/context-actions.ts`) queries the `reservations` table for the selected `room_label` across the current month + next month (Tokyo timezone, 2-month window) — `check_in_date < first day of month after next`, `check_out_date >= first day of current month`, status excludes `cancelled`/`no_show`. Results are sorted by `check_in_date` ascending, `isLive` is computed server-side (Tokyo today). The section label "이 객실의 예약" shows the period (e.g. "6/1 – 7/31") inline. Spinner shown while loading; empty state if no reservations found. Typing work-around: a `ReservationSelectRow` type alias + `as` cast bypasses a supabase-js v2 enum-narrowing bug where chained filter methods collapse the inferred row type to `never`. **Screen 4 — task detail context block + list chip (2026-06-12)**: `LinkedTaskContext` type added to `src/lib/tasks.ts`; `TaskRecord` now carries `resolvedContext: LinkedTaskContext | null`. The `hydrate()` function does batch parallel joins (reservations → property_name + room_label + source + dates; properties and rooms for room-only links) so list queries incur at most 3 extra DB round-trips only when context-linked tasks exist. New `LinkedContextBlock` component (`src/components/tasks/linked-context-block.tsx`) implements the spec `lctx` card: Building icon with primary-tinted border, property · room name (15px/800), channel badge + guest + date range, "예약 상세로 이동" ArrowUpRight link, ChevronRight on far right. Shown in `task-detail-view.tsx` between the header card and participants section when `task.resolvedContext !== null`. `task-card.tsx` meta row shows a `bg-primary/[0.09] text-primary` MapPin chip ("Property · Room호" or guestName) when the task has linked context. New i18n: `contextLinkedSection / contextGoToReservation` (ko/ja/en). **Context link real data — buildings + rooms (2026-06-12)**: `fetchPickerBuildings()`, `fetchPickerRooms(propertyId)`, and `fetchRoomReservations(propertyId, displayRoomLabel)` server actions in `context-actions.ts` now mirror the **reservation calendar's active-room catalog** instead of querying `rooms`/`properties` raw. The picker shows only genuinely active rooms and merges sub-units (201 / 201_2 → one "201" cell), exactly like the calendar room axis. `context-picker-sheet.tsx` stub data removed — buildings load on mount, rooms load when a building is tapped (loading spinners + empty states). `PickerBuilding.id` is the canonical property name; `PickerRoom.label` is the display label. **Shared resolver extracted (2026-06-12)**: `getRawPayloadString`, `buildGlobalExternalRoomToCanonical`, and `resolveReservationCanonicalRoomLabel` moved into `src/lib/rooms.ts` as the single source of truth for reservation→active-room resolution (priority: raw_payload room/unit id → unit name → reservation room_label, exact then normalized; authoritative vs provisional mode). The picker consumes it; the calendar page still holds an inline equivalent (behaviorally identical) that can be unified onto the lib helper in a later pass. Active-room rules honored: `status='active'`, Beds24 `external_minimum_stay >= 50` excluded, Sano property + Takadanobaba 401_2 excluded. **Deactivation safety**: the picker offers only active rooms, but `hydrate()`'s context joins are NOT status-filtered, so a task linked to a room/reservation that later goes inactive keeps showing its context. `buildLinkedContext()` (tasks.ts) normalizes the saved reservation's raw `property_name`/`room_label` to canonical property + merged display label so chips/detail read consistently (e.g. "荒木町A" / "201_2" → "아라키초A" / "201"). Provisional fallback (`getActiveRoomCatalog` undefined): legacy `properties`/`rooms` listing + exact room_label reservation match. **Context link write path (2026-06-12)**: Full save pipeline wired. `ContextPickerSheet.onSelect` → `setLinkedCtx(ctx)` in `TaskCreateForm`. `handleSubmit` appends the context fields to formData; `createTask`/`updateTaskCore` parse and persist them (empty string → null = clear). Edit page (`[id]/edit/page.tsx`) passes `initialCtx` from `task.resolvedContext` so an existing link round-trips. **Context link UUIDs + deep-link complete (2026-06-12)** — closes the two remaining gaps:
- **`property_id` / `room_id` now persisted.** `getActiveRoomCatalog` (and `ActiveRoomCatalogItem`) gained `roomId` + `propertyId` (the `rooms.id` / `rooms.property_id` UUIDs; the SELECT now includes them). The picker carries them: `PickerBuilding.propertyId` and `PickerRoom.{roomId,propertyId}` (for a merged display label like 201 = {201, 201_2}, the **base sub-unit** — canonical key === display label — is the representative row). `LinkedContext` / `LinkedTaskContext` / `TaskInitialCtx` gained `propertyId` + `roomId`; the form sends `ctxPropertyId` / `ctxRoomId`; both server actions write `property_id` / `room_id`. So a **room-only link (no reservation)** now resolves its building name + room number in the chip and detail block. `buildLinkedContext()`'s room-only branch normalizes the joined raw property/room labels to canonical property + merged display label (matching the reservation branch). UUIDs also round-trip through edit via `resolvedContext` → `initialCtx`. The calendar page's inline `roomCatalog` type was replaced with the imported `ActiveRoomCatalogItem` (no behavior change).
- **"예약 상세로 이동" routing wired.** `LinkedContextBlock` now deep-links to `/mobile/calendar?property={canonicalName}&month={check-in YYYY-MM}` (room-only links omit the month → current month). Guest-only links (no property) render the card non-interactive (go-link + chevron hidden), since there is nothing to navigate to.
- **Deep-link now auto-opens the reservation sheet (2026-06-12).** The deep-link also carries `&reservationId={id}`, and `MobileCalendarView` auto-opens that reservation's detail sheet on arrival so the guest info shows immediately (no extra tap, no manual refresh). Both `reservationId` and `property` are read client-side from the **live URL via `useSearchParams()`** (server prop as fallback) because a soft `router.push` to `/mobile/calendar` can serve a prefetched/cached RSC payload with stale params — that stale-prop path was why the modal previously needed a refresh. The auto-open is scheduled in `requestAnimationFrame` with the "already-opened" guard set inside the callback, so React StrictMode's double-invoke can't cancel it. (Reservation list/maps are param-independent, so URL-derived params render correctly without a refetch.)
- **Today-view drag-reorder (2026-06-12).** The Today tab supports manual drag-and-drop ordering, via a **dedicated grip handle** on each card (no conflict with tap/long-press menu/swipe; the handle sets `touch-action:none` and stops propagation). Scope at first ship: **Today tab** (Overdue + Today sections, each independently reorderable); extended to the Tomorrow tab the same day (next bullet). New column `tasks.sort_order` (nullable int, migration `202606120001_task_sort_order.sql`, **applied to the linked Supabase project**); NULL = unranked → falls back to priority order, so behaviour is unchanged until first drag. New server action `reorderTasks(orderedIds)` (`[id]/actions.ts`) sets each id's `sort_order` to its index (0..n), org-scoped, revalidates. `sort_order` is **global to the task, not per-user** (MVP limitation). New component `src/components/tasks/reorderable-task-list.tsx` (pointer-based, variable-height aware, optimistic + persisted). Reorder is disabled (plain list) while a search/date filter is active or in multi-select mode. New i18n `reorderHandle` (ko/ja/en). `tasks-workspace.tsx` Today sections now sort with `orderSort` (sort_order → priority fallback).
- **Tomorrow (내일) tab + day-tab swipe (2026-06-12).** Added a second day tab next to Today: **Tomorrow** (`view=tomorrow`, added to the page's VIEWS allow-list and the workspace chip tabs, `Sunrise` icon). It mirrors Today's full behaviour — same card layout/chips and drag-reorder — filtered to tasks anchored to tomorrow (Tokyo, `ymdShift(today, 1)`). **Swipe semantics**: the card-body left-swipe reveals one move action per view — Today → "내일로" (`moveTaskToTomorrow`, `scheduled_date`=tomorrow), Tomorrow → "오늘로" (`moveTaskToToday`), Inbox → "오늘로"; Sent/Calendar keep swipe disabled. `TaskCard`'s `showMoveToday` prop was replaced with `swipeAction: "today" | "tomorrow"` + `swipeReturnView`; both move actions now redirect back to the originating tab (`/mobile/tasks?view=…`) instead of always Today. New i18n `viewTomorrow / secTomorrow / tomorrowEmptyTitle / tomorrowEmptySub / swipeTomorrow` (ko/ja/en). Drag-reorder applies to the Tomorrow list too (same `sort_order` / `reorderTasks`). The quick-add (FAB) sheet also gained an **"Add to Tomorrow"** one-tap button beside "Add to Today" (`quickCreateTomorrowTask`, `scheduled_date`=tomorrow → Tomorrow tab); new i18n `quickAddTomorrow` (ko/ja/en).
- **Completion + 완료/기록 tab + daily report (2026-06-13).** Task completion was re-introduced (status-circle tap completes/reopens with an undo toast; detail view has 완료/다시 열기). `completeTask` / `reopenTask` (`[id]/actions.ts`) stamp/clear `status` + `completed_at` + `completed_by_user_id`, write a `completed`/`reopened` update-log row, and (on complete) fan out a now-active `task_completed` notification. A new **Completed (완료/기록)** top tab groups completed tasks by Tokyo completion day (`tokyoDateOf(completed_at)`, newest first; count badge = today's completions). Each day group has a **보고서** button → **daily report (업무일지)**: `generateDailyReport(date)` (`report-actions.ts`) collects the caller's own completed tasks for that Tokyo date and returns a date-headed bullet list — **free, template-based, no LLM / no API key / no cost**, with a deterministic local `tidy()` pass (whitespace, bullet glyphs, punctuation spacing) for light auto-correction; shown in an editable + copyable bottom sheet. (An LLM-backed `claude-haiku-4-5` variant was prototyped then dropped — the consumer Claude subscription can't auth the API and pay-as-you-go was not wanted; `@anthropic-ai/sdk` removed.) **Staff-only**: `canGenerateDailyReport(role, can_generate_report)` (`src/config/roles.ts`) = `role != 'part_time_staff' OR profiles.can_generate_report` — server-enforced, "권한 없음" popup otherwise. New column `profiles.can_generate_report boolean not null default false` (migration `202606130001_profile_report_access.sql`, **applied to the linked Supabase project**), toggled per-user by owner/office_admin in admin user management (`updateMemberReportAccess`). No env var required. See decision log (2026-06-13).
- **Projects tab + sections (2026-06-15, first slice).** A seventh **프로젝트** tab (between 관리함 and 공유함) groups tasks under optional sections. New tables `projects`, `project_participants`, `project_sections` and two `tasks` columns (`project_id`, `section_id`) — migration `202606150002_projects.sql` (**applied to the linked Supabase project on 2026-06-15**). A project task is a `tasks` row with `project_id` set; it appears **only** in the Projects tab (excluded from Today/Tomorrow/Inbox/Sent/Calendar), while the Completed tab gained a 전체/일반/프로젝트 filter that can surface project completions. Implemented: project create/delete, section add/rename/delete (deleting a section also deletes its tasks), an Unsectioned area, project-task create + complete/reopen (reusing `completeTask`/`reopenTask`), member invite/remove and leave, RLS via a new `is_project_participant()` helper + an extended `tasks` SELECT policy, and a `project_shared` notification. Server actions in `src/app/mobile/tasks/projects/actions.ts`; queries in `src/lib/projects.ts`; UI in `projects-board.tsx` + `project-detail-view.tsx` + the `/mobile/tasks/projects/[projectId]` route. New i18n `tasks.projects.*` + `mobile.notifications.project*` (ko/ja/en). `npm run lint` + `npm run build` pass. **2차 추가 (2026-06-15):** project tasks now link a building·room·reservation·guest context (the `작업 추가` button opens the full create form pre-bound via `/mobile/tasks/new?project=…&section=…`; `createTask` validates membership + writes `project_id`/`section_id`, no schema change), and sections are **drag-reorderable** by the owner (`reorderProjectSections` + `reorderable-section-list.tsx`); the create sheet's invite UI was reconciled to the source design (inline search + chips). Deferred: per-task drag-reorder, project stats/archive, project↔regular task move, admin web view. See Product `23` + Tech-design `09` "Projects (as-built)".
- **Bottom sheets — iOS drag-to-dismiss + X removal (2026-06-15).** All mobile bottom sheets now share one drag-to-dismiss primitive, `useSheetDragDismiss` (`src/components/shell/use-sheet-drag-dismiss.ts`): drag the grab handle / header down to dismiss (release past `max(80px, 25% height)` or a ≥0.5 px/ms flick; otherwise snap back), with the scrim dimming on drag. Covered sheets: the bottom-bar editor (`mobile-shell`), Tasks quick-add / Calendar day sheet / long-press menu (`tasks-workspace`), share picker, context picker, report sheet, project create (`projects-board`), project members (`project-detail-view`, promoted to a slide-in/out sheet), photo gallery (`photo-gallery`), and the calendar reservation detail (`mobile-calendar-view`); the order action sheet's draggable variant (`order-action-bar`, `isOrdered`). Because the slide dismisses, the **top-right close (X) buttons were removed** from these sheets (scrim tap + Esc remain); X icons with other roles are kept. A touch-propagation fix on the handle stops the shell's pull-to-refresh / swipe-nav from dragging the background with the sheet. Excluded: center-aligned confirm/delete/rename dialogs, the cleaning confirmation card, fixed action bars, the side menu, and the photo lightbox. Docs: Product `16` (canonical contract), `18`, `15`, `23`, Tech-design `09`. `npm run lint` + `npm run build` pass.
- **Recurrence reworked to Todoist-style (2026-06-16).** The 2026-06-15 pre-materialization model (one `tasks` row per date across a ~2-month window) was replaced: a recurring task is now a **single live row** that **rolls forward to its next occurrence on completion** (`completeTask`) and **back on undo** (`reopenTask`), preserving the scheduled/due offset + time. The **calendar shows future occurrences as virtual previews** computed from the rule (`recurringOccurrencesInRange` in the new client-safe `src/lib/tasks-recurrence.ts`) — no extra rows. This fixed the bug where 관리함/공유함 filled with duplicate-looking entries (a daily task had generated ~50 rows). `materializeRecurringTasks` is deprecated and no longer called. One-time cleanup migration `202606160002_collapse_recurring_instances.sql` (**applied to the linked Supabase project**) collapsed existing instances to one row per series (98 rows removed). Docs: Product `18` → Recurring Tasks (As-built 2026-06-16), decision log 2026-06-16. `npm run lint` + `npm run build` pass.
- **Overdue prompt on the Today tab (2026-06-16).** When the viewer has their own overdue tasks, a banner offers **오늘로 가져오기** (`rescheduleOverdueToToday`) and **지난 미완료 삭제** (`dismissOverdueTasks`, two-step confirm). One-off overdue tasks are moved/deleted; recurring tasks keep their series — move re-anchors the single row to today, delete advances it to the next future occurrence (so a daily task's missed run clears but tomorrow's stays). Both actions are author-scoped server-side. New i18n `tasks.overduePrompt*` (ko/ja/en). `npm run lint` + `npm run build` pass.
3. **Staff Suggestions / Feedback Box** — **Debug pass 3 (2026-06-16):** the author edit is now **atomic** — title/body/context/photos + reference re-sync run in one Postgres transaction via `update_staff_suggestion` (migration `202606160005`), fixing a data-integrity bug where a failed reference re-insert could wipe all references while still reporting success (RPC error → `?error=save_failed`, no silent partial success); and changing the recipient while `submitted` now **notifies the new recipient** (reuses the `created` event; unchanged recipient and self suppressed; the RPC returns the previous reference set so only newly-added references are notified). **Debug pass 2 (2026-06-16):** added author edit/delete (submitted-only — `updateStaffSuggestion`/`deleteStaffSuggestion` + `[id]/edit` reusing compose + detail affordances) and fixed the list card to show the author on Received/Referenced (recipient on Sent). **First slice complete & internally shippable 2026-06-16 (Steps 1–8)**: UI + DB schema + create + list + detail + comments + status + notifications + full ko/ja/en i18n & QA hardening. Product `22`, tech-design `12`, notifications `14`. **Step 8 (i18n/QA):** all suggestions UI strings moved into one localized `dict.mobile.suggestions` group (ko/ja/en) threaded as a `copy` prop through every component/page (tabs, filters, form labels, buttons, validation/empty/error states, status labels, hold/completion prompts, comment UI, titles); empty/error/permission edge cases verified; dead `suggestions-detail-referenced.tsx` removed. **Known limitations:** `/mobile/notifications` still renders the separately-deferred mockup, so suggestion notifications dispatch + display logic are correct but only surface once that screen is re-wired. Four migrations **pending apply** to the linked Supabase project: `202606160001_staff_suggestions.sql` + `202606160003_suggestion_notifications.sql` + `202606160004_suggestion_image_storage.sql` (debug-pass storage-RLS fix for suggestion photo uploads) + `202606160005_update_staff_suggestion_fn.sql` (atomic author-edit function — Debug pass 3). **Step 7 (notifications):** one `suggestion_activity` notification type discriminated by `payload.event` (created / referenced / status / comment); `notifySuggestionParticipants` fan-out (actor-skipped, participant-scoped, deep-links to `/mobile/suggestions/{id}`); wired into create (recipient + referenced), status (author + referenced), comment (other participants); `getNotificationDisplay` branch + ko/ja/en copy (`mobile.notifications.suggestion*`). **Step 6 (status):** `updateStaffSuggestionStatus` server action (`src/app/mobile/suggestions/actions.ts`, service-role, **recipient-only**, target validated, `on_hold`→hold_reason / `completed`→completion_note required, freely reversible); the recipient's status bar + status/hold/completion sheets now submit real changes (controlled note textareas, server-enforced), and the detail + list status chips reflect them. Author/referenced users cannot change status. **Step 5 (comments):** create/update/delete comment server actions in `src/app/mobile/suggestions/actions.ts` (service-role; participant-only create, comment-author-only edit/delete, not-fully-empty + ≤5 photos, **independent of suggestion status**); composer (`suggestion-comment-composer.tsx`, text + photos via shared upload) shown to **all participants** and stacked above the recipient's status bar; each comment (`suggestion-comment-item.tsx`) has inline edit/delete on the viewer's own comments. List comment counts (Step 3) now reflect real activity. **Step 4 (detail):** `getSuggestionDetail` (`src/lib/suggestions-queries.ts`) loads one suggestion participant-only (RLS-backed + derived `viewerRole`; null → redirect to list, no leak) with author/recipient/referenced people, status + hold_reason/completion_note, category/property·room, photos, timestamps, and the comment thread; one **role-aware** `SuggestionsDetail` renders recipient (status bar) / referenced (composer) / author treatments — all now functional (comments wired in Step 5, status in Step 6); the old `/mobile/suggestions/referenced` route now redirects to the list. **Step 3 (list):** `getSuggestionListData` (`src/lib/suggestions-queries.ts`) loads real Sent (author) / Received (recipient) / Referenced (via `staff_suggestion_references`) data, org+user scoped (RLS-backed); the list screen now shows real cards (status/title/excerpt/recipient/ref+comment counts/relative time), a working status filter (active = submitted+reviewing, all, or single), real segment counts, and an empty state (`mobile.suggestions.empty`, ko/ja/en). **Step 2 (create):** `createStaffSuggestion` server action (`src/app/mobile/suggestions/actions.ts`, service-role insert + validation: recipient active-same-org-≠author, references deduped/excluding author+recipient, title/body required, ≤5 photos, status `submitted`); compose screen wired (controlled fields, data-driven recipient single-select / references multi-select picker, `ContextPickerSheet` for building·room, `uploadRequestImages` + exported `compressImageFile` for photos → `suggestion-images/` path), redirect to `/mobile/suggestions`. New i18n under `mobile.suggestions.*` (ko/ja/en). First slice is a participant-scoped feedback thread: one required recipient, optional referenced users, `Sent / Received / Referenced` lists, recipient-only status changes, participant comments, and author main-body edit/delete only while `submitted`. **Schema (Step 1):** migration `202606160001_staff_suggestions.sql` adds `staff_suggestions` + `staff_suggestion_references` + `staff_suggestion_comments` with CHECK constraints (status enum-by-check, recipient≠author, max-5 photos on suggestion + comment, hold-reason/completion-note required), indexes (Sent/Received/status/context/referenced/thread), a `can_view_staff_suggestion()` SECURITY DEFINER visibility helper, and **read-only participant RLS (writes via service role, added later)**. TS types in `src/types/database.ts`; shared constants in `src/lib/suggestions.ts`. **Not applied to the linked Supabase project yet** (needs `supabase db push` / Dashboard SQL). At Step 1 there were no server actions / queries / notifications yet — all added in Steps 2–7 above.
4. **Internal Board** — Partial. Product `20`, tech-design `10` (skeleton). Part-time write permission approved 2026-06-09; tech-design needs fleshing out before build.
5. **Attendance / Clock-In-Out + Payroll** — **Step 14 (notifications + 18:30 reminder) implemented 2026-06-18 — final app-scope step**: attendance uses the **shared** notification system (new `attendance_activity` type, migration `202606180001`). Admin alerts (owner/`attendance_payroll_admin` only): **correction_created** (on request submit) + **abnormal_session** (midnight clock-out + stale prior-day open sessions via cron). Worker **18:30 open-session reminder**: once-per-Tokyo-day **home prompt** (shared drag-dismiss; "근무 중이에요"→`still_working` suppresses, "이미 퇴근했어요"→`left_work` routes to correction, **no auto clock-out**) backed by `attendance_open_session_reminders` (migration `202606180002`) + the self-only `respondOpenSessionReminder` action; scheduled scan `GET /api/attendance/reminders` (CRON_SECRET, mirrors tasks/reminders). i18n ko/ja/en for notification copy. In-app only (Web Push deferred); **no admin dashboard**. **Pending migrations:** `202606180001` + `202606180002` + `202606180003` (bug-fix: `target_month` on correction requests, org-scoped reminder unique constraint, partial index for session-less corrections, finalization order fix). **Step 13 (finalized-only payroll export) 2026-06-18**: `runPayrollExport` + `exportMonthlyPayroll` / `exportUserPayroll` (`src/lib/attendance-export.ts`, `src/app/admin/attendance/actions.ts`, owner/`attendance_payroll_admin` server-gated) — monthly bulk + per-person, **finalized snapshots only** (draft/reopened/superseded never included), each writing an `attendance_export_logs` audit row. Operator Excel **template still pending** → interim structured **CSV (UTF-8 BOM)** mapped to documented snapshot fields. **No export UI** (deferred web dashboard); dev route `/api/dev/attendance/export` (dev+privilege gated) streams CSV for testing. **Step 12 (privileged payroll-totals data layer) 2026-06-18**: `getPayrollTotals(org, ym)` (`src/lib/attendance-payroll-totals.ts`) — finalized labor total (finalized snapshots), expected labor total (Σ relevant hourly workers' current expected pay via `getMonthlyPayView`), unfinalized worker count, site-based totals (by **clock-in site**, first-slice rule). Expected vs finalized kept explicitly separate. **Query-only, no dashboard UI** (totals dashboard is part of the deferred web dashboard); caller-agnostic, gated by `isAttendancePayrollAdmin` (owner/`attendance_payroll_admin`); regular/hourly users never reach org-wide totals. **Step 11 (per-person monthly finalization/reopen/snapshot) 2026-06-18**: privileged backend `finalizeAttendanceMonth` / `reopenAttendanceMonth` (`src/app/admin/attendance/actions.ts`, owner/`attendance_payroll_admin` server-gated). Finalize is **blocked** while unresolved items remain (`getFinalizationEligibility`: review-required / pending corrections / open sessions / already finalized) and only for hourly months; it inserts an `attendance_month_snapshots` row (`finalized`: paid minutes, rate breakdown, 10-yen gross, finalizer, time, supersedes link) computed from the same expected-pay helpers, marking prior rows `superseded` (**history preserved**). **Reopen requires a reason**, flips `finalized`→`reopened` (expected pay resumes), never destroys history. Both audited in `audit_logs`. The worker self pay screen (`/mobile/attendance/pay`) shows the **finalized number + 확정 badge** when finalized, reverting to expected after reopen. **No admin dashboard** (deferred web dashboard). **Step 10 (hourly expected-pay + self pay view) 2026-06-18**: hourly **expected** gross-pay calc (`src/lib/attendance-pay.ts`, self-scoped) + new self monthly pay screen `/mobile/attendance/pay` (new UI in the `.att` language — no 급여 frame existed; user asked for an arbitrary screen to refine later). Effective-date rate resolution (whole-day rate, never retroactive); usable sessions only (completed + resolved; open/review-required/pending-correction/invalid excluded); 1-min paid units, breaks excluded, no premiums; monthly gross rounded to 10 yen; salaried days never pay; excluded-count + rate-segment + daily-breakdown (detail sheet) supported. Recomputes live from current attendance/corrections/rate history (no finalization). **No admin dashboard** (deferred). **Step 9 (employment/rate management) still pending** — a dev route `/api/dev/attendance/seed-pay` seeds rates for testing; pay is ¥0/empty until a rate exists. **Step 8 (manual admin management backend) 2026-06-17**: privileged manual attendance is live in `src/app/admin/attendance/actions.ts` — `createManualAttendanceSession` / `updateAttendanceSessionAdmin` / `invalidateAttendanceSession` (owner/`attendance_payroll_admin` server-gated, **mandatory reason + `attendance_session_audits` audit**). Create marks `manual_created` (+by/reason, methods `manual`), validates active-member target + org sites, guards the one-open-session collision; update edits times/sites/review_state with status coherence; invalidate sets `status='invalid'` (+invalidated_at/by/reason) and **never hard-deletes**. **No admin PC/web dashboard built** (explicit scope rule — deferred until the app is complete); these are the backend it will call, and manual/invalid sessions already reflect in the review-queue layer (수동/무효 markers) + worker self-history without UI changes. Payroll-compatible (manual completed sessions carry clock-in/out). **Step 7 (admin review backend) 2026-06-17**: org-wide correction-review **backend** is live — `src/lib/attendance-review.ts` (review-queue query with filters all/review_required/correction_requested/incomplete/manual/not_finalized + name/date/site, priority-ordered; `isAttendancePayrollAdmin` gate = owner/`attendance_payroll_admin`/platform admin) + `src/app/admin/attendance/actions.ts` (`setCorrectionInReview` / `approveCorrectionRequest` / `rejectCorrectionRequest`, all server-privilege-gated). **Approve authoritatively applies** admin-confirmed final values (default = requester's proposals) to the linked session (review_state→`approved_correction`, open→completed when both ends present) + writes an `attendance_session_audits` (`correction_apply`, before/after) row; **reject requires a comment** and leaves the session unchanged (auditable on the request row). Site-master stays owner-only (not broadened). **The review-queue UI is built in the WEB DASHBOARD later** (like site/QR); worker self-view (history chip + session changes + request status) reflects outcomes automatically on next load. **Step 6 (correction/exception requests) 2026-06-17**: the existing `/mobile/attendance/correction` form + `…/status` screens are now functional. `createAttendanceCorrectionRequest` (`src/app/mobile/attendance/actions.ts`, service-role) is **self-only + current/previous Tokyo month only**, supports reason + desired in/out times + desired site + memo + photos (≤5, via the new `attendance-corrections/` storage folder — migration `202606170003`), and **never mutates the session** (admin confirms in Step 7; no auto-apply). Session-linked and session-less **exception** requests both supported (capture failure sheets reach the form). The status screen is data-driven (`getCorrectionRequestView`, self-scoped, all four states ready for Step 7); self-history surfaces the latest per-session correction status as a chip + offers "이 세션 정정 요청". **Pending migration:** `202606170003_attendance_correction_storage.sql`. **Step 5 (self-view history) 2026-06-17**: own attendance **history** screen at `/mobile/attendance/history` — today summary + the user's own session list with a per-session detail bottom sheet (clock-in/out, sites, methods, break rows, review/abnormal markers). Query layer `src/lib/attendance-history.ts` (`getAttendanceHistory`/`getAttendanceTodaySummary`) is **strictly self-scoped** server-side (no client-supplied target user). The 이력 screen is **new UI in the existing `.att` design language** (the handoff had no 이력 frame; user-confirmed); minimal token-based CSS added; 이력 link added to the home topline. Same for salaried + hourly; no pay calc. **Step 4 (break tracking) 2026-06-17**: break start/end is live on the home (`startBreak`/`endBreak`, `src/app/mobile/attendance/actions.ts`, service-role) — open session required, one open break at a time, multiple breaks per session (each kept as its own `attendance_breaks` row), and **clock-out blocked while a break is open** (`open_break_blocks_clock_out`; never auto-closed). The home renders 출근 전 / 근무 중 / 휴게 중 from real data with live timers (휴게 중 shows current-break mm:ss, worked = elapsed − total break, running 휴게 합계/횟수); same for salaried + hourly. Break rows are payroll-ready (sum closed durations later) and not logged to `attendance_attempt_logs`. **Step 3 (GPS + QR clock-in/out) 2026-06-17**: the worker UI is now functional. `submitAttendanceScan` (`src/app/mobile/attendance/actions.ts`, service-role) validates the QR token + resolves the site, checks GPS against the site radius (haversine), enforces one-open-session-per-user, creates an `open` session on clock-in / completes it on clock-out (clock-out may be a different site; midnight-crossing → `review_required`), and logs **every attempt** (success + each failure) to `attendance_attempt_logs`. The capture screen does in-app camera QR scan (added the `jsqr` dependency) + Geolocation, mapping results to the existing success / 반경밖 / 위치권한 / QR / 이미근무중 / 근무없음 sheets (reusing the shared drag-dismiss sheet); the home renders the real open session with a live elapsed timer and launches clock-out (`?mode=out`). Full attendance i18n pass completed 2026-06-18 — ~112 new ko/ja/en keys across all 8 screens (capture, home, pay, history, correction form, correction status) with function keys for locale-sensitive sentence order. Final cleanup (2026-06-18): name suffix (`userNameDisplay`), preview fallback site (`previewSite`), and static break-preview ordinal fixed. `GPS + QR`, `GPS+Wi-Fi`, and `Wi-Fi` attendance method labels are intentionally retained as universal technical standards across chips and history/detail surfaces (not locale-specific copy). Breaks, corrections, payroll, dashboards, exports, notifications, and the full midnight sweep remain later steps. **Step 2 (site/QR backend) 2026-06-17**: site master + QR lifecycle **backend** ready — `src/lib/attendance-sites.ts` (create/update/activate site, issue/reissue/revoke QR, list/get/active-QR/history reads) + atomic `issue_attendance_qr` function (migration `202606170002_issue_attendance_qr_fn.sql`, one-active-token-per-site + reissue audit chain). **Build-surface decision (user-confirmed 2026-06-17): the owner-only site/QR admin UI is built in the WEB DASHBOARD later — the app is finished first.** Helpers are caller-agnostic; owner-only enforcement is deferred to those future web-dashboard server actions. For app testing meanwhile, a **dev-only `GET /api/dev/attendance/temp-qr`** (local-dev gated, like seed-login) provisions a temp site + active QR and renders a **scannable QR** (added the `qrcode` dependency). Wi-Fi stays modeled but inactive (`준비중`). **Pending migrations:** `202606170001` + `202606170002`. **Step 1 (schema + permission foundation) 2026-06-17** — migration `202606170001_attendance_payroll.sql` adds all **11 session-first tables** (`attendance_sites`, `attendance_qr_tokens`, `attendance_sessions`, `attendance_breaks`, `attendance_attempt_logs`, `attendance_correction_requests`, `attendance_session_audits`, `employment_type_history`, `hourly_rate_history`, `attendance_month_snapshots`, `attendance_export_logs`) plus the `memberships.attendance_payroll_admin` flag and the `can_manage_attendance_payroll(org)` helper. DB guarantees now enforced: one `open` session per user, one active QR token per site, correction photos ≤ 5, status/method/reason CHECKs, default site radius 100m, Wi-Fi SSIDs modeled (PWA-inactive). **Read-only RLS only** — all writes go through service-role server actions in later steps. TS types (`src/types/database.ts`) + shared `src/lib/attendance.ts` (row aliases, status/method/reason unions, constants) added. The earlier `attendance_events`/`employment_profiles` draft is superseded (data-model `04` updated). The attendance **UI design slice** (Home + Capture + Correction) already exists from 2026-06-17 and is unchanged. **Pending migration to apply:** `202606170001_attendance_payroll.sql`. Remaining: Step 2+ clock-in/out + break + correction actions, history/review queries, then payroll/finalization/dashboard/export/notifications. Earlier planning/design refined on **2026-06-17**: attendance is a **session-based** system with site-bound GPS proof, fixed on-site QR for the first PWA release, correction / exception requests, audit history, per-person monthly finalization, and hourly-worker **gross-pay** calculation only. `GPS + Wi-Fi` remains in the long-term design but is **inactive in current PWA UI** and should appear as `준비중`; current active method is **GPS + QR**. Salaried staff use the module for attendance records only. Hourly pay rules are now defined enough for implementation: 1-minute units, recorded breaks only, no automatic break deduction, no OT/holiday/night premiums, final monthly gross rounded to nearest 10 yen, Tokyo month = `1st` through `last day`. Taxes / deductions and salaried payroll remain outside StayOps. Remaining open delivery items are the final Excel export template and any future non-PWA Wi-Fi activation path. Product `21`, tech-design `11`.

**Cleaning Log (청소 기록표) — implemented 2026-06-15.** A date-grouped cleaning record sheet at `/mobile/cleaning/records` (entered from a "내 청소 기록" link on the cleaning home). Horizontal text rows grouped by date (no horizontal scroll): status dot · start–end time · building·room · cleaning-type chip · duration, with a month header (count + total duration), status filter chips, and month navigation. Reuses `getOrgCleaningSessionsFiltered` + the active-room catalog — **no schema/RLS/migration change** (`cleaning_sessions` RLS already scopes own-vs-manager). Permissions: `staff`/`part_time_staff` see own only; `field_manager`/`cs_staff`/`office_admin`/`owner` (`canViewOthersCleaning`) can view others via a staff filter in the app; admin web `/admin/cleaning` already lists all + CSV/Excel export. Files: `src/app/mobile/cleaning/records/page.tsx`, `src/components/cleaning/cleaning-records-view.tsx`, `canViewOthersCleaning` in `src/config/roles.ts`; i18n `cleaning.records.*` (ko/ja/en). See Product `07` "2026-06-15 Cleaning Log".

**Mobile home redesign (Haru Ops home) — implemented 2026-06-17; attendance hero wired to real state 2026-06-22.** The `/mobile` home screen was fully re-skinned to the "Haru Ops · 홈 (빠른 출근)" / v2 design while preserving **all** existing functionality (greeting, last-updated clock, important announcement, today check-in/out counts, active cleaning task, quick actions, today's activity timeline). New top-of-home elements: a **greeting header** (Tokyo date + name + avatar initial) and a quick attendance hero with GPS+QR / Wi-Fi 준비중 chips that opens `/mobile/attendance`. **As of 2026-06-22, the hero is no longer static**: it reads the current open attendance session and reflects **출근 전 / 근무 중 / 휴게 중** in real time, including the live elapsed timer and the current clock-in site/time summary. The quick-action grid keeps the existing four actions (청소 / 정비 / 분실물 / 주문) — **clock-in is intentionally not duplicated there** since it lives in the hero. **2026-06-17 follow-up:** the 오늘 현황 check-in / check-out count cards are now **tappable** and open a drag-to-dismiss bottom sheet listing that day's reservations (guest · localized building·room · channel) — `getHomeCheckInOutReservations` (`src/lib/home.ts`) + `src/components/mobile/home-checkinout.tsx`; new i18n `mobile.homeCheckInEmpty` / `homeCheckOutEmpty` / `homeGuestUnknown` (ko/ja/en). No schema change (reservations read only). The design's top **3D hero image** (wireframe orb) is **not used** for now but the asset is preserved at `src/assets/home-hero-3d.svg` (not deleted) for future reuse; the previous Lottie hero (`HomeHeroAnimation`) is no longer rendered but kept in the repo. Files: `src/app/mobile/page.tsx` (re-skinned, same server data fetching), scoped styles `src/components/mobile/home-screen.css` (`.hm`-prefixed), new i18n `mobile.homeGreeting` + `mobile.homeClock*` (ko/ja/en). No schema/RLS/migration change. `npm run lint` + `npm run build` pass. See Product `16` → Home (Haru Ops home redesign, 2026-06-17).

**Attendance capture bottom-sheet drag fix — implemented 2026-06-22.** The clock-in/out result sheet in `src/components/attendance/attendance-capture.tsx` now uses the shared `BottomSheet` instead of a hand-rolled drag layer. This aligns it with the canonical mobile sheet contract (body scroll lock + isolated handle drag), fixing the real-device bug where dragging down from the sheet header could scroll the underlying screen instead of moving only the result sheet. No change to attendance business logic or result states; dismissal behavior only. `npm run lint` + `npm run build` pass.

**BottomSheet mobile scroll-lock hardening — implemented 2026-06-22.** The shared `BottomSheet` now applies a stronger real-device scroll lock while open: `body` is fixed in place (preserving the previous scroll position), `html/body` overflow is hidden, document overscroll is disabled, and the drag handle touch events call `preventDefault()` in addition to `stopPropagation()`. This fixes the remaining iPhone/real-device issue where dragging a sheet handle could still move the background page even though the sheet itself was draggable. Shared component only; no product-flow change. `npm run lint` + `npm run build` pass.

**Bottom sheet unification — implemented 2026-06-17.** Introduced one canonical **`BottomSheet`** component (`src/components/shell/bottom-sheet.tsx`) encapsulating the whole sheet shell (portal to `<body>`, slate `bg-slate-950/45` scrim that fades transparent on drag, `bg-surface` `rounded-t-[24px]` `max-w-[460px]` surface, 38px `bg-slate-200` handle, drag-to-dismiss via `useSheetDragDismiss` + scrim-tap + Esc, body-scroll lock, no X). Mount-driven with a render-prop (`{ close, dragHandleProps }`) / `useBottomSheetClose` for programmatic close and `useBottomSheetDragHandle` for extra drag zones. Migrated onto it: home check-in/out, report sheet, share picker, cleaning record detail + filter picker, project create, project members. The remaining bottom sheets were **normalized to the canonical values** (slate scrim + 24px radius + slate-200 handle): the 6 suggestions sheets (via `suggestions.css`), context picker, bottom-bar editor (`mobile-shell`), Tasks day/long-press sheets, projects-board create, project members, cleaning record detail, and the calendar reservation sheet — several previously used a warm `rgba(20,16,10,0.5)` / `rgba(13,24,23,0.46)` scrim. Intentional exceptions: the Liquid-Glass order "처리" sheet (`order-action-bar`), the photo lightbox, fixed action bars, and small dropdown menus. Standard is now mandated in CLAUDE.md (mobile shell contract) + Product `16` ("Bottom Sheet — Canonical Visual Standard"). **Full sweep (2026-06-17):** the former center-aligned confirm / delete / action / picker dialogs were ALL converted to bottom sheets too (so every bottom-anchored popup slides up + dims-on-drag like the home sheet) — maintenance/lost-found/order confirms, generic + task + project + filter delete confirms, announcement popup/delete/read-status, linen success + detail-delete, cleaning completion/cancel/targets/linked-confirm, the date-range + order-delivery calendars, and the requests filter sheet. A final grep verified zero bottom overlays lack the drag effect. `npm run lint` + `npm run build` pass.

**Reservation data-loss logic fixes — implemented 2026-06-18.** Compared our reservation→room mapping against the in-house reference system (which never loses data) and fixed the code paths that could silently drop bookings from the calendar / home check-in-out sheet. (1) **null minStay rooms stay visible**: `classifyBeds24Room(null)` now → **active** (was inactive) and `getActiveRoomCatalog` includes null-minStay beds24 rooms + counts any room row as classified — webhook-synced rooms (which never carry minimumStay) are no longer hidden until a separate inventory sync runs; only an explicit `>= 50` excludes. (2) **No-drop + fallback**: the calendar (`src/app/mobile/calendar/page.tsx`) and home sheet (`src/lib/home.ts`) no longer discard reservations whose room is not in the active catalog — they fall back to the normalized room label, and the calendar **adds orphan rooms to the room axis** so the bar renders. (3) **Fetch completeness verified (no change)**: reconcile/backfill + all surface queries filter by **stay dates** (`arrivalTo`/`departureFrom`, check-in/out overlap), so a booking made any time ago that checks in this/next month is captured; only the 2-month display window constrains stay dates, never the booking date. Files: `room-sync.ts`, `rooms.ts`, `home.ts`, `calendar/page.tsx`; docs `15-reservation-calendar` (2026-06-18 sections), `01-beds24-integration`, `06-property-room-model`. `npm run lint` (0 errors) + `npm run build` pass. **Infra still pending (separate task): live Beds24 webhook delivery — `beds24_webhook_events` shows 0 webhook events; reconcile last ran 2026-06-10, so data is currently frozen regardless of these logic fixes.**

Doc reconciliation status (2026-06-10): linen feature planning now reflects the refined mobile-first return-ledger direction across product/planning/engineering docs, including `02-feature-map`, `19-linen-defect-workflow`, `08-linen-defect-technical-design`, `04-data-model`, `05-rls-permissions`, `06-implementation-plan`, and `16-mobile-navigation`. Next recommended step is design, not coding.

## Completed

### Planning and Documentation

- Project brief exists.
- Decision log exists.
- Project workflow exists.
- MVP priority document exists.
- Product module documents exist.
- Engineering architecture and implementation plan exist.
- AI collaboration rules exist.

### Design Foundation

- v1 design direction is effectively complete.
- Core Stitch screen list and handoff documents exist.
- Liquid Glass readability direction is confirmed.
- Brand wordmark renders as `Stay Ops` in a serif italic typeface (Noto Serif, weight 600) via the shared `.wordmark` class, applied consistently across the mobile shell header/side menu, admin shell, dev entry, and login/onboarding headers. The mobile top chrome is flat/borderless (no capsule outline, ring, glass, or shadow): a `justify-between` row with a 20px `#1c2b2a` wordmark centered between two 38px `#eef1f2` circular buttons (icon `#3a4a49`) — 3-line menu SVG (shorter middle line) left, person SVG right (2026-06-08).
- Mobile bottom navigation switched to a **center-action ("추가") FAB** design (`.tabbar` in `src/app/globals.css`): four tabs (Home, Calendar / Requests, Announcements) split 2 / 2 around a raised teal `#0e7c72` 50px FAB. **Cleaning moved out of the bottom bar into the side menu (hamburger).** The four side tabs are **per-user customizable** (all 4 slots): the FAB ("편집", pencil icon) opens a bottom-bar editor sheet (`createOpen` state) — a 2-column colour-category tile grid of the selectable feature pool (`customizableBottomNavItems`) where the user toggles up to 4 tabs (counter `n/4`, "full" hint, ≥1 required, unified `oklch` palette, hidden-scrollbar scroll on overflow). Selection persists to `profiles.bottom_nav_tabs` via the `updateBottomNavTabs` server action when the sheet closes; the bar renders `resolveBottomNavItems(session.user.bottomNavTabs)`. Requires migration `supabase/migrations/202606080001_profile_bottom_nav.sql` (2026-06-08).
- Mobile Requests list (`requests-filter-view.tsx`) redesigned: filter row is now `[필터 버튼] · [내 요청 토글] · [총 N건 카운트]`. The "내 요청" scope is a dedicated `role="switch"` toggle (removed from the filter sheet); the top count ("총 N건") tallies only active/open-status records for the current tab + scope (drops as work is completed); and visible records are grouped into Today / Yesterday / Earlier by Tokyo operating date. New i18n: `mobile.groupToday/groupYesterday/groupEarlier/requestOpenCount` (2026-06-08).
- **Order delivery calendar — implemented (2026-06-15).** A delivery calendar for 비품주문 (order requests) is live in the mobile Requests area, opened from a **calendar icon shown only on the 비품주문 (order) tab** (next to the scope toggle; **not** on 수리요청/분실물 tabs), as a **large popup month calendar** (`src/components/requests/order-delivery-calendar.tsx`) derived from `order_requests.delivery_date` (auto-shown when an admin sets it, auto-updated on edit; respects 전체/내 요청 scope; **no schema change**). The scope toggle label is tab-dependent (분실물 "내 등록" / 수리·비품주문 "내 요청", `filterScopeMineRequest`). Delivery date is editable from the order detail by office roles via a new "배송일 수정" action (`updateOrderDeliveryDate` server action; status stays `ordered`), which **notifies the requester** of the change (`createOrderDeliveryUpdatedNotification` — reuses the `order_processed` notification type with a `kind: "delivery_updated"` payload, **no enum migration**; self-suppressed when editor = requester). Deliberately **not** added to the reservation calendar (room-axis mismatch). **Admin web** delivery calendar is **deferred until the mobile app is complete** (the web edit path already works via the shared action bar). New i18n `mobile.deliveryCalendar.*`, `mobile.notifications.orderDeliveryUpdated*`, + order-detail edit labels (ko/ja/en). `npm run lint` + `npm run build` pass. Spec: Product `10` → "Delivery Calendar (Implemented — 2026-06-15)", `14`, `16`, `15`.

### App Foundation

- Next.js App Router project is scaffolded.
- TypeScript is configured.
- Tailwind CSS v4 is configured.
- Base UI components exist:
  - `Button`
  - `Card`
  - `Badge`
  - `Input`
  - `Separator`
- PWA manifest exists.
- Admin shell exists.
- Mobile shell exists.
- Development entry page exists.

### i18n Foundation

- Supported languages are confirmed:
  - Korean: `ko`
  - Japanese: `ja`
  - English: `en`
- `src/lib/i18n.ts` contains the initial localization dictionary.
- Korean is the default fallback locale.
- Authenticated UI reads `profiles.preferred_language`.
- Current visible shell/login/onboarding/navigation/role strings are dictionary-backed.

### Supabase Foundation

- Supabase project exists:
  - Project name: StayOps
  - Region: Tokyo
  - Project ref: `sspdgzkytkpmquqsfaup`
- `.env.local` exists locally.
- Supabase anon and service role keys are configured locally.
- Supabase client helpers exist:
  - `src/lib/supabase/browser.ts`
  - `src/lib/supabase/server.ts`
  - `src/lib/supabase/service.ts`
- Initial database migration has been applied remotely.
- API grant migration has been applied remotely.
- Announcement migration has been applied remotely.
- Core foundation tables exist:
  - `organizations`
  - `profiles`
  - `memberships`
  - `invite_codes`
- `platform_admins`
- `audit_logs`
- Announcement table exists:
  - `announcements`

### Auth and Onboarding

- **Email magic-link (`signInWithEmail`) removed from `src/app/auth/actions.ts` (2026-06-18 backend pass).** Replaced by `signInWithEmailPassword` (email+password login), `signUpWithEmail` (signup with verification), `requestPasswordReset` (reset email), and `updatePassword` (new password after reset link). Password policy enforced server-side: min 8 chars, letter + number required. Duplicate-account detection: if `signUp` returns an empty `identities` array (email already registered), the user is redirected to login instead of creating a duplicate account. Error codes are normalized (`invalid_credentials`, `email_already_exists`, `weak_password`, `email_not_confirmed`, `password_mismatch`, `same_password`, etc.) and mapped to localized strings in i18n.
- **Language cookie persistence added (2026-06-18).** `setLocaleCookie(locale)` server action sets `stayops_locale` cookie (90-day, path `/`, not HttpOnly so future client reads are possible). `LanguageSheet` calls this before navigating to `?lang=…` so the selection survives redirects through the full auth/onboarding flow. `LoginPage` reads the cookie as fallback when no `?lang=` param is present.
- **`EmailLoginForm` wired to `signInWithEmailPassword` (2026-06-18).** The form now submits to the real server action (hidden `next`/`lang` inputs, `useFormStatus` spinner on submit). The old `onSubmit preventDefault` stub is removed.
- **`/auth/login` entry-screen redesign — design pass started 2026-06-18 (from the "Auth Entry & Sign-in" handoff).** The login page now renders the new mobile **auth entry** screen: empty brand logo slot (a real logo is dropped in later — this is a deliberate reserved space), serif-italic `Stay Ops` wordmark, product subtitle, a `직원 전용 · 보안 로그인` trust chip, then **two equal CTAs** — `Google로 계속하기` (wired to `signInWithGoogle`) and `이메일로 계속하기` — over an `또는` divider, an `이메일로 가입` link, the team-invite-code note, and `이용약관 · 개인정보 · 도움말` legal links. Colors reuse the existing ivory/navy design tokens (the handoff was built on them, so it matches 1:1). **Design-first / backend-later:** the email CTA + signup link point at placeholder `?view=email` routes (the email login/signup/reset screens are the next design pages), and dev seed-login is kept as a clearly-marked dev-only block so local sign-in still works. New i18n group `auth.entry.*` (ko/ja/en) + `auth.productSubtitle` (en) updated.
- **Language-select bottom sheet — implemented 2026-06-18 (2nd design page).** The right-aligned language **pill** now opens a real **language picker bottom sheet** (`src/app/auth/login/language-sheet.tsx`, a client component) built on the **canonical `BottomSheet`** (`src/components/shell/bottom-sheet.tsx`) — drag-to-dismiss, scrim tap, Esc, body-scroll-lock, portal to `<body>`. It lists 한국어 / 日本語 / English (native name + romanization + flag glyph), highlights the active locale (primary-soft row + check), and selecting one navigates to `/auth/login?lang=…` (preserving `next` + `view`). **User-requested modification honored:** the scrim darkens the **whole screen including the top bar / language pill** — satisfied for free because the canonical sheet's scrim is a full-viewport `fixed inset-0 bg-slate-950/45` (the handoff mockup only dimmed the body area). The bilingual sheet title `언어 선택 · Language` and the native language names are intentional language-agnostic constants. `npm run lint` + `npm run build` pass.
- **Google in-place loading state — implemented 2026-06-18 (3rd design page, "Google 진행 중").** The Google CTA is now a client submit button (`src/app/auth/login/google-button.tsx`) inside the `signInWithGoogle` form. On submit the page does **not** navigate: `useFormStatus().pending` flips, the label goes `text-transparent` + `pointer-events-none`, and a navy (`border-primary`) `animate-spin` ring spins in place while the colored Google glyph stays — exactly the handoff busy frame. The email CTA is unaffected (it's a `Link`). `npm run lint` + `npm run build` pass.
- **Navigation pattern decision (2026-06-18): no back buttons — swipe-back everywhere.** The product adopts **edge-swipe / OS back** as the single shared back-navigation pattern; individual screens do **not** render their own back-chevron or `돌아가기` link. (Applied first to the email auth screen below; to be honored on every new screen.)
- **Email login screen — implemented 2026-06-18 (4th design page, "이메일 로그인").** `/auth/login?view=email` now renders the email login frame: **no back buttons** (per the swipe-back decision above — returns to entry via OS/edge-swipe back), `다시 오신 것을 환영합니다` title + subtitle, a `로그인 / 가입` segmented control (login active; 가입 → `?view=email&mode=signup`, the next page), the email + password fields, and an `또는` divider over a compact Google CTA. The fields live in a client component (`src/app/auth/login/email-login-form.tsx`) with the **password show/hide eye toggle** + focus rings; the `잊으셨나요?` link points at the reset frame (`?mode=reset`, later). `GoogleSubmitButton` gained a `compact` (52px) variant. New i18n group `auth.email.*` (ko/ja/en). **Backend wired (2026-06-18):** `EmailLoginForm` now submits to `signInWithEmailPassword`; `next`/`lang` are passed as hidden fields; spinner shown on submit. `npm run lint` + `npm run build` pass.
- **Email signup screen — implemented 2026-06-18 (5th design page, "이메일 가입").** `/auth/login?view=email&mode=signup` now renders the email signup frame: same header (no back button), two-line `업무 계정\n만들기` title + subtitle, the `로그인 / 가입` segmented control (가입 active; 로그인 → `?view=email`), and a client form (`src/app/auth/login/email-signup-form.tsx`) submitting to `signUpWithEmail`. The form has **real-time email validation** (idle / good = green border + check icon / bad = red border), a **4-segment password strength meter** (amber → green by length + letter/number mix), the password show/hide eye toggle, the `passwordPolicy` hint, a `계속하기` CTA that stays dimmed (opacity 42%, no shadow) until a valid email + a password are entered, and the terms/privacy consent line. New i18n keys `auth.email.signupTitle/termsConMid/termsConPost` + reworded `signupSubtitle/signupCta` (ko/ja/en). `npm run lint` passes; `npm run build` is currently blocked by an **unrelated** type error in the concurrently-developed `src/lib/auth-invite.ts` (the `invite_codes` table isn't in the generated `database.ts` types yet — backend invite work, not this design pass).
- **Email login/signup title line-break fix + CJK body font (2026-06-18).** Per design feedback the email `welcomeTitle` (and `signupTitle`) now break into two lines via `\n` + `whitespace-pre-line`, matching the handoff. Root-caused a Korean weight mismatch: Geist (Latin-only) was loaded for the body, so Hangul/Kana fell back to a system font with no true 900/black weight. **Fix:** added `Noto_Sans_KR` and `Noto_Sans_JP` (weights 400/500/700/800/900, `preload:false`) via `next/font` in `src/app/layout.tsx`, and extended the `body` font stack in `globals.css` to `Geist → Noto Sans KR → Noto Sans JP`, with a `:lang(ja)` override preferring Noto JP so kanji use JP (not KR) glyph variants. **App-wide change** (user-approved): all Korean/Japanese text now renders in Noto Sans with the design's intended weight.
- **Password reset screen — implemented 2026-06-18 (6th design page, "비밀번호 재설정").** `/auth/login?view=email&mode=reset` (the email login screen's `잊으셨나요?` link target) now renders the reset frame: same header (no back button), two-line `비밀번호\n재설정` title + `가입한 이메일로 재설정 링크를 보내드립니다.` subtitle, then a single email field with a privacy-safe hint (`이 주소로 가입된 계정이 있으면 메일을 보냅니다.` — deliberately does **not** confirm whether the account exists) and the `재설정 링크 보내기` CTA. Fields live in a client component (`src/app/auth/login/email-reset-form.tsx`) submitting to `requestPasswordReset` with hidden `next`/`lang` + a `useFormStatus` spinner. New i18n keys `auth.email.resetHint` + two-line `resetTitle` + reworded `resetSubtitle` (ko/ja/en). **Note:** `requestPasswordReset` currently redirects to `?view=reset` on error/sent, whereas the design link uses `?view=email&mode=reset`; align these when wiring the backend (and when the "재설정 메일 전송됨" sent-confirmation screen, the next design page, is built). `npm run lint` passes; `npm run build` remains blocked only by the unrelated `src/lib/auth-invite.ts` type error noted above.
- **Password-reset sent-confirmation screen — implemented 2026-06-18 (7th design page, "재설정 메일 전송됨").** Reached at `/auth/login?view=email&mode=reset&sent=…` (the reset form's `requestPasswordReset` redirects here on success; for the design pass any `sent` value renders it). Centered confirmation card: 72px primary-soft rounded mail icon, `재설정 안내` eyebrow, `메일을 확인하세요` title, the reset-sent body, and — when a `?email=` param is present — a muted email chip echoing the address (omitted otherwise since the design pass has no real value yet; the backend can append `&email=` later). Bottom: a navy `로그인으로 돌아가기` CTA (→ `?view=email`) and a `메일이 오지 않나요? 다시 보내기 · 도움말` footer (resend → the reset form, help → placeholder). `MailIcon` in `src/app/auth/login/page.tsx` gained `large`(34px)/`small`(15px) size variants. New i18n keys `auth.email.resetSentEyebrow/resetSentBackToLogin/resetSentNoMail/resetSentResend/resetSentHelp` + handoff-aligned `resetSentTitle`/`resetSentBody` (ko/ja/en). `npm run lint` passes; `npm run build` remains blocked only by the unrelated `src/lib/auth-invite.ts` type error.
- **Post-auth gating — "온보딩 계속하기" screen — implemented 2026-06-18 (Band 3, 8th design page, "continueOnboarding").** **Design-first preview** rendered at `/auth/login?view=onboarding` (user-approved placement: built as a `/auth/login` design preview for now rather than touching the live `/onboarding` page; to be moved onto the real post-auth gating flow when the backend is wired). In production an authenticated-but-not-ready user is already redirected to `/onboarding` before reaching this branch, so it only renders in the design pass. Layout: 72px primary-soft user icon, `한 단계 남았어요` eyebrow, two-line `프로필을 완성하면\n시작할 수 있어요` title, subtitle, then a **3-step progress card** — (1) `계정 인증` done (green check circle + trailing check; sub = `?email=` if present, else `인증 완료`), (2) `기본 정보` current (navy "2" circle + chevron, `이름 · 생년월일 · 전화 · 언어`), (3) `팀 초대코드` upcoming (muted "3" circle, faint title) — an `이어서 진행하기` CTA, and a `나중에 할게요 · 로그아웃` footer. New i18n group `auth.gating.*` (ko/ja/en). Added `UserIcon`/`CheckIcon`/`ChevronRightIcon` to `src/app/auth/login/page.tsx`. Also fixed a duplicate `auth.email.resetSentTitle` key in the `ja` dictionary (left over from the reset-sent edit). `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass (the earlier `auth-invite.ts` build blocker is resolved now that the backend filled in the `invite_codes` types in `database.ts`).
- **Post-auth gating — "조직·역할 미리보기" screen — implemented 2026-06-18 (Band 3, 9th design page, "invitePreview").** **Design-first preview** at `/auth/login?view=invite` (same approved placement rationale as the onboarding gate). Layout: `팀 참여` title + subtitle, a read-only **confirmed invite-code field** (green border + check, mono font), an **org/role card** — navy gradient header with org logo badge, org name + meta, a `확인됨` verified chip (shield), over a `bg-surface` body showing the `참여 역할` (role name + English role chip) and a `유효기간 · 참여 현황` row (mono usage count) — an **info "최종 확인" banner**, and the `이 팀으로 참여하기` CTA. The org name / role / validity / usage values are clearly-marked **demo placeholders** (a `demo` object in the branch) that the real invite-code lookup replaces when wired; all UI chrome goes through the new `auth.gating.invite*`/`org*`/`role*`/`terms*`/`confirm*` keys (ko/ja/en), with `confirmBody` using a `{role}` token. Added `InfoIcon` to `src/app/auth/login/page.tsx`. This completes Band 3. `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.
- **Blocked / suspended states — implemented 2026-06-18 (Band 4, 3 screens: "멤버십 정지 / 팀 접근 해제 / 계정 비활성").** **Design-first preview** at `/auth/login?view=blocked&state=suspended|removed|disabled` (a single branch keyed by a `configs` map). Shared centered `scard` layout — 72px tinted rounded icon, eyebrow, two-line title (where the handoff wrapped), body, optional email chip — over two stacked CTAs (navy primary + ghost-outline secondary). Per-state config: **suspended** (amber lock icon, `관리자에게 문의` + `로그아웃`, shows email), **removed** (neutral user-x icon, `다른 코드로 참여` + `로그아웃`, no email), **disabled** (red power icon, `지원팀에 문의` + `다른 계정으로 로그인`, shows email). The email falls back to a demo placeholder when no `?email=` is supplied. New i18n group `auth.blocked.*` (ko/ja/en); added `LockIcon`/`UserXIcon`/`PowerIcon` to `src/app/auth/login/page.tsx`. This completes Band 4. `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.
- **Error states — implemented 2026-06-18 (Band 5, 6 screens). This completes the full "Auth Entry & Sign-in" handoff.** **Design-first preview** at `/auth/login?view=error&mode=wrong_pw|email_exists|collision|rate_limit|network|google` (single branch, a local `shell()` helper wrapping the common header + section). A reusable `Banner` component (`danger`/`warn`/`info` variants, pulled into module scope) backs the inline alerts. The six frames: (1) **wrong_pw** — login title, danger banner with an inline `비밀번호 재설정` link, red-bordered password field + `5회 중 2회 시도했습니다` field error; (2) **email_exists** — signup title, info banner with a `로그인` link, login/signup segment, red-bordered email field + `이미 사용 중인 이메일입니다` error, dimmed `계속하기`; (3) **collision** — centered card, primary link icon, two-line title, email chip, navy `Google 계정 연결` (with Google glyph) + ghost `비밀번호로 로그인`; (4) **rate_limit** — login title, warn banner with a mono countdown chip (`04:32 후 재시도 가능`), disabled fields, dimmed CTA, `급하신가요? 비밀번호 재설정 · 도움말` footer; (5) **network** — centered card, neutral wifi icon, two-line title, `다시 시도` CTA with arrow; (6) **google** — entry hero + danger banner over the Google/email CTAs (reuses the wired `signInWithGoogle` form). The password show/hide toggle is intentionally **non-interactive** in this preview (these are static error-state mocks). New i18n group `auth.errs.*` (ko/ja/en); added `WarnIcon`/`ClockIcon`/`WifiIcon`/`LinkIcon`/`ArrowRightIcon`/`GoogleGlyph` + the `Banner` helper to `src/app/auth/login/page.tsx`. `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass.
- **Onboarding redesign — Profile Setup wizard, screen 1/12 (intro) — started 2026-06-19 (from the "Profile Setup (Onboarding)" handoff in "Haru Ops (2)").** The single-page glass onboarding form is being replaced screen-by-screen with a **multi-step wizard** (one question per screen, progress bar, sticky footer CTA, wheel date picker, segmented invite-code boxes, review + success). First screen implemented: the **intro** (`src/app/onboarding/onboarding-wizard.tsx`, a client component) — ivory full-screen shell, empty logo slot (brand logo added later, consistent with the auth screens), two-line `시작하기 전에\n프로필을 설정할게요` title + subtitle, a 3-row checklist card (기본 정보 / 사용 언어 / 팀 초대코드 with icons), and a sticky `프로필 설정 시작 →` CTA. **Transitional:** the `/onboarding` `needs_profile` branch now renders the wizard; pressing the CTA reveals the existing `ProfileForm` (unchanged) so the flow stays fully functional (name/birth-date/phone/language/invite still submit via `completeProfile`) while the remaining 11 screens are redesigned one at a time. New i18n group `onboarding.intro.*` (ko/ja/en). Also fixed two build blockers from concurrent backend work: a missing `signOut` import in `src/app/auth/login/page.tsx` (blocked-screen logout button) and an unreachable `suspended` branch in the onboarding `currentStepTitle`. `npm run lint` + `npm run build` pass.
- **Onboarding redesign — screen 2/12 (name step) — 2026-06-19.** The wizard (`src/app/onboarding/onboarding-wizard.tsx`) is now a step state machine: `0 intro → 1 name → 2+ (existing ProfileForm bridge)`. **Step 1 (name):** progress header `1 / 5` (navy bar at 20 %, no back chevron), `기본 정보` eyebrow, two-line `이름을\n알려주세요` title + subtitle, a name field with **real-time validation** (green border + check when non-empty), a trilingual example hint, and a sticky `계속 →` CTA that's dimmed until valid. **Back navigation** uses `history.pushState`/`popstate` so OS / edge-swipe back moves to the previous step with no in-screen button (matches the swipe-back decision). The entered name is **carried forward** into the bridged `ProfileForm` via a new optional `defaultName` prop, so onboarding still completes end-to-end. New i18n group `onboarding.steps.*` (ko/ja/en) — all wizard copy is i18n-driven (no hardcoded strings; the name hint is intentionally a trilingual example, still per-locale). `npm run lint` + `npm run build` pass.
- **Onboarding redesign — screen 3/12 (date of birth + wheel picker) — 2026-06-19.** Wizard steps now `0 intro → 1 name → 2 dob → 3+ (ProfileForm bridge)`. **Step 2 (dob):** progress `2 / 5`, `기본 정보` eyebrow, two-line `생년월일을\n입력하세요` title + privacy subtitle, a 년/월/일 segmented display (year cell wider; `YYYY`/`MM`/`DD` placeholders when unset) that opens an **iOS-style wheel-picker bottom sheet** — year (1940…current) / month / day scroll-snap wheels with a centered primary-soft selection band, top/bottom fade mask, automatic day clamping when the month/year range shrinks, and a `확인` confirm button. The sheet uses the **canonical `BottomSheet`** (per the bottom-sheet contract — slate scrim, 38px handle, drag/scrim-tap/Esc close, body portal). The picked date is committed as `YYYY-MM-DD` and **carried forward** into the bridged `ProfileForm` via a new optional `defaultBirthDate` prop, so onboarding still completes end-to-end. New i18n keys `onboarding.steps.dob*` (ko/ja/en) — all copy i18n-driven (the YYYY/MM/DD placeholders are format tokens, still per-locale keys). `npm run lint` + `npm run build` pass; wheel data + confirm→cell→CTA-enable flow verified in the running app.
- **Onboarding redesign — screen 4/12 (phone number) — 2026-06-19.** Wizard steps now `0 intro → 1 name → 2 dob → 3 phone → 4+ (ProfileForm bridge)`. **Step 3 (phone):** progress `3 / 5`, two-line `전화번호를\n입력하세요` title + subtitle, a **country-code selector** (flag + dial code) that opens a canonical `BottomSheet` with a curated, i18n-named country list (Japan/Korea/China/Taiwan/Vietnam/Philippines/Thailand/US/UK), and a number input. **Phone is stored as E.164** (`dial code + national number`) for future call-dialing: the national trunk **leading `0` is stripped** (`replace(/^0+/, "")`) so e.g. 🇯🇵 + `090 1234 5678` → `+819012345678`. A hint instructs users to omit the leading 0 (`국가번호를 선택하고, 맨 앞 0을 뺀 번호를 입력하세요…`), and the strip is also applied defensively in case they include it. The E.164 value is **carried forward** into the bridged `ProfileForm` via a new optional `defaultPhone` prop. New i18n keys `onboarding.steps.phone*` + the `onboarding.countries` name map (ko/ja/en) — no hardcoded strings. `npm run lint` + `npm run build` pass; render + leading-0 handling + country switch (→ +82) verified in the running app. (Flag emojis render as letters on Windows Chrome but are correct in the DOM / on mobile.)
- **Onboarding redesign — team-join flow (Band 2, screens 5–8 of 12) — 2026-06-19.** Decisions (user-approved): the **language step is skipped** (already chosen at login + in the form), so `TOTAL_STEPS` is now **4** (name → dob → phone → invite); the **invite step is skippable** (code-less path for platform admins / join-later). Wizard steps now `0 intro → 1 name → 2 dob → 3 phone → 4 invite entry → 5 org/role confirm` (the old `ProfileForm` bridge is kept only as an unreachable `step >= 6` fallback). **Step 4 (invite entry):** progress `4 / 4`, `팀 참여` eyebrow, two-line `팀 초대코드를\n입력하세요` title, a centered mono code input (single field — real codes vary in length, so the handoff's fixed 6-box segmented design doesn't fit), a `팀 확인` verify CTA with a `확인 중` busy state, an invalid-code danger banner (resolved via `onboarding.errors.*`), and a `코드 없이 나중에 입력` skip. **Step 5 (org/role confirm):** navy-gradient org card (org name + `확인됨` shield chip) over the localized role, and a `이 팀으로 참여하기` CTA. Wired to the real backend — `previewInviteCode` (validate + org/role preview) on verify, `completeProfile` (hidden fields carried from wizard state: name/birthDate/phone-E164/preferredLanguage=locale/inviteCode) on join or skip. New i18n group `onboarding.joinFlow.*` (ko/ja/en; renamed from `join` to avoid colliding with the existing `onboarding.join` string) — no hardcoded strings. `npm run lint` + `npm run build` pass; verified all three verify paths in the running app (invalid → banner, verifying → busy, valid `PARTTIME-TEST` → real org "StayOps Internal" / role "아르바이트"). Did NOT submit the join (would mutate the signed-in super-admin's profile + consume an invite). Remaining: Band 3 review + success screens.
- **Onboarding redesign — Band 3 (review · joining · success) + flow complete — 2026-06-19.** Final wizard order: `0 intro → 1 name → 2 dob → 3 phone → 4 invite → 5 org/role confirm → 6 review → 7 success` (old `ProfileForm` bridge is an unreachable `step >= 8` fallback). **Step 6 (review):** a card listing every entered value — 이름/생년월일(`YYYY. MM. DD`)/전화번호(`+dial national`)/언어(read-only, set at login)/소속/역할 — each with a `수정` button that jumps back to the relevant step; an info banner; and a `가입 완료하기` submit with an in-place spinner (the "가입 처리 중" busy state). **Step 7 (success):** green check, `설정 완료` eyebrow, two-line `환영합니다,\n{name}님`, an org/role-aware body, and `업무 시작하기 →`. New server action `submitOnboardingProfile` (`src/app/onboarding/actions.ts`) upserts the profile + optionally joins via invite code and **returns the destination instead of redirecting**, so the wizard can show the success screen before `router.push(dest)`. Org-confirm + invite-skip now route into review (no more direct `completeProfile` form submit from the wizard). New i18n groups `onboarding.review.*` / `onboarding.success.*` (ko/ja/en) — no hardcoded strings. `npm run lint` + `npm run build` pass. Verified the full flow in the running app: name→dob→phone→invite(`PARTTIME-TEST`)→org-confirm→**review** (all values correct: 김현준 / 2000.01.01 / +81 9012345678 / 한국어 / StayOps Internal / 아르바이트) and the **success** screen (previewed via a temporary initial-step override, since real submit would mutate the signed-in super-admin's profile + consume an invite; the override was reverted). **This completes the 12-screen Profile Setup onboarding redesign.**
- **Login debugging pass — fixed: password-reset "set new password" screen was unreachable (2026-06-19).** **Bug:** the reset-email link lands on `/auth/login?view=email&mode=new_password` carrying a Supabase **recovery session**, so the user is *authenticated*. The login page's gating runs first and unconditionally redirects any non-unauthenticated user (`ready → dashboard`, otherwise `→ /onboarding`) — only `view=blocked` was exempt — so the new-password form (a later branch) was never reached, and password reset could never be completed. **Fix (two layers):** added an `isPasswordRecovery = view==="email" && mode==="new_password"` exemption to both gating redirects in `src/app/auth/login/page.tsx`, AND the same exemption to the `middleware.ts` auth-page redirect (which previously exempted only `view=blocked`). **The middleware layer is the real blocker in production** — it redirects authenticated users away from `/auth/login` before the page renders; the page-only fix appeared to work locally only because middleware's `getUser()` did not observe the session in this dev setup (the bounce on plain `/auth/login` came from the page, not middleware). Verified in the running app: while authenticated, `?view=email&mode=new_password` now renders the `새 비밀번호 설정` form instead of bouncing to onboarding; no console errors. Other auth flows checked and OK: action redirects (`signInWithEmailPassword`/`signUpWithEmail`/`requestPasswordReset`/`updatePassword`) match the page's `view`/`mode`/`sent` branches; `resume_existing_account` error key exists in ko/ja/en; reset-sent / verification-sent confirmations are unauthenticated-only (correctly not gated). `npm run lint` + `npm run build` pass.
- **Login review follow-ups — blocked-state CTAs wired + Google identity contract made explicit (2026-06-19).** From the confirmed code review: **(3, fixed)** the blocked-account primary CTAs were dead `href="#"` for `suspended`/`disabled` (only `removed` had a real link). They now open a **prefilled `mailto:`** to `NEXT_PUBLIC_SUPPORT_EMAIL` (new env, added to `.env.example`/`.env`; empty recipient falls back to the user's mail client) with a localized subject + body containing the account email — `src/app/auth/login/page.tsx` (per-state `primaryHref` on the blocked config; new i18n `auth.blocked.contactSubjectSuspended/contactSubjectDisabled/contactBody`, ko/ja/en). **(2, documented + guarded)** "same email = same account" for Google now has an explicit contract comment on `signInWithGoogle` (`src/app/auth/actions.ts`) and a doc section — it relies on Supabase **automatic identity linking** + **email confirmation required** (verified: the owner account carries both `email`+`google` identities). A manual link-identity flow (the "계정 연결" screen) is intentionally **not** wired — Supabase enforces email uniqueness today, so it would be premature; **action item for the user: confirm the Supabase Auth dashboard keeps automatic linking on + email confirmations required.** `npm run lint` + `npm run build` pass. (Blocked screens preview only when logged-out, since logged-in non-blocked users are gated to onboarding; the mailto wiring is build-verified.)
- **Auth backend ready for signup/reset screens (2026-06-18).** `signUpWithEmail`, `requestPasswordReset`, and `updatePassword` server actions are implemented and waiting for their respective design screens. i18n keys for all states added: `auth.email.signupSubtitle/signupCta/confirmPasswordLabel/confirmPasswordPlaceholder/passwordPolicy/verificationSentTitle/verificationSentBody/resetTitle/resetSubtitle/resetCta/resetSentTitle/resetSentBody/newPasswordTitle/newPasswordSubtitle/newPasswordLabel/newPasswordConfirmLabel/updatePasswordCta/passwordUpdatedNote` (ko/ja/en). Error keys added: `missing_password/invalid_credentials/email_already_exists/weak_password/email_not_confirmed/password_mismatch/same_password` (ko/ja/en).
- **Auth + onboarding backend fixes — 2026-06-18.** Six blocking issues resolved: (1) `birth_date` now validated and saved in both `completeProfile` (onboarding) and `updateAccountProfile` (account); users were stuck in `needs_profile` forever without this. (2) Password reset route state aligned end-to-end: `requestPasswordReset` uses `?view=email&mode=reset` + appends `&email=…` on success; callback target uses `?view=email&mode=new_password`; `updatePassword` uses `?view=email&mode=new_password` for errors and redirects to `?view=email&sent=password_updated` on success. (3) New password form `email-new-password-form.tsx` created; `page.tsx` handles `view=email&mode=new_password`, `view=email&mode=signup&sent=verify`, and `sent=password_updated` success banner. (4) `isDevSeedLoginEnabled()` guards removed from all three email auth actions — dev seed login is display-only, not a gate. (5) `setLastUsedOrganization` called after every invite-code join (`completeProfile` + `joinOrganizationWithInviteCode`). (6) Desktop root entry now redirects to `/auth/login` instead of rendering `DevEntry` (`DevEntry` import removed). `npm run lint` + `npm run build` pass.
- **Onboarding flow wired to backend (minimal-wiring) — 2026-06-18.** The real `/onboarding` page (kept in its current layout per the approved minimal-wiring scope — NOT rebuilt into the mobile design previews) is now functional end-to-end: (1) the `needs_profile` profile form gained the required **생년월일 (`birthDate`, `<input type="date">`)** field — without it `completeProfile` could never satisfy the `birth_date` gate, so onboarding looped forever. (2) **Invite-code verify → preview → confirm** flow added via a shared client component (`src/app/onboarding/invite-code-field.tsx`): the user enters a code, taps 확인 → a new read-only `previewInviteCode` server action (`onboarding/actions.ts`) calls `validateInviteCode` and resolves the **target organization name + user-facing role category** (via `roleToInviteCategory`, never the raw DB slug), and the preview card renders before the join button activates. This satisfies the product rule "validation succeeds first, then show resolved org + role before final activation." The profile step's invite field is optional (verified → `completeProfile` joins in one step; skipped → routes to the membership step); the membership step's join button is disabled until a code is verified. Forms extracted to client components `src/app/onboarding/onboarding-forms.tsx` (`ProfileForm` + `JoinForm`). (3) **Pre-auth locale now survives into onboarding**: the page reads the `stayops_locale` cookie as a fallback (mirroring the login page) so the language chosen in the login language sheet carries through the login → callback → onboarding redirect chain even when no `?lang=` param is present. (4) The **dead design-preview branches** `view=onboarding` and `view=invite` were **removed** from `/auth/login` (mock data + `href="#"`), along with their now-unused icons; real gating happens on `/onboarding`. New i18n keys `onboarding.verifyInviteCta/inviteVerifiedBadge/previewOrgLabel/previewRoleLabel/joinTeamCta/changeInviteCode` (ko/ja/en). `npm run lint` + `npm run build` pass. (The `auth.gating.*` preview dictionary keys are left in place — harmless, no longer referenced.)
- **Auth backend follow-up cleanup — 2026-06-18.** Three review items closed: (1) desktop `/auth/login` now uses a **device-aware default next** (`/mobile` for phones/tablets, `/admin` for desktop) so desktop users no longer silently fall through to mobile after email/Google auth; (2) `birth_date` validation is now **shared and consistent** (`isValidBirthDate`) across onboarding save, account edit, and onboarding-state gating, including rejecting future dates; (3) `profiles_phone_number_unique` collisions now surface the explicit `phone_duplicate` error in both onboarding and account profile updates instead of the generic `profile_failed`. This keeps the documented account-level unique phone policy truthful at runtime.
- **Auth/onboarding final flow cleanup — 2026-06-18.** Three more review items closed: (1) the public `/onboarding` flow no longer exposes the old **first-user `developer_super_admin` claim** card/button; platform-admin bootstrap remains an operational path and is no longer part of normal user onboarding. (2) Real blocked users now go through the completed `/auth/login?view=blocked` screens: auth actions, callback, middleware, and onboarding all agree on `suspended` / `removed` / `disabled`. `removed` users can explicitly enter a **rejoin** flow (`/onboarding?rejoin=1`) and join another organization with a new valid invite code; `suspended` remains hard-blocked. (3) retried signup for an **incomplete existing account** now redirects to login with the email prefilled and a dedicated `resume_existing_account` error so the user continues the same onboarding instead of seeing a generic duplicate-email failure.
- `/onboarding` visual redesign completed on 2026-05-21 so the login -> onboarding entry flow feels continuous: the page now uses the same restrained Liquid Glass background depth, premium card surfaces, edge highlights, input rhythm, and CTA hierarchy while keeping the existing profile completion, invite-code join, routing, session, and validation semantics unchanged. Onboarding now also preserves language continuity from login for users without a saved profile language yet, and the profile preferred-language selector defaults to the effective onboarding locale instead of always Korean.
- Supabase auth callback route exists.
- Profile completion works.
- Super Admin organization creation UI exists at `/admin/settings/organization`.
- Super Admin can optionally attach themselves as organization `owner` during organization setup.
- Invite code management UI exists at `/admin/settings/invite-codes`.
- Owner-only attendance site/QR settings UI exists at `/admin/settings/attendance`.
- Invite codes can be created for `staff` and `part_time_staff`.
- Invite codes can be deactivated.
- Invite-code form labels distinguish the display name from the actual code.
- Organization member directory exists at `/admin/users`.
- Organization member role/status update actions exist at `/admin/users`.
- Organization member search/filter controls exist at `/admin/users`.
- Account profile editing exists at `/account`.
- Users can now update their own name, phone number, and preferred language. (Theme preference was removed on 2026-06-08 — see dark-mode removal below; the app is light-mode-only.)
- **Entry-routing policy implemented (2026-06-18):** the root-level "dashboard vs mobile" choice screen is no longer allowed in the product direction. `DevEntry` has been removed from `/`; routing is now:
  - mobile/tablet → `/mobile` (unchanged)
  - desktop/PC → `/auth/login` (then `/admin` once logged in with an admin-capable role)
  The OAuth callback passthrough (`?code=…` / `?error=…`) is preserved.
- Admin announcement management exists at `/admin/announcements`.
- Announcements can be created as draft or published records.
- Announcement status can be changed between draft, published, and archived.
- Announcements can be deleted by allowed users from the admin announcement screen.
- Announcement deletion now requires a confirmation modal in the admin UI.
- Announcement detail reading exists at `/admin/announcements/[id]`.
- Published popup-enabled announcements appear as a dismissible popup on the admin announcement screen.
- Mobile announcement reading exists at `/mobile/announcements`.
- Mobile announcement detail reading exists at `/mobile/announcements/[id]`.
- Published popup-enabled announcements appear as a dismissible popup on the mobile announcement list screen.
- Announcement read confirmation migration has been applied remotely.
- Announcement image attachment migration has been applied remotely.
- Announcement popup dismissal migration exists at `supabase/migrations/202605110001_announcement_popup_dismissals.sql`; the SQL has been applied remotely, and migration history is reconciled.
- Admin and mobile users are marked as read automatically when they open published announcement detail.
- Admin announcement detail shows read/unread summary for the targeted audience.
- Admin announcement detail now opens read and unread user lists from the summary counts.
- Admin announcement creation supports up to 5 image attachments.
- Admin and mobile announcement detail screens display attached images.
- Admin and mobile announcement popups display attached images.
- Admin and mobile announcement popups support a 7-day hide option backed by server-side `announcement_popup_dismissals`, persisting across all devices for the same user.
- Announcement popups now wait for client-side popup hide storage before rendering, preventing visible flash on refresh.
- Announcement popup "do not show for 7 days" is now persisted server-side in `announcement_popup_dismissals` and synced across browsers and devices for the same user.
- Pages pre-filter popup announcements using server-side dismissal records before rendering, so already-dismissed popups never flash on page load from any device.
- Mobile announcement UI was visually aligned to the latest design references on 2026-05-20: refreshed list/detail card hierarchy, typography scale, attachment section style, comment composer row, and centered popup CTA layout (`View details` + `Close`) while preserving existing announcement logic and permissions.
- Mobile announcement popup alignment was corrected from bottom-aligned sheet behavior to a centered modal with dimmed/blurred backdrop, safe max-height scrolling, readable preview content, and full-width CTAs.
- Shared announcement popup CTA routing now resolves per surface: mobile popups link to `/mobile/announcements/[id]`, admin popups link to `/admin/announcements/[id]`. The secondary popup CTA was relabeled to the existing close/dismiss action because it dismisses the popup but does not mark the announcement as read; read tracking remains handled by opening detail pages.
- Admin announcement list/detail UI was visually aligned to the same announcement design system on 2026-05-20: cleaner operational header, scannable create form, table/card hybrid announcement rows with status/target/author/date metadata, thumbnail preview, refined empty state, detail summary cards, content block, attachment section, read status panel, and comments polish.
- Final announcement design polish completed on 2026-05-21 across mobile list/detail, admin list/detail, shared popup, comments, read-status panel, attachment presentation, and empty states. The Figma-alignment refinement tightened section rhythm, card proportions, metadata wrapping, modal hierarchy, attachment framing, and long-content behavior. Follow-up final polish reinforced long-title/body/comment wrapping, mobile card balance, read-status modal scrolling, and cross-surface visual cohesion with the redesigned login screen. A restrained Liquid Glass refinement was then applied mainly to mobile announcement cards, the shared popup, comments, attachments, and selected overlay/card surfaces using subtle translucency, modest blur, edge highlights, and softer shadows; admin announcement surfaces were intentionally kept more solid for operational readability. The centered popup modal now carries the strongest glass treatment in this pass, while mobile list cards received lighter translucency and the metadata separator bug was corrected. Mobile announcement list cards show the non-deleted comment count beside the target indicator. Empty states and long titles/body text/author names/role target lists were reviewed for graceful wrapping. This was visual/read-model polish only; announcement permissions, RLS assumptions, popup dismissal, upload/cleanup, read-tracking behavior, and server action semantics were not changed.
- Browser local storage is kept as a same-session fast path alongside server persistence.
- ~~System theme now follows OS dark mode from the initial render path more reliably.~~ (Obsolete: dark mode removed 2026-06-08; app is light-mode-only.)
- Announcement comments migration has been applied remotely.
- Admin and mobile announcement detail screens now show the shared comment thread and support comment creation for enabled published announcements.
- Admin announcement detail now records the current user as read on open, matching mobile detail behavior.
- Admin and mobile announcement detail screens now let comment authors edit and delete their own comments.
- Comment edit/delete ownership and announcement visibility are verified in server actions before mutation.
- Announcement images are now uploaded directly from the browser to Supabase Storage using the anon key and a Storage RLS INSERT policy; the Server Action receives URLs and validates their structure. The 50MB body size override has been removed from `next.config.ts`.
- Admin announcement creation now shows client-side image previews before upload.
- Selected images are compressed on the client before form submission (max 1600px long edge, quality 0.75 for JPEG/WebP/PNG; GIF is skipped to preserve animation).
- Images can be individually removed from the selection before submission.
- Client-side validation shows i18n error messages for unsupported type, count exceeded, and size exceeded conditions.
- Server-side image validation is retained as a defence-in-depth layer.
- Admin announcement detail access is now verified against the announcement's organization: only active memberships with an admin-web-capable role (owner, office_admin, cs_staff) are allowed; developer_super_admin bypasses the check.
- Announcement status changes and deletion now verify the user's current role in the announcement's organization: owner/office_admin can manage all announcements, and authors can manage their own announcements only while they still have an active non-part-time membership.
- Announcement creation now verifies the current user's membership in the selected organization instead of relying on an arbitrary active membership role.
- Admin announcement list status/delete controls are now only shown for announcements the current user can manage.
- Announcement deletion now removes attached Storage images after the DB row is deleted; cleanup only targets current Supabase project `announcement-images` URLs, and cleanup failures are logged but do not block the success response.
- Announcement draft status and back-to-draft action labels are unified per locale: Korean "임시저장", Japanese "下書き", and English "Draft".
- Admin popup candidates are now filtered by announcement target visibility (target_scope / target_roles) for the current user, matching mobile behavior.
- `announcement_popup_dismissals` update RLS has been hardened: announcement_id, organization_id, and user_id are now immutable via a trigger, and the WITH CHECK repeats the same visibility check used on insert.
- Announcement update and delete RLS policies now require the author to still have an active non-part-time membership in the announcement's organization; bare created_by_user_id match with no membership check has been removed.
- Current first admin account has been created.
- Server-side session loading reads profile, membership, platform admin, and organization summary.
- Admin/mobile routes redirect based on auth and onboarding state.
- Auth/onboarding hardening completed (2026-06-04): open-redirect defense (`sanitizeNextPath` with `//`, `://`, backslash rejection), atomic invite-code join via Supabase RPC (`join_organization_with_invite_code` with `FOR UPDATE` locking and `auth.uid()` self-only enforcement), server-side `preferredLanguage` validation via `isLocale()`
- Admin order detail page added (2026-06-04): dedicated route `/admin/orders/[id]` under `AdminShell` with full order info (title, status, building/room, requester, delivery date, items with images, memo, timeline progress). `OrderActionBar` and `updateOrderRequestStatus` reused from mobile surface. Admin orders list now links to the admin detail page instead of the mobile layout.
- Hard-delete confirmation UX added (2026-06-04): `/admin/lost-found/[id]` and `/admin/maintenance/[id]` now have a "Delete" button that opens a confirmation modal before executing the permanent deletion. Shared `DeleteConfirmButton` component (`src/components/requests/delete-confirm-button.tsx`) reused across both. Admin-scoped server actions (`deleteLostItemById`, `deleteMaintenanceReportById`) use `requireAdminSession()` and organization scoping. i18n updated for `ko`/`ja`/`en` with exact copy from the UX spec.
- Vitest unit test suite added (`npm test`): 45 tests covering safe-redirect sanitization, invite RPC error key mapping, and language locale validation. Test files: `src/lib/__tests__/safe-redirect.test.ts`, `src/lib/__tests__/invite-errors.test.ts`, `src/lib/__tests__/i18n-locale.test.ts`.
- i18n hardcoded-string guard added (2026-06-08): a Vitest test (`src/lib/__tests__/no-hardcoded-i18n.test.ts`, also runnable via `npm run check:i18n`) scans `src/app` and `src/components` for hardcoded Korean/Japanese/Kanji (CJK) literals — the highest-signal indicator of UI copy that bypassed `src/lib/i18n.ts`. English is intentionally not scanned (too noisy). Comments and complete `LocalizedText` literals (`{ ko, ja, en }`) are ignored; escape hatches are `i18n-ignore` (line), `i18n-ignore-start`/`i18n-ignore-end` (block), and `i18n-ignore-file`. Canonical building-name domain constants in the calendar/cleaning pages were wrapped with block directives. Two real hardcoded Korean fallback strings in the cleaning linked forms (`"건물 정보 없음"`, `"룸 정보 없음"`) were moved into the dictionary (`lostFound.form.noBuildingInfo/noRoomInfo`, `maintenance.form.noBuildingInfo/noRoomInfo`) across `ko`/`ja`/`en`. The guard runs as part of `npm test`.
- Cleaning Workflow Phase 7 first vertical slice started on 2026-05-21: `cleaning_sessions` schema/migration added with RLS, per-organization one-active-session-per-user protection, duration fields, and org/date/status indexes. `/mobile/cleaning` lets field roles select a room/task, start a real persisted cleaning session, view an active timer, complete through a confirmation step with an optional note, and review today's completed records. The active mobile state now separates timer/status, notes, and completion action so completion is deliberate rather than immediate. The current task dropdown is intentionally limited to Checkout Cleaning, Simple Cleaning, and Long-stay Cleaning. `/admin/cleaning` shows the organization's date-scoped cleaning status by room, task, staff, state, start time, and duration. Cleaning "today" now uses the defined UTC+9 local operating date (`Asia/Tokyo`, matching the app's operating-date helper) instead of raw UTC ISO slicing, and a corrective migration updates the DB default and active-session unique index. This slice intentionally uses a small static room/task selection surface until reservation/room master data is connected; invite/auth/session behavior, role model, RLS, persistence semantics, and other workflows were not changed.
- `owner` is now treated as a hybrid role for field operations: owners can use the mobile cleaning workflow in addition to admin web, while `developer_super_admin` still bypasses for support/debugging. Matching corrective RLS migrations keep page access and mutations aligned.
- Cleaning completion confirmation modal now displays the completion note as a read-only review block (line breaks preserved via `whitespace-pre-wrap`); the block is hidden when no note was entered, so the graceful empty case requires no additional i18n key.
- Active-cleaning linked workflow shortcuts added (2026-05-21): while a cleaning session is in_progress, the mobile cleaning card shows two shortcuts, "Report Lost Item" and "Report Issue", each linking to a create form prefilled from the active session (room auto-selected, session ID passed and re-validated server-side). After create, redirects to the new record's detail page (`/mobile/requests/lost-found/{id}?created=1` / `/mobile/requests/maintenance/{id}?created=1`). Saved records carry a `cleaning_session_id` FK back to the session. Two new tables (`lost_items`, `maintenance_reports`) added with RLS, enums, and FK indexes. TypeScript types and i18n (ko/ja/en) updated accordingly.
- Linked-workflow context-integrity hardened (2026-05-21): invalid or stale `?sessionId=` now shows an explicit error state on both linked form pages (no form rendered); login redirect preserves `?sessionId=` in the `next` param; server actions redirect with `error=invalid_session` instead of silently saving without the link; status filter removed from session validation so the link survives cleaning completion before form submit.
- Linked-form client-side validation added (2026-05-21): confirmation sheet for both linked forms is blocked from opening if the required field (item name / issue title) is empty; an inline error message appears below the field using the existing `missing_item_name` / `missing_issue_title` i18n strings. Error clears on input change. Hardcoded `"-"` placeholder was removed from summary fields because required values are always present before the sheet opens. No new i18n keys needed.
- Lost item and maintenance list/status management implemented (2026-05-21): `/mobile/requests` shows the current user's own lost items and maintenance reports in two sections with status badges, cleaning-session indicators, and date/time metadata. `/admin/lost-found` and `/admin/maintenance` provide org-scoped operational list views (recent-first). `/admin/lost-found/[id]` and `/admin/maintenance/[id]` are detail pages with full record inspection and a status-update form. Server actions `updateLostItemStatus` and `updateMaintenanceStatus` validate role, org ownership, and enum value before mutating. Status badges use distinct colors per state (registered=blue, stored=amber, disposal_scheduled=orange, disposed=muted; open=blue, in_progress=amber, resolved=green, closed=muted) across all surfaces. i18n extended with list/admin/status strings in ko/ja/en. No schema changes required.
- Mobile request detail + status tracking implemented (2026-05-21): `/mobile/requests/lost-found/[id]` and `/mobile/requests/maintenance/[id]` are detail pages for mobile users to view their own submitted reports. Access is enforced server-side with `org_id + reported_by_user_id` constraint so users can only reach their own records. Each detail page shows: item name/issue title with domain icon, current status badge, room, timestamp (found_at or created_at), optional memo/description block, and a cleaning-session indicator. A four-segment horizontal progress bar below the metadata makes the status progression legible at a glance. `/mobile/requests` list cards are now tappable links navigating to the corresponding detail page; the broken separator character (`text-border` middle dot) was replaced with `aria-hidden` middle dot styled `text-muted-foreground/30`, matching the pattern used in announcement detail. New data helpers `getMyLostItemById` and `getMyMaintenanceReportById` added with reporter-scoped access (org + user constraints). No new i18n strings needed; no schema changes.
- Mobile request filtering + post-create handoff implemented (2026-05-21): `/mobile/requests` now uses `RequestsFilterView` (client component) for type/status filtering over the already-loaded data. Type filter: All / Lost Items / Maintenance. Status filter: All / Active (registered+stored+disposal_scheduled for lost items; open+in_progress for maintenance) / Closed (disposed; resolved+closed). Filtering is client-side with no server roundtrip. Post-create flow: both `createLostItem` and `createMaintenanceReport` server actions now resolve the inserted record's ID (select by org+user, order desc, limit 1) and redirect to `/mobile/requests/lost-found/{id}?created=1` / `/mobile/requests/maintenance/{id}?created=1`. Both detail pages accept `searchParams.created` and show a localized success banner when `created=1`. Fallback on ID resolution failure is `/mobile/requests`. New i18n keys: `mobile.filterAll/filterActive/filterClosed/filterLostFound/filterMaintenance/noFilterResults`, `lostFound.createdSuccess`, `maintenance.createdSuccess` (ko/ja/en). No schema changes, no RLS changes.
- Linked cleaning-report confirmation step added (2026-05-21): in cleaning-linked mode (`sessionId` valid), both `/mobile/lost-found/new` and `/mobile/maintenance/new` now require a final confirmation sheet before submit. The sheet shows room, core report summary, report time, memo/description preview, and a guest/reservation suggestion section. Because reservation integration is still pending, the suggestion section explicitly reports that connected reservation data is unavailable; no fabricated guest/reservation suggestion is shown. Standalone mode (no `sessionId`) remains the simpler direct-submit flow.
- Cleaning list unprocessed-queue filtering implemented + hardened (2026-05-27): `/mobile/cleaning` Cleaning List and Setting List now act as unprocessed work queues. Rooms with an `in_progress` or `completed` session are excluded from both lists org-wide. `startCleaningSession` server action also blocks re-starting a processed room (`already_processed_today` error, ko/ja/en). **Further hardened (same day)**: room_label → roomKey mapping now uses a three-stage resolver: (1) catalog-based `Map<sessionRoomLabel, roomKey>` exact lookup; (2) canonical prefix parse; (3) normalized legacy alias map from active room catalog (`NFKC` + whitespace collapse + lowercase) to absorb ko/ja/en and old formatting variants. Unknown labels still return `null`, but now resolver stats are logged in dev (resolved-by-alias count + unknown count/samples), and `/mobile/cleaning` shows a warning badge when unresolved count reaches threshold (`>= 3`) so operations can react. Added one-time cleanup path `scripts/dev/normalize-cleaning-room-labels.js` (`dry-run` default, `--apply` opt-in) to rewrite recent non-standard `cleaning_sessions.room_label` values to canonical `sessionRoomLabel`. `roomCatalog` is now always fetched (previously gated on `activeSession`) so resolver maps are always available. `inProgressCount` KPI changed from personal scope to org-wide (`orgTodaySessions.filter(in_progress)`) for consistency with the other two KPIs. `청소 대상 / 셋팅 대상` KPI cells show `"-"` when `getCleaningTargets()` fails, distinguishing data load failure from genuine zero count. `getOrgTodayCleaningRoomLabels` added to `src/lib/cleaning.ts`; `buildSessionLabelToRoomKeyMap` + `resolveRoomKey` added to `page.tsx` (replacing `sessionRoomLabelToRoomKey`). `docs/product/07-cleaning-workflow.md` updated with roomKey resolution priority table and KPI consistency/failure policies.
- Cleaning KPI interaction refined (2026-05-27): the top `셋팅 대상` KPI on `/mobile/cleaning` is now clickable when the count is non-zero and opens a mobile bottom sheet with the full setting-target list. The sheet shows building/room, guest name, and PAX for each item, with immediate `Start setting` actions. No preview rows are shown inline in the KPI card. This keeps the top summary compact while still giving fast access to operational detail.
- Cleaning manual section redesigned to cascading selects (2026-05-27): the free-text room input in `/mobile/cleaning` manual section is replaced with a cascading building + room select powered by the active room master catalog (`getActiveRoomCatalogServer`). UX: building select → room select (disabled until building chosen) → task select. If the room master catalog has no classified rows (`undefined`), the form is replaced with a locale-appropriate unavailable message; there is no free-text fallback. `roomLabel` written to `cleaning_sessions` is `{canonicalPropertyName} {canonicalRoomLabel}` (or just `{canonicalPropertyName}` for Okubo-style single-room properties). Server-side validation in `startCleaningSession` calls `getActiveRoomCatalog` and rejects any submitted `roomLabel` not in the allowed set when a catalog exists; falls back to length-only check when catalog is `undefined`. Client-side state managed by new `"use client"` component `src/components/cleaning/manual-cleaning-form.tsx` using `useTransition` + `FormData`. 4 new i18n keys: `manualBuildingLabel`, `manualBuildingPlaceholder`, `manualRoomSelectPlaceholder`, `manualRoomMasterUnavailable` (ko/ja/en). `docs/product/07-cleaning-workflow.md` updated with manual section design, roomLabel generation rules, and server-side validation behavior.
- Cleaning page building labels i18n-ified (2026-05-27): building section headers in `/mobile/cleaning` now resolve through `dictionary.cleaning.buildingLabels[key]`, fixing Japanese mode showing Korean strings. Canonical building keys (`arakicho_a`, ..., `okubo_c`) are stable English slugs used for ordering/grouping; locale display labels are sourced exclusively from the i18n dictionary (ko/ja/en all provided). `CANONICAL_TO_BUILDING_KEY` maps canonical property names → keys; `BUILDING_KEY_ORDER` drives sort rank. No schema/data changes. `buildingLabels` added to FALLBACK_DICTIONARY and ko/ja `localeOverrides` in `src/lib/i18n.ts`.
- Cleaning page building-section grouping implemented (2026-05-27): `/mobile/cleaning` Cleaning List and Setting List are now grouped by building with per-building sub-section headers. Empty building sections (no targets that day) are not rendered. Buildings are displayed in a fixed operational order (아라키초A → 아라키초B → 가부키초 → 다카다노바바 → 오쿠보A → 오쿠보B → 오쿠보C; unknown buildings appended alphabetically). Rooms within each section are sorted numeric-ascending (first digit sequence extracted for sort key, label string tiebreaker). Logic implemented as pure helpers `groupByBuilding`, `BUILDING_ORDER`, `roomSortKey` in `src/app/mobile/cleaning/page.tsx`; no schema or data model changes. `docs/product/07-cleaning-workflow.md` updated with building-section display rules.
- Cleaning workflow smart list implemented (2026-05-27): `/mobile/cleaning` now derives the room selector from today's confirmed reservations instead of a hardcoded static list. Two sections are shown before an active session exists: (1) **Cleaning list** — rooms with `check_out_date = today` (Asia/Tokyo); each card shows turnover badge + arriving guest when same-day check-in exists, otherwise next check-in date within 30 days or "no check-in today". Tapping Start passes the session room label derived from canonical property+room normalization. (2) **Setting list** — rooms with `check_in_date = today` NOT in the departure set (pre-arrival setup tasks); shows arriving guest name and PAX count. Both lists filter excluded properties/rooms via `room-label-normalization.ts`. A manual free-text input section remains below for exceptions. `cleaningRoomOptions` static array removed from `src/lib/cleaning.ts`; server actions for lost-found and maintenance new forms now validate room label by length (0 < len ≤ 100) instead of the removed include-check. Form components now render a free-text input when `roomOptions = []` (standalone mode) and a single-option select when `roomOptions = [room]` (linked-from-cleaning mode). New file `src/lib/cleaning-targets.ts` added with `getCleaningTargets`, `CleaningTarget`, `SettingTarget` types. Two parallel Supabase queries (departures + 30-day arrivals window) avoid N+1. i18n extended with cleaning smart list keys (ko/ja/en): `cleaningListTitle`, `settingListTitle`, `turnoverBadge`, `noCheckInToday`, `nextCheckIn`, `noCleaningToday`, `paxUnit`, `loadError`, `manualSection`, `manualRoomPlaceholder`, `startSetting`. `docs/product/07-cleaning-workflow.md` updated with reservation-driven selection model, list types, exclusion policy, and manual fallback.
- Google OAuth login is live on `/auth/login` (2026-06-04): `signInWithGoogle` server action wired via `supabase.auth.signInWithOAuth({ provider: "google", options: { prompt: "select_account" } })`. After Google callback, `getOnboardingState()` resolves profile/membership status server-side in the callback route; new users are routed to `/onboarding` with `next` preserved; returning users are routed directly to their destination. Google profile data (name, phone, avatar) is NOT auto-filled; users must complete all required fields manually. Supabase dashboard setup is required: enable Google OAuth provider, add client ID and client secret from Google Cloud Console, add the Supabase callback URL as an authorised redirect URI.
- Auth callback onboarding gate added (2026-06-04): `/auth/callback` now resolves `getOnboardingState()` after code exchange and redirects to `/onboarding?next=<destination>` for incomplete users. Previously the callback redirected to `next` unconditionally and relied on each protected page to gate onboarding. Now the gate is enforced once at the callback boundary.
- `next` param preserved through middleware login-redirect (2026-06-04): when an authenticated user lands on `/auth/login`, the middleware now passes `next` and `lang` through to `/onboarding` instead of clearing search params.
- Onboarding `ready` redirect honours `safeNext` (2026-06-04): `/onboarding` now redirects to `safeNext || state.redirectTo` for fully-onboarded users. Previously it always redirected to `state.redirectTo` (the default role route), losing the original destination.
- Account page now shows organisation name and role (read-only) (2026-06-04).
- Mobile sidebar user card is now a tappable link to `/account?mode=mobile` (2026-06-04).
- Mobile shell menu trigger updated to a two-line hamburger icon with a shorter bottom line (2026-06-04). Sidebar behavior and layout remain unchanged.
- Mobile-first entry/login refined for real phone QA (2026-06-18): the root entry (`/`) now auto-redirects phone/tablet user agents to `/mobile` instead of showing `DevEntry`, and the local dev login page keeps mobile devices pinned to `/mobile` end-to-end. When dev seed login is enabled, the mobile-only shortcut now clearly enters the named test admin account **Stay Ops E2E Admin**.
- `src/app/api/dev/seed-login/route.ts` hardened (2026-05-20; expanded for mobile LAN QA later): four-layer guard: (1) `NODE_ENV !== "development"`, (2) `ENABLE_DEV_SEED_LOGIN=true` opt-in gate, (3) **local host allow-list** (`localhost`, `127.0.0.1`, and private LAN IPs for same-network phone testing), (4) `DEV_SEED_LOGIN_PASSWORD` must be non-empty after `trim()`. All return 404, no sensitive detail in response. Hardcoded `DEV_LOGIN_PASSWORD` constant removed; password now comes exclusively from `DEV_SEED_LOGIN_PASSWORD` env var and is threaded into `ensurePassword` and `signInWithPassword`. `findOrCreateUser` now paginates through all users instead of capping at one `listUsers(page:1, perPage:1000)` call. `?next=` validated against open-redirect. Catch block returns generic `seed_login_failed` with `console.error` server-side only.
- `.env.example` updated with `ENABLE_DEV_SEED_LOGIN=` and `DEV_SEED_LOGIN_PASSWORD=` with a dev-only comment block.

### Verification

- `npm run lint` passes.
- `npm run build` passes.
- Beds24 reservation-bar recovery is now aligned to the real `/bookings` payload shape:
  - `roomId` is the primary room join key for reservation backfill/recovery
  - `unitId` is fallback-only
  - historical recovery no longer filters to `source = "beds24"` because real rows are stored under channel names (`Booking.com`, `Airbnb`, etc.)
- Beds24 reservation backfill now targets the operational overlap window (current month + next month) and follows `/bookings` pagination via `pages.nextPageLink`, preventing the previous 100-row truncation.
- Beds24 webhook reliability hardened (2026-06-10): silently-dropped webhooks no longer leave reservations invisibly missing. (1) New `beds24_webhook_events` table (migration `202606100001_beds24_webhook_events.sql`, applied remotely) logs every inbound webhook batch and reconciliation run (trigger source, http status, processed/succeeded/failed counts, modes, compact booking summary); written by `src/lib/beds24/webhook-events.ts`, platform-admin read / service-role write. (2) New production endpoint `/api/beds24/reconcile` re-pulls the operational window from Beds24 `/bookings` and upserts anything missing (idempotent; production counterpart to the dev-only backfill route), authorized via `CRON_SECRET`/`BEDS24_WEBHOOK_SECRET`. (3) Vercel Cron (`vercel.json`, `0 19 * * *` UTC = 04:00 JST) runs reconcile once daily (free Hobby-plan compatible). Webhook-first remains primary; reconciliation is a low-frequency safety net, not polling. Triggering investigation: confirmed reservation `5843903602` (Kabukicho 302, check-in 2026-06-08) was found missing from the calendar — recovered via reconciliation. **Production action required: set `CRON_SECRET` on the Vercel project so the daily cron is authorized.** Docs: `docs/product/15-reservation-calendar.md` (Webhook Reliability), `01-decision-log.md` (2026-06-10), `04-data-model.md`, `05-rls-permissions.md`, `07-environment-setup.md`.

- Announcement image Storage RLS INSERT policy exists: `supabase/migrations/202605170001_announcement_images_upload_policy.sql`.
- Storage INSERT policy hardened by corrective migrations `202605190001_harden_announcement_images_rls.sql` and `202605190002_restrict_announcement_image_filenames.sql`: path must be exactly `{UUID}/{UUID}/{safe-filename}` (3-segment check, both UUIDs validated by regex, filename length bounded, filename starts and ends with an alphanumeric character).
- `cleanupAnnouncementImagePaths` server action redesigned: signature is now `(announcementId, paths)`, cleanup is pinned to one announcement and one org, the user must have announcement creation rights in that org, invalid paths reject the whole cleanup request, and persisted announcement IDs are never cleaned up through this action.
- `createAnnouncement` now cleans up valid uploaded images on validation, permission, or DB insert failure, while refusing cleanup for an already-persisted announcement ID.
- `cleanupStoragePaths` now captures and logs Storage errors via `console.error`; previously swallowed errors silently.
- `createAnnouncement` now validates `organizationId` as a UUID (not just non-empty) in the first validation guard; non-UUID org IDs now return `invalid_organization` instead of `forbidden`.
- `purgeOrphanAnnouncementImages` platform-admin-only server action added (`src/app/admin/announcements/orphan-cleanup-actions.ts`): traverses the bucket hierarchy, skips objects within the 60-minute grace period or referenced by any announcement's `image_urls`, and deletes in batches of 100. Trigger UI (`OrphanCleanupButton`) appears in `/admin/announcements` only for platform admins.
- Orphan cleanup server action validation mirrors `actions.ts` path rules: 3-segment format, both UUID segments validated, filename length 3-160 chars, alphanumeric start/end.
- Orphan cleanup now returns explicit failure state (`ok`, `aborted`, `errorMessage`, `listingFailures`) and fails the run on any org/announcement/file Storage listing error instead of reporting a success-like zero-delete result. The admin UI shows incomplete cleanup as a destructive alert.

### Flow Trace Verification (code-level trace, 2026-05-19)

Each announcement image flow was traced against `src/app/admin/announcements/actions.ts`:

| Flow | Key guards | Status |
|---|---|---|
| Normal create success | URL structure validation -> `canCreateInOrganization` -> DB insert | Pass |
| Partial upload failure | Client: `cleanupAnnouncementImagePaths(announcementId, uploadedPaths)` -> `announcementExists` guard | Pass |
| Server validation failure | `cleanupSubmittedAnnouncementImages` before each redirect, `isValidUUID` + `announcementExists` inside | Pass |
| Permission failure | Same cleanup path, `canCreateInOrganization` rejects before DB insert | Pass |
| Duplicate/reused announcementId | Both cleanup functions gate on `announcementExists(announcementId)` before return | Pass |

### Actual Browser E2E Run / HTTP Level (2026-05-20)

Method: `seed-login` endpoint seeded an authenticated dev session via Supabase `signInWithPassword`. Authenticated HTTP requests used `curl -b <cookie-jar>`. Dev server running on port 3000 (process 20648, `npm run dev` / Turbopack).

**Limitation on server action invocation**: Next.js Turbopack dev server requires the client JS runtime to correctly serialize RSC-format request bodies for server action calls. Raw curl cannot replicate this format reliably. Action POST attempts returned 404 (action ID lookup mismatch between prod build manifest and running dev server). Server action guard verification remains at code-trace level (see prior section). This is a known limitation of curl-based Next.js server action testing.

**What was verified via HTTP:**

| Scenario | Steps | Expected | Observed | Status |
|---|---|---|---|---|
| Platform admin page load | `GET /admin/announcements` with admin cookie | 200, maintenance section visible | HTTP 200; HTML contains Korean cleanup section labels and `OrphanCleanup` | **Pass** |
| Staff role page load | `GET /admin/announcements` with staff cookie | 200, maintenance section hidden | HTTP 200; grep for cleanup labels and `OrphanCleanup` returned count 0 | **Pass** |
| Unauthenticated access | `GET /admin/announcements` (no session) | 307 -> `/auth/login?next=/admin` | HTTP 307, Location: `/auth/login?next=/admin` | **Pass** |
| `?created=1` success banner | `GET /admin/announcements?created=1` admin | Korean success string | Korean success banner text present in response | **Pass** |
| `?deleted=1` success banner | `GET /admin/announcements?deleted=1` admin | Korean success string | Korean success banner text present in response | **Pass** |
| `?statusUpdated=1` success banner | `GET /admin/announcements?statusUpdated=1` admin | Korean success string | Korean success banner text present in response | **Pass** |
| `?error=forbidden` banner | `GET /admin/announcements?error=forbidden` admin | Korean error string | Korean error banner text present in response | **Pass** |
| `?error=invalid_announcement` banner | `GET /admin/announcements?error=invalid_announcement` admin | Korean error string | Korean error banner text present in response | **Pass** |
| `?error=invalid_images` banner | `GET /admin/announcements?error=invalid_images` admin | Korean error string | Korean error banner text present in response | **Pass** |
| `?error=invalid_organization` banner | `GET /admin/announcements?error=invalid_organization` admin | Korean error string | Korean error banner text present in response | **Pass** |

**Server action invocation (browser required - blocked for curl):**

| Scenario | Why blocked | Verified by |
|---|---|---|
| `createAnnouncement` - UUID/URL guards, cleanup on failure | Next.js Turbopack action protocol not curl-compatible | Code trace (prior section) |
| `updateAnnouncementStatus` - non-UUID `announcementId` -> `invalid_announcement` | Same | Code trace |
| `deleteAnnouncement` - non-UUID `announcementId` -> `invalid_announcement` | Same | Code trace |
| `cleanupAnnouncementImagePaths` - `announcementExists` guard | Same | Code trace |
| `purgeOrphanAnnouncementImages` result structure (`ok/aborted/listingFailures`) | Same; also requires real Storage access | Code trace + TypeScript build |
| Orphan cleanup destructive alert rendering | Requires triggering failure state in running browser session | Manual |
| Image upload -> create -> Storage object saved | Requires browser File API + Supabase anon key auth | Manual |

### Supabase Migration History Status

18 local migration files exist as of 2026-05-19. All 18 match remote history. Migration history is current.

- 16 local migration files matched the remote history table as of 2026-05-17.
- 2 corrective migrations pushed 2026-05-19: `202605190001_harden_announcement_images_rls.sql`, `202605190002_restrict_announcement_image_filenames.sql`.
- The active Storage INSERT policy is the hardened `202605190002` policy: 3-segment path, both UUID segments validated by regex, filename length 3-160, alphanumeric start/end.
- 6 comment-only placeholder files remain in `supabase/migrations/` to preserve the audit trail of the original old-style version names. They contain no SQL and will never cause schema changes.
- Full migration CLI guidance is in `docs/engineering/07-environment-setup.md` under "Supabase Migration CLI".

### QA Scope Summary: Done vs Deferred (2026-05-20)

This table separates what has been verified from what requires a human QA engineer in a real browser session. Code trace and HTTP-level verification are insufficient substitutes for browser E2E; they are listed separately.

| Verification item | Code trace | HTTP E2E (curl) | Browser E2E | Deferred / formal QA |
|---|---|---|---|---|
| Page load access control (admin / staff / unauth) | Pass | Pass | Pass | None |
| Banner rendering for all error/success params | Pass | Pass | Not re-run in browser | Low |
| Announcement create with images (TC-01) | Pass | Not run | Not run | QA engineer |
| Partial upload failure cleanup (TC-02) | Pass | Not run | Not run | QA engineer |
| Server validation failure cleanup (TC-03) | Pass | Not run | Not run | QA engineer |
| Permission failure cleanup (TC-04) | Pass | Not run | Not run | QA engineer |
| Duplicate `announcementId` protection (TC-05) | Pass | Not run | Not run | QA engineer |
| `updateAnnouncementStatus` UUID guard (TC-06) | Pass | Not run | Not run | QA engineer |
| `deleteAnnouncement` UUID guard (TC-07) | Pass | Not run | Not run | QA engineer |
| Orphan cleanup success path (TC-08) | Code trace only | Not run | Not run | QA engineer |
| Orphan cleanup listing-failure abort (TC-09, TC-10) | Code trace only | Not run | Not run | QA engineer + Supabase admin |
| Multi-device popup dismissal sync | Not applicable | Not run | Not run | Formal QA (staging, multiple devices) |
| Cross-role multi-user announcement visibility | Pass | Not run | Not run | Formal QA (staging) |
| `seed-login` dev-route production guard | Pass | Not run | Re-verified locally | None |

Full checklist with steps, evidence rules, and exit criteria: `docs/planning/07-qa-checklist-announcement-images.md`.

## In Progress

### Phase 13: QA and Internal Rollout

Active as of 2026-06-03. See `docs/planning/13-qa-checklist.md` for the live checklist and release-readiness summary.

Key remaining tasks before full internal rollout:

- Browser E2E verification on real devices (iPhone, Android, desktop).
- Run `scripts/dev/beds24-backfill-room-master.sh` in production to switch calendar empty count from provisional to authoritative.
- Confirm all invited staff have completed onboarding before first operational use.

### Known deferred items (post-MVP backlog)

- ~~Hard-delete confirmation UX for lost-found and maintenance records.~~ Resolved 2026-06-04 — see completed items.
- Beds24 inventory API sync for automatic room master classification without backfill.
- In-app map integration (Google Maps deeplink present; embedded map not implemented).
- ~~i18n tooling enforcement (manual review currently; no lint-time hardcoded-string detection).~~ Resolved 2026-06-08 — see completed items (CJK hardcoded-string guard).

## Remaining MVP Phases

Completed phases (all done criteria met):

- Cleaning workflow (Phase 7)
- Announcements (Phase 9)
- Order requests (Phase 8, order slice — 2026-06-01)
- Notifications (Phase 11) — order-processed notification dispatch implemented (2026-06-03); migration `202606030001_notifications.sql` applied to remote; `schemaUnavailable` fallback in place.
- Export flows (Phase 12) — CSV export for reservations, cleaning, maintenance, lost-found, orders; UTF-8 BOM; RFC 5987 filename.
- User profile and directory (Phase 6) — `/account`, `/mobile/directory` (phone shortcut), `/admin/users/[id]`.

Substantially complete (remaining items noted):

- Lost item + maintenance requests (Phase 8 lost/maintenance slices); image upload done; hard-delete confirmation added to admin detail pages (2026-06-04).
- Reservation calendar (Phase 10); mobile + admin view done; room master authoritative mode requires Beds24 inventory backfill (`scripts/dev/beds24-backfill-room-master.sh`).

Next up:

1. QA and internal rollout (Phase 13) — in progress.

## Release Readiness Summary (2026-06-03)

### Passed

| Area | Status |
|---|---|
| `npm run lint` | 0 errors, 2 warnings (non-blocking): unused `options` in `middleware.ts`; `@next/next/no-img-element` in `order-item-row.tsx` (blob preview) |
| `npm run build` | passes (TypeScript type error fixed in this cycle) |
| Auth / onboarding | legacy magic-link + profile completion + invite code join are implemented; 2026-06-18 auth reset still pending in code |
| Mobile shell | pull-to-refresh, scroll-aware chrome, side menu, capsule tabs |
| Home dashboard | KPI counts, active task, today activity, error/empty separation |
| Calendar — mobile | 14-day room timeline, lists mode, month nav, building picker, realtime |
| Calendar — admin | month grid, property filter, check-in/out lists, CSV export |
| Cleaning workflow | smart list, building grouping, cascading selects, timer, completion |
| Cleaning → linked requests | lost-found and maintenance auto-fill from active session |
| Lost-found requests | create, detail, admin list/detail, status management, images |
| Maintenance requests | create, detail, admin list/detail, status management, images |
| Order requests | create, approve, process (delivery date + range), close, CSV export |
| Order → notification | `order_processed` notification dispatched on status = ordered |
| Announcements | create/publish/archive, images, popup, 7-day hide, comments, read tracking |
| Notifications | list, unread badge, mark read, mark all read; graceful fallback if migration missing |
| CSV export | 5 resources (reservations, cleaning, maintenance, lost-found, orders); UTF-8 BOM |
| Profile / account | name, phone, language editing (theme editing removed — light-mode-only) |
| Staff directory | mobile `/mobile/directory` with phone call shortcut |
| Admin user management | list, detail, role/status update, `/admin/users/[id]` |
| i18n (ko/ja/en) | all production-visible surfaces covered |
| Supabase RLS | org-scoped isolation, role-based server-side enforcement |
| Remote DB migrations | all 34 migrations applied (verified 2026-06-03) |

### Fixed in This QA Cycle

| Issue | Fix |
|---|---|
| TypeScript build failure (`process-webhook-booking.ts:539`) | Explicit type annotation added |
| Home quick action "주문" linked to request list instead of order form | Now links to `/mobile/orders/new` |
| `delivery_date` column missing from remote DB | Migration applied via Supabase MCP |
| `delivery_start_date` / `delivery_end_date` missing from remote DB | Migration applied via Supabase MCP |
| `next.config.ts` ESM error (`__dirname` not defined) | Removed unnecessary `turbopack: { root: __dirname }` block (2026-06-08) |
| Hardcoded Korean strings in cleaning linked forms | `"건물 정보 없음"` / `"룸 정보 없음"` moved to `src/lib/i18n.ts` (ko/ja/en) (2026-06-08) |
| i18n tooling enforcement missing | CJK hardcoded-string guard added (`src/lib/__tests__/no-hardcoded-i18n.test.ts`); `npm run check:i18n` alias added (2026-06-08) |
| i18n guard directives blanked before detection (block/JSX comment forms silently not honored) | Directive matching moved to the raw source line; CJK detection still uses the comment-blanked view. Added `scanSource` unit tests for line/block/JSX directive forms (2026-06-08) |
| i18n guard directives matched by simple substring (string literals and code tokens could accidentally suppress scanning) | Directives now recognized only inside actual comment content via `lineHasDirective` / `sourceHasFileDirective`; regression tests added for string-literal and code-token non-suppression; suite now 64 tests total (2026-06-08) |

### Dark mode removed — app is light-mode-only (2026-06-08)

Dark mode is deferred until after the official launch (decision log "Theme Modes" / "Theme Preference" superseded). For the MVP and internal rollout, StayOps is light-mode-only. Removal was end-to-end, not a disable:

- **Styling**: all `dark:` Tailwind utilities removed across 34 files (≈577 tokens); the `:root.dark` / `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` blocks removed from `src/app/globals.css`. Light `:root` variables are unchanged, so the intended light appearance is preserved.
- **State / persistence**: `themePreference` removed from `SessionUser`/profile selects in `src/lib/session.ts`; `data-theme` attribute and `dark` class removed from `src/app/layout.tsx`; theme write removed from `src/app/account/actions.ts` and `src/app/api/dev/seed-login/route.ts`; unused `theme_preference` column dropped from the `src/app/admin/users` select; `src/lib/theme.ts` deleted.
- **UI controls**: theme `<select>` removed from `/account`; theme toggle + `localStorage` (`stayops.theme`) + `applyTheme`/`matchMedia` removed from `src/components/foundation-preview.tsx`.
- **i18n**: `common.theme` and the `themes` (system/light/dark) blocks removed from all three locales in `src/lib/i18n.ts`.
- **Database (out of scope, documented)**: `public.theme_preference` enum and `profiles.theme_preference` (`not null default 'system'`) remain in the already-applied migration `202605090001_initial_foundation.sql`. The app no longer reads or writes the column; new rows take the default. The column is harmless leftover state; schema removal is deferred to avoid a risky destructive migration on the live DB and because no corrective-migration is needed for the app to be light-mode-only. `src/types/database.ts` keeps the field so the generated types stay accurate to the real schema.
- **iOS browser chrome tint (2026-06-22)**: because the app is light-mode-only, `viewport.themeColor` in `src/app/layout.tsx` is declared for **both** `light` and `dark` schemes with the **same ivory `#f7f4ee`**, so iOS Safari's status bar / URL toolbar stay unified with the app's ivory chrome even when the system is in dark mode. iOS ignores a single themeColor in dark mode and falls back to black system chrome, leaving the top status bar and bottom URL toolbar black; an explicit (identical) dark variant forces the light design's chrome in both schemes. Not a design change; `mobile-shell.tsx` safe-area handling is untouched. (In-app browsers like KakaoTalk/Instagram ignore theme-color and are out of scope.)

### Open Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Browser E2E not performed | Medium | Run manual golden-path check before first staff use |
| Calendar empty count is provisional | Low | Run `scripts/dev/beds24-backfill-room-master.sh` to resolve |
| ~~Admin orders link to mobile layout~~ | Resolved 2026-06-04 | Admin order detail page added at `/admin/orders/[id]` |
| ~~No hard-delete confirmation for requests~~ | Resolved 2026-06-04 | Admin lost-found and maintenance detail pages now require confirmation before permanent deletion |
| ESLint warnings (2) | Low | Non-blocking: `middleware.ts` unused `options`; `order-item-row.tsx` `<img>` vs `next/image` |

### Items Not Tested (requires real browser session)

- Actual server action execution (create/update mutations)
- PWA install on iOS/Android
- Multi-language rendering in production environment
- Push notification delivery (not yet implemented)
- Real Beds24 webhook end-to-end with live reservation changes

### Release Recommendation

**Status: Conditionally approved for limited internal rollout**

No critical code-level blockers remain. Build passes, all DB migrations are applied, and business logic has been verified by code trace. Browser E2E verification (actual form submissions, device behavior) is still pending and must be completed before Phase 13 closes.

Controlled rollout may begin once the pre-rollout steps below are done. Phase 13 remains open until manual browser verification is confirmed and the first staff batch is onboarded.

Required before first staff use:

1. Run `scripts/dev/beds24-backfill-room-master.sh` (switches calendar to authoritative empty count).
2. Perform a manual browser golden-path pass: login -> cleaning start/complete -> order request -> admin approves and processes order -> mobile user sees notification.
3. Invite first staff batch via `/admin/settings/invite-codes`.

See `docs/planning/13-qa-checklist.md` section 12 for the full verification scope breakdown.

## Important Rules

- Do not add visible UI strings outside localization dictionaries.
- Update relevant Markdown docs whenever behavior changes.
- Keep permissions enforced on the server/database side.
- Keep Korean, Japanese, and English support from the first implementation.
- Run `npm run lint` and `npm run build` after changes.

- Global mobile shell unified (updated 2026-05-28, icon updated 2026-06-04): `MobileShell` now owns the shared mobile chrome and navigation behavior: custom two-line hamburger menu trigger with a shorter bottom line (left), centered StayOps wordmark, profile avatar link (right), scroll-aware top chrome, 78%-width slide-out side menu, and floating liquid-glass capsule bottom tabs. The base mobile surface is pure white; Liquid Glass is applied selectively rather than globally. `title` prop remains an `aria-label` on `<main>` (no visual rendering from shell). All mobile routes inherit the shell without page-file changes.

## 2026-05-22 Sync Update

- Mobile shell is now fully unified across all `MobileShell` pages.
  - Left: custom two-line hamburger menu trigger (shorter bottom line)
  - Center: StayOps wordmark
  - Right: profile avatar link
  - Menu behavior: 78%-width left slide-out side menu with main-screen push and dim overlay
  - Top chrome behavior: hides on downward scroll and returns on upward scroll
  - Bottom navigation: floating liquid-glass capsule overlay
- The previous non-responsive menu icon issue is resolved by the side menu behavior.
- Request image attachment slice is completed:
  - Lost-item and maintenance request forms support up to 5 images
  - Request image validation and detail rendering are active on both mobile and admin surfaces
- Announcement mobile visual consistency is finalized:
  - `/mobile/announcements` list cards aligned with current liquid-glass spacing and metadata rhythm
  - `/mobile/announcements/[id]` detail/read blocks aligned with the same surface hierarchy
  - centered popup modal CTA hierarchy aligned with the current mobile design rules


## 2026-05-22 Phase 10 Progress Update

- Phase 10 (Reservation Calendar/Beds24) started.
- Schema foundation completed in this cycle:
  - `supabase/migrations/202605220001_reservations.sql` added
  - `reservation_status` enum + `reservations` table + RLS/indexes/constraints added
  - `src/types/database.ts` updated with `public.reservations` and `reservation_status`
- Next immediate step: implement Beds24 webhook endpoint and reservation upsert flow.

## 2026-05-22 Beds24 Webhook Progress

- Reservation schema foundation is now connected to an ingest endpoint.
- Added `POST /api/beds24/webhook` to receive Beds24 reservation payloads and upsert into `reservations`.
- Next step: align payload field mapping with the final Beds24 webhook sample and enable production webhook settings.

## 2026-05-22 Mobile Calendar Baseline

- `/mobile/calendar` route implemented at `src/app/mobile/calendar/page.tsx`.
- Organization-scoped reservation query for the current JST month window.
- Cancelled reservations excluded from all counts and the reservation list.
- Today summary counts:
  - Check-ins today: `check_in_date = today`
  - Check-outs today: `check_out_date = today`
  - Staying today: `check_in_date <= today AND check_out_date > today` (checkout-day guests are not counted as in-house)
  - Empty today: provisional, derived from the set of rooms observed in the current month's reservations minus the occupied rooms; requires room master data for accuracy
- Monthly reservation list: sorted by check-in date, each row shows guest name, property/room, date range, status badge.
- Reservation status badge localization complete: raw DB enum values (`confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show`) are now mapped to user-language labels via `dictionary.admin.reservationStatusLabels` (ko/ja/en). Fallback to raw value on unknown status.
- Month bounds computed from JST date using `Intl.DateTimeFormat` with `Asia/Tokyo` timezone (no `new Date(toLocaleString())` hack).
- `activeItem="calendar"` set in MobileShell; calendar tab is correctly highlighted.
- Calendar interaction/design slice integrated from approved references (system-adapted):
  - Overview mode: 14-day room timeline with sticky room column + horizontal date axis + source-colored reservation bars
  - Lists mode: Check-in today / Check-out today / Staying today operational lists
  - Reservation detail: tapping a reservation bar or list item opens a bottom-sheet detail modal
- Month navigation added on calendar overview header:
  - `month=YYYY-MM` query controls the selected month
  - Prev/next buttons update month and reload month-scoped reservation data

**Deferred to next Phase 10 slices:**

- Month navigation controls (prev/next month) with server-side re-fetch
- Precise empty/available count (requires room master table)
- Admin reservation calendar or list view
- Beds24 webhook production alignment and field mapping finalization

## 2026-05-23 Phase 10 Follow-up (Current Turn)

- Mobile calendar tab interaction consistency updated:
  - Tab row now supports three explicit modes: Calendar / Lists / Map.
  - Map mode is currently placeholder-only and shows clear "not yet integrated" guidance.
- Reservation detail bottom-sheet action policy implemented:
  - `Message Guest`: disabled fallback + explanatory hint (integration pending).
  - `Manage Booking`: disabled fallback + explanatory hint (integration pending).
  - Phone field now supports explicit copy/call actions with graceful fallback when number is missing.
- Empty accuracy prep is now visible and documented in-product:
  - Lists mode shows provisional empty count + warning text.
  - Formula remains reservation-observed-room-based, not room-master-authoritative.
  - Room master integration remains a planned TODO for precise empty/availability metrics.

## 2026-05-23 i18n Repair

- Fixed mixed-language UI caused by the main dictionary falling back to English for Korean/Japanese users.
- `src/lib/i18n.ts` now applies Korean and Japanese overrides across the currently implemented app surfaces, including auth, onboarding, account, admin users/settings, mobile home, cleaning, requests, reservation calendar, roles, and common shell labels.
- `npm run lint` and `npm run build` pass after the repair.

## 2026-05-24 i18n Follow-up Fix

- Login error rendering no longer exposes raw query tokens like `missing_email`; `/auth/login` now maps known auth errors through localized dictionary copy and falls back to a generic localized sign-in error.
- Admin organization settings no longer render raw `organization_status` enum values directly; organization badges now use localized labels for `active`, `suspended`, and `archived`.
- In-app browser QA confirmed localized login rendering for `ko`, `ja`, and `en`. Protected admin/mobile routes currently redirect unauthenticated access to `/auth/login`; because the local dev seed-login endpoint is disabled in this environment, those screens were validated through code-path review instead of signed-in browser traversal.

## 2026-05-23 Japanese i18n Completeness Pass

Systematically added missing Japanese translations that caused English fallback in production UI:

- `admin.settings` full block: admin settings pages were showing English.
- `admin.users.errors` + `admin.users.success`: member management error/success messages.
- `requestImages` full block: lost item + maintenance image upload UI (7 strings).
- `mobile.snapshotTitle` + `mobile.snapshotDescription`: mobile home operational status card.
- `cleaning.duration`, `cleaning.noSessions`, `cleaning.staff`, `cleaning.status`: cleaning session list/table.
- `cleaning.lostReported`, `cleaning.maintenanceReported`, `cleaning.errors`: linked workflow toast and errors.
- `lostFound.cancelConfirm`, `confirmSubmit`, `confirmationTitle`, `lostFound.errors`: linked form confirmation modal.
- `maintenance.cancelConfirm`, `confirmSubmit`, `confirmationTitle`, `maintenance.errors`: same pattern.
- `onboarding.errors`: onboarding flow validation messages.

After this pass, all three locales (ko/ja/en) cover the same production-visible UI surfaces. English (`en: {}`) continues to use the FALLBACK_DICTIONARY directly. `npm run lint` and `npm run build` pass.

## 2026-05-24 Final i18n QA / session.platformOrganization`r

- Local QA populated the dev-only seed-login credentials in .env.local for subsequent manual use on this machine.
- Authenticated verification in this turn used direct Supabase session cookies against the running dev server, confirming that ko, ja, and en render consistently on /admin/users, /admin/settings/organization, /mobile/calendar, /mobile/cleaning, and /mobile/requests.

Performed a full screen-by-screen i18n QA: `/auth/login`, `/onboarding`, `/account`, `/admin/settings/organization`, `/admin/users`, `/mobile/calendar`. No hardcoded English strings or raw enum values found in any of these pages.

One remaining gap identified: `session.platformOrganization` was missing from `localeOverrides.ja`, causing Japanese platform admins to see "Platform" (English) instead of "?쀣꺀?껁깉?뺛궔?쇈깲". Fixed by adding `session: { platformOrganization: "?쀣꺀?껁깉?뺛궔?쇈깲" }` to `localeOverrides.ja` in `src/lib/i18n.ts`.

i18n risk is now zero for all implemented production-visible surfaces. `npm run lint` and `npm run build` pass (30 routes).

## 2026-05-24 Empty Today — Provisional/Authoritative Structural Prep (first pass)

- Confirmed: room master table (`rooms` / `properties`) does not yet exist in any migration. `reservations.room_label` and `reservations.property_name` are free-text fields with no FK to a room master.
- `Empty today` calculation remains **provisional** (no room master data to switch to).

### Code changes

- `src/components/calendar/mobile-calendar-view.tsx`:
  - Extracted inline `provisionalEmptyCount` useMemo into a named `computeEmptyToday()` helper function outside the component.
  - `computeEmptyToday(roomMasterRooms, stayingToday, allReservations)` returns `{ count, isProvisional }`. When `roomMasterRooms` is a non-empty array, uses authoritative total-rooms-minus-occupied formula; otherwise falls back to provisional observed-rooms formula.
  - Added `roomMasterRooms?: string[]` prop to `MobileCalendarViewProps`. Currently `undefined` (no room master). Future: pass active room labels from a rooms table query.
  - Empty today card in Lists mode conditionally renders amber warning style + `emptyAccuracyHint` text only when `isProvisional: true`. Neutral card when authoritative — no UI or i18n changes needed at switch time.
  - TODO comment left in `computeEmptyToday()` pointing to `docs/product/06-property-room-model.md`.

**Note:** In this first pass, `rooms` (the Overview room axis) was still using reservation-observed rooms regardless of `roomMasterRooms`. See follow-up section below.

## 2026-05-24 Empty Today — Follow-up Code Review Fixes (second pass)

### Issues fixed

1. **Login redirect lost `month` query param** — `/mobile/calendar?month=2026-07` on unauthenticated access now redirects to `/auth/login?next=%2Fmobile%2Fcalendar%3Fmonth%3D2026-07`. `searchParams` is now resolved in the same `Promise.all` as session/onboarding checks, so the month param is available before the redirect. Invalid `month` values are excluded from the `next` param via the existing `isValidMonth()` guard. `src/app/mobile/calendar/page.tsx`.

2. **Room axis was inconsistent with `roomMasterRooms`** — The `rooms` useMemo in `MobileCalendarView` previously always derived the room list from reservation data. Now it uses `roomMasterRooms` when provided, falling back to observed rooms otherwise. This eliminates the "count authoritative, room axis provisional" split — both `computeEmptyToday()` and the Overview room axis now use the same source. `src/components/calendar/mobile-calendar-view.tsx`.

### Component-level status (after both passes)

| Behavior | `roomMasterRooms` undefined (current) | `roomMasterRooms` provided (future) |
|---|---|---|
| Overview room axis | Observed rooms from reservations | All active rooms from room master |
| Empty today count | Provisional (observed - occupied) | Authoritative (total - occupied) |
| Amber warning card | Shown | Hidden |
| Accuracy hint text | Shown | Hidden |

### Page-level status

- `src/app/mobile/calendar/page.tsx` does **not** pass `roomMasterRooms` — rooms/properties table does not exist yet.
- The entire calendar remains provisional until the rooms table is implemented and queried here.

### Authoritative switch procedure (future — one-time wiring)

1. Implement rooms/properties table per `docs/product/06-property-room-model.md`.
2. Query active room labels for the org server-side in `src/app/mobile/calendar/page.tsx`.
3. Pass `roomMasterRooms={activeRoomLabels}` to `<MobileCalendarView>`.
4. Both the Overview room axis and `computeEmptyToday()` switch to authoritative branch automatically.
5. Amber card + hint disappear. No UI, i18n, or component changes needed.

`npm run lint` and `npm run build` pass.

## 2026-05-24 Empty Today — Code Review Follow-up 2 (third pass)

### Issues fixed

1. **authoritative 판정 기준 수정** (`roomMasterRooms !== undefined` 으로 전환)
   - 이전: `roomMasterRooms && roomMasterRooms.length > 0` → room master 연결됐으나 active room 0개인 경우 provisional fallback으로 떨어지는 버그
   - 수정: `roomMasterRooms !== undefined` → `undefined`만 "미연결" 의미, `[]`는 "연결됨 + 0개 (authoritative zero-room)"
   - 변경 위치: `computeEmptyToday()` + `rooms` useMemo 양쪽 동일 기준 적용
   - `roomMasterRooms = []` 일 때 결과: empty count = 0, isProvisional = false, room axis = 빈 목록 (amber 카드 미표시)

2. **onboarding까지 `month` 보존** (로그인 → onboarding → 캘린더 복귀 전 흐름)
   - `src/app/mobile/calendar/page.tsx`: `state.status !== "ready"` 분기에서 `/onboarding?next=<encodedCalendarPath>` 로 redirect
   - `src/app/auth/login/page.tsx`: authenticated-but-not-ready 상태에서 `/onboarding?lang=<locale>&next=<encodedCalendarPath>` 로 redirect 하도록 수정
   - `src/app/onboarding/page.tsx`: `next?: string` prop 추가, `safeNext` 검증 (상대 경로 + `://` 미포함 + `//` 미포함), `completeProfile`/`joinOrganizationWithInviteCode` 두 form에 `<input name="next" type="hidden">` 삽입
   - `src/app/onboarding/page.tsx`: unauthenticated 재진입 시에도 onboarding 내부 `next`를 다시 로그인 페이지로 감싸 전달
   - `src/app/onboarding/actions.ts`: `sanitizeNext()` 헬퍼 추가 (동일 검증 로직), `completeProfile`에서 성공 시 `next || getDefaultRouteForRole(role)`, membership-pending 재진입 시 `next` 보존, `joinOrganizationWithInviteCode`에서 성공 시 `next || getDefaultRouteForRole(role)`

### `month` 보존 흐름 최종 상태

| 단계 | URL | month 보존 여부 |
|---|---|---|
| 비인증 접근 | `/mobile/calendar?month=2026-07` | — |
| login redirect | `/auth/login?next=%2Fmobile%2Fcalendar%3Fmonth%3D2026-07` | ✓ |
| login page -> onboarding | `/onboarding?lang=ko&next=%2Fmobile%2Fcalendar%3Fmonth%3D2026-07` | ✓ |
| auth callback | → `/mobile/calendar?month=2026-07` | ✓ |
| onboarding 필요 | `/onboarding?next=%2Fmobile%2Fcalendar%3Fmonth%3D2026-07` | ✓ (이번 턴 수정) |
| onboarding 비인증 재진입 | `/auth/login?next=%2Fonboarding%3Flang%3Dko%26next%3D%252Fmobile%252Fcalendar%253Fmonth%253D2026-07` | ✓ (이번 턴 수정) |
| onboarding 완료 (직접) | → `/mobile/calendar?month=2026-07` | ✓ (이번 턴 수정) |
| onboarding profile만 저장 후 membership 대기 | `/onboarding?next=%2Fmobile%2Fcalendar%3Fmonth%3D2026-07` | ✓ |
| membership 완료 | → `/mobile/calendar?month=2026-07` | ✓ |

**edge case (허용):** `joinInviteCode` 헬퍼 내부 error redirect (`/onboarding?error=invalid_invite` 등)는 `next`를 보존하지 않음. 이 경우 onboarding 오류 정정 후 기본 route로 이동. month 복귀 실패는 오류 케이스이므로 허용.

`npm run lint` and `npm run build` pass (30 routes).

## 2026-05-24 Phase 10 — properties/rooms 스키마 도입 + calendar 연결

### 추가된 것

- **`supabase/migrations/202605240001_properties_rooms.sql`**: `properties` + `rooms` 테이블, 3개 새 enum (`property_type`, `property_status`, `room_status`), 양쪽 모두 RLS + updated_at 트리거 + 인덱스 포함.
- **`src/lib/rooms.ts`**: `BEDS24_INACTIVE_MIN_STAY_THRESHOLD = 50`, `isInactiveBeds24Room()`, `getActiveRoomLabels()` — Beds24 활성 room 필터를 캡슐화한 헬퍼 모듈.
- **`src/types/database.ts`**: `properties`, `rooms` 테이블 타입과 `property_status`, `property_type`, `room_status` enum 추가.
- **`src/app/mobile/calendar/page.tsx`**: `getActiveRoomLabels()` 를 reservations 쿼리와 병렬 호출 후 `roomMasterRooms` prop 전달. 이제 page가 완전히 연결됨.

### authoritative 전환 현황

| `roomMasterRooms` 값 | 의미 | Overview room axis | Empty today | amber 카드 |
|---|---|---|---|---|
| `undefined` | 테이블 미연결 / 비어 있음 | 예약 관측 rooms | provisional | 표시 |
| `["A", "B", ...]` | 활성 room master 데이터 존재 | master rooms | authoritative | 숨김 |

- rooms 테이블이 비어 있으면 `getActiveRoomLabels()` 가 `undefined` 반환 → provisional 유지.
- rooms 데이터가 채워지면 자동으로 authoritative 전환 — 코드 변경 불필요.
- Beds24 safety guard: `external_minimum_stay` 가 `NULL` 인 Beds24 rows는 active/inactive 판정 불가로 간주하여 active room list에서 제외.

`npm run lint` and `npm run build` pass.

## 2026-05-24 Phase 10 — Beds24 webhook property/room sync 구현

### 추가된 것

- **`supabase/migrations/202605240002_beds24_sync_indexes.sql`**:
  - `properties`: `UNIQUE (organization_id, name)` constraint 추가
  - `rooms`: `rooms_beds24_ext_room_id_idx` partial unique index 추가 (beds24 + external_room_id 조합)
- **`src/lib/beds24/room-sync.ts`** 신규 생성:
  - `classifyBeds24Room(minimumStay)` — `null | >= 50` → inactive, `< 50` → active
  - `extractBeds24RoomSyncFields(payload)` — minimumStay 포함 5개 필드 추출 (다중 key alias 지원)
  - `syncBeds24PropertyAndRoom(organizationId, fields, supabase)` — property/room upsert 오케스트레이터
- **`src/app/api/beds24/webhook/route.ts`** 업데이트:
  - 필수 필드 검증 통과 후 → property/room sync → reservation upsert 순서
  - sync 실패는 로그만, reservation upsert는 계속
  - response에 `roomSync` 메타데이터 추가

### 설계 결정 요약

| 항목 | 결정 |
|---|---|
| property upsert key | prefer `(organization_id, external_provider, external_property_id)`; fallback to `(organization_id, name)` only when external property ID is missing |
| room upsert key | `(organization_id, room_label)` unique constraint (기존) |
| inactive room 저장 정책 | 저장하되 `status = 'inactive'` — 추적성 유지, active list에서 제외 |
| minimum_stay NULL 처리 | `inactive` 처리 — unknown을 active inventory에 포함시키지 않음 |
| sync 실패 시 reservation | 차단 안 함 — 로그만 남기고 계속 진행 |

### authoritative 전환 상태

| 단계 | 상태 |
|---|---|
| Schema (properties/rooms 테이블) | ✓ 완료 |
| Active room filter helper (`src/lib/rooms.ts`) | ✓ 완료 |
| Calendar wiring (`page.tsx`) | ✓ 완료 |
| Webhook → properties/rooms 적재 | ✓ 완료 (이번 턴) |
| 첫 webhook 수신 후 authoritative 전환 | 자동 — 코드 변경 불필요 |

`npm run lint` and `npm run build` pass.

### Follow-up fix (same day)

- `getActiveRoomLabels()` now treats `0 active rooms` as authoritative zero-room state when room-master rows already exist.
- Result:
  - `undefined` = no room-master rows yet → provisional
  - `[]` = room master connected, but all current rows inactive/filtered → authoritative zero-room state
  - non-empty array = authoritative active-room state
- This prevents the calendar from falling back to reservation-observed rooms and re-exposing inactive Beds24 room IDs.

## 2026-05-24 Phase 10 — Beds24 v2 Payload 정밀화 + E2E 검증 구조

### 확인된 Beds24 v2 Booking Webhook 필드명

| Beds24 v2 native 필드 | 의미 | 비고 |
|---|---|---|
| `bookId` | 예약 ID | `apiReference` / `id` 대신 v2 native |
| `propId` | property ID (정수) | `propertyId` alias도 지원 |
| `propName` | property 이름 | payload에 없을 수 있음 |
| `unitId` | unit/room ID (정수) | `roomId` alias도 지원 |
| `unitName` | unit/room 이름 | payload에 없을 수 있음 |
| `firstNight` | 첫 번째 숙박일 | = check-in date (같은 날짜) |
| `lastNight` | 마지막 숙박일 | **≠ check-out date** |
| `referer` | 채널/소스 | "Booking.com", "Airbnb", "Direct" 등 |
| `guestFirstName` | 성 | `firstName` alias도 지원 |
| `guestLastName` | 이름 | `lastName` alias도 지원 |

### 핵심 날짜 변환 규칙 (검증됨)

```
checkOutDate = lastNight + 1 calendar day
```

- `lastNight = "2026-06-04"` → `check_out_date = "2026-06-05"`
- Beds24에서 lastNight은 숙박 마지막 날 밤. 체크아웃 아침 = lastNight + 1일
- 잘못 처리하면 check_out_date 1일 오차 발생 → 캘린더 점유 계산 오류
- 구현: `lastNightToCheckout()` in `src/app/api/beds24/webhook/route.ts`
  - UTC date string (YYYY-MM-DD) 파싱 → `Date.UTC(y, m-1, d+1)` → ISO slice
  - `lastNight` 먼저 시도 → 없으면 `checkOut`/`departure` fallback

### 중요한 gap: minimumStay는 booking webhook에 없음

- **Beds24 v2 booking webhook payload에는 `minimumStay` 필드가 포함되지 않는다.**
- `minimumStay`는 Beds24 inventory API (`GET /v2/inventory/rooms`)의 room 설정값.
- booking 이벤트는 예약 정보만 전달 — room 설정(min stay, rates, restrictions)은 포함하지 않음.

**결과:**

- webhook으로 sync된 room rows는 항상 `minimumStay = null` → `classifyBeds24Room(null) = "inactive"`
- `getActiveRoomLabels()`는 classified row가 하나도 없으면 `undefined` 유지
- 즉 booking webhook만으로 생성된 Beds24 room rows는 provisional 해제를 유발하지 않음
- 캘린더는 webhook만으로는 authoritative 모드로 전환되지 않음

**해결 방법 (미구현, 향후 작업):**

Beds24 Inventory API를 별도 호출하여 `external_minimum_stay` 컬럼을 업데이트해야 함:
```
GET /v2/inventory/rooms?propId={propId}
→ rooms[].minimumStay
→ UPDATE rooms SET external_minimum_stay = minimumStay WHERE organization_id = ? AND room_label = ?
```
이 업데이트 후 `getActiveRoomLabels()`가 active rows를 반환하면 캘린더가 자동으로 authoritative 모드로 전환됨.

### 코드 변경 내용

**`src/app/api/beds24/webhook/route.ts`:**

- `lastNightToCheckout()` 함수 추가 — UTC 파싱 후 +1일 변환
- checkOut 날짜 추출: `lastNight` 먼저 시도 (변환 포함), fallback으로 `checkOut`/`departure` 등
- checkIn 날짜: `firstNight` / `first_night` alias 추가
- property: `propName` / `prop_name` / `propId` / `prop_id` alias 추가
- room: `unitName` / `unit_name` / `unitId` / `unit_id` alias 추가
- source: `referer` alias 추가 (Beds24 v2 native channel 필드)
- bookingId: `bookId` / `book_id` alias 추가
- guestName: `guestFirstName` / `guestLastName` alias 추가
- numeric booking status support:
  - `0` -> `cancelled`
  - `1`, `2`, `3`, `-2` -> `confirmed`
  - `statusText` / `statusName` / `bookingStatusText` alias 우선 해석

**`src/lib/beds24/room-sync.ts`:**

- `extractBeds24RoomSyncFields()` property/room alias 확장:
  - property: `propName`, `prop_name`, `propId`, `prop_id` 추가
  - room: `unitName`, `unit_name`, `unitLabel`, `unit_label`, `unitId`, `unit_id` 추가
- NOTE 주석 추가: "minimumStay는 booking webhook에 없음 — inventory API 별도 호출 필요"

**`src/lib/beds24/inventory-sync.ts`:**

- current-date Beds24 inventory lookup 추가
- `propId` 기준 `/inventory/rooms/calendar` 호출 시도
- `minimumStay`를 `rooms.external_minimum_stay`에 저장
- `status`를 active/inactive로 재분류
- `external_room_id` 기준 매칭

### authoritative 전환 상태 (updated)

- booking webhook only:
  - `properties / rooms / reservations` 적재 가능
  - `minimumStay` 없으면 provisional 유지
- booking webhook + inventory sync success:
  - `external_minimum_stay` 채워짐
  - `getActiveRoomLabels()`가 classified active rows 반환 가능
  - `/mobile/calendar` authoritative 전환 가능

### 2026-05-25 remote verification

- Remote Supabase project `sspdgzkytkpmquqsfaup` confirmed missing the 2026-05-24 room-master migrations at the start of this turn.
- Applied remote migrations:
  - `properties_rooms`
  - `beds24_sync_indexes`
  - `beds24_property_external_key`
- After remote apply, local sample webhook POST succeeded against `/api/beds24/webhook`:
  - `roomSync.propertyId` returned a real UUID
  - `roomSync.roomId` returned a real UUID
  - `roomSync.roomStatus` = `inactive`
  - `inventorySync` initially skipped on missing env, then retried after env setup
- SQL verification on the remote DB confirmed the webhook-created `rooms` row exists:
  - `external_room_id = 67890`
  - `external_minimum_stay = null`
  - `status = inactive`
- Current blocker to full authoritative verification:
  - initial blocker was invalid Beds24 token, but this was resolved later the same day with a valid long-life token
  - real `properties?includeAllRooms=true` calls now succeed and expose `roomTypes[].minStay`
  - real same-day `inventory/rooms/calendar` calls still return `calendar: []`, so calendar endpoint remains fallback-only for now
- Follow-up hardening applied same day:
  - inventory sync now supports `BEDS24_API_REFRESH_TOKEN` in addition to `BEDS24_API_TOKEN`
  - `GET /authentication/token` access-token refresh is handled server-side with in-memory caching
  - skipped reasons now distinguish missing env, invalid refresh token, invalid access token, and generic HTTP failures
  - property sync now attaches real `external_property_id` onto an existing name-matched property row instead of failing on unique-name collisions
  - real-ID webhook replay (`Arakicho A`, `propId=176430`, `unitId=383971`) verified:
    - `inventorySync.matchedRooms = 1`
    - `inventorySync.updatedRooms = 1`
    - resulting room row: `room_label = 201`, `external_room_id = 383971`, `external_minimum_stay = 1`, `status = active`
  - mobile route safety fix:
    - platform-admin sessions without an organization context now redirect from `/mobile*` to `/admin`
    - this prevents `organization_id = "platform"` from reaching reservations/rooms queries and causing 500s
  - `getActiveRoomLabels()` no longer depends on complex PostgREST `.or()` chains
    - the function now loads the org room rows once and classifies active/classified rows in application code
  - development-only verification added for final calendar QA:
    - `/mobile/calendar?debug=rooms` renders a dev-only room-source card in local development
    - staff-session verification confirmed `mode = authoritative_active`
    - active room labels included `201`
  - follow-up operational tooling added:
    - `backfillBeds24InventoryMinimumStay()` can iterate existing Beds24-linked properties and re-run inventory minimum-stay sync
    - `POST /api/dev/beds24/backfill-inventory` is now available for localhost-only reclassification runs behind `ENABLE_DEV_SEED_LOGIN=true` and `x-beds24-webhook-secret`
    - `scripts/dev/beds24-backfill-inventory.sh` provides a repeatable local trigger so existing rows do not need to wait for a fresh booking webhook before authoritative classification is refreshed
  - full room-master bootstrap path added:
    - `POST /api/dev/beds24/backfill-room-master` imports all Beds24 properties and roomTypes from `GET /properties?includeAllRooms=true`
    - default target is all active organizations (optionally `?organizationId=<uuid>`)
    - `scripts/dev/beds24-backfill-room-master.sh` provides a repeatable local trigger

### Sample Fixture Files (개발 전용)

- `scripts/dev/beds24-webhook-sample.json` — Booking.com 채널 v2 payload 샘플 (propName, unitName 포함)
- `scripts/dev/beds24-webhook-airbnb-sample.json` — Airbnb 채널 v2 payload 샘플 (이름 필드 없이 ID만)
- `scripts/dev/beds24-webhook-test.sh` — curl로 로컬 dev 서버에 테스트 POST하는 스크립트

사용법:
```bash
BEDS24_WEBHOOK_SECRET=<secret> bash scripts/dev/beds24-webhook-test.sh
```

두 샘플 모두 `minimumStay` 필드 없음 — 실제 webhook payload에 없는 것을 의도적으로 반영.

`npm run lint` and `npm run build` pass.

## 2026-05-26 Phase 10 — 예약 fetch window 운영 기준으로 수정

### 문제 정의

기존 `/mobile/calendar` page.tsx는 `selectedMonth` 기준 1개월 범위만 쿼리했음:

```
check_in_date  < nextMonthStart   (선택 월의 다음달 1일)
check_out_date >= monthStart      (선택 월 1일)
```

결과:
- 현재 월(5월)을 보는 동안 6월 예약이 전혀 조회되지 않음
- 운영 기준인 "현재월 + 다음월 2개월 뷰"와 불일치

### 수정 내용

**`src/app/mobile/calendar/page.tsx`:**

- `[year, month]` / `nextMonthStart` 변수 제거 (selectedMonth 기반 — 더 이상 불필요)
- 운영용 fetch window를 `today` 기준으로 별도 계산:
  - `currentJstMonth = today.slice(0, 7)` — 오늘이 속한 월
  - `operationalMonthStart = "YYYY-MM-01"` — 현재월 1일
  - `operationalWindowEnd = "YYYY-MM-01"` — 다다음달 1일 (exclusive)
- reservations query를 운영 window로 교체:
  - `check_in_date < operationalWindowEnd`
  - `check_out_date >= operationalMonthStart`
- `roomSourceDebug`에 `fetchWindow: { from, to }` 필드 추가 (dev debug용)

**`src/components/calendar/mobile-calendar-view.tsx`:**

- `roomSourceDebug` 타입에 `fetchWindow?: { from: string; to: string }` 추가
- debug 카드에 `fetch: YYYY-MM-DD → YYYY-MM-DD` 한 줄 추가

### 최종 fetch window 규칙

| 항목 | 값 |
|---|---|
| `operationalMonthStart` | 오늘이 속한 월의 1일 (JST 기준) |
| `operationalWindowEnd` | 다다음달 1일 (exclusive) |
| 대상 예약 | 현재 투숙 중 + 이번달 + 다음달 |
| selectedMonth와의 관계 | 독립 — UI 탐색용, fetch 범위에 영향 없음 |

### UI 의미 정리

| 탭/섹션 | 기준 |
|---|---|
| Overview (바 렌더링) | `selectedMonth` 기준 날짜축 — 선택 월만 그림 |
| 바 데이터 source | 2개월 운영 fetch 결과 (selectedMonth 무관) |
| Lists — Check-in Today | `today` 기준 (선택 월 무관) |
| Lists — Check-out Today | `today` 기준 (선택 월 무관) |
| Lists — Staying Today | `today` 기준 (선택 월 무관) |
| Empty Today / Occupied | `today` 기준 (선택 월 무관) |

### 현재 제한사항 (문서화)

- 사용자가 운영 window 밖의 월(예: 7월 이후)로 이동하면 Overview 바가 빈 상태로 표시됨.
- MVP는 full historical/future browser가 아님. 이 제한은 의도적으로 남김.
- 제품 문서 "current month + next 2 months"는 aspirational 요구사항이며, 현재 MVP 구현은 current month + next month (총 2개월)임.

`npm run lint` and `npm run build` pass.

## 2026-05-26 Phase 10 — 월 탐색 범위 밖(Out-of-Window) 예약 비노출 및 안내 개선

### 문제 정의

- 사용자가 운영 fetch window(현재월+다음월, 총 2개월) 밖인 월(예: 7월)로 이동했을 때, 6월 말 체크인 후 7월 투숙이 지속되는 예약의 일부가 7월 화면에 부분 노출되는 현상이 있었음.
- 이는 사용자에게 "7월 예약 전체가 정상 조회되는 중이나 다른 예약이 없는 상태"라는 오해를 줄 위험이 큼.

### 수정 내용 (Option A 채택)

- **`src/components/calendar/mobile-calendar-view.tsx`:**
  - `isOutOfWindow` 판단 로직 구현: `selectedMonth`가 현재월(JST)과 다음월이 모두 아니면 범위 밖으로 감지.
  - `effectiveReservations = isOutOfWindow ? [] : reservations` 파생 상태 적용. 범위 밖에서는 캘린더 그리드(`activeInRange`) 및 오늘의 리스트(`checkInsToday`, `checkOutsToday`, `stayingToday`)에 사용하는 예약 데이터를 의도적으로 빈 배열로 완전 격리하여 부분 데이터 노출을 원천 방지함.
  - `mode === "overview"` 렌더링 수정: 네비게이션 헤더는 유지하되, 달력 그리드 영역 대신 다국어 경고 안내 카드 노출.
  - `mode === "lists"` 렌더링 수정: 범위 밖 진입 시 리스트 영역 대신 동일한 다국어 경고 안내 카드 노출.
  - `roomSourceDebug` 컴포넌트의 유니코드 `→` 화살표 구분자가 환경에 따라 깨져 보이는 문제를 해결하기 위해 표준 `->`로 정리하고 `(exclusive)` 표기를 명확히 함.
- **`src/app/mobile/calendar/page.tsx`:**
  - 다국어 키인 `calendarOutOfWindowTitle` 및 `calendarOutOfWindowBody`를 뷰의 `copy` Prop에 주입.
- **`src/lib/i18n.ts`:**
  - 한국어(`ko`), 일본어(`ja`), 영어(`en` / `FALLBACK_DICTIONARY`)에 새로운 경고용 안내 제목 및 본문 번역 키 추가.

`npm run lint` and `npm run build` pass.

## 2026-05-26 Phase 10 — 코드리뷰 잔여이슈 정리 (P2/P3 완결)

### P2: 서버 단 out-of-window query skip

**문제:** `selectedMonth`가 운영 window 밖이어도 서버에서 reservations query가 항상 실행된 뒤 클라이언트에서 빈 배열로 처리했음 → 불필요한 DB 조회.

**해결:**
- `src/app/mobile/calendar/page.tsx`: `nextJstMonth` + `isOutOfWindow` 계산을 Supabase client 생성 전에 배치. `isOutOfWindow === true`이면 reservations query 완전 skip, `reservations = []` 초기화. `getActiveRoomLabels`는 out-of-window 여부와 무관하게 항상 호출 (debug 정보 일관성 + room-source 상태 유지).
- `roomSourceDebug`에 `reservationsQuery: "skipped" | "executed"` 필드 추가. `?debug=rooms` dev mode에서 쿼리 실행 여부 확인 가능.

### P2: 클라이언트 isOutOfWindow 판단 단일화

**문제:** `mobile-calendar-view.tsx`에서 `isOutOfWindow` useMemo가 서버 계산과 동일한 로직을 중복 실행 → 단일 source 아님.

**해결:**
- `src/components/calendar/mobile-calendar-view.tsx`: `MobileCalendarViewProps`에 `isOutOfWindow: boolean` prop 추가. 기존 `isOutOfWindow` useMemo 제거. 서버에서 전달된 값을 그대로 사용.
- `effectiveReservations = isOutOfWindow ? [] : reservations` 방어 가드는 유지 (서버가 이미 `[]`를 전달하지만 명시적 의도 표현).
- `roomSourceDebug` 타입에 `reservationsQuery?: "executed" | "skipped"` 추가.

### P3: 문서 어휘/범위 정합성 정리

**확정 정책 (변경 없음):** 2개월 운영 window (현재월 + 다음월). out-of-window 월은 서버 단에서 query skip + UI 안내 배너.

**문서 변경:**
- `docs/product/15-reservation-calendar.md`: Out-of-Window Policy 설명을 서버 query skip 반영하여 업데이트. "Future / Post-MVP: Extending the Window" 섹션 신설 — 3개월 이상 확장은 별도 product 결정이 필요한 post-MVP 항목임을 명시.
- `docs/engineering/06-implementation-plan.md`: Phase 10 Remaining을 "MVP backlog"와 "Post-MVP / Optional"로 분리. "Extend fetch window to 3 months (aspirational)" 항목을 MVP backlog에서 분리하여 post-MVP 섹션으로 이동.
- 두 문서 모두 현재 확정 2개월 정책과 향후 확장 backlog를 별도 섹션으로 분리하여 혼동 제거.

### 수정 파일

- `src/app/mobile/calendar/page.tsx` — 서버 단 isOutOfWindow + query skip + isOutOfWindow prop 전달
- `src/components/calendar/mobile-calendar-view.tsx` — isOutOfWindow prop 수신 + useMemo 제거 + roomSourceDebug 타입 확장
- `docs/product/15-reservation-calendar.md` — Out-of-Window Policy 업데이트 + Post-MVP 섹션 추가
- `docs/engineering/06-implementation-plan.md` — Phase 10 Remaining 분리 + 이번 턴 변경사항 추가
- `docs/planning/06-current-status.md` — 이번 턴 변경사항 추가

`npm run lint` and `npm run build` pass.






## 2026-05-26 Mobile Calendar Building Filter (implemented)

- `/mobile/calendar` now renders building filter chips from active room-master/reservation data.
- Building selection is stored in `property` query and preserved while moving month prev/next.
- Room timeline axis and lists are filtered consistently by selected building.
- Current UI building order is pinned for operations:
  - 아라키초A, 아라키초B, 가부키초, 다카다노바바, 오쿠보A, 오쿠보B, 오쿠보C

## 2026-05-26 Real Reservation Bars Bootstrap

- Added a dev bootstrap path to populate real reservation bars immediately:
  - `POST /api/dev/beds24/backfill-reservations`
  - fetches Beds24 bookings for current+next month operational window
  - upserts into `reservations` so `/mobile/calendar` shows real bars without waiting for webhooks

## 2026-05-26 Calendar load hardening (active rooms only)

- `/mobile/calendar` reservation mapping now filters by active `roomMasterRooms` in authoritative mode.
- Operational effect: buildings with dual Beds24 room-id sets (e.g. 아라키초A/가부키초/오쿠보C) only show reservations tied to the active room-id set (`minimumStay < 50`).

## 2026-05-27 Documentation Governance Update

- Team rule is now explicit: when project behavior/policy changes, related Markdown docs must be updated first (or at minimum closed in the same cycle before completion).
- Coding rule is now explicit: implementation must follow the defined project workflow, not bypass it for speed.
- Source docs updated in this cycle:
  - `docs/planning/05-ai-collaboration-rules.md`
  - `docs/planning/04-project-workflow.md`
  - `docs/product/16-mobile-navigation.md`
  - `docs/product/15-reservation-calendar.md`

## 2026-05-26 Room label canonicalization (ops-specific)

- Added property-aware room-label canonicalization for mobile calendar rendering.
- Canonicalization is display-level only; active/inactive room-id eligibility still follows room master (`minimumStay < 50`).
- Effect: duplicate room-id aliases no longer split one physical room into multiple rows.

## 2026-05-26 Room-key collision fix

- Fixed mobile calendar building filter bug where same canonical room labels across different buildings collided (`roomLabel` key-only mapping).
- Calendar now uses property-scoped canonical room sets (`property -> [rooms]`) to render room axis.
- Result: Arakicho A/B no longer hide rooms due to cross-building key overwrite.

## 2026-05-26 Reservation room-label recovery

- Added room-label recovery logic when reservation `room_label` is polluted (e.g. `1`, property name).
- Recovery order: reservation room label -> raw payload unit/room name -> raw payload unit/room ID (`external_room_id`) -> single-room fallback.
- Recovered labels are validated against active room-master labels per property before rendering.

## 2026-05-26 Arakicho A inactive-alias overlap fix

- Root cause: inactive room-id aliases (e.g. `201_2`) were allowed to fall back through digit-collapsed labels (`201`) after canonicalization, so inactive reservations could render on the active room row and look overlapped.
- Fix: keep Arakicho A/B display canonicalization collapsed to the physical room label (`201_2` -> `201`), but in authoritative mode require reservation payload `roomId`/`unitId` to exist in the active room catalog before it can render.
- Result: inactive alias rows do not appear, and inactive room-id reservations no longer merge into active rows.

## 2026-05-26 Arakicho A 201 overlap root-cause fix

- Root cause: legacy/manual test rows for `Taro Yamada` had `room_label = 201` and no raw Beds24 room identity, so they bypassed external room-id validation and rendered under the real `Marc Sofilos` booking on the same row/date range.
- Fix: in authoritative mode, reservation rendering no longer trusts DB `room_label` alone. A reservation must resolve through raw payload room identity (`roomId`/`unitId`) or payload display label that matches the active room catalog.
- Result: raw-payload-less legacy seed rows no longer overlap real Beds24 bookings in the mobile calendar.

## 2026-05-26 Phase 10 — 오늘 날짜 하이라이트 정렬 수정 + auto-scroll

### 원인
본문 컨테이너에 `p-1`(4px 수평 패딩)이 있어 room row 내부 좌표가 4px 우측으로 어긋남 → 헤더 today 셀과 본문 today stripe의 x가 불일치.

### 수정
- 본문 컨테이너 `p-1` → `py-1`: 수평 패딩 제거로 헤더 셀 x와 바/하이라이트 x 완전 정렬
- `dates.indexOf(today)` → `dates.findIndex((date) => date === today)`: 의도 명확화
- 가로 스크롤 컨테이너에 `ref={scrollRef}` 추가
- `useEffect` auto-scroll 구현:
  - 의존 배열: `[mode, isTodayInView, todayIndex, selectedMonth, selectedProperty]`
  - `mode !== "overview"` 이거나 `!isTodayInView` 이면 no-op
  - `Set<string>` 기반으로 `selectedMonth:selectedProperty` key 추적 → 세션 내 같은 조합은 1회만 실행
  - `scrollLeft = max(0, todayIndex - 1) * DAY_WIDTH`: 전날도 함께 보이도록 1일 앞에서 시작
- `useEffect`, `useRef` import 추가

수정 파일: `src/components/calendar/mobile-calendar-view.tsx`

`npm run lint` and `npm run build` pass.

## 2026-05-26 Phase 10 — today 정렬 기준 단일화 + source canonical + Beds24 운영 문서 보강

### 1) 모바일 캘린더 today 정렬 기준 단일화

- `src/components/calendar/mobile-calendar-view.tsx`
  - 날짜 열 기준폭 단일화: 헤더 날짜 셀과 본문 highlight/bar 계산이 모두 `DAY_WIDTH`를 사용하도록 정리.
  - `todayIndex` 계산을 `dates.findIndex((date) => date === today)`로 명시.
  - 헤더/본문 모두 `index * DAY_WIDTH` 좌표를 공유하도록 구성.
  - 룸 라벨 고정열은 `ROOM_LABEL_WIDTH` 상수로 분리하고, 스크롤 영역은 date-grid 좌표계만 사용하도록 명확화.
  - overview 최초 진입 auto-scroll은 기존 정책 유지:
    - target index: `max(todayIndex - 1, 0)`
    - scroll left: `targetIndex * DAY_WIDTH`
    - `selectedMonth:selectedProperty` 조합당 1회만 실행.

### 2) Beds24 reservation source canonicalization (중복 방지)

- 새 helper: `src/lib/beds24/source-normalization.ts`
  - `booking`, `booking.com`, `Booking.com` -> `Booking.com`
  - `airbnb`, `Airbnb` -> `Airbnb`
  - `api`, `API` -> `API`
  - 그 외 -> `trim` 원본 유지
- 적용:
  - `src/lib/beds24/reservations-backfill.ts`
  - `src/app/api/beds24/webhook/route.ts`
- 효과: upsert conflict key `organization_id, source, source_reservation_id`의 source 축 흔들림 완화.

### 3) Beds24 linked properties + webhook/backfill 역할 문서 보강

- `docs/engineering/01-beds24-integration.md`
  - linked properties 기본 비활성 리스크 명시
  - 토큰 체크리스트 추가:
    - bookings
    - bookings-personal
    - inventory
    - properties
    - Allow linked properties
  - 웹훅(실시간 반영) vs 백필(초기 적재/누락 복구/운영 구간 재동기화) 역할 분리
  - 예약 누락 시 점검 순서(토큰 scope -> webhook -> backfill) 추가
- `docs/engineering/07-environment-setup.md`
  - Beds24 token scope 체크리스트에 linked properties 항목 포함
  - 토큰 갱신 직후 검증 포인트 추가:
    - `GET /v2/properties?includeAllRooms=true` linked property 노출 확인
    - 운영 overlap bookings 조회에서 linked property 예약 노출 확인
    - 누락 시 코드보다 token scope(`Allow linked properties`) 우선 점검

## 2026-05-26 Beds24 webhook vs backfill 책임 분리 명문화

- MVP 신뢰 모델:
  - webhook = 실시간 반영 레이어 (신규/변경/취소 이벤트 freshness)
  - backfill = 보정 레이어 (초기 적재 + 누락 복구 + 운영 overlap 재동기화)
  - 캘린더 완전성은 webhook 단독으로 100% 보장하지 않으며 backfill이 필수
- 장애 대응 분기:
  1. linked properties 포함 token scope 확인
  2. 최신 예약 누락이면 webhook 경로 우선 점검
  3. 과거/겹침 구간 누락이면 backfill overlap/pagination 우선 점검

## 2026-05-26 Beds24 치명 이슈 3건 보강

### 1) backfill pagination partial failure 비성공 처리

- `src/lib/beds24/reservations-backfill.ts`
  - `nextPageLink` 체인 중간 페이지 실패 시 단순 `break`로 부분 row를 성공 처리하지 않도록 수정.
  - 반환 타입에 `partial`, `failedPageUrl` 추가.
  - partial일 때는 rows를 성공 처리하지 않고 skipped reason에 partial failure를 포함.
- `src/app/api/dev/beds24/backfill-reservations/route.ts`
  - 응답에 `mode: success | partial_failure | no_data` 추가.
  - partial failure는 `ok: false`로 노출하여 운영자가 정상 성공으로 오해하지 않게 함.

### 2) webhook numeric room_label 오염 차단

- `src/app/api/beds24/webhook/route.ts`
  - payload room label 후보에서 `unitId`/`unit_id`/`roomId`/`room_id` 제거.
  - numeric ID-like label은 room sync 입력에서 제거해 room master 오염 차단.
  - existing room lookup(`external_room_id`)이 있으면 해당 `room_label` 사용.
  - lookup/label 모두 없을 때도 reservation upsert는 유지(안전 fallback label + raw payload 저장), room master 신규 오염 row는 생성하지 않음.
- `src/lib/beds24/room-sync.ts`
  - `extractBeds24RoomSyncFields().roomLabel`에서 numeric-ID fallback 제거.

### 3) source canonical policy 확장

- `src/lib/beds24/source-normalization.ts`
  - known canonical 추가: `Direct`, `Agoda`.
  - unknown source도 casing 정규화하여 dedupe key 흔들림 완화(`foo`/`FOO`/`Foo` 통합).
- backfill/webhook 모두 동일 helper를 계속 사용.

### 추가 sanity check 결과

- `reservations-backfill.ts`: `externalRoomId`는 여전히 `roomId` 우선, `unitId` fallback 유지.
- `recoverReservationsRoomLabels()`: 여전히 `roomId` 우선, `unitId` fallback 유지.
- 캘린더 UI 파일 변경 없음 (`mobile-calendar-view.tsx` 영향 없음).

## 2026-05-26 Phase 10 — 모바일 캘린더 overview 가독성 개선 + 오늘 날짜 하이라이트

### 변경 내용

**`src/components/calendar/mobile-calendar-view.tsx`:**

- 행 높이 `h-8`(32px) → `h-10`(40px): 헤더, 룸 라벨, 예약 행 모두 동일하게 적용
- 최대 높이 `max-h-[460px]` → `max-h-[560px]`: 행이 커진 만큼 보이는 룸 수 유지
- 날짜 헤더 폰트 `text-[10px]` → `text-[11px]`: 날짜 숫자 가독성 향상
- 룸 라벨 폰트 `text-[11px]` → `text-xs`(12px), `text-muted-foreground` → `text-foreground/70`: 대비 향상
- 예약바 `top-1 h-6`(24px) → `top-1.5 h-7`(28px): 게스트 이름 잘림 감소, 여백 확보
- **오늘 날짜 세로 하이라이트**: `today` prop(server에서 Asia/Tokyo 기준 계산) 기반 — 클라이언트에서 재계산 없음
  - 헤더 오늘 셀: `bg-orange-200/50 text-orange-600 font-bold` (dark: `bg-orange-500/25 text-orange-400`)
  - 본문 각 룸 행: `pointer-events-none absolute` div로 `bg-orange-200/30` (dark: `bg-orange-500/15`) 스트라이프 — 예약바 DOM 앞에 배치하여 예약바가 위 레이어로 렌더됨

`npm run lint` and `npm run build` pass.

## 2026-05-26 Phase 10 — 월 마지막 날짜 예약바 off-by-one 수정

### 원인

`mobile-calendar-view.tsx`에서 바 width 계산의 end clamp 값이 `rangeEnd = dates.at(-1)` (inclusive 마지막 날, 예: "2026-05-31")이었음. `check_out_date`는 exclusive semantics인데 `end = min(checkOutDate, "2026-05-31")` 처리하면 `widthDays = May31 - May29 = 2`가 되어 31일 칸이 렌더에서 누락됨.

### 수정

- `rangeEnd` 삭제 → `rangeEndExclusive = "${nextMonth}-01"` (예: "2026-06-01")으로 교체
- `activeInRange` 필터: `checkInDate <= rangeEnd` → `checkInDate < rangeEndExclusive`
- 바 width: `end = min(checkOutDate, rangeEnd)` → `endExclusive = min(checkOutDate, rangeEndExclusive)`
- `widthDays = (endExclusive - start) / 1day`

수정 파일: `src/components/calendar/mobile-calendar-view.tsx`

`npm run lint` and `npm run build` pass.

## 2026-05-26 Phase 10 — 아라키초A 예약바 미표시 원인 수정

### 근본 원인

권위 모드(authoritative mode)에서 `resolveReservationCanonicalRoomLabel`이 두 가지 경로에서 실패하여 예약바가 `activeCanonicalRoomSet`에서 탈락했음:

1. **property-name 정규화 실패**: Beds24가 일본어 property name(예: "荒木町A")을 전송하면 `getCanonicalPropertyName()`이 인식하지 못해 `"荒木町A"`를 그대로 반환 → `canonicalRoomLabelsByProperty["荒木町A"]` = undefined → `allowed = new Set()` → 모든 `allowed.has()` 체크 실패.

2. **externalRoomId 글로벌 fallback 부재**: property-name mismatch로 `externalRoomToCanonicalByProperty[wrongKey]`도 실패 → 4단계 resolver 모두 실패 → 최종 `fromReservation` 반환 (property를 모르면 room label 정규화도 틀림) → `activeCanonicalRoomSet.has()` false → 예약 누락.

### 수정 내용

**`src/lib/room-label-normalization.ts`:**
- 각 property recognizer 함수에 일본어 한자 alias 추가:
  - `isArakichoA`: `"荒木町a"` 추가
  - `isArakichoB`: `"荒木町b"` 추가
  - `isKabukicho`: `"歌舞伎町"` 추가
  - `isTakadanobaba`: `"高田馬場"` 추가
  - `isSano`: `"佐野"` 추가
  - `isOkuboA`: `"大久保a"` 추가
  - `isOkuboB`: `"大久保b"` 추가
  - `isOkuboC`: `"大久保c"` 추가
- `normalizeKey()`가 `.toLowerCase()`를 적용하므로 alias는 소문자 형태로 저장

**`src/app/mobile/calendar/page.tsx`:**
- `globalExternalRoomToCanonical` Map 추가: rooms catalog의 externalRoomId → canonicalRoomLabel 전체 매핑 (property-name 무관, org 전체)
- `resolveReservationCanonicalRoomLabel` step 3에 글로벌 fallback 추가: property-specific lookup 실패 시 globalExternalRoomToCanonical으로 재시도; `allowed.has()` 체크 없음 — catalog가 이미 authoritative
- `payloadUnitName` alias에 `"unitLabel"`, `"unit_label"`, `"room_label"` 추가 (Beds24 payload 필드명 변형 대응)
- 예약 매핑 중복 제거: `mappedReservations` + authoritative 재매핑 패턴 → `filteredRows` + `mapToCalendarItem` 헬퍼 + 단일 `resolved` 패스로 리팩터
- dev-only 서버 진단 로그 추가: `process.env.NODE_ENV === "development"` 블록에서 rawDbCount, afterExclusionFilter, afterMapping, afterActiveFilter, activeCanonicalRoomSet, failedSamples(최대 5개) 를 JSON으로 출력

**`scripts/dev/debug-calendar-recovery-arakicho-a.js`** (신규):
- `.env.local` 파싱 후 Supabase REST API 직접 호출 (npm 의존성 없음)
- 아라키초A 활성 rooms → activeCanonicalSet + externalRoomToCanonical Map 구성
- 해당 운영 window의 아라키초A 예약 목록 조회
- 각 예약에 대해 directMatch(정규화 일치) / globalMatch(externalId 일치) / recovered 결과 출력
- JSON 리포트: succeeded/failed count + failedSamples(최대 10개) + succeededSamples(최대 5개)

### 수정 파일

- `src/lib/room-label-normalization.ts` — 일본어 한자 alias 추가 (8개 함수)
- `src/app/mobile/calendar/page.tsx` — globalExternalRoomToCanonical + 글로벌 fallback + alias 추가 + 리팩터 + dev 로그
- `scripts/dev/debug-calendar-recovery-arakicho-a.js` — 신규 진단 스크립트

`npm run lint` and `npm run build` pass.

## 2026-05-26 Reservation recovery root cause fix

- The reservation recovery path was updated to consume `unitId` as well as `roomId` when repairing broken Beds24 reservation room labels.
- This is required because many real Beds24 bookings in the current account store room identity in `unitId` only.

## 2026-05-26 Phase 10 — Mobile calendar overview grid and bar polish

**Changes in `src/components/calendar/mobile-calendar-view.tsx`:**

- **Vertical grid lines lightened**: `rgba(0,0,0,0.10)` → `rgba(0,0,0,0.06)` — visible but not distracting.
- **Horizontal room row separators added**: `border-b border-border/20` on each room row div (right body) and each room label div (left column). Previously only vertical column dividers existed; horizontal separators now delineate rooms clearly.
- Row gap (`space-y-1`) and container vertical padding (`py-1` / `p-1`) removed from both sides — rows stack directly separated by borders only.
- **Reservation bars pill-shaped**: `rounded-md` → `rounded-full`, size adjusted `top-1.5 h-7` → `top-2 h-6`, padding `px-1` → `px-1.5`. Full capsule shape reduces visual crowding between adjacent bars.

**lint**: clean. **build**: clean.

## 2026-05-26 Phase 10 — Mobile reservation detail modal redesign

- `src/components/calendar/mobile-calendar-view.tsx` reservation detail bottom sheet was redesigned to an information-first Liquid Glass layout:
  - header (status badge, guest name, reservation ID, close)
  - property/room summary cards
  - check-in/check-out timeline card
  - phone/contact card (copy + call actions)
- Removed modal bottom actions:
  - `Message Guest`
  - `Manage Booking`
- Missing-data policy applied:
  - guest count is not rendered when unavailable
  - phone missing state keeps existing localized fallback and disabled actions
  - check-in/check-out times now use operating defaults (`10:00`, `16:00`)
- i18n cleanup (`src/lib/i18n.ts`, ko/ja/en):
  - removed unused message/manage booking keys
  - added modal label keys: check-in, check-out, property, room, reservation ID
- mobile calendar page wiring updated (`src/app/mobile/calendar/page.tsx`) to pass new dictionary keys into `MobileCalendarView` copy props.

## 2026-05-26 Beds24 multi-room reservation persistence

- Same reservation ID may legitimately appear on multiple Beds24 room rows.
- StayOps now persists reservation rows per room assignment, not per reservation ID only.
- Upsert key changed from:
  - `organization_id, source, source_reservation_id`
  to:
  - `organization_id, source, source_reservation_id, room_label`
- Impact:
  - the same guest/reservation can appear on `301` and `401` simultaneously when Beds24 does so
  - mobile overview room timeline will no longer look missing for these cases
  - follow-up UX policy may still be needed for list views if one reservation spans multiple rooms

## 2026-05-26 Beds24 multi-room reservation persistence (compatible rollout)

- Same reservation ID may legitimately appear on multiple Beds24 room rows.
- Because the current DB unique key is still `organization_id, source, source_reservation_id`, StayOps now stores a room-assignment storage key in `source_reservation_id`:
  - `"{originalReservationId}::room::{room_label}"`
- Impact:
  - the same guest/reservation can appear on `301` and `401` simultaneously when Beds24 does so
  - mobile overview room timeline no longer looks missing for these cases
  - UI detail surfaces must display the original reservation ID from raw payload (or de-suffixed value), not the storage key

## 2026-05-26 Beds24 webhook-only freshness + mobile realtime refresh

- Reservation freshness baseline changed to webhook-first in practice and webhook-main in operations.
- `src/components/calendar/mobile-calendar-live-view.tsx` added: subscribes to Supabase Realtime on `public.reservations` filtered by `organization_id`, then debounced `router.refresh()` updates the open mobile calendar automatically.
- `src/app/mobile/calendar/page.tsx` now renders the live wrapper so users no longer need manual reload after a webhook-written reservation change.
- Backfill remains in the repo as a manual/dev recovery path, but it is no longer the intended source of day-to-day freshness.
- Added migration `supabase/migrations/202605260002_enable_reservations_realtime.sql` so `public.reservations` is included in `supabase_realtime` publication.

## 2026-05-26 Beds24 cancelled webhook immediate reflection hardening

- `src/app/api/beds24/webhook/route.ts`
  - status normalization hardened for cancellation-family payloads:
    - numeric text (`"0"`) and channel-specific cancellation text are mapped to `cancelled`
    - `no_show` policy unchanged (kept as `no_show`)
  - cancel-event fallback update path added:
    - when cancel payload does not carry room identity, existing rows are found by original reservation id (`exact` + `::room::` suffix pattern)
    - matched rows are updated to `status='cancelled'` to avoid stale confirmed duplicates
  - minimal dev logging added for cancel processing (`sourceReservationId`, `resolvedRoomLabel`, `mappedStatus`, `updatedRows`)
- `src/components/calendar/mobile-calendar-live-view.tsx`
  - realtime refresh timing hardened:
    - hidden-tab reservation events are queued
    - queued refresh runs immediately when visibility returns to `visible`
    - open calendar still refreshes on `event: "*"` updates without manual reload
- Added dev fixture:
  - `scripts/dev/beds24-webhook-cancelled-sample.json`
- Local webhook verification log confirmed:
  - cancel webhook updated existing reservation row (`updatedRows: 1`)
  - follow-up `/mobile/calendar` server render count decreased (`rawDbCount` 637 -> 636), matching cancellation exclusion policy.

## 2026-06-02 Beds24 webhook/cancel/calendar consistency alignment

- Webhook processing is no longer described accurately as a single large route-only implementation.
- Current structure:
  - `src/app/api/beds24/webhook/route.ts`
    - secret verification
    - body parsing
    - batch payload orchestration
  - `src/lib/beds24/booking-payload.ts`
    - strict backfill extractor
    - relaxed webhook extractor for sparse cancellation payloads
  - `src/lib/beds24/process-webhook-booking.ts`
    - single-booking processing
    - room sync / inventory sync
    - cancelled-booking handling
  - `src/lib/beds24/reservation-lookup.ts`
    - source-agnostic original-booking lookup
    - cancel consistency cleanup
- Cancellation policy update:
  - booking identity is anchored on `toOriginalReservationId(...)`, not on the normalized channel source
  - cancellation lookup must match:
    - exact original booking id
    - `originalId::room::*` room-assignment rows
  - stale active or `(unknown)` duplicate rows are cleaned after cancel processing
- Sparse cancellation webhook update:
  - webhook extraction now accepts cancellation payloads that contain a booking id plus cancellation signals even when stay dates are omitted
  - if no local row exists and the payload is too sparse to create a meaningful cancelled row, the processor returns a successful no-local-row outcome instead of creating a bad duplicate
- Calendar room-axis update:
  - internal room identity and display room label are now separated
  - Arakicho internal keys preserve distinct units such as `301`, `301_2`, `A301`, `A301_2`
  - display rows strip numeric `_N` suffixes only:
    - `402` + `402_2` -> display row `402`
    - `A301` + `A301_2` -> display row `A301`
    - `A301` and `301` remain separate rows
- Clarification:
  - the earlier note saying the DB upsert key changed to `(organization_id, source, source_reservation_id, room_label)` is not the current implementation
  - the effective live strategy is still the compatible rollout:
    - DB uniqueness remains `(organization_id, source, source_reservation_id)`
    - room assignment identity is encoded into `source_reservation_id` as `"{originalReservationId}::room::{room_label}"`

## 2026-05-26 Map tab — building directory + filter chip hide

- `/mobile/calendar` Map tab placeholder replaced with a Liquid Glass building card list (`src/lib/property-map-links.ts`).
- Building filter chip row (`아라키초A / 아라키초B / …`) has been superseded by the dedicated building picker entry screen. The calendar view now shows a compact selected-building card with a change action instead of horizontal chips.
- `src/lib/property-map-links.ts`: `PROPERTY_MAP_META` with 7 buildings, `kind: "hotel" | "house"`, address/URL fields, shared access codes, and optional room access codes.
- i18n: `calendarMapAddressMissing`, `calendarMapOpenInMaps` added to ko/ja/en.
- Airbnb bar color darkened: `bg-rose-400/90`, Booking bar: `bg-cyan-600/85`.

## 2026-05-28 Mobile calendar building picker

- `/mobile/calendar` without a `property` query now opens a building picker grid before showing reservation data.
- The building picker hero uses a Lottie animation asset (`src/assets/building-lottie.json`) instead of a CSS-drawn mascot.
- Selecting a building navigates to `/mobile/calendar?month=YYYY-MM&property=<building>`.
- Okubo properties use a detached-house icon; all other properties use a hotel/building icon.
- The selected-property calendar screen no longer renders the old horizontal building chip row.

## 2026-05-27 Mobile calendar selective Liquid Glass update

- `/mobile/calendar` visual surfaces were upgraded to the current selective Liquid Glass quality level.
- The shared `MobileShell` now provides the pure-white shell, scroll-aware top chrome, slide-out menu, and floating liquid-glass capsule bottom navigation. The `appearance` prop is not used for shell tinting.
- No feature/data/permission logic was changed; this cycle is UI-only.
- `src/components/calendar/mobile-calendar-view.tsx` now uses shared glass surface rules for:
  - segmented mode control and selected-building card
  - overview frame and list cards
  - reservation/map/empty bottom sheets
- Result:
  - stronger cross-tab family consistency
  - improved readability via clearer text contrast and spacing rhythm
  - preserved performance-friendly blur/shadow depth.

## 2026-05-26 Map tab — operational access hub completion

- `src/lib/property-map-links.ts` upgraded to canonical operational metadata model:
  - `address` (ko/ja/en)
  - `googleMapsUrl`
  - `sharedAccess[]`
  - optional `roomAccess[]`
  - `kind` icon hint (`hotel` / `house`)
- Real operational building data reflected for:
  - 아라키초A / 아라키초B / 가부키초 / 다카다노바바 / 오쿠보A / 오쿠보B / 오쿠보C
- `src/components/calendar/mobile-calendar-view.tsx` map UX upgraded:
  - card summary (address + counts) + dedicated "access info" action
  - bottom sheet with:
    - address copy
    - Google Maps open
    - shared access code list + per-code copy
    - room access code list + per-code copy
  - liquid-glass visual continuity maintained with existing mobile calendar style
- icon policy enforced:
  - houses (`오쿠보A/B/C`) use house icon
  - others use building/hotel icon
- map-related i18n keys expanded minimally across ko/ja/en for copy/access sheet labels and copy feedback.

## 2026-05-27 Cleaning card title locale fix

- Root cause: building section headers were localized, but each cleaning/setting card title still rendered `sessionRoomLabel` (canonical Korean-based storage label).
- Fix: `/mobile/cleaning` card title rendering now uses `getLocalizedRoomTitle(canonicalPropertyName, canonicalRoomLabel, copy)` in `src/app/mobile/cleaning/page.tsx`.
- Storage/action compatibility preserved: hidden form `roomLabel` still posts `sessionRoomLabel` to `startCleaningSession`.
- Additional cleanup:
  - `CANONICAL_TO_BUILDING_KEY` values restored from mojibake to proper canonical Korean names.
  - Next-check-in sublabel separator replaced with locale-safe delimiter (`|`) instead of hardcoded broken text.

## 2026-05-27 Mobile cleaning top KPI summary

- `/mobile/cleaning` top card switched from static copy to real-time KPI summary.
- KPI values now render from live data:
  - cleaning targets (`cleaningList.length`)
  - setting targets (`settingList.length`)
  - in-progress sessions (current user's `status=in_progress` count)
- `getCleaningTargets()` is now loaded regardless of active session state so KPI is always visible and consistent.
- Added i18n keys (ko/ja/en): `todayOpsTitle`, `kpiCleaningTargets`, `kpiSettingTargets`, `kpiInProgress`, `operatingDateLabel`.

## 2026-05-27 Remaining follow-up (cleaning queue)

- KPI scope is now org-wide for all three top summary metrics in `/mobile/cleaning`.
- Remaining technical risk reduced: resolver now covers catalog exact, canonical prefix, and normalized legacy aliases, plus dev warning telemetry; however, a small subset of non-deterministic historical labels can still be unresolved and skipped from `processedRoomKeys`.
- Operational follow-up: run `npm run cleaning:normalize-room-labels -- --org=<organization_id> --days=<N>` in dry-run first, then `--apply` to canonicalize old rows and reduce unresolved cases further.

## 2026-05-29 Mobile Home Screen — Error/Empty State Separation + Accessibility Fix

### 문제 정의

`/mobile` 홈 화면의 3개 데이터 섹션(체크인/체크아웃, 활성 청소 작업, 오늘 기록)에서 Supabase 조회 실패와 데이터 없음 상태가 동일하게 처리되고 있었음:
- 조회 실패(네트워크 오류, DB 에러)를 catch한 뒤 빈 값(0건, null, [])을 반환 → UI는 빈 상태로만 표시됨
- `error` 객체를 확인하지 않아 DB 에러가 조용히 묻힘

추가로 체크인/체크아웃 2개 카드 섹션의 `aria-label`이 "Check-ins"(단일 의미)로만 지정되어 있어 섹션 의미와 불일치.

### 수정 내용

**`src/lib/home.ts`:**
- `HomeResult<T>` discriminated union 추가: `{ status: "ok"; data: T } | { status: "empty" } | { status: "error" }`
- `getHomeCheckInOutCounts`: `HomeResult<HomeCheckInOutCounts>` 반환. supabase `error` 존재 → `error`. 성공 → `ok`.
- `getHomeTodayActivity`: `HomeResult<HomeActivityEvent[]>` 반환. 3개 Promise.all 중 하나라도 `error` → `error`. 이벤트 0건 → `empty`. 이벤트 있음 → `ok`.
- `getHomeActiveCleaningSession`: `HomeResult<HomeActiveSession>` 반환. supabase `error` → `error`. 세션 없음 → `empty`. 세션 있음 → `ok`.
- 모든 함수에서 platform org는 DB 쿼리 없이 `{ status: "empty" }` 즉시 반환. catch는 `{ status: "error" }` 반환.

**`src/app/mobile/page.tsx`:**
- 체크인/체크아웃 섹션 `aria-label`: `dictionary.admin.stats.checkIns` → `dictionary.mobile.homeStatsSectionLabel`.
- 3개 섹션 모두 `status` 기반 분기:
  - `"error"` → `homeSectionLoadError` 문구 표시 (섹션 단위, 앱 전체 에러 아님)
  - `"empty"` → 기존 empty 문구
  - `"ok"` → 기존 정상 데이터
- 체크인/체크아웃 error 상태: `col-span-2` 단일 에러 카드로 대체; empty 상태: "—" 표시.

**`src/lib/i18n.ts`:**
- `mobile.homeSectionLoadError` 추가 (ko/ja/en)
- `mobile.homeStatsSectionLabel` 추가 (ko/ja/en)

### 상태 분리 설계

| 함수 | ok | empty | error |
|---|---|---|---|
| `getHomeCheckInOutCounts` | `{ status:"ok", data:{checkIns,checkOuts} }` | platform org | supabase error / throw |
| `getHomeTodayActivity` | `{ status:"ok", data:events[] }` | platform org 또는 이벤트 0건 | 3개 쿼리 중 하나라도 error |
| `getHomeActiveCleaningSession` | `{ status:"ok", data:session }` | platform org 또는 세션 없음 | supabase error / throw |

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Home — Quick Actions 라우팅 연결

### 변경 내용

**`src/app/mobile/page.tsx`:**
- `quickActions` 문자열 배열 → `QuickActionItem[]` 메타 객체 배열로 교체 (`id`, `label`, `href`, `enabled`, `Icon` 포함)
- `enabled: true` 항목: `<Link>` + `<Card>` 구조로 전환 (`transition-opacity active:opacity-70` 탭 피드백 추가)
- `enabled: false` 항목: 클릭 차단, `aria-disabled="true"` / `tabIndex={0}` / `opacity-50` / `cursor-not-allowed` / `select-none` 적용
- 서브 라벨: enabled → `ready`, disabled → `homeQuickActionComingSoon`

**`src/lib/i18n.ts`:**
- `mobile.homeQuickActionComingSoon` 추가 (ko/ja/en)

### Quick Action 매핑

| id | label key | href | enabled |
|---|---|---|---|
| `cleaning` | `quickActions.cleaning` | `/mobile/cleaning` | ✓ |
| `maintenance` | `quickActions.maintenance` | `/mobile/maintenance/new` | ✓ |
| `lostItem` | `quickActions.lostItem` | `/mobile/lost-found/new` | ✓ |
| `order` | `quickActions.order` | `/mobile/requests` | ✓ (주문 화면 미구현 → 요청 목록으로 대체) |

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Requests — 상세 접근 정책 수정 + 카드 레이아웃 개선

### 변경 내용

**상세 페이지 org-scope 전환:**
- `/mobile/requests/lost-found/[id]/page.tsx`: `getMyLostItemById` → `getLostItemById` (org + id 스코프, reporter_name 포함)
- `/mobile/requests/maintenance/[id]/page.tsx`: `getMyMaintenanceReportById` → `getMaintenanceReportById` (동일 패턴)
- 상세 reporter 표시: `session.user.name` → `item/report.reporter_name || "—"` (실제 등록자 이름)

**카드 레이아웃 변경 (requests-filter-view.tsx):**
- 타입: `LostItemRow[]` → `LostItemWithReporter[]`, `MaintenanceReportRow[]` → `MaintenanceReportWithReporter[]`
- `LostFoundCopy` / `MaintenanceCopy` 타입에 `reporter: string` 추가
- 헤더 우측: 날짜(text-[11px]) + 상태 배지 (세로 스택)
- 메타라인: 건물 · 객실 → 건물 · 객실 · 등록자 이름 (날짜 제거, reporter 추가)
- `resolveRequestLocation` 중복 호출 → item당 1회로 통합

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Requests — 전체/내 등록 scope 토글

### 변경 내용

**`src/app/mobile/requests/page.tsx`:**
- `getMyLostItems` → `getOrgLostItems` (전체 org 데이터 fetch, 이미 존재하는 함수)
- `getMyMaintenanceReports` → `getOrgMaintenanceReports`
- `currentUserId={session.user.id}` + scope i18n 키 2개를 `RequestsFilterView`에 추가 전달

**`src/components/requests/requests-filter-view.tsx`:**
- `ScopeFilter = "all" | "mine"` 타입 추가
- `currentUserId: string` prop 추가
- `scopeFilter` state (기본값 `"all"`)
- `scopedLostItems` / `scopedMaintenance`: scope="mine"이면 `reported_by_user_id === currentUserId` 필터 적용, 이후 기존 status 필터 체인
- 필터 컨트롤 첫 행에 scope 토글 추가 (전체/내 등록)
- `FilterLabels` 타입에 `filterScopeMine`, `groupScope` 추가

**`src/lib/i18n.ts`:** `filterGroupScope`, `filterScopeMine` 추가 (ko/ja/en)

`npm run lint` and `npm run build` pass.

## 2026-05-29 Lost-Found + Maintenance — 건물 다국어화 + Maintenance 건물/객실 cascade

### 변경 내용

**`src/lib/room-label-normalization.ts`:** `localizePropertyName(canonicalPropertyName, buildingLabels)` export 추가. `CANONICAL_TO_BUILDING_KEY`로 building key 조회 후 `buildingLabels[key]`(= `dictionary.cleaning.buildingLabels`) 반환, 실패 시 canonical 이름 fallback.

**분실물 폼 (lost-found)**:
- `LostFoundCreateForm` + `LostFoundLinkedForm`: `buildingLabels: Record<string, string>` prop 추가. 건물 버튼/드롭다운 표시에 `localizePropertyName` 적용 (내부 state/submit은 canonical 유지).
- `lost-found/new/page.tsx`: `buildingLabels={dict.cleaning.buildingLabels}` 전달.

**수리 요청 폼 (maintenance) — 신규 건물+객실 cascade 도입**:
- `MaintenanceCreateForm` 전체 재작성: `roomOptions` → `roomCatalog + buildingLabels`. Section 1이 단순 텍스트 입력 → 건물(Building) 드롭다운 → 객실(Room) 드롭다운 cascade로 교체. canonical dedup 동일 적용.
- `MaintenanceLinkedForm` 전체 재작성: `roomOptions` → `roomCatalog + buildingLabels`. Section 1이 잠금 건물+객실 표시로 교체. `canonicalRoom = linkedItem.canonicalRoomLabel` 적용. 건물 표시에 `localizePropertyName` 적용.
- `maintenance/new/page.tsx`: `getActiveRoomCatalogServer` import 추가, catalog 로딩, 새 props 전달. `roomOptions` 제거.

**`src/lib/i18n.ts`:**
- maintenance.form: `building`, `buildingPlaceholder`, `roomPlaceholderSelectBuilding`, `roomPlaceholderSelectRoom`, `noRoomsInBuilding` 추가 (en/ko/ja).
- maintenance.errors: `missing_building`, `invalid_room` 추가 (en/ko/ja).

`npm run lint` and `npm run build` pass.

## 2026-05-29 Lost-Found New — Room Canonical Mapping 정합성 수정

### 문제

`/mobile/lost-found/new` 객실 목록이 `ActiveRoomCatalogItem.roomLabel`(raw DB 라벨) 기준으로 표시/제출되어, 동일 객실의 복수 raw 라벨이 중복 노출되고 캘린더와 불일치.

### 수정 내용

**`src/components/requests/lost-found-create-form.tsx`:**
- `availableRooms` 계산을 `roomLabel` 기준 filter/sort → `canonicalRoomLabel` 기준 dedup + sort로 교체.
- dedup 정책: 첫 등장 우선(캘린더와 동일). 결과 타입 `string[]` (canonical labels).
- 드롭다운 key, 선택값 비교, 클릭 핸들러, 표시 텍스트 모두 `canonicalRoomLabel` 사용.
- 기존 hidden input `roomLabel`은 `selectedRoom` state(이미 canonical)를 그대로 사용 → 서버 액션 계약 유지.

**`src/components/cleaning/lost-found-linked-form.tsx`:**
- `canonicalRoom = linkedItem ? linkedItem.canonicalRoomLabel : defaultRoom` 파생.
- hidden input `roomLabel`, 잠금 표시 라벨, `handleConfirm`의 `formData.set("roomLabel", ...)`, confirm modal 위치 행 모두 `canonicalRoom` 사용.
- 유효성 검사(`!defaultRoom`)는 기존 prop 기준 유지.

### 캘린더와 공유한 매핑 유틸

- `ActiveRoomCatalogItem.canonicalRoomLabel` — `src/lib/rooms.ts`의 `getActiveRoomCatalog`가 계산해 반환하는 canonical 라벨 (이미 캘린더가 room axis dedup에 사용)
- `getActiveRoomCatalogServer` — page에서 catalog 로드 (unchanged)

### raw → canonical → dedupe → display 흐름

```
catalog[].roomLabel (raw DB) 
  → catalogItem.canonicalRoomLabel 
    → dedup by Set<canonicalRoomLabel> (first-wins)
      → sort → display & submit
```

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Home — 업데이트 시각 자동 갱신 + 수동 새로고침 버튼 제거

### 변경 내용

**`src/components/mobile/home-last-updated-clock.tsx`** (신규):
- `"use client"` 컴포넌트. `useState(initialTime)` + `useEffect` 기반 60초 타이머.
- `msToNextMinute = 60000 - (Date.now() % 60000)` 으로 실제 시계 분 단위와 정렬 후 인터벌 시작.
- `getJstHHMM()`: `Intl.DateTimeFormat` Asia/Tokyo HH:MM 포맷 (서버 `formatActivityTimeJst`와 동일 로직).
- `getDictionary(locale)` 클라이언트 측 호출 (순수 함수, 서버 전용 코드 없음).
- 언마운트 시 `clearTimeout` + `clearInterval` cleanup 보장.
- `aria-live="polite"` 적용.

**`src/app/mobile/page.tsx`:**
- `HomeLastUpdatedClock` import 추가.
- 상단 "Last updated / Refresh" div → `<HomeLastUpdatedClock initialTime={lastUpdatedTime} locale={...} />` 교체.
- `homeRefresh`, `homeRefreshAriaLabel` 사용 제거 (버튼 삭제).
- `HomeRefreshButton` import는 유지 (error 상태 재시도 CTA에서 계속 사용).
- `lastUpdatedTime` 계산은 유지 (초기 값 prop으로 전달).

**`src/lib/i18n.ts`:**
- `homeRefresh`, `homeRefreshAriaLabel` 제거 (ko/ja/en).
- `homeRetry`, `homePullToRefresh`, `homeRefreshing`, `homeReleaseToRefresh` 유지.

### 자동 갱신 방식

`HomeLastUpdatedClock`이 마운트되면:
1. `(Date.now() % 60000)` 으로 현재 분의 경과 ms 계산
2. `setTimeout(msToNextMinute)` → 다음 정각 분에 첫 갱신
3. 이후 `setInterval(60000)` 으로 매 분 갱신
4. 서버/API 호출 없음 — `new Date()` + `Intl.DateTimeFormat` 클라이언트 연산만 사용

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Shell — Pull-to-Refresh

### 변경 내용

**`src/components/shell/mobile-shell.tsx`:**
- `useTransition` + `useRouter` 추가.
- 상수: `PULL_THRESHOLD=72`, `MAX_PULL=120`, `RESISTANCE=0.45`, `INDICATOR_REFRESH_H=48`
- 상태: `pullDistanceState`, `isPulling`, `isRefreshPending`(useTransition), `startRefreshTransition`
- refs: `touchStartYRef`, `touchStartXRef`, `isPullingRef`, `pullDistanceRef` — 렌더 외 로직용 ref, 이벤트 핸들러 stale closure 방지
- `syncPullDistance(v)` — ref + state 동시 갱신 헬퍼
- 파생값: `displayH`, `isReadyToRefresh`
- 터치 핸들러: `handleTouchStart`, `handleTouchMove`, `handleTouchEnd`
  - `handleTouchStart`: `scrollTop > 0`이거나 사이드바 열림이면 즉시 리턴. 멀티터치/가로 스와이프 무시.
  - `handleTouchMove`: `scrollTop > 0` 이면 pull 취소. 수직/수평 비교 후 가로 스와이프 무시. `deltaY > 0`이면 `isPullingRef = true`.
  - `handleTouchEnd`: `pullDistanceRef.current >= PULL_THRESHOLD`이면 `startRefreshTransition(() => router.refresh())`.
- 스크롤 컨테이너: `overscroll-y-contain` 추가 (브라우저 기본 PTR 억제), touch 핸들러 연결.
- 인디케이터: 스크롤 컨테이너 첫 자식. `height: displayH px`, `isPulling`일 때 transition 없음(손가락 추적), 아닐 때 `height 200ms ease-out`. 3단계 텍스트: pull / release / refreshing.

**`src/lib/i18n.ts`:** `homePullToRefresh`, `homeReleaseToRefresh`, `homeRefreshing` 추가 (ko/ja/en)

### 제스처 동작 요약

| 항목 | 값 |
|---|---|
| 임계값 (`PULL_THRESHOLD`) | 72 px (터치 원시 거리) |
| 최대 당김 (`MAX_PULL`) | 120 px |
| 저항값 (`RESISTANCE`) | 0.45 → 인디케이터 최대 높이 54 px |
| 새로고침 인디케이터 높이 | 48 px (고정) |
| 트리거 조건 | `scrollTop === 0` + 수직 드래그 + 단일 터치 + dist ≥ 72 |
| 취소 조건 | `scrollTop > 0`, 가로 스와이프, 멀티터치 |
| 중복 실행 방지 | `isRefreshPending` 가드 + `isPullingRef` ref 가드 |
| 적용 범위 | 모든 모바일 페이지 (`MobileShell` 공유) |

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Home — 데이터 신뢰도 UX

### 변경 내용

**`src/components/mobile/home-refresh-button.tsx`** (신규):
- `"use client"` 컴포넌트. `useRouter().refresh()` + `useTransition` 조합으로 `router.refresh()` 호출. 트랜지션 중 `disabled` → 중복 클릭 방지. 상단 새로고침 / 섹션 재시도 두 용도에서 공유.

**`src/app/mobile/page.tsx`:**
- `lastUpdatedTime = formatActivityTimeJst(new Date().toISOString())` — data fetch 직후 서버 렌더 시각 계산 (JST HH:MM).
- 히어로 아래 `[업데이트: HH:MM] [새로고침]` 행 추가.
- 체크인/체크아웃, Active Task, Today's Activity 3개 섹션 `status === "error"` 상태에 `homeRetry` CTA(`HomeRefreshButton`) 추가. empty 상태는 미변경.

**`src/lib/i18n.ts`:** 4개 키 추가 (ko/ja/en): `homeLastUpdated(time)`, `homeRefresh`, `homeRefreshAriaLabel`, `homeRetry`

### 재시도/새로고침 CTA 매핑

| 위치 | 라벨 키 | 동작 | 노출 조건 |
|---|---|---|---|
| 히어로 아래 우측 | `homeRefresh` | `router.refresh()` | 항상 |
| 체크인/체크아웃 섹션 | `homeRetry` | `router.refresh()` | `status === "error"` |
| Active Task 섹션 | `homeRetry` | `router.refresh()` | `status === "error"` |
| Today's Activity 섹션 | `homeRetry` | `router.refresh()` | `status === "error"` |

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Home — CTA 강화

### 변경 내용

**`src/app/mobile/page.tsx`:**

1. **공지 카드**: `<Card>` → `<Link><Card>` 로 전환. href: 공지 있으면 `/mobile/announcements/{id}`, 없으면 `/mobile/announcements`. 카드 하단 우측에 `homeAnnouncementViewDetail` 텍스트 CTA 추가. `aria-label`은 공지 제목 또는 공지 섹션 타이틀로 설정.

2. **Quick Actions**: `QuickActionItem` 타입에 `subLabel: string`, `primary?: boolean` 추가. 청소 액션은 `primary: true` 표시 → 아이콘 `bg-cyan-50 text-cyan-700`, 서브 라벨 `text-cyan-600`, 카드 보더 `border-cyan-100`. 서브 라벨: cleaning → `homeQuickActionStart`, 나머지 → `homeQuickActionGo`.

3. **Active Task empty 상태**: `homeActiveTaskStartCta` 링크(`/mobile/cleaning`) 추가. error 상태에는 CTA 없음.

4. **Today's Activity empty 상태**: `homeActivityStartCta` 링크(`/mobile/cleaning`) 추가. error 상태에는 CTA 없음.

**`src/lib/i18n.ts`:** 5개 키 추가 (ko/ja/en): `homeAnnouncementViewDetail`, `homeQuickActionStart`, `homeQuickActionGo`, `homeActiveTaskStartCta`, `homeActivityStartCta`

### CTA 매핑

| 위치 | 라벨 키 | href | 노출 조건 |
|---|---|---|---|
| 공지 카드 | `homeAnnouncementViewDetail` | `/mobile/announcements/{id}` or `/mobile/announcements` | 항상 |
| Quick Action: cleaning | `homeQuickActionStart` | `/mobile/cleaning` | enabled |
| Quick Action: 나머지 3개 | `homeQuickActionGo` | 각 라우트 | enabled |
| Active Task empty | `homeActiveTaskStartCta` | `/mobile/cleaning` | `status === "empty"` |
| Activity empty | `homeActivityStartCta` | `/mobile/cleaning` | `status === "empty"` |

`npm run lint` and `npm run build` pass.

## 2026-05-29 Mobile Home Activity — Room Label Localization

### 문제 정의

`/mobile` 홈 "오늘 기록" 타임라인의 이벤트 문구 안에서 건물/객실명(`room` 필드)이 DB에 저장된 한국어 canonical 표기(예: "아라키초A 301")로 고정되어 `ja`/`en` 사용자에게도 한국어로 노출되던 문제.

### 수정 내용

**`src/lib/room-label-normalization.ts`:**
- `CANONICAL_TO_BUILDING_KEY` 상수 export 추가: canonical 한국어 property명 → stable i18n building key 매핑
- cleaning page의 동일 상수를 공유 lib으로 단일화

**`src/app/mobile/page.tsx`:**
- `getCanonicalPropertyName`, `CANONICAL_TO_BUILDING_KEY` import 추가
- `localizeRoomLabel(rawRoom, buildingLabels)` 헬퍼 추가:
  - `getCanonicalPropertyName(rawRoom)` → canonical property명 추출
  - `CANONICAL_TO_BUILDING_KEY[canonicalProperty]` → i18n building key
  - `dictionary.cleaning.buildingLabels[buildingKey]` → 로케일 건물명
  - `rawRoom.slice(canonicalProperty.length).trim()` → 객실번호 추출
  - 반환: `"{localizedBuilding} {roomPart}"` 또는 단일룸이면 `"{localizedBuilding}"`
- 활동 타임라인 렌더에서 `event.room` → `localizeRoomLabel(event.room, dictionary.cleaning.buildingLabels)` 변환 후 `getActivityLabel` 호출

### Fallback 규칙

| 순서 | 조건 | 결과 |
|---|---|---|
| 1순위 | building key + locale 라벨 모두 존재 | locale 건물명 + 객실번호 |
| 2순위 | building key 또는 locale 라벨 없음 | rawRoom 그대로 |
| 3순위 | canonical property 인식 불가 | rawRoom 그대로 |

`npm run lint` and `npm run build` pass.

## 2026-06-01 Order Request — 주문처리 용어 통일 및 UX 정리

Term and UX realignment applied across the order request workflow:

### Terminology changes (UI/i18n only)

- "발주 처리" button → **"주문 처리"** (ko) / **"注文処理"** (ja) / **"Process Order"** (en)
- `ordered` status label: "발주됨" → **"주문 처리됨"** (ko) / "発注済み" → **"注文済み"** (ja)
- Success modal: "발주 처리되었습니다" → **"주문 처리되었습니다"** (ko)
- Order form success body: "관리자 승인 후 발주가 진행됩니다" → **"관리자 승인 후 주문이 진행됩니다"** (ko)
- Japanese order form: `successTitle` / `successBody` updated to 注文 terminology

### Error message i18n

- Hardcoded Korean error strings in `OrderActionBar` replaced with i18n props.
- Added keys: `errorInvalidTransition` / `errorSaveFailed` (ko/ja/en) to `mobile.orderDetail`.

### Timeline / status display

- `TIMELINE_STATUSES` in detail page trimmed to 3 steps: `requested → approved → ordered`.
- `received` is excluded from the timeline progress bar (not an active operational step in MVP).
- If `status === "received"` is encountered, it maps to the "ordered" position (fully progressed bar).
- `received` status badge still renders correctly if the record exists in DB.

### Notification policy (documented, not yet implemented)

- When `ordered` status is set: requester receives notification (planned).
- Content: order processing completed.
- Delivery date notification deferred; `delivery_date` field reserved for future use.

### Calendar integration (planned)

- When `ordered` + `delivery_date` is set: calendar entry planned (not implemented).
- See `docs/product/15-reservation-calendar.md` → "Order Delivery Date + Calendar Integration".

### Japanese i18n follow-up (2026-06-01)

Remaining `発注` instances in `src/lib/i18n.ts` replaced with `注文`:

- `localizedNavigationLabels.admin.orders`: `ja: "発注/備品"` → `"注文/備品"`
- `ja.orderForm.title`: `"備品発注の申請"` → `"備品注文の申請"`
- `ja.orderForm.submit`: `"発注をリクエスト"` → `"注文をリクエスト"`
- `ja.quickActions.order`: `"備品発注"` → `"備品注文"`

No 発注/발주 strings remain in `src/`.

Files changed:

- `src/lib/i18n.ts`
- `src/components/requests/order-action-bar.tsx`
- `src/app/mobile/requests/orders/[id]/page.tsx`
- `docs/product/10-order-request-workflow.md`
- `docs/product/14-notification-design.md`
- `docs/product/15-reservation-calendar.md`

No DB schema, RLS, or server action logic changes in this update.

## 2026-06-01 Order Request — closed 상태 타임라인 오표시 수정

Fixed a display issue where `closed` order requests were rendered with a fully-progressed (full blue) timeline bar, creating a false impression of completion for rejected/early-closed requests.

Changes (display only, no DB/API/permission changes):

- `closed` status now renders a **neutral (all-muted) timeline bar** with no steps highlighted.
- The `closed` badge continues to communicate the terminal state.
- `received` behavior unchanged: still maps to the `ordered` progress position (MVP policy).
- `progressStatus` is `null` for closed; `currentIdx = -1` makes all bar segments muted via the existing `i <= currentIdx` guard.
- Label highlight guard updated: `progressStatus !== null && s === progressStatus`.

File changed: `src/app/mobile/requests/orders/[id]/page.tsx`
Doc updated: `docs/product/10-order-request-workflow.md`

## 2026-06-01 Order Request — 배송예정일 입력 구현

Delivery date (`delivery_date`) is now captured when marking an order as "주문 처리됨".

### DB

- `supabase/migrations/202606010002_order_requests_delivery_date.sql`: `ALTER TABLE order_requests ADD COLUMN delivery_date date;` (nullable).
- `src/types/database.ts`: `delivery_date: string | null` added to `order_requests` Row/Insert/Update.

### Server action (`src/app/mobile/requests/orders/actions.ts`)

- `deliveryDate?: string` added to input.
- Validation: when `targetStatus === "ordered"`, `deliveryDate` is required and must be `YYYY-MM-DD` format. Returns `missing_delivery_date` or `invalid_delivery_date` on failure.
- DB update now writes both `status` and `delivery_date` in a single UPDATE when ordering.

### UI modal (`src/components/requests/order-action-bar.tsx`)

- 주문 처리 modal now shows: title ("주문 처리"), body (delivery date prompt), date input (`<input type="date">`).
- Confirm button is disabled until a date is entered.
- Error messages for missing/invalid date are shown inline using i18n strings.
- Approve/Reject flows unchanged.

### Display (`src/app/mobile/requests/orders/[id]/page.tsx`)

- Delivery date card shown below location/requester when `delivery_date` is set.
- Date formatted with `Intl.DateTimeFormat` (locale-aware, TZ-safe local parse).

### List card (`src/components/requests/requests-filter-view.tsx`)

- Orders with `delivery_date` show a secondary meta row: `배송예정 YYYY.MM.DD`.

### i18n (`src/lib/i18n.ts`)

- 7 new keys added to `mobile.orderDetail` (ko/ja/en): `deliveryDateLabel`, `deliveryDatePlaceholder`, `deliveryDateRequired`, `deliveryDateInvalid`, `actionProcessOrderWithDateTitle`, `actionProcessOrderWithDateBody`, `deliveryDateShort`.

### Incidental fix

- `src/components/calendar/mobile-calendar-live-view.tsx`: added missing `calendarTokyoNowLabel` to `MobileCalendarLiveViewProps.copy`.
- `src/app/mobile/calendar/page.tsx`: added missing `calendarBuildingPickerQuestion` to copy object (pre-existing TypeScript error, not related to this feature).

`npm run lint` and `npm run build` pass.

## 2026-06-01 Order Request — Tokyo-timezone display + i18n refinement

Follow-up pass on the delivery date feature:

- `formatDeliveryDate()` in both `[id]/page.tsx` and `requests-filter-view.tsx` now uses `Date.UTC(y, m-1, d, 3, 0, 0)` (03:00 UTC = noon JST) + `timeZone: "Asia/Tokyo"` in `Intl.DateTimeFormat`. This guarantees the stored calendar day is displayed correctly in any server/client timezone.
- Added `orderProcessedWithDeliveryDate` i18n key to ko/ja/en: reserved for future notification dispatch when ordering with delivery date.
- `docs/product/14-notification-design.md`: clarified that `delivery_date` is now captured at order time; notification dispatch remains planned; key documented.
- `docs/product/15-reservation-calendar.md`: updated "Order Delivery Date" section to reflect that the field is now actively captured at time of ordering; calendar auto-entry remains planned.

No schema, RLS, or server action logic changes in this pass.

## 2026-06-03 Auth and Onboarding Slice

Historical slice note: the bullets below describe the initial auth rollout state on 2026-06-03. The current consolidated login/onboarding behavior is defined by the newer 2026-06-18 auth foundation section further below.

Google OAuth, logout, membership-state access control, phone validation, and invite-code error handling were implemented.

### Changes

- **Google login**: `signInWithGoogle` server action added to `src/app/auth/actions.ts`. Uses `supabase.auth.signInWithOAuth({ provider: "google", options: { prompt: "select_account" } })`. Google button on `/auth/login` is now active.
- **No auto-prefill from Google**: Google profile data is authentication only. All required onboarding fields (name, phone, language, invite code) must still be entered manually. This is intentional for operational data quality.
- **Logout**: `signOut` action was already present but not exposed in the UI. Logout button added to `/account` page. Clears session and redirects to `/auth/login`.
- **Membership state access control**: the early slice added `suspended` / `removed` blocking. The current flow has since expanded to `suspended`, `removed`, and `disabled`, all routed into the dedicated blocked state on `/auth/login`; `removed` can explicitly branch into a re-join flow with a new invite code.
- **Phone number validation**: `isValidPhone()` helper added to `src/lib/onboarding.ts`. Validates 7-15 digits, allows +, spaces, hyphens, parentheses. Applied in both onboarding profile completion and account editing.
- **Invite code error specificity**: `joinInviteCode` now returns distinct error codes: `invite_expired`, `invite_inactive`, `invite_maxed`, `invalid_invite`. Previously all errors returned `invalid_invite`.
- **Account page improvements**: `/account` now shows a success banner after save, phone hint text, and a dedicated logout section.
- **i18n**: All new strings added to ko/ja/en — Google errors, logout, suspended/removed messages, phone hint, invite error variants, onboarding subtitle updates.

### Files changed

- `src/app/auth/actions.ts` — `signInWithGoogle` added
- `src/app/auth/login/page.tsx` — Google button enabled
- `src/lib/onboarding.ts` — `suspended`/`removed` states, `isValidPhone()`
- `src/app/onboarding/page.tsx` — suspended/removed blocked screen
- `src/app/onboarding/actions.ts` — phone validation, specific invite error codes
- `src/app/account/page.tsx` — logout button, saved banner, phone hint
- `src/app/account/actions.ts` — phone validation, cleaner revalidation
- `src/lib/i18n.ts` — all new keys (ko/ja/en)

### Supabase dashboard setup required

Google OAuth must be enabled in the Supabase project dashboard before the Google button works in production:

1. Supabase dashboard -> Authentication -> Providers -> Google.
2. Enable Google provider.
3. Enter Google OAuth Client ID and Client Secret (from Google Cloud Console).
4. Add the Supabase callback URL to the Google OAuth app's authorized redirect URIs.

No new DB migrations are needed for this slice.

`npm run lint` and `npm run build` pass.

## 2026-06-18 Auth / Signup Backend Foundation (implemented)

The full auth/signup backend foundation was implemented to match the confirmed target policy.

### Implemented

**Auth actions (`src/app/auth/actions.ts`):**
- `signInWithEmailPassword` — email + password login, routes to onboarding or app via `getOnboardingState()`
- `signUpWithEmail` — validates password policy (min 8 chars, letter + number), sends verification email, detects duplicate accounts via empty `identities` array
- `requestPasswordReset` — sends reset email, never reveals whether email exists
- `updatePassword` — validates confirm match + password policy, calls `supabase.auth.updateUser`
- `setLocaleCookie` — persists locale in `stayops_locale` cookie (90 days, httpOnly false)
- `signInWithGoogle` / `signOut` — unchanged
- Magic-link (OTP) fully removed

**Login UI (`src/app/auth/login/`):**
- `page.tsx` — handles the full auth state set: root entry, email login (`view=email`), email signup (`view=email&mode=signup`), password-reset request (`view=email&mode=reset`), reset-sent confirmation, new-password entry (`view=email&mode=new_password`), and blocked-account states (`view=blocked`); locale from `?lang=` param or cookie; device-based routing (`isMobileUserAgent`)
- `email-login-form.tsx` — wired to `signInWithEmailPassword`, show/hide password toggle, loading spinner
- `email-signup-form.tsx` — wired to `signUpWithEmail`, password strength meter (4 segments), email validation state, terms consent block
- `language-sheet.tsx` — calls `setLocaleCookie` before navigation so locale persists across redirects

**Profile & onboarding state (`src/lib/onboarding.ts`):**
- `getOnboardingState()` now checks `birth_date` as a required field (in addition to name, phone, preferred_language)
- Multi-org support: queries ALL non-invited memberships; prefers `last_used_organization_id` when user has multiple active memberships
- `ProfileSnapshot` now includes `birthDate: string | null`
- `setLastUsedOrganization(userId, orgId)` — updates `profiles.last_used_organization_id`
- `disabled` Auth-level account state is also surfaced by `getOnboardingState()` using `user.banned_until`, separate from membership-level `suspended` / `removed`

**Invite code backend (`src/lib/auth-invite.ts`):**
- `validateInviteCode(code)` — checks `invite_codes` table; returns `ok: true` with `organizationId` + `defaultRole`, or `ok: false` with error `"invalid" | "expired" | "inactive" | "maxed_out"`
- `joinOrganizationWithInviteCode(userId, code)` — validates first, then calls `join_organization_with_invite_code` RPC

**Role category mapping (`src/config/roles.ts`):**
- `INVITE_CATEGORIES` — 5 user-facing display categories
- `inviteCategoryToRole` — maps display category to DB `organization_role` slug
- `roleToInviteCategory` — reverse mapping

**Database migration (`supabase/migrations/202606180004_profiles_birth_date_and_last_org.sql`):**
- `profiles.birth_date date` — nullable, replaces `age` as the operational identity field
- `profiles.last_used_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL`
- Partial unique index on `phone_number` (excludes NULL and empty rows)

**Types (`src/types/database.ts`):** `profiles` Row/Insert/Update updated with `birth_date` and `last_used_organization_id`.

**i18n (`src/lib/i18n.ts`):** Added to `onboarding` namespace in ko/ja/en:
- `birthDateLabel`, `birthDatePlaceholder`, `birthDateHint`
- `roleCategories` (5 display category labels)
- `missing_birth_date`, `phone_duplicate` error keys

**Migration status:** `202606180004` is **applied to the linked Supabase project (2026-06-18)** — `birth_date` + `last_used_organization_id` columns and the `profiles_phone_number_unique` partial index are live, and the migration is recorded in `supabase_migrations.schema_migrations` (version `202606180004`). Before the unique index could build, two dev E2E seed accounts that shared placeholder phone `000-0000-0000` were given distinct placeholders (`000-0000-0001` / `000-0000-0002`). Note: existing profiles now have `birth_date = NULL`, so all current users (including the real owner `rlaguswns95@haru-tokyo.com`) pass through the onboarding birth-date step once on next login before reaching the app.

### Confirmed target policy (still applies)

- Auth methods: `Google` + `email/password`; magic-link removed
- Google profile data is auth-only; StayOps must not auto-fill name/phone from Google
- Same-email Google/email attachment currently relies on Supabase automatic identity linking + confirmed-email settings; the email-signup path separately resumes duplicate/incomplete accounts in app code
- Required onboarding before app access: name, date of birth, phone number, preferred language, team invite code
- Team invite code determines `organization + role category` (5 categories: Part-time Staff, Office Staff, Field Staff, Part-time Staff (Manager), Owner)
- `Owner` invite codes are one-time use; others: 3 months / max 100 joins
- Multi-org: one account can belong to multiple organizations; login returns to last-used org
- Phone number is unique at account level (enforced via partial unique index)
- Root routing: desktop/PC requests enter `/auth/login` first and default to `/admin` after auth/onboarding resolution; mobile/tablet requests enter `/mobile` (device-based routing via `isMobileUserAgent`)

### Remaining (not yet implemented)

- Onboarding `birth_date` field — **DONE 2026-06-18** (see "Onboarding flow wired to backend" above): `<input type="date">` in the `needs_profile` form, validated + saved.
- Invite-code input + role-category preview in onboarding — **DONE 2026-06-18** (see above): verify → preview (org + role category) → confirm join, via `previewInviteCode`.
- Optional follow-ups (deferred, not blocking): rebuilding `/onboarding` into the new mobile design language (currently kept in its existing layout); a dedicated multi-org switcher UI (last-used-org backend is live, switcher UI not built); invite-code validity/usage figures in the preview card (currently org + role category only).

## 2026-06-22 Mobile Scroll-Stability Pass — Fix #1/7: header toggle no longer shifts scroll content

`src/components/shell/mobile-shell.tsx`: removed the `headerVisible`-driven top-padding toggle on the
scroll container. The container previously switched between `pt-5` (header visible) and `pt-0` (header
hidden); because that div is what actually scrolls, changing its `padding-top` shifted rendered content
by 20px while `scrollTop` stayed put, so users saw the page "snap up / snap down" whenever the header
hid/showed — and the inline `padding 300ms ease-out` transition made the jump glide visibly. Fix:

- Scroll container now keeps a **single constant `pt-5`** (resting design unchanged).
- Removed `padding 300ms ease-out` from the inline `transition` in both branches; the
  `transform 420ms cubic-bezier(0.34,1.56,0.64,1)` pull-to-refresh animation is kept exactly as-is
  (the `isPulling` branch becomes `none`, i.e. transform tracks the finger with no transition, same as
  before once padding is dropped).

The header element itself still hides/shows via its own opacity + translate-y transition (non-reflowing,
unchanged). Bottom tab-bar slide, pull-to-refresh logic/thresholds/indicator/curtain, edge-back drag,
and all color/spacing tokens are untouched. `npm run lint` + `npm run build` pass. This is **fix #1 of 7**
in the mobile scroll-stability pass; items #2–#7 (threshold/`headerVisible` semantics, etc.) are tracked
for follow-up turns.

## 2026-06-22 Mobile Scroll-Stability Pass — Fix #2/7: header toggle debounced against scroll jitter

`src/components/shell/mobile-shell.tsx` (`updateVisibility`): raised the header hide/show accumulated-delta thresholds (hide 28→64px, show 12→36px) and applied the existing `< -4px` small-delta filter to the hide branch too (`delta > 0` → `delta > 4`), so iOS Safari momentum micro-oscillation no longer flickers the header in/out during normal scrolling. The `scrollTop ≤ 8` snap-to-visible, accumulator resets, rAF throttle, and `lastScrollYRef`/`tickingRef` bookkeeping are unchanged; header animation timing untouched. `npm run lint` + `npm run build` pass. Fix **#2 of 7** in the mobile scroll-stability pass; #3–#7 remain.

## 2026-06-22 Mobile Scroll-Stability Pass — Fix #3/7 was partially reverted after real-device Safari gaps

`src/components/shell/mobile-shell.tsx`: the earlier fix changed **all three nested shell
containers** (`<main>`, centered wrapper, inner safe-area column) from `h-dvh` to `h-svh` to keep
the frame stable during iOS URL-bar collapse. That removed one jump class, but real-device Safari
showed the cost was too high: the shell could become visibly shorter than the actual viewport,
creating large ivory gaps below the bottom tab bar and making the sidebar/footer/scrim appear to stop
above the real screen bottom.

Final as-built correction: the **outer** shell uses `h-dvh` again, while the two nested descendants
now use `h-full` rather than their own viewport units. That keeps only one live viewport-bound box in
the stack, so the shell once again fills the visible screen without the "three nested containers all
resize independently" amplification. Notch padding, inner scrolling, pull-to-refresh, and the
overlay/tab-bar structure are unchanged. `npm run lint` + `npm run build` pass.

## 2026-06-22 Mobile Scroll-Stability Pass — Fix #4/7: touchmove setState coalesced to one per frame

`src/components/shell/mobile-shell.tsx`: added two rAF refs (`pullRafRef`, `edgeRafRef`) and rewrote `syncPullDistance` + the `setEdgeDx` line in `handleSwipeMove` so per-`touchmove` React state updates (PTR pull distance + edge-back `edgeDx`) are coalesced to **one setState per animation frame** instead of firing 1–2 full-subtree re-renders at the ~120Hz touch rate. The underlying refs (`pullDistanceRef`, `edgeRawDxRef`) still update synchronously every sample so the commit thresholds (PTR ≥72, edge >64) read live values. Terminal paths cancel any pending frame and commit the resting 0 immediately (`handleTouchEnd` cancels + `setPullDistanceState(0)`; `endEdgeDrag` cancels before `setEdgeDx(0)`) so spring-back is instant and no stale frame reintroduces a non-zero value. `setIsPulling`, `requestVisibilityUpdate`/`handleContentScroll`, thresholds, and all animation timing unchanged. `npm run lint` + `npm run build` pass. Fix **#4 of 7** in the mobile scroll-stability pass; #5–#7 remain.

## 2026-06-22 Mobile Scroll-Stability Pass — Fix #5/7: PTR gated to gestures that started at the top

`src/components/shell/mobile-shell.tsx`: added `ptrEligibleRef` so pull-to-refresh only arms when the finger gesture **started at `scrollTop ≤ 0`**. `handleTouchStart` sets the flag from the initial scroll position (and early-returns otherwise); `handleTouchMove` clears it + re-anchors `touchStartY/X` the moment `scrollTop > 0`, and when at the top but ineligible it keeps the anchor fresh and bails before the `deltaY` math; `handleTouchEnd` resets the flag unconditionally. This stops the spurious "page snaps down and back" that happened when a momentum/rubber-band coast reached `scrollTop === 0` under a held finger and computed a huge `deltaY` against a stale anchor (instantly exceeding `PULL_THRESHOLD`). Clean top-of-page pulls are byte-for-byte unchanged; thresholds, indicator, gradient, rAF batching (fix #4), and edge-back logic untouched. `npm run lint` + `npm run build` pass. Fix **#5 of 7** in the mobile scroll-stability pass; #6–#7 remain.

## 2026-06-22 Mobile Scroll-Stability Pass — Fix #7/7 + pass COMPLETE: edge-back hint is now zero-render

`src/components/shell/mobile-shell.tsx`: removed the `edgeDx` React state (and the fix-#4 `edgeRafRef` rAF machinery for it) and drive the left-edge back gradient/chevron hint entirely from a `--edge-progress` (0..1) CSS custom property written straight to the hint DOM node via a new `edgeHintRef` + `writeEdgeProgress` helper. `handleSwipeMove` and `endEdgeDrag` now call `writeEdgeProgress(dx)` / `writeEdgeProgress(0)` instead of `setEdgeDx`, the inline styles read `var(--edge-progress)` through `calc()` (opacity = progress, chevron translate = `(progress - 1) * 12px`), and the derived `edgeProgress` const is deleted. The edge drag now re-renders the shell **zero** times mid-gesture — only the start/end `edgeDragging` flip (which toggles the spring transition) renders. Visual behavior (opacity ramp, ~64px commit, spring-back, right-edge forward fling) is byte-for-byte identical. PTR rAF batching (`pullRafRef`/`syncPullDistance`) and all other logic untouched. `npm run lint` + `npm run build` pass.

**Mobile scroll-stability pass COMPLETE (#1–#7 all landed):** #1 padding-toggle jump removed · #2 header toggle debounced (64/36 thresholds + both-direction jitter filter) · #3 shell height on `svh` (URL-bar-collapse stable) · #4 touchmove setState coalesced to 1/frame · #5 PTR gated to gestures that started at the top · #6 (prior) · #7 edge-back hint moved to a DOM-written CSS custom property (zero mid-drag re-renders).

## 2026-06-22 Mobile sidebar scrim no longer tints iOS Safari chrome black

`src/components/shell/mobile-shell.tsx`: the sidebar dismiss scrim was `fixed inset-0 bg-slate-950/42`, so under `viewport-fit: cover` its dark layer reached the viewport's literal top/bottom edge pixels (the aside only covers ~78% width, leaving the right edge fully dark top-to-bottom). iOS Safari samples those edges to pick its chrome tint, so it painted the top status bar and bottom URL toolbar black. The earlier fix insetting the scrim by `env(safe-area-inset-top/bottom)` helped **standalone/PWA** safe-area bands, but **regular Safari browser mode** still reproduced the issue because its browser chrome is outside the safe-area model. Final fix: keep the dismiss target `fixed inset-0`, but paint the scrim with a vertical gradient that leaves transparent top/bottom edge bands (`max(16px, env(safe-area-inset-*))`) and only dims the center span. Safari now keeps sampling the ivory page edge in both browser mode and standalone while the visible dim across the main content stays effectively the same. Scrim click area, opacity transition, z-index, aside geometry/gradient/shadow, and all other shell surfaces are untouched.

Follow-up seam fixes: after the black bands were removed, two Safari artifacts remained. First, a thin bright vertical line could still appear on the sidebar's right edge; root cause was the sidebar's `border-r border-border`, which read like a white seam against the dimmed scrim and could be exaggerated by Safari's compositing at the transformed layer edge. The right border was removed; depth now comes from the existing sidebar shadow only. Second, the first pass's transparent chrome-safe bands used `max(16px, env(safe-area-inset-*))`, which kept Safari's chrome light but made visible horizontal bright seams near the top and bottom in regular browser mode. The fallback band size was reduced to **literal edge rows only** (`max(1px, env(safe-area-inset-*))`): standalone still clears the real safe-area bands, while browser mode keeps just enough transparent edge for Safari chrome sampling without showing visible lines.

Standalone follow-up: the 1px-edge fix still was not enough for **installed home-screen mode** because `env(safe-area-inset-top/bottom)` there resolves to the full real safe-area sizes, so the sidebar scrim either left a visible hard seam below the status bar / above the home indicator or, when made full-bleed, painted the top system status area dark and could leave that tint perceptually "stuck" after close. Final fix is **mode-aware scrim paint**: browser mode keeps the gradient with transparent edge rows; standalone mode dims only the middle content span and explicitly leaves the shared `safe-area + 64px header` zone and bottom-tab zone undimmed. `mobile-shell.tsx` detects standalone via `matchMedia("(display-mode: standalone)")` plus legacy `navigator.standalone`. Result: browser-mode Safari keeps its chrome light, and the installed app no longer shows horizontal bars or a dark status-bar strip.

Top-black-band follow-up: on a real iPhone, the standalone sidebar could still leave the **top** status-bar strip dark after open/close even after the mode-aware gradient landed. Root cause: the dismiss scrim still existed as a **viewport-wide fixed layer** even while fully transparent/closed, and iOS Safari/standalone could keep sampling that layer for status-bar paint. Fix: both sidebar layers are now **shell-local absolute layers** inside the mobile shell (`aside` + scrim use `absolute`, not `fixed`), and the scrim is **mounted only while `sidebarOpen` is true**. The existing browser/standalone gradient logic remains, but once the drawer closes there is no hidden full-screen scrim left for iOS to sample, which removes the lingering dark top strip.

Open-drawer polish follow-up: even after the tint/seam fixes, the open side menu still showed the shared **top bar and bottom tab bar** dimly on the right-side sliver, which read less like a native drawer and more like "the app is still visibly running behind a menu." `mobile-shell.tsx` now treats `sidebarOpen` as an override for both shared chrome surfaces: the top bar uses the same hide transform plus `opacity-0 pointer-events-none`, and the bottom tab bar mirrors that hide path too. Result: while the drawer is open the user sees the drawer + dimmed content only, not the shared app chrome underneath.

Standalone visual follow-up: after hiding that shared chrome, a remaining artifact was the **bright top-right and bottom-right blocks** in the exposed sliver. Root cause: the standalone scrim logic was still preserving clear bands (first the old `safe-area + 64px header` / bottom-tab zones, then literal safe-area rows) even though those surfaces were now hidden during `sidebarOpen`. Fix: when the sidebar is open in standalone mode, the exposed right-side area now uses one continuous `rgba(2,6,23,0.42)` scrim with no transparent horizontal bands. Because the scrim is shell-local and unmounts on close, there is no closed-state hidden layer left for iOS to sample, while the open drawer no longer looks split into horizontal blocks.

## 2026-06-22 Mobile sidebar black-band follow-up: page color-scheme locked to light

`src/app/layout.tsx`: after the `themeColor` light/dark variants and the sidebar scrim safe-area fix both landed, real iOS Safari in OS dark mode still painted black status-bar / URL-toolbar bands while the sidebar was open. Root cause was a missing `color-scheme` declaration — without it, dark-mode iOS Safari treats the page as dark-capable and applies its dark canvas/chrome defaults, which the dim scrim then reinforced through chrome color sampling. Added `viewport.colorScheme = "light"` to the existing Next.js `Viewport` export, which emits the `color-scheme: light` meta and locks the page to light-mode rendering on both light and dark devices. No surface, color token, or component is altered — the app's ivory design is unchanged.

## 2026-06-22 Attendance result sheet scope fix + PWA manifest ivory chrome

Two fixes in one cycle:

1. **Attendance result sheet rendered unstyled** (`src/components/attendance/attendance-capture.tsx`): the clock-in/out success/failure `BottomSheet` is `createPortal`-ed to `<body>`, escaping the `<div class="att">` scope. All attendance result-sheet CSS is written as `.att .rsheet__…` / `.att .ic svg { width: 1em }`, so outside `.att` the content rendered with no styling — intrinsic-size (giant) SVG icons and unstyled stacked text (matches the reported screenshot). Fix: the `BottomSheet` now carries `className="att att__result-sheet"` so the portaled dialog itself is the `.att` scope root; all descendant rules match again. `.att` only sets CSS variables + color + box-sizing (no padding/display), so BottomSheet's own `px-5`/`pb-[safe-area]` layout is unaffected.

2. **PWA manifest stale teal chrome** (`public/manifest.webmanifest`): `theme_color` was `#00796f` (retired teal) and `background_color` `#fbfcfc` (near-white) — both pre-rebrand leftovers. Corrected to ivory `#f7f4ee` to match `viewport.themeColor` and the ivory canvas. These drive the OS status-bar tint and launch splash **only in installed/standalone (Add to Home Screen) mode**; in-browser Safari chrome is still governed by the in-page `themeColor`/`colorScheme` meta. Also removes a "teal retired" brand-rule violation.

`npm run lint` + `npm run build` pass.

## 2026-06-22 Mobile top bar converted to a full-slide overlay (matches bottom bar)

`src/components/shell/mobile-shell.tsx`: the top bar previously hid on scroll-down by **fading its inner content** while the outer `h-16` in-flow block stayed in place — so a blank 64px band remained at the top while scrolling (reported: "상단바가 하단바랑 같이 사라져야하는데 떠있어"). The earlier design avoided collapsing the in-flow height because that reflowed the scroll content and caused a snap jump. Fix: the top bar is now an **absolute overlay** (`absolute inset-x-0 top-[env(safe-area-inset-top)] z-30 h-16`) that slides fully up on scroll-down (`-translate-y-[calc(100%+env(safe-area-inset-top))]`) and back on scroll-up — the exact pattern the bottom tab bar already uses. The scroll container now carries a **constant** `pt-[84px]` (64px header + ~20px breathing) so it clears the overlay at rest and scrolls under where the header was; the padding never toggles, so there is no reflow jump. The inner header bar's own fade/translate was removed (the overlay slide replaces it), and the PTR indicator + gradient curtain were offset to `top-16` so they sit below the overlay header. `headerVisible` threshold/jitter logic is unchanged. `npm run lint` + `npm run build` pass. **Browser-preview verification was not possible** (the Windows-launched preview server can't reach the WSL UNC project path); validated via lint/build + parity with the already-working bottom-bar slide pattern — visual scroll confirmation pending on a real local device.

## 2026-06-22 Native standalone PWA hardening pass (installed home-screen feel)

A four-part pass to make the installed (home-screen / standalone) PWA feel native on iOS Safari + Android, from a code audit of manifest/SW/icons, native-feel touch CSS, standalone navigation, and screen bugs.

**A — Global native-feel touch (`src/app/globals.css`):**
- `-webkit-tap-highlight-color: transparent` globally (kills the grey tap-flash on every button/link).
- `-webkit-touch-callout: none` + `user-select: none` on UI chrome (button/a/label/summary/[role=button]/[role=tab]/.tabbar/.wordmark); body text + inputs stay selectable.
- `html, body { overscroll-behavior: none }` (no document rubber-band / white gap above header / below tab bar).
- Input zoom-on-focus killed: `@media (pointer: coarse) { input/textarea/select { font-size: 16px } }` (specificity beats Tailwind `text-sm/-xs` utilities, desktop sizes untouched). The one oversized field (onboarding invite code, 19px) opts out via `data-keep-font-size`. CSS-file inputs bumped directly: suggestions `textarea.inp`/`.csheet__in`, attendance `textarea.memo`.
- Note: Tailwind v4 already gates `hover:` behind `@media (hover:hover)`, so sticky-hover was a non-issue.

**B — Standalone "stuck / kicked-out" fixes:**
- Edge-back never strands the user: `goBack()` in `mobile-shell.tsx` falls back to `/mobile` when `window.history.length <= 1` (cold-launched onto a deep screen has no browser back button).
- Photos open in an in-app lightbox instead of `target="_blank"` (which ejected standalone into Safari): new controlled `ImageLightbox` (`src/components/shell/image-lightbox.tsx`) + reusable `LightboxThumbs` wrapper; wired into `announcement-image-grid`, order-detail item photos, and linen-return record photos (each keeps its original thumbnail look).
- Out of scope / left as-is (recoverable via app switcher): genuine external destinations — calendar Google-Maps link, order shopping links (Amazon/IKEA), `mailto:`/`tel:`. Google OAuth-in-standalone (Safari cookie-jar) is a known limitation, not changed (auth-flow risk).

**C — PWA infrastructure:**
- Icons (were entirely missing → blank/screenshot home icon): generated brand icons (navy gradient squircle + ivory serif "S") via `scripts/dev/generate-pwa-icons.mjs` (sharp) → `public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png`; referenced in `manifest.webmanifest` `icons[]` and `layout.tsx` `metadata.icons` (apple-touch-icon for iOS).
- `manifest.webmanifest`: added `id` + `scope` (`/`) and changed `start_url` `/` → `/mobile` (drops the `/`→`/mobile` launch redirect hop for the installed app).
- Service worker (was none → no Android install prompt, blank offline): `public/sw.js` registered prod-only by `ServiceWorkerRegister` (mounted in `layout.tsx`). Conservative: navigations stay **network-first** (no stale HTML/RSC), static `/_next/static` + `/icons` cache-first, `/offline` fallback page (`src/app/offline/page.tsx`, trilingual). Unlocks the Android install prompt (SW + fetch handler + maskable icon). Bump `CACHE` to invalidate static cache on deploy.
- Cleanup: removed leftover default Next.js svgs from `public/`.

**D — Screen bugs:**
- Added `src/app/mobile/loading.tsx` shared ivory skeleton (no more blank-shell flash / layout shift on mobile route transitions).
- Notifications screen bottom padding now clears the home indicator (`.sg .scroll` → `max(26px, env(safe-area-inset-bottom))`).
- Deferred (need device testing / larger refactor, noted for follow-up): visualViewport keyboard-inset for hand-rolled fixed bars (the rendered comment composer is a flex footer, not fixed, so iOS auto-scrolls it — lower risk than first thought); `.csheet` → canonical `BottomSheet` migration; calendar horizontal-scroll vs left-edge-back gesture conflict; notifications screen is still the documented deferred mock (i18n/real-data pending re-wire); header icon buttons stay the documented 38px.

Verification: `npm run lint` + `npm run build` pass. Generated `icon-512.png` visually confirmed (navy squircle + ivory "S"). On-device standalone behavior (install prompt, offline page, home-screen icon, no tap-flash, no input zoom) not yet verified on a real device.

## 2026-06-22 Standalone PWA black status-bar bands fixed (html background)

`src/app/globals.css`: ivory `--background` is now painted on **both `html` and `body`** (was body-only). In an installed/standalone iOS PWA the area behind the status bar / notch and any safe-area / overscroll band exposes the **root `<html>`** background; with none set, iOS painted those bands black — reported when opening the sidebar and on the standalone attendance screens (Safari browser mode hid it because `themeColor` tinted the chrome). Painting `<html>` ivory removes the black bands. `apple-mobile-web-app-status-bar-style` stays `default` (dark text on light) — correct for the light app; `black-translucent` intentionally avoided (would force invisible white status-bar text on ivory). Not a design change. Standalone-only behavior + WSL/UNC preview limitation means this was not browser-preview verified — re-test on the installed app / tunnel: sidebar open should show no black band at the top.

## 2026-06-22 Native standalone PWA — pass 2 (keyboard + touch responsiveness)

Second native-feel pass (after the 2026-06-22 pass 1). Two low-risk batches landed; the large
navigation-architecture work is scoped but pending decision (see below).

**Global touch (`src/app/globals.css`):**
- `touch-action: manipulation` on tappable controls (button/a/summary/[role=button]/[role=tab]) — removes the legacy ~300ms tap delay + double-tap-to-zoom so taps register instantly. Scoped to controls only, never scroll containers.
- `html { -webkit-text-size-adjust: 100% }` so iOS doesn't inflate text (e.g. landscape).

**Keyboard / input native correctness (attribute-only edits, no layout/logic change):**
- `enterKeyHint` added across single-line inputs (was 0 in the codebase): login email→`next`, password→`go`, reset→`go`, new-password→`next`/`done`; comment composers (suggestions, task update-log)→`send`; search bars→`search`; invite code→`done`.
- Search bars (`suggestions-user-picker`, `projects-board` invite) → `type="search"` (+ `autoFocus` on the in-sheet picker so it focuses on open).
- Onboarding name→`autoComplete="name"`, phone→`type="tel"` + `autoComplete="tel"` (wizard + fallback form).
- Invite-code fields → `autoCorrect="off"` + `spellCheck={false}` + `autoComplete="off"` (no autocorrect/underline on codes).
- Already-correct (kept): auth `type="email"`/`type="password"` + autoComplete, order quantity `inputMode="numeric"`, custom wheel date pickers in the live flows.

**Scoped but NOT yet done — navigation architecture (the biggest remaining native gap), pending user decision:**
- `MobileShell` is rendered per-page (no `src/app/mobile/layout.tsx`), so it **remounts on every navigation** — header/tab bar re-animate + flash, scroll/header state resets, bottom-tab active state lags one nav behind. Fix = move the shell into a shared `mobile/layout.tsx` (persist across routes), derive `activeItem` from `usePathname`, and resolve the per-page `title`/`hideBottomNav`/`badges` props in the layout (blocker: `hideBottomNav` varies per route → needs a pathname allowlist or a client setter). Touches ~36 pages + the documented shell contract.
- No route transition animations (web-swap feel); Next 16 `experimental.viewTransition` / a `mobile/template.tsx` slide are the options, coordinated push/pop with the edge-back `goBack()`.
- Scroll restoration is broken on back-nav because the app scrolls an inner div (Next restores window scroll only) — needs manual per-pathname scrollTop save/restore in the shell.
- visualViewport keyboard handling for the two genuinely `position:fixed` submit bars (linen-return create, attendance correction) — deferred with the above.

Verification: `npm run lint` + `npm run build` pass.

## 2026-06-22 Native standalone PWA — pass 2b (route transitions, scroll restoration, keyboard inset)

Landed the user-approved "navigation feel" work. Delivered the visible native outcomes via a
**lower-risk implementation** than the full persistent-shell folder restructure (which would have
forced the shell onto shell-exempt screens like `/mobile/notifications` and the full-screen capture
flow — too risky to restructure blind):

- **iOS-style route transitions**: `src/app/mobile/template.tsx` plays a slide+fade per navigation — forward pushes in from the right (`.screen-push`), back pops in from the left (`.screen-pop`). Direction is tracked by `src/lib/nav-direction.ts`: the shell's `goBack()` flags "back" before navigating; everything else defaults to forward. CSS keyframes in `globals.css`, honoring `prefers-reduced-motion`. (Subtle 14% slide, not a full 100% slide, so nothing reveals blank canvas.)
- **Scroll restoration** (inner scroll container): the app scrolls an inner div, which Next's built-in restoration can't track, so back-nav always lost your place in long lists. `MobileShell` now saves `scrollTop` per pathname (module-scoped `SCROLL_POSITIONS` Map, survives the per-route remount) and restores it on mount.
- **Removed `src/app/mobile/loading.tsx`** (added in pass 1): a chrome-less skeleton that flashed and fought the slide. Without a loading boundary, Next keeps the previous screen mounted until the new RSC is ready, then the template slides it in — more native than a skeleton flash.
- **Keyboard occlusion**: new `KeyboardInsetSync` (`src/components/pwa/keyboard-inset-sync.tsx`, mounted in `layout.tsx`) publishes the keyboard height as `--keyboard-inset` via VisualViewport. The two genuinely `position:fixed` submit bars now sit at `bottom: var(--keyboard-inset)` so the keyboard never covers them: linen-return create (`linen-return-create-form.tsx`) and attendance correction (`.att .submitbar` in `attendance.css`). Flex-flow composers (suggestions/task/announcement comments) are auto-scrolled by the browser and need no change.

**Not done (deeper optimization, deferred):** the shell still remounts per route (no shared `mobile/layout.tsx`), so header `headerVisible` state resets on navigation and the bottom-tab active highlight still updates on arrival rather than instantly on tap. A true persistent shell needs a route-group restructure to exempt the no-shell screens; deferred as a follow-up. The slide transition + scroll restoration deliver most of the perceived native nav feel without that risk.

Verification: `npm run lint` + `npm run build` pass. Route transitions + keyboard-inset behavior need on-device verification (transitions are isolated to `template.tsx` + `globals.css` and trivially revertible).

## 2026-06-22 Pay-amount hide toggle: drop filter:blur (iOS rectangle/white-edge artifact)

`src/components/attendance/attendance.css`: the pay-screen eye toggle hid amounts with `filter: blur()` on the text (`.entryrow__val.masked`, `.paycard.hide .pc__amt`, `.paycard.hide .pc__v`). On real iOS Safari, `filter: blur()` on text inside the `.paycard { overflow: hidden }` card clips the blur halo into a hard rectangle / white hairline — the reported "네모·흰 테두리" artifact. Replaced with **transparent text + `text-shadow` blur** (no element-box filter region → no edge artifact), with shadow color per card variant (`var(--ink)` on the light `--expected` card, white on the dark `--final` card). `transition` switched from `filter` to `color, text-shadow`. CSS-only; obscuring strength preserved. `npm run lint` passes; dev server hot-reloads CSS so it's re-testable on the tunnel. Not browser-preview verified here (iOS-specific artifact + WSL/UNC preview limitation). Doc: `docs/product/24-attendance-workflow.md` pay section.

## 2026-06-22 Native standalone PWA — pass 3 (interaction polish + performance)

Third pass from a fresh audit (performance + interaction), implementing the high-value low-risk
findings; verified false positives were dropped.

**Press feedback (native tactile, app-wide):**
- Shared `Button` (`ui/button.tsx`) gains `active:` states per variant + `active:scale-[0.98]` (Tailwind v4 gates `hover:` to hover-capable devices, so touch had zero feedback) — fixes dozens of buttons at once; honors reduced-motion.
- Bottom tab items (`.tabbar__item:active`, the most-tapped control) and notification rows (`.sg .notif:active`) now depress on tap.
- Cleaning active-session quick-action links get `active:` (were hover-only).

**Double-submit guards:** new shared `SubmitButton` (`ui/submit-button.tsx`, `useFormStatus`) disables + spins while a `<form action>` server action is in flight. Wired into the plain-form submits that lacked a pending guard: cleaning completion, cleaning-linked confirmation, announcement delete. (Most other forms already had `disabled={isPending}` — confirmed, left as-is.)

**Performance:**
- Calendar clock interval 1s → 30s (it only shows HH:MM; the 1s tick re-rendered the whole large calendar component every second).
- Calendar sticky date header `bg-surface/95 backdrop-blur-xl` → solid `bg-surface` (backdrop-blur is the most expensive scroll-time paint; this one repainted across the whole grid during 2-axis scroll).
- `getCurrentAppSession` wrapped in React `cache()` — it's a multi-query waterfall called on the layout + page + `getMobileNavBadges` every render; now one execution per request.
- Task photo thumbnails (raw `<img>`) get `loading="lazy"` + `decoding="async"` (were eager-loading full-size originals into tiny boxes).
- Announcement `next/image` thumbnails get `sizes` (no more oversized srcset on mobile).
- `SCROLL_POSITIONS` restoration Map capped at 30 entries (LRU) so it can't grow unbounded.

**Gesture:** the calendar horizontal grid `stopPropagation`s its touch events so a left-edge horizontal scroll no longer fires the shell's edge-back `router.back()`.

**Deferred (noted, higher risk / larger):** long-list virtualization or `content-visibility` (cleaning/requests/tasks/suggestions render all rows); `tasks-workspace` filter/sort/group memoization + `React.memo(TaskCard)`; module-level `Intl` formatter singletons; `getMobileNavBadges` cross-request `unstable_cache` (would make advisory counts stale); hand-rolled sheets (context-picker, user-picker, project rename modal) → canonical `BottomSheet` for full scroll-lock; the persistent-shell layout refactor (from pass 2b).

Verification: `npm run lint` + `npm run build` pass. Interaction/perf changes need on-device confirmation.

## 2026-06-22 Native standalone PWA — pass 4 (bug fixes + remaining native gaps)

Final pass from a 4-agent audit (bug hunt, a11y/i18n, native-gaps, edge-cases). Fixed the confirmed
real bugs and filled the highest-value native gaps; verified false positives were dropped.

**Bugs fixed:**
- Malformed (non-UUID) deep-link → **500 crash** → now not-found: `getTaskDetail`/`getOrderRequestById`/`getLinenReturnRecordById` treat Postgres `22P02` as null instead of rethrowing.
- Order status change **lost-update / TOCTOU**: both `order_requests` UPDATEs now add `.eq("status", current.status)` + `.select("id")` and report `invalid_transition` on 0 rows (was overwriting + double-notifying when two users acted at once).
- Linen create line list keyed by array index → **wrong-row rebind on mid-list delete**: keyed by per-line-unique `itemId`.
- Task complete/reopen optimistic hide had **no rollback** → row vanished until refresh on error: wrapped in try/finally so it always un-hides.
- Route-transition direction (`nav-direction.ts`) could get **stuck on "back"** and mis-animate the next forward nav (when goBack landed on a non-template route): now expires after 1200ms.
- Scroll restoration keyed by pathname only → **restored a stale position across query variants** (`?view=`/`?month=`): now keyed by full path+query (`window.location`).

**Native gaps filled:**
- `src/app/mobile/error.tsx` + `not-found.tsx` — branded ivory, trilingual, retry/home (was a bare white English root error page = "crash" feel).
- Service-worker **update flow**: `ServiceWorkerRegister` reloads once on `controllerchange` (only if an old SW was controlling) so a deploy doesn't strand users on the old shell / cause chunk-load errors.
- **Scroll-to-top on active bottom-tab re-tap** (native behavior) via the shell's `scrollElRef`.
- `/offline` page now **actually auto-reloads** when back online (`OfflineAutoReload`) — it previously only promised to.

**A11y / i18n / overflow:**
- Global `:focus-visible` outline (keyboard focus was invisible after the tap-highlight removal) + `prefers-reduced-motion` disables `animate-spin`.
- Fixed a Hangul word ("누락") embedded in a Japanese i18n string (`tasks.contextPickerGuestSub`).
- Task card title `line-clamp-2 break-words`; cleaning room title `truncate` + `min-w-0` (long labels overflowed).

**Deferred (documented, larger/lower-severity):** global toast/snackbar system (the one big missing native feedback primitive — its own task); notifications screen still renders outside `MobileShell` with hardcoded-Korean mock (documented deferred); per-form free-text length clamps + order quantity/items/image server clamps (incl. the 5-image rule for order items); icon-button `aria-label`s + custom-dropdown keyboard semantics + form label associations (need new ko/ja/en keys); order processor-role button gating UX; client delivery-calendar "today" → Tokyo seed; iOS splash screens; long-list virtualization; persistent-shell layout refactor.

Verification: `npm run lint` + `npm run build` pass. Behavior needs on-device confirmation.
