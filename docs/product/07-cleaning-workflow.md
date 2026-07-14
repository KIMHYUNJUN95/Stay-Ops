# Cleaning Workflow

## Purpose

The cleaning workflow should record when cleaning starts, when it ends, how long it took, and what issues were found during cleaning.

It should also let cleaning staff create linked lost item and maintenance records without leaving the cleaning context.

## Core Flow

```txt
Staff selects room/property from today's check-out list
Staff taps Start Cleaning
Timer starts
Staff works
Staff can add notes, report lost items, or report maintenance issues during cleaning
Staff taps Complete Cleaning
Confirmation popup appears
Staff confirms completion
System records total duration
Cleaning record is saved
```

## Room / Property Selection

Room selection is reservation-driven. The cleaning page (`/mobile/cleaning`) queries today's confirmed reservations (Asia/Tokyo timezone) and derives two lists automatically:

### Unprocessed Queue Policy

Both lists are **unprocessed work queues**, not raw reservation queries. Before rendering, rooms that already have a session today are removed:

- `in_progress` room ??excluded (prevents duplicate starts)
- `completed` room ??excluded (work is done, no re-appearance)

Exclusion is org-wide: if any staff member in the organization has an `in_progress` or `completed` session for a given room today, that room disappears from all staff members' lists. The "?ㅻ뒛 湲곕줉" (today's records) section below the lists remains unfiltered and always shows the full history.

#### room_label ??roomKey Resolution Priority

The filter compares `cleaning_sessions.room_label` values against `CleaningTarget.roomKey` / `SettingTarget.roomKey`. Reverse mapping uses a three-stage fallback:

1. **Catalog exact match (primary)** ??`buildSessionLabelToRoomKeyMap(roomCatalog)` produces a `Map<sessionRoomLabel, roomKey>` from the active room master. This covers all rooms that were created via the manual form or from reservations whose room master is classified.
2. **Canonical prefix parse (legacy fallback)** ??for labels written before the room master existed, `resolveRoomKey` attempts prefix matching against `CANONICAL_TO_BUILDING_KEY`. Succeeds for the 7 known canonical property names.
3. **Legacy alias map fallback** ??normalized (`NFKC`, whitespace-collapsed, lowercase) aliases derived from active room catalog values are checked last. This captures historical ko/ja/en variants and formatting differences (`property + room_label`, canonical/raw combinations).
4. **Unknown labels** ??if all lookups fail, the label is excluded from `processedRoomKeys` (not added, not used as a filter key). A dev-mode resolver log captures unresolved count and samples for follow-up cleanup.

#### Resolver Safety Guard

- Resolver telemetry is logged in development when alias fallback or unknown labels are observed.
- If unresolved labels for org-today processed sessions reach the warning threshold (`>= 3`), `/mobile/cleaning` shows a warning badge with sample labels.
- This prevents silent queue re-exposure risk from going unnoticed in operations.

#### Legacy Cleanup Policy (One-time / Admin-Dev)

- Script: `scripts/dev/normalize-cleaning-room-labels.js`
- Command: `npm run cleaning:normalize-room-labels -- --org=<organization_id> [--days=14] [--apply]`
- Default mode is **dry-run** (no DB write). `--apply` performs updates.
- Scope: `cleaning_sessions` with `in_progress` or `completed` status for today + recent N days (Tokyo date key).
- Behavior: non-standard `room_label` values are rewritten to canonical `sessionRoomLabel` when mapping is deterministic from active room catalog aliases.

#### KPI Counters

All three KPI cells use org-wide scope:

| KPI | Source | Scope |
|---|---|---|
| 泥?냼 ???| filtered cleaning list length | org-wide (unprocessed rooms) |
| ?뗮똿 ???| filtered setting list length | org-wide (unprocessed rooms) |
| 吏꾪뻾 以?| `orgTodaySessions.filter(in_progress).length` | org-wide |

When `getCleaningTargets()` fails (returns `null`), the 泥?냼/?뗮똿 ???cells show `"-"` instead of `0` to distinguish a data loading failure from a genuine zero count. The 吏꾪뻾 以?cell always shows a number (shows `0` if `getOrgTodayCleaningRoomLabels` fails).

### Cleaning List

Rooms with a confirmed `check_out_date = today`. Each card shows:
- Room label (canonical property + room, e.g. "?꾨씪?ㅼ큹A 201")
- Departing guest name
- Turnover badge + arriving guest info if `check_in_date = today` for the same room
- Next check-in date and guest if no same-day arrival but a future one exists within 30 days
- "No check-in today" if the room is free after cleaning

Tapping Start records the room label directly from the reservation data into `cleaning_sessions.room_label`.

### Setting List

Rooms with a confirmed `check_in_date = today` whose room does NOT appear in the checkout set. These are set-up tasks (not post-checkout cleaning). Each card shows arriving guest name and PAX count.

#### Setting KPI Interaction

- The top `셋팅 대상` KPI is clickable when the count is greater than zero.
- Tapping it opens a mobile bottom sheet with the full setting-target list.
- Each row in the sheet shows building/room, guest name, and PAX, with an immediate `Start setting` action.
- No preview rows are shown in the KPI card itself.

### Building Section Display Rules

Both the Cleaning List and Setting List are rendered as building-grouped sections:

- **Empty building sections are hidden.** If a building has no targets on a given day, its section header does not appear at all.
- **Building display names are locale-aware** ??section headers come from `dictionary.cleaning.buildingLabels[key]`, not from the canonical property name string directly. This means Japanese mode shows `?믤쑉?튍`, `閭뚩닞鴉롧뵼`, etc., Korean shows `?꾨씪?ㅼ큹A`, `媛遺?ㅼ큹`, etc., and English shows `Arakicho A`, `Kabukicho`, etc.
- **Ordering uses canonical building keys** (stable English slugs), not locale display strings:
  1. `arakicho_a`
  2. `arakicho_b`
  3. `kabukicho`
  4. `takadanobaba`
  5. `okubo_a`
  6. `okubo_b`
  7. `okubo_c`
  - Any building whose canonical property name is not in the `CANONICAL_TO_BUILDING_KEY` map is appended alphabetically after the seven fixed entries. Display falls back to the raw key string.
- **Rooms within each building section are sorted by numeric value ascending** (numeric-aware, not lexicographic). The first integer sequence in the canonical room label is used as the sort key ??e.g. `"2" < "3" < "10" < "101" < "202"`. Ties are broken by the raw label string.

### Canonical Key ??Display Label Architecture

The sorting/grouping layer uses canonical building keys (`arakicho_a`, etc.) internally. The display layer reads `dictionary.cleaning.buildingLabels[key]` from the i18n dictionary. These two concerns are kept separate so that:
- Adding a translation requires only a new key in `src/lib/i18n.ts`
- Reordering buildings requires only changing `BUILDING_KEY_ORDER` in `src/app/mobile/cleaning/page.tsx`
- Neither affects the other

### Exclusion Policy

