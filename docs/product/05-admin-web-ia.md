# Admin Dashboard IA

## Purpose

이 문서는 StayOps 관리자 대시보드의 단일 기준 문서다.

- 모바일 앱은 현장 실행용 표면이다.
- 관리자 대시보드는 데스크톱/노트북 중심 운영 콘솔이다.
- 두 표면은 연결되지만 같은 화면의 반응형 변형이 아니다.

이 문서는 관리자 대시보드의 원칙, 정보구조, 공통 UX 패턴, 모듈 우선순위를 정의한다.
모바일 고유 UX는 `docs/product/16-mobile-navigation.md` 와 각 기능 문서가 계속 맡는다.

## Status

2026-06-29 기준 관리자 대시보드 리빌드 방향이 확정되었다.

- 기존 `/admin` 구현은 참고 자산일 뿐이며, 이번 대시보드 작업 중 재구성될 수 있다.
- 현재 코드의 역할/화면 범위는 이 문서와 완전히 일치하지 않을 수 있다.
- 앞으로 대시보드 관련 구현은 이 문서를 기준으로 정렬한다.

### Implemented (2026-06-29)

- **Dashboard Home** 가 데스크톱 운영 콘솔로 구현됨.
  - Shell: 그룹형 IA 사이드바(Home / Operations / Work·Comms / Management) +
    조직 컨텍스트 + 모바일 보기 진입 + 콘솔 헤더(크럼 · 전역 검색 · 알림 · 계정).
    `src/components/shell/admin-shell.tsx`.
  - Home: ops summary bar + 최상단 우선 블록 카드(진행 중 청소 · 즉시 처리 큐 ·
    이상 근태/정정 · 중요 공지 · 오늘 할 일 · 예약 체크인/아웃). 모든 블록은
    `getAdminDashboard`(`src/lib/admin-dashboard.ts`)로 실데이터 연동되고 각 모듈로
    진입한다. `src/components/admin/dashboard-home.tsx`.
  - **진행 중 청소 카드**는 행 클릭 시 **우측 상세 슬라이드 패널**(작업 정보 · 활동 기록 · 완료/메시지
    액션)을 연다. 체크리스트는 StayOps 청소 데이터 모델에 없어 제외하고 실제 보유 필드(담당/시작/경과/유형/
    상태)만 표시한다. 다른 모듈의 우측 패널·자동 갱신·알림/조직 전환 팝오버는 후속 슬라이스다.
  - 사이드바는 디자인 핸드오프 기준 **다크 웜-에스프레소 레일**(골드 액티브 액센트) + 아이보리 콘텐츠이고,
    섹션은 **운영 / 인력 / 정보** 3그룹이다. 브랜드 마크는 실제 앱 아이콘(`/icon-192.png`)을 쓴다.
- **Admin Login** 구현됨 (2026-06-30). 데스크톱 콘솔 진입 화면을 split 레이아웃(좌측 다크 클레이
  브랜드 패널 + 우측 인증 폼)으로 통일했고, 전 상태(진입 · 이메일 로그인 · 가입 · 비밀번호 재설정 ·
  발송 완료 · 새 비밀번호 · 차단/정지/제거/비활성)에 적용했다. 실제 인증 흐름(`next`·온보딩·차단
  게이팅·언어 선택)은 그대로 보존했다. 파일: `src/app/auth/login/auth-frame.tsx`,
  `auth-console.css`(.authx), 재스타일된 `email-*-form.tsx`/`google-button.tsx`/`page.tsx`.
  i18n는 `auth.console`(ko/ja/en) 추가. 모바일/태블릿은 좁은 폭에서 브랜드 패널을 숨기고 폼만 노출한다.

## Surface Boundary

관리자 대시보드는 독립 표면이다.

- 데스크톱/노트북은 `/admin`
- 모바일/태블릿은 `/mobile`
- 모바일/태블릿은 `/admin*` 를 직접 렌더링하지 않는다
- 대시보드 안에서 모바일 앱을 보는 기능은 허용되지만, 그것이 표면 통합을 의미하지는 않는다

즉 원칙은 아래와 같다.

- 앱은 앱이다
- 웹은 웹이다
- 데이터와 계정은 공유할 수 있다
- 하지만 UI, IA, 조작 흐름은 분리한다

## Installable Admin PWA (2026-07-03)

관리자 콘솔은 모바일 앱과 **분리된 독립 설치형 PWA**다. 오피스/관리 인력이 데스크톱에서
바탕화면·시작메뉴·독 아이콘으로 실행해 주소창·탭 없는 standalone 창으로 쓰도록 한다.

- 관리자 전용 매니페스트: `public/manifest-admin.webmanifest`
  - `id "/admin"`, `scope "/admin"`, `start_url "/admin"`, `display "standalone"`.
  - orientation 미지정(=any) — 모바일과 달리 세로 고정하지 않는다.
  - 아이콘은 **1차로 기존 모바일 세트(`/icons/*`)를 재사용**한다(전용 아이콘은 후속 과제).
- `src/app/admin/layout.tsx`가 `metadata.manifest`를 위 매니페스트로 오버라이드한다.
  Next.js 메타데이터는 세그먼트 단위로 병합되므로 `/admin/*`에서만 관리자 매니페스트가,
  그 외(`/mobile` 등)에서는 루트의 모바일 매니페스트가 노출된다.
- 결과: `/admin` 페이지에서 설치하면 "StayOps Admin"(id `/admin`) 앱이, `/mobile`에서 설치하면
  "StayOps"(id `/`) 앱이 각각 별개로 등록된다.
- 서비스워커(`public/sw.js`, scope `/`)와 오프라인 폴백(`/offline`)은 두 표면이 공유한다.

제약:

- macOS Safari는 데스크톱 PWA 설치를 지원하지 않는다 → 관리자는 Chrome/Edge로 설치.
- `scope "/admin"`이므로 스코프 밖(`/auth`, `/onboarding`) 이동은 standalone 창이 아닌 브라우저
  탭으로 열릴 수 있다. 관리자 셸의 일상 흐름은 `/admin` 내부에서 완결되어 현재 문제 없다.

데스크톱 exe(Electron/Tauri) 패키징은 도입하지 않는다. 로컬 파일시스템 심층 통합이나 브라우저
비의존 상주가 필요해질 때 재검토하며, 현 분리 구조가 그 전환의 선행 작업이 된다.

