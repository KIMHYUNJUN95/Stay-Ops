# Decision Log

This file records important project decisions.

## 2026-07-22 SW 앱 셸 캐시 도입 — "HTML 미캐시" 결정 부분 번복 (콜드스타트 대응)

### 배경

iPhone 설치형 PWA 콜드스타트가 느리다는 대표님 지적. 원인 3종(① SW가 HTML 미캐시라 매 콜드런치가 풀
서버 렌더 대기 ② 홈 첫 바이트가 auth·쿼리 워터폴 뒤에 갇힘 ③ 가끔 Vercel 콜드스타트). ②는 세션 워터폴
병렬화 + 홈 스트리밍으로 이미 완화. ①이 "화면 뜨는" 체감의 가장 큰 요인.

### 결정

기존 SW는 **의도적으로 HTML/RSC를 캐시하지 않았다**("설치형 앱이 stale 콘텐츠에 갇히지 않도록"). 이번에
대표님이 **stale 트레이드오프를 감수하기로 승인**하여, **콜드런치 전체-문서 내비게이션에 한해
stale-while-revalidate 캐시**를 도입한다. 열자마자 이전 화면을 즉시 보여주고 백그라운드에서 재검증.

### 안전장치 (auth 앱이라 필수)

- **캐시 대상**: 성공(200)·동일출처·**비리다이렉트** HTML만. `/auth`·`/onboarding`·`/api`는 캐시 제외.
- **로그아웃/리다이렉트**: 재검증이 리다이렉트/에러면 stale 사본을 **캐시에서 제거**(로그인 페이지를 앱
  콘텐츠로 서빙하지 않음).
- **자동 최신화**: stale 표시 후 SW가 클라이언트에 메시지 → `ServiceWorkerRegister`가 `router.refresh()`로
  조용히 최신 서버 데이터를 당김(리다이렉트면 하드 `reload`). 즉시 뜨고 곧 최신으로 자가 교정.
- **범위**: 앱 내부 클라이언트(RSC) 이동은 이 핸들러가 건드리지 않음 → 실행 중 앱 데이터는 종전대로 라이브.

### 근거

대표님이 "화면 뜨는게 너무 느리다"며 SW 앱 셸 캐시를 명시적으로 선택(트레이드오프 고지 후). 파일:
`public/sw.js`, `src/components/pwa/service-worker-register.tsx`. `npm run lint`/`npm run build` 통과.

## 2026-07-22 대시보드 `체크인/아웃` 독립 메뉴 폐기 — 예약 캘린더로 통합

### 배경

- 관리자 사이드바에 `/admin/check-in-out` 메뉴가 남아 있었지만 실제 페이지는 플레이스홀더뿐이었다.
- 반면 실운영 기능은 이미 `/admin` 홈의 "예약 체크인/아웃" 요약 카드와 `/admin/calendar`의 `Today ops`
  (체크인 / 체크아웃 / 투숙중 / 셋팅 대상) 안에 구현되어 있었다.
- 결과적으로 사용성 이득 없이 IA만 중복되고, "독립 모듈이 따로 있다"는 잘못된 기대를 만들고 있었다.

### 결정

- 대시보드에서 **체크인/체크아웃은 독립 모듈로 두지 않는다.**
- 예약 체크인/체크아웃 운영은 계속 필요하지만, 이는 **예약 캘린더 통합 콘솔의 일부**로 본다.
- 사이드바의 `체크인/아웃` 항목은 제거한다.
- 기존 플레이스홀더 라우트 `/admin/check-in-out`도 함께 삭제한다.

### 영향

- 관리자 정보(Information) 그룹은 `예약 / 캘린더`, `공지·게시판`, `Todoist`, `설정`만 유지한다.
- 향후 체크인/체크아웃 관련 재기획이 있어도 우선 기준 표면은 `/admin/calendar`와 `/admin` 홈이다.
- 문서도 독립 "체크인/체크아웃 전용 보드"를 별도 1차 필수 화면으로 보지 않고, 예약 콘솔 안의 운영
  영역으로 정렬한다.

## 2026-07-22 어드민 공지 관리 콘솔 재기획 확정 (구현 전)

### 배경

- 모바일 공지 기능은 목록 / 상세 / 팝업 / 읽음 추적 기준이 이미 정리되어 있다.
- 반면 어드민 공지는 `/admin/announcements`에서 동작은 하지만, 다른 대시보드 모듈처럼 공용 운영 콘솔
  패턴으로 정리된 상태는 아니다.
- 현재 UI는 "좌측 고정 생성 카드 + 우측 리스트 + 별도 상세 페이지" 구조라, 감시/배포/감사 흐름이 한눈에
  읽히지 않고 댓글 레거시까지 함께 남아 있다.

### 결정

- 어드민 공지는 **모바일 읽기 화면의 복제본이 아니라 배포 관리 콘솔**로 재구성한다.
- 상태/기본 뷰는 **Published / Drafts / Archived** 3개다.
- **모바일에서 가능한 공지 기능은 대시보드에서도 모두 가능해야 한다.**
- 상단 요약은 **게시중 / 초안 / 중요 / 팝업 활성 / 미읽음 남은 중요 공지**를 우선한다.
- **작성 권한과 운영 권한은 분리한다.** 작성/초안 편집은 모바일 작성 가능 역할과 parity를 맞추고, 게시 /
  보관 / 삭제 / 전체 운영 관리는 더 강한 권한(owner / senior_managing_director / office_admin 기본)으로 본다.
- 읽음 추적은 **모든 공지에 존재**하지만, 운영상 우선 감시는 **중요 공지 미읽음** 위주로 둔다.
- 목록 행은 제목, 상태, 중요/고정/팝업, 대상, 작성자, 날짜, 읽음 요약을 고밀도로 보여준다.
- 행 클릭 시 우측 상세 패널에서 본문 / 첨부 / 읽음 현황 / 게시/보관/삭제 액션을 처리한다.
- 공지의 방향성상 **댓글은 어드민에서도 핵심 기능으로 유지하지 않는다.** 게시판/제안함과 역할을 분리하며,
  현재 어드민 댓글 UI는 레거시 클린업 대상으로 둔다.

### 범위 메모

## 2026-07-22 Todoist 명칭 통일

### 배경

- 모바일 `/mobile/tasks` 워크스페이스는 이미 실제 기능이 구현되어 있다.
- 반면 어드민 사이드바에는 같은 흐름과 연결될 화면이 `반복 업무`라는 별도 이름으로 남아 있었다.
- 이 상태는 사용자에게 별도 모듈처럼 보이게 만들어 IA를 불필요하게 복잡하게 만든다.

### 결정

- 모바일 `할 일`의 사용자 노출 명칭을 `Todoist`로 통일한다.
- 어드민 `반복 업무`의 사용자 노출 명칭도 `Todoist`로 통일한다.
- 현재 라우트 id와 경로(`tasks`, `/admin/recurring-work`)는 우선 유지할 수 있지만, 이는 구현 레거시일 뿐 제품 명칭은 아니다.
- 과거의 독립 `Recurring Work Scheduler` 문서는 현재 기준 화면 정의로 쓰지 않는다. 현재 기준은 모바일/어드민이 같은 Todoist 작업 도메인을 공유하는 것이다.

### 영향

- 모바일 내비게이션, 모바일 화면 타이틀, 어드민 사이드바, 관련 제품 문서는 모두 `Todoist` 기준으로 본다.
- 향후 어드민 `/admin/recurring-work`는 별도 스케줄러가 아니라 데스크톱 Todoist 관리 콘솔로 기획한다.

- 이번 사이클은 **문서 재기획만 확정**한다. 구현은 아직 시작하지 않는다.
- 코드 기준 현재 살아 있는 기능(생성, 상태 변경, 읽음 패널, 이미지, 팝업 후보 계산)은 재사용 후보다.
- 재기획 상세는 `docs/product/11-announcement-workflow.md` → "Admin Dashboard Management Console" 을
  기준으로 한다.

## 2026-07-22 숙소 매핑 중복(가부키초=176431) 근본 수정 — property_name을 마스터 기준으로 해결

### 증상