Properties/rooms listed in `isExcludedOperationalProperty` / `isExcludedOperationalRoom` in `src/lib/room-label-normalization.ts` are filtered out from both lists.

### Manual / Other Section

A cascading building + room select form is always shown below the two auto-detected lists, for exceptions such as long-stay maintenance cleans that have no checkout event.

**Data source**: `rooms` table active room catalog (`getActiveRoomCatalogServer`). Same room master used by the reservation calendar.

**UX flow**:
1. Staff selects a building from the first dropdown.
2. Room dropdown becomes enabled and lists only rooms in the selected building (disabled until building is selected).
3. Staff selects task type.
4. Submit ??`startCleaningSession` server action.

**Room master unavailable**: If no classified room rows exist (catalog returns `undefined`), the form is replaced with an informational message (`copy.manualRoomMasterUnavailable`). There is no free-text fallback.

**roomLabel generation**: The value submitted to `cleaning_sessions.room_label` is the `sessionRoomLabel` computed at page-render time:
- `canonicalRoomLabel === propertyName` ??`propertyName` (Okubo-style single-room property)
- Otherwise ??`"{propertyName} {canonicalRoomLabel}"` (e.g., "?꾨씪?ㅼ큹A 201")

**Server-side validation**: The `startCleaningSession` action calls `getActiveRoomCatalog` and, when a catalog exists, verifies the submitted `roomLabel` is in the allowed set. Injected labels that do not match a real active room are rejected with `invalid_selection`. If no catalog exists, only length-based validation applies (0 < length ??100).

After the room master check, the action also queries `cleaning_sessions` to reject any submit where the room already has an `in_progress` or `completed` session today (org-wide). The error key is `already_processed_today` (i18n: ko/ja/en).

**Component**: `src/components/cleaning/manual-cleaning-form.tsx` ??`"use client"` component, uses `useTransition` + `FormData` to call the server action.

### Task Types

- `checkout` ??used for cleaning list items (standard checkout clean)
- `simple` ??used for setting list items (arrival setup)
- `long_stay` ??available via the manual section

## Required Timer Data

Each cleaning record should store:

```txt
id
organization_id
property_id
room_id
staff_user_id
status
started_at
completed_at
duration_seconds
notes
created_at
updated_at
```

Status candidates:

- not_started
- in_progress
- completed
- cancelled

## Multiple Rooms Per Staff

One staff member may clean up to about 2 rooms/properties in a day.

The app should therefore show:

- Today's cleaning records
- Completed records
- Active cleaning timer
- Previous cleaning time history

Cleaning start and completion should automatically appear in the user's "today's activity records" on the mobile home screen.
Displayed cleaning times (start/completion/history) should be formatted in `Asia/Tokyo`.

## Cleaning Record Export

Admin/office users need to export cleaning records.

Export formats:

- Excel
- PDF

Export language:

- Korean

Minimum export fields:

```txt
泥?냼??嫄대Ъ/?숈냼
媛앹떎
?대떦??泥?냼 ?쒖옉 ?쒓컖
泥?냼 ?꾨즺 ?쒓컖
珥??뚯슂?쒓컙
?뱀씠?ы빆 硫붾え
```

Allowed roles:

- Developer / Super Admin
- Owner
- Office Admin
- CS Staff if permitted
- Field Manager

Not allowed:

- Staff
- Part-time Staff

Open question:

- Should one user be allowed to run more than one active cleaning timer at the same time?

Recommended first rule:

- One active cleaning timer per user.

## Completion Notes

At completion, staff should be able to add:

- Special notes
- Room/property condition notes
- Supply shortage note
- Guest-related note if needed

Notes are optional, not required.

## Completion Confirmation Popup

When staff taps Complete Cleaning, show a confirmation popup before final completion.

The popup should show:

- Cleaning room/property
- Cleaning start time
- Approximate elapsed time
- Completion note (read-only; hidden if no note was entered)

The popup should include:

- Confirm completion button
- Cancel/back button
- Optional special note button or input

Purpose:

- Prevent accidental completion.
- Let the staff verify the room/property and elapsed time before saving.

## Lost Item During Cleaning

> **Implementation note (2026-05-21):** Linked reporting slice implemented. Shortcut appears on the active-cleaning card linking to `/mobile/lost-found/new?sessionId=...` and `/mobile/maintenance/new?sessionId=...`. Room is prefilled from the validated cleaning session; `cleaning_session_id` is stored on saved records. Invalid or stale `sessionId` shows an explicit error state; login redirect preserves `sessionId` in `next`. In cleaning-linked mode, both forms now show a final confirmation step before submit, including room/report summary and a visible guest/reservation suggestion section. Because reservation integration is not yet connected in this slice, the suggestion area explicitly reports that no connected reservation data is currently available instead of fabricating a guess.

During an active cleaning timer, staff should be able to tap:

```txt
Report Lost Item
```

The app should open a quick lost item form already prefilled with:

- Property
- Room/unit
- Cleaning record
- Current staff
- Found date/time
- Guest/reservation from that room's checkout when available

After saving, the lost item should be linked back to the cleaning record.

The created lost item must also appear in the normal Lost and Found list inside the Requests tab/admin web.

Before final submission from cleaning context:

- Show a confirmation popup asking whether the auto-filled room/property is correct.
- Show the suggested checkout guest/reservation if available.
- Provide a pencil/edit action if the room/property or reservation link needs correction.

## Maintenance Issue During Cleaning

> **Implementation note (2026-05-21):** First slice implemented. Shortcut appears on the active-cleaning card linking to `/mobile/maintenance/new?sessionId=...`. Room is prefilled from the validated cleaning session; cleaning session ID is stored on the record. Invalid or stale `sessionId` shows an explicit error state; login redirect preserves `sessionId` in the `next` param. Photo upload and full maintenance workflow deferred.

During an active cleaning timer, staff should be able to tap:

```txt
Report Maintenance Issue
```

The app should open a quick maintenance form already prefilled with:

- Property
- Room/unit
- Cleaning record
- Current staff
- Reported date/time

After saving, the maintenance request should be linked back to the cleaning record.

The created maintenance request must also appear in the normal Maintenance list inside the Requests tab/admin web.

## Active Timer Screen Actions

The active cleaning timer screen should always show:

- Register lost item
- Register maintenance issue
- Special note
- Complete cleaning

These are shortcuts into the same core modules, not separate temporary records.

## Photo Upload Concern

Completion photo upload is useful, but one room may generate about 30 photos.

This can create significant storage and bandwidth cost if every photo is uploaded to StayOps.

## Recommended Photo Strategy for MVP

Do not require 30 completion photos per cleaning record in the first MVP.

Better first options:

### Option A: Optional Limited Photos

Allow only a small number of photos per cleaning completion.

Example:

- Maximum 3 to 5 photos
- Compressed before upload
- Used only for important proof or issue evidence

### Option B: Issue-Only Photos

Do not upload normal completion photos.