## Core Principles

### 1. Full Admin Surface

관리자 대시보드는 단순 조회판이 아니다.

- 실행
- 등록
- 수정
- 삭제
- 상태 변경
- 검토
- 승인/반려
- 운영 관리

를 모두 수행할 수 있어야 한다.

원칙적으로 모바일에서 가능한 기능은 관리자 대시보드에서도 가능해야 한다.

### 2. Physical Exceptions Only

완전한 기능 대응 원칙의 예외는 물리 장치 제약뿐이다.

현재 확정된 예외:

- 출근/퇴근 QR 스캔 실행은 모바일 전용

하지만 아래는 대시보드에서 가능해야 한다.

- 출근 사이트 관리
- QR 생성/재발급/보관/이력 관리
- 근태 수동 생성/수정/무효화
- 정정 요청 검토
- 급여/교통비 검토 및 export

### 3. Execution And Management Together

대시보드는 모바일보다 더 강한 관리 표면이다.

- 모바일은 빠른 현장 실행에 최적화
- 대시보드는 여러 건 비교, 검토, 수정, 기록 추적, export, 조직 관리에 최적화

예외적으로 청소는 현장 실행보다 관리자 개입 중심으로 해석한다.

- 일반 청소 시작: 기본적으로 모바일 중심
- 일반 청소 완료: 기본적으로 모바일 중심
- 관리자 강제 완료: 대시보드 포함
- 기록 수정/보정/추적/export: 대시보드 포함

### 4. Same Brand, Different Layout

대시보드는 모바일과 같은 브랜드 톤을 유지한다.

- 색상
- 기본 무드
- 표면 질감
- 브랜드 감성

은 모바일과 맞춘다.

대신 레이아웃은 데스크톱 운영 콘솔에 맞게 재구성한다.

- 테이블
- 카드
- 우측 상세 패널
- 고밀도 필터
- 다중 정보 비교

가 기본 구조다.

### 5. Access Gate And Feature Gate Are Separate

관리자 대시보드 접근 방향은 아래와 같다.

- **(2026-07-13 기준, `canAccessAdminWeb`/`adminWebRoles`, `src/config/roles.ts`)**
  `part_time_staff`를 제외한 **전원**이 어드민 웹에 접근 가능하다: `developer_super_admin`, `owner`,
  `senior_managing_director`(전무), `office_admin`, `cs_staff`, `field_manager`, `staff`.
- **접근 가능(access)과 기본 착지 모드(default surface)는 별개다.** `field_manager`·`staff`는 어드민 웹을
  열 수 있지만 **기본 착지는 모바일**이다(`defaultsToAdminSurface`, `src/config/roles.ts`). 모드 간 전환은
  `canSwitchToFieldMode`(part_time 제외 전원 가능). 즉 현장 인력은 모바일이 홈이되, 필요 시 어드민 웹에 진입할 수 있다.

단, 세부 기능 권한은 지금 일괄 확정하지 않는다.

- 대시보드 접근 가능 여부
- 각 기능의 보기/수정/삭제/승인 권한

은 분리해서 관리한다.
모듈 구현 시점마다 해당 기능 문서와 서버 권한 규칙에서 확정한다.

## Primary Navigation

대시보드 좌측 내비게이션은 디자인 핸드오프 기준 **3개 묶음(운영 / 인력 / 정보)** 으로 정리한다.
(구현은 현재 존재하는 `/admin/*` 라우트만 노출하며, 모듈이 추가되면 해당 그룹에 편입한다.
`src/config/navigation.ts` 의 `adminNavGroupOf` / `adminNavGroupOrder` 가 단일 소스다.)

### 운영 (Operations)

- Dashboard Home (홈)
- Cleaning (청소)
- Maintenance (정비·시설)
- Lost & Found (분실물)
- Orders (주문·비품)

### 인력 (People)

- Attendance / Payroll / Transportation (근태)
- Users / Members (멤버)

### 정보 (Information)

- Reservations / Calendar (예약)
- Announcements / Board (공지·게시판)
- Todoist (투두이스트) — 대시보드 콘솔은 다른 어드민 모듈의 "관리형" 패턴이 **아니라** Todoist 본연의
  워크스페이스(모바일 코어 패리티) + 사무실 **업무 지시**만. 기획 스펙: `docs/product/28-admin-todoist-console.md`.
  라우트는 legacy `/admin/recurring-work` → 신설 `/admin/tasks` 예정.
- Settings (설정)

향후 모듈(Linen Return · Complaints · Tasks/Projects · Suggestions · Bug Reports · Notifications ·
Permissions · Invite Codes · Attendance Sites/QR 등)은 위 3개 그룹의 성격에 맞춰 편입한다.

## Dashboard Home

`/admin` 홈은 KPI 판넬과 작업 허브가 결합된 운영 콘솔이어야 한다.

## Shared Dashboard UI System

관리자 대시보드의 표준 시각/상호작용 언어는 `src/components/admin/admin-console.css`의 콘솔 패턴과
`src/components/admin/shared`의 공용 프리미티브를 기준으로 한다. 기존 Tailwind 중심 관리자 화면은
즉시 전면 재작성하지 않지만, 새로 만드는 화면이나 수정하는 화면은 아래 기준을 먼저 확인한다.

- `AdminMonthPicker`, `AdminDatePicker`, `AdminTimePicker`, `AdminDateRangePicker`(단일 결합
  "시작일 – 종료일" 트리거 + 범위 선택 캘린더 팝오버, 2026-07-14 청소 기록 필터에서 처음 도입.
  팝오버는 `position:fixed` + 트리거 `getBoundingClientRect()` 기반 뷰포트 클램프 좌표라 스크롤
  가능한 조상의 `overflow`에 잘리지 않는다)
