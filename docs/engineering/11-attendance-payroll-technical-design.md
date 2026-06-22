# Attendance / Payroll Technical Design

Status: Refined technical draft (policy baseline confirmed 2026-06-17) 쨌 **Step 1 (schema + permission
foundation) implemented 2026-06-17** ??migration `202606170001_attendance_payroll.sql`.

## As-built — Step 2 (site/QR backend helpers + dev temp-QR, 2026-06-17)

**Original scope decision (2026-06-17, user-confirmed):** the owner-only **site master + QR management
UI would live in the WEB DASHBOARD (admin web)** and the app would be finished first. So the initial
Step 2 shipped **backend helpers first**, plus a **dev-only temporary-QR tool** so the app's attendance
flow could be tested before a dashboard existed.

- **Atomic QR issuance** — migration 202606170002_issue_attendance_qr_fn.sql adds the plpgsql
  issue_attendance_qr(p_org, p_site, p_created_by, p_token) SECURITY DEFINER function (service_role
  only): deactivates the current active token, inserts the new active one, and links
  eplaced_by_token_id — all in one transaction, so the "one active token per site" partial-unique
  guarantee always holds and the reissue audit chain is intact.
- **Backend helpers** — src/lib/attendance-sites.ts (server-only, service-role; caller-agnostic):
  reads listAttendanceSites / getAttendanceSite / getActiveQrToken / getQrTokenHistory; writes
  createAttendanceSite / updateAttendanceSite / setAttendanceSiteActive / issueAttendanceQr
  (via the RPC) / evokeAttendanceQr; generateAttendanceQrToken() makes a site-specific
  tt_<base64url> token. Every helper is **organization-scoped**. They DO NOT check the caller —
  **owner-only enforcement is the caller's responsibility** and is deferred to the web-dashboard server
  actions (ole === 'owner', server-side). Wi-Fi SSIDs are stored on the site; Wi-Fi attendance stays
  inactive.
- **Dev temp-QR tool** — GET /api/dev/attendance/temp-qr (gated exactly like /api/dev/seed-login:
  NODE_ENV=development + ENABLE_DEV_SEED_LOGIN=true + local/LAN host; 404 otherwise). Resolves the
  logged-in session's org, ensures a temp site, ensures an active QR (or ?reissue=1 to force a fresh
  one), and renders a **scannable QR** (SVG via the qrcode dependency) plus the token; ?format=json
  returns the raw data. Not owner-gated — it's a local testing tool.

**Step-2 follow-up (2026-06-22): owner-only web settings bridge shipped.** `/admin/settings/attendance`
is now the first owner-facing site/QR page. It uses the existing helper layer (no schema change) and
adds owner-enforced server actions for:

- site create/update with `name`, `latitude`, `longitude`, and `allowed_radius_meters`
- active-QR issue/reissue for the selected site
- scannable QR rendering in the admin page itself (SVG via `qrcode`)

This is intentionally **not** the full attendance dashboard: no review queue, payroll, export, or
totals UI, and no broader site-history/revoke management surface yet. The dev temp-QR route remains for
local-only testing. Still pending for the worker app (Step 3+): clock-in/out + break + correction
execution.

**Pending migrations to apply:** `202606170001_attendance_payroll.sql` + `202606170002_issue_attendance_qr_fn.sql`.

## As-built — Step 3 (GPS + QR clock-in / clock-out core, 2026-06-17)
The worker attendance UI is now FUNCTIONAL for GPS + QR clock-in and clock-out, wired into the existing
design (no redesign). Breaks, corrections, payroll, and notifications remain out of scope.

- **One server action** `submitAttendanceScan({ mode, token, latitude, longitude, accuracy, gpsError,
  userAgent })` in `src/app/mobile/attendance/actions.ts` (service-role writes; all validation
  server-side) drives both clock-in (`mode:"in"`) and clock-out (`mode:"out"`). Returns a discriminated
  result the UI maps to the result sheet: `{ ok:true, kind, siteName, atIso, timeLabel, method:"gps_qr" }`
  or `{ ok:false, reason: "gps"|"radius"|"qr"|"open_session"|"no_session"|"error", ??}`.
  - **QR**: token must resolve to an **active** `attendance_qr_tokens` row in the caller's org; the site
    is resolved through the token and must be active. Invalid/inactive ??`qr_invalid` (or
    `qr_scan_failed` when no token decoded).
  - **GPS mandatory**: missing/denied ??`gps_denied` / `gps_unavailable`. Distance to the resolved
    site is computed with **haversine**; beyond `allowed_radius_meters` ??`outside_radius` (the failure
    returns the real distance + radius for the sheet).
  - **Clock-in** enforces **one open session per user** (`open_session_exists` on violation), then
    inserts an `open` session storing Tokyo `operating_date`, `clock_in_at`, site, `method:"gps_qr"`,
    QR token ref, lat/long/accuracy, and `clock_in_device_info` (user agent).
  - **Clock-out** requires an existing open session (else fails ??recorded as `success=false`, no enum
    failure reason exists for "no open session"); completes it with the clock-out fields. **Midnight
    baseline:** if the clock-out Tokyo date ??the session's `operating_date`, the session is flagged
    `review_state='review_required'` (no silent normalization; full midnight sweep is a later step).
  - **Every attempt** (success and each failure branch) is logged to `attendance_attempt_logs` with
    `action_type`, `method:"gps_qr"`, `success`, `failure_reason`, `resolved_site_id`, and the GPS/device
    fields. Attempt logs are the Step-3 auditability surface; session-level `attendance_session_audits`
    are for manager edits (later steps) and need no row for normal worker clock-in/out.
- **Capture UI** (`src/components/attendance/attendance-capture.tsx`) rewritten to be functional while
  preserving the design: in-app **camera QR scan** via the `jsqr` dependency (added this step) over a
  live `<video>` + canvas frame loop, device **GPS** via the Geolocation API, both sent to the action.
  The result sheet renders the real success summary or the matching failure and reuses the app's shared
  **`useSheetDragDismiss`** bottom-sheet (no attendance-specific sheet behavior). `mode` = in/out
  (`?mode=out`); Wi-Fi chip stays `以鍮꾩쨷`.
- **Home** (`attendance-home.tsx` + `page.tsx`) now renders from REAL data via
  `getCurrentOpenSession` (`src/lib/attendance-sessions.ts`): an open session ??洹쇰Т 以?with a live
  per-second elapsed timer, real site name + clock-in time, and **?닿렐?섍린 ??`/mobile/attendance/capture?mode=out`**;
  no open session ??異쒓렐 ?? `?state=` is retained only as a static design-preview override. The ?닿쾶
  ?쒖옉 button is unchanged (breaks are a later step).