Only upload photos when reporting:

- Lost item
- Maintenance issue
- Damage
- Supply shortage

### Option C: External Photo Link

Continue using KakaoTalk or another external photo workflow for bulk photos, and store only a link or note in StayOps later.

## Current Recommendation

For MVP:

- Track cleaning start/completion/timer
- Allow notes
- Allow lost item and maintenance creation from active cleaning
- Do not implement cleaning completion photo upload yet
- Use photos in linked lost item or maintenance records instead

Future:

- If the company later launches the app and accepts the storage cost, cleaning completion may support up to about 30 photos per room.

## Phase 7 First Vertical Slice

Implemented on 2026-05-21:

- Added real database-backed `cleaning_sessions` persistence.
- Mobile field roles can select from a small room/task list, choose Checkout Cleaning, Simple Cleaning, or Long-stay Cleaning, start a cleaning session, see an active timer, add an optional completion note, review room/task/start time/elapsed time in a confirmation step, and then complete the session.
- Completion records `completed_at` and `duration_seconds`.
- Cleaning "today" uses the defined UTC+9 local operating date (`Asia/Seoul`, matching Korea/Japan operating date) instead of raw UTC date slicing.
- A partial unique database index enforces the first rule of one active cleaning timer per organization/user.
- Admin web has a first cleaning status view for the current organization/date with room, task, staff, status, start time, and duration.
- Visible cleaning UI strings are localized in Korean, Japanese, and English.
- Server actions validate user/session, role eligibility, room/task selection, active session ownership, and completion state before database mutation.
- `owner` is treated as a hybrid operations role for this workflow: owners can run the mobile cleaning flow in addition to admin web, and `developer_super_admin` remains able to bypass for support/debugging. Matching RLS keeps the page guard and DB mutations aligned.

Previously deferred; now implemented:

- Beds24 checkout-driven room list -- implemented as the cleaning smart list (Phase 10 calendar integration).
- Room/property master data -- properties/rooms tables implemented; cascading building-to-room selects in manual section.
- Export -- cleaning CSV export implemented at `/api/admin/export/cleaning`.
- Photo upload for linked records (lost-found and maintenance) -- implemented (up to 5 images each).

Still deferred (post-MVP):

- Beds24-backed guest/reservation suggestion data in linked forms (current implementation shows "reservation data unavailable" placeholder).
- Overdue cleaning notification (planned in notification design, not yet dispatched).
- Cleaning completion photo.

## Open Questions

- Should cleaning completion require a note?
- Should cleaning completion require any photo?
- How many photos should be allowed per maintenance/lost item record?
- Should the app compress photos automatically?
- Should photos expire after a certain time?
- Should old photos be archived or deleted?

## Overdue Notification

Default rule:

```txt
Cleaning usually starts around 10:00.
Cleaning should be completed by 16:00 at the latest.
If a cleaning timer is still active after 16:00, send an overdue notification.
```

Recipients:

- Staff member with active cleaning timer
- Field Manager
- Office Admin if configured

Frequency:

- Send once only.

## 2026-05-27 Localized Room Title Rule

- Card title display must not use stored `sessionRoomLabel` directly.
- `sessionRoomLabel` remains a storage/action value for `cleaning_sessions.room_label`.
- UI title must be composed from:
  1. localized building label (`dictionary.cleaning.buildingLabels[key]`)
  2. canonical room number/label
- Example:
  - `ja`: `?믤쑉?튍 201`
  - `ko`: `?꾨씪?ㅼ큹A 201`
  - `en`: `Arakicho A 201`

## 2026-05-27 Top summary KPI update

- The top hero card in `/mobile/cleaning` now shows KPI summary instead of static title/description.
- KPI fields:
  - cleaning targets = `cleaningList.length`
  - setting targets = `settingList.length`
  - in progress = organization-wide `cleaning_sessions` count where `status = in_progress`
- Data source: same-day `getCleaningTargets()` result (Asia/Tokyo operating date basis).
- Purpose: operators can see daily workload immediately on page entry.

## 2026-06-15 Cleaning Log (청소 기록표)

A date-grouped **cleaning record sheet** so staff can review their cleaning history like a log.

- **Entry / location:** a "내 청소 기록" link on the cleaning home (`/mobile/cleaning`, below the
  summary card) → dedicated sub-page `**/mobile/cleaning/records**`. No new bottom tab.
- **Layout:** horizontal **text rows** grouped by **date** (newest first), fitting the screen width
  (no horizontal scroll). Each row, single line: status dot · 시작–종료 시각 · 건물·객실(truncate) ·
  청소 유형 칩 · 소요시간. The top is a polished dashboard: a month-nav header card with a two-stat
  summary (기록 count · 총 소요 total duration, compact `Xh Ym` format), **building** + (managers) staff
  pill selects, and a **status segmented control** (전체/완료/진행중/취소). **Building filter** is
  server-side via `getOrgCleaningSessionsFiltered({ propertyName })` + the active-room catalog;
  building options are the catalog's property names (excluded ops filtered out), localized.
- **Row tap → detail sheet:** building names are truncated in the row, so tapping a record opens a
  **bottom sheet** (drag-to-dismiss, `useSheetDragDismiss`) showing the **full** info — untruncated
  building·room, cleaning type, status, 담당자(staff), 날짜, 시작/종료 시각, 소요시간, and 메모(notes)
  when present.
- **Data:** reuses `getOrgCleaningSessionsFiltered(session, {startDate,endDate,status,staffUserId})`
  over the selected month (Tokyo), with building·room resolved via the active-room catalog
  (`resolveRequestCatalogLocation`). **No schema/RLS/migration change** — `cleaning_sessions` and its
  RLS already carry who/when/where/duration and own-vs-manager read scoping.
- **Permissions (matches the existing `cleaning_sessions` RLS):**
  - `staff` / `part_time_staff` → **own records only** (no staff filter; RLS scopes automatically).
  - `field_manager` / `cs_staff` / `office_admin` / `owner` (`canViewOthersCleaning`) → can also view
    **other staff's** records in the app via a **직원(staff) filter**; the row then shows the staff name.
  - Admin web (`/admin/cleaning`) already lists **all** records with filters + CSV/Excel export.
- New i18n: `cleaning.records.*` (ko/ja/en). Files: `src/app/mobile/cleaning/records/page.tsx`,
  `src/components/cleaning/cleaning-records-view.tsx`, `canViewOthersCleaning` in `src/config/roles.ts`.

## 2026-06-18 청소 대상 룸 라벨 — 캘린더 표시 라벨과 일치

- "청소 대상" 카드의 룸 제목(`getLocalizedRoomTitle` in `src/app/mobile/cleaning/page.tsx`)이
  이제 `getDisplayRoomLabel`을 적용해 아라키초 서브유닛을 접습니다(`501_2` → `501`). 캘린더가
  보여주는 표시 라벨과 동일해집니다.