- `AdmDropdown`(`.dd`) — **어드민 콘솔의 단일 드롭다운 표준**. 네이티브 `<select>`와 필터 드롭다운을
  모두 대체한다. 값 편집·필터·정렬 어디서든 이 하나만 쓴다. 폼 제출용은 `DdFormSelect`(숨은 input
  래퍼)를 쓴다. CSS는 `admin-console.css`에 있어 모든 `.adm` 페이지에서 로드된다. **화면마다 다른
  드롭다운을 만들지 않는다**(구 칩형 `ChipDropdown`/`.adp` 드롭다운은 폐기·삭제됨, 2026-07-13).
  단, 달력형 `AdminDatePicker`/`AdminTimePicker`/`AdminMonthPicker`는 드롭다운이 아닌 별도 피커 컨트롤이다.
  네이티브 `<select>`를 폼에서 대체할 땐 `DdFormSelect`, 네이티브 `<input type="date">`를 폼에서
  대체할 땐 `DateFormField`(둘 다 숨은 input 래퍼)를 쓴다. 과거의 두 번째 커스텀 드롭다운
  `AdminSelectField`(`.selfield`)는 폐기·삭제됨(2026-07-14) — `.dd`만 쓴다.
- `AdminReasonModal`
- `useAdminPanelA11y`
- `AdminExportButtons` — 콘솔의 **유일한** 내보내기 컨트롤 (아래 참조)
- `admin-format` utilities for workbook download, yen formatting, and shared transport status pills

같은 역할의 월/일자/시간 선택, 드롭다운, 사유 입력 모달, 우측 패널 동작을 기능별 폴더에 다시 만들지
않는다. 필요한 차이가 있으면 `src/components/admin/shared`의 프리미티브를 확장하거나 명시적인 디자인
결정으로 예외를 남긴다. `src/components/admin/attendance`는 이제 근태 도메인 화면 컴포넌트만 소유하고,
대시보드 전반에서 재사용 가능한 조작 프리미티브와 동일 출력의 포맷/다운로드 유틸은 shared 소유로 둔다.

### 캘린더 — 하나의 디자인, 예외 없음 (절대 규칙, 2026-07-14)

어드민 콘솔의 모든 날짜 컨트롤은 아래 **셋 중 하나**다. 네 번째는 없고, 기능별 자체 캘린더도 없다.

| 용도 | 컴포넌트 | 폼(`<form method="get">`)용 래퍼 |
| --- | --- | --- |
| 기간(범위) | `AdminDateRangePicker` | `DateRangeFormField` |
| 특정 하루 | `AdminDatePicker` | `DateFormField` |
| 특정 월 | `AdminMonthPicker` | — |

- **네이티브 `<input type="date">` 사용 금지.** 브라우저 기본 캘린더가 떠서 콘솔과 절대 같아지지 않는다.
  (2026-07-14에 분실물·수리점검·주문 필터바, 연차 신청 모달, 연차 잔여 입사일 편집에서 전부 제거함.)
- 캐논 캘린더 크롬은 청소 기록 탭 범위 피커의 `.calpop` 팝오버다 — 폭 292px, radius 16px, padding 14px,
  30px nav 버튼, 34px 날짜 셀, 오늘 표시 점. `admin-console.css`의 `.adp__*`(단일일)과 `.amp__*`(월)은
  이와 **의도적으로 동일하게 유지**한다. 하나를 손보면 셋 다 손본다.
- `AdminMonthPicker`는 **월 선택 개념 그대로 유지**한다(급여·교통비·수당). 월 선택을 범위 선택으로,
  또는 그 반대로 임의 변환하지 않는다 — 서로 다른 조작 개념이다.

### Excel + PDF 내보내기 — 하나의 컨트롤, 하나의 템플릿 (절대 규칙, 2026-07-14)

- 콘솔의 모든 내보내기는 **`<AdminExportButtons>`**
  (`src/components/admin/shared/admin-export-buttons.tsx`)로 렌더한다 — `chipbtn` + lucide `Download`
  2개 조합. 화면마다 내보내기 버튼을 새로 만들지 않는다.
- **Excel과 PDF는 항상 함께 제공한다.** 둘 중 하나만 있는 화면은 미완성으로 본다.
- 서버 측에서 두 포맷은 **동일한 입력 구조**를 공유한다:
  `buildAdminTableWorkbookBase64()` (`src/lib/admin-table-workbook.ts`) 와
  `buildAdminTableReportHtml()` (`src/lib/admin-table-report.ts`). 초록 원장 서식(제목 병합행 → 헤더행 →
  번호 매긴 데이터행 → 합계행 → org/생성일시 푸터)은 `attendance-payroll-workbook.ts`의 상수를 재사용한다.
  새 색상이나 새 워크북 레이아웃을 만들지 않는다.
- **CSV는 폐기됐다.** 신규 CSV 다운로드, 클라이언트 `Blob` 내보내기, `/api/admin/export/*` 라우트를
  추가하지 않는다 — 해당 경로는 2026-07-14에 전부 삭제됐다.
- **내보내기 로케일은 서버가 결정한다.** `buildAdminExportMeta(session)`이
  `session.user.preferredLanguage`에서 해석한다. 클라이언트는 export 액션에 로케일을 넘기지 않는다.
- 두 프리미티브의 문구는 공용 `dictionary.admin.shared` 네임스페이스(`ko`/`ja`/`en`)에 있다. 기능별
  네임스페이스에 `exportXls`, `pickRange`, `dateApply` 같은 키를 다시 선언하지 않는다.

적용 현황(2026-07-14 기준): 청소 기록 / 근태 급여 / 근태 교통비 / 근태 수당 / 연차 이력 / 연차 잔여 /
분실물 / 주문·비품 — 전부 위 캐논을 따른다.

**확정 예외 — 수리·점검(`/admin/maintenance`)에는 내보내기가 없다 (2026-07-14, 사용자 결정).**
"Excel과 PDF를 항상 함께 제공한다"는 위 규칙은 **내보내기를 제공하는 화면**에 적용되는 것이지, 모든
화면이 내보내기를 가져야 한다는 뜻이 아니다. 수리·점검은 급여·정산처럼 외부로 넘길 산출물이 아니라
현장이 처리하고 콘솔이 감시하는 운영 기록이라, 내보낼 일이 없다고 판단했다. 버튼과 서버 액션
(`exportMaintenanceWorkbook` / `exportMaintenanceReport`)을 **모두 삭제**했다 — 다시 필요해지면
`buildAdminTableWorkbookBase64` / `buildAdminTableReportHtml`로 되살린다. 새 화면에 내보내기를 붙일
때는 여전히 Excel + PDF 2종을 함께, `<AdminExportButtons>`로만 제공한다.

### Home Top Priority Blocks

최상단 우선 정보는 아래 4묶음이다.