- **Token format**: the on-site QR encodes the raw token string (as the dev temp-QR tool emits); the
  client decodes it and the server resolves the site. **i18n:** the attendance slice was wired first
  with Korean strings consistent with the design port; a dedicated ko/ja/en i18n pass was completed
  after Step 14 (see "As-built ??i18n pass" below).

Still pending (Step 4+): break start/end (with clock-out-blocked-while-break-open), correction request
submit/review, own history + admin review queries, payroll (employment/rate history, expected pay,
monthly finalization, dashboard), export, notifications (incl. the 18:30 reminder), and the full
midnight-crossing sweep. Wi-Fi stays inactive.

## As-built ??Step 4 (break tracking, 2026-06-17)

Break start/end is now functional for the open session, wired into the existing home design. Same logic
for salaried and hourly users (only later hourly pay excludes recorded break time).

- **Two server actions** in `src/app/mobile/attendance/actions.ts` (service-role; no form, return a
  result object):
  - `startBreak()` ??requires an open session and **no** already-open break, then inserts an
    `attendance_breaks` row with `started_at`. Fails with `no_session` / `already_on_break`.
  - `endBreak()` ??requires an open session and an open break, then sets `ended_at` on the latest open
    break. Fails with `no_session` / `no_open_break`.
  - Both `revalidatePath("/mobile/attendance")`. **Multiple breaks per session** are supported; rows are
    preserved individually (never collapsed to a single total), so later hourly pay can sum closed break
    durations and compute paid = worked ??breaks.
  - Break start/end are intentionally **not** logged to `attendance_attempt_logs` ??that table's `method`
    is GPS/QR-oriented and required, and breaks involve neither; the `attendance_breaks` rows are the
    record.
- **Clock-out blocking** ??the Step-3 clock-out path now checks for an open break on the session right
  after resolving the open session; if one exists it **fails with `open_break` (logged as
  `open_break_blocks_clock_out`) and does NOT auto-close the break**. The capture result sheet renders a
  "?닿쾶 醫낅즺 ???닿렐?????덉뼱?????덉쑝濡? message. (The home also disables ?닿렐?섍린 while on break, so this
  is defense-in-depth.)
- **Home wiring** (`attendance-home.tsx` + `attendance-sessions.ts`): `getCurrentOpenSession` now also
  returns `openBreakStartedAt` (on-break flag), `closedBreakSeconds` (sum of closed breaks), and
  `breakCount`. The page derives state: open session **with** an open break ???닿쾶 以? open session ??  洹쇰Т 以? none ??異쒓렐 ?? The 洹쇰Т 以?state's ?닿쾶 ?쒖옉 button calls `startBreak`; the ?닿쾶 以?state
  renders live (current break mm:ss, worked = elapsed ??total break, running ?닿쾶 ?⑷퀎 + ?닿쾶 ?잛닔) and
  its ?닿쾶 醫낅즺 button calls `endBreak`; ?닿렐?섍린 stays disabled while on break. Both buttons
  `router.refresh()` on success. No redesign ??same classes/structure; `?state=` previews retained.