예약 캘린더에서 **가부키초가 "가부키초" + "176431" 두 건물로 쪼개져** 표시. `176431`은 가부키초의
Beds24 external_property_id. 같은 방(202#, 403#…)이 두 건물에 나뉘어 나타남.

### 원인

- **예약 property_name을 Beds24 payload 기준으로 저장**하는데, `/bookings` 응답에 `propName`이 빠진
  건은 코드가 **raw `propId`("176431")로 폴백** → 같은 건물이 두 이름으로 갈림.
- 게다가 `room-sync.ts`의 `upsertPropertyByExternalId`가 **매 동기화마다 property 마스터 이름을 payload
  값으로 무조건 덮어써서**, propName 없는 웹훅 한 번이면 마스터 이름 자체가 "176431"로 변질됨.
- `getCanonicalPropertyName`은 "Kabukicho"→"가부키초" 매핑은 있으나 raw id "176431"은 매핑이 없어 그대로
  노출. (제 웹훅 400 수정과 무관한, 이전부터 있던 매핑 결함. 라이브 웹훅이 살아나며 표면화)

### 수정 (코드 3곳 — 어느 경로든 건물 이름이 property 마스터 하나로 수렴)

1. `room-sync.ts`: propName이 없으면 **기존 property 마스터 이름을 raw external id로 덮어쓰지 않음**
   (상태만 active 갱신). 신규 property일 때만 최후수단으로 external id를 placeholder 사용.
2. `reservations-backfill.ts`: 예약 property_name을 payload propName 대신 **external_property_id로 조회한
   마스터 이름 우선**.
3. `process-webhook-booking.ts`: 웹훅도 raw propId 폴백 제거 → 동기화된 property 마스터(id)에서 이름 조회해
   우선 적용.

### 데이터 정정 (배포 후, 프로덕션)

- property 마스터 8개 이름 재확정(raw 숫자로 남은 것만): 176431→Kabukicho 등. 중복 property 없음.
- **raw-id 예약 property_name을 external_property_id 매칭으로 마스터 이름에 일괄 병합**(176431→Kabukicho,
  176430/280663/243936→각 마스터). 정정 후 사무실 org 예약은 **8개 건물로 클린**(raw-id 0건, 합계 1904).

검증: `npm run lint`(에러 0) / `npm run build` 통과. 최신 배포(commit `8fa6664`) 프로덕션 READY.

## 2026-07-22 Beds24 웹훅 전량 400 유실 — 근본 수정 (파싱 견고화 + 무손실 캡처)

### 배경 (재발 사고)

대표님이 "다카다노바바 7층 예약 고객 데이터가 누락된 것 같다"고 지적. 조사 결과 **7층만의
문제가 아니라 2026-07-17 이후 전 숙소의 신규·취소·변경 예약이 통째로 누락**된 상태였다.

- 예약 테이블 1,813건 전부 `updated_at`/`created_at`이 **2026-07-17 07:07:31에 정지** — 이후 생성·수정 0건.
- `beds24_webhook_events` 기록은 전부 `reconciliation`(수동)뿐, 라이브 `webhook` 수신은 **역대 0건**.
- Vercel 런타임 로그: Beds24가 웹훅을 지금도 분 단위로 보내고 있으나 **전부 HTTP 400**으로 거부됨.
- 원인: 웹훅 라우트가 예약 후보를 못 찾으면(`extractBeds24WebhookBookingCandidates`가 0건) **관측 로그를
  남기기 전에 400으로 조기 반환**해 버려, 5일치 예약이 흔적도 없이 사라졌다. 이는 2026-06-10 사고
  (Kabukicho 302 유실)와 같은 클래스의 "조용한 유실"의 재발이다.
- 400의 하위 원인은 확정 전(로그에 본문 미기록)이지만 유력 후보는 (a) 본문이 JSON이 아닌
  form-urlencoded, (b) 예약이 우리가 탐색하지 않던 envelope 키(`booking` 등) 아래로 옴 — **둘 다** 이번
  수정에서 견디도록 처리.

### 결정/작업 — "앞으로 데이터 누락은 절대 없어야 한다"(대표님 지시)

1. **본문 파싱 견고화** — 원본 텍스트를 1회 읽어 JSON *또는* `application/x-www-form-urlencoded`
   (JSON을 담은 폼 필드는 언랩)로 파싱. 전송 인코딩 때문에 유실되지 않음.
2. **Envelope 무관 추출** — `extractWithMatcher`가 고정 키 목록(`data/bookings/items/results`) 대신
   **모든 중첩 객체/배열을 재귀 탐색**(깊이 8 제한)하도록 일반화. 어떤 wrapper 키로 감싸도 예약을
   찾아낸다. 예약 매칭은 booking id + 체류일(또는 취소 신호) 필수라 오탐 없음. booking id로 중복 제거.
3. **무손실 캡처(핵심 계약)** — 예약을 하나도 못 뽑으면 **400으로 버리지 않고**, 전체 원본 본문 +
   `Content-Type`을 `beds24_webhook_events`에 저장(신규 컬럼 `raw_payload`/`content_type`, 마이그레이션
   `202607220001_beds24_webhook_raw_capture.sql`, 원격 적용 완료)하고 **2xx로 ACK**(Beds24 재시도 폭주
   방지). 부분 실패 배치도 원본을 남겨 재처리 가능. 성공 예약은 기존대로 raw 미저장(PII 최소화).
4. 관련 헬퍼: `recordBeds24WebhookRejection` 신설, `recordBeds24WebhookEvent`에 실패 시 raw 캡처 옵션 추가.

### 복구/운영 확인

- **7/17→현재 누락분 복구 — 완료 (2026-07-22).** 웹훅 수정은 소급되지 않으므로(이미 온 웹훅은 Beds24가
  재전송 안 함), 로컬 dev 백필 라우트(`/api/dev/beds24/backfill-reservations`, org=사무실
  `f393a735`, window `2026-06-01`→`2028-01-01`)로 Beds24 API에서 재풀해 upsert. 결과: fetch 1538 /
  upsert 1533(취소 474 반영) / 실패 0 / partial 없음. 사무실 org 예약 1813→**1904건**, 최원거리 체크인
  **2027-01-26**까지. 다카다노바바 7층 등 7/17 이후 신규 예약(예: 7/22 체크인 건) 정상 복구 확인. 스킵
  5건은 guestName/propertyName 없는 Beds24 플레이스홀더(오너 블록 추정, 실제 고객 예약 아님).
- **라이브 웹훅 실트래픽 검증 — 대기.** 새 배포(`4b1f1b2`) 이후 아직 Beds24 웹훅 미수신이라 2xx 전환
  확인은 다음 organic 웹훅 대기 중.
- **reconcile 자동 안전망 복원 — GitHub Actions로 이중화 (2026-07-22).** 원인 확정: `/api/beds24/reconcile`
  를 **수동 호출하면 HTTP 200**(fetch 882/upsert 880)으로 정상 작동 → 토큰·코드 정상, **유일한 문제는
  Vercel 크론 스케줄러가 엔드포인트를 아예 안 부르는 것**(24h 내 reconcile·reminders 둘 다 호출 0건, Hobby
  플랜/크론 설정 이슈로 추정). Vercel MCP로는 크론/env를 못 고치므로, **Vercel 크론에 의존하지 않는 외부
  트리거**를 추가: `.github/workflows/beds24-reconcile.yml`이 **6시간마다** reconcile 엔드포인트를
  `x-beds24-webhook-secret` 헤더로 호출(prod에서 200 확인). vercel.json 크론은 idempotent라 중복 트리거로
  그대로 유지(살아나면 이득, 안 살아도 무해). **설정(1회): GitHub repo Secret `BEDS24_WEBHOOK_SECRET`**
  (Vercel 값과 동일)를 추가해야 워크플로가 인증된다.
- **task reminders 크론 미발화는 현재 정상.** 알림은 개발 막바지 일괄 구현 방침이라 지금 미가동이 맞다
  (reminders 엔드포인트는 `CRON_SECRET` 필요, 현재 404). 별도 조치 불필요.
- **미사용 org `현장 근무`(06445066)** — 멤버 0명·stale 예약 178건. 로그인 사용자가 없어 운영 영향 없음.
  삭제는 정책상 승인 필요하므로 보류(그대로 둠). 실운영 org는 `사무실`(f393a735) 하나.

검증: `npm run lint`(에러 0) / `npm run build`(성공) 통과. 상세는
`docs/engineering/07-environment-setup.md` → "Webhook ingestion hardening (2026-07-22)".

## 2026-07-17 Beds24 실연동 활성화 + 예약 캘린더 스케일 버그 수정

### 결정/작업

- **웹훅 실시간 연동 활성화.** Vercel 프로덕션에 `BEDS24_SYNC_PAUSED=false`·`BEDS24_DEFAULT_ORGANIZATION_ID`
  (사무실 org)·`BEDS24_API_REFRESH_TOKEN`을 설정하고 만료된 `BEDS24_API_TOKEN`을 삭제 → refresh token
  자동 발급 경로 활성화. invite code는 `/authentication/setup`으로 1회 교환해 refresh token 획득.
  웹훅은 8개 연동 숙소 전부에 설정됨(실시간 신규·취소 무손실).
- **운영 윈도우 확대 (당월+1 → 당월+미래 2달, 3개월).** `getOperationalWindow()` (`reservations-backfill.ts`).
  reconcile/크론이 이 창을 쓴다. 창은 **도착일(arrival) 기준 overlap**이라 예약 시점과 무관 —
  "1년 전 예약, 내일 체크인"도 잡힌다. 근거: 체크인이 당월+미래 2달 안이면 무손실이어야 한다는 요구사항.
- **광역 백필 기능.** `backfillBeds24Reservations`에 옵션 `from`/`toExclusive` (기본=운영 윈도우, 크론 불변),
  dev 라우트 `/api/dev/beds24/backfill-reservations`에 `from`/`to` 파라미터. 2026-06~2027-12 1회 백필로
  먼 미래 예약 seed(사무실 org 예약 1476→1815, 미래 확정 498, 2027-01까지).
- **데이터 정합 수정.** `Arakicho A`의 `external_property_id`가 null이라 예약 176430(최다 숙소)이 매핑 실패
  → `176430` 설정 후 전부 복구. 룸 마스터·인벤토리 재동기화. 테스트/artifact 예약 2건 삭제.
- **예약 캘린더 스케일 버그 3종 수정:**
  1. **크래시** — `listReservationInternalNotes`의 `.in(reservation_id, [510개])`가 URL 길이 초과로
     `fetch failed`. `chunk()` 헬퍼(`utils.ts`)로 200개씩 분할. 어드민+모바일 캘린더 공통 해결.
  2. **월-경계 바 누락** — `admin-reservation-console.tsx`에서 체크아웃이 다음달 1일인 예약이
     `checkOutDay(=1)`로 계산돼 0.75칸 점으로 찌부러짐. `endsAfterMonth` 판정을 `>` → `>=`로 수정
     (월말까지 clamp). 모바일·프린트 뷰는 date-diff/clamp 방식이라 애초에 정상.
  3. **룸 라벨 표시** — 어드민 청소 콘솔이 표시용 `room`에 raw `canonicalRoomLabel`("501_2")을 노출
     → `getDisplayRoomLabel`/`getDisplaySessionRoomLabel` 적용해 "501"로. 매칭용 `roomKey`는 raw 유지.
     모바일·어드민 캘린더는 이미 display 함수 사용.
- 검증: tsc·lint·build 통과.

## 2026-07-16 주문·비품 어드민 운영 콘솔 재구축 — 기획 확정 (구현 전)

### 배경

청소·수리·점검·분실물 어드민이 모두 공용 **운영 콘솔** 패턴(KPI + 뷰 전환 + 우측 상세 패널 + 공용
primitives)으로 재구축됐는데, `/admin/orders`만 **구형 플랫 목록**으로 남아 대시보드에서 혼자 이질적이었다.
이를 같은 계약으로 맞춘다.

### 결정 — 콘솔 설계

- **성격**: 감시 + 이력 + **능동 처리** + 예외 개입(분실물과 동급의 처리형 콘솔).
- **4뷰**: ① 현황 보드(승인대기/주문대기/주문완료 3칼럼) ② 목록·이력 ③ **배송 예정(월 캘린더)** ④ 종결.
- **배송 캘린더를 어드민에 신설** — 그동안 모바일 전용이라 비어 있던 어드민 캘린더 공백을 해소. `order_requests`
  의 `delivery_date`/range에서 파생(스키마 변경 없음). 날짜별로 **어느 건물·누가 신청·무슨 비품·언제 배송**을
  보여주고 **건물별 필터**를 둔다.
- **모바일↔대시보드 관리 대칭(parity)** — 요청자가 모바일에서 넣은 것(품목·상품 링크·사진·긴급도·건물)을
  관리자가 상세 패널에서 전부 보고 처리. 특히 **상품 링크(Amazon/IKEA 검색으로 붙인 URL)는 도메인 배지 +
  클릭 가능한 앵커**로 렌더(콘솔에 도메인 배지 추가).
- **긴급도(urgency) 노출** — 지금까지 UI에 없던 긴급 배지 + 필터 + 정렬 우선순위를 추가.
- **거절 건 재오픈** — `closed → requested` 되돌리기(분실물 복원과 같은 예외 개입). 배송 컬럼 초기화.
  서버 액션 신규 1종. 문서의 Open Question("거절 건 재제출")을 해소.
- **재사용**: 데이터 헬퍼·능동 처리 서버 액션(`updateOrderRequestStatus`/`updateOrderDeliveryDate`/삭제)·
  내보내기(Excel/PDF)는 전부 기존 것. **DB 스키마 변경 없음.**
- **범위 밖**: 알림(막바지 일괄 구현 방침), 입고/`received` 활성화·비품 카탈로그·재고·단가(별도 워크플로 확장).

상세 명세는 `docs/product/10-order-request-workflow.md` → "주문·비품 어드민 운영 콘솔".

**Status update (2026-07-16): 구현 완료.** 위에서 기획한 대로 `/admin/orders`를 4뷰 운영 콘솔로
구현했다(현황 보드 / 목록·이력 / 배송 예정 캘린더 / 종결). 계획 단계에서 "스키마 변경 없음 · 신규 액션
재오픈 1종"으로 정했던 것이 구현 중 범위가 넓어졌다 — 실제로는 **신규 마이그레이션
`202607190001_orders_console.sql`이 `order_requests`에 `admin_memo text`(nullable) 컬럼을 추가**했고
(RLS 정책 불변, 원격 Supabase 적용 완료), **신규 서버 액션이 4종**(`rejectOrder`/`reopenOrder`/
`correctOrderStatus`/`editOrder`, `src/app/admin/orders/actions.ts`)으로 늘었다. VM 레이어
`src/lib/admin-orders.ts`(`getAdminOrders`)가 DB의 `received` 상태를 콘솔 표시에서 `ordered`로
매핑한다(콘솔은 4개 표시 상태만 사용: requested/approved/ordered/closed). 배송 예정 캘린더는 계획대로
어드민에 신설(건물 필터 포함), 긴급도(urgency) 배지·필터·정렬도 계획대로 노출했다. 구 상세 라우트
`/admin/orders/[id]`는 콘솔 우측 패널로 대체되어 고아 라우트가 됐고 **2026-07-17에 삭제**했다(파일·
`[id]` 디렉토리 제거, 공유 헬퍼는 모바일 상세에서 계속 사용). 마이그레이션 `orders_console`는 원격
`schema_migrations`에 version `20260717005554`로 등록(2026-07-17). 기존 내보내기(Excel/PDF)·승인/
주문처리/배송일수정/삭제 액션은 계획대로 재사용했다. `npm run lint` / `npm run build` 통과. 상세는 `docs/product/10-order-request-workflow.md` → "주문·비품
어드민 운영 콘솔 (구현 완료 — 2026-07-16)".

## 2026-07-16 분실물 자동 폐기 · 폐기 내역 90일 · 자동 삭제 확정 (2026-07-15 "수동 폐기" 대체)

### 배경

2026-07-15에는 "2주 만료를 자동 이관·자동 삭제하지 않고 사람이 수동 폐기"로 정했지만, 대표님이
**"매번 수동으로 폐기·삭제할 수 없다(운영 부담)"**고 지적했다. 원래 계획도 2주 뒤 자동 처리였다.

### 결정 — 자동 생애주기

- **자동 폐기**: 등록일 + 14일 경과 & 미반환 & 미연장 → 시스템이 자동으로 `disposed` 처리하고 **폐기
  내역**으로 이동. (D-3에 `disposal_scheduled` 임박 표시로 올려 연장 기회를 준다.)
- **폐기 내역 90일 보관**: 폐기된 건은 폐기일 + 90일 동안 보관(손님 문의·분쟁 대비).
- **자동 하드 삭제**: 폐기일 + 90일 경과 → 레코드 완전 삭제(되돌릴 수 없음). CLAUDE.md "user-triggered
  hard delete" 기본값에 대한 **명시적 승인 예외**(대표님 승인).
- **연장 예외**: `hold_until` 연장 건은 그 날짜까지 자동 폐기 제외.
- **수동 병존**: 조기 폐기·반환·연장·상태 정정·(잘못된 등록) 수동 삭제는 그대로. 수동 삭제는 감사 기록
  없이 즉시 하드 삭제.

### 화면 — 폐기 내역 뷰 신설 (대표님 요구)

콘솔이 **4뷰**가 된다: 현황 보드 / 목록·이력 / 반환완료 / **폐기 내역**. 폐기 내역은 각 건의 **삭제
예정일(폐기+90일) D-day**와 삭제 임박(D-7) 배지를 보여준다. 상세 명세는
`docs/product/09-lost-found-workflow.md` → "뷰 구성".

### 구현 메모

"자동 폐기(14일)"·"자동 삭제(폐기+90일)"는 **매일 1회 스케줄 작업**(Supabase pg_cron 또는 Vercel Cron)이
필요하다. 상수: `LOST_FOUND_STORAGE_DAYS=14`, `LOST_FOUND_DISPOSAL_RETENTION_DAYS=90`,
`LOST_FOUND_DUE_SOON_DAYS=3`, `LOST_FOUND_PURGE_SOON_DAYS=7`. **구현은 아직 시작하지 않았다.**

**Status update (2026-07-16): 구현 완료 (빌드 그린).** 위에서 기획한 대로 `/admin/lost-found`를 4뷰
운영 콘솔로 구현했다(현황 보드 / 목록·이력 / 완료(반환+폐기) / 폐기 내역). 반환 방식은 최종적으로
**`delivery`(배송) / `pickup`(방문 수령)** enum(`lost_return_method`)으로 확정·구현됐다(기획 초안의
`shipped`/`picked_up` 명칭은 채택되지 않음). 자동 생애주기는 `public.lostfound_auto_dispose()` /
`public.lostfound_auto_purge()`(SECURITY DEFINER) + pg_cron 매일 1회로 마이그레이션
`202607180001_lostfound_console.sql`에 구현됐고 **원격 Supabase 프로젝트에 적용 완료(2026-07-16,
MCP)**다 — pg_cron 확장 활성화 + 배치 잡 2종(`lostfound-auto-dispose` / `lostfound-auto-purge`)
등록까지 확인됨. `npm run lint` / `npm run build` 통과. 상세는
`docs/product/09-lost-found-workflow.md` → "대시보드 분실물 관리 콘솔" 참고.

**복원(restore) 추가 (2026-07-16):** 완료(폐기/반환) 건을 다시 보관중으로 되돌리는 **복원**을 예외 개입에
추가했다(관리자 실수·고객 재방문 대응). 사용자 결정: (1) 복원 대상 = **폐기 + 반환 둘 다**, (2) 복원 후
상태 = **보관중**, 보관 시계 = **복원일+14일**(자동 폐기 배치가 발견일+14 기준으로 즉시 재폐기하지
않도록), (3) 복원 이력은 **처리 메모에 append**(삭제는 무기록이지만 복원은 감사 흔적을 남김). 서버 액션
`restoreLostItem`(`disposed`/`returned`만 허용, `handled_*`·반환정보 초기화), 상세 패널 예외 개입 존
버튼 + `restore` 모달. 스키마 변경 없음(기존 컬럼만). `npm run lint` / `npm run build` 통과.

## 2026-07-15 대시보드 분실물 관리 콘솔 — 기획 확정 (구현 전)

### 배경

대시보드에서 분실물을 **관리·열람**할 콘솔을 기획했다. 대표님 방향: 대시보드에서 등록할 일은 거의
없고(등록은 현장 모바일), 등록된 분실물을 관리·감시하는 용도. 매커니즘은 수리·점검 콘솔과 같되,
회사 분실물 정책이 다르다 — **보관 2주 후 폐기, 고가 물품은 기간 연장, 반환은 배송 또는 직접수령**.

### 결정 (3개 갈림길, 대표님 확정)

1. **처리 범위 = 능동 처리까지 포함.** 수리·점검 콘솔은 순수 감시(처리는 전부 모바일)였지만, 분실물은
   배송 반환·만료 폐기를 **사무실이 대시보드에서 직접** 한다. 감시 + 이력 + 예외 개입 + **능동 처리 3종
   (반환 · 폐기 · 보관 연장)**. 현장 모바일 반환과 병존.
2. **반환 방식 = 구조화.** 배송(`shipped`) / 직접수령(`picked_up`)을 별도 필드로, 배송이면 송장번호를
   기록한다(`return_method` / `return_tracking_no`). 자유 메모만으로 두지 않는다 — 통계·필터·이력용.
3. **폐기 정책 = 수동 + 연장.** ~~2주(14일) 경과를 자동 이관·자동 삭제하지 않는다.~~ **→ 2026-07-16에
   자동 폐기 + 폐기 내역 90일 + 자동 삭제로 대체됨(위 항목).** 연장(`hold_until`) 개념과 '고가' 플래그
   없음(연장으로만 표현, `is_high_value` 컬럼 없음)은 유지.

### 추가 확정 (2026-07-15) — 구현 착수 전 결정 전부 확정됨

- **무효(void) 상태 없음 — 삭제만.** 잘못된·중복 등록은 하드 삭제로 정리하고 **감사 기록을 남기지
  않는다.** 예외 개입 = 상태 정정 + 삭제.
- **보관 시계 = 등록일(`found_at`) + 14일** ("등록한 날로부터 2주 뒤까지").
- **내보내기 없음.** 완료 뷰 포함 콘솔에 Excel/PDF 내보내기를 두지 않는다(수리·점검과 동일). 현재
  `/admin/lost-found`의 `LostFoundExportBar`는 콘솔 재구축 시 제거.

전체 기획 명세(뷰 구성·모달·필요 스키마·권한)는 `docs/product/09-lost-found-workflow.md` →
"대시보드 분실물 관리 콘솔 — 기획" 참고. **구현은 아직 시작하지 않았다.**

**Status update (2026-07-16): 구현 완료.** 자세한 구현 내역은 위 "2026-07-16 분실물 자동 폐기 · 폐기
내역 90일 · 자동 삭제 확정" 항목의 "Status update" 참고.

## 2026-07-14 어드민 캘린더 / 내보내기 공용 캐논 확정 (절대 규칙)

### 배경

화면마다 날짜 선택 UI와 내보내기 방식이 제각각이었다. 분실물·수리점검·주문은 네이티브
`<input type="date">` 2개 + CSV 링크, 연차 이력은 클라이언트 Blob CSV, 근태 수당·연차 잔여는 아예
동작하지 않는 스텁 버튼, 청소 기록·근태 급여·교통비만 제대로 된 Excel/PDF였다. 대표님 지시:
**"청소 기능 기록 탭의 캘린더와 내보내기 버튼을 기준으로 전면 통일하고, 앞으로 개발할 기능에도
절대 규칙으로 적용할 것."**

### 결정 1 — 캘린더는 3개 프리미티브뿐

`AdminDateRangePicker`(기간) / `AdminDatePicker`(하루) / `AdminMonthPicker`(월) 셋만 쓴다.
폼 제출용은 `DateRangeFormField` / `DateFormField` 래퍼.

- **어드민 콘솔에서 네이티브 `<input type="date">` 신규 사용 금지.**
- 캐논 크롬은 청소 기록 범위 피커의 `.calpop`(292px / radius 16 / padding 14 / 30px nav / 34px 셀).
  `.adp__*`(단일일), `.amp__*`(월)의 팝오버 CSS를 여기에 맞춰 정렬했다. 셋은 lockstep으로 유지한다.
- `AdminMonthPicker`는 **월 선택 개념 그대로 유지**(급여/교통비/수당). 검토했지만 범위 피커로 바꾸지
  않기로 확정 — 월 단위 정산은 범위 선택과 다른 조작 개념이다. 시각만 통일한다.

### 결정 2 — 내보내기는 Excel + PDF 2종, 컨트롤 1개, 템플릿 1개

- 컨트롤: `<AdminExportButtons>` (`chipbtn` + lucide `Download` ×2). 화면별 자체 버튼 금지.
- 서버: `buildAdminTableWorkbookBase64()` / `buildAdminTableReportHtml()` — **동일 입력 구조**를 받아
  각각 .xlsx와 인쇄용 HTML을 낸다. 초록 원장 서식은 `attendance-payroll-workbook.ts` 상수 재사용.
- **Excel과 PDF는 항상 함께.** 한쪽만 있는 화면은 미완성으로 본다.
- **CSV 전면 폐기.** `/api/admin/export/[resource]` 라우트, `lib/export/admin-export.ts`,
  `lib/export/csv.ts`, `lib/export/admin-reservations.ts`, `ExportCsvLink` 전부 삭제.
  대표님 확정: CSV 페이지는 버튼만 갈아끼우지 말고 **실제 Excel+PDF로 교체**할 것.
- 스텁 버튼(근태 수당 / 연차 잔여)은 **이번 사이클에 실제 구현**할 것 — 대표님 확정.
- 내보내기 로케일은 **서버가** `session.user.preferredLanguage`에서 해결한다
  (`buildAdminExportMeta`). 클라이언트는 로케일을 넘기지 않는다.
- 공용 문구는 `dictionary.admin.shared` 네임스페이스(ko/ja/en) 하나로 통합. 기능별 중복 키 제거.

### 적용 범위 (2026-07-14 구현 완료)

| 화면 | 캘린더 | 내보내기 |
| --- | --- | --- |
| 청소 기록 | 기준(변경 없음) | 공용 빌더로 위임 (서식 동일) |
| 분실물 / 수리·점검 / 주문·비품 | native date ×2 → `DateRangeFormField` | CSV → **Excel + PDF 신규** |
| 연차 이력 | 필터 없음 → `AdminDateRangePicker` **신규** | Blob CSV → **Excel + PDF 신규** |
| 연차 잔여 | 입사일 편집 → `AdminDatePicker` | 스텁 → **실구현** (전체 + 1인) |
| 연차 신청 모달 | native date ×2 → `AdminDatePicker` | — |
| 근태 수당 | (월 피커 유지) | 스텁 → **실구현** (요약 + 시급 이력 2시트) |
| 근태 급여 / 교통비 | (월 피커 유지) | 이미 캐논 — 변경 없음 |

**범위 밖(사유 명시):** 예약 캘린더 월 뷰 = 피커가 아니라 캘린더 *뷰*. `/onboarding`·`/account`의
native date = `.adm` 콘솔 밖(모바일 디자인 언어).

Status: **Confirmed & implemented (2026-07-14).** 절대 규칙은 `CLAUDE.md` §4a/§4b와
`docs/product/05-admin-web-ia.md`에 기록. 앞으로 추가되는 모든 어드민 화면에 무조건 적용한다.

## 2026-07-14 조직 모델 방향 — 단일 조직 + 현장/사무실 뷰 라벨 (조직 간 공유 아님)

### Org model — single org + field/office view label, NOT cross-org data sharing

- 대표님 의도: "조직은 나눠져 있어도 같은 팀이라 데이터가 이어져 보여야 하고, 조직만 나눠서 볼 뿐."
- **결정: 조직을 여러 개로 쪼개 데이터를 공유하는 방향(Option B)은 채택하지 않는다.** 그건 전 테이블
  RLS·쿼리·멤버십을 갈아엎고 조직 격리(확정 계약, CLAUDE.md 규칙 6)를 약화시키는 대규모·고위험 작업.
- **채택(Option A): 조직은 그대로 테넌트 경계로 두고, 한 조직 안에 "현장/사무실"(사이트/부서) 라벨을
  뷰·필터 차원으로 추가**한다. 데이터는 한 조직 안에서 자연히 전부 공유되고, 화면에서 현장/사무실로
  나눠 보기만 한다. RLS 재설계 불필요.
- **미정(설계 필요):** 라벨을 무엇에 붙일지(멤버십이 유력), 어느 화면에서 필터로 쓸지, 값이 고정
  현장/사무실인지 일반 사이트 목록인지. 별도 기획 사이클에서 확정 후 구현.
- 조직 CRUD(이름 변경·빈 조직 삭제·생성)는 이 방향과 무관하게 유지(개발자가 서로 다른 고객 팀=서로 다른
  조직을 관리하는 용도).

Status: Direction confirmed (2026-07-14). 설계·구현 대기. 아직 데이터 모델 변경 없음.

**Status update (2026-07-14): Phase 1 implemented.** 라벨은 `memberships`에 붙는 것으로 확정 —
새 `teams` 테이블(`kind` = field/office, `name`은 향후 하위팀용)을 추가하고 `memberships.team_id`로
연결. 마이그레이션 `supabase/migrations/202607140001_teams.sql` 작성 완료(조직별 현장/사무실 기본 팀
시딩 + 기존 멤버 role 기반 백필 + RLS: 활성 멤버 SELECT, 쓰기는 서비스롤 서버 액션만) — **DB에는 아직
미적용**. `/admin/users/[id]`에 소속(현장/사무실/미지정) 드롭다운+저장, `/admin/users` 목록에 소속
컬럼+필터 추가(`setMemberTeam` 서버 액션, `getOrgTeams` 헬퍼). tsc 0 / lint 0. **후속 단계(미구현):**
팀 CRUD(하위팀 생성)와 근태/청소/대시보드 화면의 팀 필터. 상세: `docs/product/01-user-roles.md`,
`docs/engineering/04-data-model.md` → `teams`, `docs/planning/06-current-status.md`.

## 2026-07-13 어드민 드롭다운 단일 표준화 (`.dd`) — 칩형 드롭다운 폐기

### Single admin dropdown standard — `.dd` (AdmDropdown), chip dropdown retired

- **어드민 콘솔의 드롭다운은 사용자 화면의 `.dd`(`AdmDropdown`) 하나로 통일.** 화면마다 다른
  드롭다운을 두지 않는다. 값 편집·필터·정렬 전부 이 컴포넌트만 쓴다. 네이티브 `<select>`를 폼에서
  대체할 땐 `DdFormSelect`(숨은 input 래퍼)를 쓴다.
- **구 칩형 `ChipDropdown`(`.adp` 드롭다운)은 폐기·삭제.** 근태 큐(출근·연차)의 필터 4곳을 `.dd`로
  이관했고 컴포넌트 파일(`admin-chip-dropdown.tsx`)을 삭제했다. 초대(invites) 페이지의 네이티브
  `<select>` 2곳도 `.dd`로 교체.
- `.dd` CSS를 `users-console.css` → **`admin-console.css`로 이동**(AdminShell이 전 `.adm` 페이지에
  로드)하고, 컴포넌트를 `components/admin/users/` → **`components/admin/shared/`로 이동**해 공용화.
- **후속(2026-07-14): 두 번째 커스텀 드롭다운 `AdminSelectField`(`.selfield`)도 폐기·삭제.** 근태 수기
  세션 모달·수당 섹션 3곳을 `.dd`로 이관(`AdmDropdown`에 `disabled` prop 추가), `.selfield` CSS 제거.
  초대 페이지 만료일 네이티브 `<input type="date">`도 `AdminDatePicker`(폼 래퍼 `DateFormField`)로 교체.
  이로써 어드민 드롭다운/선택 컨트롤은 `.dd` 하나로 완전 일원화(달력형 피커는 별개 컨트롤로 유지).
- 달력형 피커(`AdminDatePicker`/`TimePicker`/`MonthPicker`)와 `.adp`/`.chipbtn` 시각 언어는 드롭다운이
  아닌 별개 컨트롤이라 그대로 유지(날짜/월 피커 등에서 계속 사용).

Reason: 역할 드롭다운(사용자)·칩 필터(근태)·네이티브 select(초대 등)로 드롭다운이 화면마다 달라
일관성이 깨졌다. 청소 등 신규 대시보드를 만들기 전에 단일 표준으로 못박음(2026-07-13).

Status: Confirmed + 구현 완료 (2026-07-13). tsc 0 / lint 0 errors. 청소 대시보드 기획도 `.dd` 사용으로 기록됨.

## 2026-07-13 초대코드(팀코드) 관리를 설정에서 사용자 화면으로 이전

### Invite-code (team code) management moved from Settings into the Users screen

- Moved `/admin/settings/invite-codes` → `/admin/users/invites`, so the full member lifecycle
  (invite → manage role/status → deactivate → delete) lives in one place instead of being split
  between Settings and Users. `/admin/users` and `/admin/users/invites` are now linked by a shared
  "멤버 목록"/"멤버 초대" pill tab switcher (`src/components/admin/users/users-section-tabs.tsx`).
  Old links to `/admin/settings/invite-codes` still resolve — the page there is now a redirect stub.
- Gate unified: `canManageInvites` (`src/app/admin/settings/actions.ts`) no longer hardcodes
  `owner`/`office_admin`/`senior_managing_director` role checks. It now defers to
  `actorCanManageUsersInOrg` (`src/lib/user-management-access.ts`) — developer, or an org membership
  with `manage_users = true` — the same gate that already protects `/admin/users`. This also fixes a
  standing bug where `senior_managing_director` (전무) couldn't create invite codes because the old
  hardcoded role array omitted that role.
- **Not changed:** the default-role grant ceiling inside `createInviteCode` — developer/owner/전무 may
  pick any invite category, everyone else (i.e. `manage_users` delegates without one of those roles)
  is still limited to `officeAdminAssignableRoles`. This mirrors `canAssignRole`'s manual role-change
  tiering and stops a delegate from self-service-granting `office_admin`-or-above via invite code.
- The settings page's invite-code card was removed; `/admin/settings` now only lists organization
  (and, for org top admins, attendance) settings.
- New page (`src/app/admin/users/invites/page.tsx`) reuses the old create-form + list + deactivate
  markup, restyled with the `.adm`-scoped `users-console.css` primitives (`ui-card`, `ui-btn`,
  `ui-input`, `ui-badge`, `ctitle`, `chint`) instead of shadcn `Card`/`Button`/`Input`, to match the
  visual tone of the rest of the users console.
- Known gap carried over, not fixed in this change: `getManageableOrganizations` (the org picker for
  the invite-create form) still filters by `role in (owner, office_admin)` rather than `manage_users`.
  A `manage_users` delegate who holds neither role would pass the page gate but see zero organizations
  to pick from. Flagged for a follow-up once it's clear whether `manage_users` delegates are expected
  to hold cross-org invite scope.

Impact:
- `src/app/admin/settings/actions.ts`
- `src/app/admin/settings/invite-codes/page.tsx` (now a redirect stub)
- `src/app/admin/settings/page.tsx`
- `src/app/admin/users/invites/page.tsx` (new)
- `src/app/admin/users/page.tsx`
- `src/components/admin/users/users-section-tabs.tsx` (new)
- `src/components/admin/users-console.css`
- `src/lib/i18n.ts`
- `docs/product/05-admin-web-ia.md`

## 2026-07-10

### Onboarding recovery UX hardened: visible login return path and actionable duplicate-phone handling

- The profile-setup onboarding wizard now exposes an explicit `로그인으로 돌아가기 / Back to login / ログインに戻る` action on every step, not only on some footer states. The action signs the user out and returns to `/auth/login` while preserving the selected language.
- Reason: users can enter onboarding through the wrong Google/email account and previously had no obvious escape path once they moved past the intro screen.
- Duplicate phone-number handling stays an account-level uniqueness rule, but the UX is now recoverable:
  - when profile submit fails with `phone_duplicate`, onboarding jumps the user back to the phone-number step
  - the phone step shows a visible error/explanation telling the user to either enter a different number or return to login and use the existing account that already owns the number
- This is a UX hardening change only. No role, schema, or uniqueness-policy change was made.

Impact:
- `src/app/onboarding/onboarding-wizard.tsx`
- `src/app/onboarding/page.tsx`
- `src/lib/i18n.ts`
- `docs/product/04-organization-invitations.md`
- `docs/product/17-user-profile-directory.md`
- `docs/planning/06-current-status.md`

### Attendance allowance design accepted for busy-day staffing coverage

- **Implemented 2026-07-10** (migration `202607100001`): table + calculation + admin/mobile display +
  Excel/PDF export + finalized-snapshot `allowance_breakdown`. See
  `docs/engineering/11-attendance-payroll-technical-design.md` → "As-built — attendance allowances".
- Planned a new **근태 추가수당 / attendance allowance** layer for cases where the company pays extra on
  busy or short-staffed days to secure enough workers.
- Confirmed terminology: use **추가수당 / allowance**, not "bonus" or "incentive". This is operational
  staffing coverage pay, not a discretionary bonus.
- Confirmed boundary: do **not** write one-off busy-day amounts into `hourly_rate_history`. That table
  remains the base contractual/default hourly-rate history. Allowances are a separate pay calculation
  layer and must be preserved in finalized payroll snapshots.
- MVP allowance types:
  - `daily_fixed`: a fixed extra amount paid once per worker/date when the worker has valid paid work.
  - `hourly_extra`: an extra hourly amount multiplied by recognized paid minutes for the date.
- MVP targeting: a Tokyo operating date, applying either to all hourly workers or to one specific
  worker. Site/role/time-window/work-type targeting stays deferred.
- Permission direction: create/cancel and org-wide views stay with `owner` /
  `attendance_payroll_admin`; workers may see only allowances applied to their own pay view.
- Finalized-month rule: allowance changes are blocked once a user-month is finalized; operators must
  reopen the month, change allowances, then re-finalize.

Impact:
- `docs/product/21-attendance-payroll-workflow.md`
- `docs/engineering/11-attendance-payroll-technical-design.md`
- `docs/engineering/04-data-model.md`
- `docs/engineering/05-rls-permissions.md`

## 2026-07-09 (2)

### Invite-code creation UI extended to office_admin / field_manager; owner and cs_staff stay manual

- `src/config/roles.ts` has always defined 5 invite categories (`INVITE_CATEGORIES` /
  `inviteCategoryToRole`), but the actual invite-code creation UI
  (`src/app/admin/settings/invite-codes/page.tsx`) and its server-side validation
  (`src/app/admin/settings/actions.ts`) only ever allowed picking `staff`/`part_time_staff` as the
  default role — a known, documented gap (`docs/product/04-organization-invitations.md`). Discovered
  while reviewing whether the new permission-override feature (`docs/product/27`) interacts with the
  signup/role-assignment path.
- Fixed: `inviteDefaultRoles` in both files now also includes `office_admin` and `field_manager`. No
  new i18n needed — `dictionary.roles` and `dictionary.*.inviteCategories` already had labels for
  every role/category, they just weren't reachable from this screen.
- `owner` stays excluded: it needs a separate single-use invite-code flow that doesn't exist yet, and
  handing out a shareable multi-use code that grants org ownership is a meaningfully bigger risk than
  the other roles.
- `cs_staff` stays excluded: it has no invite category at all by original design (admin-assigned
  only, per the comment in `roles.ts`) — this was intentional, not a gap, so it's untouched.
- Both remain reachable only via manual role change at `/admin/users/[id]` (`updateMemberRole`),
  which already has its own tiered permission check (`canAssignRole`).

Why: this was flagged as unrelated to the permission-override feature currently being designed, but
the user asked to fix genuine gaps found along the way rather than deferring them, since letting a
documented-but-unfixed limitation sit indefinitely is its own form of drift between docs and code.

Impact:
- `src/app/admin/settings/invite-codes/page.tsx`, `src/app/admin/settings/actions.ts`
- `docs/product/04-organization-invitations.md`

## 2026-07-09

### Admin reservation calendar dashboard v1 implemented

- Implemented the first real `/admin/calendar` dashboard slice using the accepted admin-calendar
  direction from `docs/product/15-reservation-calendar.md`: dense room/date month board first, with
  no financial data and a secondary reservation inspector.
- The page is now a single integrated reservation console with 4 views:
  - month board
  - today ops
  - room status
  - building info
- Reused the same reservation-to-room mapping policy as the mobile calendar so the admin console does
  not drift on room resolution, fallback rows, or the no-drop policy for reservations that do not map
  cleanly to the active room catalog.
- Confirmed policy: the dashboard does **not** expose a real manual Beds24 reconcile action.
  The new top-right refresh chip is intentionally passive (`router.refresh()` only), because
  `/api/beds24/reconcile` remains secret-protected and is not part of the normal admin permission
  surface.
- Confirmed policy: building access/address info in the new `Building info` view is currently sourced
  from `src/lib/property-map-links.ts`, and in-page edits are browser-session preview only. They are
  deliberately not persisted until a separate storage / permission decision is made.
- Confirmed policy: the reservation inspector's complaint action remains a placeholder toast because a
  real `/admin/complaints` route is not implemented yet; we do not fake a broken deep link.
- Follow-up polish on the same dashboard slice:
  - the month-board date header must remain visible while the inner calendar grid scrolls vertically
  - `Today ops` uses reservation-driven `setting targets` instead of the earlier turnover/cleaning
    placeholder, matching the mobile cleaning smart-list rule for same-day arrivals without same-room
    departures
  - property-selection chips are label-only and centered; room-count badges were removed to reduce
    visual noise in the month-board filter row

Why: the user requested implementation of the reservation-calendar design handoff on the dashboard,
and the existing `/admin/calendar` page was still a much simpler month table + two lists. This ships a
real dashboard console while preserving existing permissions, Beds24 source-of-truth boundaries, and
the current operational-window rules.

Impact:
- `src/app/admin/calendar/page.tsx`
- `src/components/admin/calendar/admin-reservation-console.{tsx,css}`
- `src/lib/i18n.ts` (`admin.calendar.*`, `common.save`)
- `docs/product/15-reservation-calendar.md`
- `docs/product/05-admin-web-ia.md`
- `docs/planning/06-current-status.md`

### Unified permission-denied UX: mobile BottomSheet / admin bottom-center toast

- Added a shared `common.permissionDeniedTitle` / `common.permissionDeniedBody` i18n pair (ko/ja/en)
  and two reusable presentational components: `PermissionDeniedSheet`
  (`src/components/shell/permission-denied-sheet.tsx`, canonical `BottomSheet`, lock icon + title +
  body + close button — same visual language as the daily-report "forbidden" state) for `/mobile/*`,
  and `AdminToast` / `useAdminToast` (`src/components/admin/shared/admin-toast.tsx`, reuses the
  existing `.adm-toast` bottom-center pill CSS) for `/admin/*`.
- Wired into the two spots that previously collapsed an `unauthorized`/`forbidden` server-action error
  into a generic "삭제 실패"/"저장 실패" message: `DeleteConfirmButton`
  (`src/components/requests/delete-confirm-button.tsx`, admin-only) and `OrderActionBar`
  (`src/components/requests/order-action-bar.tsx`, used by both `/mobile/requests/orders/[id]` and
  `/admin/orders/[id]` — added a required `surface: "mobile" | "admin"` prop so it picks the right UI).
- Explicitly out of scope: screens that already had their own permission-denied messaging (daily
  report sheet, admin attendance approval queue, attendance correction form) were left untouched —
  this was a deliberate scoping choice, not an oversight, to avoid rewriting working code.
- The message body says "개발자에게 문의하세요" (contact the developer) per explicit user instruction,
  rather than "관리자에게 문의" (contact an org admin) — a deliberate product-copy choice, not the
  usual admin-escalation phrasing used elsewhere in the app.

Why: server-side permission checks already reject these actions correctly (see
`docs/engineering/05-rls-permissions.md`), but the client was showing an unhelpful generic failure
message that didn't tell the user *why* the action failed. This closes that specific UX gap without
touching the underlying authorization logic.

Impact:
- `src/lib/i18n.ts` (`common.permissionDeniedTitle`, `common.permissionDeniedBody`, `common.close`)
- `src/components/shell/permission-denied-sheet.tsx` (new)
- `src/components/admin/shared/admin-toast.tsx` (new)
- `src/components/requests/delete-confirm-button.tsx`
- `src/components/requests/order-action-bar.tsx`
- `src/app/admin/maintenance/[id]/page.tsx`, `src/app/admin/lost-found/[id]/page.tsx`
- `src/app/mobile/requests/orders/[id]/page.tsx`, `src/app/admin/orders/[id]/page.tsx`
- `docs/engineering/05-rls-permissions.md`

## 2026-07-07

### Annual leave: admin approval review (Phase 2, stage 2) implemented

- Built the admin-dashboard approval queue confirmed as scope on 2026-07-06: new route
  `/admin/attendance/leave`, a new "연차"/"年次"/"Leave" tab added to the attendance console subnav
  (`src/components/admin/attendance/attendance-subnav.tsx`). Server page
  (`src/app/admin/attendance/leave/page.tsx`) gates on `requireAdminPageSession` + `is_leave_approver`;
  non-approvers see a permission-denied card.
- Backend `src/lib/annual-leave-approvals-server.ts`: `getAdminLeaveQueue` (org-wide queue + summary),
  `getAdminLeaveApprovalDetail` (detail + balance-impact projection + same-period overlap),
  `approveLeaveRequestForApprover` (approval stamp: `status → approved`, records
  `approved_by_user_id`/`approved_role`/`approved_at`, only from `requested`),
  `rejectLeaveRequestForApprover` (`status → rejected`, reason optional per the 2026-07-06 policy). All
  four are service-role, org-isolated, and re-verify the caller is an approver. Server actions:
  `src/app/admin/attendance/leave/actions.ts` (approve/reject), `detail-actions.ts` (detail wrapper).
- Frontend `src/components/admin/attendance/leave-queue-client.tsx`: 3 summary cards, status-group
  tabs, leave-type filter, search, table, right-side detail panel — following the same dashboard
  list/detail-panel pattern as `/admin/attendance/queue`. i18n `admin.leaveConsole.*` +
  `attendanceConsole.tabLeave` added ko/ja/en.
- No new migration — reuses the approval/reject columns already added by
  `202607060002_annual_leave_requests.sql` and the `is_leave_approver()` helper.
- Explicitly out of scope this slice: the leave subnav's other 4 sub-tabs (팀 캘린더/직원 잔여·부여/
  승인자 관리/문서) are inactive placeholders only; branch filter, export, and proxy-submit are
  excluded; approval does not yet feed `computeAnnualLeaveSummary`'s `usedDays`/`specialUsedDays` (the
  detail panel's "잔여 영향" is a display-only projection); no applicant notification on approve/
  reject; document output (stage 3) remains not built.

Why: this closes out Phase 2 stage 2 of the annual-leave workflow per the build order confirmed
2026-07-06 (mobile-first, then admin approval). Scoping usage-deduction wiring and notifications out
of this slice keeps the review action itself (the part actually blocking approvers from doing their
job) shippable without waiting on the balance-calculation and notification work.

Impact:
- `src/app/admin/attendance/leave/{page.tsx,actions.ts,detail-actions.ts}` (new)
- `src/lib/annual-leave-approvals-server.ts` (new)
- `src/components/admin/attendance/leave-queue-client.tsx` (new),
  `attendance-subnav.tsx` (new "연차" tab)
- `src/lib/i18n.ts` (`admin.leaveConsole.*`, `attendanceConsole.tabLeave`, ko/ja/en)
- `docs/product/26-annual-leave-workflow.md`, `docs/product/05-admin-web-ia.md`,
  `docs/engineering/04-data-model.md`, `docs/planning/06-current-status.md`