- 진행 중 청소
- 미처리 정비 / 분실물 / 주문
- 이상 근태 / 정정 요청
- 중요 공지 / 오늘 할 일

### Home Should Also Include

- 오늘 체크인 / 체크아웃 현황
- 예약/객실 운영 경고
- 새 알림
- 컴플레인/버그 리포트 요약
- 조직 전환 상태
- 전역 검색 진입

## Global Dashboard UX

### Global Search

대시보드 상단 전역 검색은 1차 필수다.

검색 대상:

- 사용자
- 건물 / 객실
- 예약
- 정비
- 분실물
- 주문
- 할 일
- 게시판 / 공지 / 제안함 / 버그 리포트
- 컴플레인

### Organization Switcher

하나의 계정이 여러 조직을 다룰 수 있으므로 대시보드 상단 조직 전환기를 둔다.

### Notification Center

알림 센터는 1차 포함이다.

- 벨 아이콘
- 읽음/안읽음
- 중요 알림 우선 표시
- 해당 상세 화면 deep link

### List / Detail Pattern

핵심 목록 화면은 아래 패턴을 기본으로 한다.

- 목록
- 우측 상세 패널
- 필요 시 전체 상세 페이지

즉 기본은 빠른 패널 검토이고, 긴 편집/복잡한 기록은 전체 페이지로 확장한다.

### Batch Actions

일괄 처리는 1차 필수가 아니다.

- 1차는 단건 실행/수정/검토 흐름 완성
- 2차에서 모듈별 일괄 처리 확장

### Real-Time Refresh

핵심 운영 모듈만 자동 갱신한다.

1차 자동 갱신 포함:

- 진행 중 청소
- 이상 근태 / 정정 요청
- 미처리 정비 / 분실물 / 주문
- 알림 센터
- 오늘 할 일
- 예약 / 체크인 / 체크아웃 현황

나머지는 수동 새로고침 또는 재진입 기준으로 처리해도 된다.

## Foundational First Screens

대시보드 디자인은 아래 2개 화면부터 시작한다.

1. 로그인 화면
2. 홈 화면

이 두 화면이 대시보드 전체의 첫 인상, 톤, 구조, 정보 우선순위를 결정한다.

### Why These Two First

- 로그인 화면은 데스크톱 대시보드의 진입 규칙을 고정한다
- 홈 화면은 대시보드 전체 IA 와 운영 철학을 고정한다
- 이후 기능 화면은 홈에서 무엇을 먼저 보여주는지에 따라 구조가 정해진다

## Admin Login Screen

### Purpose

관리자 대시보드 로그인 화면은 데스크톱 사용자가 StayOps 운영 콘솔로 진입하는 첫 화면이다.

이 화면은:

- 하나의 계정 체계
- 데스크톱 우선 진입
- 운영 제품다운 신뢰감
- 다국어 지원
- 로그인 이후 정확한 표면 진입

을 동시에 보여줘야 한다.

### Core Rules

- 루트 데스크톱 진입은 로그인 화면으로 들어간다
- 모바일/태블릿은 대시보드 로그인 화면을 기본 표면으로 보지 않는다
- 로그인 성공 후에는 온보딩/권한/조직 상태를 반영해 다음 표면으로 이동한다
- 같은 계정 체계로 모바일 앱과 대시보드를 함께 사용한다
- 대시보드와 모바일 중 하나를 고르는 랜딩 화면은 두지 않는다

### Required Login States

디자인은 아래 상태를 수용할 수 있어야 한다.

- 기본 로그인 진입
- 이메일 로그인
- 이메일 회원가입
- 비밀번호 재설정 요청
- 새 비밀번호 설정
- 확인 메일 발송 완료
- 비밀번호 변경 완료
- 계정/멤버십 차단 상태

즉, 로그인 화면은 한 장의 정적 화면이 아니라 인증 상태를 담는 공통 프레임이다.

### Required Elements

- StayOps 브랜드 영역
- 운영 콘솔이라는 정체성을 보여주는 짧은 설명
- Google 로그인 진입
- 이메일 로그인 진입
- 언어 선택
- 오류/상태 메시지 배너 영역
- 비밀번호 재설정 진입
- 계정 차단/제거/비활성 상태 대응 영역

### Product Tone

로그인 화면은 일반 소비자용 마케팅 랜딩처럼 보이면 안 된다.

원하는 인상:

- 안정적
- 신뢰 가능
- 조용하지만 고급스러움
- 실무 제품답게 명확함
- 모바일과 같은 브랜드 감성

### Layout Direction

디자인 자유도는 열어두되, 아래 원칙은 유지한다.

- 데스크톱 폭을 전제로 한 구조
- 브랜드/설명 영역과 인증 영역의 시각적 위계 분리
- 인증 폼은 한눈에 읽히고 빠르게 입력 가능해야 함
- 언어 변경과 상태 메시지가 폼을 방해하지 않아야 함
- “처음 진입하는 관리자/사무실 사용자” 에게 불안감을 주지 않아야 함

### UX Notes For Design

- 대시보드 로그인 화면에서 모바일 앱 선택 버튼은 두지 않는다
- 하지만 데스크톱 관리자도 같은 계정으로 모바일 앱을 쓴다는 느낌은 줄 수 있다
- 보안/조직 운영 제품이라는 인상을 주는 보조 카피나 아이콘은 허용된다
- 입력량보다 상태 가독성이 더 중요하다

### What The Login Screen Is Not

- 제품 소개 랜딩 페이지
- 마케팅 사이트
- 대시보드/모바일 선택 페이지
- 복잡한 온보딩 설명 페이지

## Dashboard Home Screen

### Purpose

홈 화면은 “오늘 운영에서 무엇이 중요한가” 를 가장 빠르게 보여주는 관리자 콘솔 첫 화면이다.

이 화면은:

- 숫자 요약
- 긴급 작업
- 검토 대기
- 운영 이상 상태
- 빠른 상세 진입

을 한 화면 안에서 균형 있게 보여줘야 한다.

### Home Type

홈은 아래 두 성격이 섞인 운영 콘솔이다.

- KPI / 현황 보드
- 오늘 해야 할 일 허브

즉 단순 숫자 카드 모음도 아니고, 단순 할 일 리스트도 아니다.

### Required Top-Priority Blocks

홈 최상단에서 우선 보여야 하는 정보 묶음:

