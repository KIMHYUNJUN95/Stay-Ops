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

- `part_time_staff` 제외 전원 접근 가능
- `owner`, `office_admin`, `cs_staff`, `field_manager`, `staff`, `developer_super_admin` 접근 가능

단, 세부 기능 권한은 지금 일괄 확정하지 않는다.

- 대시보드 접근 가능 여부
- 각 기능의 보기/수정/삭제/승인 권한

은 분리해서 관리한다.
모듈 구현 시점마다 해당 기능 문서와 서버 권한 규칙에서 확정한다.

## Primary Navigation

대시보드 좌측 내비게이션은 4개 묶음으로 정리한다.

### Home

- Dashboard Home

### Operations

- Reservations / Calendar
- Check-In / Check-Out
- Cleaning
- Maintenance
- Lost & Found
- Orders
- Linen Return
- Complaints

### Work / Communication

- Tasks / Projects
- Board
- Announcements
- Suggestions
- Bug Reports
- Notifications

### Management

- Attendance / Payroll / Transportation
- Users
- Permissions
- Invite Codes
- Organization Settings
- Attendance Sites / QR

## Dashboard Home

`/admin` 홈은 KPI 판넬과 작업 허브가 결합된 운영 콘솔이어야 한다.

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
- 체크인/체크아웃 전용 보드
- 객실 타임라인
- 빈방 보기
- 예약 상세 패널
- 예약 검색
- 건물별 필터
- 채널별 필터

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
- CSV / Excel / PDF export

### Maintenance / Lost & Found / Orders

세 모듈 모두 대시보드에서 전 범위를 처리한다.

- 신규 등록
- 상세 조회
- 상태 변경
- 수정
- 삭제
- 사진 보기
- 댓글/메모
- 담당자/요청자/건물 필터
- export

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

### Users / Permissions / Settings

1차 필수 범위:

- 사용자 목록
- 사용자 상세
- 역할 변경
- 활성/비활성/정지
- 초대코드 생성/수정/비활성화
- 조직 기본 설정
- 근태 관리자 권한 부여
- 개인별 추가 권한 부여
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
