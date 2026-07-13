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

> **상태:** 기획 확정. 디자인 파일 대기 → 디자인 100% 구현 + 백엔드 재구현 예정.
> 이 섹션은 디자인·구현의 기준 스펙이다. 기존 `/admin/cleaning`(읽기 전용 모니터링 + CSV)을
> 전면 재설계한다.

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
- **⚠️ 누락/미시작 강조**: 오늘 체크아웃인데 미시작 객실은 경고색, 기준 시각 이후 미완료면 '지연' 라벨.
- **🏷️ 연동 리포트 배지**: 해당 청소 세션에서 나온 분실물·시설 이슈 개수(0이면 숨김).
- **직원별 오늘 요약**: 직원별 `완료 건수 · 평균 소요시간`.
- **실시간 갱신**: 자동 주기 갱신(30~60초). 즉시 realtime 구독은 이번 범위 아님.

### 화면 B — 기록/이력

- **필터 바**: 시작일 · 종료일 · 건물 · 직원(이름 검색 포함) · 상태. 어드민 공용 shared 컴포넌트 사용.
- **모든 사용자의 기록 조회** + **직원 검색**으로 특정 사용자 기록만 조회 가능.
- **테이블**: 객실 · 청소유형 · 담당자 · 상태 · 시작시각 · 소요시간.
- **행 클릭 → 우측 상세 패널**: 객실(풀네임) · 청소유형 · 상태 · 담당자 · 날짜 · 시작/종료 · 소요시간 ·
  메모 · 연동 분실물/시설 리포트 링크 · (대리 완료 시)관리자 대리 완료 표시.
- **내보내기 = Excel + PDF 둘 다** (기존 CSV 확장). 내보내기 필드:
  `사용자 · 청소 장소(건물·객실) · 청소유형 · 시작/종료 시각 · 소요시간 · 상태 · 메모`.
  PDF는 급여 PDF와 동일한 인쇄 품질 톤으로 통일(`attendance-payroll-report.ts` 패턴 재사용).

### 강제완료 (관리자 대리 완료) — 유일한 개입 액션

- **진행중 카드/상세 패널**에 `[완료 처리]` 버튼.
- **확인 모달**: 객실 · 담당자 · 시작 시각 · **완료 시각 입력**(AdminTimePicker, 기본값=현재) · (선택)메모.
  → 관리자가 실제 완료 시각을 입력하므로 `started_at → 입력 시각`으로 소요시간이 정확히 계산됨
  (직원이 몇 시간 깜빡한 경우의 소요시간 오염 방지).
- **감사 기록**: `cleaning_sessions`에 `completed_by_admin`(관리자 user id) 저장. 상세·기록 뷰에
  **"관리자 대리 완료"** 배지 표시. → 마이그레이션으로 컬럼 추가 필요.
- **권한**: 상위 관리자/매니저(owner·전무·office_admin·field_manager 등)만. 서버 액션에서 게이트.

### 상호작용 목록 (디자인이 그려야 할 것)

1. 필터(기간·건물·직원 검색·상태) 2. 탭/날짜 전환 3. 행·카드 클릭 → 상세 패널
4. Excel/PDF 내보내기 5. 진행중 세션 → 완료 처리(확인 모달). 그 외 입력/버튼 없음(읽는 화면).

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