- 진행 중 청소
- 미처리 정비 / 분실물 / 주문
- 이상 근태 / 정정 요청
- 중요 공지 / 오늘 할 일

### Required Secondary Blocks

최상단 다음으로 강하게 보여야 하는 정보:

- 예약 / 체크인 / 체크아웃 현황
- 알림 센터 진입
- 전역 검색
- 조직 전환
- 모바일 버전 보기 진입

### Header Requirements

홈 상단 공통 헤더에는 아래 요소가 들어가야 한다.

- 조직 전환기
- 전역 검색
- 알림
- 계정/프로필 진입
- 필요 시 모바일 버전 보기 진입

### Home Layout Direction

홈은 카드 몇 개만 띄우는 단순 대시보드가 아니라, 운영 밀도가 느껴져야 한다.

권장 구조:

- 상단: 조직 / 검색 / 알림 / 계정
- 첫 번째 구역: 오늘 운영 핵심 요약
- 두 번째 구역: 처리 대기 큐
- 세 번째 구역: 경고 / 이상 / 검토 필요
- 네 번째 구역: 공지 / 오늘 할 일 / 빠른 진입

### Interaction Pattern

홈의 모든 핵심 카드/행은 아래 중 하나로 바로 이어져야 한다.

- 우측 상세 패널
- 해당 모듈의 목록 화면
- 전체 상세 페이지

홈은 정보를 “보여주기만” 하면 안 되고, 즉시 운영 화면으로 이어져야 한다.

### Auto-Refresh Targets

홈에서 자동 갱신 우선 대상:

- 진행 중 청소
- 이상 근태 / 정정 요청
- 미처리 정비 / 분실물 / 주문
- 알림 센터
- 오늘 할 일
- 예약 / 체크인 / 체크아웃 현황

### Design Tone

홈 화면은 아래 느낌을 동시에 가져야 한다.

- 차분함
- 통제력
- 밀도감
- 즉시성
- 모바일과 같은 브랜드 무드

중요:

- 정보가 많아도 정신없어 보이면 안 된다
- KPI 카드만 예쁘게 놓는 식의 generic SaaS 대시보드가 되면 안 된다
- 실제 운영자가 “오늘 어디부터 봐야 하는지” 가 즉시 읽혀야 한다

## Mobile View Inside Dashboard

대시보드 안에는 모바일 앱 보기 기능을 제공한다.

### Purpose

- 같은 계정으로 모바일 표면을 바로 확인
- 운영자가 데스크톱에서 모바일 UX를 검토
- 모바일 전용 흐름을 빠르게 재현

### Requirements

- 핸드폰 프레임 안에서 보여야 한다
- 실제 모바일 앱처럼 동작해야 한다
- 단순 목업이나 스크린샷이 아니다
- 현재 로그인한 같은 계정으로 열린다
- 관리자 대시보드의 축소판이 아니라, 진짜 모바일 표면이어야 한다

### Presentation Modes

- 우측 패널 안의 핸드폰 프레임
- 전체 화면 오버레이 확장 모드

### First-Slice Target

구조는 전 기능 확장 가능하게 설계하되, 1차 적용은 핵심 모듈부터 시작한다.

추천 우선 모듈:

- 예약 / 캘린더
- 청소
- 근태
- 할 일
- 공지
- 컴플레인

## Module Rules

### Reservations / Calendar

예약 원본 데이터의 source of truth 는 Beds24 이다.

- StayOps 대시보드에서 Beds24 원본 예약을 직접 수정하지 않는다
- Beds24 변경은 웹훅으로 StayOps 에 반영되어야 한다

대신 StayOps 대시보드는 아래 운영 데이터를 관리한다.

- 운영 메모
- 얼리 체크아웃 시간
- 청소 상태 연결
- 정비/컴플레인/할 일 연결
- 내부 태그
- 담당자 메모
- 후속 조치 기록

1차 필수 화면/기능:

- 월간 객실 캘린더
- 주간/일간 보기
- 객실 타임라인
- 빈방 보기
- 예약 상세 패널
- 예약 검색
- 건물별 필터
- 채널별 필터

현재 구현 상태 (2026-07-09):

- `/admin/calendar` 은 하나의 통합 예약 콘솔로 구현되었다.
- 같은 페이지 안에서 아래 4개 뷰를 전환한다.
  - 월간 보드
  - 오늘 운영
  - 객실 상태
  - 건물 정보
- 우측 예약 인스펙터는 Beds24 원본 데이터는 읽기 전용으로 유지하면서, 운영 보조 작업만 연결한다.
  - `Beds24 ID 복사`
  - 예약별 내부 메모 저장 (`reservation_internal_notes`, 조직 + 예약 단위 영구 저장)
  - 모바일 캘린더 바로 보기
  - 수리 / 컴플레인 / 분실물 모바일 작성 화면으로 예약 컨텍스트 딥링크
- 대시보드 상단의 `모바일 보기` 버튼은 단순 `/mobile` 이동이 아니라 현재 캘린더의
  `month` / `property` 문맥을 유지한 `/mobile/calendar?...` 링크를 사용할 수 있다.
- 월간 보드는 현재 관리자 대시보드의 예약 기본 화면이다.
  - 객실 × 날짜 밀집 타임라인
  - 세로 스크롤 중에도 날짜 헤더가 계속 보이는 sticky header
  - 건물명만 보이는 중앙 정렬 chip filter
  - 채널 앵커 메뉴 filter
  - 내보내기 버튼
  - 우측 예약 상세 drawer
- 화면 내부 언어 토글은 두지 않는다.
  - 관리자 예약 캘린더는 로그인 사용자의 `preferred_language` 를 그대로 따른다
  - 언어 변경은 사용자/프로필 설정에서만 수행한다
- 예약 상세 drawer 는 **읽기 전용 원칙**을 따른다.
  - Beds24 ID 복사 가능
  - 정비 / 분실물 화면으로 이동 가능
  - 컴플레인 연결은 실제 관리자 route 부재로 아직 보류 toast 만 제공
- `Today ops` / `Room status` / `Building info` 는 운영 스냅샷 보드 역할을 한다.
- `객실 상태` 테이블의 현재 투숙 / 다음 예약 셀은 상태 텍스트보다 숙박 범위를 우선한다.
  - 게스트명 아래에 `체크인일 ~ 체크아웃일` 형식으로 바로 보이게 한다.