- **States rendered for real**: no open session (異쒓렐 ??, open + not on break (洹쇰Т 以?, open + on break
  (?닿쾶 以?. A completed session's break history surfaces later with the history view (Step 5+); breaks
  are stored per-row now so it can.

Still pending (Step 5+): correction request submit/review, own history + admin review queries, payroll,
export, notifications, and the full midnight sweep.

## As-built ??Step 5 (self-view history, 2026-06-17)

Own attendance history is now a real, **self-only** screen. The v2 design handoff had no ?대젰 frame, so
this screen is **new, built in the existing `.att` design language** (user-confirmed 2026-06-17) ??not a
redesign of an existing screen.

- **Self-view query layer** `src/lib/attendance-history.ts` (server-only, service-role, **strictly
  self-scoped** ??every query filters `user_id = <authenticated user>` + org; no client-supplied target
  user, so params/query-string tampering cannot reach another user's data):
  - `getAttendanceHistory(org, userId, ym?, limit=60)` ??`AttendanceSessionView[]` (newest first by
    Tokyo `operating_date` then clock-in). When `ym` (YYYY-MM, Tokyo) is supplied, results are bounded
    to that operating month (`operating_date >= ym-01` and `< nextMonth-01`); omitted = all (capped by
    `limit`). Resolves each session's **break rows** (one batched query) and
    **site names** (one batched query); computes Tokyo time labels, closed-break total, and worked
    seconds for completed sessions (in?뭥ut minus closed breaks). Exposes `status`, `reviewState`,
    `manualCreated`, and `isAbnormal` ??leaving room for a later `correctionStatus` / expected-pay /
    finalized-vs-estimated field without a rewrite.
  - `getAttendanceTodaySummary(org, userId)` ??today's (Tokyo) session count, on-open flag, worked +
    break totals (the open session's worked is computed at load; the home keeps the live ticker).
- **History screen** `/mobile/attendance/history` (`src/app/mobile/attendance/history/page.tsx` +
  `src/components/attendance/attendance-history.tsx`): same auth/org guards as the other attendance
  routes. Renders the today-summary strip + a session list (date, clock-in/out time + site, status /
  review / manual chips reusing the existing `.att` chip palette, worked + break totals). Tapping a card
  opens a **detail bottom sheet** (the app's shared `useSheetDragDismiss`) with clock-in/out details,
  methods, the **break rows**, and an abnormal/review marker. Minimal history-only CSS was appended to
  `attendance.css` (scoped under `.att`, token-based). A discreet **?대젰** link was added to the home
  topline. No existing screen was restructured; `?state=` previews and Steps 3?? wiring are unchanged.
- **Self-only safety** is enforced server-side in the query layer (not UI hiding). Reads use the
  service client but always pin `user_id` to the session user + org.

Still pending (Step 6+): correction request submit/review, admin review queue, payroll
(employment/rate history, expected pay, monthly finalization, dashboard), export, notifications, and the
full midnight sweep. The query layer is shaped to absorb correction indicators + pay views later.

## As-built ??Step 6 (correction / exception requests, 2026-06-17)

The worker correction flow is now functional, wired into the existing `/mobile/attendance/correction`
form + `??correction/status` screens (these already existed as prototypes). **Request creation only ??no admin approve/reject, no session mutation, no auto-apply** (Step 7).

- **Create action** `createAttendanceCorrectionRequest(input)` (`src/app/mobile/attendance/actions.ts`,
  service-role) inserts an `attendance_correction_requests` row (status `requested`). **Self-only +
  month-range enforced server-side:** a linked `sessionId` must be the caller's own session (else
  `forbidden`); the base date (the linked session's `operating_date`, or today for an exception request)
  must fall in the **current or previous Tokyo month** (else `out_of_range`). Reason is one of the six
  documented types; memo optional; desired clock-in/out wall times are combined with the base date into
  Tokyo instants; a single desired site applies to both in/out columns (design's "異??닿렐 ?숈씪"); photos
  capped at 5. The request **never touches the session** ??it only suggests values.
- **Exception path:** a request with no `sessionId` (reached from the capture failure sheets' "?뺤젙 ?붿껌"
  buttons) is supported in the same model (base date = today). A non-owned `sessionId` degrades to an
  exception request rather than leaking the other user's session.
- **Photos** reuse the app's `compressImageFile` + `uploadRequestImages` (`request-images` bucket, new
  `attendance-corrections/` folder). Storage RLS migration `202606170003_attendance_correction_storage.sql`
  whitelists that folder (with the part-time carve-out, since attendance is open to all members).
  `RequestImageType` gained `attendance-corrections`.
- **Form** (`attendance-correction-form.tsx`) is now controlled: reason chips (Korean ??enum), native
  time inputs for desired in/out (prefilled from the source session), a **desired-site picker** in a
  shared drag-dismiss sheet, memo, and a real photo picker (??, compress + preview + remove). Submit
  uploads photos then calls the action and routes to the status screen. The page (`correction/page.tsx`)
  loads the optional self-scoped session context + active sites.
- **Status** (`attendance-correction-status.tsx`) is data-driven from a `CorrectionRequestView`
  (`src/lib/attendance-corrections.ts` ??`getCorrectionRequestView`, by id or latest, self-scoped):
  steps + recap (????ъ쑀/?щ쭩 ?쒓컖/?μ냼/泥⑤?/硫붾え) + review block. All four states (requested /
  in_review / approved / rejected) render so Step 7 lights up without redesign; `review_comment` /
  reviewer are carried through already.
- **Self-history surfacing:** `getAttendanceHistory` now attaches the latest `correctionStatus` per
  session (via `getCorrectionStatusBySession`); the history cards/detail show a ?뺤젙 ?붿껌??寃?좎쨷/?뱀씤/諛섎젮
  chip, and the detail sheet offers "???몄뀡 ?뺤젙 ?붿껌" (or "?뺤젙 ?붿껌 ?곹깭 蹂닿린").
- **Self-only safety:** every correction read/write pins `requested_by_user_id` / session ownership to
  the authenticated user server-side; params/query-string tampering cannot reach another user's data.
- **Step-7 compatibility:** the row already carries `status` (requested?뭝n_review?뭓pproved/rejected),
  `review_comment`, `reviewed_by_user_id`, `reviewed_at`; no value is auto-applied, so the admin review
  + authoritative-application step can be added without reshaping the data.

**Pending migration to apply:** `202606170003_attendance_correction_storage.sql` (correction-photo
storage). Still pending (Step 7+): admin review queue + approve/reject + authoritative correction
application, manual admin session create/update, payroll, export, notifications, full midnight sweep.

## As-built ??Step 7 (admin review + correction approve/reject, 2026-06-17)

The admin correction-review **backend** is functional: an org-wide review-queue query layer + the
approve/reject/in-review actions with authoritative application + audit. Per the user-confirmed build
surface (2026-06-17), the **review-queue UI is built in the WEB DASHBOARD later** ??this step ships the
backend it will call. Worker self-view reflects the outcome with no UI change. **No** manual session
creation / payroll / finalization / dashboard / export / notifications here.

- **Privilege gate** `isAttendancePayrollAdmin(service, org, userId)` (`src/lib/attendance-review.ts`) =
  platform admin, OR active `owner` / `attendance_payroll_admin` member. Site-master management stays
  owner-only (untouched). Enforced server-side in every write action; the read query is caller-agnostic
  and the dashboard must gate it.
- **Review queue** `getAttendanceReviewQueue(org, params)` (caller-agnostic, org-wide): documented
  filters `all` / `review_required` / `correction_requested` / `incomplete` / `manual` /
  `not_finalized` + name search + date range + site filter; resolves worker name, date, clock-in/out
  time + site + method, break total, paid duration (completed), status / review state, correction
  status, manual marker; ordered review-required ??correction-requested ??incomplete ??normal, then
  recency. (`not_finalized` = current Tokyo month for now ??the finalized-snapshot exclusion plugs in at
  Step 8.)
- **Actions** `src/app/admin/attendance/actions.ts` (`"use server"`, service-role, all privilege-gated):
  - `setCorrectionInReview(requestId)` ??`requested` ??`in_review` (request-only; no session change).
  - `approveCorrectionRequest({ requestId, finalClockInAt?, finalClockOutAt?, finalSiteId?, comment? })`
    ??**authoritative application**: final values default to the requester's proposals but the admin can
    override; the linked session's clock-in/out times + sites are updated, a still-open session that now
    has both ends becomes `completed`, and `review_state` ??`approved_correction` (so the session no
    longer looks unresolved). An `attendance_session_audits` row (`correction_apply`, actor, reason =
    comment or "?뺤젙 ?붿껌 ?뱀씤", before/after JSON) is written. The request is marked `approved`
    (review_comment optional, reviewer + time). Session-less (exception) requests are marked approved but
    not applied (manual session creation is Step 8).
  - `rejectCorrectionRequest(requestId, comment)` ??**comment required**; the request is marked
    `rejected` (reviewer + time + comment); the **session is left entirely unchanged** (a rejected
    proposal must not silently alter authoritative data). The rejection is auditable on the request row.
- **Coherence:** the correction request status is the lifecycle source of truth (surfaced as the
  self-history chip from Step 6). Approve resolves the session (`approved_correction` + applied values);
  reject leaves it as-is (still visible/abnormal if it was). User proposals never auto-apply.
- **Self-view reflection:** approve/reject/in-review `revalidatePath` the worker history + correction
  status + home; those dynamic routes re-read fresh, so the requester sees the new request status and
  any authoritative session change on next load ??no self-view redesign.

Still pending (Step 8+): manual admin session create/update/invalidate, payroll (employment/rate
history, expected pay, monthly finalization snapshots, dashboard), export, notifications, full midnight
sweep, and the owner-only site/QR + review-queue **web-dashboard UI**.

## As-built ??Step 8 (manual admin attendance management, 2026-06-17)

Privileged manual attendance **backend** ??create / authoritatively update / invalidate sessions, each
with a mandatory reason + audit. **No admin PC/web dashboard is built** (explicit scope rule): these are
the backend the deferred web dashboard will call; there is no existing app-side privileged UI to wire
into, and no new UI was created. owner / `attendance_payroll_admin` only (server-enforced); site-master
stays owner-only.

- Actions appended to `src/app/admin/attendance/actions.ts` (`"use server"`, service-role, privilege-gated
  via `isAttendancePayrollAdmin`):
  - `createManualAttendanceSession({ userId, operatingDate, clockInTime, clockOutTime, clockInSiteId,
    clockOutSiteId, reason })` ??target must be an **active member**; sites validated against the org;
    times combine with the Tokyo `operatingDate`; `clockOutTime` present ??`completed`, else `open`
    (guarded against the one-open-session collision). Stores `manual_created = true`,
    `manual_created_by_user_id`, `manual_created_reason`, methods `manual`. Audit `manual_create`.
  - `updateAttendanceSessionAdmin({ sessionId, reason, clockInTime?, clockOutTime?, clockInSiteId?,
    clockOutSiteId?, reviewState? })` ??per-field tri-state (omit = keep, null = clear, value = set);
    sites/reviewState validated; status coherence (both ends ??completed; cleared end ??open; an
    `invalid` session is not auto-revived). Audit `manual_update` with before/after.
  - `invalidateAttendanceSession(sessionId, reason)` ??sets `status='invalid'` + `invalidated_at /
    _by_user_id / _reason`; **never hard-deletes**. Audit `invalidate`.
  - All require a non-empty reason (also a DB CHECK on the audit row) and `revalidatePath` the worker
    self-view + home.
- **Reflection (no UI change):** manual/invalidated sessions already render in the existing flows ??the
  review-queue layer (`manual` filter, `manual_created` marker, `invalid` status), and the worker's own
  history (?섎룞 chip via `manualCreated`, 臾댄슚 chip via `invalid` status). Invalidated records remain
  **historically visible** (not deleted). Manual completed sessions carry clock-in/out + (no) breaks, so
  later paid-minute / snapshot / export logic computes from them unchanged.

Still pending (Step 9+): payroll (employment/rate history management, expected pay, monthly finalization
snapshots, dashboard totals), export, notifications, full midnight sweep, and the owner-only site/QR +
review-queue + manual-management **web-dashboard UI** (deferred until the app is complete).

## As-built ??Step 10 (hourly expected-pay + self monthly pay view, 2026-06-17)

Hourly **expected** (not finalized) gross-pay calculation + a new self monthly pay screen, wired to real
data. **No admin PC/web dashboard** (explicit scope rule). The 湲됱뿬 screen is **new UI in the existing
`.att` language** (the handoff had no 湲됱뿬 frame; user asked for an arbitrary screen to refine later).

- **Calculation layer** `src/lib/attendance-pay.ts` (server-only; pure helpers reusable by the later
  finalization/snapshot/export steps):
  - `resolveEffective(rows, date)` ??effective-date resolution (the segment covering a Tokyo date,
    latest `effective_from`); a rate/employment change applies to that **whole day**, never retroactive.
  - `paidSecondsForSession` (worked ??closed breaks, ??), `roundToNearest10` (monthly final layer only).
  - **Usable session** = `completed` + both clock ends + `review_state ??{normal, approved_correction}`
    + correction status ??{requested, in_review}. Excluded: open/reopened/invalid, review_required,
    pending correction. Paid minutes in **1-minute units**; breaks excluded; no premiums.
  - `getMonthlyPayView(org, userId, ym)` (self-scoped) ??month label, `expectedGross` (rounded to 10
    yen), `totalPaidMinutes`, `excludedCount` (hourly-day sessions excluded), `rateSegments` (per rate),
    and a `days[]` daily breakdown (per session in/out, break, paid minutes, daily gross, include flag +
    exclude reason). Per-day employment type decides eligibility: **salaried days never pay**;
    `salariedOnly` months return no totals.
- **Self pay screen** `/mobile/attendance/pay` (`attendance-pay.tsx`): month nav (`?ym=`), expected-gross
  hero, excluded-count warning, rate-segment breakdown (when rates changed), daily list whose rows open
  a **detail bottom sheet** (shared `useSheetDragDismiss`) with that day's sessions; salaried/empty
  states. A 湲됱뿬 link sits next to ?대젰 in the home topline. Self-only (server-scoped).
- **Real-time before finalization:** the view recomputes from current usable attendance ??completed
  sessions, break changes, approved corrections, and rate/employment history all move the number. No
  lock/snapshot here.
- **Rate-data note (Step 9 still pending):** the proper owner/`attendance_payroll_admin` employment-type
  + hourly-rate **management** (writing `employment_type_history` / `hourly_rate_history`) is NOT built
  yet ??it belongs to the deferred web dashboard. Until then those tables are empty, so for **app
  testing** a dev-only `GET /api/dev/attendance/seed-pay` (gated like `/api/dev/seed-login`) seeds the
  caller's employment type + rate. Pay shows 짜0 / empty until a rate exists.

Still pending (Step 11+): monthly finalization snapshots + reopen, dashboard totals, export,
notifications, full midnight sweep, the employment/rate **management** backend (Step 9), and the
owner/admin **web-dashboard UI**.

## As-built ??Step 11 (per-person monthly finalization + reopen + snapshot, 2026-06-18)

Per-person per-month finalization is now functional as a **privileged backend** (owner /
`attendance_payroll_admin`), with the worker self pay view reflecting finalized vs expected. **No admin
PC/web dashboard** (the finalize/reopen UI is in the deferred web dashboard); the only app-side change is
the worker's own pay screen showing the finalized number + badge.

- **Eligibility** `getFinalizationEligibility(org, userId, ym)` (`src/lib/attendance-finalization.ts`,
  server-side) ??finalize is **blocked** while any unresolved item remains for that user-month:
  `review_required` sessions, **pending correction requests** (requested/in_review on the month's
  sessions), **open/incomplete** sessions, or an already-finalized snapshot (must reopen first). Returns
  `{ eligible, blockers }`.
- **Finalize** `finalizeAttendanceMonth({ userId, ym })` (`src/app/admin/attendance/actions.ts`,
  privilege-gated): target must be an active member; eligibility must pass; the month must be hourly
  (`getMonthlyPayView.hourlyEligible`, else `not_hourly`). Computes the final gross from the **same
  expected-pay helpers** and inserts an `attendance_month_snapshots` row (`status='finalized'`,
  `target_month` = `YYYY-MM-01`, `total_paid_minutes`, `gross_amount` rounded to 10 yen, `rate_breakdown`
  JSON, `finalized_by_user_id`, `finalized_at`, `supersedes_snapshot_id`). Any prior non-superseded row
  for that user-month is marked `superseded` (history preserved, linked). Audited in `audit_logs`
  (`attendance_month_finalize`).
- **Reopen** `reopenAttendanceMonth({ userId, ym, reason })` (privilege-gated, **reason required**):
  flips the current `finalized` row to `reopened` (kept as history; no `finalized` row remains ??  **expected pay resumes**). Prior finalized history is never destroyed; a later finalize supersedes the
  `reopened` row and links via `supersedes_snapshot_id`. Audited in `audit_logs`
  (`attendance_month_reopen`, with the reason). (Snapshot audit uses the generic `audit_logs` table ??no
  schema change ??since `attendance_session_audits` is session-scoped.)
- **Snapshot lifecycle:** `draft`(unused) ??`finalized` ??(reopen) `reopened` ??(re-finalize) prior rows
  `superseded` + new `finalized`. At most one `finalized` per user-month at a time; all prior rows
  remain as history with `supersedes_snapshot_id` links ??ready for later export / total-labor dashboard
  / historical comparison.
- **Self-view reflection:** `getMonthlyPayView` now also reads the current `finalized` snapshot and
  returns a `finalization` block; the pay screen shows the **locked finalized gross + a ?뺤젙 badge +
  finalized time** when present (hiding the excluded-count warning), and reverts to expected pay after a
  reopen ??no self-view redesign.

Still pending (Step 12+): org-wide total-labor **dashboard**, **export** generation (finalized data
only, `attendance_export_logs`), **notifications** (18:30 reminder, correction/finalize outcomes), full
midnight sweep, the employment/rate **management** backend (Step 9), and the owner/admin **web-dashboard
UI** (deferred until the app is complete).

## As-built ??Step 12 (privileged payroll totals data layer, 2026-06-18)

The org-wide payroll-totals **data layer** only ??**no dashboard UI, no pages, no charts/cards, no admin
web route** (explicit scope rule). No existing app screen expects org-wide totals, so this step is
backend/query-only; the future web dashboard (and export) consume it.

- `getPayrollTotals(org, ym)` (`src/lib/attendance-payroll-totals.ts`, server-only) returns the
  documented metrics for a Tokyo month:
  - **`finalizedLaborTotal`** / `finalizedPaidMinutes` / `finalizedWorkerCount` ??sum of `finalized`
    `attendance_month_snapshots` (Step 11) for the month. **Finalized data only**; never mixed with
    expected.
  - **`expectedLaborTotal`** / `expectedPaidMinutes` / `relevantHourlyWorkerCount` ??the currently
    projected gross over relevant **hourly** workers (those with attendance this month), computed by
    reusing each worker's `getMonthlyPayView().expectedGross` so the totals match the self-view and obey
    the same usable-session/exclusion rules. Salaried workers are not finalization targets and are
    excluded.
  - **`unfinalizedWorkerCount`** ??relevant hourly workers without a `finalized` snapshot this month.
  - **`siteTotals`** ??expected labor aggregated by **clock-in site** (the documented first-slice rule),
    from each included session's exact gross; null-site bucket = "誘몄???.
- **Privilege:** caller-agnostic (org + ym), like the review-queue layer ??the **caller MUST gate with
  `isAttendancePayrollAdmin`** (owner / `attendance_payroll_admin`); the `attendance_month_snapshots`
  admin-only SELECT RLS is the backstop. Regular users / hourly workers never reach it (they only see
  their own pay). Expected vs finalized stay explicitly separate in the contract.
- Shaped for direct reuse by the later dashboard UI, export, and historical snapshot reporting; no
  BI-style over-design.

Still pending (Step 13+): **export** generation (`attendance_export_logs`), **notifications**, full
midnight sweep, the employment/rate **management** backend (Step 9), and the owner/admin **web-dashboard
UI** including the totals dashboard (all deferred until the app is complete).

## As-built ??Step 13 (finalized-only payroll export, 2026-06-18)

Privileged finalized-only payroll export (monthly bulk + per-person) + export audit logging. **No admin
dashboard/export UI** (the export trigger UI is in the deferred web dashboard); no app screen expects
export, so this is backend + a dev test route.

- **Export lib** `src/lib/attendance-export.ts` ??`runPayrollExport(service, org, actorId, { scope, ym,
  userId? })`:
  - **Privilege enforced here** (`isAttendancePayrollAdmin`; owner / `attendance_payroll_admin`) ??    `forbidden` otherwise. Regular users can never export.
  - **Finalized-only, strict:** gathers `attendance_month_snapshots` with `status='finalized'` for the
    Tokyo `target_month` (all users for `monthly_bulk`; the one user for `single_user`). Draft /
    reopened / superseded / non-finalized are never included. Empty bulk ??`empty`; missing per-person ??    `not_finalized`.
  - **Format foundation:** the operator's final Excel template is still pending, so it emits a clean,
    structured **CSV with a UTF-8 BOM** (Excel-friendly Korean) whose columns map 1:1 to the documented
    snapshot fields (??곸썡 쨌 吏곸썝 쨌 吏곸썝ID 쨌 ?좉툒(遺? 쨌 ?좉툒?쒓컙 쨌 珥앷툒??쨌 ?쒓툒援ш컙 쨌 ?뺤젙??쨌 ?뺤젙?쒓컖).
    The row builder is separate from the serializer, so the final template slots in later without
    touching the data layer.
  - **Audit:** writes an `attendance_export_logs` row (organization, `target_month`, `export_scope`,
    `user_id` for single, `snapshot_ids[]`, `exported_by_user_id`, `meta` = { ym, row_count, filename,
    format }). Returns `{ filename, csv, logId, rowCount, snapshotIds }`.
- **Server actions** `src/app/admin/attendance/actions.ts`: `exportMonthlyPayroll(ym)` /
  `exportUserPayroll(userId, ym)` ??thin session wrappers around `runPayrollExport`, returning the CSV
  for the (deferred) web-dashboard caller to download.
- **Dev test route** `GET /api/dev/attendance/export?scope=??ym=??&userId=??` ??gated like
  `/api/dev/seed-login` **and** still privilege-gated by `runPayrollExport`; streams the CSV as a
  download so the export is testable before the dashboard exists.
- **Future compatibility:** the structured rows + `attendance_export_logs` (with `snapshot_ids`) support
  the later operator Excel template, dashboard/reporting, and historical snapshot auditing without a
  redesign.

Still pending (Step 14+): **notifications** (18:30 reminder, correction/finalize outcomes), full
midnight sweep, the employment/rate **management** backend (Step 9), and the owner/admin **web-dashboard
UI** (site/QR 쨌 review queue 쨌 manual mgmt 쨌 rate mgmt 쨌 finalize/reopen 쨌 totals dashboard 쨌 export ??all deferred until the app is complete). The final operator Excel **export template** also remains
pending (interim CSV is in place).

## As-built ??Step 14 (attendance notifications + 18:30 reminder, 2026-06-18)

Attendance notifications use the **shared** notification system (no separate attendance notifier). One
discriminated type **`attendance_activity`** (migration `202606180001`) carries every event via
`payload.event` (`correction_created` / `abnormal_session` / `open_session_reminder`), mirroring
`suggestion_activity`. **No admin dashboard UI** ??admins receive in-app notifications via the existing
notification center; the privileged review/manage UI stays in the deferred web dashboard.

- **Types/display/i18n:** `AttendanceNotificationPayload` + guard (`notifications/types.ts`); a display
  branch + kind label (`notifications/display.ts`); `mobile.notifications.attendance*` copy in **ko/ja/en**.
- **Create helpers** (`notifications/create.ts`): `notifyAttendanceAdmins` (fan-out to caller-resolved
  owner / `attendance_payroll_admin` ids, actor-skipped, deduped ??never broadens visibility) and
  `createAttendanceOpenSessionReminder` (worker, deduped once per Tokyo day). Admin ids come from
  `getAttendancePayrollAdminUserIds` (`attendance-review.ts`).
- **Admin alerts (synchronous):** `createAttendanceCorrectionRequest` fans out `correction_created` to
  admins (never the requester); the clock-out path fans out `abnormal_session` on a midnight-crossing
  session. **Privacy:** only privileged users receive these; regular workers never see org-wide
  attendance/payroll issues.
- **Worker 18:30 reminder:** a **once-per-Tokyo-day home prompt** (shared drag-dismiss sheet) shows when
  the user has an open session and Tokyo time ??18:30 and they haven't answered today. **"洹쇰Т 以묒씠?먯슂"**
  records `still_working` (suppresses the prompt the rest of the day); **"?대? ?닿렐?덉뼱??** records
  `left_work` and **routes to the correction flow** (`/mobile/attendance/correction?sessionId=??) ??it
  **does NOT auto clock-out**. State lives in `attendance_open_session_reminders` (migration `202606180002`,
  unique per user+operating_date) via the self-only `respondOpenSessionReminder` action.
- **Scheduled evaluator:** `runAttendanceReminders` + `GET /api/attendance/reminders` (CRON_SECRET-gated,
  mirrors `/api/tasks/reminders`) creates the deduped worker reminder notification for open-session users
  past 18:30, and fires the admin **incomplete/stale** alert for sessions still open from a prior Tokyo
  day. Wire to Vercel Cron at ~18:30 Asia/Tokyo.
- **Deep-links:** worker reminder ??`/mobile/attendance` (home prompt); admin alerts ??`/mobile/attendance`
  (the in-app privileged review surface is the deferred web dashboard, so admin notifications currently
  deep-link to the attendance home).

This is the **final attendance/payroll app-scope step.** Intentionally deferred (document-only): the
owner/admin **web-dashboard UI** (site/QR 쨌 review queue 쨌 manual mgmt 쨌 employment/rate mgmt [Step 9] 쨌
finalize/reopen 쨌 totals dashboard 쨌 export), the operator Excel **export template**, the full
**midnight sweep**, and **Web Push** delivery (notifications are in-app only).

## As-built ??Bug fixes + i18n pass (2026-06-18)

Three correctness fixes shipped as migration `202606180003_attendance_session_fixes.sql`:

1. **Finalization order fix (Bug 1):** `finalizeAttendanceMonth` now inserts the new snapshot row
   **before** superseding the previous one. The old order (supersede ??insert) left a window where a
   failed insert would permanently destroy the last finalized copy. The safety margin is reinforced by
   also excluding the newly inserted row from the supersede UPDATE via `.neq("id", ins.data.id)`.

2. **Session-less correction blocking (Bug 2):** `attendance_correction_requests` gained a
   `target_month date` column (nullable; existing rows default null). Session-less exception correction
   requests now store `target_month` on insert so `getFinalizationEligibility` can find them with a
   separate `IS NULL session_id` + `target_month = firstDay` query alongside the session-linked check.
   Without this, a pending exception request would not block monthly finalization.
   A partial index (`WHERE session_id IS NULL`) covers the new query path. `src/types/database.ts`
   updated (Row/Insert/Update types for `attendance_correction_requests`).

3. **Org-isolated reminder uniqueness (Bug 3):** The `attendance_open_session_reminders` unique
   constraint was `(user_id, operating_date)` ??a user shared across organizations would collide.
   The migration drops the old constraint and adds `(organization_id, user_id, operating_date)`.
   All open-session queries in `src/app/mobile/attendance/actions.ts` (`submitAttendanceScan`,
   `startBreak`/`endBreak`, reminder response) now include an explicit
   `.eq("organization_id", organizationId)` filter; the `getOpenSessionId` helper was updated to
   accept and apply `organizationId`. The reminder upsert `onConflict` clause updated to match.

**Attendance i18n pass (2026-06-18):** all attendance UI strings are now fully localized (ko/ja/en).
Each screen receives a `copy: Dictionary["attendance"]` prop threaded from the page via `getDictionary`.

- `attendance-home.tsx` ??ring states, clock-in/out buttons, break labels, reminder body, name
  suffix (`userNameDisplay`), preview fallback site (`previewSite`), static break preview ordinal.
  `GPS + QR`, `GPS+Wi-Fi`, and `Wi-Fi` method labels are **intentionally retained as literal labels**
  across the attendance UI (method chips + history/detail surfaces) because they are treated as
  universal technical standards, not locale-specific copy.
- `attendance-capture.tsx` ??GPS status, scan hints, all 8 ResultSheet cases
- `attendance-history.tsx` ??today summary, session list, status chips, detail sheet, abnormal note
- `attendance-correction-form.tsx` ??reason chips, all form fields, error messages, picker
- `attendance-correction-status.tsx` ??META labels, step bar, recap fields, review block
- `attendance-pay.tsx` ??duration formatting, amount formatting, exclusion reasons, day breakdown
- Pages: `correction/page.tsx`, `correction/status/page.tsx`, `pay/page.tsx`, `history/page.tsx`
  all call `getDictionary(session.user.preferredLanguage)` and forward `copy={dict.attendance}`.
- `src/lib/i18n.ts`: ~112 new keys added to the `attendance` section (en/ko/ja), grouped as:
  Home 쨌 Session status chips 쨌 History 쨌 Correction form 쨌 Correction status 쨌 Pay.

## As-built ??History/Pay redesign + month switcher (2026-06-18)

UI-only pass over the self history + pay screens (no policy/schema change beyond the `ym` filter param):

- **`historyTitle` renamed** ko `洹쇳깭 ?대젰` / ja `?ㅶ졾괘閭? / en `Attendance History` (was `異쒗눜洹??대젰` /
  `?븅?ㅵ괘閭? / `Clock History`). Single source in `i18n.ts`; used by the page `<h1>` and shell title.
- **Shared `MonthSwitcher`** (`src/components/attendance/month-switcher.tsx`, client): `??prev 쨌 [month ??
  쨌 next ?? pill. Arrows navigate `?ym=YYYY-MM` (prev/next disabled at the 12-month window edge / current
  month). Clicking the label opens a **custom (non-native) dropdown** listing the last 12 months
  (selected row highlighted + check); options/arrows `router.push` the new `ym`. Month labels are
  `Intl.DateTimeFormat(locale)` (year-prefixed only when it differs from the current year). Both the
  history and pay title rows use it; CSS `.msw*` appended to `attendance.css` (scoped, token-based).
  `caret` (chevron-down) icon added to `att-icons.tsx`.
- **History month scoping:** `history/page.tsx` now reads `?ym` (defaults to current Tokyo month) and
  passes it to `getAttendanceHistory(org, userId, ym)`. The today-summary card renders **only for the
  current month** (`ym === currentYm`); past months show just the month's session list (empty state when
  none).
- **Pay month nav:** `pay/page.tsx` drops the old `prevYm/nextYm/isCurrentMonth` props (and the local
  `shiftYm`) ??`AttendancePay` now takes `currentYm` and derives `isCurrentMonth` internally; the old
  two-button `seg-month` toggle is replaced by `MonthSwitcher`.
- **Detail sheets migrated to the canonical `BottomSheet`** (`src/components/shell/bottom-sheet.tsx`) on
  both screens, replacing the hand-rolled `.dim`/`.rsheet` + `useSheetDragDismiss` markup ??restoring the
  app-standard slate scrim + drag-to-dismiss contract. The pay **誘몃컲??湲곕줉 N嫄?* banner is now a button
  that opens a sheet listing each excluded session (date 쨌 in?뱋ut 쨌 reason chip); tapping a row jumps to
  that day's detail sheet.
- **Pay table fixes:** ko `payAmount` corrected to `짜{amount}` (was `{amount}??); daily `ptbl` grid
  widened/rebalanced (`36px 1fr 44px 76px 70px`) with `text-overflow: ellipsis` on the break/paid cells
  so ?닿쾶쨌?몄젙쨌?쇨툒 no longer collide.

## Purpose

This document turns the confirmed attendance / hourly-pay policy into an implementation-ready technical direction.

Important boundary:

- attendance capture is approved for build
- hourly gross-pay calculation is approved within the narrow rules confirmed on 2026-06-17
- taxes, insurance, deductions, and salaried payroll remain outside this system

## Delivery Phases

### Phase A ??Attendance Core

- site master
- QR issuance / rotation
- GPS + QR clock-in / clock-out
- shared staff / hourly attendance UI
- break tracking
- own attendance history
- correction / exception request flow
- admin review queue
- failure attempt logging

### Phase B ??Hourly Pay Core

- employment type history
- hourly rate history
- real-time expected pay for hourly workers
- per-person month snapshots
- admin dashboard

### Phase C ??Export and Extended Methods

- monthly bulk Excel export
- per-person Excel export
- export audit logs
- Wi-Fi attendance activation in a future non-PWA-capable delivery path

## Architectural Direction

### Session-first model

Do **not** model attendance only as loose event rows.

Recommended core model:

- one `attendance_session` per work session
- one-to-many `attendance_breaks`
- one-to-many `attendance_attempt_logs`
- one-to-many `attendance_correction_requests`
- one-to-many `attendance_session_audits`

Reason:

- the product rules are session-centric
- monthly pay needs closed-session aggregation
- correction, reopening, and audit history are easier to manage on a stable session identity

## Recommended Tables

### `attendance_sites`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
name text not null
property_id uuid references properties(id)
latitude numeric not null
longitude numeric not null
allowed_radius_meters integer not null default 100
wifi_ssids text[] not null default '{}'
is_active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- owner-only maintenance
- one site may hold multiple allowed SSIDs
- Wi-Fi is modeled now even though PWA activation is deferred

### `attendance_qr_tokens`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
site_id uuid not null references attendance_sites(id)
token text not null unique
is_active boolean not null default true
issued_at timestamptz not null default now()
revoked_at timestamptz
replaced_by_token_id uuid references attendance_qr_tokens(id)
created_by_user_id uuid not null references profiles(id)
```

Constraints / behavior:

- enforce one active token per site at a time
- reissue deactivates the previous token

### `attendance_sessions`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
operating_date date not null
status text not null
review_state text not null default 'normal'

clock_in_at timestamptz
clock_in_site_id uuid references attendance_sites(id)
clock_in_method text
clock_in_qr_token_id uuid references attendance_qr_tokens(id)
clock_in_latitude numeric
clock_in_longitude numeric
clock_in_accuracy_meters numeric
clock_in_device_info jsonb not null default '{}'

clock_out_at timestamptz
clock_out_site_id uuid references attendance_sites(id)
clock_out_method text
clock_out_qr_token_id uuid references attendance_qr_tokens(id)
clock_out_latitude numeric
clock_out_longitude numeric
clock_out_accuracy_meters numeric
clock_out_device_info jsonb not null default '{}'

manual_created boolean not null default false
manual_created_by_user_id uuid references profiles(id)
manual_created_reason text

invalidated_at timestamptz
invalidated_by_user_id uuid references profiles(id)
invalidated_reason text

created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `status` values:

```txt
open
completed
reopened
invalid
```

Recommended `review_state` values:

```txt
normal
review_required
pending_correction
approved_correction
rejected_correction
```

Recommended `clock_*_method` values:

```txt
gps_qr
gps_wifi
manual
```

Notes:

- PWA first release should only create `gps_qr` or `manual`
- `gps_wifi` is reserved for later activation
- one user may have only one `status='open'` session at a time
- `operating_date` should use Tokyo date derived from clock-in
- midnight-crossing sessions are not normal; mark `review_required`

### `attendance_breaks`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
session_id uuid not null references attendance_sessions(id)
started_at timestamptz not null
ended_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Notes:

- multiple breaks per session allowed
- clock-out must be blocked if any break row is still open
- hourly paid minutes exclude only recorded break time

### `attendance_attempt_logs`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
attempted_at timestamptz not null default now()
action_type text not null
resolved_site_id uuid references attendance_sites(id)
method text not null
success boolean not null
failure_reason text
latitude numeric
longitude numeric
accuracy_meters numeric
device_info jsonb not null default '{}'
created_at timestamptz not null default now()
```

Recommended `action_type` values:

```txt
clock_in
clock_out
break_start
break_end
```

Recommended `failure_reason` values:

```txt
gps_denied
gps_unavailable
outside_radius
qr_invalid
qr_scan_failed
wifi_not_supported
wifi_not_matched
open_break_blocks_clock_out
midnight_crossing
open_session_exists
```

Notes:

- attempt logs are admin-visible only
- attempt logs do not affect payroll directly

### `attendance_correction_requests`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
session_id uuid references attendance_sessions(id)
requested_by_user_id uuid not null references profiles(id)
status text not null default 'requested'
reason_type text not null
memo text
desired_clock_in_at timestamptz
desired_clock_out_at timestamptz
desired_clock_in_site_id uuid references attendance_sites(id)
desired_clock_out_site_id uuid references attendance_sites(id)
image_urls text[] not null default '{}'
review_comment text
reviewed_by_user_id uuid references profiles(id)
reviewed_at timestamptz
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `status` values:

```txt
requested
in_review
approved
rejected
```

Recommended `reason_type` values:

```txt
missing_clock_in
missing_clock_out
wrong_time
wrong_site
auth_failed
other
```

Notes:

- photos optional, max 5
- reject comment required
- approve comment optional
- approved request must result in admin-confirmed final values, not auto-apply the request verbatim

### `attendance_session_audits`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
session_id uuid not null references attendance_sessions(id)
actor_user_id uuid not null references profiles(id)
action_type text not null
reason text not null
before_json jsonb not null default '{}'
after_json jsonb not null default '{}'
created_at timestamptz not null default now()
```

Recommended `action_type` values:

```txt
manual_create
manual_update
invalidate
correction_apply
reopen
finalize
```

### `employment_type_history`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
employment_type text not null
effective_from date not null
effective_to date
created_by_user_id uuid not null references profiles(id)
created_at timestamptz not null default now()
```

Recommended `employment_type` values:

```txt
hourly
salaried
```

Notes:

- effective date applies to the full Tokyo operating date
- history must not reinterpret the past

### `hourly_rate_history`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
hourly_rate numeric not null
effective_from date not null
effective_to date
created_by_user_id uuid not null references profiles(id)
created_at timestamptz not null default now()
```

Notes:

- the rate effective date also applies to the full operating day
- final hourly gross result is rounded to nearest 10 yen

### `attendance_month_snapshots`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
user_id uuid not null references profiles(id)
target_month date not null
status text not null
total_paid_minutes integer not null
gross_amount numeric not null
rate_breakdown jsonb not null default '[]'
finalized_by_user_id uuid references profiles(id)
finalized_at timestamptz
supersedes_snapshot_id uuid references attendance_month_snapshots(id)
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Recommended `status` values:

```txt
draft
finalized
superseded
reopened
```

Notes:

- one user-month may have multiple historical snapshots
- only one current non-superseded row should be treated as current

### `attendance_export_logs`

```txt
id uuid primary key
organization_id uuid not null references organizations(id)
target_month date not null
export_scope text not null
user_id uuid references profiles(id)
snapshot_ids uuid[] not null default '{}'
exported_by_user_id uuid not null references profiles(id)
created_at timestamptz not null default now()
meta jsonb not null default '{}'
```

Recommended `export_scope` values:

```txt
monthly_bulk
single_user
```

### Authorization Flag

Recommended membership-level flag:

```txt
memberships.attendance_payroll_admin boolean not null default false
```

Reason:

- org-scoped privilege
- separate from broad role names
- matches the product rule: `owner + explicitly designated users`

## Derived Rules

### Paid Minutes

For hourly users only:

```txt
paid_minutes
= completed session minutes
- sum(closed break minutes)
```

Exclude from paid calculation:

- open sessions
- incomplete sessions
- review-required sessions
- pending correction sessions
- invalid sessions

Include after resolution:

- approved corrections
- reviewed manual sessions

### Gross Amount

For each resolved day:

```txt
gross = hourly_rate * (paid_minutes / 60)
```

Monthly total:

- sum all gross segments by effective rate
- round final per-person monthly gross to nearest 10 yen

### No Premium Layers

Do not add:

- overtime multiplier
- holiday multiplier
- public-holiday multiplier
- night multiplier

These are intentionally out of scope for now.

## PWA Implementation Constraints

### GPS

- use Geolocation API
- require explicit permission
- store latitude / longitude / accuracy
- compare against site coordinates and allowed radius

### QR

- use camera-based QR scan in mobile PWA
- QR identifies site token server-side

### Wi-Fi

- model `gps_wifi` in schema and business rules
- in the current PWA release, do not activate it
- show Wi-Fi attendance in UI as `以鍮꾩쨷`
- do not attempt pseudo-SSID logic in browser-only code

## Suggested Server Actions / Routes

### Worker-side

- `submitAttendanceScan` (unified clock-in + clock-out via GPS+QR)
- `startBreak`
- `endBreak`
- `createAttendanceCorrectionRequest`
- `respondOpenSessionReminder`

### Admin-side

- `createAttendanceSite`
- `updateAttendanceSite`
- `issueAttendanceQr`
- `revokeAttendanceQr`
- `createManualAttendanceSession`
- `updateAttendanceSession`
- `invalidateAttendanceSession`
- `reviewAttendanceCorrectionRequest`
- `setEmploymentType`
- `setHourlyRate`
- `finalizeAttendanceMonthForUser`
- `reopenAttendanceMonthForUser`
- `exportAttendanceMonth`
- `exportAttendanceUserMonth`

### Shared Queries

- `getMyAttendanceSessions`
- `getMyAttendanceMonthSummary`
- `getAttendanceReviewQueue`
- `getAttendanceDashboard`
- `getAttendanceSiteCostSummary`

## RLS Direction

### Default user access

- read own sessions
- read own breaks
- read own correction requests
- read own month summaries
- no direct client-side writes to authoritative payroll data

### Privileged admin access

- `owner` and `attendance_payroll_admin` read org-wide attendance and payroll data
- site master writes should still remain owner-only in application logic

### Service-role writes

Recommended pattern:

- authoritative attendance mutations go through controlled server actions
- RLS may remain conservative/read-focused for complex payroll-sensitive tables

## Finalization Rules

A user-month cannot finalize while any of these exist:

- `review_required` sessions
- `requested` or `in_review` correction requests
- open sessions
- reopened month state

Finalization should:

- compute paid minutes and gross amount
- persist a snapshot
- record audit action

Reopen should:

- preserve prior finalized snapshot as history
- create a reopen trail
- require reason

## Notifications Direction

Worker-facing:

- 18:30 open-session reminder, once per Tokyo day
- correction request outcome

Admin-facing:

- new correction / exception request
- incomplete session detected
- midnight-crossing abnormal session

## Export Rules

- export only finalized data
- support monthly bulk and single-user export
- exclude unresolved / draft / reopened records
- template content remains pending from operator
- store export audit trail

## Current Build Notes

- Phase A can be built now with `GPS + QR`
- Wi-Fi attendance is designed but must remain disabled in the PWA release
- hourly gross-pay logic is now sufficiently defined for implementation
- tax/deduction integration should not be added here