- 가부키초 `#`/`K` 제거와 오쿠보 건물명-단독 표기는 기존 `getCanonicalRoomLabel`로 이미
  정상이었고, 이번 변경은 표시 전용입니다(저장되는 `sessionRoomLabel`·중복 제거 키는 불변).
- 동일 맥락의 홈 "오늘 체크인/체크아웃" 시트 룸 매핑 일치 작업은
  `docs/product/15-reservation-calendar.md`(2026-06-18 섹션) 참고.

## 2026-07-13 어드민 청소 대시보드 — 재기획 (감시·이력·강제완료)

> **상태 (2026-07-14):** 디자인 100% 구현 완료 + **백엔드 연동 완료**(실제 `cleaning_sessions` +
> 예약 데이터, 강제완료 서버 액션, `completed_by_admin` 컬럼). 이 섹션은 디자인·구현의 기준
> 스펙이다. 기존 `/admin/cleaning`(읽기 전용 모니터링 + CSV)을 전면 재설계했다. 백엔드 연동
> 상세는 하단 "2026-07-14 어드민 청소 대시보드 — 백엔드 연동" 절 참고.

### 성격

- PC 어드민 대시보드는 **청소를 시작/배정하는 곳이 아니다.** 시작은 모바일 현장, 배정은 별도 웹에서.
- PC의 역할 = **감시(oversight) + 이력(record) + 예외 개입(강제완료)**.
- 핵심 데이터: 모바일과 동일한 예약 기반 로직으로 "오늘(도쿄 날짜) 청소해야 할 객실"을 확실히 수집.
  단, 모바일처럼 처리되면 큐에서 사라지는 게 아니라 **상태로 계속 표시**(대기/진행/완료).

### 화면 A — 오늘 현황 보드 (실시간 감시)

- **상단 KPI 스트립**: `청소 대상 · 미시작 · 진행중 · 완료 · 완료율(%) · 셋팅 대상`.
  데이터 로드 실패 시 숫자 대신 `-`.
- **건물별 섹션 + 객실 카드**, 상태 3버킷을 명확히:
  - 🕓 **청소 대기중(미시작)** — 어느 객실이 남았는지
  - 🧹 **청소중(진행중)** — **담당 직원 이름** + 경과시간(실시간)
  - ✅ **완료** — 소요시간 + 완료 시각