- `Today ops` 의 3번째 카드와 상단 요약 KPI 는 더 이상 턴오버/청소 필요를 재사용하지 않는다.
  - 대신 모바일 청소 smart list 와 같은 규칙의 `셋팅 대상` 을 보여준다.
  - 기준: `check_in_date = today` 이고 같은 객실에 `check_out_date = today` 가 없는 예약
  - 대상이 없으면 명시적인 빈 상태 문구를 표시한다.
- `Building info` 는 `src/lib/property-map-links.ts` 를 source of truth 로 읽는다.
  - 현재 화면 내 편집은 브라우저 세션 미리보기만 반영되고 서버 저장은 아직 없다.
- 우상단 새로고침 chip 은 **수동 스냅샷 갱신용 UI** 이다.
  - `router.refresh()` 만 수행
  - secret 보호된 `/api/beds24/reconcile` 를 관리자 직접 실행 버튼으로 노출하지 않는다
- **독립 `/admin/check-in-out` 모듈은 폐기됨 (2026-07-22).**
  - 이유: 오늘 체크인/체크아웃 조회, 투숙중, 셋팅 대상 등 핵심 운영 기능이 이미 `/admin` 홈 요약과
    `/admin/calendar` 통합 예약 콘솔에 구현되어 있어 독립 메뉴가 기능 중복만 만들기 때문.
  - 사이드바의 `체크인/아웃` 항목과 독립 라우트는 모두 제거되었다.
  - 따라서 대시보드에서 체크인/체크아웃은 **독립 모듈이 아니라 예약 캘린더 콘솔의 운영 보드 영역**으로
    취급한다.

### Cleaning

청소는 관리자 개입과 운영 추적 중심으로 설계한다.

1차 포함:

- 진행 중 청소 실시간 보기
- 청소 기록 조회
- 청소 기록 수정/보정
- 관리자 강제 완료
- 메모/사진 검토
- 정비/분실물 연계 확인
- 날짜/건물/직원 필터
- Excel / PDF export (CSV는 2026-07-14에 폐기 — 위 "Excel + PDF 내보내기" 절 참고)

### Lost & Found / Orders

두 모듈은 대시보드에서 전 범위를 처리한다.

- 신규 등록
- 상세 조회
- 상태 변경
- 수정
- 삭제
- 사진 보기
- 댓글/메모
- 담당자/요청자/건물 필터
- export

### Maintenance (수리·점검) — 위 규칙의 예외 (확정, 2026-07-14)

수리·점검 콘솔은 **감시 + 이력 + 예외 개입** 전용이다. 처리(상태 변경·처리 메모·완료 사진)는
현장이 모바일에서 한다. 따라서 위 목록 중 다음 세 가지가 **의도적으로 없다**:

| 항목 | 상태 | 이유 |
| --- | --- | --- |
| 본문 수정 | **없음** | 접수된 신고는 사실 기록이다. 잘못된 건은 수정이 아니라 삭제·무효 처리로 정리한다. |
| 담당자 배정·담당자 필터 | **없음** | 배정 개념 자체를 두지 않는다 (`assignee` 컬럼 없음). 현장이 먼저 잡는 쪽이 처리한다. |
| Excel / PDF 내보내기 | **없음** | 위 "Excel + PDF 내보내기 — 절대 규칙"의 명시적 예외. 내보낼 업무 사유가 없다. |

어드민이 할 수 있는 것: 열람(보드/목록·이력/완료 3뷰) · 강제 완료 · 무효 처리 · 삭제.
자세한 내용은 `docs/product/08-maintenance-workflow.md`.

### Linen Return

린넨 반품은 대시보드 1차 우선 모듈이다.

- 등록
- 목록
- 상세
- 수정/삭제
- 월별 집계
- 건물/작성자/품목 필터
- export

### Tasks / Projects

대시보드에서 아래를 모두 지원한다.

- 개인 작업
- 공유 작업
- 프로젝트
- 참여자 관리
- 댓글/업데이트
- 완료/재오픈
- 프로젝트 섹션 흐름
- 필요 시 모바일 버전 바로 보기

### Board

대시보드에서 게시판도 직접 운영한다.

- 글 작성
- 상세 보기
- 수정/삭제
- 댓글/반응
- 고정/관리자 운영

### Announcements

공지 역시 대시보드의 핵심 운영 영역이다.

- 작성
- 중요 표시
- 타깃 설정
- 게시/보관 상태 관리
- 읽음 추적
- 팝업/공지 운영

대시보드 공지 화면은 모바일 공지의 단순 확장판이 아니라 **배포 관리 콘솔**이어야 한다.

- 상태는 `Published / Drafts / Archived` 3개만 사용한다
- 모바일에서 가능한 공지 기능은 대시보드에서도 모두 가능해야 한다
- 작성 권한과 게시/보관/삭제 같은 운영 권한은 분리해서 본다
- 기본 뷰는 `Published / Drafts / Archived`
- 핵심 요약은 게시중 / 초안 / 중요 / 팝업 활성 / 미읽음 남은 중요 공지
- 읽음 추적은 전체 공지에 존재하지만, 대시보드 운영상 강조는 중요 공지 미읽음 위주로 둔다
- 목록은 제목 + 상태 + 중요/고정/팝업 + 대상 + 작성자 + 날짜 + 읽음 요약을 밀도 있게 스캔 가능해야 한다

**구현 상태 (2026-07-23):** 위 명세대로 `/admin/announcements` 콘솔이 재구현되었다. 다른 운영
콘솔(주문·분실물·수리)과 동일한 패턴(`AdminShell` + 클라이언트 콘솔 + `x-console.css` + 결과 반환형
서버 액션)을 따른다. 상세는 `docs/product/11-announcement-workflow.md` → "Admin Dashboard
Management Console" → Current Implementation Note.
- 행 클릭 시 우측 상세 패널에서 본문 / 첨부 / 읽음 상태 / 게시/보관/삭제 액션을 처리한다
- 현재 구현의 좌측 고정 생성 카드는 임시 형태로 보고, 장기적으로는 `새 공지` 작성 패널/전용 편집 흐름으로 정리한다
- 공지는 공식 안내 채널이므로 댓글/토론은 게시판 또는 제안함으로 분리한다. 어드민 공지 댓글 UI는 레거시 클린업 대상으로 본다

### Suggestions