## 2026-07-06 (7)

### Annual leave: swipe-to-delete for draft rows in history

- Added real delete (not just cancel) for draft leave requests, since a draft was never submitted —
  cancel doesn't apply, hard delete does. Reused the existing swipe-to-delete pattern from
  `src/components/notifications/notification-list.tsx` (`SwipeItem`) rather than inventing a new
  interaction: one row open at a time, 76px reveal, 40px commit threshold, spring-back animation,
  delete fires immediately on tapping the revealed button (no extra confirmation modal — the swipe +
  explicit tap is already a two-step deliberate gesture, matching the only existing precedent for this
  interaction in the app). Only draft rows get the swipe wrapper; other statuses are unaffected.
- `deleteLeaveRequestDraft` (`src/lib/annual-leave-requests-server.ts`, new): hard-deletes, self-scoped,
  only while `status = 'draft'`. `deleteLeaveRequestDraftAction`
  (`src/app/mobile/attendance/leave/actions.ts`, new) wraps it.
- Added a `trash` icon to `att-icons.tsx` (matching the hand-ported inline-SVG icon set's stroke
  style) instead of importing `lucide-react`'s `Trash2` as notifications does — keeps this feature's
  icon set visually consistent with itself rather than mixing icon libraries.
- New CSS (`leave.css`): `.lswipe*` classes for the reveal/delete-button layout, `.lrow-outer` to
  re-anchor the existing `.lrow + .lrow` spacing rule now that history rows are wrapped one level
  deeper (needed for the swipeable rows' own stacking context).
- i18n: `draftSwipeDelete` ("삭제"/"Delete"/"削除") added to all three locales; leave dict key count
  confirmed at 136/136/136 (no drift).

Why: draft deletion is a real gap (drafts have no other way to be removed), and swipe-to-delete
already exists once in this codebase — reusing that exact interaction/physics avoids introducing a
second, subtly different gesture pattern for the same underlying action.

Impact:
- `src/lib/annual-leave-requests-server.ts` (`deleteLeaveRequestDraft`)
- `src/app/mobile/attendance/leave/actions.ts` (`deleteLeaveRequestDraftAction`)
- `src/components/attendance/leave-history.tsx` (`SwipeableDraftRow`), `att-icons.tsx` (`trash`),
  `leave.css`

**Addendum:** tapping/clicking anywhere outside a swiped-open draft row now springs it closed too (not
just tapping the row itself or opening a different row) — a document-level `pointerdown` listener
scoped to each row while it's open, torn down once closed. This wasn't present in the
`notification-list.tsx` precedent either; added here as a small UX improvement on top of the reused
pattern.

**Bug fix:** tapping elsewhere to close a swiped-open row showed a brief red flash. Root cause:
`leave.css` was missing the `-webkit-tap-highlight-color: transparent` reset that its sibling files
(`attendance.css`, `transport.css`) already apply globally within their scope — every other button in
this app already had it, `leave.css` just never got it. Added the same `.lv *`/`.lv-sheet *` reset
block to `leave.css`, matching the existing project pattern exactly.

**Bug fix #2:** the tap-highlight fix didn't fully resolve it — a faint red edge was still visible
during/after the close animation. First attempt gave `.lswipe__content` its own `background: var(--card)`
**+ `border-radius: 15px`**, which was itself wrong and didn't fix it: `.lswipe__content` is the
element that slides via `translateX`, so while open or mid-animation its box sits away from the
container's true corners — rounding that same element rounds those off-corner positions too,
creating small red crescents where the `.lswipe__del` layer behind peeks through the curve exactly
at the row's edges during the slide. **Bug fix #3 (actual root cause):** removed `border-radius` from
`.lswipe__content` entirely, keeping only the opaque `background`. Rounding belongs solely on the
fixed outer `.lswipe` (`overflow: hidden` + `border-radius: 15px`), which correctly clips the plain
rectangular content into the right shape regardless of its horizontal offset — no rounded corners
mid-slide, so nothing red can peek through a curve that shouldn't exist there.

**Bug fix #4:** a full rectangular red ring (with a small gap between it and the card, like
`outline-offset`) was still visible around one row after closing via outside-tap — not a corner
bleed like #2/#3, shaped like a focus ring. Not confirmed against live DevTools (not available in
this session), but this file's own established convention is that custom-styled interactive elements
explicitly opt out of the default outline (`.finput` already does this) — `.lrow`, `.lswipe`, and
`.lswipe__delbtn` never got that treatment, so if any of them received `:focus-visible` (native
browser behavior on some platforms after a tap/click completes), the default ring would show. Added
`outline: none` to all three, matching the existing `.finput` pattern, rather than the global
`:focus-visible` ring (which is blue via `--ring`, not red) applying unexpectedly.

## 2026-07-06 (6)

### Annual leave: draft resume/continue-editing closes the mobile experience

- Found and fixed a real gap while confirming mobile was feature-complete: "임시저장" (save draft)
  persisted a real `draft` row, but no screen ever showed it again — `leave-home.tsx`'s recent list
  and `leave-history.tsx` both filtered drafts out, so a saved draft was effectively unrecoverable.
- `leave-history.tsx` no longer filters out drafts (they show under the "전체" filter tab with the
  existing muted "임시저장" chip); tapping a draft row now navigates to
  `/mobile/attendance/leave/new?id=<id>` instead of opening the read-only detail sheet.
- `/mobile/attendance/leave/new` accepts `?id=` to load and prefill an existing draft
  (`getMyLeaveRequest`); only rows still in `draft` status are treated as editable (a requested/
  decided row falls through to a blank new form instead).
- `updateDraftLeaveRequest` (`src/lib/annual-leave-requests-server.ts`, new) overwrites the draft's
  fields in place and, if the user submits (not saves-as-draft-again) this time, transitions it to
  `requested`. `submitLeaveRequestAction` gained an optional `requestId` to route to this instead of
  creating a new row.
- `leave-home.tsx`'s recent-requests teaser still excludes drafts (unchanged) — drafts are a
  history/edit concern, not a "recent activity" one.

Why: this was found by directly re-verifying "is mobile actually done" rather than trusting the
earlier checklist — the draft button existed and appeared to work, but had no way back. Confirmed
worth fixing now, per "finish mobile first."

Impact:
- `src/lib/annual-leave-requests-server.ts` (`updateDraftLeaveRequest`)
- `src/app/mobile/attendance/leave/actions.ts` (`submitLeaveRequestAction` requestId param)
- `src/app/mobile/attendance/leave/new/page.tsx`, `history/page.tsx`
- `src/components/attendance/leave-form.tsx` (draft prefill), `leave-history.tsx` (draft row → edit)

## 2026-07-06 (5)

### Annual leave: mobile team calendar (L5) wired to real approved-only, org-wide data