- **셋팅(체크인 셋업) 대상**도 별도 리스트/섹션으로 표시(모바일엔 있으나 어드민엔 없던 것).
- **⚠️ 누락/미시작 강조**: 오늘 체크아웃인데 미시작 객실은 **시간 기준 없이 즉시** 경고색 + '지연'
  라벨(2026-07-14 결정: 특정 기준 시각까지 유예를 두지 않는다 — 관리자가 대시보드를 확인하는
  시점이 언제든, 미시작 체크아웃 객실은 항상 바로 확인이 필요한 상태이기 때문. 하단 "지연 판정
  시각 기준 삭제" 참고).
- **🏷️ 연동 리포트 배지**: 해당 청소 세션에서 나온 분실물·시설 이슈 개수(0이면 숨김).
- **직원별 오늘 요약**: 직원별 `완료 건수 · 평균 소요시간`.
- **실시간 갱신**: 자동 주기 갱신(30~60초). 즉시 realtime 구독은 이번 범위 아님.

### 화면 B — 기록/이력

- **필터 바**: 시작일 · 종료일 · 건물 · 직원(이름 검색 포함) · 상태. 어드민 공용 shared 컴포넌트 사용.
- **모든 사용자의 기록 조회** + **직원 검색**으로 특정 사용자 기록만 조회 가능.
- **테이블**: 객실 · 청소유형 · 담당자 · 상태 · 시작시각 · 소요시간 · 날짜(기간 조회 특성상 실데이터
  연동 시 추가됨, 2026-07-14).
- **행 클릭 → 우측 상세 패널**: 객실(풀네임) · 청소유형 · 상태 · 담당자 · 날짜 · 시작/종료 · 소요시간 ·
  메모 · 연동 분실물/시설 리포트 링크 · (대리 완료 시)관리자 대리 완료 표시.
- **내보내기 = Excel + PDF 둘 다** (기존 CSV 확장). 내보내기 필드:
  `사용자 · 청소 장소(건물·객실) · 청소유형 · 시작/종료 시각 · 소요시간 · 상태 · 메모`.
  PDF는 급여 PDF와 동일한 인쇄 품질 톤으로 통일(`attendance-payroll-report.ts` 패턴 재사용).

### 강제완료 (관리자 대리 완료) — 유일한 개입 액션

- **카드/상세 패널**에 `[완료 처리]` 버튼 — "진행중"뿐 아니라 **대기중·지연 상태에서도** 노출된다
  (실데이터 연동 시 확장, 2026-07-14). 세션이 아직 없는 방(대기중)을 강제완료하면
  `cleaning_sessions` INSERT, 이미 세션이 있는 방(진행중/지연)이면 UPDATE — 완료 상태에서는 버튼
  자체가 숨겨진다.
- **확인 모달**: 객실 · 담당자 · **시작 시각 입력**(AdminTimePicker, 기본값=세션 시작 시각 또는
  11:00) · **완료 시각 입력**(AdminTimePicker, 기본값=현재) · (선택)메모. → 관리자가 시작/완료
  시각을 모두 직접 입력할 수 있으므로(세션이 아예 없던 방을 대신 생성하는 경우까지 커버) 소요시간이
  항상 정확히 계산됨(직원이 몇 시간 깜빡한 경우의 소요시간 오염 방지).
- **감사 기록**: `cleaning_sessions`에 `completed_by_admin`(관리자 user id) 저장. 상세·기록 뷰에
  **"관리자 대리 완료"** 배지 표시. → 마이그레이션으로 컬럼 추가 필요.
- **권한**: 상위 관리자/매니저(owner·전무·office_admin·field_manager 등)만. 서버 액션에서 게이트.

### 상호작용 목록 (디자인이 그려야 할 것)

1. 필터(기간·건물·직원 검색·상태) 2. 탭/날짜 전환 3. 행·카드 클릭 → 상세 패널
4. Excel/PDF 내보내기 5. 대기중/진행중 세션 → 완료 처리(확인 모달). 그 외 입력/버튼 없음(읽는 화면).

**실데이터 연동 시 추가된 상호작용 (2026-07-14, 문서 갱신 누락분 반영)**: 오늘 현황의
**건물별/상태별 그룹 전환 토글**, **수동 동기화 버튼**(60초 자동 갱신과 별개로 즉시 재조회).
둘 다 화면을 다시 그리는 조회성 조작이라 "읽는 화면" 원칙에는 부합하지만, 위 5개 목록에는
누락돼 있었다.

### 범위에서 제외 (그리지 않음)

- ❌ 청소 시작/완료(직원용) 버튼 · ❌ 관리자 방 배정 UI · ❌ 취소/재배정 · ❌ 대신 청소 생성 폼
- ❌ 청소 완료 사진 업로드 · ❌ 소요시간 이상치 플래그 · ❌ 지연 알림 발송 설정(알림 단계에서)

### 상태·다국어

- **빈/로딩/에러 상태** 모두 디자인 필요(오늘 대상 0건, 기록 없음, 로드 실패).
- 새 라벨(KPI 6종, 상태 라벨, 미시작/지연/누락, 직원별 요약, 완료 건수/평균 소요, 관리자 대리 완료,
  Excel/PDF 내보내기, 빈 상태 문구)은 **ko·ja·en 동시 추가**. 폭은 en 기준으로 안전하게.

### 데이터 출처

- 오늘 대상 객실: 예약(Beds24 캐시) + 도쿄 날짜, 모바일과 동일 로직.
- 상태/시각/소요/담당/메모/대리완료: `cleaning_sessions`(+ `completed_by_admin` 신규 컬럼).
- 연동 리포트 수: 분실물·시설 테이블의 `cleaning_session_id`.

### 디자인 프롬프트 (디자이너 전달용)

**기술 스택 제약**

- Next.js 16 App Router + React 19 + Tailwind CSS v4, **데스크톱 웹**(모바일 아님).
- 스타일은 `.adm` 스코프 BEM + `admin-console.css` 톤. 새 프레임워크·아이콘팩·폰트 도입 금지.
  아이콘은 **lucide-react**. 색은 아래 CSS 변수 토큰만 사용(임의 색 금지).

**브랜드 컨셉 / 컬러 토큰**

- 웜 아이보리 크롬 — 페이지/캔버스 배경 `--background: hsl(42 36% 95%)`.
- 카드/시트는 화이트로 떠 보이게 `--surface: hsl(44 52% 98.5%)`.
- 브랜드 액센트 = 딥 잉크 네이비/인디고 `--primary: hsl(223 46% 32%)` (teal/green 금지).
- 텍스트 `--foreground: hsl(222 28% 14%)`, 보조 `--muted-foreground: hsl(222 10% 44%)`,
  테두리 `--border: hsl(40 20% 84%)`, 뉴트럴 `--muted: hsl(40 22% 90%)`.
- 경고/위험(누락·지연·삭제) `--destructive: hsl(4 62% 46%)`, 배경 `--destructive-bg: hsl(6 70% 95.5%)`.
- 톤: 근태·사용자·예약 캘린더 콘솔과 한 몸처럼. 굵은 헤딩(font-black), 라운드 12~24px, 얇은 보더 + 미묘한 그림자.

**공용 컴포넌트 — 새로 만들지 말고 100% 동일하게**

이미 존재하는 전역 공용 UI. 청소 화면에서도 시각·동작이 동일해야 하며 재디자인 금지:

- 드롭다운 = **`AdmDropdown`(`.dd`)** — 사용자 화면의 드롭다운으로 **전 화면 통일**. 흰 사각 트리거
  (쉐브론, 열리면 네이비 보더) + 바로 아래 흰 팝오버 + 선택 항목 체크·네이비 강조. 건물·직원·상태
  필터 전부 이 `.dd`로. **칩형 `.adp`(ChipDropdown)를 새로 쓰지 말 것.** 화면마다 드롭다운이 다르면 안 됨.
- 우측 상세 슬라이드 패널 = `.panel` + `.panel-scrim`(오른쪽 슬라이드-인, 스크림 딤) — 행/카드 상세.
- 중앙 하단 알림 토스트 = `.adm-toast`(하단 중앙, 1.8s 자동 소멸) — 강제완료 성공 등 피드백.
- 날짜/시간/월 선택 = `AdminDatePicker`/`AdminTimePicker`/`AdminMonthPicker` — 기간 필터·완료시각 입력.
- 확인/사유 모달 = `AdminReasonModal` 톤(중앙 정렬) — 강제완료 확인.
- 셀렉트 = `AdminSelectField`. 공용은 자리만 배치하고 별도 비주얼 리디자인 금지.

**해당 기능 화면만 디자인**

- 상단 글로벌 바 / 좌측 사이드 내비 / 사이드바는 `AdminShell`이 이미 감싼다 → **본문 콘텐츠 영역만** 디자인.
- 화면 A/B는 상단 세그먼트 탭(오늘 현황 / 기록) 전환 권장. 최종 배치는 디자이너 재량.
- 이 화면은 입력·버튼이 거의 없는 "읽는 화면". 상호작용은 앞의 상호작용 목록 5개뿐.

### 2026-07-14 디자인 구현 완료 (mock 데이터, 백엔드 연동 전)

Claude Design 핸드오프(`StayOps 청소 (admin)/청소 현황 (admin).html`)를 1:1로 React/TSX 이식했다.
**정적 mock 데이터**로 화면 A/B를 모두 구현했고, 실제 `cleaning_sessions`/예약 연동은 아직 하지
않았다 — 위 "디자인 프롬프트" 절이 정의한 범위(디자인 100%) 까지만 완료된 상태다.

- **파일**: `src/app/admin/cleaning/page.tsx`(세션 게이트 + `AdminShell` 래핑만 담당) +
  `src/components/admin/cleaning/`:
  - `cleaning-console.tsx` — 상태 소유 + KPI 6-스트립 + 뷰 탭(오늘 현황/기록) + group 세그먼트 + 동기화 칩
  - `cleaning-today-board.tsx` — 건물별/상태별 객실 카드, 셋팅 대상, 직원별 오늘 요약
  - `cleaning-history-board.tsx` — 기간·건물·직원·상태 필터 + 기록 테이블
  - `cleaning-detail-panel.tsx` — 우측 상세 패널(오늘 카드 · 기록 행 공용)
  - `cleaning-force-complete-modal.tsx` — 강제완료 모달(시작/완료 시각 입력 + 담당자 대리 선택)
  - `cleaning-console-data.ts` — mock TASKS/HISTORY/STAFF + 날짜·소요시간 헬퍼(모바일과 동일한
    캐노니컬 건물 키를 쓰고, 건물 표시명은 기존 `dictionary.cleaning.buildingLabels`를 그대로 재사용)
  - `cleaning-console.css` — 이 화면 전용 신규 컴포넌트만(KPI 6칸, 객실 카드, 상태 3버킷, 셋팅/직원
    그리드, 기록 툴바). `.dd`/`.panel`/`.modal`/`.qtbl`/`.fld`/`.btn` 등은 기존 `admin-console.css`를
    그대로 재사용했다(신규 정의 없음).
- **공용 컴포넌트 반영**: 드롭다운은 전부 `AdmDropdown`. 기간 필터는 디자인 원본과 동일하게 단일
  결합 필드("시작일 – 종료일" 트리거 하나)+ 범위 선택 캘린더 팝오버다 — 새 공용 컴포넌트
  `AdminDateRangePicker`(`src/components/admin/shared/admin-date-range-picker.tsx`)로 구현해
  다른 어드민 화면(근태·예약 등)의 기간 필터도 재사용할 수 있게 했다. **버그 수정(2026-07-14 후속):**
  최초 구현은 시작일/종료일을 `AdminDatePicker` 2개로 나눠 만들었었는데, 툴바 맨 왼쪽(사이드바 바로
  옆)에 있다 보니 시작일 팝오버가 `.content`의 스크롤 클리핑에 걸려 사이드바와 겹치며 잘리는 버그가
  있었다 — 사용자 리포트로 발견. `AdminDateRangePicker`는 팝오버를 `position:fixed`로 렌더링하고
  좌표를 트리거의 `getBoundingClientRect()` 기준으로 계산·뷰포트 클램프한다(leave-team-calendar.tsx의
  day-menu 팝오버와 동일 기법) — 어떤 스크롤 가능한 조상의 `overflow`에도 잘리지 않는다. 위 디자인
  프롬프트가 언급한 `AdminSelectField`는 이후 폐기·삭제됐으므로(2026-07-14,
  `docs/product/05-admin-web-ia.md`) 쓰지 않았다. 강제완료 모달의 시작/완료 시각은 `AdminTimePicker`.
- **i18n**: `cleaning.console.*`(ko/ja/en, `src/lib/i18n.ts`)에 KPI·상태·뷰탭·기록 테이블·상세
  패널·강제완료 모달 문구를 모두 추가했다. 건물명은 기존 `cleaning.buildingLabels`를 재사용.
- **버그 수정(부수)**: `admin-console.css`의 `--mono` 토큰이 `"Geist Mono", ui-monospace, monospace`
  뿐이라 한글이 모노스페이스 요소(`.rmc__rm`, 기록 테이블 객실 셀, `.elapsed` 등)에 들어가면 OS
  폰트 대체에 의존했다. `var(--font-noto-kr)`/`var(--font-noto-jp)`를 `monospace` 앞에 추가해
  자체 호스팅 웹폰트로 항상 렌더링되게 했다 — 청소 화면의 "단독" 객실 라벨, "기준 경과" 문구에서
  실제로 글자가 깨지는 것을 확인하고 고쳤다. 전 어드민 화면에 영향(개선만, 회귀 없음).
- **의도적으로 하지 않은 것** (범위 제외 목록과 동일): 청소 시작/완료 버튼, 관리자 방 배정, 실시간
  realtime 구독(대신 60초 폴링 `router.refresh()` — 아래 백엔드 연동 절 참고).
- 이 섹션이 기술한 mock 단계는 2026-07-14에 아래 "백엔드 연동" 절로 완전히 대체됐다. `completed_by_admin`
  컬럼, 실제 `cleaning_sessions`·예약 데이터 연동, 강제완료 서버 액션은 모두 구현 완료.

## 2026-07-14 청소 기록 내보내기 (Excel · PDF)

기록 탭 툴바의 Excel/PDF 버튼을 실제로 구현했다. **어드민 대시보드 전체의 모든 Excel/PDF는 하나의
디자인 톤으로 통일**한다는 원칙에 따라, 근태 급여 export(`attendance-payroll-workbook.ts` /
`attendance-payroll-report.ts`)와 동일한 "그린 렛저" 템플릿을 그대로 재사용했다 — 새 템플릿을
만들지 않았다.

**컬럼** (사용자와 기획 합의): No · 날짜 · 건물 · 객실 · 청소유형 · 담당자 · 시작시각 · 종료시각 ·
소요시간 · 구분(정상 완료 / 관리자 대리 완료) · 메모. 맨 아래 합계 행 = 총 건수 + 총 소요시간.
연동된 분실물/유지보수 리포트 건수는 제외(상세 패널 전용 정보로 유지).

**데이터 범위**: 기록 탭에 현재 적용된 필터(기간·건물·직원·상태·검색어) 그대로 내보낸다. 청소
모듈이 아직 mock 데이터 단계라, 클라이언트가 화면에 보이는 필터링된 행을 원본(canonical) 필드
그대로 서버 액션에 넘기고, 서버가 그 필드를 세션 로케일로 다시 로컬라이즈해서 문서를 만든다 —
클라이언트가 렌더링한 문자열을 그대로 보내지 않는다. 실데이터 연동 시에는 서버 액션 내부의
행 조회 부분만 실제 쿼리로 바뀌고, 워크북/리포트 빌더와 액션 시그니처는 그대로 유지된다.

**언어 = 로그인 사용자의 계정 언어.** 서버 액션이 `requireAdminSession()`으로 세션을 가져와
`session.user.preferredLanguage`로 `getDictionary()`를 호출한다 — 클라이언트가 로케일을 넘기지
않는다(근태 export와 동일한 원칙). Excel/PDF 모두 로그인 사용자가 설정한 언어(ko/ja/en)로 그대로
출력된다.

**새 파일**:
- `src/lib/cleaning-history-workbook.ts` — `.xlsx` 빌더(exceljs). 색상·테두리는
  `attendance-payroll-workbook.ts`가 export하는 `WORKBOOK_TITLE_FILL` / `WORKBOOK_HEADER_FILL` /
  `WORKBOOK_TOTAL_FILL` / `WORKBOOK_INK` / `workbookBox()`를 그대로 가져다 씀(새 팔레트 없음).
- `src/lib/cleaning-history-report.ts` — 인쇄용 HTML 빌더. `attendance-payroll-report.ts`와 동일한
  A4 landscape 그린 렛저 CSS·폰트스택(`'Meiryo','Malgun Gothic','Apple SD Gothic Neo','Hiragino
  Sans'`)을 그대로 사용.
- `src/app/admin/cleaning/actions.ts` — 서버 액션 2개(`exportCleaningHistoryWorkbook`,
  `exportCleaningHistoryReport`). `requireAdminSession()`으로 게이트 — 지금은 청소 콘솔 페이지
  자체와 동일한 접근 권한(파트타임 제외 전원)을 쓴다. 더 좁은 역할 제한(구 문서의 "Staff/Part-time
  불가" 스펙)이 필요하면 별도 결정 필요.
- 클라이언트(`cleaning-history-board.tsx`)는 근태와 동일 패턴: 엑셀은 `downloadAdminWorkbook`
  (base64→Blob 다운로드, `admin-format.ts` 재사용), PDF는 클릭 시점에 `window.open('', '_blank')`로
  빈 탭을 먼저 연 뒤(팝업 차단 회피) 서버가 만든 HTML을 `document.write`.
- i18n: `cleaning.console.colEnd/colNo/colNote/exportTitle/exportGeneratedLabel/exportTotalLabel/
  exportPrint/exportBlocked/tExportDone/tExportFailed`(ko/ja/en 추가). 기존 `colDate`/`colRoom`/
  `colType`/`colStaff`/`colStart`/`colDur`/`building`/`status`/`stNormal`/`stProxy` 키를 export
  컬럼 라벨로 재사용해 화면 라벨과 export 라벨이 어긋나지 않게 했다. 플레이스홀더였던
  `tExportXls`/`tExportPdf` 토스트 키는 제거.
- 파일명: `cleaning-history_{시작일YYYYMMDD}_{종료일YYYYMMDD}.xlsx`.

## 2026-07-14 어드민 청소 대시보드 — 백엔드 연동

위 mock 구현(화면 A/B, Excel/PDF export)을 실제 `cleaning_sessions` + 예약(Beds24 캐시) 데이터로
전면 교체했다. UI/디자인은 변경 없음 — 값의 출처만 mock 상수 → 실데이터로 바뀌었다.

**DB 마이그레이션**: `supabase/migrations/202607150001_cleaning_sessions_admin_force_complete.sql`
(원격 프로젝트에 적용 완료). `cleaning_sessions.completed_by_admin uuid references profiles(id)`
컬럼 추가 — 관리자가 담당자를 대신해 강제완료한 경우에만 채워짐(일반 완료는 `null`). 인덱스는
`where completed_by_admin is not null`인 부분 인덱스. RLS 정책은 건드리지 않았다 — 강제완료
서버 액션은 서비스 롤(RLS 우회) + 앱 레벨 역할 체크로 쓰기 때문(근태 관리자 쓰기 패턴과 동일).

**새/수정 파일**:
- `src/lib/room-label-normalization.ts` — 룸키 해석 로직(`resolveRoomKey`의 3단계 폴백,
  `buildRoomKey`/`buildSessionRoomLabel`, `buildSessionLabelToRoomKeyMap`,
  `buildLegacyAliasToRoomKeyMap`)을 공용 export로 승격. 기존에 `mobile/cleaning/page.tsx`와
  `cleaning-targets.ts`에 각각 중복 구현돼 있던 것을 여기 하나로 통합했고, 두 파일 모두 이 export를
  import하도록 리팩터(동작 100% 동일, 어드민이 세 번째 소비자로 추가).
- `src/lib/cleaning.ts` — `getOrgTodayCleaningSessions`(오늘 조직 전체 세션 전체 컬럼 조회),
  `CLEANING_OVERDUE_HOUR = 11`(도쿄 기준 지연 판정 시각), `canForceCompleteCleaning`/
  `cleaningForceCompleteRoles`(강제완료 가능 역할: developer_super_admin·owner·전무·office_admin·
  field_manager), `getCleaningStaffOptions`(청소 담당 가능 역할로 필터된 직원 목록) 추가.
- `src/lib/admin-cleaning.ts` (신규) — 실데이터 레이어. `getAdminCleaningToday(session)`은
  `getCleaningTargets`(예약 기반 오늘 청소 대상) + `getOrgTodayCleaningSessions`(오늘 세션)을
  roomKey로 매칭해 상태(대기/진행/완료/지연)를 산출한다. 예약과 매칭되지 않는 세션(수동/장기투숙
  청소 등)도 별도 카드로 포함해 실데이터가 누락되지 않게 했다. `getAdminCleaningHistory`는 기존
  `getOrgCleaningSessionsFiltered`를 감싸 화면/export가 기대하는 모양으로 매핑.
- `src/app/admin/cleaning/actions.ts` — `forceCompleteCleaningSession` 추가(세션 있으면 UPDATE,
  없으면 INSERT, 둘 다 `completed_by_admin: 관리자 id` 기록). `fetchAdminCleaningHistory(from, to)`
  추가 — 기록 탭에서 최초 로드된 달(page.tsx가 서버에서 미리 로드) 밖의 기간을 선택하면 이 액션으로
  다시 조회한다. `exportCleaningHistoryWorkbook`/`exportCleaningHistoryReport`는 시그니처 변경 없음
  (mock 단계부터 이미 "클라이언트가 넘긴 필터된 행을 서버가 그대로 포맷" 구조였기 때문).
- `src/app/admin/cleaning/page.tsx` — `requireAdminPageSession`으로 게이트, `getAdminCleaningToday` +
  이번 달 `getAdminCleaningHistory`를 서버에서 미리 로드해 `CleaningConsole`에 prop으로 전달(첫
  렌더에 빈 화면이 보이지 않게).
- `src/components/admin/cleaning/*.tsx` — mock 타입(`CleaningTask`/`HISTORY`/`STAFF`/`TASKS`)을
  전부 제거하고 `admin-cleaning.ts`의 실데이터 타입(`AdminCleaningTask`/`AdminCleaningHistoryItem`/
  `AdminSettingTarget`)으로 교체. 강제완료는 로컬 state 낙관적 패치 대신 서버 액션 호출 →
  성공 시 `router.refresh()`(근태 관리자 쓰기 패턴과 동일). 오늘 현황 보드는 60초 주기 + 수동
  동기화 칩 클릭 시 모두 `router.refresh()`로 실제 서버 데이터를 다시 가져온다(실시간 realtime
  구독은 여전히 범위 밖 — 폴링으로 "진행 중 청소 자동 갱신" 요구를 충족).
- **셋팅 대상 정의 변경**: mock 단계는 "체크아웃 있는 방 중 턴오버"로 셋팅 대상을 계산했지만,
  실데이터는 모바일과 동일한 `getCleaningTargets().settingList`(체크아웃 없는 순수 입실 객실만)를
  그대로 쓴다 — 체크아웃 카드에는 이미 턴오버 도착 정보가 별도 표시되므로 중복을 피했다(모바일과
  셋팅 대상 정의가 완전히 일치).
- **셋팅 카드 클릭 → 예약 정보 전용 축소 패널 (2026-07-14 후속)**: 처음엔 셋팅 대상(예약만 있고
  아직 청소 세션이 없는 방)에 보여줄 실데이터가 없어 mock 단계의 클릭 핸들러를 제거했었지만,
  사용자 피드백으로 다시 클릭 가능하게 만들었다. 단, 일반 청소 카드/기록 행과 같은 상세 패널을
  재사용하지 않고 `CleaningDetailPanel`에 `setupTarget` 분기를 추가해 별도의 축소된 패널을
  렌더링한다 — 객실·건물·게스트명·인원·"오늘 도착"만 보여주고, 시간 기록/담당자/메모/연동 리포트/
  강제완료 버튼은 표시하지 않는다(해당 데이터 자체가 없으므로). 안내 문구
  (`cleaning.console.setupNoSession`, ko/ja/en)로 "아직 청소 세션이 시작되지 않았다"는 것을 명시한다.
  선택 상태는 오늘 현황 탭 내에서 청소 카드 선택(`selectedId`)과 셋팅 카드 선택(`selectedSetupKey`)이
  상호 배타적으로 관리된다(하나를 클릭하면 다른 하나는 자동 해제).
- **직원 아바타 색상**: 실제 직원 프로필에는 색상 컬럼이 없어 스키마 변경 없이 user id 해시 기반
  고정 팔레트(8색)로 결정적으로 배정 — 같은 사람은 세션 내내 항상 같은 색.
- **아바타 도착 시각**: mock은 가짜 도착 시각(`arrive`)을 보여줬지만 실제 예약에는 시각 정보가 없어
  (체크인 날짜만) `hasArrivalToday: boolean` + "오늘" 라벨로 대체.
- **직원별 오늘 요약 = 실제로 오늘 청소를 완료한 직원만 (2026-07-14 후속)**: 처음엔 청소 담당
  가능 역할(오너·현장매니저·직원·파트타임)을 가진 조직의 모든 활성 멤버를 항상 표시했었는데(오늘
  실적이 없으면 "완료 0건"), 조직 인원이 늘어날수록 실제로 일하지 않은 사람까지 다 나열되는 문제가
  있어 사용자 피드백으로 변경했다. 이제 오늘 완료 건수가 1건 이상인 직원만 카드로 표시하고, 아무도
  완료하지 않았으면 섹션 자체를 렌더링하지 않는다(`cleaning-today-board.tsx`의
  `StaffSummarySection`).
- **버그 수정(2026-07-14 후속): 강제완료 모달 담당자 드롭다운이 비어 표시됨.**
  `getCleaningStaffOptions`(`src/lib/cleaning.ts`)가 `memberships.role`을 조회할 때 쓰는 역할 목록에
  플랫폼 전용 역할 `developer_super_admin`이 섞여 있었는데, 이 값은 `organization_role` DB enum에
  존재하지 않아 `.in("role", ...)` 쿼리 자체가 Postgres에서 enum 캐스팅 에러로 거부됐다. 그 에러가
  `getAdminCleaningToday`의 `.catch(() => [])`에 조용히 삼켜지면서 담당자 목록이 항상 빈 배열이
  됐다. 쿼리 직전에 `developer_super_admin`을 필터링해서 제외하도록 수정(기존
  `admin/announcements/[id]/page.tsx`의 `orgAdminWebRoles` 패턴과 동일).
- **문서 감사 후속 구현 (2026-07-14): 데이터 로드 실패 시 KPI "-" 표시.**
  `getAdminCleaningToday`(`src/lib/admin-cleaning.ts`)가 `getCleaningTargets`/
  `getOrgTodayCleaningSessions`/`getCleaningStaffOptions` 중 하나라도 실패하면 `loadError: true`를
  반환하도록 확장. `CleaningConsole`은 `loadError`일 때 KPI 6칸 전부(청소 대상·미시작·진행중·완료·
  완료율·셋팅 대상)를 숫자 대신 `-`로, 서브 라벨은 `t.errT`("데이터를 불러오지 못했습니다")로
  표시한다. `getActiveRoomCatalogServer` 실패는 룸키 매칭 정밀도만 낮추는 보조 데이터라 `loadError`
  판정에서 제외.
- **문서 감사 후속 구현 (2026-07-14): 연동 리포트 타일 클릭 → 실제 이동.**
  기존엔 상세 패널의 분실물/유지보수 리포트 타일을 눌러도 토스트만 뜨고 실제로 이동하지 않았다.
  `admin-cleaning.ts`의 세션별 리포트 집계를 건수(count)뿐 아니라 실제 레코드 id 배열
  (`lostIds`/`issueIds`, `lost_items`/`maintenance_reports` 조회에 `id` 컬럼 추가)까지 반환하도록
  확장하고, 상세 패널의 `onOpenReport(kind)` 콜백이 해당 종류의 id가 1개면 `/admin/lost-found/{id}`
  또는 `/admin/maintenance/{id}`로 바로 이동, 2개 이상이면 목록 화면(`/admin/lost-found`,
  `/admin/maintenance`)으로 이동한다(세션 단위 필터링 파라미터가 두 목록 화면에 없기 때문). 기록
  탭 행에는 `reports`가 항상 없으므로(과거 세션 조회 시 리포트 집계를 하지 않음) 이 동작은 오늘
  현황 카드에서만 의미가 있다 — 자리표시자였던 `cleaning.console.tReport` i18n 키는 삭제.
- **범위 제외 위반 제거 (2026-07-14): 소요시간 70분 이상 경고 배지 삭제.** Claude Design 목업을
  1:1 이식할 때 딸려온 `dur >= 70` 하드코딩 경고 표시(기록 테이블·상세 패널 소요시간에 노란/경고색
  + 세모 아이콘)가 있었는데, 이는 문서의 "범위에서 제외" 목록에 명시된 "❌ 소요시간 이상치
  플래그"와 정면으로 충돌하는 상태였다. 게다가 `70`분이라는 기준값 자체가 실제 운영 데이터와 무관한
  임의값이었고, 사용자 확인 결과 이 조직의 실제 최단 청소 소요시간이 2시간 30분(150분)이라 이
  기준으로는 사실상 모든 청소 건이 상시 "경고" 상태가 되어 기능이 무의미했다 — 완전히 삭제
  (`cleaning-history-board.tsx`, `cleaning-detail-panel.tsx`의 `long`/`is-long` 분기와
  `cleaning-console.css`의 `.hdur.is-long`/`.durbig__lbl.is-long` 규칙 제거).
- **지연 판정 시각 기준 삭제 (2026-07-14).** 기존엔 오늘 체크아웃인데 미시작인 방을 도쿄 기준
  11:00(`CLEANING_OVERDUE_HOUR`) 이전엔 중립("대기중"), 11:00 이후에만 경고색("지연")으로
  표시했다. 사용자 판단으로 이 시각 기준을 완전히 제거했다 — 관리자가 대시보드를 실제로 확인하는
  시점은 근무 시간대에 따라 제각각이라 특정 고정 시각과 무관하며, 미시작 체크아웃 객실은 언제
  확인하든 항상 즉시 조치가 필요한 항목이므로 "아직은 괜찮은 대기 상태"라는 유예 구간 자체가
  의미가 없다는 판단. `src/lib/admin-cleaning.ts`에서 미매칭 체크아웃 대상은 이제 즉시 `overdue`
  상태로 분류되며(`pending`은 이 경로에서 더 이상 발생하지 않음 — 타입은 향후 확장을 위해 유지),
  `src/lib/cleaning.ts`의 `CLEANING_OVERDUE_HOUR` 상수와 `admin-cleaning.ts`의
  `tokyoNowMinutes()` 헬퍼는 삭제됐다. "기준시각 경과"를 언급하던 `overdueNote`/`overduePast`
  i18n 문구(ko/ja/en)도 "청소 미시작" 계열로 수정.
- i18n: `cleaning.console.histLoading`(기간 변경 시 서버 재조회 중 로딩 문구), `tDoneFailed`(강제완료
  실패 토스트)를 ko/ja/en 추가. `tReport`(사용처 없어진 자리표시자 토스트 문구)는 삭제.
- **검증**: `npm run lint` / `npm run build` 통과. 로그인 세션이 필요한 실제 클릭 동작(강제완료,
  기간 재조회, export)은 이 작업에서 라이브 테스트하지 못했다 — 사용자가 로그인된 세션에서 직접
  확인 필요.