제안함은 관리자 대시보드에서 직접 확인/참여/상태 관리가 가능해야 한다.

### Bug Reports

버그 리포트는 모바일 전용 리뷰어 흐름으로 남기지 않는다.

대시보드에서 가능해야 하는 범위:

- 목록/상세
- 상태 변경
- 검토 메모
- 이미지 확인
- deep link

### Complaints

컴플레인은 사무실/CS 중심 운영 모듈이다.

- 주요 유입: OTA 리뷰, 고객 연락, CS 접수
- 현장 직접 입력도 가능하지만 보조 경로다

1차 포함:

- 신규 등록
- 예약/객실/건물 연결
- 고객명/플랫폼/리뷰 채널 기록
- 유형/심각도 분류
- 상태 변경
- 담당자 지정
- 처리 메모/내부 코멘트
- 사진 첨부
- 후속 조치 기록
- 검색/필터
- export

### Attendance / Payroll / Transportation

대시보드 최우선 모듈이다.

1차 필수 범위:

- 출근자 명단
- 정정 요청 검토
- 수동 출근/퇴근 세션 생성
- 세션 시간/사이트 수정
- 세션 무효 처리
- 시급/고용형태 관리
- 추가수당/특별수당 관리 (`/admin/attendance/wages`, 2026-07-10 구현)
- 월 마감
- 급여 총액 대시보드
- 교통비 검토/승인/반려
- 교통비 증빙 이미지 검토
- 급여/교통비 export
- 출근 사이트/QR 관리

추가 원칙:

- 출근자 명단은 웹 전용 기능이 아니다
- 모바일과 관리자 대시보드 모두에서 보여야 한다
- QR 스캔 출퇴근만 모바일 전용이다

구현 상태 (2026-07-02):

- `/admin/attendance` overview는 검토 큐, 정정 요청, 급여, 교통비 KPI를 같은 서버 헬퍼에서 집계해
  각 상세 페이지와 숫자가 어긋나지 않도록 한다.
- overview의 정정 요청 카드는 열린 요청 수만 표시하지 않고 최근 열린 요청을 직원, 대상일, 변경값,
  제출 시각으로 보여준다.
- `/admin/attendance/queue`는 검토 필요 세션, 정정 요청, 수동 수정/무효/복원, 감사 이력을 운영자가
  한 화면에서 처리하는 콘솔 표면이다. 정정 승인 시 출근 지점과 퇴근 지점은 독립 필드로 보존되며,
  서버에서 조직 소유 지점인지 다시 검증한다. 검토 큐는 미확정 작업함이므로 export 액션을 두지
  않고, 급여/교통비처럼 확정 또는 정산 목적이 분명한 화면에서만 내보내기를 제공한다.
- `/admin/attendance/roster`는 모바일 `/mobile/attendance/roster`와 같은 `getAttendanceRoster`
  조회를 사용하는 관리자용 일 단위 출근자 명단이다. 모바일 출퇴근/휴게 기록은 별도 동기화 없이
  같은 `attendance_sessions`/`attendance_breaks` 데이터에서 즉시 반영되며, 오늘 날짜는 클라이언트에서
  10초 주기로 조용히 새로고침해 운영자가 현재 출근자를 감지할 수 있다.
- `/admin/attendance/payroll`, `/transport`, `/wages`, `/staff/[userId]`는 같은 데스크톱 콘솔 패턴을
  사용한다. 특히 임금 예약 변경은 서버의 미래 예약 삭제/대체 규칙과 클라이언트 히스토리 표시가
  일치해야 한다. 시급 관리는 설정/이력 확인 화면이므로 상단 `시급 대장 내보내기` 버튼은 두지 않고,
  실제 정산 export는 급여/교통비 화면에서 제공한다.
- `/admin/attendance/payroll`의 월 단위 내보내기 버튼명은 `엑셀 내보내기`로 표시한다. 이 엑셀은
  세무사/회계 실무 전달용 요약표이며 이름, 출근일수, 총 근무시간, 시급, 승인된 교통비, 교통비 제외
  급여, 교통비 포함 총 지급액을 포함한다. 교통비 금액은 교통비 검토 모듈의 승인 완료 금액만 연동한다.
- 직원별 패널의 내보내기는 기존 CSV가 아니라 개인별 월간 정산표 Excel/PDF로 제공한다. 개인별 양식은
  날짜, 출근시간, 퇴근시간, 날짜별 근무시간, 일 급여, 승인된 날짜별 교통비, 청소한 객실, 총합계를
  포함한다. `청소한 객실`은 청소 기능의 완료된 청소 세션(`completed_at` 존재)을 직원+청소일 기준으로
  연동한다. 개인별 Excel/PDF에서는 이 `청소한 객실` 컬럼도 우측 정렬한다. 객실 표시는 현재 요약 규칙
  `아라키초A → AA`, `아라키초B/아리키초B → AB`,
  `가부키초 → KK`, `다카다노바바 → T2`, `오쿠보* → 원문 유지`, `스카이 → 원문 유지`를 적용한다.
  아라키초처럼 동일 객실이 복수 account room key(`501`, `501_2`)로 들어오는 경우에는 청소 UI와 같은
  display-room 규칙을 따라 `_2` suffix를 접고 `AA501` / `AB501`처럼 하나의 객실 표기로 통일한다.
  패널 하단 액션 라벨은 줄바꿈과 폭 흔들림을 피하기 위해 짧은 `상세` / `PDF` / `Excel` / `해제`(`마감`)
  표기로 유지하며, 개인별 PDF/Excel 내보내기와 마감/해제 처리 중에도 버튼 문구는 바꾸지 않는다.
  월별/개인별, Excel/PDF 네 가지 출력은 같은 녹색 장부 템플릿을 공유하며, 금액 컬럼은 검은색
  굵은 글씨로 통일하고, 합계 금액은 우측 정렬을 유지한다.
- 근태 콘솔의 대상 월은 탭별 개별 컨트롤이 아니라 최상단 공통 subnav 우측의 월 선택기 하나로
  제어한다. 개요/검토 큐/급여/교통비/시급/직원 상세는 같은 `?ym=YYYY-MM` 컨텍스트를 공유하며,
  월을 바꿔도 탭 간 이동 시 선택 월이 유지된다.