- Confirmed the mobile leave calendar shows every employee's leave (including the viewer's own), but
  only **approved** requests — pending/rejected/draft/cancelled stay private. This completes the last
  remaining mock piece of the mobile employee-facing annual-leave experience (per the "finish mobile
  first" build order confirmed earlier today).
- Migration `202607060003_annual_leave_approved_visibility.sql` (applied): additive SELECT RLS policy
  `annual_leave_requests_org_approved_select` grants org-wide read of `status = 'approved'` rows on
  top of the existing self-or-approver policy.
- `listApprovedLeaveForMonth` (`src/lib/annual-leave-requests-server.ts`, new) queries approved leave
  overlapping a given Tokyo month. `leave-calendar.tsx` converted from a hardcoded July-2026 mock
  (fake names, no navigation) to a real month grid with `?ym=` navigation and real applicant names
  (already denormalized on `annual_leave_requests.applicant_name`, no join needed).

Why: this was the one piece of mobile-side annual leave still fully mocked; wiring it closes out the
"mobile first" milestone before admin-dashboard work (approval queue, stage 2/3) begins.

Impact:
- `supabase/migrations/202607060003_annual_leave_approved_visibility.sql` (new, applied)
- `src/lib/annual-leave-requests-server.ts` (`listApprovedLeaveForMonth`)
- `src/components/attendance/leave-calendar.tsx`, `src/app/mobile/attendance/leave/calendar/page.tsx`
- `docs/engineering/04-data-model.md`, `05-rls-permissions.md`

## 2026-07-06 (4)

### Annual leave: approval queue is admin-dashboard scope; build order is mobile-first

- Confirmed the approval queue, approve/reject action, and document output (Phase 2 stage 2/3) belong
  on the **admin web dashboard** (`/admin/attendance/leave`, planned to mirror the existing
  correction-review queue at `/admin/attendance/queue`), not mobile — mobile is the employee
  submit/view surface, the PC dashboard is the manager review/approve surface.
- Confirmed rejecting a leave request does NOT require a reason, unlike attendance-correction
  rejection (which does) — noted so the eventual reject UI doesn't copy that requirement by default.
- Confirmed build order: finish the mobile employee-facing annual-leave experience completely first;
  the admin dashboard piece starts only afterward. Not a scope cut — just sequencing.

Why: this keeps the mobile/dashboard surface split consistent with the rest of the product (mobile =
field/employee, dashboard = office/manager), and avoids splitting attention across both surfaces
before either is solid.

Impact: `docs/product/26-annual-leave-workflow.md` (approval-location + reject-reason-optional +
build-order notes)

## 2026-07-06 (3)

### Annual leave: approval-workflow policy locked; Phase 2 stage 1 (request submission) implemented

- Confirmed the remaining open policy from `docs/product/26-annual-leave-workflow.md` against the
  actual paper form photo (休暇届): approver = any member flagged with a new
  `memberships.leave_approver_role` (`department_head` = 대표/CEO, `senior_managing_director` = 전무),
  either one approving completes the request (matches the doc's "either VP or CEO, one approval
  enough" — the paper form's 部署長/専務 stamp boxes map to those two roles, not a 3-step chain).
  Attachments are optional. E-signature is an approval "stamp" (button click, name+timestamp), not a
  drawn signature. Document output will replicate the paper form's exact layout once its own stage
  (3) is built — deferred because there's no PDF-generation library in the project yet; the interim
  plan is a print-optimized HTML view (browser print-to-PDF).
- Implemented **Phase 2, stage 1 only**: request submission + self-cancel. Migration
  `202607060002_annual_leave_requests.sql` adds `annual_leave_requests` (draft/requested/approved/
  rejected/cancelled) and `memberships.leave_approver_role` + `is_leave_approver()` helper (read-only
  RLS, same shape as `attendance_payroll_admin`/`can_manage_attendance_payroll`). Approve/reject
  action, approval queue UI, and document output are explicitly deferred to stage 2/3 — not built.
- `src/lib/annual-leave-requests-server.ts` (new): self-scoped create/cancel/list/get. Wired into
  `leave-form.tsx` (실제 제출/임시저장), `leave-home.tsx` (실제 최근 신청/대기 건수),
  `leave-history.tsx` (실제 목록 + 실제 취소), `leave-done.tsx`/`leave-cancel-done.tsx` (실제 신청
  데이터, no more MOCK constants).
- Converted the leave-request date pickers from a hardcoded July-2026 mock calendar to a real
  month/year-navigating calendar (`leave-date-picker.tsx`, mirroring `hire-date-picker.tsx`) — a
  necessary companion fix, since submitting to the real backend with fake hardcoded July-2026 dates
  would have been actively wrong regardless of when someone actually applies. `leave-form.tsx` now
  tracks real ISO date state instead of July-day integers.

Why: the approver-identity gap was the one thing genuinely blocking the approval backend (attachments/
e-signature were already effectively decided); confirming it against the real paper form let us lock
the whole policy in one pass instead of guessing. Submission is safe to build now because its shape
doesn't depend on the still-unbuilt approval action — a request can sit in `requested` status
indefinitely without needing stage 2 to exist.

Impact:
- `supabase/migrations/202607060002_annual_leave_requests.sql` (new, applied to the linked Supabase project)
- `src/types/database.ts` (annual_leave_requests, memberships.leave_approver_role)
- `src/lib/annual-leave-requests-server.ts` (new)
- `src/app/mobile/attendance/leave/actions.ts` (submit/cancel actions)
- `src/app/mobile/attendance/leave/{page,history/page,done/page,cancel-done/page}.tsx`
- `src/components/attendance/{leave-form,leave-date-picker,leave-home,leave-history,leave-done,leave-cancel-done}.tsx`
- `docs/engineering/04-data-model.md`, `05-rls-permissions.md`, `docs/product/26-annual-leave-workflow.md`

## 2026-07-06 (2)

### Annual leave: Phase 1 backend implemented (hire_date + balance baseline only)

- Scope confirmed as narrow on purpose: only `profiles.hire_date` + a self-entered leave-balance
  baseline are backed by real DB now. The request-submission/approval/e-signature/document workflow
  in `docs/product/26-annual-leave-workflow.md` remains an unimplemented planning draft — its
  approver identity, e-signature style, and document output are still unresolved, so building that
  backend now would risk being thrown away.
- Migration `202607060001_annual_leave_hire_date_baseline.sql`: adds `profiles.hire_date` (same
  pattern as `birth_date`) and a new `annual_leave_baselines` table (one row per user: `base_amount`,
  `bonus_amount`, `baseline_date`). RLS is read-only self-or-admin (`can_manage_attendance_payroll`),
  identical shape to `transport_reimbursement_reports` — all writes go through the service-role
  server action `setAnnualLeaveBaselineAction` (`src/app/mobile/attendance/leave/actions.ts`).
- `src/lib/annual-leave-server.ts` (new): `getAnnualLeaveBaseline` / `setAnnualLeaveBaselineForUser` /
  `getMyAnnualLeaveSummary` — server-only, self-scoped reads/writes, wraps the existing pure
  `computeAnnualLeaveSummary` (unchanged calculation logic, just given a real data source now).
- Removed the temporary `localStorage` bridge from `src/lib/annual-leave.ts`
  (`readLeaveBaseline`/`writeLeaveBaseline`/`LeaveBaselineInput`) now that it's replaced by the real
  backend. `leave-home.tsx` reverted from a client component back to a plain presentational component
  that receives `summary` as a prop from the server page instead of reading browser storage itself;
  `leave-exception.tsx`'s self-entry form now calls the server action instead of writing localStorage.
- `computeAnnualLeaveSummary`/`buildLeaveBuckets` gained an optional `bonusBaselineAmount` parameter
  (separate from `baselineAmount`) so a pre-existing 특별휴가 balance is tracked in the bonus pool,
  not folded into the 유급 휴가 pool — mirrors the `annual_leave_baselines.bonus_amount` column.

Why: the hire-date/balance piece was fully speced and tested (src/lib/annual-leave.ts,
annual-leave.test.ts) and had no more open policy questions, so it was safe to back with real
Supabase tables now. The approval/document workflow still has unresolved open questions (approver
identity, e-signature style, carryover beyond 2 years), so its backend is deliberately deferred rather
than guessed at.

Impact:
- `supabase/migrations/202607060001_annual_leave_hire_date_baseline.sql` (new)
- `src/types/database.ts` (profiles.hire_date, annual_leave_baselines)
- `src/lib/annual-leave-server.ts` (new), `src/lib/annual-leave.ts`
- `src/app/mobile/attendance/leave/actions.ts` (new), `leave/page.tsx`
- `src/components/attendance/leave-home.tsx`, `leave-exception.tsx`
- `docs/engineering/04-data-model.md`, `05-rls-permissions.md`, `docs/product/26-annual-leave-workflow.md`

**Migration applied 2026-07-06** to the linked StayOps Supabase project (`sspdgzkytkpmquqsfaup`) via
the Supabase MCP `apply_migration`. Verified `profiles.hire_date` exists and
`annual_leave_baselines_self_or_admin_select` RLS policy is in place; `get_advisors` showed no new
security issues introduced by this migration.

## 2026-07-06

### Annual leave: confirmed accrual table, 2-year carryover (partial), self-entry interim design

- Confirmed the exact accrual schedule: +6mo=10d, +1y6m=11d, +2y6m=12d, +3y6m=14d, +4y6m=16d,
  +5y6m=18d, +6y6m onward=20d/year (cap), plus a one-time +4-day bonus at the 4-year mark (outside
  the cap). Implemented as pure functions in `src/lib/annual-leave.ts`, covered by
  `src/lib/__tests__/annual-leave.test.ts`.
- Confirmed unused leave lapses 2 years after its grant date. What happens beyond 2 years is still
  unconfirmed pending an internal company check — kept as a single named constant
  (`LEAVE_EXPIRY_YEARS`) so it's a one-line change later.
- Interim decision (backend not started yet): the employee self-enters their hire date and current
  remaining leave balance directly (not admin-mediated), stored in browser `localStorage` only until
  a real `hire_date` column + balance ledger exist in Supabase. `leave-exception.tsx` (missing-hire-date
  screen) now collects this input instead of showing a "request setup" CTA; `leave-home.tsx` reads it
  and renders the auto-calculated balance instead of a hardcoded mock number.
- Half-day (AM/PM) leave requests now restrict the date-range picker to a single selectable day
  (`leave-date-picker.tsx`, `singleDay` prop) instead of allowing a multi-day range.
- Hire-date entry uses a new real single-date calendar bottom sheet (`hire-date-picker.tsx`) instead
  of a native `<input type="date">`. The native control renders the OS/browser's own calendar chrome
  (uncontrolled, unlocalized by this app — it was showing Korean regardless of the selected locale),
  which conflicts with the mandatory ko/ja/en multilingual rule. The new picker follows the same
  bottom-sheet visual pattern as `leave-date-picker.tsx` but does real month/year navigation (not a
  fixed mock month) since a hire date can be many years in the past.
- Fixed a Next.js RSC error introduced while making `leave-home.tsx`/`leave-exception.tsx` client
  components: they were receiving the whole `copy` i18n dictionary (which includes functions like
  `fDays`/`balExpire`) as a prop from a Server Component page, which Next.js disallows. Fixed by
  having them take a `locale: string` prop and call `getDictionary(locale)` internally instead —
  matching the existing pattern already used by `leave-form.tsx`.
- The hire-date calendar bottom sheet (`hire-date-picker.tsx`) gained a year-stepper + 12-month grid
  (tap the month/year label) so users don't have to page month-by-month back to their hire year.
- Confirmed the four leave-request types are NOT four labels on one balance — each has different
  balance/payment behavior: 경조 휴가(`annual`) is a fixed 3 paid days per request, independent of the
  hire-date accrual pool (extra days beyond 3 must come from the employee's own 유급휴가); 유급
  휴가(`paid`) draws from the hire-date accrual pool; 특별휴가(`special`) draws only from the one-time
  4-year +4-day bonus pool, never mixed with the accrual pool; 기타(`other`) is unpaid, no balance
  deduction. `computeAnnualLeaveSummary` now returns `baseRemaining`/`bonusRemaining` as two
  independent numbers (with independent `usedDays`/`specialUsedDays` inputs) instead of one merged
  total; `leave-form.tsx` auto-fills a fixed 3-day range and hides the half-day toggle when 경조 휴가
  is selected, and shows an "unpaid" hint for 기타; `leave-home.tsx` shows the 특별휴가 balance as a
  separate secondary card, not folded into the main progress bar.

Why: automatic, hire-date-based accrual removes manual balance bookkeeping once the real backend
exists, but the exact schedule and carryover policy had to be nailed down first since getting them
wrong would be costly to unwind. The localStorage bridge lets the UI/calculation work be built and
tested now without blocking on the backend.

Impact:
- `src/lib/annual-leave.ts` (new), `src/lib/__tests__/annual-leave.test.ts` (new)
- `src/components/attendance/hire-date-picker.tsx` (new)
- `src/components/attendance/leave-exception.tsx`, `leave-home.tsx`, `leave-date-picker.tsx`,
  `leave-form.tsx`, `leave.css`
- `src/app/mobile/attendance/leave/page.tsx`, `leave/exception/page.tsx`
- `src/lib/i18n.ts` (ko/ja/en)
- `docs/product/26-annual-leave-workflow.md`

## 2026-07-03

### Admin dashboard shared format utilities extracted

- Added `src/components/admin/shared/admin-format.ts`.
- Moved repeated admin Excel workbook download, yen formatting, optional yen formatting, and transport
  status-pill mapping into the shared admin layer.
- Payroll, transport, staff-detail, overview, wages, and receipt-review components now reuse the shared
  utilities where the output is identical. Domain-specific session/payroll status decisions remain local
  to their components.

Why: this removes duplicate utility code without changing labels, class names, layout, or visual output.

Impact:
- `src/components/admin/shared/admin-format.ts`
- `src/components/admin/attendance/*`
- `docs/product/05-admin-web-ia.md`
- `docs/design/00-design-direction.md`
- `docs/planning/06-current-status.md`

### Admin attendance page auth guard centralized

- Added `src/lib/admin-page-auth.ts` with `requireAdminPageSession({ nextPath })`.
- Replaced duplicated auth/onboarding/admin-role guards across `/admin/attendance/*` page components.
- The helper enforces organization context in the same place as auth and role access:
  unauthenticated users go to `/auth/login?next=...`, incomplete or platform/no-org sessions go to
  `/onboarding`, and roles outside admin-web access go to `/mobile`.
- The focused receipt review page keeps its query-bearing `nextPath` through the same helper.

Why: the attendance admin pages had repeated guard blocks, and only some checked organization context.
Centralizing the guard prevents route drift without changing the rendered UI.

Impact:
- `src/lib/admin-page-auth.ts`
- `src/app/admin/attendance/*/page.tsx`
- `docs/product/05-admin-web-ia.md`
- `docs/planning/06-current-status.md`

### Admin dashboard shared primitives extracted

- Moved reusable desktop-console primitives out of the attendance feature folder into
  `src/components/admin/shared`.
- Shared primitives now include `AdminMonthPicker`, `AdminDatePicker`, `AdminTimePicker`,
  `ChipDropdown`, `AdminReasonModal`, and `useAdminPanelA11y`.
- Attendance pages now import these from the shared admin location. Rendering classes and CSS are
  unchanged, so this is a structure/design-system cleanup rather than a visual redesign.
- The dashboard standard remains `admin-console.css` + shared primitives for new and touched admin
  operation screens; older Tailwind-style admin pages are not force-rewritten in this step.

Why: the admin dashboard had started to accumulate reusable controls inside one domain folder. Moving
them to a shared location prevents future dashboard pages from creating duplicate date pickers, reason
modals, filter controls, or panel behavior.

Impact:
- `src/components/admin/shared/*`
- `src/components/admin/attendance/*` imports
- `docs/product/05-admin-web-ia.md`
- `docs/design/00-design-direction.md`
- `AGENTS.md`
- `CLAUDE.md`

### Admin attendance follow-up hardening — state, i18n, and month-context cleanup

- The overview transport card now reads the real missing-receipt count from reimbursement items without
  image rows; the previous placeholder `0` is no longer used.
- Month context is preserved on overview → payroll/transport, staff-day → queue, and wage-panel →
  staff-detail links so badges/body/detail views do not silently drift to another month.
- Bulk queue processing remains parallel and now keeps partial-failure feedback visible until dismissed,
  including the first failed staff/date targets.
- Payroll finalization and reopen both use the shared admin modal; finalization has its own optional-note
  copy, while reopen remains reason-required.
- Admin attendance aria labels and urgency chips are dictionary-backed in ko/ja/en; Japanese `番号` and
  `台帳` labels replace the previous ambiguous strings.

Why: these were reported QA inconsistencies that could make the admin console show stale or misleading
state without changing the visual design contract.

Impact:
- `src/lib/transport-reimbursement.ts`, `src/lib/admin-attendance.ts`
- `src/components/admin/attendance/*`
- `src/app/admin/attendance/wages/page.tsx`
- `src/lib/i18n.ts`
- `docs/product/24-attendance-workflow.md`
- `docs/engineering/11-attendance-payroll-technical-design.md`
- `docs/planning/06-current-status.md`

### 교통비 검토 흐름 완성 — 보완 요청(changes_requested) + 재오픈

- 그동안 비활성 스텁이던 상세 패널의 **"보완 요청"·"재오픈"** 버튼을 실제 동작으로 구현했다.
- **보완 요청**: 새 리포트 상태 **`changes_requested`** 도입(마이그레이션 `202607030001` — status CHECK에
  값 추가). 반려(거절)보다 부드러운 중간 단계로, **직원에게 "고쳐서 다시 제출"** 요청을 보낸다. 직원은
  draft/rejected와 동일하게 이 상태에서 항목을 편집·재제출할 수 있다(모바일 편집 규칙·상태 라벨 추가).
  사유 필수.
- **재오픈**: 이미 승인/반려된 리포트를 되돌린다(→ `submitted`). **승인을 실수로 했거나 승인 후 오류를
  발견한 경우 복구** 가능. 특히 승인된 리포트를 재오픈하면 급여 합산(승인 건만 집계)에서 빠지므로 재검토
  후 다시 승인해야 반영된다. 사유 선택.
- 서버 전이 규칙(`setTransportReportReview`): submitted/reviewing/changes_requested → approved | rejected
  | changes_requested / approved·rejected → reopen(→submitted). 반려·보완요청은 사유 필수.
- UI: 급여 검토와 동일한 중앙 정렬 `AdminReasonModal` 재사용. 상태 칩(관리자 리스트/영수증 뷰/모바일)에
  `changes_requested` 라벨 추가.

Why: 실무적으로 (1) "승인하면 되돌릴 수 없음"이 돈이 걸린 흐름에서 위험했고(재오픈으로 해결), (2) 반려/승인
2택뿐이라 "영수증 한 장만 보완" 같은 흔한 케이스가 애매했다(보완 요청으로 해결). 급여 검토의 마감→재오픈과
같은 개념을 교통비에도 맞췄다.

Impact:
- `supabase/migrations/202607030001_transport_changes_requested_status.sql` (신규, 적용 완료)
- `src/lib/transport-reimbursement.ts`(타입), `src/app/mobile/attendance/transport/actions.ts`(편집 허용),
  `src/components/attendance/transport-statement.tsx`(상태 라벨·편집)
- `src/app/admin/attendance/actions.ts`(전이 규칙 확장), `src/components/admin/attendance/attendance-transport-client.tsx`(버튼·모달),
  `src/components/admin/attendance/transport-receipt-view.tsx`(상태 칩)
- i18n(ko/ja/en): 관리자·모바일 상태 라벨 + 재오픈/보완요청 액션 문구
- `docs/engineering/04-data-model.md`, `docs/planning/06-current-status.md`

### Annual Leave Workflow — salary staff only, 6-month eligibility, paper-form parity

- Annual leave is being introduced as a separate attendance-adjacent workflow for salary-based regular
  employees only. Hourly staff are excluded.
- Eligibility begins exactly 6 months after hire date. The first grant is 10 days.
- After that, leave accrues by tenure year, capped at 20 days for the base accrual.
- A 4-year bonus leave grant adds 4 days separately from the base accrual cap.
- The employee entry flow should start from signup with employee code and hire date collection, then
  fall back to a first-use hire-date prompt for legacy accounts, and allow admin correction from the
  employee detail screen.
- The request form should be reachable from both the mobile surface and the admin dashboard surface.
- The selected leave type must carry into the generated document with automatic color fill on the same
  option block used by the paper form.
- Morning and afternoon half-day leave are part of the same workflow and must use the same paper-form
  output with the selected block highlighted.
- Either the VP or the CEO can approve a request; one approval is sufficient.
- The approved document should be generated automatically and keep the company paper form as the visual
  reference.

Why: The paper approval process is slow in the field and only two people approve it, so the workflow
should stay close to the existing form while moving the intake and approval into the system.

Impact:
- `docs/product/26-annual-leave-workflow.md`
- future design file for annual leave
- later engineering and data-model docs once the flow is frozen

### 급여 계산 정합성 하드닝 — 마감 스냅샷 우선 + 개인별 문서 합계 보정

- 시급 계산의 순수 헬퍼를 `src/lib/attendance-pay-calculation.ts`로 분리하고 회귀 테스트를 추가했다.
  테스트 범위는 시급 적용 시작일 경계, 겹치는 이력에서 최신 `effective_from` 우선, 닫힌 휴게 차감,
  일별 exact gross, 월 10엔 올림, 개인별 export 일별 금액 보정이다.
- 마감된 사용자-월은 관리자 급여 목록, 직원 월별 상세, 월별 Excel/PDF export에서
  `attendance_month_snapshots.gross_amount`와 `total_paid_minutes`를 우선 사용한다. 마감 이후 시급 이력이
  변경되어도 이미 잠긴 지급 금액이 바뀌어 보이거나 내보내지지 않도록 한다.
- 개인별 Excel/PDF는 일별 금액을 정수 엔으로 표시하되, 공식 지급 총액은 월 단위 10엔 올림 규칙을 따른다.
  따라서 일별 표시 합계가 공식 월 총액과 1엔이라도 어긋나지 않도록 마지막 유급일에 반올림 보정액을
  반영한다.

Why: 급여 지급 자료는 1엔 단위 오류도 허용할 수 없다. 특히 월 중 시급 인상, 마감 이후 이력 변경,
일별 반올림 합계와 월 단위 공식 합계의 차이는 실지급 오류로 이어질 수 있으므로 계산 정책과 export
표시를 하나의 기준으로 고정했다.

Impact:
- `src/lib/attendance-pay-calculation.ts`
- `src/lib/attendance-pay.ts`
- `src/lib/admin-attendance.ts`
- `src/app/admin/attendance/actions.ts`
- `src/lib/attendance-user-payroll-export.ts`
- `src/lib/__tests__/attendance-pay.test.ts`
- `docs/engineering/11-attendance-payroll-technical-design.md`
- `docs/product/24-attendance-workflow.md`

### 교통비 정산 월별 내보내기 (Excel + PDF, 영수증 썸네일 포함)

- `/admin/attendance/transport`의 "이번 달 내보내기"(이전에는 비활성 스텁)를 급여 내보내기와 같은
  포맷 조합(엑셀 + PDF)으로 구현했다.
- 내보내기 단위는 **직원별 요약이 아니라 정산 항목(item) 단위**다 — 이번 달에 항목이 1건이라도
  입력된 모든 직원을 상태(작성중/제출됨/검토중/승인됨/반려)와 무관하게 포함하고, 행마다 상태 라벨을
  표시한다.
- 영수증 사진은 **엑셀에는 삽입하지 않고**(썸네일이 너무 작아 무의미 — 사용자 요청 2026-07-03로
  영수증 썸네일 열·이미지를 완전히 제거, "원본보기" 하이퍼링크 열만 남기고 전 셀 중앙정렬), **PDF에는
  항목당 첫 번째 사진만** 작은 썸네일로 삽입한다(2장 이상은 "+N" 표기). 전체 사진은 딥링크로 여는
  앱 내 상세 패널에서 확인한다.
- 서버 이미지 리사이즈 라이브러리는 도입하지 않는다 — 업로드 시 클라이언트 압축 정책이 이미 적용돼
  있어 원본 자체가 과도하게 크지 않다는 전제. jpg/jpeg/png/gif 외 포맷은 썸네일 없이 건수만 표시한다.
- 엑셀·PDF 모두 **급여 내보내기와 완전히 동일한 그린 회계 장부 양식**을 따른다 — 타이틀바(#b6d7a8),
  헤더/줄무늬/합계 행 색(#d9ead3/#e2f0d9), 1px 검정 테두리, Meiryo 우선 폰트, 엑셀은 급여와 동일하게
  최소 50행까지 빈 줄로 채우는 사전인쇄 장부 형태(`Math.max(50, 항목수)`)까지 맞췄다. (최초 구현 시
  PDF를 이전 대화 요약 속 오래된 네이비/카드형 스타일로 잘못 만들었던 실수를 사용자가 지적해 수정함 —
  급여 리포트가 그 사이 그린 장부형으로 이미 통일되어 있었는데 파일을 다시 읽지 않고 기억에 의존한 것이
  원인. 앞으로 "두 내보내기가 완전히 같아야 한다" 요청 시 반드시 현재 파일을 직접 diff해서 확인한다.)
- **영수증 처리 방식 최종 결정(2026-07-03): 파일에는 영수증을 넣지 않고, 웹 대시보드 전용 검토
  페이지에서 본다.** 중간에 (a) 파일에 썸네일 삽입 → (b) 항목별 딥링크(`receipt/{itemId}`)로 원본 뷰 열기
  단계를 거쳤으나, 40×40 썸네일은 판독 불가하고 항목별 링크는 20일이면 20번 클릭·20탭이 되어 불편하다는
  지적에 따라, **엑셀·PDF에서 영수증 썸네일·링크·이미지 다운로드를 전부 제거**하고 순수 장부로 확정했다
  (열: 번호/직원/날짜/사용내역/건물/상태/금액, 전 셀 중앙정렬).
- **영수증 검토는 데스크톱 마스터-디테일 웹페이지로 분리한다.** 대시보드(데스크톱)이므로 모바일식 스와이프
  갤러리가 아니라, 좌: 그 직원 한 달 항목 목록(날짜·금액·건물) / 우: 선택 영수증 크게(클릭 확대, 원본
  열기, 여러 장 이전/다음, 키보드 ↑/↓ 항목·←/→ 사진) 구조다. **20번 클릭 문제와 "이 행이 어느 영수증인가"
  대조 문제를 동시에 해결**한다.
  - 라우트 `src/app/admin/attendance/transport/receipt/page.tsx`(`?ym=&user=`, 직원-월 단위).
    진입은 **기존 교통비 패널에 "영수증 원본 검토" 버튼만 추가**(패널의 나머지 UI/UX는 그대로) — 고정 창
    이름(`stayops_receipt`)으로 열어 반복 클릭 시 한 탭 재사용.
  - 데이터 `getAdminTransportReceiptsForUser(session, ym, userId, localeTag)`(admin-attendance.ts)는
    **권한(`isAttendancePayrollAdmin`) + 조직 격리**(`getTransportReport`가 `(org,user,month)` 스코프)를
    서버에서 강제. 사진은 요청 시점 10분 서명 URL. 미인증 → `/auth/login?next=...`.
  - 장기 유효 서명 URL을 파일에 박는 방식은 끝까지 채택하지 않았다 — 로그인 없이 접근 가능한 링크가 문서
    유출 시 영수증까지 노출시키는 보안 리스크 때문. 웹 뷰는 로그인·권한·조직 격리가 항상 걸린다.

Why: 세무·회계 자료는 항목별 증빙(날짜·금액·건물)이 핵심이고, 검토는 "한 직원의 한 달치를 한 화면에서
훑고 대조"하는 데스크톱 워크플로가 최선이다. 파일은 가볍고 깔끔한 장부로, 원본 확인은 권한이 걸린 웹으로
분리하는 것이 용량·보안·사용성 모두에서 유리하다고 판단했다. 서류 양식(엑셀·PDF)은 급여 내보내기와 동일한
그린 장부 템플릿을 그대로 재사용한다.

Impact:
- `src/lib/attendance-transport-workbook.ts` / `attendance-transport-report.ts` (영수증·링크 제거, 순수 장부)
- `src/lib/attendance-payroll-workbook.ts` (팔레트 상수 export)
- `src/app/admin/attendance/actions.ts` (export에서 이미지 다운로드/딥링크/`getAppOrigin` 제거)
- `src/app/admin/attendance/transport/receipt/page.tsx` (직원-월 마스터-디테일 뷰, 구 `[itemId]` 라우트 대체),
  `src/components/admin/attendance/transport-receipt-view.tsx`,
  `src/lib/admin-attendance.ts`(`getAdminTransportReceiptsForUser`)
- `src/components/admin/attendance/attendance-transport-client.tsx` ("영수증 원본 검토" 진입 버튼 추가)
- `docs/engineering/11-attendance-payroll-technical-design.md`, `docs/planning/06-current-status.md`

### 관리자 콘솔 설치형 PWA 분리

- 관리자 대시보드(`/admin/*`)를 모바일 앱과 **완전히 분리된 독립 설치형 PWA**로 제공한다.
- 모바일 매니페스트(`public/manifest.webmanifest`, `id "/"`, `scope "/"`, `start_url "/mobile"`,
  세로 고정)는 그대로 두고, 관리자 전용 매니페스트(`public/manifest-admin.webmanifest`,
  `id "/admin"`, `scope "/admin"`, `start_url "/admin"`, orientation 미지정=any)를 신설했다.
- `src/app/admin/layout.tsx`에서 `metadata.manifest`를 관리자 매니페스트로 오버라이드해
  `/admin/*` 페이지에서 설치하면 "StayOps Admin"(id `/admin`)이 모바일 "StayOps"(id `/`)와
  별개의 앱으로 등록된다. 서비스워커(`public/sw.js`, scope `/`)는 두 표면이 공유한다.
- 아이콘/스플래시는 **1차로 기존 모바일 아이콘 세트(`/icons/*`)를 재사용**한다. 두 앱을 나란히
  설치했을 때 시각적 구분이 필요해지면 관리자 전용 아이콘을 후속으로 제작한다.
- 데스크톱 exe(Electron/Tauri) 패키징은 현재 도입하지 않는다. 로컬 파일시스템 심층 통합이나
  브라우저 비의존 상주가 실제로 필요해지는 시점에 재검토한다. 현 구조는 그 전환의 선행 작업이 된다.

Why: 오피스/관리 인력의 일상 진입 마찰을 줄이고 "전용 프로그램" 사용감을 주되, 앱스토어로 향하는
모바일과 표면을 혼동시키지 않기 위해 매니페스트/설치 아이덴티티를 분리한다. exe 패키징은 현재 요구되는
기능(파일 다운로드·알림·오프라인 셸)을 PWA가 이미 커버하므로 배포·서명 인프라 비용 대비 이점이 낮다.

주의: macOS Safari는 데스크톱 PWA 설치를 지원하지 않으므로 관리자는 Chrome/Edge로 설치해야 한다.
`scope "/admin"`이므로 `/auth`·`/onboarding` 등 스코프 밖 이동은 브라우저 탭으로 빠질 수 있다(관리자
셸의 일상 흐름은 `/admin` 내부에서 완결되어 현재 문제 없음).

Impact:
- `public/manifest-admin.webmanifest` (신규)
- `src/app/admin/layout.tsx` (신규)
- `public/manifest.webmanifest` (변경 없음, 분리 근거 명시)
- `docs/product/05-admin-web-ia.md`

## 2026-07-02

### Admin Attendance Roster 날짜 선택 통합

- 관리자 근태의 출근자 명단은 `/admin/attendance/roster` 독립 탭으로 제공한다.
- 데이터 소스는 모바일 `/mobile/attendance/roster`와 같은 `getAttendanceRoster`로 고정한다.
  모바일 출퇴근/휴게 기록과 관리자 명단 사이에 별도 동기화 계층을 두지 않는다.
- 월 단위 화면(개요, 검토 큐, 급여, 교통비, 시급, 직원 상세)은 상단 공통 월 선택기를 유지한다.
- 출근자 명단은 운영일 단위 화면이므로 근태 subnav 우측의 상단 일자 선택기와 캘린더 팝오버 하나로
  날짜를 조회한다. 명단 본문, 카드, 섹션 안에 별도 날짜 선택기를 반복하지 않는다.
- 오늘 날짜 조회는 클라이언트에서 짧은 주기로 재조회해 실시간 감지에 가깝게 운영 현황을 보여준다.

Why: 출근자 명단은 급여/교통비처럼 월 마감 대상이 아니라 현재 현장 운영 감시용 일 단위 화면이다.
날짜 선택 UI를 여러 곳에 두면 사용자가 같은 개념을 화면마다 다르게 조작하게 되므로, 일 단위 명단은
하나의 상단 캘린더로 묶고 월 단위 근태 탭은 공통 월 선택기로 분리한다.

Impact:
- `src/app/admin/attendance/roster`
- `src/components/admin/attendance/attendance-roster-client.tsx`
- `src/components/admin/attendance/attendance-subnav.tsx`
- `docs/product/05-admin-web-ia.md`
- `docs/product/24-attendance-workflow.md`

### Admin Dashboard Shared UI Contract — 공통 패턴 통일 필수

- 관리자 대시보드에서 반복되는 공통 UI는 페이지별 임의 변형이 아니라 **공유 계약**으로 취급한다.
- 특히 아래는 강한 공통 패턴으로 관리한다:
  - calendar chrome
  - date picker / month-week navigation
  - filter bar / search row
  - summary cards
  - tables
  - status badges
  - action bars
  - empty / loading / error states
  - right detail panels
  - pagination
- 출근자 명단, 예약, 근태, 급여, 교통비, 캘린더 등에서 같은 개념의 날짜 선택이나 필터 조작이
  서로 다른 구조/간격/동작으로 흩어지면 안 된다.
- 새로운 대시보드 페이지를 만들 때는 먼저 기존 공통 패턴을 재사용/확장하는지 확인하고,
  같은 역할의 UI를 새로 따로 디자인하지 않는다.
- 대시보드 공통 컴포넌트와 패턴은 **ko / ja / en 다국어 길이 차이**까지 포함해서 검토한다.

Why: 사용자는 대시보드 전반의 통일감을 매우 중요하게 보고 있다. 기능별로 따로 디자인하면
캘린더/날짜선택/필터/테이블 조작이 페이지마다 달라져 운영 콘솔 품질이 떨어지고, 이후 구현과
유지보수 비용도 커진다.

Impact:
- `AGENTS.md` / `CLAUDE.md` / `docs/planning/05-ai-collaboration-rules.md` 에 관리자 대시보드
  공통 UI 계약 규칙 추가
- 이후 관리자 대시보드 디자인/구현 작업은 공통 패턴 재사용 여부를 먼저 확인

## 2026-06-29

### Admin Dashboard — 리빌드 방향 확정

- 관리자 대시보드는 기존 `/admin` 구현을 부분 보수하는 수준이 아니라, **독립된 운영 콘솔 표면으로 재정리**한다.
- 모바일 앱과 대시보드는 **연결되지만 완전히 분리된 표면**이다. 모바일/태블릿은 `/mobile`,
  데스크톱/노트북은 `/admin` 을 사용한다.
- 대시보드는 단순 조회판이 아니다. **실행 + 관리 + 수정 + 검토 + 승인/반려 + export** 까지
  포함하는 완전한 관리자 표면으로 간다.
- 원칙적으로 **모바일에서 가능한 주요 기능은 대시보드에서도 가능**해야 한다. 다만 물리 장치
  제약이 있는 기능은 예외로 둘 수 있다.
- 확정된 예외: **QR 스캔 출퇴근 실행은 모바일 전용**. 대신 출근 사이트/QR 생성/재발급/보관/관리,
  근태 수동 생성/수정/무효화, 정정 검토, 급여/교통비 검토 및 export 는 대시보드에서 처리한다.
- `part_time_staff` 를 제외한 모든 역할은 대시보드 접근 가능 방향으로 간다. 단, 세부 기능 권한은
  지금 일괄 고정하지 않고 **모듈 구현 시점마다** 확정한다.
- 대시보드 디자인 구조는 **테이블 + 카드 + 우측 상세 패널** 이 섞인 운영 콘솔형으로 가되,
  **색상/브랜드 무드/기본 감성은 모바일과 통일**한다.
- 대시보드 안에 **실제 모바일 표면을 보여주는 핸드폰 프레임 뷰**를 둔다. 같은 계정으로 열리며,
  우측 패널과 전체 화면 오버레이 두 형태를 모두 지원한다.

Why: 사용자는 모바일 앱과 관리자 대시보드를 서로 연결되어 있지만 다른 제품 표면으로 운영하길 원한다.
대시보드는 백오피스 조회판이 아니라 실제 운영과 수정, 검토가 가능한 강한 관리 표면이어야 한다.

Impact:
- `docs/product/05-admin-web-ia.md` 를 관리자 대시보드 총괄 기준 문서로 재작성
- 기존 "admin web deferred" 전제는 대시보드 관련 기능 문서에서 순차적으로 제거/갱신
- 앞으로 기능 단위 작업은 `문서 -> 디자인 -> DB/백엔드 -> 프론트 구현` 순서로 진행

### Admin Dashboard Workflow — 짧은 활성 보드 방식 확정

- 관리자 대시보드 작업은 별도 활성 워크플로우 문서에서만 관리한다.
- 단계는 `Backlog -> Ready -> Design -> Build -> Verify -> Done` 6개만 사용한다.
- 완료된 항목은 활성 워크플로우에 오래 남겨두지 않고 제거한다.
- 완료 이력은 `docs/planning/06-current-status.md` 에 기록한다.
- 중요 결정은 계속 `docs/planning/01-decision-log.md` 에 남긴다.
- 한 번에 `Build` 로 들어가는 대시보드 대표 기능은 1개만 유지한다.

Why: 오래 걸리는 복잡한 워크플로우는 실제 진행 속도를 떨어뜨리고, 완료된 항목이 활성 보드에
쌓이면 지금 무엇이 진행 중인지 읽기 어려워진다.

Impact:
- `docs/planning/16-admin-dashboard-workflow.md` 신설
- dashboard active work / done record / decision record 역할 분리

### Admin Dashboard Design Kickoff — 로그인과 홈을 첫 화면으로 확정

- 관리자 대시보드 디자인 작업은 **로그인 화면**과 **홈 화면**부터 시작한다.
- 로그인 화면은 데스크톱 대시보드의 첫 진입 규칙, 브랜드 톤, 상태 처리 프레임을 고정한다.
- 홈 화면은 KPI/작업 허브/경고/운영 큐가 결합된 운영 콘솔 구조를 고정한다.
- 이후 기능 디자인은 이 두 화면의 헤더, 정보 밀도, 패널 진입 패턴을 기준으로 확장한다.

Why: 로그인과 홈이 먼저 고정되어야 이후 기능 화면의 밀도, 정렬 방식, 우선 정보, 전역 요소
(검색/조직 전환/알림/모바일 보기)의 위치가 흔들리지 않는다.

Impact:
- `docs/product/05-admin-web-ia.md` 에 로그인 화면 / 홈 화면 요구사항 추가
- `docs/planning/16-admin-dashboard-workflow.md` 의 `Design` 대상에 로그인 / 홈 화면 등록

### Complaints — 백엔드 권한·삭제 정책 확정

- 컴플레인 작성 권한 = developer_super_admin·owner·office_admin·cs_staff. 상태변경·삭제 권한은
  작성자 본인 또는 owner·office_admin·developer_super_admin. 댓글 작성은 part_time_staff 제외 전원.
- 컴플레인 본체는 hard-delete (MVP 정책), 댓글은 `deleted_at` soft-delete (공지/게시판 댓글 규약과 일치).
- `customer_complaints`/`complaint_comments` 가 생성 DB 타입에 없어 server-only 헬퍼에서 untyped
  Supabase 클라이언트 뷰로 접근. 타입 재생성 시 정리.

## 2026-06-25

### Announcements — redesign direction reset to notice-only flow

- Announcements are re-confirmed as a **simple official notice channel**, not a discussion surface.
- The feature should focus on **notice delivery only**. Free conversation, questions, and feedback belong
  in other modules (board / suggestions), not in announcements.
- **Comments are no longer part of the target product direction.** Existing comment support in the
  current implementation becomes legacy / cleanup scope for the later announcement refactor.
- Important announcements should open as a **mobile bottom sheet popup**, following the shared
  `BottomSheet` contract, rather than as a separate feature-specific modal pattern.
- Announcement images must support **mobile pinch-to-zoom** (two-finger zoom in/out and pan). The
  recommended structure is: bottom-sheet notice -> tap image -> dedicated zoomable image viewer.

Why: the user explicitly wants announcements to stay simple and announcement-centered. Mixing them with
discussion behavior weakens the channel and overlaps the board feature.

### Attendance / Payroll — transportation reimbursement planning direction confirmed

- Transportation reimbursement is planned as an **attendance/payroll-adjacent reimbursement module**, not as a generic request form.
- Scope is **all users** (staff and part-time staff alike). There is **no role-based evidence exception**:
  every reimbursable transport entry requires **at least one receipt/screenshot photo**.
- Storage principle follows the app-wide rule: **raw records are per-user**, while privileged admins can
  view both **per-user detail** and **organization-level monthly aggregates**.
- Submission model is a **per-user monthly ledger** (`one report per user per month`) with many line
  items, not one one-off form per receipt. Users may add items **daily or later in bulk**.
- UI direction: **list ledger**, not cards. The month screen must show **all entries at once** and a
  clear **monthly total amount**.
- Entry modes: both **linked** (derive context from attendance / cleaning history) and **manual**
  (user picks date and enters the item later) are required.
- `linked` does **not** mean "must be entered on the same day." It means the selected month's existing
  attendance/cleaning records are read later to generate candidate rows automatically.
- Context: building / room information should reuse the existing app context-linking patterns where
  possible, but those are **review-assistance context only**. The actual proof for reimbursement remains
  the attached receipt/screenshot images.
- Payroll principle: transportation reimbursement is **related to payroll operations** but must remain
  **separate from hourly gross wage calculation**. Dashboard and export should show `wages` and
  `transport reimbursement` as separate totals.
- Export target is a **clean Excel workbook** fit for office review: summary + detailed monthly sheets.

Why: the real workflow is monthly office submission with many evidence images, later review, and later
dashboard aggregation. A generic "request with up to 5 images" model does not fit this operating reality.

### 게시판 @멘션 기능 — 기획 확정

- 디자인: 옵션 E (바텀시트 + 검색, canonical `BottomSheet` 컴포넌트, scrim `z-[80]`)
- 다중 멘션 + @ALL 전체 멘션 지원 (@ALL은 최상단 고정행, 로케일별 라벨)
- 저장: `board_comments.mentioned_user_ids UUID[] NOT NULL DEFAULT '{}'` + `mention_all BOOLEAN NOT NULL DEFAULT false`, GIN 인덱스; 별도 테이블 미사용
- 알림: `mention_all=true`이면 `board_mention_all`만 발송 (개별 `board_comment_mentioned` 생략 — 중복 방지), 본인 제외
- 검색: 빈 쿼리 시 가나다순 상위 20명 (추후 최근 활동 기반 전환 검토), prefix 매칭, 디바운스 200ms
- 보안: `mentioned_user_ids` 각 UUID의 같은 org 활성 멤버 여부는 서버 액션 레벨 검증 (RLS 미적용)
- 댓글 백엔드(`addBoardComment`)와 한 사이클에 묶어 구현

### Bug Report / Problem Report — 1차 구현 확정 (2026-06-25)

- 라우트 `/mobile/bugs` (디자인 결정에 맞춰 `/mobile/bug-reports` 권장 변경)
- 리뷰어: `owner`, `office_admin` (1차 확정); `cs_staff`는 open question deferred 유지
- admin web 페이지 (`/admin/bug-reports`) 1차 deferred — 리뷰어는 모바일에서 통합 처리
- 수정 페이지 (`/mobile/bugs/[id]/edit`) 1차 deferred — 작성자는 `status='submitted'`일 때만 삭제 가능, 수정 버튼 1차 숨김
- 알림 타입: `bug_report_activity`; `created` → 리뷰어 전원, `status_changed` → 작성자 (actor 제외)
- 스토리지: `request-images` 버킷 재사용, path `{org_id}/bug-reports/{report_id}/{file}`

### Bug Report / Problem Report — 기획 방향 확정

Decision: 버그신고 기능은 **StayOps 앱 자체의 문제/버그 신고** 용도로 정의한다. 현장 운영 문제나 건물/객실 이슈를 다루는 요청 기능이 아니다.

확정 사항:
- **성격**: StayOps 사용 중 발견한 앱/시스템 문제 신고
- **대상 예시**: 화면 오작동, 버튼 무반응, 잘못된 데이터 표시, 권한 오류, 알림 오류, 심한 성능 문제
- **비대상**: 건물/객실 문제, 청소 품질 이슈, 비품 요청, 일반 건의/의견
- **1차 신고 폼**: `제목` + `설명` + `사진 첨부(선택)`만 받는 최소형
- **제외**: 댓글, 카테고리, 심각도, 재현절차, 기대결과/실제결과 입력
- **분리 기준**:
  - `Maintenance` = 현실 시설/현장 문제
  - `Staff Suggestions` = 사람 대상 피드백/의견
  - `Bug Report` = StayOps 제품 문제
- **디자인 작업**: 사용자가 직접 진행 후 핸드오프

Why: 사용자가 명확히 "앱에 대한 문제나 버그를 신고하는 곳"이라고 범위를 확정했다. 이 구분이 없으면 Maintenance/제안함과 기능 목적이 섞인다. 또한 1차는 최대한 심플해야 하므로 신고 입력 항목을 최소화한다.

Impact:
- 신규 기획 문서 `docs/product/25-bug-report-workflow.md` 는 앱 버그 신고 기준으로 유지
- 신규 기술 문서 `docs/engineering/13-bug-report-technical-design.md` 는 같은 기준으로 설계
- UI/UX 시안은 본 프로젝트 문서에서 구조만 정의하고, 실제 디자인은 사용자 핸드오프를 기다림

### Board (자유 게시판) — 기능 기획 확정

Decision: 기존 "Internal Board" 스켈레톤(product `20`)을 폐기하고 자유 게시판으로 전면 재기획.

확정 사항:
- **성격**: 전 직원(아르바이트 포함)이 글을 쓰는 수평적 자유 게시판. 공지사항(Announcements, 관리자 전용)과 완전히 분리.
- **작성 권한**: 모든 조직 멤버 (part_time_staff 포함).
- **기능 범위**: 글 작성(제목 선택, 본문 필수, 이미지 최대 5장, 자유 태그), 이모지 반응(👍❤️😂😮😢 — 토글, 이모지별 1회), 댓글(이미지 최대 3장, 소프트 삭제), 관리자 고정(pin), 읽음 추적.
- **태그**: 작성자가 자유 입력(해시태그식). 별도 카테고리 관리 테이블 없음.
- **수정/삭제**: 작성자 본인 + office_admin/owner.
- **UI/UX 디자인**: 사용자가 직접 진행 후 핸드오프.

Why: 기존 스켈레톤은 방향이 불명확한 상태였으나, 공지사항과의 역할 분리 + 전 직원 소통 공간에 대한 명확한 요구가 확인되어 신규 기획으로 대체.

Impact:
- DB 테이블 4개 신규 설계: `board_posts`, `board_post_reads`, `board_comments`, `board_reactions`.
- 알림 타입 추가: `board_post_commented`, `board_comment_replied`.
- 네비게이션: 사이드 메뉴 추가, 하단 탭 커스터마이징 목록 포함.
- 전체 기획 문서: `docs/product/23-board-workflow.md`.

### Board (자유 게시판) — 기능 출시 (Page 1–3 구현 완료)

2026-06-25: Board feature shipped — Composer(글쓰기) + Feed(피드, 커서 페이지네이션·태그 필터·안읽음 뱃지) + Detail(상세·반응·댓글·고정·삭제·읽음·공유) 구현 완료. 마이그레이션 `202606250001_board.sql`(테이블 4 + RLS + `board-attachments` 버킷) · `202606250002_board_notification_type.sql`(`board_activity` 알림) 적용 완료. 임시 `board-i18n.ts` 폐기 후 `i18n.ts`로 통합. 댓글 정렬 등록순·피드 커서 페이지네이션 확정, 댓글 본문 필수(이미지 전용 불가, `board_comments.content` CHECK). 글 수정 폼은 Page 4로 분리(서버 액션 `updateBoardPost`는 구현). 계획된 `board_comment_replied` 알림은 미구현(후속). 상세: `docs/product/23-board-workflow.md`.

## 2026-06-24

### Notifications — first bell-alert scope is eight action-focused event groups

Decision: the first real in-app bell-notification scope is limited to eight operational event groups:

- important announcement published
- task shared with me
- task comment / update
- task due today
- task overdue
- order processed / delivery date updated
- attendance correction approved / rejected
- attendance abnormal session / 18:30 open-session reminder

Why: the notification center should surface events that require user action or immediate awareness,
not a noisy activity feed. This keeps the first rollout useful for field staff and admins without
teaching users to ignore the bell.

Impact:
- `/mobile/notifications` is wired to the live `notifications` table instead of the old mock screen.
- `announcement_activity` is added for important announcement publish alerts only.
- `attendance_activity` expands to include worker-facing correction approval / rejection results.
- Lower-value or high-frequency events (normal announcement publish, every attendance success,
  cleaning timer chatter, etc.) remain deferred.

## 2026-06-23

### Routing — separate mobile app and admin dashboard surfaces

Decision: the mobile app (`/mobile`) and admin dashboard (`/admin`) are treated as separate product
surfaces, not responsive variants of the same screen. Mobile/tablet requests must not render admin
dashboard pages. When a mobile request reaches `/admin*` directly (including in-app browsers such as
KakaoTalk) or carries `next=/admin*` through auth/onboarding/OAuth, the destination is normalized to
`/mobile` before the admin page renders.

Why: field app access from shared links, KakaoTalk, or OAuth callbacks could preserve `/admin` as the
destination and display the desktop dashboard in a narrow mobile viewport. That breaks the product
model: the app is for field execution, while the dashboard is for desktop oversight.

Impact:
- Middleware redirects mobile `/admin*` requests to `/mobile`.
- Auth login, Google callback, password reset, and onboarding completion normalize mobile
  `next=/admin*` to `/mobile`.
- Mobile app routes that cannot resolve an organization context redirect to
  `/mobile/unavailable`, not `/admin`, so mobile exceptions never escape into the dashboard
  surface or create `/mobile` <-> `/admin` loops.
- The route boundary is based on user agent plus `Sec-CH-UA-Mobile` where available.

### Auth QA — remove local test-login shortcut

Decision: the local dev seed-login shortcut has been removed from the product and development login
flow. `/auth/login` now exposes only real Google and email/password authentication, and
`/api/dev/seed-login`, `src/lib/dev-auth.ts`, and the unused `DevEntry` component have been deleted.

Why: internal rollout testing now uses real user accounts and invite-code onboarding. Keeping a
one-click test login on the public login surface created confusion and could hide real-auth defects.

Impact:
- The bottom "테스트 로그인 (Stay Ops E2E Admin)" block no longer renders.
- Seed test accounts are no longer auto-created or signed in by an app route.
- Local maintenance-only dev endpoints keep a separate `ENABLE_LOCAL_DEV_TOOLS` gate; that gate is
  not an authentication shortcut.

## 2026-06-18

### Onboarding — wire to backend with minimal-wiring scope (keep current page)

Decision: When connecting the finished auth/onboarding design to the real backend, the onboarding step is wired **in place** on the existing `/onboarding` page rather than rebuilt into the new mobile design previews. The profile form gains the required `birthDate` field, and the invite step gets a real **verify → preview → confirm** flow.

Why: The new mobile design only contains onboarding *preview/intro* screens (`view=onboarding`, `view=invite`) inside `/auth/login`; the actual profile-entry form was never designed. Rebuilding `/onboarding` into the new language would require designing an undelivered screen and is out of scope. Minimal wiring unblocks the flow now (onboarding was broken: `completeProfile` required `birth_date`, which the form never collected, so users looped on `needs_profile`).

Impact:
- `birthDate` (`<input type="date">`) added to the `needs_profile` form.
- New read-only `previewInviteCode` server action resolves target org name + user-facing role category (`roleToInviteCategory`, never raw DB slug) so org + role are shown before final join — honoring the documented "validate first, then preview, then activate" rule.
- Profile/join forms extracted to client components (`onboarding-forms.tsx`) + shared `invite-code-field.tsx`.
- Pre-auth `stayops_locale` cookie is read on `/onboarding` so the chosen language survives login → callback → onboarding.
- The dead `view=onboarding` / `view=invite` preview branches were removed from `/auth/login`; the `auth.gating.*` i18n keys remain (harmless, unreferenced).
- Deferred: rebuilding `/onboarding` into the mobile design, a multi-org switcher UI, and invite validity/usage figures in the preview.

### Auth backend — remove `isDevSeedLoginEnabled()` gate from email auth actions

Decision: `isDevSeedLoginEnabled()` checks that blocked `signInWithEmailPassword`, `signUpWithEmail`, and `requestPasswordReset` in `src/app/auth/actions.ts` have been removed. Dev seed login is display-only (login page shows the dev buttons when the env flag is set); it must not prevent real email auth in development.

Why: the guards blocked all real email sign-in/signup/reset while `ENABLE_DEV_SEED_LOGIN=true`, making it impossible to test the real email auth flow locally without toggling the env var.

Impact: `isDevSeedLoginEnabled` import removed from `actions.ts`. Superseded on 2026-06-23: dev seed login buttons and the `/api/dev/seed-login` route were removed entirely.

### Auth backend — single consistent route-state model for password reset

Decision: all reset redirects use `?view=email&mode=reset` (reset form) and `?view=email&mode=new_password` (set-new-password form). The previous `?view=reset` and `?view=new_password` routes (which didn't match any case in `page.tsx`) are replaced.

Why: the `requestPasswordReset` and `updatePassword` actions were redirecting to query-string states that the login page did not handle, resulting in the main auth entry screen appearing instead of the expected form after a reset link click.

Impact: `requestPasswordReset` errorBase changed; Supabase callback target updated; `updatePassword` errorBase changed; `page.tsx` gained `view=email&mode=new_password` (set new password), `view=email&mode=signup&sent=verify` (verification sent), and `sent=password_updated` success banner.

### Desktop root routing — `DevEntry` removed

Decision: `src/app/page.tsx` now redirects desktop requests to `/auth/login` instead of rendering `DevEntry`. The `DevEntry` component import is removed.

Why: `DevEntry` was a temporary development entry point. The product contract is mobile → `/mobile`, desktop → admin dashboard. Redirecting to `/auth/login` is the correct first step since the login page already handles onboarding state routing.

Impact: `DevEntry` import and render removed from `page.tsx`; OAuth callback passthrough preserved.

## 2026-06-16

### Todo Recurrence — switch to Todoist-style single live task (no pre-materialization)

Decision: Recurring Todo tasks are no longer pre-materialized into one `tasks` row per date across a
window. A recurring task is a **single live row** that **rolls forward to its next occurrence on
completion** (and rolls back on undo); the **calendar shows future occurrences as virtual previews**
computed from the rule (display only, no DB rows).

Why: the previous window-materializer flooded the date-agnostic tabs (관리함/공유함) with
duplicate-looking entries (a daily task generated ~50 rows). This is the standard Todoist model and
is storage-efficient (one row per series; previews computed only for the visible month).

Impact:
- `materializeRecurringTasks` deprecated and removed from all read paths; `completeTask` /
  `reopenTask` now roll the series date forward/back.
- One-time cleanup migration `202606160002_collapse_recurring_instances.sql` collapsed existing
  instances to one row per series (applied; 98 rows removed in the dev project).
- See `docs/product/18-todo-task-workflow.md` → Recurring Tasks (As-built 2026-06-16).

### Staff Suggestions / Feedback Box — First-Slice Planning Refinement

Decision: The first Staff Suggestions slice will remain a structured person-directed feedback workflow, not a discussion board and not a public visibility feed. Scope is:

- one required recipient
- optional referenced users
- `Sent / Received / Referenced` lists
- status lifecycle: `submitted` -> `reviewing` -> `on_hold` -> `completed`
- recipient-only status ownership
- participant comments with photo attachments
- notifications for create / reference / status / comment

Additional rules:

- the author may edit/delete the main suggestion only while status is `submitted`
- the recipient is the only user who can change status
- referenced users can read and comment only
- `on_hold` requires a hold reason
- `completed` requires a completion note
- comments stay available at every status and comment edit/delete is comment-author only

Deferred:

- anonymous posting
- broad organization-wide visibility
- votes / reactions
- non-photo attachments
- admin-only moderation flow

Reason:

- keeps the feature distinct from the Internal Board
- keeps confidentiality tied to explicit participants
- makes ownership clear by assigning status to the recipient only

Consequence: Product `22`, tech-design `12`, user-role notes, data-model notes, and RLS guidance must stay aligned with this first-slice rule set.

Status: Planned direction confirmed for design (2026-06-16)

## 2026-06-18

### Auth / Signup / Organization Join Policy Reset

Decision: the login/onboarding policy was redefined before implementation changes. The product now
targets the following auth model:

- Support **Google login/signup** and **standard email + password signup/login**
- Remove **email magic-link** from the product plan
- Treat Google as an **authentication method only**
- Do **not** import Google profile name/phone into StayOps operational profile fields

Required onboarding fields after authentication:

- name
- date of birth
- phone number
- preferred language
- team invite code

Rules:

- Authentication alone does not grant app access
- Users without a valid team invite code cannot use any StayOps features
- Incomplete users must always return to onboarding
- Email signup requires email verification
- Password reset uses reset-email flow
- Password policy: minimum 8 chars, letter + number required, special char optional
- Email login attempts should be temporarily rate-limited after repeated failures

Identity rules:

- The same email address maps to a single StayOps account
- Google and email/password should attach to the same account when the email matches
- Phone number is account-level unique
- If signup is retried on an incomplete account, resume onboarding instead of creating a duplicate account

Invite-code rules:

- Team invite code determines **organization + signup role category**
- Signup categories:
  - Part-time Staff
  - Office Staff
  - Field Staff
  - Part-time Staff (Manager)
  - Owner
- `Owner` invite code is one-time only
- All other invite codes are multi-use with:
  - 3-month validity
  - max 100 joins
- Invite-code success should show the resolved organization and role before final join

Organization rules:

- A user can belong to multiple organizations
- Login should auto-enter the last-used organization
- Organization switching is in-app, not on every login
- Joining an additional organization uses a new team invite code only (no need to re-enter full profile)
- If signup is retried on an incomplete account, the app should route the user to sign in and continue that same onboarding flow instead of creating a duplicate account
- `removed` membership is blocked by default, but the user may explicitly enter a re-join flow with another valid team invite code; `suspended` remains hard-blocked

Organization-creation rules:

- The first person who creates an organization becomes that organization's first owner
- Not everyone can freely create organizations
- New organization creation requires an allowed organization-creation path/code
- Until dashboard management exists, the initial organization / first owner / initial invite codes are
  bootstrapped manually in the database
- The mobile onboarding flow must not expose a self-claim path for `developer_super_admin`; platform admin bootstrap remains an operational path, not a public onboarding action

Data / account rules:

- Name is organization-visible by default
- Phone number is private by default
- Date of birth is private by default and viewable only by the user plus tightly limited admin access
- Gender is stored for payroll/employment record use and is private by default
- Users may edit name / date of birth / phone number later
- Team invite code is not editable after join
- Organization leave and full account deletion are separate actions
- Account deletion requires re-authentication and should preserve operational records while removing
  account access

Status: Confirmed planning baseline (2026-06-18). Implementation and schema cleanup still pending.

## 2026-07-03

### Onboarding Gender Field

Decision: Add `gender` to the onboarding-required profile capture flow and store it on `profiles`.

Reason:

- Payroll and employment record flows need a stable profile-level gender field rather than ad hoc export-only data.
- The onboarding wizard is already the place where identity-grade profile fields are collected.
- Existing active users should not be forced back into onboarding just because this field was added later.

Rules:

- New onboarding submissions must provide `gender`.
- Allowed values are currently limited to `female` and `male`.
- `profiles.gender` stays nullable for legacy accounts.
- Legacy accounts should be guided to fill missing profile fields from `/account`, not forced back through onboarding.
- `gender` is private by default and not shown to teammates in normal directory surfaces.
- UI copy remains fully multilingual (`ko`, `ja`, `en`) with no hardcoded visible strings.

Status: Implemented in onboarding + schema/docs sync

## 2026-05-04

### Project Name

Decision: Use `StayOps` as the working project name.

Reason:

- Works better than a hotel-only name if the app later expands to ryokan, motel, pension, guesthouse, residence, or serviced apartment operations.
- Short and easy to use in Korean, Japanese, and English contexts.

Status: Working decision

### Initial Languages

Decision: Support Korean, Japanese, and English.

Status: Confirmed

### Multilingual Implementation Priority

Decision: Korean, Japanese, and English should all be supported from the first implementation. Do not build Korean-only UI first and translate later.

Implementation note:

- Initial app UI localization is centralized in `src/lib/i18n.ts`.
- Korean remains the default fallback, but production UI should not rely on Korean-only hardcoded component strings.
- Authenticated screens should use the user's `profiles.preferred_language` value.

Status: Confirmed

### Language Selection

Decision: Users select their app language during signup and can change it later from My Profile.

Status: Confirmed

### Signup Required Information

Decision: Signup requires name, email or social login, language selection, invitation link or invite code, and phone number. Age and profile photo are optional after signup.

Status: **Superseded by 2026-06-18 auth reset** — current target fields are name, date of birth,
phone number, preferred language, and team invite code.

### Social Login Profile Completion

Decision: Social login may prefill email, name, and profile photo when available, but users must confirm or enter missing required fields. Prefilled profile information should be editable.

Status: **Superseded by 2026-06-18 auth reset** — Google profile data should not auto-fill StayOps
operational profile fields.

### Product Type

Decision: Native app for hotel operations, used by both field staff and office/admin staff.

Status: Confirmed

### Initial Users

Decision: Start with the company's own office staff, on-site staff, and part-time staff.

The product will be tested and improved through internal real-world use before considering public release.

Status: Confirmed

### Initial Business Model Context

Decision: The first operating environment is a mix of hotel operations and Airbnb-style property operations.

Status: Confirmed

### Property Structure

Decision: StayOps must support both multi-room buildings and standalone house-style properties.

Status: Confirmed

### Beds24 Integration

Decision: StayOps should integrate with Beds24 because the company uses Beds24 as its channel manager and already has an internal system using the Beds24 API.

Primary goal:

- Bring reservation, occupancy, availability, room, and property schedule data into StayOps.

Status: Confirmed as required, detailed implementation TBD

### Existing Internal System Stack

Decision: The current internal system is a web app with multiple API automations and uses Firebase, React Native, and Node.js.

Integrated services include:

- Google Sheets
- Notion
- Slack
- Beds24

Status: Confirmed

### Relationship to Existing Internal System

Decision: StayOps can be designed separately from the existing internal system.

Reason:

- The existing internal system focuses on price updates, occupancy, sales, inventory-related operations, and automation.
- StayOps focuses on on-site staff work, communication, tasks, schedules, and field operations.
- StayOps does not need to inherit the existing system's technical stack by default.

Status: Confirmed

### Client Platforms

Decision: StayOps needs both a native mobile app and an admin web app.

Reason:

- On-site staff and part-time staff need a fast mobile workflow.
- Office/admin users need a web interface for management, oversight, calendar work, and operational control.

Status: Confirmed

### First Mobile Workflow Priorities

Decision: The most important mobile workflows are maintenance issue registration, lost item registration, cleaning start/completion with timer, order/supply requests, and announcements.

Attendance and clock-in/out are excluded because another app already handles them.

Status: Confirmed — **the attendance/clock-in-out exclusion was reversed on 2026-06-09. See "2026-06-09 / Feature Batch Scope Decision → Attendance / Clock-In-Out + Payroll" below. The rest of this priority list still stands.**

### Cleaning Assignment Scope

Decision: Cleaning staff/personnel assignment is excluded from StayOps first scope because a separate system is already used for that.

StayOps should focus on cleaning execution tracking: start, timer, completion, and room/property record.

Status: Confirmed

### Authentication Methods

Decision: StayOps should support email login and Google login. Apple login is desirable, especially for iOS.

Status: Confirmed, implementation details TBD

### Signup and Google First-Login Policy

Decision:

- StayOps must provide an explicit signup flow in addition to login.
- Google login is an authentication entry only; first-time Google users are not considered fully onboarded.
- After Google auth succeeds, users must complete required member profile fields before app access is granted.
- Required profile fields after Google auth: name, phone number, preferred language, and invite code (or valid invite link) according to onboarding policy.
- If Google provides prefilled values (for example name/email), users can edit them and must confirm completion.

Status: Confirmed (2026-06-02)

### Organization Model

Decision: StayOps must support company/workspace separation from the beginning.

Reason:

- The company currently has about 10 employees and more than 40 part-time staff.
- More users will be added over time.
- Future public release requires each company/customer to have separated data.

Status: Confirmed

### Staff Onboarding

Decision: Recommended onboarding approach is invite-based plus invite-code support.

Reason:

- Admin email invitations are safer for employees and managers.
- Invite codes are convenient for part-time staff and larger onboarding.
- Admin approval and role assignment should protect access.

Status: Recommended

### Initial Role Structure

Decision: Use the following initial roles:

- Developer/Super Admin
- Owner
- Office Admin
- CS Staff
- Field Manager
- Staff
- Part-time Staff

Maintenance responsibility belongs under Field Manager rather than a separate role for the first version.

Status: Confirmed

### Part-Time Staff Data Access

Decision: Part-time staff can see all guest/reservation information except price/revenue-related information.

Reason:

- Field work requires visibility into room/property and guest information.
- Price and revenue information is not needed for part-time field work.

Status: Confirmed

### Check-In and Check-Out Rules

Decision: Default check-in time is fixed at 16:00. Default check-out time is 10:00.

Early check-out can change the expected check-out time by about 1 to 3 hours and must be entered manually by CS staff because this information is received through direct guest communication.

Status: Confirmed

### Current Property Names

Decision: Current known properties are Arakicho A, Arakicho B, Kabukicho, Takadanobaba, Okubo A, Okubo B, and Okubo C.

Status: Confirmed as current working names

### Upcoming Hotel Property

Decision: A larger hotel-style building is expected around July with about 26 rooms, but the name, room numbers, and detailed structure are not decided yet because it is still under construction.

Status: Known future requirement

### Admin Web Core Areas

Decision: The admin web app must treat calendar/occupancy, check-in/check-out, cleaning status, maintenance, lost and found, order/supply requests, and announcements as core frequently used areas.

Staff management and inventory are also important admin areas.

Status: Confirmed

### Cleaning Timer Behavior

Decision: Cleaning staff select a room/property, tap start cleaning, tap complete cleaning, and StayOps records total cleaning duration.

One staff member may clean up to about 2 rooms/properties per day.

Status: Confirmed

### Cleaning-Linked Issue Reporting

Decision: During an active cleaning record, staff should be able to report lost items and maintenance issues without leaving the cleaning context. The created records should automatically link to the cleaning record, property, and room/unit.

Status: Confirmed

### Cleaning Photo Strategy

Decision: Completion photos are useful, but uploading about 30 photos per room may create high server/storage cost.

MVP recommendation:

- Do not require bulk completion photo upload.
- Use optional compressed photos for issue evidence.
- Prefer photos on lost item or maintenance reports instead of normal cleaning completion.

Status: Recommended

### Maintenance Request Fields

Decision: Maintenance requests need room/property, problem description, photos, priority, reporter, processing status, and memo.

Status: Confirmed

### Maintenance Categories

Decision: Initial categories are electric, water, air conditioning/heating, Wi-Fi, furniture, appliance, cleaning condition, supplies, damage, and other.

Status: Confirmed

### Maintenance Meaning

Decision: Maintenance is not limited to broken items. It also covers missing items, operational issues, and anything part-time staff cannot resolve themselves.

Status: Confirmed

### Lost and Found Fields

Decision: Lost item records need found property/room, item name, photos, found date/time, reporter, guest/reservation link, retrieval tracking, memo, and status.

Storage location is not required for MVP.

Status: Confirmed

### Lost and Found Auto-Fill Rules

Decision: Lost item creation should use different auto-fill behavior depending on entry point.

From active cleaning timer:

- Property/room auto-filled from the active cleaning room.
- Found date/time auto-filled from registration time.
- Reporter auto-filled from current user.
- Guest/reservation auto-suggested from that room's checkout guest when available.
- Before final submit, show a confirmation popup asking whether the auto-filled room is correct.
- Provide a pencil/edit action for correction.

From Lost and Found tab:

- User selects property/room manually.
- After room selection, app shows the most recent checkout guest for that room as suggested reservation/customer link.
- User can edit or clear the suggested link.
- Found date/time and reporter remain auto-filled.

Status: Confirmed

### Lost and Found Retrieval Meaning

Decision: Retrieval means the customer/guest has picked up or received the lost item.

It does not mean staff internally collected the item from the room.

Status: Confirmed

### Lost and Found Retrieval Processing

Decision: Retrieval processing does not need a detailed required form in the first version.

The staff member who gives the item to the guest or arranges shipment can mark the item as retrieved. The app should record who processed retrieval and when.

Status: Confirmed

### Order Request Flow

Decision: Staff/part-time staff create order requests. Office Admin reviews and approves or rejects. If rejected, the requester receives a notification with the rejection reason. If approved, Office Admin orders/prepares the item and marks it as ordered/completed. The requester receives a notification when ordering is completed.

Status: Confirmed

### Order Request Fields

Decision: Order requests require property/building, item name, quantity, optional photo, optional product/reference URL, optional reason, requester, status, and memo.

Order requests are property/building-level, not room-level.

Status: Confirmed

### Inventory Scope

Decision: Inventory management is not included in the first MVP because the detailed requirements are not decided yet.

It should remain documented as a future module.

Status: Confirmed

### Cleaning Overdue Notification

Decision: Cleaning normally starts around 10:00 and should be completed by 16:00 at the latest. If a cleaning timer is still in progress after 16:00, StayOps should send one overdue notification to the responsible staff and manager/admin recipients.

Status: Confirmed

### Mobile Internal Distribution

Decision: StayOps must be usable on both iPhone and Android before public store release.

Public App Store / Google Play release is not planned immediately, but the app should be designed for future release.

Status: Confirmed

### Developer Account Status

Decision: The company does not currently have Apple Developer or Google Play Console accounts.

These accounts must be prepared before reliable internal iOS/Android distribution.

Status: Confirmed

### Initial Cost Constraint

Decision: StayOps must start as free/low-cost as possible.

Apple Developer account will likely not be created immediately and should be prepared later before native app release.

Status: Confirmed

### Initial Platform Strategy

Decision: Because the project must start free/low-cost and Apple Developer account is not available yet, the first implementation should strongly consider PWA-first.

Native Expo app can be considered later before store release or when stable native mobile push becomes necessary.

Status: Recommended

### Initial Hosting

Decision: Use Vercel for the initial internal PWA/admin web deployment. Company domain can be connected later if available.

Status: Confirmed

### Reservation Calendar Requirements

Decision: Beds24 reservation calendar must show date, property/building, room/unit, guest name, check-in date, check-out date, number of guests, and whether there is an empty room/property for the selected day.

Mobile must include a TimeTree-like monthly calendar by property/building, plus separate views for today's check-ins, today's check-outs, guests staying today, and empty rooms/properties.

Status: Confirmed

### Reservation Calendar Date Range

Decision: StayOps reservation calendar only needs current month plus the next 2 months for MVP.

Historical data from 2022 onward is available in the existing internal system but does not need to be shown in StayOps.

Status: Confirmed

### Beds24 Webhook Strategy

Decision: Use Beds24 webhooks instead of frequent polling/scheduled sync as the primary reservation update strategy.

Reason:

- Better real-time behavior.
- Avoid unnecessary server/API cost.
- Beds24 official documentation supports booking webhooks and recommends avoiding high-frequency GET calls.

Status: Confirmed as preferred strategy

### Reservation Status Visibility

Decision: Show only confirmed/valid reservations in the reservation calendar. Cancelled reservations should be removed from the visible calendar and should not count as occupied.

Status: Confirmed

### Reservation Memo Visibility

Decision: Beds24 reservation notes/memos are not required in the MVP reservation calendar or reservation detail popup.

Status: Confirmed

### Empty Room Definition

Decision: A room/property is considered empty on a date when there is no reservation bar on that date. Cleaning status is not part of the empty-room calculation for MVP.

Status: Confirmed

### Earliest Empty Availability List

Decision: StayOps should include a list that shows the earliest empty availability from today onward, including today. Users can view this for the selected property/building or for all properties/buildings. When all properties are selected, show the earliest empty availability per property/building.

Status: Confirmed

### Mobile Bottom Navigation

Decision: Use five mobile bottom tabs: Home, Calendar, Cleaning, Requests, and Announcements.

Home includes quick actions for start cleaning, maintenance issue, lost item, and order request.

Status: Confirmed

### User Profile and Directory

Decision: Users need a My Profile feature to edit their own basic information such as name, age, and phone number. StayOps also needs a user directory where organization members can see all registered members and call them with a phone button.

Status: Confirmed

### Admin Web Navigation

Decision: Use the following admin web sidebar for MVP: Dashboard, Calendar, Check-In/Out, Cleaning, Maintenance, Lost & Found, Orders, Announcements, Todoist, Users, Settings.

Inventory is excluded from MVP navigation and remains a future module.

Status: Confirmed

### Mobile Home Priority

Decision: Mobile Home should show active cleaning timer first, then important/popup announcements, today check-in/check-out summary, quick action buttons, and today's my activity records.

Today's my activity records are automatically created from user actions such as cleaning start and cleaning completion.

Status: Confirmed

### Cleaning Room Selection

Decision: Cleaning start should primarily select room/property from today's check-out list. Search-based property/room selection should also be available as a secondary method.

Status: Confirmed

### Cleaning Completion Confirmation

Decision: When staff taps Complete Cleaning, show a confirmation popup before final completion. The popup should show room/property, cleaning start time, and approximate elapsed time. Special notes are optional and not required.

Status: Confirmed

### Cleaning Timer Shortcuts

Decision: Active cleaning timer screen should show shortcuts for lost item registration, maintenance issue registration, special note, and cleaning completion. Lost item and maintenance records created from the timer must also appear in the normal Requests tab/admin web lists.

Status: Confirmed

### Cleaning Record Export

Decision: Office/admin users and Field Manager or higher roles need to export cleaning records as Korean Excel or PDF files. Exports should include who cleaned which room/property, when, and total duration.

Status: Confirmed

### Request Visibility

Decision: Maintenance requests, lost item records, and order requests can be created and viewed by all users. The mobile Requests tab should also include a "My registrations" view for records created by the current user.

Status: Confirmed

### Request Status Change Permission

Decision: Request status changes are allowed for Field Manager, Admin, Office Staff, and Staff roles in general. Part-time Staff cannot change statuses.

Order request approval/rejection/ordered processing is more restricted: only Office Staff, CS Staff, Admin, Owner, and equivalent office-level roles can process order request statuses.

Status: Confirmed

### CS Order Request Permission

Decision: CS Staff is treated as office-level for order request processing in MVP.

Status: Confirmed

### Request Edit and Delete Permission

Decision: Any user can edit/delete records they created. Part-time Staff can only edit/delete their own records.

Status: Confirmed

### Delete Behavior

Decision: User-triggered deletion should be hard delete in MVP. A confirmation popup must be shown before deletion.

Status: Confirmed

### Photo Upload Limits

Decision: Maintenance requests, lost items, order requests, and announcements can each support up to 5 photos/images.

Cleaning completion photo upload is deferred for MVP. If the company later accepts storage cost for public release or expanded internal use, cleaning completion may support up to about 30 photos per room.

Status: Confirmed

### Image Compression Policy

Decision: Images should be automatically resized and compressed before upload for MVP.

Recommended settings:

- Long edge max 1600px
- JPEG/WebP compression
- Quality around 70-80%

If the company later accepts higher storage/bandwidth cost, image quality can be upgraded.

Status: Confirmed

### Offline Scope

Decision: MVP does not include full offline mode. The app should instead handle network errors clearly, prevent accidental form loss where possible, and retry failed saves/uploads where practical.

Status: Confirmed

### Mobile Reservation Calendar Layout

Decision: The mobile monthly calendar should use a date-based month view with reservation bars inside date cells. Tapping a reservation bar opens guest/reservation details.

Status: Confirmed

### Reservation Bar Display

Decision: Reservation bars should display guest name and number of guests only. Tapping the reservation bar opens a popup/detail panel with full guest and reservation information.

Status: Confirmed

### Reservation Phone Actions

Decision: Reservation detail popup should support both copying the phone number and calling the phone number.

Status: Confirmed

### MVP Organization Creation Flow

Decision: Use the recommended MVP organization onboarding flow.

Rules:

- Only Developer/Super Admin can create organizations during MVP.
- General users cannot create companies/workspaces by themselves.
- Employees join by email invitation.
- Part-time staff join by invite code.
- Owner/Office Admin can manage invitations, invite codes, roles, and deactivation.

Status: **Superseded by 2026-06-18 auth reset** — target rule is organization creation through an
allowed organization-creation path/code, with the first creator becoming the first owner.

### Invite Code Policy

Decision: Invite codes should support code name, default role, expiration date, maximum uses, and active/inactive status.

Recommended default role for part-time onboarding is Part-time Staff.

Status: Confirmed

### Post-Login Routing

Decision: Use one account system with role-based default routing and mode switching.

Default route:

- Developer/Super Admin, Owner, Office Admin, and CS Staff enter admin web.
- Field Manager, Staff, and Part-time Staff enter mobile field home.

Mode switching:

- Admin-capable roles can switch between admin mode and field mode.
- Staff and Part-time Staff only access field mode.

Status: Confirmed

### Order Request Item Input

Decision: Order item names should be free-text input rather than fixed catalog selection for the first version.

Reason:

- Amenities and supplies vary too much.
- New items may need to be requested depending on situation.

Status: Confirmed

### Order Request Price Scope

Decision: Order request MVP should not include price, estimated cost, unit cost, cost center, or budget fields.

Reason:

- Requesters should be able to submit quickly from the field.
- Price-related work is not needed for the initial order request workflow.
- Product/reference URL is enough when the requester knows where the item can be purchased.

Status: Confirmed

### Order Request Non-Scope

Decision: Order request MVP should not include payment, shipping, delivery tracking, arrival tracking, courier, tracking number, or receiving/stock-arrival workflows.

Reason:

- The feature exists so field staff can ask the office for needed supplies/items.
- The important information is which property/building needs what item, how many, and who requested it.
- Purchasing, payment, and delivery details are outside the first workflow.

Status: Confirmed

### Order Request Multiple Items

Decision: One order request can include up to 40 requested item rows.

Rules:

- Each item row should at minimum support item name and quantity.
- Optional URL/photo/reason/memo can be included without making the requester-side UI feel like a spreadsheet.
- Requester-side UX must stay simple despite supporting multiple items.

Status: Confirmed

### Order Request Requester Simplicity

Decision: Order request screens should preserve full workflow functionality while keeping the requester-side experience simple and low-friction.

Rules:

- Requester creates a quick request with property/building, item name, quantity, optional URL, optional photo, optional reason/memo.
- Office-level roles handle approve/reject/ordered processing.
- Office-side workflow can show more actions, but requester-side screens should not look like purchasing/admin forms.

Status: Confirmed

### Announcement Write Permission

Decision: All roles except Part-time Staff can create announcements.

Status: Confirmed

### Announcement Targeting

Decision: Announcements should support everyone, specific property/building, specific role, and combined targeting.

Status: Confirmed

### Announcement Features

Decision: Announcements need read tracking, important/pinned settings, comments, up to 5 images, and optional app-open popup display.

Status: Confirmed

### Announcement Comment Permission

Decision: Users who can view an announcement can comment on it. For an everyone-targeted announcement, everyone can comment.

Status: Confirmed

### Work Scheduler Meaning

Decision: The work scheduler is separate from the Beds24 reservation calendar.

It is for recurring property/room operational work such as weed removal, air conditioner filter work, waxing, and other periodic annual/seasonal work.

Status: Confirmed

### Todo / Task Purpose

Decision: Todo/Tasks should work as a lightweight operational memory and follow-up system, especially for CS staff.

Purpose:

- Remember guest-related follow-ups.
- Track room/property-specific notes that need action.
- Record customer promises or special handling.
- Help staff avoid forgetting small operational details.

Todo/Tasks should feel fast and convenient like Todoist, while staying connected to StayOps properties, rooms, guests, and reservations.

Status: Confirmed

### Recurring Work Creation Permission

Decision: Existing recurring work items will initially be entered by Developer/Super Admin. Field Managers also need permission to create recurring work schedules.

Recommended creation/edit roles:

- Developer / Super Admin
- Owner
- Office Admin
- Field Manager

Status: Confirmed

### Lost and Found Statuses

Decision: Initial lost item statuses are registered, stored, disposal_scheduled, and disposed.

Status: Confirmed

### Lost and Found Storage Policy

Decision: The company generally stores lost items for 2 weeks. Expensive items may be stored longer in rare cases.

Requested automation:

- If retrieval does not happen, automatically move the item to disposal_scheduled after 30 days.
- If there is still no action after an additional period, automatically delete or finalize the record.

Recommended implementation detail:

- Prefer disposed/archived over immediate hard deletion to preserve operational history.

Status: Confirmed policy, final deletion/archive details TBD

### Technical Stack

Decision: Use Next.js App Router + TypeScript PWA-first, Tailwind CSS v4, shadcn/ui/Radix UI, Supabase Auth/PostgreSQL/Storage/RLS, Vercel, Web Push/in-app notifications, and Beds24 webhook integration for MVP.

Supporting libraries:

- React Hook Form
- Zod
- TanStack Query
- TanStack Table
- Lucide Icons
- ExcelJS
- PDF export library TBD

React Native/Expo can be added later when native app store release becomes necessary.

Status: Confirmed

### Design Direction

Decision: Use a pure-white operational base with selective Apple-inspired Liquid Glass accents and stronger business-app readability.

Layouts and wireframes will be created with Google Stitch.

Status: Confirmed

### Theme Modes

Original decision: StayOps must support both light mode and dark mode for mobile PWA and admin web screens.

Status: **Superseded (2026-06-08)** — Dark mode is deferred until after the official launch. For the MVP and internal rollout, StayOps is **light-mode-only**. All dark-mode code, styling (`dark:` utilities, dark CSS variable blocks), theme state/persistence, and theme-toggle UI have been removed. The `profiles.theme_preference` column/enum remains in the database (already-applied migration, `not null default 'system'`) but is no longer read or written by the app; its removal is out of scope for now (see Current Status). Dark mode may be revisited post-launch as a fresh slice.

### Theme Preference

Original decision: Users can choose System, Light, or Dark theme. Default is System.

Status: **Superseded (2026-06-08)** — The theme preference control has been removed from account/profile flows along with the rest of dark mode. Deferred until post-launch.

### Project Workflow

Decision: StayOps should follow a plan/design/document/implement/test/review/update-docs workflow.

Any feature change, requirement change, permission change, UI flow change, data model change, or technical change must update the related Markdown files.

Status: Confirmed

### AI Collaboration Rules

Decision: Codex, Claude, Cursor, and any other AI tools working on StayOps must follow shared Markdown documentation as the source of truth and update docs when making project changes.

Status: Confirmed

### Initial Data Model

Decision: Use Supabase/PostgreSQL with organization-based tables for profiles, memberships, invite codes, properties, rooms, reservations, cleaning records, maintenance requests, lost items, order requests, announcements, notifications, and recurring work.

Every operational business record must include `organization_id`.

Status: Drafted

### Attachment Model

Decision: Use a shared `attachments` table instead of storing photo URL arrays directly on each feature table.

Status: Confirmed

### Platform Admin Model

Decision: Store Developer/Super Admin access in a separate `platform_admins` table, not inside organization memberships.

Status: Confirmed

### Audit Logs

Decision: Add an `audit_logs` table to record important admin/platform actions. A full audit log UI is not required for MVP, but important actions should be stored.

Status: Confirmed

### RLS Permission Draft

Decision: Create a dedicated RLS permissions document for Supabase/PostgreSQL policies. RLS must enforce organization isolation and key role-based permissions.

Status: Drafted

### Implementation Plan

Decision: Use a phase-based MVP implementation plan from planning/design preparation through project setup, auth, app shells, core workflows, Beds24 calendar, notifications, exports, and internal rollout.

Status: Drafted

### Stitch Screen List

Decision: Create a dedicated Stitch screen list with first design targets and prompt drafts for core mobile and admin screens.

Status: Drafted

### Accepted Stitch Screens

Decision: The following Stitch screens are accepted as v1 working design directions:

- Login / Signup basic direction
- Mobile Home basic direction
- Active Cleaning Timer basic direction
- Mobile Requests Tab basic direction
- Mobile Announcements list / detail / popup
- Mobile User Profile / Directory / Edit Profile / User Detail
- Admin Dashboard
- Admin Cleaning Status
- Admin Maintenance
- Admin Lost & Found
- Admin Order Requests
- Admin Announcements
- Admin Todoist
- Admin Users

New Request Menu v1 is structurally accepted but needs more Liquid Glass polish later.

Remaining design work:

- App Splash / Launch Screen
- Role-based screen and button visibility review
- Final Stitch progress documentation cleanup

Status: Confirmed

### App Splash / Launch Screen

Decision: StayOps should show a brief splash/launch screen when the mobile app/PWA first opens.

Direction:

- Use a white or bright gray-white background.
- Show the StayOps app logo centered on the screen.
- Keep the splash brief, similar to common app launch experiences such as Instagram or Facebook.
- Do not use the splash as a marketing page.
- The final StayOps logo is not designed yet, so the splash screen remains required but final visual design depends on later logo work.
- Temporary designs may use a StayOps wordmark or placeholder logo.

Status: Confirmed requirement; logo design pending

**2026-07-17 tuning update:** the requirement to show a launch splash stays, but the previous
implementation timing (~850ms hold + ~420ms fade) was too long for the installed iPhone PWA and made
the app feel slower than the actual backend. The splash remains, but its timing is shortened to
**~160ms hold + ~180ms fade**, and it no longer captures touches while fading (`pointer-events: none`).
This keeps the "brief native launch" intent while removing avoidable perceived latency.

### Reservation Calendar Visual Rules

Decision: Reservation calendar date numbers must always remain visible even when reservation bars exist on that date. Reservation bars should be real multi-day bars spanning check-in to check-out, not small isolated labels that hide the date.

Reservation source/channel should control bar color:

- Booking.com / Booking: blue or blue-teal family
- Airbnb: soft light pink family
- Direct/other: neutral gray family

The company's existing internal room/date calendar is an important reference for reservation density and multi-day bar behavior. Mobile still needs a readable monthly view, while admin web should strongly consider a room-by-date timeline grid.

Status: Confirmed

### Reservation Calendar Design Scope

Decision: Mobile and admin web reservation calendar directions are both documented.

Mobile calendar must avoid large unused bottom whitespace. The monthly grid should use the available vertical space efficiently above the bottom navigation.

Admin web reservation calendar should use a dense channel-manager-style room/date grid for office users. It should prioritize scanning many rooms and many dates over large card layouts. A selected reservation detail inspector or collapsible drawer is useful, but it is secondary to the grid.

Status: Confirmed

### Admin Reservation Calendar Stitch Outcome

Decision: The Admin Reservation Calendar Stitch exploration is not accepted as a final v1 design.

Reason:

- Stitch repeatedly produced sparse timelines, over-emphasized detail panels, or rate/inventory-style screens.
- The required admin calendar is closer to a high-density channel-manager grid than a normal SaaS calendar.
- The final UI likely needs a custom data-grid/timeline component during implementation.

Confirmed structural direction:

- Dense room/date grid.
- Support many rooms and many dates.
- Optional room sub-rows such as Status, Min Stay, and Reservation.
- Reservation bars span check-in to check-out.
- Reservation bars display guest name and number of guests only.
- Booking.com/Booking uses blue-teal, Airbnb uses soft light pink, Direct/Other uses neutral gray.
- No price, revenue, payment, rate, sales, or inventory data in StayOps MVP.
- Selected reservation detail surface may show guest, property, room, dates, guests, channel, phone, Copy, and Call. Mobile uses a slide-up bottom sheet; admin web may use an inspector/drawer if needed.
- Earliest available list remains required.

Status: Confirmed structural direction; final Stitch v1 not accepted

### Large-Building Mobile Calendar Strategy

Decision: For buildings with many rooms, such as the upcoming 26-room hotel or any property with about 28 rooms, StayOps should not attempt to show every room's reservations inside one normal mobile monthly date-cell calendar.

Recommended mobile structure:

- Month view: property-level monthly overview and selected-room/small-property calendar
- Rooms view: room-by-date timeline for the selected building, with enough date density for practical scanning
- Lists view: check-in today, check-out today, staying today, empty today, and earliest empty

Reason:

- A normal month grid becomes unreadable when many room reservations compete inside each date cell.
- Mobile needs a separate dense room timeline or operational lists for large buildings.

Status: Confirmed

### Rooms Timeline Date Density

Decision: The mobile Rooms timeline must show more useful date information than a narrow 3-day view. The default should support a practical 7-day range, with an optional 14-day compact view for broader scanning.

Rules:

- Sticky room column.
- Horizontally scrollable date area if needed.
- Clear date range and scroll affordance.
- Compact reservation labels in wider date ranges.
- 14-day mode can prioritize occupancy shape over full guest names.

Status: Confirmed

### Rooms Timeline Density Modes

Decision: For large buildings, Rooms view should separate detail reading from broad occupancy scanning.

Modes:

- Detail mode: fewer days, readable guest labels.
- Overview mode: more dates, compact occupancy bars/cells, guest names hidden by default.

Reason:

- Mobile cannot show 28 rooms, many dates, reservation durations, and full guest names all at once without becoming unreadable.
- Staff need both quick occupancy overview and tappable detail access.

Status: Confirmed

### Rooms Overview Visual Direction

Decision: Rooms Overview should use a compact occupancy timeline style: room numbers on the left, dates across the top, and horizontal colored reservation bars spanning dates. Guest names are hidden in this overview to maximize date density.

Interaction:

- Tap a reservation bar to open reservation detail.
- Use channel colors for reservation bars.

Status: Confirmed

### Environment Setup

Decision: Create an environment setup document that lists required environment variable names and service setup without storing real secret values.

Status: Drafted

## 2026-06-08

### Mobile Bottom Navigation — Center Action Button

Decision: Replace the five-tab floating capsule bottom bar with a center-action ("추가") FAB design — four tabs (Home, Calendar / Requests, Announcements) split 2 / 2 around a raised central teal `#0e7c72` button.

Consequence:

- "Cleaning" can no longer occupy a bottom tab. It moved to the side menu (hamburger) and remains reachable at `/mobile/cleaning`.
- The four side tabs are **per-user customizable** (all four slots). The center FAB ("편집", pencil icon) opens a bottom-bar editor sheet: a 2-column colour-category tile grid of the selectable feature pool where the user toggles up to 4 tabs (≥1 required). Selection is persisted **per user in Supabase** (`profiles.bottom_nav_tabs`) and synced across devices.

Implementation:

- DB: migration `supabase/migrations/202606080001_profile_bottom_nav.sql` adds `profiles.bottom_nav_tabs text[]` (default `{home,calendar,requests,announcements}`). The existing "users can update own profile" RLS policy already covers it. `src/types/database.ts` updated.
- `src/config/navigation.ts`: `mobileBottomNavigation` (defaults) plus `MAX_BOTTOM_NAV_TABS`, `defaultBottomNavTabIds`, `customizableBottomNavItems`, `resolveBottomNavItems`, `sanitizeBottomNavTabIds`.
- `src/lib/session.ts` reads `bottom_nav_tabs` defensively (falls back to defaults if the column is absent) and exposes `session.user.bottomNavTabs`.
- `src/app/account/actions.ts` `updateBottomNavTabs` server action persists the sanitized list.
- `.tabbar` + `.add-sheet*` / `.add-grid` / `.add-tile*` styles in `src/app/globals.css`; bar + editor `createOpen` sheet in `src/components/shell/mobile-shell.tsx`. Tile colours use `oklch` with fixed lightness/chroma and hue-only variation (`LAUNCHER_META`).

Status: Working decision (requires the migration to be applied on the linked Supabase project)

### Mobile Bottom Navigation — Design Token Unification

Decision: All hardcoded hex values in the bottom tab bar and editor sheet (`#0e7c72`, `#aab2b6`, `#dfe4e6`, `#f1f3f4`, `#9aa3a8`, `#3a4a49`, `#1c2b2a`) are replaced with design tokens from `globals.css :root` (`var(--primary)`, `var(--muted-foreground)`, `var(--border)`, `var(--muted)`, `var(--foreground)`, `var(--surface)`, `hsl(var(--primary-hsl) / ...)`) so the bar derives from the single token source of truth.

Exception: `.add-tile`/`.add-tile__badge` `oklch` launcher hue colours are intentional decorative tones and remain as-is.

Status: Confirmed

### Wordmark Color — Unified to `text-foreground`

Decision: The "Stay Ops" wordmark in both mobile shell (top header) and admin shell (sidebar) uses `text-foreground` (neutral dark) for consistency. Previously the admin wordmark used `text-primary` (teal). The admin identity badge (square teal `S` icon) still uses `bg-primary`/`text-primary-foreground` so brand color remains present.

Status: Confirmed

### Center FAB Label — `editBottomBar` Instead of `edit`

Decision: The center FAB button label and aria-label use `dictionary.common.editBottomBar` ("하단바 편집" / "下部バーを編集" / "Edit bottom bar") instead of the generic `dictionary.common.edit` ("편집") to unambiguously indicate its purpose (customize the bottom bar) and prevent confusion with content-editing actions.

Status: Confirmed

## 2026-06-09

### Feature Batch Scope Decision

Decision: The five new features captured in `docs/planning/15-feature-batch-plan.md` (Linen Defect Registration, Personal Todo / Shared Task Inbox, Staff Suggestions / Feedback Box, Internal Board, Attendance / Clock-In-Out + Payroll) are approved as a **post-MVP feature batch**. They are no longer "candidate only" — they are the confirmed next build scope after the Phase 6–13 MVP.

Build order (confirmed): 1) Linen Defect → 2) Personal Todo / Shared Task Inbox → 3) Staff Suggestions / Feedback Box → 4) Internal Board → 5) Attendance / Clock-In-Out + Payroll.

Reason:

- The batch plan was drafted 2026-06-08 and reviewed 2026-06-09; the user confirmed the scope change.
- The first four features do not conflict with any prior confirmed exclusion.
- This decision is the governing source of truth. `15-feature-batch-plan.md` moves from "Draft / Candidate" to "Approved scope."

Status: Confirmed (2026-06-09)

### Attendance / Clock-In-Out + Payroll — Scope Change (Approved)

Decision: Attendance / clock-in-out and hourly payroll are now **in scope** for StayOps. This explicitly reverses the earlier "First Mobile Workflow Priorities" exclusion (attendance excluded because another app handles it) and the "Out of Scope → Attendance / Clock-In and Clock-Out" entry in `docs/planning/03-mvp-priority.md`.

Scope nuance (important):

- **Attendance capture** (PWA QR + device GPS clock-in/out, attendance logs) is approved for implementation.
- **Payroll calculation** stays **design-only / deferred** until the company defines the wage rules: rounding, break deduction, lateness, overtime, overnight shifts, holiday handling, payroll closing date, and the correction/approval flow. Payroll math must not be coded before those rules are confirmed (see `docs/product/21-attendance-payroll-workflow.md` "Important Policy Questions" and `docs/engineering/11-attendance-payroll-technical-design.md` "Current Blockers").
- Operating-date boundaries for attendance/payroll periods must follow the project Asia/Tokyo convention (see CLAUDE.md §6); the exact period-boundary rule is part of the deferred wage policy.

Reason: The user approved the scope change on 2026-06-09 when asked directly whether to approve or keep it blocked.

Status: Confirmed (2026-06-09) — attendance capture buildable now; payroll calc blocked on wage-policy definition.

### Attendance / Payroll Policy Baseline — Refined

Decision: On **2026-06-17**, the attendance / payroll feature policy was refined enough to support an implementation-ready product spec and technical design for:

- session-based attendance capture
- GPS + QR attendance in the first PWA release
- future `GPS + Wi-Fi` design kept in the model but **disabled in current PWA UI as 준비중**
- hourly-worker gross-pay calculation only
- per-person monthly finalization / reopen / snapshot / export

Confirmed policy baseline:

- One open session per user at a time; multiple sessions per day allowed after clock-out.
- Sites are required; free-text attendance locations are not allowed.
- Clock-in site and clock-out site may differ, but both must be registered sites.
- GPS is mandatory for successful attendance.
- PWA first release uses **GPS + QR** only; Wi-Fi remains planned but inactive in PWA.
- Breaks are recorded explicitly; hourly workers are paid only for worked minutes excluding recorded breaks.
- No automatic break deduction.
- No overtime, holiday, public-holiday, or night premiums in the first payroll slice.
- Hourly pay uses 1-minute units and rounds the final monthly gross to the nearest 10 yen.
- Taxes, insurance, deductions, and salaried payroll remain outside StayOps.
- Users can see only their own attendance / pay; only `owner` and explicit `attendance_payroll_admin` users can see org-wide payroll data, finalize months, reopen, and export.
- Site master remains owner-only.

Reason: The user confirmed these operating rules directly while refining the attendance / payroll MD documents on 2026-06-17.

Consequence:

- `docs/product/21-attendance-payroll-workflow.md` and `docs/engineering/11-attendance-payroll-technical-design.md` move from generic draft placeholders to implementation-ready refined drafts.
- `docs/planning/06-current-status.md` should no longer describe hourly payroll as completely undefined; the remaining blocker is the export template and the deferred Wi-Fi activation path, not the core hourly gross-pay policy itself.

Status: Confirmed policy baseline (2026-06-17)

### Internal Board — Part-Time Write Permission

Decision: In the Internal Board feature, **all active organization roles including Part-Time Staff can create posts.** This is intentionally different from Announcements, where Part-Time Staff cannot create (see "Announcement Write Permission").

Reason:

- The Internal Board is a lighter, everyday team-communication space with no required read tracking or popup, so the stricter announcement authorship limit does not apply.
- The user confirmed allowing part-time posting on 2026-06-09.

Consequence: This is a role-permission expansion relative to the announcement model and must be reflected in `docs/product/01-user-roles.md`, `docs/product/20-internal-board-workflow.md`, and the Internal Board RLS in `docs/engineering/05-rls-permissions.md`.

Status: Confirmed (2026-06-09)

### Personal Todo — Private-by-Default and Sharing

Decision: Personal todos/tasks are **private to the owner by default** and become visible to others only when explicitly assigned or shared. This refines (does not replace) the earlier "Todo / Task Purpose" decision, which defined purpose only and was silent on visibility.

Open implementation point (still to confirm during build): the teammate-share mechanism — one shared task record with multi-user visibility vs. a sender/recipient copy model (`task_transfers`). This must be resolved before the Todo slice is implemented. See `docs/product/18-todo-task-workflow.md`.

Status: Confirmed direction (2026-06-09); share mechanism TBD before build.

### Staff Suggestions — Visibility Model

Decision: The earlier `public_team` / `employee_only` visibility direction was later replaced on **2026-06-16** by a participant-scoped model: author + one required recipient + optional referenced users. There is no broad visibility mode in the current first-slice plan.

Consequence: Product, RLS, and data-model docs must follow the newer participant-scoped rule instead of the older two-visibility-mode draft.

Status: Superseded on 2026-06-16

## 2026-06-10

### Beds24 Webhook Reliability — Observability + Daily Reconciliation

Decision: Add a webhook ingestion observability log plus a daily reconciliation safety net to prevent silently-dropped Beds24 webhooks from leaving reservations missing from the calendar.

Context:

- A confirmed reservation (`5843903602`, Kabukicho 302, check-in 2026-06-08) was found missing from the calendar. Root cause: the booking was never written to the DB — its webhook never reached the processing path — and there was no log of webhook delivery, so the loss was invisible until an operator noticed the calendar gap.

Implementation:

- New table `beds24_webhook_events` (migration `202606100001_beds24_webhook_events.sql`) logs every inbound webhook batch and every reconciliation run (trigger source, http status, counts, modes, compact booking summary). Platform-admin read, service-role write.
- New production endpoint `/api/beds24/reconcile` re-pulls the operational window (current month + next month) from Beds24 `/bookings` and upserts anything missing. Idempotent; the production counterpart to the dev-only backfill route.
- Vercel Cron (`vercel.json`, `0 19 * * *` UTC = 04:00 Asia/Tokyo) runs the reconcile endpoint **once daily**, within the free Hobby plan's cron limit. Authorized via `CRON_SECRET` (or `BEDS24_WEBHOOK_SECRET` for manual runs).

Policy:

- This does NOT reverse the "Beds24 Webhook Strategy" decision. Webhooks remain primary/real-time; reconciliation is a low-frequency (daily) catch-up safety net, not polling. The daily cadence (vs. more frequent, which would require Vercel Pro) was chosen by the user to respect the "free/low-cost" constraint.

Reason: The user explicitly asked to prevent this class of silent ingestion miss from recurring and to document it. Daily-cron cadence confirmed by the user on 2026-06-10.

Status: Confirmed (2026-06-10). Requires `CRON_SECRET` set on the Vercel project for the cron to be authorized in production.

### Brand Palette — Ivory chrome + Navy accent (teal retired)

Decision: Replace the global brand color and shell chrome. The former teal primary
(`hsl(177 100% 24%)`) is retired; the brand accent (`--primary`) is now **deep ink
navy/indigo** (`hsl(223 46% 32%)`). The page/shell background, sidebar, and bottom tab bar
use a warm **ivory** base (`--background hsl(42 38% 96%)`); cards/sheets stay white
(`--surface`) to lift off the ivory canvas.

Scope: App-wide (mobile + admin), via `src/app/globals.css` tokens that cascade to all
`--primary`/`bg-background` usages, plus the few hardcoded teal classes in the sidebar
gradient (`mobile-shell.tsx`), the `.tabbar` (`globals.css`), and the auth login / onboarding
screens which were migrated to `--primary` tokens.

Reason: The user found the teal-dominant sidebar/bottom bar too green and requested an ivory
chrome with a harmonious non-green accent; navy was chosen for a premium, hospitality-ops feel
that pairs with ivory and unifies with the existing blue order/maintenance accents.

Notes: Semantic success greens (e.g. `emerald-*` confirmation states in announcements) were
intentionally left as functional status colors, not brand color. Mobile-shell contract docs
(`CLAUDE.md`, `docs/product/16-mobile-navigation.md`) updated to the ivory/navy base.

Status: Confirmed (2026-06-10).

## 2026-06-13

### Todo Completion Re-introduced + 완료/기록 Tab

Decision: Re-introduce task completion in the mobile Todo workspace (it had been removed in the
2026-06-12 IA cleanup) and add a **Completed (완료/기록)** top tab. Tapping a task card's status
circle completes/reopens it (undo toast); `completeTask` / `reopenTask` stamp/clear `status` +
`completed_at` + `completed_by_user_id`, write an update-log row, and (on complete) fan out a
`task_completed` notification. The Completed tab groups completed tasks by their Tokyo completion day
(`tokyoDateOf(completed_at)`), newest first.

Reason: Operators need to mark work done and review a dated completion history; the prior removal left
the existing `completed_*` columns dormant. The `task_completed` notification enum value is now active.

Status: Confirmed (2026-06-13).

### Daily Report Generator (staff-only) — free template, no LLM

Decision: Add a Korean daily work report ("업무일지") to the Todo Completed tab. A **보고서** button on
each day group calls `generateDailyReport(date)`, which gathers the caller's own completed tasks for
that Tokyo date and returns a date-headed bullet list, shown in an editable, copyable bottom sheet.

The generator is **free and template-based — no LLM, no API key, no per-use cost**. It builds the
report deterministically and applies a local `tidy()` pass for light auto-correction (whitespace,
leading bullet glyphs, punctuation spacing); the header suffix is localized (업무일지 / 業務日報 /
Daily report).

> Superseded sub-decision: an LLM-backed variant (`@anthropic-ai/sdk`, `claude-haiku-4-5`,
> `ANTHROPIC_API_KEY`) was prototyped first, but the user opted for the free template because the
> Claude consumer subscription cannot authenticate the API and pay-as-you-go billing was not wanted.
> The SDK + key were removed. Re-introducing them behind the same `generateDailyReport` contract
> remains the upgrade path if richer 맞춤법 correction is later desired. **No LLM dependency is
> currently in the stack.**

Permission — **staff-only**: `canGenerateDailyReport(role, can_generate_report)` =
`role != 'part_time_staff' OR profiles.can_generate_report = true`, enforced in the server action (a
forbidden caller gets a "권한 없음" popup). New column
`profiles.can_generate_report boolean not null default false` (migration
`202606130001_profile_report_access.sql`, applied to the linked Supabase project) is toggled per-user
by owner/office_admin in admin user management (`updateMemberReportAccess`) for the few part-timers in
a management capacity.

Status: Confirmed (2026-06-13). No env var required.

### Mobile-first login routing

Decision: the product must no longer show a manual "choose dashboard vs mobile" landing screen.
Entry routing should be automatic by device.

Rules:

- **Desktop / PC access** should go directly to the **admin dashboard/web surface**
- **Mobile / tablet access** should go directly to the **mobile app surface** (`/mobile`)
- The old root-level manual chooser / dev-style entry screen must be removed from the real product flow
- Any future "open mobile version from dashboard" behavior should live **inside the dashboard**, not on
  the public root entry screen

Implementation direction:

- On `/`, phones/tablets are redirected straight to `/mobile` instead of showing the desktop/dev
  entry chooser.
- On `/`, desktop users should be routed straight into the admin/dashboard side rather than seeing a
  version-choice landing page.
- On `/auth/login`, phones/tablets force the post-login destination to `/mobile`
  (`effectiveNext`), overriding both the role-based admin default (`state.redirectTo`) and any
  `?next=/admin/...` value.
- On mobile devices, the dev-seed login collapses to a single test-admin button labeled
  **Stay Ops E2E Admin** for local QA only.

Reason: users should never have to decide between "dashboard version" and "mobile version" on the
first screen. The correct surface should be selected automatically by device. `effectiveNext`
still flows through `signInWithEmail`/`signInWithGoogle` → `/auth/callback`
(`dest = safeNext || state.redirectTo`), so it is honored end-to-end; middleware only guards
auth and does not re-route by role, so `/mobile` sticks on phones. The desktop side should
eventually stop rendering `DevEntry` entirely and go straight to dashboard routing.

Status: Confirmed (2026-06-10), expanded on 2026-06-18. **Follow-up implementation still required
for the desktop root route to replace `DevEntry` with direct dashboard routing.**

### Bottom sheets — iOS drag-to-dismiss; header close (X) removed

Decision: All mobile **bottom sheets** share one iOS-style drag-to-dismiss interaction via a single
primitive, `useSheetDragDismiss` (`src/components/shell/use-sheet-drag-dismiss.ts`). Drag the grab
handle / header down to dismiss — release past `max(80px, 25% of sheet height)` or a downward flick
≥ 0.5 px/ms dismisses (reusing each sheet's existing slide-out + `onClose`), otherwise it snaps back;
the scrim dims in proportion to the drag. Each sheet keeps its own open/close lifecycle and only
spreads `handleProps` on the handle/header, tags the container `data-sheet`, and applies
`sheetStyle` / `scrimStyle`. Now that the slide dismisses, the **top-right close (X) buttons were
removed** from these sheets; scrim tap and Esc remain as alternate exits.

Approach chosen: a shared hook (Option A), not a `BottomSheet` wrapper component (Option B), because
each sheet has a slightly different layout / duration / close path and wrapping all of them carried a
higher regression risk than leaving each sheet's markup intact and wiring the hook in.

Scope: covered — bottom-bar editor (`mobile-shell`), Tasks quick-add / Calendar day sheet /
long-press menu (`tasks-workspace`), share picker, context picker, report sheet, project create
(`projects-board`), project members (`project-detail-view`), photo gallery (`photo-gallery`),
calendar reservation detail (`mobile-calendar-view`), and the order action sheet's draggable
(`isOrdered`) variant. Excluded (not bottom sheets) — center-aligned confirm/delete/rename dialogs,
the cleaning confirmation card, fixed action bars, the side menu, and the photo lightbox carousel.
Kept X icons that serve other roles (remove-participant, chip clear, search clear, select-mode
cancel, lightbox close, centered dialogs).

Note: sheets portal to `<body>` but React synthetic touch events bubble through the React tree into
the shell's pull-to-refresh / swipe-nav handlers, which dragged the background screen down with the
sheet; the hook stops touch propagation on the handle so only the sheet moves.

Status: Confirmed (2026-06-15). Canonical contract: Product `16` → "2026-06-15 Bottom Sheets —
iOS-style Drag-to-Dismiss".

### Todo recurrence uses real task instances

Decision: Todo recurrence is no longer label-only. Repeating tasks now generate **real `tasks` rows**
per occurrence date, tied together by `recurrence_series_id` and stamped with
`recurrence_instance_date`.

Rules:

- a repeat rule requires a date anchor (`scheduled_date` or `due_at`)
- the task the user saves is the **first real occurrence**
- future occurrences are materialized as actual rows inside the active task window
- the **latest occurrence row's** repeat rule is what continues the series forward
- clearing repeat on the latest occurrence stops future auto-generation from that point
- `custom` remains round-trip only; auto-generation runs only for the standard rules
  (`daily`, `weekly`, `monthly`, `weekdays`, `weekends`)

Reason:

- the user explicitly required repeating tasks to actually appear on their repeated dates in
  Today/Tomorrow rather than stay as a label-only reminder
- real rows preserve completion history, update-log history, and per-day visibility consistently

Status: Confirmed (2026-06-15).

## 2026-06-22

### iOS dark-mode browser chrome — themeColor pinned to ivory in both schemes

Decision: `viewport.themeColor` in `src/app/layout.tsx` is declared for **both**
`(prefers-color-scheme: light)` and `(prefers-color-scheme: dark)` with the **same ivory
`#f7f4ee`**, so iOS Safari's status bar and bottom URL toolbar stay unified with the app's ivory
chrome even when the system is in dark mode.

Reason: iOS Safari ignores a single (scheme-less) `theme-color` in dark mode and falls back to black
system chrome, which rendered the top status bar and bottom URL toolbar black. Since the app is
light-mode-only, declaring an identical dark variant forces the light design's chrome in both
schemes. This is not a design change and does not touch `mobile-shell.tsx` safe-area handling.
In-app browsers (KakaoTalk/Instagram) ignore theme-color and are out of scope.

Status: Confirmed (2026-06-22).

### Attendance / Temporary QR -> owner-only settings bridge

Decision: add a minimal **owner-only** admin-web settings page at `/admin/settings/attendance` for
attendance **site setup + QR issue/reissue**. This is a narrow bridge for real operations and QA, not
the full attendance dashboard.

Why:

- The attendance backend and worker QR flow are already live, but the only QR issuance surface was the
  local-dev-only `/api/dev/attendance/temp-qr` route.
- Operations needed a browser UI to register a real site radius/coordinates and issue a scannable QR
  without relying on a dev-only route or URL query parameters.
- Keeping it under **Settings** and restricting it to **`owner` only** preserves the documented
  authority boundary: site master and QR lifecycle are not broad admin capabilities.

Impact:

- `/admin/settings` gains an owner-visible attendance QR entry card.
- `/admin/settings/attendance` becomes the first owner-facing site/QR surface: select an existing site
  or create one, edit `name / latitude / longitude / allowed radius`, and issue or reissue the active
  QR.
- QR issuance still uses the existing atomic `issue_attendance_qr` RPC through
  `src/lib/attendance-sites.ts`; no schema or permission model changed.
- This does **not** ship the broader attendance admin dashboard (review queue, payroll totals,
  finalization UI, export UI). Those remain separate/deferred surfaces.

### Mobile sidebar scrim must leave chrome-safe transparent edge bands

Decision: the mobile sidebar dismiss scrim remains a **full-screen click target**, but its painted
overlay leaves **transparent top/bottom edge bands** instead of tinting the viewport all the way to
the first/last pixel row.

Reason: the earlier safe-area-only inset fix solved standalone/PWA notch and home-indicator bands,
but regular **Safari browser mode** still reproduced the black top/bottom chrome when the sidebar
opened. Safari chooses the status-bar / URL-toolbar tint by sampling the page's top/bottom edge
pixels, and its own browser chrome is **not** represented by `env(safe-area-inset-*)`. So a dark
scrim that still painted the literal viewport edges could make Safari darken its chrome even though
the safe-area bands were clear. Leaving transparent edge bands lets Safari keep sampling the ivory
page background in both browser mode and standalone, while preserving a full-screen dismiss target
and the same dim over the main content area. Future full-screen scrims that can coexist with Safari
chrome should follow this "transparent edge bands" rule. The bottom-sheet scrim
(`bottom-sheet.tsx`) is a separate concern and out of scope.

Status: Confirmed (2026-06-22).

### Mobile shell height rebalanced — outer shell back to `dvh`, nested wrappers `h-full`

Decision: the mobile shell no longer uses `h-svh` on all three nested containers. The **outermost**
shell returns to `h-dvh`, while the centered wrapper and inner safe-area column use `h-full` so they
inherit that single measured height instead of each binding independently to a viewport unit.

Reason: the earlier all-`svh` change avoided URL-bar-collapse jump, but on real iPhone Safari it
made the shell frame shorter than the actual visible viewport in multiple states, which exposed large
ivory gaps below the bottom tab bar and left the sidebar/footer/scrim visually floating above the
screen bottom. The underlying mistake was treating the "small viewport" as the permanent app frame.
Using `dvh` only once at the outer shell restores full-height rendering while avoiding the prior
"three nested dynamic viewports all reflow at once" amplification.

Impact:
- `src/components/shell/mobile-shell.tsx` outer `<main>` uses `h-dvh` again.
- The centered wrapper and inner column now use `h-full` instead of their own viewport units.
- This removes the bottom white-gap / floating-sidebar-floor issue seen on the home/calendar/sidebar
  screenshots in iPhone Safari.

Status: Confirmed (2026-06-22).

### Sidebar scrim now splits browser vs standalone behavior

Decision: the mobile sidebar scrim uses **different paint rules by display mode**:

- **browser mode**: keep the 1px transparent edge-row trick so Safari samples the ivory page edge
  and does not darken its own top/bottom browser chrome
- **standalone / Add to Home Screen mode**: do **not** dim the shared status/header zone or the
  bottom-tab zone; only the middle content span is darkened

Reason: one universal scrim could not satisfy both iOS modes. Browser-mode Safari needs a visible
page-edge sample to keep its chrome light, but in installed standalone mode there is no Safari URL
toolbar to protect, and a full-bleed dark overlay painted the system status bar area black. Keeping
the whole `env(safe-area-inset-*)` band transparent also exposed hard horizontal transition lines.
The real fix is mode-aware behavior, not a compromise value.

Impact:
- `src/components/shell/mobile-shell.tsx` detects standalone using
  `matchMedia("(display-mode: standalone)")` plus legacy `navigator.standalone`.
- Sidebar scrim is edge-sampled in browser mode, but in standalone it skips the top
  `safe-area + 64px header` band and the bottom tab-bar band so the drawer reads more like a native
  overlay and never paints the system top area dark.
- The sidebar panel and scrim are shell-local `absolute` layers instead of viewport-fixed layers,
  and the scrim mounts only while the drawer is open. This removes the hidden closed-state
  full-screen scrim layer that iOS standalone could keep sampling for the top status-bar paint.
- While the drawer is open, the shared top bar and bottom tab bar also slide/fade out instead of
  remaining visible under the dimmed right-edge sliver. The open state now reads as one focused
  drawer surface rather than "app chrome still visible behind a menu".
- Follow-up polish: once that shared chrome hides, standalone mode uses one continuous scrim while
  the drawer is open instead of preserving header / tab-bar / safe-area clear bands. This removes the
  bright top-right / bottom-right horizontal blocks; the scrim unmounts on close, so there is no
  hidden layer left to affect the status bar afterward.

Status: Confirmed (2026-06-22).

### Mobile side menu is now a full-screen navigation sheet

Decision: mobile sidebar navigation now opens as a **full-width slide-in sheet** instead of a
partial-width drawer with a visible dimmed right-side sliver.

Reason: the old 78% drawer kept exposing a narrow slice of the current page. In iOS standalone/PWA
mode that slice made the system status-bar area, top edge, and sidebar overlay feel visually
disconnected even after the scrim-safe-area fixes. A full-screen navigation sheet better matches the
native-feeling pattern the product wants: the menu becomes the current screen, while the status bar
remains a normal iOS system area above it.

Impact:
- `src/components/shell/mobile-shell.tsx` sidebar panel is now `w-full` and no longer carries the
  right-edge panel shadow used by the old partial drawer.
- The existing close button and slide-in/out transition remain.
- The shared top bar and bottom tab bar still hide while the menu is open.
- The sheet top starts with `var(--background)` for the first 96px before fading into the warmer
  sidebar gradient, matching the iOS status-bar / root canvas color so the top reads as one surface.

Status: Confirmed (2026-06-22).

## 2026-06-22

### Service worker introduced (installability + offline), navigations stay network-first

Decision: StayOps now ships a minimal service worker (`public/sw.js`, registered prod-only) plus a
real icon set and an `/offline` fallback, to make the installed PWA installable on Android (Chrome's
install prompt requires a SW with a fetch handler + a maskable icon) and to show a friendly offline
page instead of a blank error.

Constraint kept: the SW is **network-first for navigations** and only cache-first for content-hashed
static assets (`/_next/static`, `/icons`). The previous no-SW state had zero stale-content risk; we
preserve that for dynamic HTML/RSC so the installed app is never stuck on an old version. Static cache
is versioned (`CACHE = stayops-static-v1`) — bump to invalidate on deploy.

Also: `manifest.webmanifest` gained `id`/`scope` and `start_url` moved `/` → `/mobile` (the real
installed-app entry, dropping a launch-time redirect hop). Icons are generated from an inline SVG
brand mark (navy squircle + ivory serif "S") via `scripts/dev/generate-pwa-icons.mjs`; replace with a
real logo and re-run when one exists.

Reason: the app was previously a manifest-only "PWA" with no icons and no SW — it installed as a
manual home-screen bookmark with a blank icon, no Android install prompt, and a blank offline state.
This is part of the 2026-06-22 native standalone hardening pass (see Current Status). PWA-first
direction is unchanged; this strengthens it.

Status: Confirmed (2026-06-22).

### In-app photo lightbox instead of new-tab image links (standalone)

Decision: Mobile photo attachments (announcements, order items, linen-return records) open in an
in-app `ImageLightbox` (full-screen swipeable viewer, portaled to `<body>`) instead of
`<a target="_blank">`. In an installed standalone PWA a new-tab link ejects the user into a separate
Safari tab (or, same-window, strands them on a raw image with no back button). Genuine external
destinations (maps, shopping links, mailto/tel) intentionally still leave the app and are recoverable
via the app switcher. Future image surfaces should reuse `ImageLightbox` / `LightboxThumbs`, not
`target="_blank"`.

**2026-06-25 — pinch-zoom added.** `ImageLightbox` now supports **pinch-to-zoom (1–4×), double-tap
zoom toggle, and drag-to-pan while zoomed**, implemented directly (no library) via non-passive touch
listeners. While zoomed the carousel's native horizontal scroll is disabled (`touch-action: none` +
`overflow: hidden`) so a one-finger drag pans instead of switching photos; releasing back to 1× (or
changing slide) re-enables swiping and resets zoom. Desktop has double-click parity. Because it's the
shared viewer, all surfaces (board, announcements, orders, linen-return) gain zoom.

Status: Confirmed (2026-06-22; pinch-zoom 2026-06-25).

### Mobile route transitions via template.tsx (not a persistent-shell refactor)

Decision: iOS-style route transitions (forward = slide/fade in from the right, back = from the left)
are implemented with `src/app/mobile/template.tsx` + a tiny `src/lib/nav-direction.ts` direction
signal (the shell's `goBack()` flags "back"). We deliberately did NOT do the larger refactor of moving
`MobileShell` into a shared `src/app/mobile/layout.tsx` to persist it across routes.

Reason: several mobile routes intentionally render WITHOUT the shell (`/mobile/notifications`, the
full-screen attendance capture flow). A shared-layout shell would force the chrome onto them, so a
true persistent shell needs a route-group restructure — high risk to do without device testing. The
template approach delivers the visible native slide + (separately) inner-container scroll restoration
without that risk. The per-route shell remount (header state reset, tab highlight on-arrival rather
than instant) is a known remaining optimization, deferred. Also removed the pass-1
`mobile/loading.tsx` skeleton: with no loading boundary Next keeps the previous screen until the new
RSC is ready, which the slide then animates in — more native than a chrome-less skeleton flash.

Keyboard occlusion of fixed submit bars is handled globally via `KeyboardInsetSync` →
`--keyboard-inset` (VisualViewport), consumed by the linen-return and attendance-correction fixed bars.

### Admin wage-change effective date: today allowed, past disallowed (not "strictly future")

Decision: in the admin console's hourly-wage editor (`/admin/attendance/wages`), `setHourlyRate`
(`src/app/admin/attendance/actions.ts`) rejects `effective_from` dates **before today** (Tokyo) but now
**allows today itself**. The prior implementation rejected today too (`effectiveFrom <= todayTokyo`),
which was stricter than the documented "never retroactive" rule actually requires — today hasn't
finished yet, so setting a same-day rate isn't reinterpreting a day that already closed.

Reason: user-confirmed (2026-07-02) — past dates must stay blocked, but today must be selectable.
`getAdminAttendanceWages` now returns `minEffectiveFrom` = today (Tokyo) as the calendar's minimum
selectable date (previously computed as tomorrow); the suggested default value shown in the field is
still the 1st of next month. The internal close/replace logic in `setHourlyRate` (closing an already-
active open rate period vs. deleting-and-replacing a still-future scheduled one) is unaffected by this
change.

Status: Confirmed (2026-07-02).

### Admin attendance console month selection is a shared top control

Decision: the admin attendance console uses one shared month picker in the top attendance subnav
instead of separate page-level month controls on overview, payroll, transport, or staff detail pages.
The selected month is carried as `?ym=YYYY-MM` across overview / review queue / payroll / transport /
wages / staff detail. Month changes preserve relevant non-month panel context where useful
(`sessionId` in the review queue, selected transport `user` in transportation review).

Reason: user-confirmed (2026-07-02) while reviewing the attendance overview screenshot. Payroll,
transportation, and overview are all slices of the same monthly attendance operating context, so a
single top control reduces duplicated UI, keeps the console chrome consistent, and makes tab switching
feel like changing views on the same month rather than opening separate tools.

Status: Confirmed (2026-07-02).

### Attendance session invalidate now has an explicit, auditable reverse: restore

Decision: `invalidateAttendanceSession` (mark a session `status='invalid'`, excluding it from payroll
without deleting it) previously had no reverse path — an admin who invalidated a session by mistake had
no way to undo it from the console. `restoreAttendanceSession` (`src/app/admin/attendance/actions.ts`)
adds that reverse: it sets `status` back to `completed`, clears `invalidated_at` /
`invalidated_by_user_id` / `invalidated_reason`, and resets `review_state` to `normal`. **Restore
requires both clock ends to already exist** — an invalid session still missing a clock-out returns
`incomplete`, and the admin must fill the clock-out via 수동 정정 (`updateAttendanceSessionAdmin`)
first (refined 2026-07-02: the first cut restored to `open` when incomplete, but that silently
produced an in-progress session that never counts toward pay and contradicts the "완료 처리" label —
per user request, restore now only ever completes a session). Mandatory reason +
`attendance_session_audits` row (new `action_type = 'restore'`, added via migration
`202607020001_attendance_session_restore.sql` — extends the `attendance_session_audits.action_type`
check constraint).

UX: this is NOT a separate button. The existing "검토 완료 처리" (mark reviewed) button in the queue's
session detail panel (`attendance-queue-client.tsx` → `SessionPanel`) does double duty — when the
session's `status` is `invalid` it relabels to "복구 및 완료 처리" (restore & mark reviewed), and its
reason-modal copy switches to explain the restore, but it's the same click target and the same
`AdminReasonModal`. When the invalid session is missing a clock end, that button is **disabled** with a
tooltip directing the admin to 수동 정정 first (the panel's manual-edit form works on invalid sessions
too — it fills the clock-out while keeping the session invalid, which then unblocks restore).

Reason: user-confirmed (2026-07-02) — a worker/admin data-entry mistake shouldn't be a dead end;
if the original clock-in/out is later confirmed legitimate, the session should be recoverable without
re-creating it as a new manual session (which would lose the original clock-in/out proof + history).

Status: Confirmed (2026-07-02).

### Payroll monthly export is an accounting Excel hand-off

Decision: the payroll page's monthly export button is labeled `엑셀 내보내기` in Korean and the workbook is
treated as a tax/accounting hand-off document, not an internal review-table dump. The monthly workbook
includes staff name, work days, total recognized hours, hourly rate, approved transport reimbursement,
payroll excluding transport, and total payout including transport.

Transport reimbursement is joined from the same-month transportation review data, but only reports in
`approved` status are included in the payroll workbook totals. Pending/reviewing/rejected transport
amounts stay visible in the transportation review surface and separate transport exports, but do not
inflate the accounting payroll total.

Reason: user-confirmed (2026-07-02) — payroll Excel is primarily for tax accountant / bookkeeping
workflow. Approved transport must be visible beside pay for payment reconciliation, while wage-only and
transport-included totals must remain separate for accounting clarity.

Status: Confirmed (2026-07-02).

### Per-user payroll export uses daily detail and cleaning-room linkage

Decision: per-user payroll export in the admin payroll side panel is no longer the legacy finalized-only
CSV hand-off. It is an individual monthly Excel/PDF detail sheet with date, clock-in, clock-out, daily
work time, daily pay, approved transport, cleaned rooms, and totals.

Cleaning rooms are linked from completed `cleaning_sessions` for the same staff and date. The current
room summary rules are: Arakicho A -> `AA` + room, Arakicho B -> `AB` + room, Kabukicho -> `KK` + room,
Takadanobaba -> `T2` + room, Okubo labels unchanged, and Sky labels unchanged until its opening/data
mapping is decided.

Reason: user-confirmed (2026-07-03) — individual exports are for staff-level payroll checking, so the
sheet needs daily attendance/pay, transport, and the cleaned-room evidence that caused the work.

Status: Confirmed (2026-07-03).

Status: Confirmed (2026-06-22). Part of the native standalone hardening pass.

## i18n dead-key cleanup + status-label consistency (2026-07-07)

Decision: removed orphaned dictionary keys and one unused component surfaced by a full trilingual
(ko/ja/en) audit. All user-visible copy was already dictionary-sourced with full ko/ja parity — this
pass only deletes dead code; no behavior/UI change.

Removed:
- `src/components/foundation-preview.tsx` (unused component, not imported anywhere) and its
  `dictionary.app.*` / `dictionary.foundation.*` keys (its only consumers).
- `dictionary.devEntry.*` (no references), plus `dictionary.app.*` / `dictionary.foundation.*`, from
  both the `FALLBACK_DICTIONARY` (en base) and the `ko` override block.
- Flat duplicate success strings `admin.settings.attendanceQrIssued` / `attendanceQrReissued` /
  `attendanceSiteSaved` — the live settings UI uses the nested `admin.settings.success.*` copies.

Also: `src/app/admin/users/[id]/page.tsx` `getStatusLabel` no longer inlines ko/ja/en membership-status
labels; it now reads `dictionary.common.{active,invited,removed,suspended}`, matching the users list
page (`src/app/admin/users/page.tsx`). The "Stay Ops" wordmark stays hardcoded in the shells — it is a
brand mark, locale-invariant by design (see design-direction doc), not translatable UI copy.

Deferred follow-up: the flat `dictionary.auth.*` block (`loginTitle`, `subtitle`, `magicLinkSent`,
`welcomeBack`, `productSubtitle`, `sendMagicLink`, `signInErrorPrefix`, etc.) appears largely orphaned
by the login redesign to `dictionary.auth.console`, but at least one key (`languageSelector`) is still
referenced. It needs a dedicated audit against the current login page before removal — deliberately
NOT removed in this pass to avoid arbitrary partial deletion.

Reason: user asked for a full i18n check + cleanup (2026-07-07). Verified via lint + build + a
key-parity script that evaluates the real module and lists fallback keys lacking ko/ja overrides.

Status: Confirmed (2026-07-07).

## Annual leave admin sub-tabs — backend wiring + approver toggle model (2026-07-08)

Wired three of the four leave-console sub-tabs to real data (문서 stays design-only for stage 3):

- 팀 캘린더: bar click reuses the review-queue request detail drawer (read-only for approved), driven
  by the org-wide approved requests the client already holds — no new fetch, no new server code.
- 직원 잔여·부여: `listAdminLeaveBalances` (active non-hourly members, approved 유급/특별 usage deducted
  via `computeAnnualLeaveSummary`); drawer editor persists hire-date/grant via `saveEmployeeLeaveBaseline`.
- 승인자 관리: `listAdminApprovers` + `setLeaveApprover` write `memberships.leave_approver_role`.

Approver toggle model (confirmed with user 2026-07-08): keep the handoff's plain on/off toggle; enabling
stores `'department_head'` by default. The `department_head`(部署長) vs `senior_managing_director`(専務)
distinction only affects the stage-3 document stamp box — `is_leave_approver()` treats any non-null value
as an approver. Server guards: can't remove your own approver right (self row locked), org must keep ≥1
approver. Management writes re-verify approver via `isSessionLeaveApprover` on top of the page gate.

The 승인자 관리 소속 column has no data source (no user↔building association, same reason the queue's
branch filter was dropped) and renders "—". Hourly exclusion is by membership role (`part_time_staff`)
for now, not `employment_type_history`.

Reason: user asked to attach the backend for the leave views and add the team-calendar side panel
(2026-07-08). Verified via lint + build + browser render of each view with real-shaped mock props.

Status: Confirmed (2026-07-08).

## Developer account shows as 개발자, not 대표 (2026-07-08)

The developer (김현준) was displaying as **대표** everywhere because their session role resolves from an
`owner` org membership (`dictionary.roles.owner` = "대표"). `owner` is a real permission-bearing business
role (owner-only server actions, payroll finalization, site master), so its label must NOT be renamed.

Correct fix: register the developer as a platform admin (`platform_admins.role = developer_super_admin`).
The session already prefers the platform role (`platformAdmin?.role ?? membership?.role` in
`src/lib/session.ts`), so once registered, all session-based surfaces (mobile shell, admin sidebar,
account) auto-display "개발자 / 최고 관리자" with true top authority — no code change needed there. This
`platform_admins` insert is an access-control change, so it is handed to the user to run in Supabase
rather than executed by the agent.

Code change: the leave-console admin tables (`listAdminApprovers`, `listAdminLeaveBalances`) read the raw
membership role, so they were also surfacing "대표" for the developer. They now resolve active platform
admins (`platformAdminIdSet`) and label them `developer_super_admin`, matching the session-based surfaces
so the developer reads as "개발자 / 최고 관리자" across the whole dashboard.

Reason: user asked to show 김현준 as 개발자 (not 대표) everywhere while keeping top authority (2026-07-08).
Verified via lint + build.

Status: Confirmed (2026-07-08).

## Employment-type (시급↔정규직) management UI (2026-07-08)

Added employment-type change to the 시급 관리 console (`/admin/attendance/wages`), the last missing piece
of payroll rate/employment management (hourly-rate management via `setHourlyRate` was already built).

- Server: `setEmploymentType` (`src/app/admin/attendance/actions.ts`) — privileged
  (`isAttendancePayrollAdmin`), writes `employment_type_history` with the same no-retroactive interval
  logic as `setHourlyRate` (close active period at effective_from−1, delete a still-future pending row,
  insert the new open period), plus an `audit_logs` entry (`employment_type_set`). Blocks a redundant
  same-type change (`no_change`); a member with no history yet can be assigned a type (curType null =
  any pick is a change).
- Frontend: `attendance-wages-client.tsx` — a "고용 형태 변경" section (시급/정규직 segmented control +
  effective date + preview) above the rate editor, shown for both hourly and salaried members,
  so either can be switched to the other. On success it `router.refresh()`es and toasts. i18n
  `wagePanelEmp*` / `wageActionEmploymentDone` added ko/ja/en.
- Safety measures (added 2026-07-08, since employment change alters pay model + leave eligibility): an
  always-visible guidance note (`wagePanelEmpNote`) and a required confirmation step — "적용" opens the
  shared `AdminReasonModal` (danger-styled) with a consequence summary naming the person, target type and
  date (`wagePanelEmpConfirmDesc`) plus a reason field, so the write only happens after an explicit
  confirm. The rate editor keeps its lighter inline flow; only the employment switch is gated this way.
- Switching type leaves `hourly_rate_history` untouched — pay branches on the active employment type, so
  an existing rate stops applying once salaried and resumes if switched back (rate set separately).

Reason: user's attendance gap check flagged "no employment-type change UI"; asked to implement it first
(2026-07-08). Verified via lint + build + live render of the panel (toggle → preview/enable) on the real
authed page; the apply write was intentionally not triggered against real data.

Status: Confirmed (2026-07-08).

## Wage / employment change reasons are now viewable in the panel (2026-07-08)

Follow-up to the employment-type feature: the change **reason** entered in the confirm modal (and the rate
editor's reason) was only stored on `audit_logs.metadata.note` with no viewer. Now the 시급 관리 panel
surfaces it.

- `getAdminAttendanceWages` (`src/lib/admin-attendance.ts`) joins `audit_logs` notes back to each history
  row by `target_id` (target_type `hourly_rate_history` / `employment_type_history`), and now also returns
  a full `employmentHistory` list (was: current type only). New types: `WageHistoryEntry.note`,
  `EmploymentHistoryEntry`, `AdminWageRow.employmentHistory`. The employment select now includes `id`
  (needed for the audit join). Dev-seeded rows have no audit row, so their note is null.
- `attendance-wages-client.tsx`: each 시급 구간 이력 entry shows its reason under the period when present,
  and a new "고용 형태 이력" section (always shown, both hourly/salaried) lists each employment interval
  (type · date range · reason · current pill). i18n `wagePanelReasonLabel` / `wagePanelEmpHistoryTitle` /
  `wagePanelEmpHistoryEmpty` added ko/ja/en; `.ratelist__note` style added.
- `audit_logs` remains otherwise write-only — this is the first read of it, scoped to wage/employment
  target types. A general audit-log viewer is still not built.

Reason: user asked where the entered reason can be seen; chose to surface it on each history entry plus add
an employment-history section (2026-07-08). Verified via lint + build + live render of the "고용 형태
이력" section (seeded intervals show no reason, as expected; no real write was made).

Status: Confirmed (2026-07-08).

## 연차 문서(休暇届) 실제 생성 + 문서번호 (stage 3, 2026-07-08)

The 문서 sub-tab moved from static mock to real generation. No separate documents table — the printable
休暇届 is derived from the approved `annual_leave_requests` row; only the number is persisted.

- Migration `202607080001_annual_leave_document_number.sql` adds `annual_leave_requests.document_number`
  + a partial unique index `(organization_id, document_number)` and backfills existing approved rows.
  **Must be applied on the linked project** (Supabase SQL editor or `supabase db push`).
- Number `AL-YYYY-MM-NNN`: `YYYY-MM` = approval month (Asia/Tokyo), `NNN` = zero-padded per-org/month
  sequence. Assigned in `approveLeaveRequestForApprover` as a **best-effort** step (never blocks the
  approval; retries on a unique-violation race; silently skips if the column isn't migrated yet).
- `listLeaveDocuments` (`annual-leave-admin-server.ts`) returns approved requests that have a number,
  joined with applicant org role + approver name; resilient (returns [] if column missing).
  `leave-documents-view.tsx` now takes real `documents` + `locale`, groups by employee, and renders the
  A4 休暇届. Stamp box by `approved_role`: department_head → 部署長, senior_managing_director → 専務;
  本人 = applicant initial. 申請日 = submitted_at (Tokyo). Print = `window.print()`. Empty-state added.
- Dropped the mock "원본 신청 보기" button (was unwired). `document_number` added to `src/types/database.ts`.
  i18n `docsEmptyTitle`/`docsEmptyBody` ko/ja/en.

Reason: user asked to implement real 休暇届 generation + document numbering (2026-07-08, next attendance
gap). Verified via lint + build + live render of the 문서 view with real-shaped mock data (doc number,
approver stamp, form fields). Real page shows the empty state until the migration is applied.

Status: Confirmed (2026-07-08).

## Leave queue: list/counts refresh after approve/reject (2026-07-08)

Symptom: after approving your own request the row stayed in 승인 대기 and re-opening it showed
"이미 처리된 신청입니다." Cause: the queue list was frozen (`const [items] = useState(initialItems)`),
so an approve/reject updated the DB (and the panel) but never the client list — the stale row still
looked pending, and a second approve hit `not_requested`. Self-approval itself was never blocked
(platform admin = approver; `approveLeaveRequestForApprover` has no requester≠approver guard), so the
developer can file and approve their own request — confirmed on the real page.

Fix (`leave-queue-client.tsx`): `items` is now stateful; `handleResolved(msg, id, status)` updates the
resolved request in place, so it leaves 승인 대기, moves to 승인 완료/반려, and the status-group tab
counts update immediately. The 승인 대기 summary card (건수·일수) is now derived from the live `items`
(`liveSummary`) instead of the frozen server `summary`, so card and list always agree. Re-opening a
resolved request now shows the read-only detail (no approve/reject, since `canAct = status ===
"requested"`).

Note: a future "전무(senior_managing_director) only" approval restriction is not applied — any approver
(incl. platform admin) can still approve, by design, until that change is requested.

Reason: user tested self-file + self-approve and saw the stale "already processed" state (2026-07-08).
Verified via lint + build + real authed page (approved request now sits correctly in 승인 완료 1 / 승인
대기 0).

Status: Confirmed (2026-07-08).

_Applied to production 2026-07-08 via the Supabase connector (migration `annual_leave_document_number`); backfill assigned AL-2026-07-001 to the first approved request. Note: a platform-admin approver has `approved_role` = null, so neither 部署長/専務 stamp box is sealed for their approvals — only real 대표(department_head)/전무(senior_managing_director) approvers fill a box._

## 休暇届 도장(전자 서명) 디자인 (2026-07-09)

확인: 도장은 이름 앞글자를 딴 자동 생성 도장(빨간 원형 seal). 실제 법적 근거는 승인자 이름+승인 시각 기록(approved_by_user_id/approved_at)이고, seal은 그 시각적 표현.

결정(2026-07-09): 本人 칸은 기존대로 신청자 앞글자 자동 도장 유지. 部署長 칸은 우선 공란. 専務 칸은 실제 전무 도장을 본떠 한자 鄭을 사용 — approved_role=senior_managing_director 승인 시에만 표시. .jp__seal--smd 스타일(똑바로, 얇은 원, 글자 크게)로 촬영한 도장 사진에 맞춤. 현재 鄭은 현 전무 도장으로 하드코딩(추후 승인자별 seal 설정으로 확장 가능).

의존성: 실제 승인건에서 鄭 도장이 뜨려면 leave_approver_role=senior_managing_director 인 전무 승인자가 승인해야 함(승인자 관리 토글은 현재 department_head 기본). 플랫폼 관리자 승인은 approved_role=null 이라 部署長/専務 모두 공란.

Status: Confirmed (2026-07-09).

_2026-07-09 결정: 전무 미가입 상태이므로 専務 도장은 당분간 공란 유지(현 구현이 이미 senior_managing_director 승인 시에만 鄭 표시). 전무 가입 후 (1) 초대·가입 (2) 승인자 관리에 부서장/전무 선택 추가해 전무 지정 (3) 전무 승인 시 鄭 자동 — 순으로 진행 예정._

## 연차 잔여 모바일·어드민 완전 연동 (2026-07-09)

승인된 연차 사용분이 모바일 본인 잔여에도 반영되도록, 사용분 집계를 공용 헬퍼 `sumApprovedLeaveUsage`(annual-leave-server.ts)로 단일화. 유급(paid)->base, 특별(special)->bonus, 승인건만 합산(경조·기타 미차감). getMyAnnualLeaveSummary(모바일)·getApplicantLeaveSummary(신청 모달 미리보기)가 이제 차감하며, listAdminLeaveBalances(어드민 표)도 동일 로직 -> 세 곳 숫자 일치.

Reason: 사용자 요청 "승인 사용분 반영, 모바일과 완전 연동" (2026-07-09). Verified via lint + build + 실제 데이터 집계(유급 1일) 확인.

Status: Confirmed (2026-07-09).

## 연차 이력(승인 장부) 탭 추가 (2026-07-09)

연차 하위에 6번째 서브탭 "이력"(subTabLedger) 추가 — 모든 신청을 장부처럼 시간순으로 보는 읽기전용 표. listLeaveLedger(annual-leave-admin-server.ts)가 draft 제외 전체 상태를 반환(신청자 역할 + 처리자 이름 조인). 컬럼: 신청자·유형·기간·일수·상태·처리자·처리일시·문서번호·사유. 상태 필터(전체/승인/대기/반려/취소) + 검색 + 클라이언트측 CSV(UTF-8 BOM) 내보내기. 상태/검색 클래스는 큐(.fseg/.qsearch) 재사용.

Reason: 사용자 요청 "승인이력을 장부처럼 볼 곳" (2026-07-09, 전체 상태 포함 + CSV). Verified via lint + build + 실제 페이지 렌더(승인건 1 행: 처리자·처리일·문서번호 정상).

Status: Confirmed (2026-07-09).

## 승인 취소(revoke) + 과거 날짜 연차 신청 (2026-07-09)

**승인 취소(대시보드)** — 승인 완료 건을 취소(무효)로 되돌리는 기능.
- Migration `202607090001_annual_leave_cancel_tracking.sql` (applied to production): adds
  `cancelled_by_user_id` + `cancelled_reason` to `annual_leave_requests` (mirrors the reject columns).
- Server `cancelApprovedLeaveForApprover` (`annual-leave-approvals-server.ts`): approver-gated, only from
  `approved`, sets status→cancelled + cancelled_by/reason/at. Approved usage is keyed off
  `status='approved'`, so cancelling **auto-restores the applicant's balance** and drops the request from
  the team calendar / documents. The 休暇届 number is kept (audit) but no longer surfaces. Action
  `cancelApprovedLeaveAction`.
- Frontend: the request detail drawer (`LeavePanel`) shows a danger "승인 취소" button when
  `status==='approved'`, opening the shared `AdminReasonModal` (consequence text + optional reason). On
  success `handleResolved` flips the item to `cancelled` so it leaves 승인 완료 / disappears from the
  calendar immediately and shows in the 이력 장부 as 취소. i18n `panelBtnCancelApproval`/`actionDoneCancel`/
  `actionCancelling`/`promptCancelReason`/`errCancelFailed`.
- The 이력 장부's processor/decision-reason now covers cancelled too (`cancelled_by_user_id` →
  processor, `cancelled_reason` → decisionReason); the mobile self-cancel also records
  `cancelled_by_user_id` so employee cancels show a processor. LeaveLedgerEntry `rejectedReason` →
  `decisionReason` (reject or cancel reason).

**과거 날짜 신청** — leave can now be filed for past dates (mobile + dashboard), e.g. urgent leave taken
first, paperwork filed after.
- The server (`submitLeaveRequestAction`, `createAdminLeaveRequest`/`normalizeDays`) never rejected past
  dates, and the admin modal's native date input already allowed them — only the mobile
  `leave-date-picker.tsx` blocked past days. Removed its past-date guards (tap block, dim/disabled cells,
  prev-month/year disables). Any date (past or future) is now selectable.

Reason: user asked for (1) dashboard revoke of an approved leave [chose "취소(무효)"], and (2) backdated
requests on mobile & dashboard (2026-07-09). Verified via lint + build + real authed page (승인 취소 button
+ confirm modal render on the approved request; not executed against real data).

Status: Confirmed (2026-07-09).
## 2026-07-10 Reservation Calendar Shared Metadata / Export / Beds24 Pause

- Decision: admin reservation calendar `Building info` edits are persisted as shared
  organization-scoped metadata and must be reflected in the mobile calendar as the same source of
  truth.
- Decision: reservation calendar export is not a reservation CSV. The admin export action now opens
  an A4 landscape print surface for browser print / PDF save.
- Decision: Beds24 ingestion stays paused by default during the temporary webhook shutdown period,
  and the calendar chrome should surface this as a paused state instead of a live sync state.

## 2026-07-13 권한 부여를 사용자 화면으로 통일 / 연차 승인자 관리 탭 제거

- Decision: 모든 역할·권한 부여(급여 담당 `attendance_payroll_admin`, 연차 결재자 `leave_approver_role`,
  시간제한 권한 예외 `membership_permission_overrides`)를 **사용자 화면(`/admin/users`)으로 통일**한다.
  부여 UI 가시성은 대표(owner)·개발자 전용.
- Decision: 기능이 사용자 화면으로 이관되므로 연차 콘솔의 **승인자 관리 서브탭을 제거**한다(연차 서브탭 5개로 축소).
  백엔드 헬퍼(`listAdminApprovers`/`setLeaveApprover`)는 사용자 화면 백엔드 재사용을 위해 유지.
- Decision: 사용자 화면 재구현은 `design_handoff_permission_override` 핸드오프를 **100% 디자인만** 먼저
  구현하고, 백엔드는 **디자인 컨펌 후** 진행한다. 그때까지 `leave_approver_role`는 DB 직접 변경만 가능.

Reason: 권한/역할 관리 진입점이 연차 콘솔·사용자 화면으로 분산되어 있어 사용자 화면으로 일원화하기로 함(2026-07-13).

Status: Confirmed (2026-07-13). Step 1(탭 제거+문서) 구현 완료, Step 2(사용자 디자인) 예정.

## 2026-07-13 사용자/권한 모델 개편 — 전무 역할·상태 축소·삭제·사용자관리 접근 통제

두 권한 평면을 명확히 분리한다: **플랫폼 평면**(`developer_super_admin`, `platform_admins`, 크로스-org
최고권한)과 **조직 평면**(`memberships.role` enum). 아래는 확정 결정(2026-07-13).

- **전무(`senior_managing_director`) 조직 역할 추가.** `organization_role` enum에 추가하고 **owner와 완전
  동급(모든 권한)** 으로 취급한다. owner를 검사하는 모든 RLS/서버 게이트를 `isOrgTopAdmin = owner |
  senior_managing_director` 단일 헬퍼로 통일해 스윕(누락 방지). **연차 결재는 전무가 담당** → 연차 결재자
  부여 기본 역할값을 `senior_managing_director`로. 전무/대표는 아직 미가입 — 가입 후 개발자가 직접 부여.
- **개발자는 조직 역할 드롭다운에 넣지 않는다.** `developer_super_admin`은 플랫폼 최고권한이라 일반 역할
  부여 UI로 노출하면 권한 상승 취약점. **개발자 지정은 기존 개발자만** 가능한 별도 경로(=`platform_admins`
  기록)로 한다.
- **상태를 `active`/`inactive` 2개로 축소.** 기존 `invited/removed/suspended`는 통합(초대 흐름 확인 후
  `invited` 처리 결정). **비활성화 = 완전 차단**: 조직 접근은 이미 세션이 active 멤버십만 로드해 차단되지만,
  **로그인(Supabase auth) 차단까지** 확장한다.
- **사용자 하드 삭제 = 가드형.** 기본은 비활성화. **활동 기록(근태·급여·청소·연차 등)이 있으면 하드 삭제
  차단**(기록 파괴 방지). 삭제 허용 시 **로그인 계정(auth user)까지 함께 삭제**. 2단계 확인 UX 필수.
  실수/미활동 계정 정리용으로 한정.
- **사용자 관리 접근을 통제·위임.** `/admin/users`(+ 액션) 접근을 **개발자 기본**으로 좁히고, 개발자가
  **`manage_users` 권한을 위임**할 수 있게 한다. **재위임은 개발자만**(위임받은 사람은 화면은 쓰되 그 권한을
  남에게 넘길 수 없음). 위임자는 자기 이하 역할만 부여 가능(상승 체인 차단).
- **모든 역할·권한 부여를 사용자 화면으로 통일**(재확인). 다른 화면엔 권한 부여 UI를 만들지 않는다.

Reason: 권한 부여가 여러 화면에 흩어져 있고, 최고권한을 일반 드롭다운에 노출/하드삭제로 감사기록 파괴 같은
구조적 위험이 있어, 두 평면 분리 + 사용자 화면 단일화 + 안전 가드로 정리(2026-07-13).

Status: Confirmed (2026-07-13). 단계 구현 예정 — 스키마(enum 2개, `manage_users` 컬럼)·앱 전역 RLS 스윕·
인증 차단·가드형 삭제는 마이그레이션 적용(대표)이 필요.

## 청소/근태/사용자/예약 캘린더 4개 화면 마무리 확정 (2026-07-14)

사용자가 **청소(`/admin/cleaning`), 근태(`/admin/attendance/*`), 사용자(`/admin/users/*`), 예약 캘린더
(`/admin/calendar`)** 4개 어드민 화면을 **완전히 마무리 상태**로 확정했다. 실데이터 연동·라이브 테스트·
사용자 피드백 기반 버그 수정까지 끝난 상태이며, 추가 지시가 없는 한 이 4개 화면에 대한 선제적 리팩터·
기능 추가·디자인 변경은 하지 않는다.

- **범위**: 위 4개 화면과 그 하위 라우트(예: 근태의 `payroll`/`queue`/`roster`/`leave`/`transport`/`wages`,
  사용자의 `[id]`/`invites`)를 포함한다.
- **의미**: "완료"는 향후 변경이 전혀 없다는 뜻이 아니라, **지금 시점에서 알려진 버그·요구사항이 모두
  반영됐고 다음 작업은 사용자가 명시적으로 요청할 때 시작한다**는 뜻이다. 문서(특히
  `docs/product/07-cleaning-workflow.md`, `docs/planning/06-current-status.md`의 각 섹션)는 이 4개
  화면의 최신 구현 상태를 계속 나타내는 기준으로 유지한다.
- **적용 안 됨**: 이 4개 화면이 다른 화면(예: 신규 대시보드, 알림, 대리 신청)의 공용 컴포넌트·서버
  액션·타입을 노출하는 경우, 그 공용 자산에 대한 변경까지 막는 것은 아니다 — 공용 자산 변경이 이
  4개 화면의 동작을 바꾸지 않는 한 별도 협의 없이 진행 가능.

Reason: 청소 대시보드의 디자인 이식 → 백엔드 연동 → 사용자 라이브 테스트 기반 버그 수정(담당자 드롭다운,
KPI 로드실패 표시, 리포트 이동, 소요시간 경고 배지 제거, 지연 상태 제거 등)까지 여러 라운드를 거쳐 완료된
것을 계기로, 근태/사용자/예약 캘린더 3개도 이미 유사한 완성도에 도달했다고 판단해 함께 마무리 선언.

Status: Confirmed (2026-07-14). 상세 이력은 `docs/planning/06-current-status.md` → "Current Build Stage"의
동일 날짜 항목, `docs/product/07-cleaning-workflow.md` 하단 참고.

## 어드민 수리·점검 콘솔 — 디자인 우선 이식, 백엔드 후속 (2026-07-14)

Claude Design 핸드오프(`StayOps 수리 점검 (admin)/수리 점검 현황 (admin).html`)를 `/admin/maintenance`에
**디자인 100% 그대로** 이식하고, **데이터는 전부 목데이터**로 둔 채 백엔드 연동을 다음 사이클로 미룬다.
청소 콘솔이 밟았던 순서(디자인 이식 → 실데이터 연결 → 라이브 버그 수정)를 그대로 반복한다.

사용자 확정 사항 2가지:

- **Excel/PDF 내보내기 버튼 = 제거.** 핸드오프에 없으므로 "디자인 100% 그대로"를 우선한다. 이는
  `docs/product/05-admin-web-ia.md`의 "Excel + PDF 내보내기 — 절대 규칙"에 대한 **한시적 예외**이며,
  서버 액션(`exportMaintenanceWorkbook` / `exportMaintenanceReport`)은 삭제하지 않고 남겨 두었다가
  백엔드 연동 시 공용 `<AdminExportButtons>`로 다시 붙여 예외를 닫는다.
- **데이터 = 전부 목데이터.** 화면이 쓰는 필드(priority, category, 완료 사진, 처리 메모, completedBy,
  연동 예약/청소)가 실제 `maintenance_reports`에 아직 없다. 예외 개입(강제 완료/무효/삭제)도 현재는
  로컬 상태만 바꾼다.

부수 결정: 청소 전용 스타일시트에 있던 공용 콘솔 프리미티브(`.cviewbar` · `.lviews` · `.syncchip` ·
`.ctoolbar` · `.cstat` · `.rptile` · `.hmeta` · `.opscell__v` 상태색 · `.panel .kv`)를 `admin-console.css`로
**승격**했다 — 수리·점검이 두 번째 소비자가 됐기 때문. 복제 대신 승격을 택했다.

또한 "오래된 미해결" 기준을 재기획 문서의 24시간에서 **72시간(`OLD_HOURS`)** 으로 확정했다.

Reason: 백엔드(마이그레이션 4종 + 모바일 폼 카테고리/우선순위 교체)를 먼저 하면 화면 없이 검증이 어렵고,
청소에서 "디자인 먼저 → 데이터 나중"이 잘 동작했다.

Status: Confirmed (2026-07-14). 화면 구현 완료(`npm run lint` 0 errors, `npm run build` 통과, 3뷰·패널·
모달 브라우저 확인). 백엔드 연동은 후속 — `docs/product/08-maintenance-workflow.md` 참고.

## 수리·점검 백엔드 연동 + 모바일 현장 처리 (2026-07-14)

승인된 어드민 콘솔 디자인에 실데이터를 붙이고, **모바일 현장 처리 UI를 신설**했다. 조사 과정에서 문서에도
없던 구조적 문제가 여럿 드러나 함께 정리했다.

**사용자 확정 사항 3가지:**

- **`resolved` 폐기 → `closed`로 병합.** 상태는 접수/처리중/완료/무효 4개로 확정. 현장이 "해결"과
  "완료"를 구분할 수 없어 두 상태가 실질적으로 같게 쓰였다. 기존 `resolved` 행은 `closed`로 이동한다
  (되돌릴 수 없음).
- **모바일 현장 처리 = 전체 구현.** 상태 변경 + 처리 메모 + 완료 사진(≤5, 선택)을 한 번에 저장하는
  "현장 처리" 블록을 상세 화면에 신설.
- **무효 처리는 현장도 가능.** `part_time_staff`만 제외.

**드러난 문제 (전부 수정):**

- 신청 폼의 **카테고리·우선순위·메모가 전부 저장되지 않고 있었다.** 카테고리는 서버가 읽지 않았고
  (컬럼 없음), 우선순위와 메모는 `name` 속성이 없어 폼에 실리지도 않았다. 사용자가 고른 값이 그대로
  버려졌다.
- **모바일에 상태 변경 UI가 없었다.** 문서는 "현장이 모바일에서 처리한다"고 못박고 있었지만 구현된 적이
  없었다. 상태를 바꿀 수 있는 경로는 어드민 상세 페이지 하나뿐이었다.
- **`property_name` 컬럼에 마이그레이션이 없었다.** 타입과 코드는 이미 쓰고 있는데 DDL이 없어,
  `supabase db reset`을 하면 모바일 신청이 깨지는 상태였다.
- **상태 변경이 조용히 실패했다.** RLS가 행을 걸러내면 Supabase는 에러 없이 0행을 돌려주는데 영향 행 수를
  확인하지 않아, 권한 없는 사용자에게도 "변경됨"이라고 응답했다.
- **RLS UPDATE 정책에서 `staff`가 빠져 있었다.** 문서는 Staff의 상태 변경을 허용한다 — 문서를 정답으로
  보고 정책을 정정했다.

부수 결정: "오래된 미해결" 기준 **72시간**(`MAINTENANCE_AGING_HOURS`). 재실 중·오래된 미해결은 저장하지
않고 조회 시 파생한다. 카테고리는 **10종**으로 교체(기존 8종은 저장된 적이 없어 데이터 마이그레이션 불필요).
**Excel/PDF 내보내기는 두지 않기로 확정했다** — 수리·점검은 외부로 넘길 산출물이 아니라 현장이 처리하고
콘솔이 감시하는 운영 기록이다. 버튼과 서버 액션을 모두 삭제했고, 이는 `05-admin-web-ia.md`의 내보내기
절대 규칙에 대한 **확정 예외**다(그 규칙은 *내보내기를 제공하는 화면*이 두 포맷을 함께 내야 한다는
뜻이지, 모든 화면이 내보내기를 가져야 한다는 뜻이 아니다).

Reason: 디자인을 먼저 승인받고 백엔드를 붙이는 순서(청소 콘솔과 동일)가 검증에 유리했고, 실제로 그 과정에서
"UI는 있는데 저장이 안 되는" 유령 필드들이 드러났다.

Status: ✅ **완료 (2026-07-15 확정).** 코드 완료 — `npx tsc --noEmit` 0, `npm run lint` 0 errors,
`npm run build` 통과. 마이그레이션 `202607160001_maintenance_backend.sql` **적용 완료** — 원격
Supabase 프로젝트에서 컬럼·enum·인덱스·RLS·스토리지 정책을 직접 확인했다. 라이브 DB에 사진 첨부
테스트 신고 6건을 삽입해 신고·완료 사진의 스토리지 업로드/public 읽기까지 실검증(스토리지 정책 통과).
유일한 후속 항목인 긴급 건 푸시 알림은 프로젝트 전체 알림 단계에서 일괄 구현한다.

## 분실물 모바일 반환(현장 처리) — 수리·점검과 동일 매커니즘 이식 (2026-07-15)

Decision: 분실물도 수리·점검과 **동일한 매커니즘**(현장이 모바일에서 처리 + 감시 콘솔 + 배정 없음)을
쓴다. 손님에게 물건을 넘긴 결말을 담는 **`returned`(반환완료)** 상태를 신설하고, **등록자와 무관하게
누구나(파트타임 제외) 모바일에서 반환 처리**할 수 있으며 처리자·시각이 기록으로 남는다.

Reason: 기존 4상태는 "폐기"로만 끝나 물건이 주인에게 돌아가는 결말을 담지 못했다. 무인 숙소 특성상
물건을 쥔 현장 스태프가 그대로 반환하므로, 반환을 모바일 현장 처리로 두는 것이 실제 운영과 맞는다.
반환은 되돌릴 수 없어 저장 전 canonical BottomSheet로 완료 확인한다.

Scope: **이번은 모바일까지.** 대시보드(어드민)의 반환 이력 표시·예외 개입 UI는 후속. 무효·삭제 같은
예외 개입은 어드민 몫(모바일 처리 화면에는 없음).

Status: 코드 완료 — `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과. 디자인
(Claude Design 핸드오프) 100% 이식. **마이그레이션 `202607170001_lostfound_return.sql`은 대표님이
Supabase 대시보드에서 적용**해야 한다(수리·점검과 동일) — 적용 전에는 화면이 없는 컬럼을 읽으려다
깨진다. 적용 후 라이브 E2E 1회 권장.
