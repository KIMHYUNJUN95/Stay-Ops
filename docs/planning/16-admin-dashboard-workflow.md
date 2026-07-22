# Admin Dashboard Workflow

## Purpose

이 문서는 StayOps 관리자 대시보드 개발용 실무 워크플로우를 정의한다.

목표:

- 너무 오래 걸리는 복잡한 단계는 피한다
- 지금 무엇을 하고 있는지 바로 보이게 한다
- 완료된 항목은 활성 워크플로우에서 제거한다
- 대신 완료 이력은 남긴다

이 문서는 **활성 대시보드 작업 보드**로 사용한다.  
완료 기록은 `docs/planning/06-current-status.md`, 중요 기준 변경은
`docs/planning/01-decision-log.md` 에 남긴다.

## Core Rule

대시보드 작업은 아래 3개 문서로 관리한다.

- `docs/planning/16-admin-dashboard-workflow.md`
  지금 진행 중인 활성 작업만 관리
- `docs/planning/06-current-status.md`
  완료된 작업의 결과 기록
- `docs/planning/01-decision-log.md`
  방향/권한/표면/운영 기준 같은 중요 결정 기록

즉:

- 진행 중인 일은 여기
- 끝난 일은 current status
- 기준이 바뀐 일은 decision log

## Workflow Stages

대시보드 기능 작업은 6단계만 쓴다.

1. `Backlog`
2. `Ready`
3. `Design`
4. `Build`
5. `Verify`
6. `Done`

이보다 더 세분화하지 않는다.

## Stage Definitions

### 1. Backlog

아직 바로 시작하지 않는 후보 작업.

조건:

- 기능 이름만 있어도 된다
- 상세 권한/세부 액션은 미확정이어도 된다
- 우선순위만 대략 정해져 있으면 된다

### 2. Ready

곧 시작할 준비가 된 작업.

조건:

- 관련 도메인 문서 기준이 정리됨
- 이 기능을 왜 만드는지 분명함
- 대시보드에서 필요한 범위가 합의됨
- 다음 디자인 요청 단위가 명확함

### 3. Design

사용자 디자인 파일을 기다리거나, 받은 디자인을 기준으로 화면 구조를 정리하는 단계.

조건:

- 기능 단위 디자인 범위가 정해짐
- 대시보드와 모바일의 차이를 알고 있음
- 필요한 목록/상세/패널/폼 구성이 정리됨

### 4. Build

실제 구현 단계.

이 단계에서는 아래를 함께 본다.

- DB 영향
- 백엔드 / server action 영향
- 관리자 화면 구현
- 모바일과의 공유 로직 영향

중요 규칙:

- 한 번에 `Build` 에 들어가는 대시보드 기능은 **1개만**
- 복합 기능이라도 한 사이클에는 하나의 대표 slice 만 진행

### 5. Verify

구현 후 검증 단계.

최소 확인:

- 문서와 실제 구현이 맞는지
- 관리자 대시보드 흐름이 맞는지
- 모바일과 충돌 없는지
- 권한/예외/상태 전이가 어긋나지 않는지
- 필요한 경우 `npm run lint` / `npm run build`

### 6. Done

완료 상태.

완료 정의:

- 문서 반영 완료
- 구현 완료
- 검증 완료
- current-status 기록 완료

`Done` 으로 보낸 뒤에는 이 문서의 활성 구간에서 제거하거나, 매우 짧은 완료 메모만 남긴다.

## Execution Order Per Feature

기능 1개는 아래 순서로 처리한다.

1. 도메인 문서 기준 확정
2. 디자인 수령
3. DB / 백엔드 영향 정리
4. 관리자 대시보드 구현
5. 검증
6. 문서 재동기화
7. current-status 기록 후 활성 워크플로우에서 제거

중요:

- 디자인을 먼저 받더라도, 실제 구현은 문서 기준을 먼저 잠근 뒤 시작한다
- DB/백엔드 없는 프론트 선구현으로 오래 끌지 않는다

## Active Board Rules

이 문서는 항상 짧아야 한다.

운영 규칙:

- `Build` 는 1개만
- `Verify` 도 가능하면 1개만
- `Ready` 는 최대 3~5개 이내로 유지
- 완료된 항목을 계속 쌓아두지 않는다
- 오래된 완료 항목은 current-status 에 남기고 여기서는 제거한다

## Current Dashboard Priority

2026-06-29 기준 관리자 대시보드 작업 우선순위:

1. Attendance / Payroll / Transportation
2. Reservations / Calendar / Check-In-Out
3. Users / Permissions / Organization Settings
4. Cleaning Operations
5. Maintenance / Lost & Found / Orders
6. Linen Return
7. Tasks / Projects
8. Board
9. Announcements
10. Suggestions
11. Bug Reports
12. Complaints

## Active Workflow Board

Last updated: 2026-07-22

### Backlog

- Dashboard mobile-view runtime
- Global export unification (CSV / Excel / PDF)
- Batch actions by module (2차)

### Ready

- Attendance / Payroll / Transportation dashboard IA refinement
- Reservations / Calendar dashboard IA refinement
- Users / Permissions / Organization Settings dashboard IA refinement
- Announcements dashboard management console redesign

### Design

- None

### Build

- None

### Verify

- None

### Done

- Dashboard IA baseline and workflow structure defined on 2026-06-29
- Admin login screen (desktop console entry) implemented on 2026-06-30:
  split layout — warm espresso/clay brand panel + auth form area — applied across all
  auth states (entry · email login · signup · password reset · reset-sent · verify-sent ·
  new password · blocked/suspended/removed/disabled). The real auth flow is unchanged
  (`signInWithGoogle`/`signInWithEmailPassword`/`signUpWithEmail`/`requestPasswordReset`/
  `updatePassword`/`signOut`, `next` handling, onboarding + blocked-state gating, language
  selection). New scoped CSS `auth-console.css` (.authx) + `AuthFrame` shell. lint + build green.
- Admin dashboard home (desktop operations console) implemented on 2026-06-29:
  grouped IA sidebar + console header + ops summary bar + top-priority section
  cards (진행 중 청소 · 즉시 처리 큐 · 이상 근태/정정 · 중요 공지 · 오늘 할 일 ·
  예약 체크인/아웃), all wired to real domain data via `getAdminDashboard`. Each
  block links to its module. Auto-refresh wiring + right detail panel/popovers are
  follow-up slices. lint + build green.

## Completion Logging Rule

작업이 끝나면 아래 2개를 반드시 한다.

1. 이 문서의 활성 구간에서 제거
2. `docs/planning/06-current-status.md` 에 결과 기록

필요하면 함께 남긴다.

3. `docs/planning/01-decision-log.md` 에 중요 결정 기록

## What Not To Do

- 완료된 항목을 활성 보드에 계속 쌓아두지 않기
- `Build`, `Verify` 에 여러 대형 기능을 동시에 올리지 않기
- 디자인 없는 상태로 큰 관리자 화면 구현을 길게 끌지 않기
- 권한 미확정 상태를 영구 방치한 채 닫지 않기
- current-status 갱신 없이 완료 처리하지 않기

## Relationship To Other Docs

- 관리자 대시보드 총괄 기준: `docs/product/05-admin-web-ia.md`
- 전체 프로젝트 공통 규칙: `docs/planning/04-project-workflow.md`
- 현재 완료/진행 이력: `docs/planning/06-current-status.md`
- 중요 결정: `docs/planning/01-decision-log.md`