- 단, 출근자 명단은 운영일 단위 조회 화면이므로 월 단위 `?ym=` 대신 `?date=YYYY-MM-DD`를 사용한다.
  실제 날짜 선택은 근태 subnav 우측의 상단 일자 선택기 하나로 통합하고, 명단 본문 안에는 별도
  캘린더를 반복하지 않는다.
- `/admin/attendance/*` page entry guards use the shared `requireAdminPageSession` helper. The helper
  centralizes unauthenticated → `/auth/login?next=...`, incomplete/no-organization → `/onboarding`, and
  non-admin-web role → `/mobile` redirects, so attendance admin pages cannot drift on organization
  context or role gating.
- `/admin/attendance/leave` (added 2026-07-07) is the **연차 승인 심사(approval review)** screen,
  a new "연차"/"年次"/"Leave" tab in the attendance console subnav
  (`src/components/admin/attendance/attendance-subnav.tsx`). Access is gated to leave approvers only
  (`is_leave_approver` — platform admin or a membership with `leave_approver_role` set); non-approvers
  see a permission-denied card. Backend `src/lib/annual-leave-approvals-server.ts` provides the org-wide
  request queue + summary, request detail (balance impact + same-period overlap), and the approve
  ("stamp") / reject (reason optional) actions. Frontend
  `src/components/admin/attendance/leave-queue-client.tsx` follows the same list + status-tabs + filter +
  right-side detail-panel dashboard pattern as `/admin/attendance/queue`. The other leave sub-tabs
  (팀 캘린더 / 직원 잔여·부여 / 문서 / 이력) are backend-wired (2026-07-08~09). **The former 승인자 관리
  sub-tab was removed (2026-07-13)** — approver granting is being unified onto the Users screen
  (`/admin/users`), so the leave section now has **5 sub-tabs**. See
  `docs/product/26-annual-leave-workflow.md` for full scope and follow-up items.

### Users / Permissions / Settings

본 섹션(사용자 목록/상세/역할/상태/권한 부여/초대) 전체가 **개발자 기본 + `manage_users` 위임** 접근
게이트를 공유한다 (`actorCanOpenUserManagement`, `src/lib/user-management-access.ts`, 2026-07-13).

1차 필수 범위:

- 사용자 목록
- 사용자 상세
- 역할 변경
- 활성/비활성/정지
- 초대코드 생성/수정/비활성화 — **`설정` → `사용자`로 이전됨 (2026-07-13)**. 초대(팀코드) 관리 화면이
  `/admin/settings/invite-codes`에서 `/admin/users/invites`로 옮겨져, 멤버 라이프사이클(초대 → 관리 →
  비활성 → 삭제)이 사용자 화면 한 곳으로 통일됐다. `/admin/users`와 `/admin/users/invites`는 상단
  "멤버 목록"/"멤버 초대" 탭 스위처(`src/components/admin/users/users-section-tabs.tsx`)로 오간다.
  게이트는 `/admin/users`와 동일하게 **개발자 또는 `manage_users` 위임**(`actorCanOpenUserManagement`,
  `src/lib/user-management-access.ts`) — 기존 owner/office_admin/전무 역할 하드코딩 체크는 이걸로
  대체됐고, 그 과정에서 전무(`senior_managing_director`)가 초대코드를 못 만들던 버그도 함께 해소됐다.
  초대 시 부여 가능한 기본 역할의 상한(개발자/owner/전무는 전체, 그 외는 `officeAdminAssignableRoles`만)은
  그대로 유지된다. 옛 경로(`/admin/settings/invite-codes`)는 새 경로로 리다이렉트만 하는 스텁으로 남아
  있다. 설정 페이지의 초대코드 카드는 제거됐다.
- 조직 기본 설정
- 근태 관리자 권한 부여 (급여 담당 `attendance_payroll_admin` · 연차 결재자 `leave_approver_role`) —
  모든 역할·권한 부여를 사용자 상세로 통일 (2026-07-13 방향 확정). 디자인은 권한 예외 핸드오프 기반,
  백엔드는 디자인 컨펌 후. 참고: `docs/product/27-permission-override-workflow.md`
- 개인별 추가 권한 부여 (시간제한 per-user 권한 예외, `membership_permission_overrides`)
- 조직 전환
- 감사 로그 보기

## Priority Order

관리/운영/수정이 강한 영역을 먼저 만든다.
모바일과 단순 대칭만 필요한 기능은 후순위로 둔다.

### First Priority

1. Attendance / Payroll / Transportation
2. Reservations / Calendar / Check-In-Out
3. Users / Permissions / Organization Settings
4. Cleaning Operations
5. Maintenance / Lost & Found / Orders

### Next Priority

6. Linen Return
7. Tasks / Projects
8. Board
9. Announcements
10. Suggestions
11. Bug Reports
12. Complaints

## Document Structure Rule

대시보드 관련 문서는 과도하게 늘리지 않는다.

원칙:

- 이 문서를 관리자 대시보드 총괄 기준 문서로 사용
- 모바일 문서는 모바일 고유 UX 와 현장 흐름을 계속 관리
- 각 도메인 기능 문서는 공통 도메인 규칙을 관리
- 대시보드 전용 보조 문서는 꼭 필요한 경우에만 추가

즉, 관리자 대시보드 관련 변경은 우선 이 문서와 결정 로그, 현재 상태 문서에 먼저 반영한다.

## Design Note

관리자 대시보드는 마케팅형 대시보드가 아니라 조밀하지만 명확한 운영 콘솔이어야 한다.

- 숫자는 즉시 읽혀야 한다
- 경고는 한눈에 보여야 한다
- 수정은 빠르게 들어가야 한다
- 상세 검토는 깊게 들어갈 수 있어야 한다
- 모바일과 같은 브랜드 감성 위에서 데스크톱 운영 효율을 최우선으로 둔다
## 2026-07-10 Reservation Calendar Admin Contract

- `Building info` on the admin reservation calendar is a shared operational editor, not a local
  preview panel. Changes save to organization-scoped Supabase metadata and must be reflected on the
  mobile calendar map/access view as the same source of truth.
- Reservation export for the calendar is now an A4 landscape print surface (`/admin/calendar/print`)
  instead of a reservation CSV action. Keep this aligned with the shared admin calendar chrome.
- Beds24 sync state is exposed in the calendar chrome. During the temporary pause window, the admin
  console should show that sync is paused rather than implying a live Beds24 refresh.
