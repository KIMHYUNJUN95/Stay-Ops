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

- **출시 전 보안 감사 결과 + 수정 (2026-07-22).** 서버 액션 37개·`lib/*` 헬퍼·API 라우트 10개·인증/미들웨어/
  서비스클라이언트 전수 읽기 전용 감사. **출시 차단급 유출/변조 취약점 없음**(org 스코프+ownership+role 재검증
  패턴이 일관·방어적). **수정 3건:** ① [조직 격리 버그] `deactivateInviteCode`(`admin/settings/actions.ts`)에
  서비스롤 UPDATE의 `.eq("organization_id")` 누락(형제 activate/delete엔 있음) → 타 org 초대코드 비활성화
  가능했음 → 형제와 동일하게 org 필터 추가. ② `lib/supabase/service.ts`·`server.ts`에 `import "server-only"`
  가드 추가(클라이언트 import 컴파일 타임 차단; 빌드로 현재 위반 0 확인). ③ `signInWithGoogle`의 URL
  `console.log` 2줄 제거. **오너 결정 후 반영(2026-07-22):** (a) 주문 상태 처리 권한 → **사무실·관리자(adminWebRoles)만**으로 확정
  (문서 기준). `mobile/requests/orders/actions.ts`의 `ORDER_PROCESSOR_ROLES`에서 `field_manager` 제거 +
  주문 상세 UI(`orders/[id]/page.tsx`)도 `canProcessOrder`(adminWebRoles)로 처리 바를 게이트해 비처리
  역할엔 처리 버튼 미노출(안 되는 버튼 방지). (b) 웹훅/크론 `?secret=` 쿼리 수용 → **현행 유지**(오너 결정,
  변경 없음). `npm run lint`/`npm run build` 통과.
- **출시 전 위생 배치 + 보안/RLS 감사 착수 (2026-07-22).** 지금 환경에서 완결 가능한 출시-전 항목부터.
  ① **검색엔진 색인 차단**: 비공개 초대제 앱인데 크롤링 차단이 없어, `src/app/robots.ts`(전면 disallow) +
  루트 metadata `robots: { index:false, follow:false }` 추가 → 로그인/앱 페이지가 검색에 안 뜸. ②
  **`.env.example` 보강**: 누락 변수 4개(`BEDS24_API_REFRESH_TOKEN`·`BEDS24_SYNC_PAUSED`·
  `ENABLE_DEV_SEED_LOGIN`·`DEV_SEED_LOGIN_PASSWORD`) 추가로 실제 env와 일치. ③ **보안/RLS/프로덕션 준비
  감사** 착수(읽기 전용): org 격리·service-role 노출·auth 라우팅·입력 검증·dev 라우트 프로덕션 도달·시크릿
  누출을 전수 점검해 심각도별 액션 리스트 산출 중. **지금 환경에서 불가(별도 인프라/결정 필요):** Capacitor
  네이티브 래핑(Mac/Xcode/Apple 계정·스토어 제출), Sentry(계정/DSN), Vercel Pro(비용), 법무(개인정보/약관),
  E2E 실행(브라우저/시드로그인). `loading.tsx`는 셸이 페이지별 렌더라 넣으면 로딩 중 크롬 사라져 제외.
  `npm run lint`/`npm run build` 통과(`/robots.txt` 생성 확인).
- **낙관적 UI — 조사 + 남은 갭 보강 (2026-07-22).** "낙관적 UI를 붙여달라"(디자인 불변). 조사 결과 **큰
  타깃은 이미 낙관적**이었다: 할일 완료 토글(행 즉시 숨김 + undo, `tasks-workspace`), 보드 리액션
  (`useOptimistic`, `board-detail-client`), 알림 스와이프 삭제, 공지 팝업 dismiss(로컬 상태 즉시 닫힘).
  나머지 mutation은 대부분 **내비게이션형 폼 제출**(수리/주문/분실물 생성, 청소 시작/완료 = `redirect`)이라
  낙관적 대상이 아니고 pending 상태가 올바른 패턴. **보강한 것:** 알림 **"모두 읽음"을 `useOptimistic`으로**
  낙관적 처리 — 탭 즉시 모든 안읽음 표시 제거 후 서버 확정(`router.refresh`가 최신으로 re-base). 컴포넌트·
  스타일 불변, 타이밍만 즉시. `npm run lint`/`npm run build` 통과. 더 큰 "즉시감"은 이후 Capacitor 래핑(네이티브
  전환·프리페치) 결정 영역.
- **모바일 네이티브 감 — 즉시 가능한 안전 배치 구현 (2026-07-22).** (다크모드는 추후 별도.) ① **탭 재탭 →
  최상단 스무스 스크롤**(iOS 표준): 이미 활성인 하단 탭을 다시 누르면 내비게이션 대신 콘텐츠를 최상단으로
  스크롤 + 사이드바 닫기(`mobile-shell.tsx` `renderTab` onClick, `prefers-reduced-motion` 존중). ② **햅틱
  유틸 신설**(`src/lib/haptics.ts`): Vibration API 지원 시(Android·향후 네이티브 래퍼) 진동, iOS Safari/
  standalone은 안전한 no-op. 탭 재탭(light)·당겨서 새로고침 발동(medium)에 연결. 향후 Capacitor 래핑 시
  `@capacitor/haptics`로 교체하면 호출부 불변. **광범위·검증불가라 이번에 제외한 것(별도 배치 필요):**
  낙관적 UI(기능별), 리스트 스와이프 액션(기능별), 입력 키보드 힌트 전면화(공용 Input 블랭킷 위험),
  상태바 immersive(외형 변경 위험). 근본 개선(App Store 출시·안정 푸시·iOS 햅틱 실체감)은 **Capacitor
  네이티브 래핑 결정** 이후. ③ **모바일 검색창 → 검색 키보드**: 모바일 검색 input 6곳(반환/폐기 분실물,
  Todo 검색, 컨텍스트/공유 피커, 보드 멘션)에 `type="search"`·`enterKeyHint="search"`·`autoCapitalize=none`·
  `autoCorrect=off` 추가(돋보기 리턴키+클리어 버튼+오토수정 끔). 온보딩·계정 신원 필드(이름·전화·이메일·
  초대코드)와 주문 수량(`inputMode=numeric`)은 이미 시맨틱 적용돼 있어 그대로. `npm run lint`/`npm run build` 통과.

- **모바일 모션 네이티브화 — 공용 모션 토큰 + 커브 일괄 통일 (2026-07-22).** "바텀시트 등 움직이는 것들을
  전부 네이티브처럼 부드럽게" 요청. 감사 결과 심각한 jank(레이아웃 속성 애니메이션·`transition: all`)는
  없었고(이미 transform/opacity 기반), 셸·사이드바·바텀시트·화면전환은 이미 iOS 커브. 남은 "웹 느낌"은
  일반 `ease` 커브가 77곳에 흩어져 제각각인 점. 수정: **`globals.css`에 모션 토큰 신설**
  (`--ease-ios`/`--ease-out`/`--ease-spring` + `--dur-press/fast/base/slow`), 모바일 표면 CSS
  (home-screen·attendance·transport·leave·complaints·suggestions)의 탭 피드백 transform transition을
  `var(--dur-press) var(--ease-out)`(스냅감 있는 ease-out)로 통일, 독립 `ease` 커브를 `var(--ease-out)`로
  일괄 스왑(지속시간 유지, `ease-in/out`은 미변경). 탭이 더 크리스프해지고 앱 전체가 한 모션 언어로 수렴.
  어드민(데스크톱) CSS는 범위 밖. JS 셸/시트는 이미 동일 커브라 유지. `npm run lint`/`npm run build` 통과.

- **어드민 공지 관리 콘솔 재구현 완료 (2026-07-23).** 2026-07-22 재기획 명세대로 `/admin/announcements`
  를 Claude Design 핸드오프("StayOps 공지 관리 (admin)") 기준 1:1 콘솔로 재구현했다. 좌측 고정 생성
  카드를 걷어내고 **KPI 요약 바(게시중/초안/중요/팝업/중요·미읽음) + Published/Drafts/Archived 3 상태
  세그먼트 + 고밀도 목록 표 + 우측 상세 패널**로 재구성했다. 상세 패널은 **작성 zone ↔ 운영 zone** 권한
  분리 UI를 갖고, 새 공지/편집·게시/재게시/보관/초안 복귀/삭제 확인·읽음 현황(대상자 명단, 감사용)·이미지
  뷰어 모달을 포함한다. 신규: `src/lib/admin-announcements.ts`(도달·읽음 파생 지표 배치 로드), 결과 반환형
  서버 액션(`saveAnnouncementConsole`/`setAnnouncementStatusConsole`/`deleteAnnouncementConsole`/
  `getAnnouncementReadStatusConsole`), `announcement-i18n.ts` `console` 네임스페이스(ko/ja/en),
  `src/components/admin/announcements/*`(+`announcements-console.css`). 콘솔 페이지에서 앱-오픈 팝업
  미리보기·고아 이미지 정리 버튼 UI는 제거(서버 로직은 유지). `/admin/announcements/[id]` 상세 + 기존
  redirect 액션은 fallback/레거시로 유지. `npm run lint` 0 errors, `npm run build` 통과. 기준 문서:
  `docs/product/11-announcement-workflow.md`, `docs/product/05-admin-web-ia.md`.

- **iPhone PWA 첫 진입 흰 화면 — Apple 런치 스플래시 커버 구멍 수정 (2026-07-22).** "누르자마자 화면이
  안 뜨고 흰 화면이 길다"는 지적. 원인: iOS는 PWA를 띄우기 전 `apple-touch-startup-image`(기종별 이미지)를
  보여주는데, **커버 목록에 흔한 기종이 빠져** 매칭 실패 시 iOS가 흰 화면을 첫 페인트까지 표시. 빠진 크기:
  `375×812@3x`(X·XS·11 Pro·12/13 mini), `414×896@3x`(XS Max·11 Pro Max), `414×896@2x`(XR·11) — 특히 mini를
  `360×780`으로 잘못 넣어 매칭 안 됨. 수정: `scripts/gen-splash.mjs`에 3개 크기 추가 → 아이보리(#f7f4ee)+로고
  스플래시 재생성(11장), `src/app/layout.tsx`에 `<link rel="apple-touch-startup-image">` 3개 추가. 이제 해당
  기종도 첫 진입에 흰 화면 대신 아이보리+로고가 즉시 떠 네이티브처럼 매끄러움. 스플래시 배경은 이미 아이보리라
  커버되던 기종은 영향 없음. `npm run lint`/`npm run build` 통과.

- **iPhone 설치형 PWA 콜드스타트 느림 — 원인 진단 + 1차 서버 TTFB 최적화 (2026-07-22).** 조사 결과 3개
  원인: ① 서비스워커가 HTML/RSC를 캐시 안 함(network-first)이라 매 콜드런치가 풀 서버 렌더를 대기 ②
  `/mobile` 첫 바이트가 **auth 2회 + Supabase 10~20 왕복(일부 워터폴)** 뒤에 갇힘 — 특히 공용
  `getCurrentAppSession`이 getUser→profiles→platform_admins→memberships→organizations→profiles를
  순차 실행 ③ 가끔 Vercel serverless 콜드스타트. **1차 수정(안전·순수 이득, staleness 없음):**
  `getCurrentAppSession`에서 user.id만 필요한 4개 쿼리(profiles·platform_admins·memberships·nav
  profiles)를 `Promise.all` 병렬화(공용 크리티컬 패스라 모바일·어드민 전 렌더에 이득), 홈의
  `getMobileNotificationBadge()`를 뒤 순차 await → 메인 배치 병렬로 이동. **2차 수정(홈 스트리밍, 안전·
  staleness 없음):** `/mobile` 홈을 셸+인사말(세션만 필요)은 즉시 렌더하고, 데이터 6종(체크인/아웃·오늘
  활동·근태·공지·청소 세션)은 `HomeBody` 컴포넌트로 분리해 **`<Suspense>` 뒤에서 스트리밍**(스켈레톤
  fallback). 첫 페인트가 데이터 전부를 기다리지 않아 "화면 뜨는" 체감이 빨라짐. 데이터는 여전히 매
  로드마다 최신(캐시 아님). **3차 수정(SW 앱 셸 캐시 — 대표님 승인 2026-07-22, stale 트레이드오프 감수):**
  서비스워커가 **콜드런치 문서(전체 HTML)를 stale-while-revalidate**로 캐시 → 열자마자 이전 화면 즉시
  표시 후 백그라운드 재검증. 안전장치: ①성공·동일출처·비리다이렉트 HTML만 캐시(로그아웃→login 리다이렉트는
  stale 사본 **제거**), ②stale 표시 후 SW가 클라이언트에 메시지 → `router.refresh()`로 조용히 최신화(리다이렉트면
  하드 reload). 앱 내부 RSC 이동은 미영향(항상 최신). `getMobileNotificationBadge()`도 병렬로 이동.
  `npm run lint`/`npm run build` 전부 통과. **남은 후보(미착수·후순위·비용):** Vercel 함수 웜 유지. 근거
  `docs/planning/01-decision-log.md` → 2026-07-22 SW 앱 셸 캐시.

- **대시보드 `체크인/아웃` 독립 메뉴 폐기 — 예약 캘린더 통합으로 정리 완료 (2026-07-22).**
  관리자 사이드바에 남아 있던 `/admin/check-in-out`은 실제 기능 없는 플레이스홀더였고, 실운영 기능은
  이미 `/admin` 홈 요약과 `/admin/calendar`의 `Today ops`에 들어가 있었다. 기능 중복 IA를 없애기 위해
  **사이드바 `체크인/아웃` 항목과 플레이스홀더 라우트 `/admin/check-in-out`을 삭제**했다. 문서도 이에
  맞춰 "독립 체크인/아웃 모듈"이 아니라 "예약 캘린더 통합 운영 기능"으로 정렬했다. 관련 파일:
  `src/config/navigation.ts`, `docs/product/05-admin-web-ia.md`, `docs/planning/01-decision-log.md`.

- **Beds24 숙소 매핑 중복(가부키초=176431) 근본 수정 — 완료 (2026-07-22).** 예약 캘린더에서 가부키초가
  "가부키초"+"176431" 두 건물로 쪼개져 보이던 문제. 원인: 예약 property_name을 Beds24 payload 기준으로
  저장하는데 `propName`이 빠진 응답은 raw `propId`("176431")로 폴백 + `room-sync`가 매 동기화마다 마스터
  이름을 payload 값으로 덮어써 마스터 자체가 "176431"로 변질. **코드 3곳 수정**(room-sync는 propName
  없으면 마스터 이름 미변경, backfill·webhook은 external_property_id로 조회한 마스터 이름 우선)으로 어느
  경로든 건물명이 property 마스터 하나로 수렴 → raw-id 건물 재발 방지. **데이터 정정**: 마스터 이름 재확정
  + raw-id 예약을 external_property_id 매칭으로 일괄 병합 → 사무실 org 예약 8개 건물 클린(raw-id 0, 합계
  1904). 배포(`8fa6664`) READY. 상세 `docs/planning/01-decision-log.md` → 2026-07-22 숙소 매핑 중복.

- **Beds24 웹훅 전량 400 유실 — 근본 수정 (코드 완료, 배포/복구 진행 중) (2026-07-22).** "다카다노바바
  7층 예약 고객 누락" 제보에서 출발했으나, 실제로는 **2026-07-17 이후 전 숙소 신규·취소·변경 예약이
  통째로 누락**된 사고였다. Beds24는 웹훅을 계속 보내는데 라우트가 예약 후보를 못 찾으면 **관측 로그도
  없이 HTTP 400으로 조기 드롭**해 5일치가 흔적 없이 사라졌다(2026-06-10 유실 사고의 재발 클래스).
  근본 수정 3종: ① **본문 파싱 견고화**(JSON+form-urlencoded, JSON 담은 폼 필드 언랩) ② **envelope 무관
  추출**(고정 키 대신 모든 중첩 객체 재귀, `booking` 등 어떤 wrapper도 탐지, id로 중복 제거) ③ **무손실
  캡처**(못 뽑은 배치는 원본 본문+Content-Type을 `beds24_webhook_events.raw_payload/content_type`에 저장 후
  2xx ACK — 다시는 조용히 유실되지 않음). 신규 마이그레이션 `202607220001_beds24_webhook_raw_capture.sql`
  (원격 적용 완료). `npm run lint`/`npm run build` 통과. 배포 완료(`4b1f1b2`, 프로덕션 READY).
  **누락분 복구 완료(2026-07-22):** 로컬 dev 백필(org 사무실, 2026-06→2028-01)로 Beds24 재풀 → 사무실
  org 예약 1813→**1904건**(2027-01-26까지), 다카다노바바 7층 7/17 이후 신규 예약 정상 복구.
  **라이브 웹훅 2xx 검증 완료(2026-07-22 01:22):** 실제 Beds24 웹훅이 새 배포에서 `upserted` 200으로
  처리됨(시스템 최초의 성공 webhook 이벤트). **자동 안전망 복원:** Vercel 크론이 안 뜨는 원인은
  스케줄러 미발화(엔드포인트는 수동 호출 시 200 정상)로 확정 → `.github/workflows/beds24-reconcile.yml`
  **6시간 외부 트리거**로 이중화(GitHub repo Secret `BEDS24_WEBHOOK_SECRET` 1회 설정 필요). task
  reminders 미발화는 알림 막바지 일괄구현 방침상 정상. 미사용 org `현장 근무`(멤버 0)는 보류. 상세
  `docs/planning/01-decision-log.md` → 2026-07-22, `docs/engineering/07-environment-setup.md` →
  "Webhook ingestion hardening (2026-07-22)".

- **Beds24 실연동 활성화 + 예약 캘린더 스케일 버그 수정 — 구현 완료 (2026-07-17).** 프로덕션 웹훅을
  활성화(`BEDS24_SYNC_PAUSED=false`, org 기본값, refresh token 경로)하고 8개 숙소 전부 웹훅 URL 확인 →
  실시간 신규·취소 무손실. 운영 윈도우를 **당월+미래 2달(3개월)**로 확대(도착일 기준이라 예약 시점 무관).
  광역 백필(2026-06~2027-12)로 먼 미래 예약 seed(사무실 org 1815건, 미래 확정 498, 2027-01까지). `Arakicho A`
  external_property_id null 수정 + 룸 마스터/인벤토리 재동기화 → 룸 매핑 전부 정상(unknown 0). 예약 캘린더
  버그 3종 수정: **크래시**(`.in()` 510건 URL 초과 → `chunk()` 200개 분할, 어드민+모바일 공통), **월-경계 바
  누락**(다음달 1일 체크아웃이 점으로 찌부러짐 → `endsAfterMonth` `>`→`>=`), **어드민 청소 룸 라벨 raw
  표시**("501_2"→"501", `getDisplayRoomLabel` 적용). 검증: tsc·lint·build 통과. 상세
  `docs/planning/01-decision-log.md` → 2026-07-17, `docs/engineering/07-environment-setup.md` → Beds24.
- **iPhone 설치형 PWA 홈 콜드스타트 경량화 — 구현 완료 (2026-07-17).** 홈 화면 추가로 설치한 iPhone
  standalone 앱에서 첫 진입이 느리게 느껴지던 원인을 줄이기 위해, 실제 초기 경로의 지연 요소를
  저위험 위주로 정리했다. `src/components/pwa/splash-screen.tsx` 의 런치 스플래시는
  **약 850ms hold + 420ms fade → 160ms hold + 180ms fade** 로 대폭 축소됐고, 페이드 중 터치를
  막지 않도록 **항상 `pointer-events: none`** 으로 바꿨다. `middleware.ts` 는 이제 보호 경로와
  로그인 페이지가 아닌 요청에서 `supabase.auth.getUser()` 를 건너뛰어 공개 라우트의 불필요한 auth
  왕복을 피한다. `/mobile` 홈(`src/app/mobile/page.tsx`)은 더 이상 `getOnboardingState()` 를 추가로
  호출하지 않고 `getCurrentAppSession()` 하나만 사용해 미완성 세션을 `/onboarding` 으로 보낸다.
  또한 홈의 중요 공지 카드는 `src/lib/announcements.ts` 신규 헬퍼
  `getHomeImportantAnnouncement()` 으로 **최신 중요 공지 1건만** 읽도록 바꿨고, 초기 shell badge는
  `src/lib/nav-badges.ts` 의 `getMobileNotificationBadge()` 로 **알림 카운트만** 먼저 읽어 전체
  청소/요청/공지/게시판 badge fan-out을 첫 홈 렌더에서 제외했다. 결과적으로 iPhone 홈 화면 설치형
  PWA의 콜드스타트 체감 지연이 줄었다. 세부 계약은 `docs/product/16-mobile-navigation.md` 의
  launch splash / home cold-start query trimming 항목에 반영했다.

- **주문·비품 어드민 운영 콘솔 — 구현 완료 (2026-07-16).** `/admin/orders`가 구형 플랫 목록에서 청소·
  수리·점검·분실물과 같은 **4뷰 운영 콘솔**로 교체됐다: ① 현황 보드(승인대기/주문대기/주문완료 3칼럼) ②
  목록·이력(기간·상태·건물·요청자·긴급도 필터+검색) ③ **배송 예정 캘린더**(어드민에 신설, 건물별 필터)
  ④ 종결(ordered+closed 아카이브). KPI 5칸 + 우측 상세 패널(품목 도메인 배지·클릭 링크·사진, 타임라인,
  능동 처리, 예외 개입) + 8종 액션 모달(approve/reject/process/editdeliv/reopen/correct/edit/delete).
  **신규 마이그레이션 `202607190001_orders_console.sql`**이 `order_requests`에 `admin_memo text`
  (nullable) 컬럼을 추가(RLS 불변, 원격 Supabase 적용 완료) — 기획 단계의 "스키마 변경 없음"에서 정정.
  **신규 서버 액션 4종**(`rejectOrder`/`reopenOrder`/`correctOrderStatus`/`editOrder`,
  `src/app/admin/orders/actions.ts`) — 기획 단계의 "재오픈 1종"에서 확대. VM 레이어
  `src/lib/admin-orders.ts`(`getAdminOrders`)가 DB `received` 상태를 콘솔에서 `ordered`로 매핑(표시는
  4상태만). **긴급도(urgency) 배지+필터+정렬 신설.** 구 상세 라우트 `/admin/orders/[id]`는 패널로 대체된
  고아 라우트여서 **2026-07-17에 삭제**(파일·`[id]` 디렉토리 제거; 공유 헬퍼는 모바일 상세에서 계속 사용).
  마이그레이션 `orders_console`는 원격 `schema_migrations`에 version `20260717005554`로 등록(2026-07-17).
  기존 승인/주문처리/배송일수정/삭제 액션과
  Excel/PDF 내보내기(`OrdersExportBar`)는 그대로 재사용. 알림·입고(`received`활성화)·카탈로그·재고는
  범위 밖. `npm run lint` / `npm run build` 통과. 상세 `docs/product/10-order-request-workflow.md` →
  "주문·비품 어드민 운영 콘솔 (구현 완료 — 2026-07-16)", 근거 `docs/planning/01-decision-log.md` →
  2026-07-16 "Status update".
- **주문·비품 어드민 운영 콘솔 — 기획 확정, 구현 전 (2026-07-16, → 위 항목에서 같은 날 구현 완료됨).**
  `/admin/orders`가 아직 구형 플랫 목록이라 청소·수리·점검·분실물과 같은 운영 콘솔 패턴으로 재구축하기로
  기획 확정. **4뷰**(현황 보드 3칼럼 / 목록·이력 / **배송 예정 캘린더(어드민 신설)** / 종결), 능동 처리
  (승인·거절·주문처리·배송일수정·**재오픈**·삭제), **긴급도 배지+필터+정렬 신설**. 재사용: 데이터 헬퍼·
  능동 처리 서버 액션·Excel/PDF 내보내기 전부 기존 것, DB 스키마 변경 없음(재오픈 서버 액션만 신규) —
  **이 기획 당시 예상은 위 구현 완료 항목에서 정정됨(admin_memo 컬럼 추가, 신규 액션 4종)**. 알림·
  입고(`received`)·카탈로그·재고는 범위 밖. 근거 `docs/planning/01-decision-log.md` → 2026-07-16.
- **대시보드 분실물 관리 콘솔 — 구현 완료 (빌드 그린) (2026-07-16).** `/admin/lost-found`가 목록+필터폼
  에서 **4뷰 운영 콘솔**로 교체됐다: ① 현황 보드(접수/보관중/폐기예정) ② 목록·이력 ③ **완료**(반환+폐기
  아카이브 — 반환 방식·송장·종결시각) ④ **폐기 내역**(폐기됨만, 삭제 예정일 D-day·90일 자동삭제 안내
  배너). 우측 상세 패널 + 능동 처리 모달(반환/폐기/보관 연장) + 예외 개입(상태 정정/**복원**/삭제).
  **복원(2026-07-16)**: 완료(폐기/반환) 건을 보관중으로 되돌린다 — 상태 `stored`, 보관 시계 복원일+14일,
  처리 메모에 복원 사유 append(`restoreLostItem`). 내보내기 없음·무효(void) 없음. 구
  `/admin/lost-found/[id]` 상세 라우트·`lost-found-export-bar.tsx`는 **삭제**됐다.
  **모바일 폐기 내역 목록(2026-07-16)**: 대시보드 폐기 내역과 대칭되게 모바일에도 폐기 전용 목록
  `/mobile/requests/lost-found/disposed`(`DisposedLostFoundList`)를 신설. 반환완료 목록 1:1 미러(슬레이트
  톤), 분실물 탭에 두 번째 진입 pill, 읽기 전용, 처리 라인 자동/수동 구분, 90일 삭제시계 미표시.
  데이터 `getDisposedLostItems`. `npm run lint`/`npm run build` 통과.
  반환 방식은 기획 초안의 `shipped`/`picked_up`이 아니라 **`delivery`(배송)/`pickup`(방문 수령)**으로
  최종 구현. 품목 분류(`category`, 9종) 신설, 모바일 등록 폼에도 반영. 자동 생애주기(등록일+14일 →
  자동 폐기 → 폐기 내역 90일 → 자동 하드 삭제)는 `public.lostfound_auto_dispose()` /
  `public.lostfound_auto_purge()`(SECURITY DEFINER) + pg_cron 매일 1회로 마이그레이션
  `202607180001_lostfound_console.sql`에 구현됐다. **✅ 마이그레이션 원격 Supabase 프로젝트 적용
  완료(2026-07-16, MCP) — pg_cron 확장 활성화 + 배치 잡 2종 등록 확인됨.** `npm run lint` /
  `npm run build` 통과. 상세는
  `docs/product/09-lost-found-workflow.md` → "대시보드 분실물 관리 콘솔", 결정 근거는
  `docs/planning/01-decision-log.md` → 2026-07-16 Status update.
- **대시보드 분실물 관리 콘솔 — 기획 확정 (2026-07-15, 자동 생애주기 2026-07-16 추가, → 위 항목에서
  구현 완료).** 등록된
  분실물을 관리·감시할 어드민 콘솔을 기획했다. 수리·점검 콘솔과 같은 매커니즘(감시 + 이력 + 예외 개입)에
  **분실물 한정 능동 처리 3종(반환 · 폐기 · 보관 기간 연장)**을 더한다 — 배송 반환은 사무실이 직접 하기
  때문. **자동 생애주기(2026-07-16 확정, 이전 "수동 폐기" 대체):** 등록일 + 14일 → **자동 폐기(`disposed`)**
  → **폐기 내역** 이동, 폐기일 + 90일 → **자동 하드 삭제**. 연장(`hold_until`) 건은 자동 폐기 제외. →
  콘솔은 **4뷰**(현황 보드 / 목록·이력 / 반환완료 / **폐기 내역**). 폐기 내역 뷰는 삭제 예정일(폐기+90일)
  D-day·삭제 임박(D-7)을 보여준다. 반환 방식은 배송/직접수령 구조화(+송장번호). 필요 스키마
  (`return_method`, `return_tracking_no`, `hold_until`) + **매일 1회 스케줄 작업(pg_cron/Vercel Cron)**은
  구현 사이클에서 추가한다. 무효(void) 상태 없이 잘못된 등록은 **수동 하드 삭제만**, **내보내기 없음**.
  화면·백엔드는 (2026-07-16 정정) **위 항목대로 구현 완료됐다.** 전체 명세는
  `docs/product/09-lost-found-workflow.md` → "대시보드 분실물 관리 콘솔", 결정 근거는
  `docs/planning/01-decision-log.md` → 2026-07-16 / 2026-07-15 항목.
- **어드민 캘린더 / Excel·PDF 내보내기 전면 통일 — 완료 (2026-07-14).** 콘솔 전체를 두 개의 캐논
  패턴으로 통일했다. **캘린더**: `AdminDateRangePicker`(기간) / `AdminDatePicker`(하루) /
  `AdminMonthPicker`(월) 3개만 사용하고, 팝오버 크롬은 청소 기록 탭의 `.calpop`에 맞춰 정렬. 분실물·
  수리점검·주문 필터바, 연차 신청 모달, 연차 잔여 입사일 편집에서 네이티브 `<input type="date">`를
  전부 제거했다. **내보내기**: 공용 `<AdminExportButtons>`(`chipbtn` + `Download` ×2) +
  `buildAdminTableWorkbookBase64()` / `buildAdminTableReportHtml()` 단일 빌더로 통일. 분실물·수리점검·
  주문의 CSV는 **실제 Excel+PDF로 교체**했고, 연차 이력의 Blob CSV도 교체했으며, 동작하지 않던 스텁
  버튼(근태 수당, 연차 잔여)을 **실제 구현**했다. 연차 이력에는 없던 날짜 범위 필터를 신규 추가.
  구 CSV 경로(`/api/admin/export/[resource]` 라우트, `lib/export/admin-export.ts`, `lib/export/csv.ts`,
  `ExportCsvLink`)는 **전부 삭제** — CSV는 폐기됐다. 이 두 패턴은 이제 **절대 규칙**이며
  (`CLAUDE.md` §4a/§4b), 앞으로 추가되는 모든 어드민 화면에 무조건 적용한다. 결정 근거·적용 표는
  `docs/planning/01-decision-log.md` → 2026-07-14 "어드민 캘린더 / 내보내기 공용 캐논 확정" 참고.
- **청소 / 근태 / 사용자 / 예약 캘린더 — 마무리 확정 (2026-07-14).** 사용자가 이 4개 어드민 화면
  (`/admin/cleaning`, `/admin/attendance/*`, `/admin/users/*`, `/admin/calendar`)을 완전히 마무리
  상태로 선언했다. 실데이터 연동, 라이브 테스트, 사용자 피드백 기반 버그 수정까지 끝났고, 추가
  지시가 없는 한 이 4개 화면에 선제적 변경을 하지 않는다 — 다음 작업은 사용자가 명시적으로 요청할
  때 시작. 결정 근거·범위는 `docs/planning/01-decision-log.md` → 2026-07-14 "청소/근태/사용자/예약
  캘린더 4개 화면 마무리 확정" 참고. 청소의 최종 구현 상태는 아래 항목들과
  `docs/product/07-cleaning-workflow.md`에 남아있다.
- **Organization rename + guarded delete added (2026-07-14).** `/admin/settings/organization`
  (developer-only) now supports **rename (name only)** via `updateOrganization` and **delete** via
  `deleteOrganization`. Delete is **guarded to EMPTY orgs (zero members)** because every org-scoped
  table FKs `organization_id` with `ON DELETE CASCADE` — deleting a populated org would wipe all its
  data. Non-empty orgs show a "empty it first" note instead of a delete button; the server re-checks
  and rejects with `org_not_empty`. Slug stays fixed (referenced by links/caches). Create already
  existed. Page still uses the legacy shadcn styling (design unification pending).
- **Org model direction decided (2026-07-14): single org + field/office view label (Option A).** The
  user clarified that "one team split only for viewing" should NOT become multiple data-isolated orgs
  sharing data (that would require gutting the RLS/isolation model). Instead, an org stays the tenant
  boundary, and a **field/office (site/department) attribute becomes a view/filter dimension WITHIN one
  org** so all data is naturally shared. **Phase 1 implemented (2026-07-14): the label attaches to
  `memberships` via a new `teams` table** (`kind` = field/office, `name` for future sub-teams). New
  migration `supabase/migrations/202607140001_teams.sql` (seeds 현장/사무실 defaults per org + backfills
  existing members by role; RLS = org-member SELECT, service-role writes) — **written but not yet
  applied** to the linked Supabase project. `src/types/database.ts` hand-updated. New server action
  `setMemberTeam` (`src/app/admin/users/actions.ts`) and helper `getOrgTeams`
  (`src/lib/teams.ts`). `/admin/users/[id]` gained a 소속 (현장/사무실/미지정) dropdown + save; `/admin/users`
  directory gained a 소속 column + filter. i18n added ko/ja/en (`admin.users.console.team*`,
  `filterAllTeams`). tsc 0 / lint 0 errors. **Later phases (not built):** team CRUD (creating sub-teams
  beyond the two defaults) and team filters on 근태/청소/대시보드 screens. See
  `docs/planning/01-decision-log.md` → 2026-07-14, `docs/product/01-user-roles.md`,
  `docs/engineering/04-data-model.md` → `teams`.
- **Admin dropdown unified to a single standard `.dd` (AdmDropdown) (2026-07-13).** 사용자 화면의
  `.dd` 하나로 통일: 근태 큐(출근·연차) 칩 필터 4곳과 초대(invites) 네이티브 `<select>` 2곳을 `.dd`로
  이관, 폐기된 칩형 `ChipDropdown`(`admin-chip-dropdown.tsx`) 삭제. `.dd` CSS는 `admin-console.css`로,
  컴포넌트는 `components/admin/shared/`로 이동(폼용 `DdFormSelect` 추가). 청소 등 신규 대시보드는 이
  표준을 사용. tsc 0 / lint 0 errors. 상세: `docs/planning/01-decision-log.md` → 2026-07-13.
  **후속(2026-07-14):** 두 번째 커스텀 드롭다운 `AdminSelectField`(`.selfield`)도 폐기·삭제(근태 수기
  세션·수당 3곳 → `.dd`, `AdmDropdown`에 `disabled` 추가), 초대 만료일 네이티브 date → `AdminDatePicker`
  (`DateFormField` 래퍼). 어드민 드롭다운/선택 컨트롤은 이제 `.dd` 하나로 완전 통일. tsc 0 / lint 0 errors.
- **Cleaning admin dashboard re-planned (감시·이력·강제완료) (2026-07-13); design implemented
  2026-07-14.** 기존 읽기 전용 `/admin/cleaning`을 Claude Design 핸드오프 기준으로 전면 재설계
  구현했다(오늘 현황 KPI 6-스트립 + 건물별/상태별 객실 카드 + 셋팅 대상 + 직원별 요약, 기록 탭
  필터+테이블, 우측 상세 패널, 강제완료 모달) — 처음엔 **정적 mock 데이터** 단계였으나 아래
  2026-07-14 후속에서 백엔드 전면 연동 완료. 새 파일:
  `src/components/admin/cleaning/*`(`cleaning-console.tsx` 외 5개 + 데이터/CSS), i18n
  `cleaning.console.*`(ko/ja/en). 공용 `.dd`/`AdminDatePicker`/`AdminTimePicker`/`.panel`/`.modal`을
  그대로 재사용. 부수 수정: `admin-console.css`의 `--mono` 토큰에 `--font-noto-kr`/`--font-noto-jp`
  폴백 추가(모노스페이스 요소 안의 한글 깨짐 수정, 전 어드민 화면 영향). 상세 스펙+디자인 프롬프트+
  구현 노트는 `docs/product/07-cleaning-workflow.md` → "2026-07-13 어드민 청소 대시보드 — 재기획".
  tsc 0 / lint 0 errors. 다음 단계: `completed_by_admin` 마이그레이션 + 실제 데이터 연동.
  **후속(2026-07-14): 기록 탭 Excel/PDF export 구현.** 근태 급여 export와 동일한 그린 렛저
  템플릿(`attendance-payroll-workbook.ts`/`attendance-payroll-report.ts`의 색상·테두리 상수 재사용,
  새 템플릿 없음). 컬럼: No·날짜·건물·객실·청소유형·담당자·시작/종료시각·소요시간·구분(정상/대리
  완료)·메모 + 합계 행. 서버 액션(`src/app/admin/cleaning/actions.ts`)이 세션의
  `preferredLanguage`로 문서를 만들어 **로그인 언어 그대로 출력**(근태와 동일 원칙, 클라이언트가
  로케일을 넘기지 않음). 상세: `docs/product/07-cleaning-workflow.md` → "2026-07-14 청소 기록
  내보내기". tsc 0 / lint 0 errors.
  **후속(2026-07-14): 백엔드 전면 연동 완료.** 정적 mock 데이터를 실제 `cleaning_sessions` + 예약
  데이터로 전면 교체 — 오늘 현황/기록/강제완료/export 전부 실데이터. 신규 마이그레이션
  `202607150001`(`cleaning_sessions.completed_by_admin` 컬럼, 원격 프로젝트에 적용 완료). 신규
  `src/lib/admin-cleaning.ts`(실데이터 레이어), `forceCompleteCleaningSession`/
  `fetchAdminCleaningHistory` 서버 액션(`src/app/admin/cleaning/actions.ts`). 룸키 해석 로직을
  `src/lib/room-label-normalization.ts`로 공용화(모바일 청소 페이지와 어드민이 함께 사용, 중복 제거).
  셋팅 대상 정의를 모바일과 동일하게 통일(체크아웃 없는 순수 입실 객실만). 강제완료는 `router.refresh()`
  기반(낙관적 로컬 패치 없음), 오늘 현황은 60초 폴링 + 수동 동기화 칩으로 갱신. 상세:
  `docs/product/07-cleaning-workflow.md` → "2026-07-14 어드민 청소 대시보드 — 백엔드 연동". tsc 0 /
  lint 0 errors.
  **완료 (2026-07-14): 사용자 라이브 테스트 + 문서 감사 후속 수정까지 반영, 기능 구현 종료.**
  실제 로그인 세션에서 사용자가 직접 확인하며 발견한 이슈들을 전부 수정했다: (1) 강제완료 모달
  담당자 드롭다운이 비어 보이던 버그(`getCleaningStaffOptions`가 DB에 없는 플랫폼 전용 역할
  `developer_super_admin`을 `.in("role", ...)`에 그대로 넘겨 쿼리가 enum 캐스팅 에러로 통째로
  거부되던 것 — 쿼리 직전 필터링으로 수정), (2) 직원별 오늘 요약을 "청소 담당 가능 역할 전원"에서
  "오늘 실제로 완료한 직원만"으로 축소, (3) 셋팅 대상 카드 클릭 시 예약 정보 전용 축소 상세 패널
  추가, (4) KPI 데이터 로드 실패 시 `-` 표시 구현, (5) 연동 분실물/유지보수 리포트 타일 클릭 →
  실제 해당 레코드로 이동(과거엔 토스트만 뜨던 placeholder), (6) 문서상 범위 제외 항목이었던 소요
  70분 이상 경고 배지를 삭제(임의 하드코딩 기준값이 실제 최단 청소시간 150분과 맞지 않아 상시
  경고 상태였음), (7) 청소 "지연" 상태·배지·KPI를 완전히 삭제(대기중과 100% 동일 조건이 되어
  기능이 무의미해짐 → 원래의 대기중/진행중/완료 3상태로 정리). 상세는
  `docs/product/07-cleaning-workflow.md` 하단 2026-07-14 후속 항목들 참고. 매 라운드 `npm run lint`
  / `npm run build` 통과. 이 시점 이후 `/admin/cleaning` 기능 구현은 종료된 것으로 본다.
- **Invite-code (team code) management moved from Settings to Users (2026-07-13).**
  `/admin/settings/invite-codes` moved to `/admin/users/invites`; the old path now just redirects.
  `/admin/users` and `/admin/users/invites` share a "멤버 목록"/"멤버 초대" tab switcher. The create/
  deactivate gate now uses the same developer-or-`manage_users` check as `/admin/users`
  (`actorCanManageUsersInOrg`), replacing a hardcoded owner/office_admin/senior_managing_director role
  check that had also been silently blocking 전무 from creating invite codes. The invite-role grant
  ceiling (developer/owner/전무 = any category, others = `officeAdminAssignableRoles` only) is
  unchanged. See `docs/planning/01-decision-log.md` → 2026-07-13.
  **Invite delete added (2026-07-14):** `/admin/users/invites` can now **hard-delete** invite codes
  (`deleteInviteCode`, org-scoped, `.ovconfirm` confirm) for both active and inactive codes, alongside
  the existing deactivate. Members who already joined keep their memberships. Invite limits
  (expiry / max-uses / active flag) unchanged. See `docs/product/04-organization-invitations.md`.
- **Onboarding recovery UX hardened (2026-07-10).** The profile-setup wizard now shows an explicit
  return-to-login action on every step (sign-out + `/auth/login`, language preserved), so a user who
  entered with the wrong email/Google account is no longer trapped in onboarding. Duplicate
  `profiles.phone_number` submit failures now send the user back to the phone-number step with a
  visible explanation: either enter a different number or return to login and use the existing
  account that already owns that number. No schema/permission change.
- **Mobile account profile birth-date field width fix (2026-07-15).** The `/account?mode=mobile`
  date-of-birth input no longer renders wider than the name/phone fields on mobile WebKit. Shared
  input chrome now enforces `block + min-width: 0`, and native `input[type="date"]` is width-clamped
  globally (`max-width: 100%`) so profile forms keep one consistent field width contract. No data or
  validation change.

## Dashboard Rebuild Direction (confirmed 2026-06-29)

The admin dashboard direction was re-confirmed and broadened on 2026-06-29.

- The dashboard is being treated as a **full desktop operations surface**, not a limited back-office view.
- Major mobile product modules are expected to gain admin-dashboard counterparts.
- Mobile app and admin dashboard remain **separate surfaces**: mobile/tablet -> `/mobile`,
  desktop/notebook -> `/admin`.
- The dashboard may include an embedded **interactive mobile-view frame**, but that does not merge the
  two surfaces.
- Only physical-device exceptions stay mobile-only; the confirmed example is **QR scan clock-in/out**.
- Detailed per-feature admin permissions are intentionally deferred to each module's implementation
  cycle; access to the dashboard surface itself is being broadened beyond the old office-only model.

Important implementation note:

- The existing `/admin` code and some older docs still reflect the narrower earlier dashboard scope.
- The new source of truth for dashboard structure is `docs/product/05-admin-web-ia.md`.
- As dashboard modules are rebuilt, their domain docs will be updated from "admin deferred" to the new
  active dashboard direction.
- The active dashboard work queue itself is now tracked in
  `docs/planning/16-admin-dashboard-workflow.md`; this file is the place to record completed dashboard
  slices after they leave the active board.

Dashboard design kickoff scope:

- first design targets are the **admin login screen** and the **dashboard home screen**
- these two screens are being used to lock the dashboard's entry rules, header structure, information
  density, and brand tone before the module-by-module screen design begins

Annual leave planning status:

- A separate annual-leave workflow is now being drafted for salary-based regular employees.
- The source-of-truth planning file is `docs/product/26-annual-leave-workflow.md`.
- The request entry point should be available on both mobile and admin dashboard surfaces.
- The selected leave type must render as an auto-colored option in the generated form.
- Morning and afternoon half-day leave are in scope for the first annual-leave workflow.
- Accrual table and 2-year carryover are now confirmed (2026-07-06); carryover beyond 2 years is
  still pending company confirmation. See `docs/product/26-annual-leave-workflow.md`.
- **Phase 1 backend implemented and applied (2026-07-06, migration `202607060001`, live on the
  linked Supabase project):** `profiles.hire_date` + `annual_leave_baselines` table back the
  self-entered hire date/starting balance; `src/lib/annual-leave-server.ts` +
  `setAnnualLeaveBaselineAction` replace the earlier localStorage bridge.
- **Approval-workflow policy locked (2026-07-06)** against the actual paper form photo: approver =
  member flagged via `memberships.leave_approver_role` (부서장/대표=CEO or 전무), either one approves;
  attachments optional; e-signature is a click-to-stamp (name+timestamp), not drawn. See
  `docs/product/26-annual-leave-workflow.md`.
- **Phase 2, stage 1 implemented and applied (2026-07-06, migration `202607060002`, live):** request
  submission + self-cancel only (`annual_leave_requests` table). `leave-form.tsx`/`leave-home.tsx`/
  `leave-history.tsx`/`leave-done.tsx`/`leave-cancel-done.tsx` all read/write real data now — no more
  mock arrays. The date pickers in the request form were converted from a hardcoded July-2026 mock
  calendar to a real month/year-navigating one in the same pass (submitting fake dates to a real
  backend would otherwise have been wrong).
- **Team calendar wired to real data (2026-07-06, migration `202607060003`, live):** the mobile leave
  calendar (L5) now shows every employee's real approved leave (including the viewer's own) with real
  month/year navigation, replacing the hardcoded July-2026 mock. This was the last remaining mocked
  piece of the mobile employee-facing annual-leave experience.
- **Build order confirmed (2026-07-06): mobile-first.** The approval queue/action and document output
  are admin-dashboard scope (`/admin/attendance/leave`, planned to mirror `/admin/attendance/queue`)
  and start only after mobile is fully done. Rejecting a leave request will NOT require a reason
  (unlike attendance-correction rejection, which does).
- **Draft resume/continue-editing implemented (2026-07-06):** "임시저장" (save draft) previously wrote
  a real row nothing ever showed again — `leave-history.tsx` now surfaces drafts (muted chip) and
  tapping one opens `/mobile/attendance/leave/new?id=<id>` to continue and submit it
  (`updateDraftLeaveRequest`, new). This closes the last gap in the mobile employee-facing
  annual-leave experience — **mobile is now considered feature-complete** for this feature.
- **Swipe-to-delete for drafts (2026-07-06):** draft rows in `leave-history.tsx` can now be
  swipe-deleted (hard delete, self-scoped, only while still `draft`), reusing the exact
  swipe-to-delete interaction/physics already in `notification-list.tsx` rather than a new gesture.
- **Not yet built (dashboard, stage 2/3, deferred until mobile is complete):** the approve/reject
  action, the approver-facing approval queue UI, usage deduction from approved requests into the
  balance calculation, and document output (PDF/print replicating the paper form).
- **Admin approval queue implemented (2026-07-07):** `/admin/attendance/leave` (new "연차" tab in the
  attendance console subnav) is now a working approver-facing review console — org-wide request
  queue + summary cards, status/type filters, search, and a right-side detail panel with
  balance-impact/overlap info and approve ("stamp")/reject (reason optional) actions
  (`src/lib/annual-leave-approvals-server.ts`, `src/components/admin/attendance/leave-queue-client.tsx`).
  No new migration — reuses the approval/reject columns from `202607060002`. **Admin request creation
  added (2026-07-07):** toolbar 대리 신청 (proxy, on behalf of an active employee) + 내 연차 신청
  (self) buttons open `leave-request-modal.tsx` → `createAdminLeaveRequest`
  (`src/lib/annual-leave-admin-server.ts`), reusing `createLeaveRequest` with the mobile day-count
  rules; requests enter the queue as `requested`. Toolbar also gained a real sort dropdown and a
  건/件 count unit; branch/building filter dropped (no user↔building association in schema).
- **Leave sub-tabs backend-wired (2026-07-08):** 팀 캘린더 / 직원 잔여·부여 / 승인자 관리 now run on real
  data (문서 stays a design-only shell for stage 3). Team calendar bar → the review-queue request detail
  drawer, reused read-only for approved requests. 직원 잔여·부여: `listAdminLeaveBalances` deducts approved
  유급/특별 usage from each pool; the drawer editor persists hire-date/grant via `saveEmployeeLeaveBaseline`.
  승인자 관리: toggle writes `memberships.leave_approver_role` (`listAdminApprovers`/`setLeaveApprover`),
  enabling stores `'department_head'` by default (confirmed 2026-07-08), with self-lock + ≥1-approver
  server guards. No new migration.
  - **Correction (2026-07-13, verified against code):** two items previously listed here as "not wired"
    are in fact **implemented** — (1) **approved-usage feedback into the mobile balance summary** is live
    (`getMyAnnualLeaveSummary` → `sumApprovedLeaveUsage` deducts 유급→base / 특별→bonus, used by
    `/mobile/attendance/leave`), and (2) **document output** (休暇届 A4 print/PDF) is built and print-ready
    (`leave-documents-view.tsx` + `@media print` isolating `#docSheet`, real data via `listLeaveDocuments`).
    Genuinely still open: **applicant notifications** and **hourly exclusion by real `employment_type`**
    (leave eligibility is currently gated by org **role** `part_time_staff`, not `employment_type_history`).

Attendance/payroll planning status:

- **Attendance allowances / 근태 추가수당 planned (2026-07-10)** *(superseded — see the "2026-07-10 근태
  추가수당(attendance allowance) 구현" dated entry further below in this file; implementation, migration,
  UI, and export wiring are done, not pending)*: accepted the design for busy-day or short-staffed-day
  extra pay. This is a separate allowance layer, not a base hourly-rate change and not a "bonus" feature.
  MVP types are `daily_fixed` (once per worker/date with valid paid work) and `hourly_extra` (recognized
  paid minutes × extra hourly amount). MVP targets are all hourly workers or a specific worker on a Tokyo
  operating date. Source docs: `docs/product/21-attendance-payroll-workflow.md` and
  `docs/engineering/11-attendance-payroll-technical-design.md`.

- **Permission overrides — schema designed and applied (2026-07-09, migration
  `202607090002_membership_permission_overrides.sql`):** new `membership_permission_overrides` table
  (org/user/`permission_key`/granted_by/reason/`expires_at` not-null/revoked_at) + read-only RLS
  (owner/platform-admin SELECT only, no write policies → grant/revoke via future service-role action)
  + a DB `granted_by_user_id <> user_id` self-grant guard + a reusable `has_permission_override(org,
  user, key)` SECURITY DEFINER helper that is **created but not yet wired into any other table's RLS**.
  `permission_key` has no DB enum (open whitelist, managed in app code later). **Applied to the live
  Supabase project (2026-07-09)** — confirmed via `list_migrations`; `get_advisors` shows no new
  findings beyond the same RPC-exposure warning every existing role-check helper already carries.
  **The feature itself — the `/admin/users/[id]` "권한 예외" card and the grant/revoke server actions —
  is NOT implemented yet; UI/UX design is still pending before implementation resumes.**
  `src/types/database.ts` updated manually (no codegen script in this repo). Design:
  `docs/product/27-permission-override-workflow.md`.

Completed dashboard slices:

- **Reservation calendar dashboard v1** — implemented 2026-07-09.
  - `/admin/calendar` is now a real reservation operations console instead of the earlier simple
    month grid + list view.
  - The page ships 4 views in one screen: month board, today ops, room status, building info.
  - The month board uses a dense room × day timeline with property chips, channel filter, export,
    channel-colored multi-day bars, and a right-side reservation inspector drawer.
  - Follow-up polish on the same day: the month-grid date header now stays visible during inner
    vertical scroll, and `Today ops` / the top ops KPI now show reservation-driven `setting targets`
    instead of the earlier turnover-cleaning placeholder.
  - Property chips in the month board are now centered text-only filters; the room-count badges were
    removed from the chip row.
  - Follow-up integration on the same day: the reservation inspector's linked actions now open
    maintenance / complaint / lost-found mobile create flows with `reservationId` prefilled,
    internal notes persist in the new `reservation_internal_notes` table, and the mobile-view link
    can preserve the current calendar month / property context.
  - The server keeps the current-month + next-month operational fetch window, but still fetches the
    live window even when browsing an out-of-window month so today/room/info boards remain useful.
    The month board itself shows an explicit out-of-window warning in that case.
- `Building info` reads shared metadata from `src/lib/property-map-links.ts`; in-page edits are
  browser-session preview only, not persisted.
  - The refresh chip is intentionally passive (`router.refresh()` only) and does not expose the
    secret-protected `/api/beds24/reconcile` endpoint as a manual admin action.

## 2026-07-09 Reservation calendar follow-up integrations

Follow-up implementation completed on top of the new admin reservation dashboard:

- Added migration `202607090003_reservation_calendar_linking_and_notes.sql`.
  - `maintenance_reports`: optional `reservation_id`, `guest_name`
  - `lost_items`: optional `property_name`, `reservation_id`, `guest_name`
  - new `reservation_internal_notes` table with org-scoped RLS for owner / office_admin /
    cs_staff / field_manager
- Admin reservation inspector note field is now persistent instead of browser-session-only.
- Added follow-up migration `202607100001_reservation_internal_notes_member_read.sql`.
  - `reservation_internal_notes` SELECT scope is now all active organization members
  - create / update / delete stays limited to owner / office_admin / cs_staff / field_manager
- Reservation-note text is now visible in the mobile calendar reservation detail sheet, and
  reservation bars with note text show a small indicator.
- Linked actions now deep-link to:
  - `/mobile/maintenance/new?reservationId=...`
  - `/mobile/complaints/new?reservationId=...`
  - `/mobile/lost-found/new?reservationId=...`
- Mobile maintenance / lost-found / complaint create flows now load the reservation context,
  prefill building / room / guest data, and persist the linked reservation metadata when the
  server-side validation passes.
- The generic admin-shell "모바일 보기" button now accepts a page-specific `mobileHref`, so the
  reservation dashboard can jump into `/mobile/calendar` with the current `month` / `property`
  preserved instead of always opening the mobile home.
- **Dashboard home (desktop operations console)** — implemented 2026-06-29.
  - Console shell rebuilt with a grouped IA sidebar (Home / Operations / Work·Comms / Management),
    organization context, mobile-view entry, and a console header (breadcrumb · global search · notifications
    · account): `src/components/shell/admin-shell.tsx`.
  - `/admin` home rebuilt as an ops console: ops summary bar + top-priority section cards
    (진행 중 청소 · 즉시 처리 큐 · 이상 근태/정정 · 중요 공지 · 오늘 할 일 · 예약 체크인/아웃),
    all wired to real data through `src/lib/admin-dashboard.ts` (`getAdminDashboard`) and linking into each
    module. Files: `src/components/admin/dashboard-home.tsx`, `src/components/admin/admin-console.css`,
    `src/app/admin/page.tsx`. i18n (`admin.console`) added for ko/ja/en. lint + build green.
  - Follow-up slices: auto-refresh wiring, right-side detail panel, notification/org-switcher popovers.
  - Console shell visuals were aligned to the design handoff on 2026-06-30 (dark warm-espresso
    navigation rail with a gold active accent + ivory content), replacing the earlier ivory sidebar.
- **Todoist naming unified across mobile/admin (2026-07-22).**
  - Mobile side-menu/bottom-bar candidate `tasks` is now user-facing `Todoist`; the mobile screen title also uses `Todoist`.
  - Admin sidebar `recurring-work` is now user-facing `Todoist`; the route remains `/admin/recurring-work` for now as a legacy path.
  - Product docs were updated so the older separate `Recurring Work Scheduler` concept is no longer treated as the active end-user module.
- **Admin login screen (desktop console entry)** — implemented 2026-06-30.
  - Split layout (warm clay/espresso brand panel + auth form) applied to every auth state via a new
    `AuthFrame` shell and scoped `auth-console.css` (`.authx`). The auth forms (`email-login`,
    `email-signup`, `email-reset`, `email-new-password`, `google-button`) were restyled to the design's
    `.field/.inp/.submit/.banner` system, and the language pill now uses the design `.langpill`.
  - The real authentication flow is unchanged: Google / email sign-in, signup, password reset, new
    password, sign-out, `next` handling, onboarding redirect, and blocked/suspended/removed/disabled
    gating all behave exactly as before. i18n `auth.console` added for ko/ja/en. lint + build green.
  - The earlier design-preview `?view=error` frame set was retired (real errors surface via the inline
    error banner in each form).
- **Attendance admin console hardening** — completed 2026-07-02.
  - `/admin/attendance` overview now aggregates review, correction, payroll, and transport KPI values
    from the same server helpers used by the detail pages, and the open-correction card renders recent
    correction rows instead of an empty placeholder.
  - Correction approval applies clock-in and clock-out site changes independently and validates final
    site IDs server-side against the organization. Wage-management optimistic history now mirrors the
    server rule that replaces still-future open rate rows instead of displaying deleted rows as closed.
  - The attendance console month context is unified into the top subnav month picker. Overview, queue,
    payroll, transport, wages, and staff detail share the same `?ym=YYYY-MM` state instead of showing
    separate page-level month controls.
  - Payroll monthly export is now labeled `엑셀 내보내기` and shaped as a tax/accounting hand-off workbook:
    name, work days, total recognized hours, hourly rate, approved transport reimbursement from the
    transport-review module, payroll excluding transport, and total payout including transport.
  - Per-user payroll export now produces individual Excel/PDF monthly detail from the payroll side panel:
    date, clock-in/out, daily work time, daily pay, approved date-level transport, completed cleaning
    rooms, and total payout. Cleaning rooms are pulled from completed cleaning sessions and summarized
    with the current AA/AB/KK/T2/Okubo/Sky room-label rules. Monthly/per-user Excel/PDF now share the
    same green ledger-style template with black bold money columns and right-aligned totals. The
    personal totals row now also shows work days beside the total label, and the personal Excel/PDF
    includes a cleaning memo column sourced from completed cleaning-session notes. The staff monthly
    detail ledger no longer shows a separate CSV button; hand-off exports live in the payroll panel's
    Excel/PDF actions. The monthly payroll toolbar now has a `시급제만` switch that scopes both PDF and
    Excel exports to hourly/mixed rows with a non-empty hourly rate, excluding salaried/staff rows.
    Payroll consistency was hardened so finalized user-months display/export the locked snapshot gross
    and paid minutes, and personal Excel/PDF daily-pay rows reconcile to the official monthly total.
  - Transport reimbursement monthly export (`/admin/attendance/transport` toolbar, previously a
    disabled stub) produces an itemized Excel/PDF ledger — one row per reimbursement item across all
    staff with entered items for the month (any status). Same **plain green accounting-ledger** template
    as the payroll Excel/PDF exports (shared `WORKBOOK_*` palette constants, 50-row-minimum padding,
    manual print button), all cells center-aligned, columns No/staff/date/building/status/amount
    (the usage/context column was dropped 2026-07-03 — for transport only the commute building matters).
    **The exported files are plain ledgers — no receipt images or links** (final decision 2026-07-03:
    a cell-sized thumbnail is unreadable and one link per item = 20 clicks for a 20-day month).
  - **Receipt review moved to a dedicated desktop web page** — `/admin/attendance/transport/receipt`
    (`?ym=&user=`), a **contact-sheet grid**: the month's receipts as captioned thumbnails
    (date/amount/building); click a thumbnail to open a focus overlay (large image, click-to-zoom, ←/→
    across all photos, Esc/backdrop close, open-original). Items with no photo show a dashed "증빙 없음"
    card. Entered via an unobtrusive "영수증 원본 검토" button added to the existing transport panel
    (rest of that panel's UI/UX unchanged). Privileged + org-scoped via
    `getAdminTransportReceiptsForUser`; images are 10-min signed URLs. Desktop-first (mouse/keyboard),
    fills the screen so a whole month is scannable at once — replaced an earlier one-photo master-detail
    layout that left too much whitespace.
  - **Transport review flow completed** (2026-07-03): the previously-disabled "보완 요청"(request fix)
    and "재오픈"(reopen) panel buttons are now real. **보완 요청** adds a new report status
    `changes_requested` (migration `202607030001`) — a softer middle path than reject that sends the
    report back to the worker to fix & resubmit (worker-editable like draft/rejected); reason required.
    **재오픈** un-decides an approved/rejected report (→ submitted), so a mistaken approval can be
    corrected — reopening an approved report also drops it out of the payroll total until re-approved.
    Both use the shared centered `AdminReasonModal`. Mobile transport statement shows the new status
    label and allows editing in `changes_requested`. Desktop admin review treats `changes_requested` as
    a worker-owned correction state: approve/reject/request-fix buttons are hidden until resubmission,
    and staff detail now labels it as `보완 요청` instead of `미제출`.
  - **Attendance/payroll integrity hardening completed** (2026-07-03): manual attendance edits and
    correction approval now reject invalid clock order, correctly resolve overnight manual clock-out to
    the next Tokyo day, create a real session for session-less approved exceptions, block pay-affecting
    edits after user-month finalization, and guard correction/transport review status transitions against
    two-admin races. Payroll/transport admin views now include inactive staff when they have month
    sessions, finalized snapshots, or transport reports, preventing resigned workers from disappearing
    from accounting views. Migration `202607030003_attendance_finalized_snapshot_unique.sql` enforces one
    finalized attendance snapshot per org/user/month.
  - **Attendance subnav badge performance hardening completed** (2026-07-03): queue/payroll/transport/
    wages/roster/staff-detail pages now use a lightweight badge-stats helper instead of loading full
    overview aggregation just to render tab badges. Full overview aggregation stays on `/admin/attendance`
    only. Correction request site labels are batch-loaded once per list, removing the per-request site
    lookup N+1.
  - **Attendance queue/KPI state consistency completed** (2026-07-03): overview review/correction links
    now carry the selected `ym` into the queue, correction approval/rejection removes the resolved request
    from the open queue, and transport submitted-total KPI excludes draft/rejected/changes-requested
    reports while recalculating from the current client rows after review actions.
  - **Attendance side-panel accessibility hardening completed** (2026-07-03): session, correction,
    payroll, transport, wage, and staff-day side panels now share a common behavior hook for `Esc` close,
    body scroll lock, focus-on-open, and focus restore on close. This is a behavior-only change; panel
    layout, colors, and action placement are unchanged.
  - **Attendance follow-up UX/i18n hardening completed** (2026-07-03): overview transport missing-receipt
    KPI now uses real reimbursement item evidence counts instead of a hardcoded `0`; overview payroll/
    transport links, staff-day → queue, and wage → staff-detail links preserve the selected `ym`; bulk
    queue actions run in parallel and sticky partial-failure feedback lists failed staff/date targets;
    payroll finalization/reopen both use the shared admin modal with correct finalization/reopen copy;
    attendance admin close/prev/next aria labels and urgency chips are dictionary-backed in ko/ja/en,
    with Japanese `payExportNo`/transport ledger labels corrected.
  - **Admin dashboard shared UI primitives extracted** (2026-07-03): month/date/time pickers, chip
    filters, reason modal, and side-panel accessibility hook moved from the attendance feature folder to
    `src/components/admin/shared`. Attendance imports were updated without changing rendered class names
    or visual layout. New/touched admin dashboard pages should reuse this shared location before adding
    feature-local equivalents.
  - **Attendance admin page auth guard centralized** (2026-07-03): `/admin/attendance/*` page components
    now call `requireAdminPageSession({ nextPath })` from `src/lib/admin-page-auth.ts` instead of
    duplicating `getOnboardingState` / `getCurrentAppSession` / `canAccessAdminWeb` blocks. The shared
    helper also enforces organization context consistently before attendance admin data loads.
  - **Admin shared format utilities extracted** (2026-07-03): repeated admin workbook download, yen
    formatting, optional yen formatting, and transport status-pill mapping now live in
    `src/components/admin/shared/admin-format.ts`. Attendance payroll/transport/staff-detail/overview/
    wages/receipt components import those shared utilities without changing visual output.
  - Related docs updated: Product `05`, Product `24`, and Engineering `04` + `11`.

All core MVP implementation phases (6–12) are substantially complete. Phase 13 (QA and internal rollout) is now the active phase. Controlled internal rollout may begin once the required pre-rollout steps in `docs/planning/13-qa-checklist.md` section 12 are completed. Phase 13 remains open until browser E2E verification is finished and the first staff batch is successfully onboarded.

See `docs/planning/13-qa-checklist.md` for the full system QA checklist and release-readiness summary.  
See `docs/planning/14-rollout-guide.md` for the internal rollout guide.

## Approved Post-MVP Feature Batch (confirmed 2026-06-09)

A five-feature batch was approved on 2026-06-09 as the next build scope after the Phase 6–13 MVP. Two slices have since shipped first cuts (Linen Defect Registration, Personal Todo / Shared Task); the rest are documented and queued. Source of truth: `docs/planning/15-feature-batch-plan.md` and `docs/planning/01-decision-log.md` (2026-06-09 entries).

Additional planning draft outside that batch:

- **Announcements redesign reset (2026-06-26)** — product direction is being simplified back to a
  **notice-only channel**. Important announcements should surface as a **shared BottomSheet popup** on
  mobile, not a feature-specific centered modal pattern. Announcement images must support **mobile
  pinch-to-zoom** via a dedicated zoomable viewer. Existing announcement comments are now considered
  **legacy implementation** and should be removed from the target flow in a later refactor. Source of
  truth: Product `11`, decision log `2026-06-26`.
- **Transportation Reimbursement (attendance/payroll-adjacent)** — planning draft added on
  **2026-06-25** inside Product `21` + Tech-design `11`. Direction confirmed: **per-user monthly
  ledger**, list UI (not cards), **mandatory receipt/screenshot photo evidence on every item**, linked
  + manual entry both required, monthly total shown, later admin user-detail + org-total dashboard, and
  clean Excel export. `linked` means **generate candidate rows from the selected month's existing
  attendance/cleaning records later**, not "same-day only." Worker entry point is planned under
  **Attendance Home → 바로가기**, as a new row placed **directly below `시급 급여`**. Important accounting
  rule: reimbursement remains **separate from hourly gross wages** even though it sits in the same
  operating/payroll domain.
  - **DB 1차 구현 (2026-06-26): 스키마·RLS·타입.** 마이그레이션 `202606260001_transport_reimbursement.sql`
    추가 — 3개 테이블 `transport_reimbursement_reports`(user-month 원장, `status`
    draft/submitted/reviewing/approved/rejected, `total_amount_cached`, 유니크
    `(org,user,target_month)`) / `transport_reimbursement_items`(`usage_date`·`amount_yen`>0·
    `entry_mode` linked/manual·optional `attendance_session_id`/`property_id`/`room_id`·
    `work_context jsonb`) / `transport_reimbursement_item_images`(증빙 이미지, `storage_path`).
    **급여(`attendance_month_snapshots`)와 완전 별개.** RLS: 쓰기 정책 없음(서비스롤 전용), SELECT는
    본인 또는 `can_manage_attendance_payroll`(owner/`attendance_payroll_admin`/platform admin) —
    attendance와 동일 헬퍼 재사용, `set_updated_at()` 트리거 공유. 스토리지: `request-images` 버킷에
    교통비용 **5단계 경로** 정책(`{org}/transport-reimbursements/{report_id}/{item_id}/{file}`) 추가
    (기존 4단계 정책과 OR 공존). `src/types/database.ts`에 3개 테이블 타입 추가. 관련 문서: data-model `04` + RLS `05` + Tech-design `11`(스키마 정의). 🚨
    **이 마이그레이션은 아직 Supabase에 적용되지 않았습니다** — Dashboard SQL editor 또는
    `supabase db push`로 적용 필요.
  - **교통비 제출 백엔드 구현 완료 (2026-06-26).** DB schema (3개 테이블), query layer, server actions, storage policy 전부 완료. 급여(`attendance_month_snapshots`)와 완전 별개로 분리된 모듈. **Query layer** `src/lib/transport-reimbursement.ts`: `getOrCreateTransportReport`(UPSERT) · `getTransportItems`(items + images) · `getLinkedTransportCandidates`(선택 월 attendance/cleaning 기반 후보 생성, DB 미저장) · `syncReportTotalAmount` · admin 전용 2개 함수. **Server actions** `src/app/mobile/attendance/transport/actions.ts`: `createTransportItemAction`(report 자동 생성, draft/rejected 상태에서만 허용) · `updateTransportItemAction` · `deleteTransportItemAction`(storage 파일 정리 후 cascade) · `addTransportItemImageAction` · `deleteTransportItemImageAction` · `submitTransportReportAction`(증빙 누락 항목 있으면 `missing_evidence` 오류로 제출 차단). **프론트엔드 연결 pending:** transport/page.tsx + transport-statement.tsx mock 제거 및 실데이터 주입은 같은 작업 사이클에서 완료 예정. 상세: Tech-design `11` "As-built — Transport Reimbursement Backend (2026-06-26)".
- **Bug Report / Problem Report** — **1차 구현 중 (2026-06-25): DB·서버 액션·UI wire-up·알림.** StayOps 앱/시스템 버그 신고 모듈. 라우트 `/mobile/bugs` (목록·작성·상세 3개 화면). 리뷰어: `owner`, `office_admin`. 알림 타입 `bug_report_activity` (`created` → 리뷰어, `status_changed` → 작성자). 스토리지: `request-images` 버킷 재사용. **i18n 배선 완료 (2026-06-25):** 1차 UI가 하드코딩 한국어로 나가던 것을 전부 `getDictionary(locale).bugs` 소비로 교체(서버 페이지 → `copy` prop → 클라이언트, board/tasks 패턴 동일). 상태 라벨은 `bugStatusLabel(copy, status)` 단일 출처, `BugStatusBadge`는 `label` 필수. aria/alt 키 5개 보강(ko/ja/en). 1차 deferred: admin web, 수정 페이지, `cs_staff` 리뷰어 확장. 관련 문서: Product `25` + Tech-design `13` + data-model `04` + RLS `05` (갱신 완료 2026-06-25).

Build order and readiness:

1. **Linen Defect Registration** — **First slice implemented (2026-06-10).** Mobile linen return ledger is live under `/mobile/linen-return/*` (side-menu entry `linen-return`). All five screens shipped: building picker, building-scoped list, create, detail (permission-gated edit/delete), and ledger (record + item-summary, registrant/item filters, month navigation). Tables `linen_items`, `linen_return_records`, `linen_return_record_items` (migration `202606100002_linen_returns.sql`); photos reuse the `request-images` bucket (`linen-returns/` subfolder). Building = canonical property name (text). **2026-06-15 hardening:** repeated saves by the same user for the same building on the same Tokyo operating day now auto-merge into one header record (same item = quantity sum, new item = appended line). Deferred: building-specific item master UI, admin web. The migration must be applied to the linked Supabase project (Dashboard SQL editor or `supabase db push`). See Product `19` + Tech-design `08` "As-Built".
2. **Personal Todo / Shared Task Inbox** — **First slice implemented (2026-06-10), hardened through 2026-06-15.** Mobile Todo/Shared Task is live under `/mobile/tasks/*` (side-menu entry `tasks`): six views (Today / Tomorrow / Inbox(관리함) / Sent(공유함) / Completed(완료/기록) / Calendar), quick add + detailed create/edit, task detail with unified update log (text + photos), participant management, and context linking to **building-only / building · room / reservation / guest**. Tables `tasks`, `task_participants`, `task_updates` (migration `202606100003_todo_tasks.sql`); photos reuse the `request-images` bucket (`task-images` / `task-update-images`). Hardening shipped fail-safe create/share behavior, author-editable task photos, update-log photo upload, client-side title+author/date filtering, month-based task calendar navigation, custom date/time pickers, and body-portaled sheets over the mobile shell. **2026-06-12 IA adjustment:** the extra intermediate tab was removed from the mobile UI; manual complete / reopen controls were temporarily removed in the same pass but **re-introduced on 2026-06-13** — see the Completion bullet below. **2026-06-15 recurrence hardening:** repeat rules now generate real task-instance rows (`recurrence_series_id`, `recurrence_instance_date`) instead of a label-only reminder. Current workspace: `Today / Tomorrow / Inbox(관리함) / Sent(공유함) / Completed(완료/기록) / Calendar` (six views). `status` / `completed_*` columns are now active (used by completeTask / reopenTask). Notification expansion added `task_due_soon` + `task_overdue` via the daily CRON-secret task reminders endpoint; shared + update-log notifications remain active. **Activation status:** `202606110001_task_reminder_notifications.sql` is applied on the linked Supabase project; the remaining manual step is still setting `CRON_SECRET` in the Vercel project env so `/api/tasks/reminders` is authorized.

Task Context Link — design + partial data layer (2026-06-12): four-screen context-linking UI allowing a task to be optionally attached to **building-only / building · room / reservation / guest**. **Full data layer (2026-06-12):** `fetchRoomReservations` server action (`src/app/mobile/tasks/context-actions.ts`) queries the `reservations` table for the selected `room_label` across the current month + next month (Tokyo timezone, 2-month window) — `check_in_date < first day of month after next`, `check_out_date >= first day of current month`, status excludes `cancelled`/`no_show`. Results are sorted by `check_in_date` ascending, `isLive` is computed server-side (Tokyo today). The section label "이 객실의 예약" shows the period (e.g. "6/1 – 7/31") inline. Spinner shown while loading; empty state if no reservations found. Typing work-around: a `ReservationSelectRow` type alias + `as` cast bypasses a supabase-js v2 enum-narrowing bug where chained filter methods collapse the inferred row type to `never`. **Screen 4 — task detail context block + list chip (2026-06-12)**: `LinkedTaskContext` type added to `src/lib/tasks.ts`; `TaskRecord` now carries `resolvedContext: LinkedTaskContext | null`. The `hydrate()` function does batch parallel joins (reservations → property_name + room_label + source + dates; properties and rooms for building-only and room-only links) so list queries incur at most 3 extra DB round-trips only when context-linked tasks exist. New `LinkedContextBlock` component (`src/components/tasks/linked-context-block.tsx`) implements the spec `lctx` card: Building icon with primary-tinted border, property · room name (15px/800), channel badge + guest + date range, and "예약 상세로 이동" ArrowUpRight link when a building-backed calendar jump exists. Building-only links now show a dedicated summary state in the detail block, and room-only links keep their no-reservation summary. Shown in `task-detail-view.tsx` between the header card and participants section when `task.resolvedContext !== null`. `task-card.tsx` meta row shows a `bg-primary/[0.09] text-primary` MapPin chip (building, building · room, or guestName) when the task has linked context. New i18n: `contextLinkedSection / contextGoToReservation` (ko/ja/en). **Context link real data — buildings + rooms (2026-06-12)**: `fetchPickerBuildings()`, `fetchPickerRooms(propertyId)`, and `fetchRoomReservations(propertyId, displayRoomLabel)` server actions in `context-actions.ts` now mirror the **reservation calendar's active-room catalog** instead of querying `rooms`/`properties` raw. The picker shows only genuinely active rooms and merges sub-units (201 / 201_2 → one "201" cell), exactly like the calendar room axis. `context-picker-sheet.tsx` stub data removed — buildings load on mount, rooms load when a building is tapped (loading spinners + empty states). `PickerBuilding.id` is the canonical property name; `PickerRoom.label` is the display label. **2026-06-24 follow-up:** the room step now exposes a **building-only** alt action in the shared picker, so tasks and suggestions can save building-level context without forcing a room selection. **Shared resolver extracted (2026-06-12)**: `getRawPayloadString`, `buildGlobalExternalRoomToCanonical`, and `resolveReservationCanonicalRoomLabel` moved into `src/lib/rooms.ts` as the single source of truth for reservation→active-room resolution (priority: raw_payload room/unit id → unit name → reservation room_label, exact then normalized; authoritative vs provisional mode). The picker consumes it; the calendar page still holds an inline equivalent (behaviorally identical) that can be unified onto the lib helper in a later pass. Active-room rules honored: `status='active'`, Beds24 `external_minimum_stay >= 50` excluded, Sano property + Takadanobaba 401_2 excluded. **Deactivation safety**: the picker offers only active rooms, but `hydrate()`'s context joins are NOT status-filtered, so a task linked to a room/reservation that later goes inactive keeps showing its context. `buildLinkedContext()` (tasks.ts) normalizes the saved reservation's raw `property_name`/`room_label` to canonical property + merged display label so chips/detail read consistently (e.g. "荒木町A" / "201_2" → "아라키초A" / "201"). Provisional fallback (`getActiveRoomCatalog` undefined): legacy `properties`/`rooms` listing + exact room_label reservation match. **Context link write path (2026-06-12)**: Full save pipeline wired. `ContextPickerSheet.onSelect` → `setLinkedCtx(ctx)` in `TaskCreateForm`. `handleSubmit` appends the context fields to formData; `createTask`/`updateTaskCore` parse and persist them (empty string → null = clear). Edit page (`[id]/edit/page.tsx`) passes `initialCtx` from `task.resolvedContext` so an existing link round-trips. **Context link UUIDs + deep-link complete (2026-06-12)** — closes the two remaining gaps:
- **`property_id` / `room_id` now persisted.** `getActiveRoomCatalog` (and `ActiveRoomCatalogItem`) gained `roomId` + `propertyId` (the `rooms.id` / `rooms.property_id` UUIDs; the SELECT now includes them). The picker carries them: `PickerBuilding.propertyId` and `PickerRoom.{roomId,propertyId}` (for a merged display label like 201 = {201, 201_2}, the **base sub-unit** — canonical key === display label — is the representative row). `LinkedContext` / `LinkedTaskContext` / `TaskInitialCtx` gained `propertyId` + `roomId`; the form sends `ctxPropertyId` / `ctxRoomId`; both server actions write `property_id` / `room_id`. So a **building-only link** persists `property_id` with `room_id = null`, and a **room-only link (no reservation)** persists both ids; both resolve their building name in the chip/detail, with the room number appearing when a room exists. `buildLinkedContext()` normalizes the joined raw property/room labels to canonical property + merged display label when a room is present. UUIDs also round-trip through edit via `resolvedContext` → `initialCtx`. The calendar page's inline `roomCatalog` type was replaced with the imported `ActiveRoomCatalogItem` (no behavior change).
- **"예약 상세로 이동" routing wired.** `LinkedContextBlock` now deep-links to `/mobile/calendar?property={canonicalName}&month={check-in YYYY-MM}` (building-only and room-only links omit the month → current month). Guest-only links (no property) render the card non-interactive (go-link + chevron hidden), since there is nothing to navigate to.
- **Deep-link now auto-opens the reservation sheet (2026-06-12).** The deep-link also carries `&reservationId={id}`, and `MobileCalendarView` auto-opens that reservation's detail sheet on arrival so the guest info shows immediately (no extra tap, no manual refresh). Both `reservationId` and `property` are read client-side from the **live URL via `useSearchParams()`** (server prop as fallback) because a soft `router.push` to `/mobile/calendar` can serve a prefetched/cached RSC payload with stale params — that stale-prop path was why the modal previously needed a refresh. The auto-open is scheduled in `requestAnimationFrame` with the "already-opened" guard set inside the callback, so React StrictMode's double-invoke can't cancel it. (Reservation list/maps are param-independent, so URL-derived params render correctly without a refetch.)
- **Today-view drag-reorder (2026-06-12).** The Today tab supports manual drag-and-drop ordering, via a **dedicated grip handle** on each card (no conflict with tap/long-press menu/swipe; the handle sets `touch-action:none` and stops propagation). Scope at first ship: **Today tab** (Overdue + Today sections, each independently reorderable); extended to the Tomorrow tab the same day (next bullet). New column `tasks.sort_order` (nullable int, migration `202606120001_task_sort_order.sql`, **applied to the linked Supabase project**); NULL = unranked → falls back to priority order, so behaviour is unchanged until first drag. New server action `reorderTasks(orderedIds)` (`[id]/actions.ts`) sets each id's `sort_order` to its index (0..n), org-scoped, revalidates. `sort_order` is **global to the task, not per-user** (MVP limitation). New component `src/components/tasks/reorderable-task-list.tsx` (pointer-based, variable-height aware, optimistic + persisted). Reorder is disabled (plain list) while a search/date filter is active or in multi-select mode. New i18n `reorderHandle` (ko/ja/en). `tasks-workspace.tsx` Today sections now sort with `orderSort` (sort_order → priority fallback).
- **Tomorrow (내일) tab + day-tab swipe (2026-06-12).** Added a second day tab next to Today: **Tomorrow** (`view=tomorrow`, added to the page's VIEWS allow-list and the workspace chip tabs, `Sunrise` icon). It mirrors Today's full behaviour — same card layout/chips and drag-reorder — filtered to tasks anchored to tomorrow (Tokyo, `ymdShift(today, 1)`). **Swipe semantics**: the card-body left-swipe reveals one move action per view — Today → "내일로" (`moveTaskToTomorrow`, `scheduled_date`=tomorrow), Tomorrow → "오늘로" (`moveTaskToToday`), Inbox → "오늘로"; Sent/Calendar keep swipe disabled. `TaskCard`'s `showMoveToday` prop was replaced with `swipeAction: "today" | "tomorrow"` + `swipeReturnView`; both move actions now redirect back to the originating tab (`/mobile/tasks?view=…`) instead of always Today. New i18n `viewTomorrow / secTomorrow / tomorrowEmptyTitle / tomorrowEmptySub / swipeTomorrow` (ko/ja/en). Drag-reorder applies to the Tomorrow list too (same `sort_order` / `reorderTasks`). The quick-add (FAB) sheet also gained an **"Add to Tomorrow"** one-tap button beside "Add to Today" (`quickCreateTomorrowTask`, `scheduled_date`=tomorrow → Tomorrow tab); new i18n `quickAddTomorrow` (ko/ja/en).
- **Completion + 완료/기록 tab + daily report (2026-06-13).** Task completion was re-introduced (status-circle tap completes/reopens with an undo toast; detail view has 완료/다시 열기). `completeTask` / `reopenTask` (`[id]/actions.ts`) stamp/clear `status` + `completed_at` + `completed_by_user_id`, write a `completed`/`reopened` update-log row, and (on complete) fan out a now-active `task_completed` notification. A new **Completed (완료/기록)** top tab groups completed tasks by Tokyo completion day (`tokyoDateOf(completed_at)`, newest first; count badge = today's completions). Each day group has a **보고서** button → **daily report (업무일지)**: `generateDailyReport(date)` (`report-actions.ts`) collects the caller's own completed tasks for that Tokyo date and returns a date-headed bullet list — **free, template-based, no LLM / no API key / no cost**, with a deterministic local `tidy()` pass (whitespace, bullet glyphs, punctuation spacing) for light auto-correction; shown in an editable + copyable bottom sheet. (An LLM-backed `claude-haiku-4-5` variant was prototyped then dropped — the consumer Claude subscription can't auth the API and pay-as-you-go was not wanted; `@anthropic-ai/sdk` removed.) **Staff-only**: `canGenerateDailyReport(role, can_generate_report)` (`src/config/roles.ts`) = `role != 'part_time_staff' OR profiles.can_generate_report` — server-enforced, "권한 없음" popup otherwise. New column `profiles.can_generate_report boolean not null default false` (migration `202606130001_profile_report_access.sql`, **applied to the linked Supabase project**), toggled per-user by owner/office_admin in admin user management (`updateMemberReportAccess`). No env var required. See decision log (2026-06-13).
- **Projects tab + sections (2026-06-15, first slice).** A seventh **프로젝트** tab (between 관리함 and 공유함) groups tasks under optional sections. New tables `projects`, `project_participants`, `project_sections` and two `tasks` columns (`project_id`, `section_id`) — migration `202606150002_projects.sql` (**applied to the linked Supabase project on 2026-06-15**). A project task is a `tasks` row with `project_id` set; it appears **only** in the Projects tab (excluded from Today/Tomorrow/Inbox/Sent/Calendar), while the Completed tab gained a 전체/일반/프로젝트 filter that can surface project completions. Implemented: project create/delete, section add/rename/delete (deleting a section also deletes its tasks), an Unsectioned area, project-task create + complete/reopen (reusing `completeTask`/`reopenTask`), member invite/remove and leave, RLS via a new `is_project_participant()` helper + an extended `tasks` SELECT policy, and a `project_shared` notification. Server actions in `src/app/mobile/tasks/projects/actions.ts`; queries in `src/lib/projects.ts`; UI in `projects-board.tsx` + `project-detail-view.tsx` + the `/mobile/tasks/projects/[projectId]` route. New i18n `tasks.projects.*` + `mobile.notifications.project*` (ko/ja/en). `npm run lint` + `npm run build` pass. **2차 추가 (2026-06-15):** project tasks now link a building·room·reservation·guest context (the `작업 추가` button opens the full create form pre-bound via `/mobile/tasks/new?project=…&section=…`; `createTask` validates membership + writes `project_id`/`section_id`, no schema change), and sections are **drag-reorderable** by the owner (`reorderProjectSections` + `reorderable-section-list.tsx`); the create sheet's invite UI was reconciled to the source design (inline search + chips). Deferred: per-task drag-reorder, project stats/archive, project↔regular task move, admin web view. See Product `23` + Tech-design `09` "Projects (as-built)".
- **Bottom sheets — iOS drag-to-dismiss + X removal (2026-06-15).** All mobile bottom sheets now share one drag-to-dismiss primitive, `useSheetDragDismiss` (`src/components/shell/use-sheet-drag-dismiss.ts`): drag the grab handle / header down to dismiss (release past `max(80px, 25% height)` or a ≥0.5 px/ms flick; otherwise snap back), with the scrim dimming on drag. Covered sheets: the bottom-bar editor (`mobile-shell`), Tasks quick-add / Calendar day sheet / long-press menu (`tasks-workspace`), share picker, context picker, report sheet, project create (`projects-board`), project members (`project-detail-view`, promoted to a slide-in/out sheet), photo gallery (`photo-gallery`), and the calendar reservation detail (`mobile-calendar-view`); the order action sheet's draggable variant (`order-action-bar`, `isOrdered`). Because the slide dismisses, the **top-right close (X) buttons were removed** from these sheets (scrim tap + Esc remain); X icons with other roles are kept. A touch-propagation fix on the handle stops the shell's pull-to-refresh / swipe-nav from dragging the background with the sheet. Excluded: center-aligned confirm/delete/rename dialogs, the cleaning confirmation card, fixed action bars, the side menu, and the photo lightbox. Docs: Product `16` (canonical contract), `18`, `15`, `23`, Tech-design `09`. `npm run lint` + `npm run build` pass.
- **Recurrence reworked to Todoist-style (2026-06-16).** The 2026-06-15 pre-materialization model (one `tasks` row per date across a ~2-month window) was replaced: a recurring task is now a **single live row** that **rolls forward to its next occurrence on completion** (`completeTask`) and **back on undo** (`reopenTask`), preserving the scheduled/due offset + time. The **calendar shows future occurrences as virtual previews** computed from the rule (`recurringOccurrencesInRange` in the new client-safe `src/lib/tasks-recurrence.ts`) — no extra rows. This fixed the bug where 관리함/공유함 filled with duplicate-looking entries (a daily task had generated ~50 rows). `materializeRecurringTasks` is deprecated and no longer called. One-time cleanup migration `202606160002_collapse_recurring_instances.sql` (**applied to the linked Supabase project**) collapsed existing instances to one row per series (98 rows removed). Docs: Product `18` → Recurring Tasks (As-built 2026-06-16), decision log 2026-06-16. `npm run lint` + `npm run build` pass.
- **Overdue prompt on the Today tab (2026-06-16).** When the viewer has their own overdue tasks, a banner offers **오늘로 가져오기** (`rescheduleOverdueToToday`) and **지난 미완료 삭제** (`dismissOverdueTasks`, two-step confirm). One-off overdue tasks are moved/deleted; recurring tasks keep their series — move re-anchors the single row to today, delete advances it to the next future occurrence (so a daily task's missed run clears but tomorrow's stays). Both actions are author-scoped server-side. New i18n `tasks.overduePrompt*` (ko/ja/en). `npm run lint` + `npm run build` pass.
3. **Staff Suggestions / Feedback Box** — **Debug pass 3 (2026-06-16):** the author edit is now **atomic** — title/body/context/photos + reference re-sync run in one Postgres transaction via `update_staff_suggestion` (migration `202606160005`), fixing a data-integrity bug where a failed reference re-insert could wipe all references while still reporting success (RPC error → `?error=save_failed`, no silent partial success); and changing the recipient while `submitted` now **notifies the new recipient** (reuses the `created` event; unchanged recipient and self suppressed; the RPC returns the previous reference set so only newly-added references are notified). **Debug pass 2 (2026-06-16):** added author edit/delete (submitted-only — `updateStaffSuggestion`/`deleteStaffSuggestion` + `[id]/edit` reusing compose + detail affordances) and fixed the list card to show the author on Received/Referenced (recipient on Sent). **First slice complete & internally shippable 2026-06-16 (Steps 1–8)**: UI + DB schema + create + list + detail + comments + status + notifications + full ko/ja/en i18n & QA hardening. Product `22`, tech-design `12`, notifications `14`. **Step 8 (i18n/QA):** all suggestions UI strings moved into one localized `dict.mobile.suggestions` group (ko/ja/en) threaded as a `copy` prop through every component/page (tabs, filters, form labels, buttons, validation/empty/error states, status labels, hold/completion prompts, comment UI, titles); empty/error/permission edge cases verified; dead `suggestions-detail-referenced.tsx` removed. **2026-06-24 follow-up:** `/mobile/notifications` now renders the live bell feed, and the shared `ContextPickerSheet` now allows **building-only** context links for suggestion records. Four migrations **pending apply** to the linked Supabase project: `202606160001_staff_suggestions.sql` + `202606160003_suggestion_notifications.sql` + `202606160004_suggestion_image_storage.sql` (debug-pass storage-RLS fix for suggestion photo uploads) + `202606160005_update_staff_suggestion_fn.sql` (atomic author-edit function — Debug pass 3). **Step 7 (notifications):** one `suggestion_activity` notification type discriminated by `payload.event` (created / referenced / status / comment); `notifySuggestionParticipants` fan-out (actor-skipped, participant-scoped, deep-links to `/mobile/suggestions/{id}`); wired into create (recipient + referenced), status (author + referenced), comment (other participants); `getNotificationDisplay` branch + ko/ja/en copy (`mobile.notifications.suggestion*`). **Step 6 (status):** `updateStaffSuggestionStatus` server action (`src/app/mobile/suggestions/actions.ts`, service-role, **recipient-only**, target validated, `on_hold`→hold_reason / `completed`→completion_note required, freely reversible); the recipient's status bar + status/hold/completion sheets now submit real changes (controlled note textareas, server-enforced), and the detail + list status chips reflect them. Author/referenced users cannot change status. **Step 5 (comments):** create/update/delete comment server actions in `src/app/mobile/suggestions/actions.ts` (service-role; participant-only create, comment-author-only edit/delete, not-fully-empty + ≤5 photos, **independent of suggestion status**); composer (`suggestion-comment-composer.tsx`, text + photos via shared upload) shown to **all participants** and stacked above the recipient's status bar; each comment (`suggestion-comment-item.tsx`) has inline edit/delete on the viewer's own comments. List comment counts (Step 3) now reflect real activity. **Step 4 (detail):** `getSuggestionDetail` (`src/lib/suggestions-queries.ts`) loads one suggestion participant-only (RLS-backed + derived `viewerRole`; null → redirect to list, no leak) with author/recipient/referenced people, status + hold_reason/completion_note, category/property·room, photos, timestamps, and the comment thread; one **role-aware** `SuggestionsDetail` renders recipient (status bar) / referenced (composer) / author treatments — all now functional (comments wired in Step 5, status in Step 6); the old `/mobile/suggestions/referenced` route now redirects to the list. **Step 3 (list):** `getSuggestionListData` (`src/lib/suggestions-queries.ts`) loads real Sent (author) / Received (recipient) / Referenced (via `staff_suggestion_references`) data, org+user scoped (RLS-backed); the list screen now shows real cards (status/title/excerpt/recipient/ref+comment counts/relative time), a working status filter (active = submitted+reviewing, all, or single), real segment counts, and an empty state (`mobile.suggestions.empty`, ko/ja/en). **Step 2 (create):** `createStaffSuggestion` server action (`src/app/mobile/suggestions/actions.ts`, service-role insert + validation: recipient active-same-org-≠author, references deduped/excluding author+recipient, title/body required, ≤5 photos, status `submitted`); compose screen wired (controlled fields, data-driven recipient single-select / references multi-select picker, `ContextPickerSheet` for building·room with **building-only allowed**, `uploadRequestImages` + exported `compressImageFile` for photos → `suggestion-images/` path), redirect to `/mobile/suggestions`. New i18n under `mobile.suggestions.*` (ko/ja/en). First slice is a participant-scoped feedback thread: one required recipient, optional referenced users, `Sent / Received / Referenced` lists, recipient-only status changes, participant comments, and author main-body edit/delete only while `submitted`. **Schema (Step 1):** migration `202606160001_staff_suggestions.sql` adds `staff_suggestions` + `staff_suggestion_references` + `staff_suggestion_comments` with CHECK constraints (status enum-by-check, recipient≠author, max-5 photos on suggestion + comment, hold-reason/completion-note required), indexes (Sent/Received/status/context/referenced/thread), a `can_view_staff_suggestion()` SECURITY DEFINER visibility helper, and **read-only participant RLS (writes via service role, added later)**. TS types in `src/types/database.ts`; shared constants in `src/lib/suggestions.ts`. **Not applied to the linked Supabase project yet** (needs `supabase db push` / Dashboard SQL). At Step 1 there were no server actions / queries / notifications yet — all added in Steps 2–7 above.
4. **Board (자유 게시판)** — **✅ 출시 완료 (Page 1–3, 2026-06-25).** 댓글 + @멘션 백엔드 구현 중 (2026-06-25) — `board_comments`에 `mentioned_user_ids UUID[]` + `mention_all BOOLEAN` 추가, `board_comment_mentioned`/`board_mention_all` 알림, 멘션 피커 바텀시트 UI(디자인 옵션 E) 동시 진행. i18n 키(`mentionSearchPlaceholder`, `mentionAll`, `mentionDone` 등) `i18n.ts` board 섹션에 추가 완료. 핵심 기능(글쓰기·피드·상세·반응·댓글·고정·삭제·읽음·공유·알림)이 모두 구현되어 내부 사용 가능 상태. 남은 항목은 선택적 후속(글 수정 폼 = Page 4, `board_comment_replied` 알림, @멘션 구현 중, 북마크·편집 이력 등). **Page 3 (상세):** `/mobile/board/[id]`를 백엔드에 연결. `getBoardPost`(`src/lib/board-queries.ts`) → `BoardPostDetail`(전체 글 + 작성자 + 댓글 등록순 + 반응 5종 집계·isMine + 반응자 얼굴 최대 3 + allowComments; 없음/소프트삭제/타 조직 → `notFound()`). 읽음은 `ensureBoardPostRead`(서비스롤 upsert)를 렌더 중 호출(`ensureAnnouncementRead` 패턴) → 안읽음 뱃지 다음 요청에 감소. 서버 액션(`src/app/mobile/board/[id]/actions.ts`, 모두 게시글 row로 org·권한 검증 후 서비스롤 쓰기 + `revalidatePath`): `markBoardPostRead`, `addBoardComment`(본문 필수·사진 ≤3·작성자 알림), `deleteBoardComment`(소프트삭제·본인/owner·office_admin), `toggleBoardReaction`(허용 이모지 👍❤️😂😮😢 외 서버 거부), `pinBoardPost`/`unpinBoardPost`/`deleteBoardPost`(작성자 또는 owner·office_admin), `updateBoardPost`(작성자 전용; **편집 폼 UI는 Page 4로 분리**, 액션 시트 "글 수정"용 자리표시 라우트 `/mobile/board/[id]/edit` 추가). 공유=`navigator.share()`→클립보드 폴백+토스트, 삭제=중앙 확인 모달(BottomSheet 예외). 새 알림 타입 `board_activity`(마이그레이션 `202606250002_board_notification_type.sql` **적용 완료**) — 댓글 시 글 작성자 1건(본인 제외), `notifyBoardPostAuthor` + types/display/i18n(`boardKind`/`boardCommentTitle`/`boardCommentBody` ko·ja·en). **임시 `src/lib/board-i18n.ts` 삭제** → 전 board 문자열을 `i18n.ts` `board` 섹션(ko·ja·en)으로 통합(함수형 → `{count}` 플레이스홀더). 댓글 본문 필수 결정: `board_comments.content` CHECK가 빈 본문을 거부하므로 사진은 보조 첨부로 처리. 라이브 DB로 정렬·집계·안읽음 검증 후 시드 정리. `npm run lint` + `npm run build` 통과. **다음 단계 (Page 4 — 글 수정 폼):** 승인 대기. **Page 1 (Composer) + Page 2 (Feed) 구현 완료 (2026-06-25).** **Page 2 (피드 목록):** `/mobile/board` 를 백엔드에 연결. 서버 전용 쿼리 모듈 `src/lib/board-queries.ts` (브라우저 클라이언트를 쓰는 `board.ts`와 분리 — `suggestions.ts`↔`suggestions-queries.ts` 패턴): `getBoardFeed` (고정 글 `pinned_at` DESC 우선 → 일반 글 `created_at` DESC, `deleted_at` 제외, 작성자명·역할·댓글 수·반응·안읽음 하이드레이션, **커서 기반 페이지네이션**), `getBoardTags` (태그 distinct 필터 칩), `getBoardUnreadCount` (본인 외 미읽음 글 수). 카테고리 필터는 스키마에 category 컬럼이 없어 `tags @> [값]`으로 매핑(행 뱃지=첫 태그), 필터 전환은 `router.replace(?category=)` 서버 리페치 + `key` remount. "더 보기" 버튼 → 서버 액션 `loadMoreBoardPosts` (`src/app/mobile/board/actions.ts`, 페이지 15). 상대 시간은 `Intl.RelativeTimeFormat` + `useSyncExternalStore` 하이드레이션 가드. 하단 탭/사이드 뱃지(`board`)를 `getMobileNavBadges`에 연결. `BoardListRow` unread aria i18n prop화. 피드 i18n 키는 `board-i18n.ts` ko/ja/en에 추가(loadMore/loadingMore/emptyFiltered*/unreadAria). RLS SELECT(`has_active_membership`) + 명시적 org 스코프로 교차 조직 격리 보장(라이브 DB 정책 13개 확인). `npm run lint` + `npm run build` 통과. **다음 단계 (Page 3 — 상세/반응/댓글):** 승인 대기. **Page 1 (Composer) 구현 완료 (2026-06-25).** 기획 확정(2026-06-25) 후 즉시 Page 1 구현. **마이그레이션 `202606250001_board.sql` 적용 완료**: `board_posts` / `board_post_reads` / `board_comments` / `board_reactions` 4개 테이블, 인덱스, RLS 정책, `board-attachments` 버킷 (private), `request-images` 정책에 `board-posts` / `board-comments` 추가 (part_time_staff 포함). **구현 완료**: `src/lib/board.ts` (uploadBoardImage / uploadBoardAttachment / validateBoardImageList / validateBoardFileList), `src/app/mobile/board/compose/actions.ts` (createBoardPost — 권한 기반 pin 처리, org-scoping, 서비스롤 삽입), `board-compose-client.tsx` (실제 파일 입력, 이미지 압축, 업로드 → 게시 → router.replace). `BoardPinToggle` / `BoardFileAddButton` / `board-pin-toggle.tsx` / `board-file-card.tsx` i18n props 추가. `board` i18n 섹션 (ko/ja/en 22개 키). `request-image-upload.ts` `RequestImageType`에 `board-posts` / `board-comments` 추가. `src/types/database.ts` 4개 테이블 타입 추가. `npm run lint` + `npm run build` 통과. **다음 단계 (Page 2 — Feed):** 승인 대기. 전체 기획: `docs/product/23-board-workflow.md`. DB 타입: `docs/engineering/04-data-model.md`. RLS: `docs/engineering/05-rls-permissions.md`.
5. **Attendance / Clock-In-Out + Payroll** — **Step 14 (notifications + 18:30 reminder) implemented 2026-06-18, expanded 2026-06-24 — final app-scope step**: attendance uses the **shared** notification system (new `attendance_activity` type, migration `202606180001`). Admin alerts (owner/`attendance_payroll_admin` only): **correction_created** (on request submit) + **abnormal_session** (midnight clock-out + stale prior-day open sessions via cron). **2026-06-24 expansion:** workers now also receive **correction_approved** / **correction_rejected** results when an attendance admin reviews their request. Worker **18:30 open-session reminder**: once-per-Tokyo-day **home prompt** (shared drag-dismiss; "근무 중이에요"→`still_working` suppresses, "이미 퇴근했어요"→`left_work` routes to correction, **no auto clock-out**) backed by `attendance_open_session_reminders` (migration `202606180002`) + the self-only `respondOpenSessionReminder` action; scheduled scan `GET /api/attendance/reminders` (CRON_SECRET, mirrors tasks/reminders). i18n ko/ja/en for notification copy. In-app only (Web Push deferred); **no admin dashboard**. **Pending migrations:** `202606180001` + `202606180002` + `202606180003` (bug-fix: `target_month` on correction requests, org-scoped reminder unique constraint, partial index for session-less corrections, finalization order fix). **Step 13 (finalized-only payroll export) 2026-06-18**: `runPayrollExport` + `exportMonthlyPayroll` / `exportUserPayroll` (`src/lib/attendance-export.ts`, `src/app/admin/attendance/actions.ts`, owner/`attendance_payroll_admin` server-gated) — monthly bulk + per-person, **finalized snapshots only** (draft/reopened/superseded never included), each writing an `attendance_export_logs` audit row. Operator Excel **template still pending** → interim structured **CSV (UTF-8 BOM)** mapped to documented snapshot fields. **No export UI** (deferred web dashboard); dev route `/api/dev/attendance/export` (dev+privilege gated) streams CSV for testing. **Step 12 (privileged payroll-totals data layer) 2026-06-18**: `getPayrollTotals(org, ym)` (`src/lib/attendance-payroll-totals.ts`) — finalized labor total (finalized snapshots), expected labor total (Σ relevant hourly workers' current expected pay via `getMonthlyPayView`), unfinalized worker count, site-based totals (by **clock-in site**, first-slice rule). Expected vs finalized kept explicitly separate. **Query-only, no dashboard UI** (totals dashboard is part of the deferred web dashboard); caller-agnostic, gated by `isAttendancePayrollAdmin` (owner/`attendance_payroll_admin`); regular/hourly users never reach org-wide totals. **Step 11 (per-person monthly finalization/reopen/snapshot) 2026-06-18**: privileged backend `finalizeAttendanceMonth` / `reopenAttendanceMonth` (`src/app/admin/attendance/actions.ts`, owner/`attendance_payroll_admin` server-gated). Finalize is **blocked** while unresolved items remain (`getFinalizationEligibility`: review-required / pending corrections / open sessions / already finalized) and only for hourly months; it inserts an `attendance_month_snapshots` row (`finalized`: paid minutes, rate breakdown, 10-yen gross, finalizer, time, supersedes link) computed from the same expected-pay helpers, marking prior rows `superseded` (**history preserved**). **Reopen requires a reason**, flips `finalized`→`reopened` (expected pay resumes), never destroys history. Both audited in `audit_logs`. The worker self pay screen (`/mobile/attendance/pay`) shows the **finalized number + 확정 badge** when finalized, reverting to expected after reopen. **No admin dashboard** (deferred web dashboard). **Step 10 (hourly expected-pay + self pay view) 2026-06-18**: hourly **expected** gross-pay calc (`src/lib/attendance-pay.ts`, self-scoped) + new self monthly pay screen `/mobile/attendance/pay` (new UI in the `.att` language — no 급여 frame existed; user asked for an arbitrary screen to refine later). Effective-date rate resolution (whole-day rate, never retroactive); usable sessions only (completed + resolved; open/review-required/pending-correction/invalid excluded); 1-min paid units, breaks excluded, no premiums; monthly gross rounded to 10 yen; salaried days never pay; excluded-count + rate-segment + daily-breakdown (detail sheet) supported. Recomputes live from current attendance/corrections/rate history (no finalization). **No admin dashboard** (deferred). **Step 9 (employment/rate management) still pending** — a dev route `/api/dev/attendance/seed-pay` seeds rates for testing; pay is ¥0/empty until a rate exists. **Step 8 (manual admin management backend) 2026-06-17**: privileged manual attendance is live in `src/app/admin/attendance/actions.ts` — `createManualAttendanceSession` / `updateAttendanceSessionAdmin` / `invalidateAttendanceSession` (owner/`attendance_payroll_admin` server-gated, **mandatory reason + `attendance_session_audits` audit**). Create marks `manual_created` (+by/reason, methods `manual`), validates active-member target + org sites, guards the one-open-session collision; update edits times/sites/review_state with status coherence; invalidate sets `status='invalid'` (+invalidated_at/by/reason) and **never hard-deletes**. **No admin PC/web dashboard built** (explicit scope rule — deferred until the app is complete); these are the backend it will call, and manual/invalid sessions already reflect in the review-queue layer (수동/무효 markers) + worker self-history without UI changes. Payroll-compatible (manual completed sessions carry clock-in/out). **2026-07-02 update:** the admin web dashboard's queue page (`/admin/attendance/queue`, `attendance-queue-client.tsx`) now wires up the session detail panel's admin actions that were previously disabled stub buttons — "수동 정정" opens an inline clock-in/clock-out time + reason editor calling `updateAttendanceSessionAdmin`; "검토 완료 처리" calls `updateAttendanceSessionAdmin({reviewState:"normal"})`, but relabels to "복구 및 완료 처리" and calls the new `restoreAttendanceSession` action (see decision log) when the session's `status` is already `invalid`; "세션 무효" calls `invalidateAttendanceSession`. All three now use a shared centered `AdminReasonModal` component instead of `window.prompt()`. The queue toolbar's site/issue-type filter chips (previously disabled) are also functional client-side filters over the loaded queue items now. The session detail panel also gained a read-only **"변경 내역" (change history)** section that loads the `attendance_session_audits` trail on demand via the new `loadSessionAuditTrail` server action (owner/`attendance_payroll_admin` gated, localized ko/ja/en server-side) — each entry shows the action (수동 정정/무효/복구/정정 승인 등), actor, timestamp, a human-readable before→after diff, and the reason. This is the first UI to surface the audit rows that were previously written but never viewable. The "전체 세션" (all sessions) tab now **groups rows per employee** into collapsible headers (session count + a compact status breakdown badge: 완료/검토/정정 대기/진행 중/무효), collapsed by default — clicking a header expands that worker's sessions — so one worker's many sessions no longer stretch the page. The review/pending/correction tabs stay flat (short, action-first). The multi-select **bulk action bar** now has two working actions — **무효 처리** (bulk invalidate) and **검토 완료 처리** (bulk mark-reviewed) — each opening a shared `AdminReasonModal` for one reason applied to all selected non-invalid sessions (runs the per-session server action across the selection, reports partial failures). The **메시지** (messaging feature not built) and **일괄 정정** (per-session times can't be bulk-applied — open a session to correct individually) buttons stay intentionally disabled with explanatory tooltips. Header "select all" only selects sessions inside **expanded** groups. The toolbar also has a **name search box** (client-side, case-insensitive) that filters the queue table (and the correction list on the corr tab) by employee name. **Payroll page (`/admin/attendance/payroll`) month navigation** was upgraded from prev/next-only links to a reusable **`AdminMonthPicker`** — center month label opens a popover with year steppers + a 12-month grid (+ "이번 달" jump to the current Tokyo month), so distant months are one click away instead of many; it navigates via `?ym=YYYY-MM` (`AttendanceSubnav` unaffected). The same `AdminMonthPicker` now also replaces the prev/next-only pagers on the **transport** (`/admin/attendance/transport`) and **staff detail** (`/admin/attendance/staff/[userId]`) pages — all three month-navigated admin attendance pages share one picker component. **Month now persists across the attendance subnav (2026-07-02):** the 개요(overview) page gained the same `AdminMonthPicker` + `?ym=` (its review-queue scope + payroll/transport KPI cards reflect the selected month via `getAdminAttendanceOverview(session, localeTag, ym)`), and `AttendanceSubnav` carries the current `ym` as `?ym=` on every tab link — switching between 개요/검토큐/급여/교통비/시급 keeps the chosen month instead of snapping back to the current month. Every attendance page reads `?ym=` and threads it into the subnav (queue/wages aren't month-scoped in their own data but still pass the month through so onward navigation preserves it). **Staff detail day ledger** (`/admin/attendance/staff/[userId]`) is now collapsible (first 6 session rows + a bottom gradient fade, "전체 N건 보기" toggle expands all) and its session query was fixed — it had selected a non-existent `break_total_sec` column on `attendance_sessions` (breaks live in `attendance_breaks`), which errored the query so the ledger showed empty despite recognized hours; breaks are now summed from `attendance_breaks`. The staff transport card's **"장부"** link now deep-links to `/admin/attendance/transport?ym=&user=<userId>`, and the transport page opens that user's detail panel on load (`initialUserId`) instead of just showing the full list. The transport detail panel was also restructured for readability with many items: the separate "증빙·영수증" photo grid was removed and each settlement item now carries its own **inline receipt thumbnail(s)** (click → the shared `ImageLightbox` used across the admin dashboard, i.e. pinch/zoom + left/right carousel across all of the report's receipts; missing-evidence items show a dashed placeholder), and the item list is **collapsible** (first 6 + bottom gradient fade + "전체 N건 보기" toggle) so a 20+-item month no longer produces an endlessly long panel. Approve/reject in this panel also moved from `window.prompt()` to the shared `AdminReasonModal`. **Payroll "이번 달 내보내기" now produces a clean, localized Excel workbook (2026-07-02):** `exportMonthlyPayrollWorkbook(ym)` (`src/app/admin/attendance/actions.ts`) builds a styled, Excel/LibreOffice-openable workbook via `src/lib/attendance-payroll-workbook.ts` (No / 성명 / 고용형태 / 시급 / 인정 시간 / 출근일수 / 예상·확정 세전 급여 / 제외 / 상태 columns + a totals row, navy header, zebra rows). It reflects the LIVE monthly payroll view (all active members, not finalized-only) and is fully localized to the caller's UI language (ko/ja/en headers + new `payExport*` keys). It is a true native **`.xlsx`** built with **`exceljs`** (`^4.4.0`, added 2026-07-02): frozen header row, auto-filter, `¥#,##0` currency + number cell formats, and a SUM totals row (real formulas); the server action returns it as base64 and the client decodes it to a blob for download. `AdminPayrollRow` gained a `workDays` field (Tokyo operating days with paid minutes) for the export; the finalized-only CSV (`runPayrollExport`) stays for the audited per-person/finalized path. **A print-quality PDF export was added alongside the Excel one (2026-07-02):** a second toolbar button "PDF 내보내기" calls `exportMonthlyPayrollReport(ym)` which returns a self-contained, localized print-styled HTML document (`src/lib/attendance-payroll-report.ts`: A4-landscape `@page`, title band + 3 summary cards + navy-header table with zebra/totals, viewer-independent) that the client opens in a new tab and auto-triggers the browser print dialog for "Save as PDF" — the fixed, tax/accounting hand-off format. Excel (editable) and PDF (fixed report) are now both offered. **Step 7 (admin review backend) 2026-06-17**: org-wide correction-review **backend** is live — `src/lib/attendance-review.ts` (review-queue query with filters all/review_required/correction_requested/incomplete/manual/not_finalized + name/date/site, priority-ordered; `isAttendancePayrollAdmin` gate = owner/`attendance_payroll_admin`/platform admin) + `src/app/admin/attendance/actions.ts` (`setCorrectionInReview` / `approveCorrectionRequest` / `rejectCorrectionRequest`, all server-privilege-gated). **Approve authoritatively applies** admin-confirmed final values (default = requester's proposals) to the linked session (review_state→`approved_correction`, open→completed when both ends present) + writes an `attendance_session_audits` (`correction_apply`, before/after) row; **reject requires a comment** and leaves the session unchanged (auditable on the request row). **2026-06-24 follow-up:** approval/rejection now notify the worker in the shared bell feed. Site-master stays owner-only (not broadened). **The review-queue UI is built in the WEB DASHBOARD later** (like site/QR); worker self-view (history chip + session changes + request status) reflects outcomes automatically on next load. **Step 6 (correction/exception requests) 2026-06-17**: the existing `/mobile/attendance/correction` form + `…/status` screens are now functional. `createAttendanceCorrectionRequest` (`src/app/mobile/attendance/actions.ts`, service-role) is **self-only + current/previous Tokyo month only**, supports reason + desired in/out times + desired site + memo + photos (≤5, via the new `attendance-corrections/` storage folder — migration `202606170003`), and **never mutates the session** (admin confirms in Step 7; no auto-apply). Session-linked and session-less **exception** requests both supported (capture failure sheets reach the form). The status screen is data-driven (`getCorrectionRequestView`, self-scoped, all four states ready for Step 7); self-history surfaces the latest per-session correction status as a chip + offers "이 세션 정정 요청". **Pending migration:** `202606170003_attendance_correction_storage.sql`. **Step 5 (self-view history) 2026-06-17**: own attendance **history** screen at `/mobile/attendance/history` — today summary + the user's own session list with a per-session detail bottom sheet (clock-in/out, sites, methods, break rows, review/abnormal markers). Query layer `src/lib/attendance-history.ts` (`getAttendanceHistory`/`getAttendanceTodaySummary`) is **strictly self-scoped** server-side (no client-supplied target user). The 이력 screen is **new UI in the existing `.att` design language** (the handoff had no 이력 frame; user-confirmed); minimal token-based CSS added; 이력 + 급여 shortcut entry rows now appear in **all three home states** (idle / open / break), placed below the primary action buttons (2026-06-23). Same for salaried + hourly; no pay calc. **Step 4 (break tracking) 2026-06-17**: break start/end is live on the home (`startBreak`/`endBreak`, `src/app/mobile/attendance/actions.ts`, service-role) — open session required, one open break at a time, multiple breaks per session (each kept as its own `attendance_breaks` row), and **clock-out blocked while a break is open** (`open_break_blocks_clock_out`; never auto-closed). The home renders 출근 전 / 근무 중 / 휴게 중 from real data with live timers (휴게 중 shows current-break mm:ss, worked = elapsed − total break, running 휴게 합계/횟수); same for salaried + hourly. Break rows are payroll-ready (sum closed durations later) and not logged to `attendance_attempt_logs`. **Step 3 (GPS + QR clock-in/out) 2026-06-17**: the worker UI is now functional. `submitAttendanceScan` (`src/app/mobile/attendance/actions.ts`, service-role) validates the QR token + resolves the site, checks GPS against the site radius (haversine), enforces one-open-session-per-user, creates an `open` session on clock-in / completes it on clock-out (clock-out may be a different site; midnight-crossing → `review_required`), and logs **every attempt** (success + each failure) to `attendance_attempt_logs`. The capture screen does in-app camera QR scan (added the `jsqr` dependency) + Geolocation, mapping results to the existing success / 반경밖 / 위치권한 / QR / 이미근무중 / 근무없음 sheets (reusing the shared drag-dismiss sheet); the home renders the real open session with a live elapsed timer and launches clock-out (`?mode=out`). Full attendance i18n pass completed 2026-06-18 — ~112 new ko/ja/en keys across all 8 screens (capture, home, pay, history, correction form, correction status) with function keys for locale-sensitive sentence order. Final cleanup (2026-06-18): name suffix (`userNameDisplay`), preview fallback site (`previewSite`), and static break-preview ordinal fixed. `GPS + QR`, `GPS+Wi-Fi`, and `Wi-Fi` attendance method labels are intentionally retained as universal technical standards across chips and history/detail surfaces (not locale-specific copy). Breaks, corrections, payroll, dashboards, exports, notifications, and the full midnight sweep remain later steps. **Step 2 (site/QR backend) 2026-06-17**: site master + QR lifecycle **backend** ready — `src/lib/attendance-sites.ts` (create/update/activate site, issue/reissue/revoke QR, list/get/active-QR/history reads) + atomic `issue_attendance_qr` function (migration `202606170002_issue_attendance_qr_fn.sql`, one-active-token-per-site + reissue audit chain). **Build-surface decision (user-confirmed 2026-06-17): the owner-only site/QR admin UI is built in the WEB DASHBOARD later — the app is finished first.** Helpers are caller-agnostic; owner-only enforcement is deferred to those future web-dashboard server actions. For app testing meanwhile, a **dev-only `GET /api/dev/attendance/temp-qr`** (local-dev gated, like seed-login) provisions a temp site + active QR and renders a **scannable QR** (added the `qrcode` dependency). Wi-Fi stays modeled but inactive (`준비중`). **Pending migrations:** `202606170001` + `202606170002`. **Step 1 (schema + permission foundation) 2026-06-17** — migration `202606170001_attendance_payroll.sql` adds all **11 session-first tables** (`attendance_sites`, `attendance_qr_tokens`, `attendance_sessions`, `attendance_breaks`, `attendance_attempt_logs`, `attendance_correction_requests`, `attendance_session_audits`, `employment_type_history`, `hourly_rate_history`, `attendance_month_snapshots`, `attendance_export_logs`) plus the `memberships.attendance_payroll_admin` flag and the `can_manage_attendance_payroll(org)` helper. DB guarantees now enforced: one `open` session per user, one active QR token per site, correction photos ≤ 5, status/method/reason CHECKs, default site radius 100m, Wi-Fi SSIDs modeled (PWA-inactive). **Read-only RLS only** — all writes go through service-role server actions in later steps. TS types (`src/types/database.ts`) + shared `src/lib/attendance.ts` (row aliases, status/method/reason unions, constants) added. The earlier `attendance_events`/`employment_profiles` draft is superseded (data-model `04` updated). The attendance **UI design slice** (Home + Capture + Correction) already exists from 2026-06-17 and is unchanged. **Pending migration to apply:** `202606170001_attendance_payroll.sql`. Remaining: Step 2+ clock-in/out + break + correction actions, history/review queries, then payroll/finalization/dashboard/export/notifications. Earlier planning/design refined on **2026-06-17**: attendance is a **session-based** system with site-bound GPS proof, fixed on-site QR for the first PWA release, correction / exception requests, audit history, per-person monthly finalization, and hourly-worker **gross-pay** calculation only. `GPS + Wi-Fi` remains in the long-term design but is **inactive in current PWA UI** and should appear as `준비중`; current active method is **GPS + QR**. Salaried staff use the module for attendance records only. Hourly pay rules are now defined enough for implementation: 1-minute units, recorded breaks only, no automatic break deduction, no OT/holiday/night premiums, final monthly gross rounded to nearest 10 yen, Tokyo month = `1st` through `last day`. Taxes / deductions and salaried payroll remain outside StayOps. Remaining open delivery items are the final Excel export template and any future non-PWA Wi-Fi activation path. Product `21`, tech-design `11`.

**Cleaning Log (청소 기록표) — implemented 2026-06-15.** A date-grouped cleaning record sheet at `/mobile/cleaning/records` (entered from a "내 청소 기록" link on the cleaning home). Horizontal text rows grouped by date (no horizontal scroll): status dot · start–end time · building·room · cleaning-type chip · duration, with a month header (count + total duration), status filter chips, and month navigation. Reuses `getOrgCleaningSessionsFiltered` + the active-room catalog — **no schema/RLS/migration change** (`cleaning_sessions` RLS already scopes own-vs-manager). Permissions: `staff`/`part_time_staff` see own only; `field_manager`/`cs_staff`/`office_admin`/`owner` (`canViewOthersCleaning`) can view others via a staff filter in the app; admin web `/admin/cleaning` already lists all + CSV/Excel export. Files: `src/app/mobile/cleaning/records/page.tsx`, `src/components/cleaning/cleaning-records-view.tsx`, `canViewOthersCleaning` in `src/config/roles.ts`; i18n `cleaning.records.*` (ko/ja/en). See Product `07` "2026-06-15 Cleaning Log".

**Mobile home redesign (Haru Ops home) — implemented 2026-06-17; attendance hero wired to real state 2026-06-22.** The `/mobile` home screen was fully re-skinned to the "Haru Ops · 홈 (빠른 출근)" / v2 design while preserving **all** existing functionality (greeting, last-updated clock, important announcement, today check-in/out counts, active cleaning task, quick actions, today's activity timeline). New top-of-home elements: a **greeting header** (Tokyo date + name + avatar initial) and a quick attendance hero with GPS+QR / Wi-Fi 준비중 chips that opens `/mobile/attendance`. **As of 2026-06-22, the hero is no longer static**: it reads the current open attendance session and reflects **출근 전 / 근무 중 / 휴게 중** in real time, including the live elapsed timer and the current clock-in site/time summary. The quick-action grid keeps the existing four actions (청소 / 정비 / 분실물 / 주문) — **clock-in is intentionally not duplicated there** since it lives in the hero. **2026-06-17 follow-up:** the 오늘 현황 check-in / check-out count cards are now **tappable** and open a drag-to-dismiss bottom sheet listing that day's reservations (guest · localized building·room · channel) — `getHomeCheckInOutReservations` (`src/lib/home.ts`) + `src/components/mobile/home-checkinout.tsx`; new i18n `mobile.homeCheckInEmpty` / `homeCheckOutEmpty` / `homeGuestUnknown` (ko/ja/en). No schema change (reservations read only). The design's top **3D hero image** (wireframe orb) is **not used** for now but the asset is preserved at `src/assets/home-hero-3d.svg` (not deleted) for future reuse; the previous Lottie hero (`HomeHeroAnimation`) is no longer rendered but kept in the repo. Files: `src/app/mobile/page.tsx` (re-skinned, same server data fetching), scoped styles `src/components/mobile/home-screen.css` (`.hm`-prefixed), new i18n `mobile.homeGreeting` + `mobile.homeClock*` (ko/ja/en). No schema/RLS/migration change. `npm run lint` + `npm run build` pass. See Product `16` → Home (Haru Ops home redesign, 2026-06-17).

**Attendance capture bottom-sheet drag fix — implemented 2026-06-22.** The clock-in/out result sheet in `src/components/attendance/attendance-capture.tsx` now uses the shared `BottomSheet` instead of a hand-rolled drag layer. This aligns it with the canonical mobile sheet contract (body scroll lock + isolated handle drag), fixing the real-device bug where dragging down from the sheet header could scroll the underlying screen instead of moving only the result sheet. No change to attendance business logic or result states; dismissal behavior only. `npm run lint` + `npm run build` pass.

**BottomSheet mobile scroll-lock hardening — implemented 2026-06-22.** The shared `BottomSheet` now applies a stronger real-device scroll lock while open: `body` is fixed in place (preserving the previous scroll position), `html/body` overflow is hidden, document overscroll is disabled, and the drag handle touch events call `preventDefault()` in addition to `stopPropagation()`. This fixes the remaining iPhone/real-device issue where dragging a sheet handle could still move the background page even though the sheet itself was draggable. Shared component only; no product-flow change. `npm run lint` + `npm run build` pass.

**Mobile shell iOS/PWA seam hardening — implemented 2026-06-23.** The full-screen side menu now keeps the shared top and bottom chrome locked hidden until the close transition completes, preventing the header/tab bar from flashing under the sliding panel for a few frames. The sidebar transition was shortened to 360ms, the top background blend now uses `calc(env(safe-area-inset-top) + 64px)` instead of a fixed 96px guess, and the old visually-hidden sidebar scrim layer was removed to avoid extra iOS compositing / status-bar sampling. Shared bottom-sheet drag distance updates are now `requestAnimationFrame`-coalesced so heavy sheets do not re-render at raw pointer-event frequency. Docs reconciled in Product `16`, Workflow `04`, and the mobile-shell iOS reviewer checklist.

**Bottom sheet unification — implemented 2026-06-17.** Introduced one canonical **`BottomSheet`** component (`src/components/shell/bottom-sheet.tsx`) encapsulating the whole sheet shell (portal to `<body>`, slate `bg-slate-950/45` scrim that fades transparent on drag, `bg-surface` `rounded-t-[24px]` `max-w-[460px]` surface, 38px `bg-slate-200` handle, drag-to-dismiss via `useSheetDragDismiss` + scrim-tap + Esc, body-scroll lock, no X). Mount-driven with a render-prop (`{ close, dragHandleProps }`) / `useBottomSheetClose` for programmatic close and `useBottomSheetDragHandle` for extra drag zones. Migrated onto it: home check-in/out, report sheet, share picker, cleaning record detail + filter picker, project create, project members. The remaining bottom sheets were **normalized to the canonical values** (slate scrim + 24px radius + slate-200 handle): the 6 suggestions sheets (via `suggestions.css`), context picker, bottom-bar editor (`mobile-shell`), Tasks day/long-press sheets, projects-board create, project members, cleaning record detail, and the calendar reservation sheet — several previously used a warm `rgba(20,16,10,0.5)` / `rgba(13,24,23,0.46)` scrim. Intentional exceptions: the Liquid-Glass order "처리" sheet (`order-action-bar`), the photo lightbox, fixed action bars, and small dropdown menus. Standard is now mandated in CLAUDE.md (mobile shell contract) + Product `16` ("Bottom Sheet — Canonical Visual Standard"). **Full sweep (2026-06-17):** the former center-aligned confirm / delete / action / picker dialogs were ALL converted to bottom sheets too (so every bottom-anchored popup slides up + dims-on-drag like the home sheet) — maintenance/lost-found/order confirms, generic + task + project + filter delete confirms, announcement popup/delete/read-status, linen success + detail-delete, cleaning completion/cancel/targets/linked-confirm, the date-range + order-delivery calendars, and the requests filter sheet. A final grep verified zero bottom overlays lack the drag effect. `npm run lint` + `npm run build` pass.

**Reservation data-loss logic fixes — implemented 2026-06-18.** Compared our reservation→room mapping against the in-house reference system (which never loses data) and fixed the code paths that could silently drop bookings from the calendar / home check-in-out sheet. (1) **null minStay rooms stay visible**: `classifyBeds24Room(null)` now → **active** (was inactive) and `getActiveRoomCatalog` includes null-minStay beds24 rooms + counts any room row as classified — webhook-synced rooms (which never carry minimumStay) are no longer hidden until a separate inventory sync runs; only an explicit `>= 50` excludes. (2) **No-drop + fallback**: the calendar (`src/app/mobile/calendar/page.tsx`) and home sheet (`src/lib/home.ts`) no longer discard reservations whose room is not in the active catalog — they fall back to the normalized room label, and the calendar **adds orphan rooms to the room axis** so the bar renders. (3) **Fetch completeness verified (no change)**: reconcile/backfill + all surface queries filter by **stay dates** (`arrivalTo`/`departureFrom`, check-in/out overlap), so a booking made any time ago that checks in this/next month is captured; only the 2-month display window constrains stay dates, never the booking date. Files: `room-sync.ts`, `rooms.ts`, `home.ts`, `calendar/page.tsx`; docs `15-reservation-calendar` (2026-06-18 sections), `01-beds24-integration`, `06-property-room-model`. `npm run lint` (0 errors) + `npm run build` pass. **Infra still pending (separate task): live Beds24 webhook delivery — `beds24_webhook_events` shows 0 webhook events; reconcile last ran 2026-06-10, so data is currently frozen regardless of these logic fixes.**

**출근자 명단(Attendance Roster) — 구현 완료 (2026-06-24).** 관리자 전용 실시간 출근자 현황 화면 `/mobile/attendance/roster` 이 추가되었다. 접근 권한: `cleaningRecordViewerRoles` (owner, office_admin, cs_staff, field_manager); 권한 없는 역할은 `/mobile/attendance`로 리다이렉트. 진입 경로: `attendance-home.tsx` 홈 바로가기 목록 하단(시급 급여 아래) 권한 보유 역할에게만 표시. 화면 구성: 주간 스트립(출근 기록 있는 날 하단 점, 미래 비활성), 날짜 메타 + "오늘" 태그, 캘린더 BottomSheet, 요약 카운트(근무 중/퇴근 완료/검토 필요/무효), 직원 카드 리스트(출근 시각 순), 빈 상태. URL: `/mobile/attendance/roster?date=YYYY-MM-DD` (date 없으면 Tokyo 오늘; 미래 + 90일 이전 clamp). 데이터 소스: `attendance_sessions` JOIN `profiles` JOIN `memberships` JOIN `attendance_sites` JOIN `attendance_breaks` (서버 컴포넌트 실시간 로드). 상태 정의: `working` (green) / `on_break` (amber) / `done` (slate) / `needs_review` (orange) / `void` (red). **전화 버튼 신규 추가:** `working` 또는 `on_break` 상태이며 `profiles.phone_number` 가 존재하는 직원 카드에만 `<a href="tel:">` 버튼 표시 — 퇴근 완료/무효/검토 필요 상태에서는 숨김. Docs: Product `24` (출근자 명단 + 전화 기능 섹션).

**관리자 출근자 명단 — 구현 완료 (2026-07-02).** `/admin/attendance/roster`가 추가되어 관리자 콘솔에서도
모바일 출근자 명단과 같은 `getAttendanceRoster` 서버 헬퍼를 사용한다. 첨부 desktop handoff의 날짜
툴바, 캘린더 팝오버, 요약 카운트, 상태별 그룹 테이블, 빈 상태를 콘솔 디자인 토큰으로 포팅했으며,
오늘 조회 중에는 10초 간격 조용한 재조회로 모바일 출퇴근/휴게 변화가 자동 반영된다. URL은
`?date=YYYY-MM-DD`, Tokyo 오늘 기준 미래/90일 이전 clamp는 모바일과 동일하다. 근태 subnav에는
`출근자 명단` 탭이 추가되었고, 월 단위 탭들은 공통 월 선택기를 유지하는 반면 명단은 근태 subnav
우측의 상단 일자 선택기 하나로 조회한다. 명단 본문 내부의 중복 캘린더는 두지 않는다.
상단 갱신 시각 표시는 데이터 재조회 주기와 분리되어 1초 단위로 움직이며, 숫자는 tabular width로
고정해 초가 바뀌어도 칩 외곽선이 흔들리지 않게 한다. 상태칩의 점은 모바일 출근자 명단처럼 작은
pulse 점으로 표시한다.
열린 휴게가 있는 행은 휴게 컬럼에 상태명 대신 `휴게 N분` 경과 시간을 표시하고, 오른쪽 상태 컬럼의
`휴게 중` 칩으로 현재 상태를 따로 보여준다.
PC 관리자 명단에서는 전화 컬럼과 `tel:` 버튼을 제거했고, 전화 연결은 모바일 출근자 명단에서만
제공한다.
직원 월별 상세의 `급여 검토로 돌아가기` 링크는 상단 subnav와 붙지 않도록 전용 상단 여백을 두어,
사용자 헤더 카드와 같은 상세 콘텐츠 흐름으로 읽히게 조정했다.
근태 subnav 바는 풀폭 하단선 띠 대신 둥근 toolbar surface로 조정했다. 연한 hairline border,
얕은 shadow, pill형 활성 탭을 사용해 급여/출근자 명단 같은 하위 탭 전환이 더 정돈된 콘솔
컨트롤로 보이게 한다.
검토 큐의 내보내기 버튼은 제거했다. 검토 큐는 미확정 작업함이므로 export 목적이 불명확하고,
내보내기는 급여/교통비처럼 정산·확정 자료가 필요한 화면에만 유지한다.
시급 관리의 상단 `시급 대장 내보내기` 버튼도 제거했다. 시급 관리는 설정/이력 확인 화면으로 두고,
실제 정산 export는 급여 검토와 교통비 검토 화면에만 둔다.

**Cleaning start-time timezone fix — implemented 2026-06-25.** The cleaning mobile main page (`/mobile/cleaning`) and admin cleaning list (`/admin/cleaning`) now format `started_at` explicitly in **Asia/Tokyo**. This fixes the QA issue where the cleaning start time could look shifted on environments that defaulted to UTC even though the stored `cleaning_sessions.started_at` instant itself was correct. No schema/RLS change. Files: `src/app/mobile/cleaning/page.tsx`, `src/app/admin/cleaning/page.tsx`, Product `07`. Verification pending below.

**Attendance pay-amount privacy toggle — default hidden + localStorage persistence (2026-06-23).** The eye-icon toggle on the attendance home's 시급 급여 shortcut row and on the `/mobile/attendance/pay` pay card now **defaults to hidden (가려진 상태)** and **persists the user's last choice** via `localStorage` key `stayops:attendance:pay-amount-visible` (`"1"` = shown, `"0"` = hidden). Both screens share the same key so toggling on one screen is reflected when entering the other. SSR safe: first render is always hidden (server and first-client paint match); a `useEffect` reads the stored value and updates state client-side only, avoiding hydration mismatches. Cross-tab sync via `window` `storage` event. `localStorage` access is wrapped in `try/catch` for Safari private-mode safety. New shared hook: `src/lib/use-persistent-toggle.ts`. No i18n change, no visual design change. `npm run lint` + `npm run build` pass. Docs: Product `24` (Amount privacy toggle section).

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
  - **Admin console is a separate installable PWA (2026-07-03).** `/admin/*` advertises
    `public/manifest-admin.webmanifest` (id/scope/start_url `/admin`, unlocked orientation) via
    `src/app/admin/layout.tsx`; mobile keeps the root `public/manifest.webmanifest`. Icons reuse
    the existing `/icons/*` set for now. See `docs/product/05-admin-web-ia.md` → "Installable
    Admin PWA" and the 2026-07-03 decision-log entry.
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
- **`/auth/login` entry-screen redesign — design pass started 2026-06-18 (from the "Auth Entry & Sign-in" handoff).** The login page now renders the new mobile **auth entry** screen: empty brand logo slot (a real logo is dropped in later — this is a deliberate reserved space), serif-italic `Stay Ops` wordmark, product subtitle, a `직원 전용 · 보안 로그인` trust chip, then **two equal CTAs** — `Google로 계속하기` (wired to `signInWithGoogle`) and `이메일로 계속하기` — over an `또는` divider, an `이메일로 가입` link, the team-invite-code note, and `이용약관 · 개인정보 · 도움말` legal links. Colors reuse the existing ivory/navy design tokens (the handoff was built on them, so it matches 1:1). **2026-06-23 rollout cleanup:** the dev/test-login block was removed; QA now uses real Google/email accounts plus invite-code onboarding only. New i18n group `auth.entry.*` (ko/ja/en) + `auth.productSubtitle` (en) updated.
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
- **Onboarding redesign — team-join flow (Band 2, screens 5–8 of 12) — 2026-06-19; CTA clarification fix 2026-06-24.** Decisions (user-approved): the **language step is skipped** (already chosen at login + in the form), so `TOTAL_STEPS` is now **4** (name → dob → phone → invite); the **invite step is skippable** (code-less path for platform admins / join-later). Wizard steps now `0 intro → 1 name → 2 dob → 3 phone → 4 invite entry → 5 org/role confirm` (the old `ProfileForm` bridge is kept only as an unreachable `step >= 6` fallback). **Step 4 (invite entry):** progress `4 / 4`, `팀 참여` eyebrow, two-line `팀 초대코드를\n입력하세요` title, a centered mono code input (single field — real codes vary in length, so the handoff's fixed 6-box segmented design doesn't fit), a `팀 확인` verify CTA with a `확인 중` busy state, an invalid-code danger banner (resolved via `onboarding.errors.*`), and a `코드 없이 나중에 입력` skip. **Step 5 (org/role confirm):** navy-gradient org card (org name + `확인됨` shield chip) over the localized role, and a CTA that now explicitly means **advance to review** (`가입 정보 확인하기`) rather than looking like the final join action. Wired to the real backend — `previewInviteCode` (validate + org/role preview) on verify, `completeProfile` (hidden fields carried from wizard state: name/birthDate/phone-E164/preferredLanguage=locale/inviteCode) on join or skip. New i18n group `onboarding.joinFlow.*` (ko/ja/en; renamed from `join` to avoid colliding with the existing `onboarding.join` string) — no hardcoded strings. `npm run lint` + `npm run build` pass; verified all three verify paths in the running app (invalid → banner, verifying → busy, valid `PARTTIME-TEST` → real org "StayOps Internal" / role "아르바이트`). Did NOT submit the join (would mutate the signed-in super-admin's profile + consume an invite). Remaining: Band 3 review + success screens.
- **Onboarding redesign — Band 3 (review · joining · success) + flow complete — 2026-06-19.** Final wizard order: `0 intro → 1 name → 2 dob → 3 phone → 4 invite → 5 org/role confirm → 6 review → 7 success` (old `ProfileForm` bridge is an unreachable `step >= 8` fallback). **Step 6 (review):** a card listing every entered value — 이름/생년월일(`YYYY. MM. DD`)/전화번호(`+dial national`)/언어(read-only, set at login)/소속/역할 — each with a `수정` button that jumps back to the relevant step; an info banner; and a `가입 완료하기` submit with an in-place spinner (the "가입 처리 중" busy state). **Step 7 (success):** green check, `설정 완료` eyebrow, two-line `환영합니다,\n{name}님`, an org/role-aware body, and `업무 시작하기 →`. New server action `submitOnboardingProfile` (`src/app/onboarding/actions.ts`) upserts the profile + optionally joins via invite code and **returns the destination instead of redirecting**, so the wizard can show the success screen before `router.push(dest)`. Org-confirm + invite-skip now route into review (no more direct `completeProfile` form submit from the wizard). New i18n groups `onboarding.review.*` / `onboarding.success.*` (ko/ja/en) — no hardcoded strings. `npm run lint` + `npm run build` pass. Verified the full flow in the running app: name→dob→phone→invite(`PARTTIME-TEST`)→org-confirm→**review** (all values correct: 김현준 / 2000.01.01 / +81 9012345678 / 한국어 / StayOps Internal / 아르바이트) and the **success** screen (previewed via a temporary initial-step override, since real submit would mutate the signed-in super-admin's profile + consume an invite; the override was reverted). **This completes the 12-screen Profile Setup onboarding redesign.**
- **Onboarding membership-only path unified into the wizard (2026-06-24, updated 2026-07-03).** The post-profile `needs_membership` route no longer falls back to the older join-only screen. It now reuses the same onboarding wizard and opens directly at the **invite-code step** with the saved profile values preloaded for the later review/submit step. For this membership-only path, `코드 없이 나중에 입력` is disabled and an explicit **로그인 화면으로 돌아가기** action was added so a stuck test account can exit cleanly instead of being trapped on the join screen. Docs/product sync: Organization + Invitations `04`.
- **Onboarding gender field added (2026-07-03).** The onboarding wizard now inserts a dedicated **gender step** between date of birth and phone number, using the same ivory/navy setup flow and multilingual copy (`ko` / `ja` / `en`). New onboarding submissions save `profiles.gender` via `submitOnboardingProfile` / `completeProfile`, and the fallback `ProfileForm` now includes the same field. A new nullable enum column `profiles.gender` (`female | male`) was added by migration `202607030002_profiles_gender.sql`. The field is intentionally **not** part of the legacy completeness gate in `getOnboardingState()` yet, so already-onboarded users are not forced back into onboarding just because the schema grew.
- **Runtime guard for gender migration rollout (2026-07-03).** `getOnboardingState()` and `getCurrentAppSession()` now fall back to the pre-gender `profiles` select if the remote database has not applied `202607030002_profiles_gender.sql` yet. This prevents existing users from being misclassified as `needs_profile` and sent to the new-user onboarding intro just because the new column is not live on that environment yet.
- **Login debugging pass — fixed: password-reset "set new password" screen was unreachable (2026-06-19).** **Bug:** the reset-email link lands on `/auth/login?view=email&mode=new_password` carrying a Supabase **recovery session**, so the user is *authenticated*. The login page's gating runs first and unconditionally redirects any non-unauthenticated user (`ready → dashboard`, otherwise `→ /onboarding`) — only `view=blocked` was exempt — so the new-password form (a later branch) was never reached, and password reset could never be completed. **Fix (two layers):** added an `isPasswordRecovery = view==="email" && mode==="new_password"` exemption to both gating redirects in `src/app/auth/login/page.tsx`, AND the same exemption to the `middleware.ts` auth-page redirect (which previously exempted only `view=blocked`). **The middleware layer is the real blocker in production** — it redirects authenticated users away from `/auth/login` before the page renders; the page-only fix appeared to work locally only because middleware's `getUser()` did not observe the session in this dev setup (the bounce on plain `/auth/login` came from the page, not middleware). Verified in the running app: while authenticated, `?view=email&mode=new_password` now renders the `새 비밀번호 설정` form instead of bouncing to onboarding; no console errors. Other auth flows checked and OK: action redirects (`signInWithEmailPassword`/`signUpWithEmail`/`requestPasswordReset`/`updatePassword`) match the page's `view`/`mode`/`sent` branches; `resume_existing_account` error key exists in ko/ja/en; reset-sent / verification-sent confirmations are unauthenticated-only (correctly not gated). `npm run lint` + `npm run build` pass.
- **Login review follow-ups — blocked-state CTAs wired + Google identity contract made explicit (2026-06-19).** From the confirmed code review: **(3, fixed)** the blocked-account primary CTAs were dead `href="#"` for `suspended`/`disabled` (only `removed` had a real link). They now open a **prefilled `mailto:`** to `NEXT_PUBLIC_SUPPORT_EMAIL` (new env, added to `.env.example`/`.env`; empty recipient falls back to the user's mail client) with a localized subject + body containing the account email — `src/app/auth/login/page.tsx` (per-state `primaryHref` on the blocked config; new i18n `auth.blocked.contactSubjectSuspended/contactSubjectDisabled/contactBody`, ko/ja/en). **(2, documented + guarded)** "same email = same account" for Google now has an explicit contract comment on `signInWithGoogle` (`src/app/auth/actions.ts`) and a doc section — it relies on Supabase **automatic identity linking** + **email confirmation required** (verified: the owner account carries both `email`+`google` identities). A manual link-identity flow (the "계정 연결" screen) is intentionally **not** wired — Supabase enforces email uniqueness today, so it would be premature; **action item for the user: confirm the Supabase Auth dashboard keeps automatic linking on + email confirmations required.** `npm run lint` + `npm run build` pass. (Blocked screens preview only when logged-out, since logged-in non-blocked users are gated to onboarding; the mailto wiring is build-verified.)
- **Auth backend ready for signup/reset screens (2026-06-18).** `signUpWithEmail`, `requestPasswordReset`, and `updatePassword` server actions are implemented and waiting for their respective design screens. i18n keys for all states added: `auth.email.signupSubtitle/signupCta/confirmPasswordLabel/confirmPasswordPlaceholder/passwordPolicy/verificationSentTitle/verificationSentBody/resetTitle/resetSubtitle/resetCta/resetSentTitle/resetSentBody/newPasswordTitle/newPasswordSubtitle/newPasswordLabel/newPasswordConfirmLabel/updatePasswordCta/passwordUpdatedNote` (ko/ja/en). Error keys added: `missing_password/invalid_credentials/email_already_exists/weak_password/email_not_confirmed/password_mismatch/same_password` (ko/ja/en).
- **Auth + onboarding backend fixes — 2026-06-18; rollout cleanup 2026-06-23.** Six blocking issues resolved: (1) `birth_date` now validated and saved in both `completeProfile` (onboarding) and `updateAccountProfile` (account); users were stuck in `needs_profile` forever without this. (2) Password reset route state aligned end-to-end: `requestPasswordReset` uses `?view=email&mode=reset` + appends `&email=…` on success; callback target uses `?view=email&mode=new_password`; `updatePassword` uses `?view=email&mode=new_password` for errors and redirects to `?view=email&sent=password_updated` on success. (3) New password form `email-new-password-form.tsx` created; `page.tsx` handles `view=email&mode=new_password`, `view=email&mode=signup&sent=verify`, and `sent=password_updated` success banner. (4) `isDevSeedLoginEnabled()` guards were removed from all three email auth actions, and on 2026-06-23 the remaining dev/test-login UI + `/api/dev/seed-login` route were removed entirely. (5) `setLastUsedOrganization` called after every invite-code join (`completeProfile` + `joinOrganizationWithInviteCode`). (6) Desktop root entry now redirects to `/auth/login` instead of rendering `DevEntry`; the unused `DevEntry` component was deleted on 2026-06-23. `npm run lint` + `npm run build` pass.
- **Onboarding flow wired to backend (minimal-wiring) — 2026-06-18.** The real `/onboarding` page (kept in its current layout per the approved minimal-wiring scope — NOT rebuilt into the mobile design previews) is now functional end-to-end: (1) the `needs_profile` profile form gained the required **생년월일 (`birthDate`, `<input type="date">`)** field — without it `completeProfile` could never satisfy the `birth_date` gate, so onboarding looped forever. (2) **Invite-code verify → preview → confirm** flow added via a shared client component (`src/app/onboarding/invite-code-field.tsx`): the user enters a code, taps 확인 → a new read-only `previewInviteCode` server action (`onboarding/actions.ts`) calls `validateInviteCode` and resolves the **target organization name + user-facing role category** (via `roleToInviteCategory`, never the raw DB slug), and the preview card renders before the join button activates. This satisfies the product rule "validation succeeds first, then show resolved org + role before final activation." The profile step's invite field is optional (verified → `completeProfile` joins in one step; skipped → routes to the membership step); the membership step's join button is disabled until a code is verified. Forms extracted to client components `src/app/onboarding/onboarding-forms.tsx` (`ProfileForm` + `JoinForm`). (3) **Pre-auth locale now survives into onboarding**: the page reads the `stayops_locale` cookie as a fallback (mirroring the login page) so the language chosen in the login language sheet carries through the login → callback → onboarding redirect chain even when no `?lang=` param is present. (4) The **dead design-preview branches** `view=onboarding` and `view=invite` were **removed** from `/auth/login` (mock data + `href="#"`), along with their now-unused icons; real gating happens on `/onboarding`. New i18n keys `onboarding.verifyInviteCta/inviteVerifiedBadge/previewOrgLabel/previewRoleLabel/joinTeamCta/changeInviteCode` (ko/ja/en). `npm run lint` + `npm run build` pass. (The `auth.gating.*` preview dictionary keys are left in place — harmless, no longer referenced.)
- **Auth backend follow-up cleanup — 2026-06-18.** Three review items closed: (1) desktop `/auth/login` now uses a **device-aware default next** (`/mobile` for phones/tablets, `/admin` for desktop) so desktop users no longer silently fall through to mobile after email/Google auth; (2) `birth_date` validation is now **shared and consistent** (`isValidBirthDate`) across onboarding save, account edit, and onboarding-state gating, including rejecting future dates; (3) `profiles_phone_number_unique` collisions now surface the explicit `phone_duplicate` error in both onboarding and account profile updates instead of the generic `profile_failed`. This keeps the documented account-level unique phone policy truthful at runtime.
- **Auth/onboarding final flow cleanup — 2026-06-18.** Three more review items closed: (1) the public `/onboarding` flow no longer exposes the old **first-user `developer_super_admin` claim** card/button; platform-admin bootstrap remains an operational path and is no longer part of normal user onboarding. (2) Real blocked users now go through the completed `/auth/login?view=blocked` screens: auth actions, callback, middleware, and onboarding all agree on `suspended` / `removed` / `disabled`. `removed` users can explicitly enter a **rejoin** flow (`/onboarding?rejoin=1`) and join another organization with a new valid invite code; `suspended` remains hard-blocked. (3) retried signup for an **incomplete existing account** now redirects to login with the email prefilled and a dedicated `resume_existing_account` error so the user continues the same onboarding instead of seeing a generic duplicate-email failure.
- `/onboarding` visual redesign completed on 2026-05-21 so the login -> onboarding entry flow feels continuous: the page now uses the same restrained Liquid Glass background depth, premium card surfaces, edge highlights, input rhythm, and CTA hierarchy while keeping the existing profile completion, invite-code join, routing, session, and validation semantics unchanged. Onboarding now also preserves language continuity from login for users without a saved profile language yet, and the profile preferred-language selector defaults to the effective onboarding locale instead of always Korean.
- Supabase auth callback route exists.
- Profile completion works.
- Super Admin organization creation UI exists at `/admin/settings/organization`.
- Super Admin can optionally attach themselves as organization `owner` during organization setup.
- Invite code management UI exists at `/admin/users/invites` (moved from `/admin/settings/invite-codes`
  2026-07-13; old path redirects).
- Owner or 전무(`senior_managing_director`)-only attendance site/QR settings UI exists at
  `/admin/settings/attendance` (전무 added as owner-equivalent 2026-07-13).
- **Initial real attendance site master loaded for `StayOps Internal` (2026-06-23).** The org-level `attendance_sites` table is no longer test-only: the existing temporary office QR site was promoted to the real office site (keeping its active QR/history), the old dummy attendance site was retired as an inactive legacy record, and the first real field-site rows were loaded for the current operations buildings plus the pre-open `스카이` site. Exact coordinates remain operational data in Supabase, not Markdown.
- Invite codes can be created for `staff` and `part_time_staff`.
- Invite codes can be deactivated.
- Invite-code form labels distinguish the display name from the actual code.
- Organization member directory exists at `/admin/users`.
- Organization member role/status update actions exist at `/admin/users`.
- Organization member search/filter controls exist at `/admin/users`.
- Account profile editing exists at `/account`.
- Users can now update their own name, date of birth, phone number, preferred language, and gender. Legacy users with missing birth date and/or gender are guided there with an in-page completion prompt instead of being forced back into onboarding. (Theme preference was removed on 2026-06-08 — see dark-mode removal below; the app is light-mode-only.)
- **Entry-routing policy implemented (2026-06-18):** the root-level "dashboard vs mobile" choice screen is no longer allowed in the product direction. `DevEntry` has been removed from `/`; routing is now:
  - mobile/tablet → `/mobile` (unchanged)
  - desktop/PC → `/auth/login` (then `/admin` once logged in with an admin-capable role)
  The OAuth callback passthrough (`?code=…` / `?error=…`) is preserved.
- **App/dashboard surface boundary hardened (2026-06-23):** mobile/tablet requests no longer render
  `/admin*` dashboard pages. Middleware redirects mobile `/admin*` to `/mobile`, and auth/OAuth
  callback/password-reset/onboarding completion normalize mobile `next=/admin*` to `/mobile`. This
  covers KakaoTalk/LINE/in-app-browser links and stale dashboard `next` values. Mobile app routes
  with no organization context now redirect to `/mobile/unavailable` instead of `/admin`, preventing
  app/dashboard surface mixing and redirect loops for platform/admin-only sessions.
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
- Important announcements now fan out an in-app bell notification to the targeted active audience when they become `published` (2026-06-24); normal announcements still do not notify by default.
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
- Mobile-first entry/login refined for real phone QA (2026-06-18): the root entry (`/`) now auto-redirects phone/tablet user agents to `/mobile` instead of showing `DevEntry`, and the local dev login page keeps mobile devices pinned to `/mobile` end-to-end.
- Test-login removal completed (2026-06-23): `/api/dev/seed-login`, `src/lib/dev-auth.ts`, and the unused `DevEntry` component were deleted. The login page now relies on real Google/email accounts only, including for QA.
- `.env.example` now exposes `ENABLE_LOCAL_DEV_TOOLS=` for non-auth local maintenance endpoints; it no longer documents a dev seed-login password or account shortcut.

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
- Notifications (Phase 11) — order-processed dispatch implemented (2026-06-03); task reminder/activity, suggestion, attendance, and important-announcement alerts expanded through 2026-06-24; `/mobile/notifications` now renders the live bell feed; `schemaUnavailable` fallback remains in place.
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
3. Invite first staff batch via `/admin/users/invites`.

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
    - `POST /api/dev/beds24/backfill-inventory` is now available for localhost-only reclassification runs behind `ENABLE_LOCAL_DEV_TOOLS=true` and `x-beds24-webhook-secret`
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

**Migration status:** `202606180004` is **applied to the linked Supabase project (2026-06-18)** — `birth_date` + `last_used_organization_id` columns and the `profiles_phone_number_unique` partial index are live, and the migration is recorded in `supabase_migrations.schema_migrations` (version `202606180004`). Before the unique index could build, two dev E2E seed accounts that shared placeholder phone `000-0000-0000` were given distinct placeholders (`000-0000-0001` / `000-0000-0002`). Existing profiles may still have `birth_date = NULL`, but active legacy users are now allowed into the app and guided to complete missing profile fields from `/account` instead of being forced through the new-user onboarding intro.

### Confirmed target policy (still applies)

- Auth methods: `Google` + `email/password`; magic-link removed
- Google profile data is auth-only; StayOps must not auto-fill name/phone from Google
- Same-email Google/email attachment currently relies on Supabase automatic identity linking + confirmed-email settings; the email-signup path separately resumes duplicate/incomplete accounts in app code
- Required onboarding before app access: name, date of birth, gender, phone number, preferred language, team invite code
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

Native-feel direction follow-up: the partial-width 78% drawer still left a visible right-side slice of the current page, which made iOS standalone/PWA top-edge behavior feel less like a native menu even when the scrim bands were removed. `mobile-shell.tsx` now opens the side menu as a **full-width navigation sheet** (`w-full`) with the same slide-in/out transition and close button. The old right-edge panel shadow is removed because there is no longer an exposed edge to separate. This aligns the menu with the desired ChatGPT-like pattern: status bar remains system-owned, while the app content below it reads as one continuous menu screen.

Top-surface blend follow-up: after switching to a full-screen sheet, the menu still felt subtly separated from the iOS status-bar area because the sheet gradient started at `#fbf8f1` while the root/status-bar ivory is `var(--background)` / `#f7f4ee`. `mobile-shell.tsx` now holds the sheet's first 96px at `var(--background)` before fading into the warmer sidebar gradient, so the system status area and menu top read as one continuous surface.

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
- Deferred (need device testing / larger refactor, noted for follow-up): visualViewport keyboard-inset for hand-rolled fixed bars (the rendered comment composer is a flex footer, not fixed, so iOS auto-scrolls it — lower risk than first thought); `.csheet` → canonical `BottomSheet` migration; calendar horizontal-scroll vs left-edge-back gesture conflict; header icon buttons stay the documented 38px.

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

**Deferred (documented, larger/lower-severity):** global toast/snackbar system (the one big missing native feedback primitive — its own task); per-form free-text length clamps + order quantity/items/image server clamps (incl. the 5-image rule for order items); icon-button `aria-label`s + custom-dropdown keyboard semantics + form label associations (need new ko/ja/en keys); order processor-role button gating UX; client delivery-calendar "today" → Tokyo seed; iOS splash screens; long-list virtualization; persistent-shell layout refactor.

Verification: `npm run lint` + `npm run build` pass. Behavior needs on-device confirmation.

## 2026-06-25 — Board comments: @mention backend

Comment-side mention support landed on the existing board comment server action (no new route).
 now takes an optional  and persists them to
the new  /  columns (migration in flight from
database-engineer). Server validates every mention id against  of the
caller's org so a stale/forged id cannot leak a notification cross-org.

New notification events on the existing  enum (no enum migration):
 (individual) and  (org-wide fan-out).  suppresses the
per-user  notifications for the same comment so no recipient gets two pings. When the
post author is also a mention recipient, the  author notification is skipped — again
to avoid double-notifying. Actor is always excluded.

Also added:  server action +  /
 /  helpers in  for
autocomplete + server-side guard. ko/ja/en notification strings added
(, ).

Files: , ,
, ,
.

Verification: 
> stayops@0.1.0 lint
> eslint + 
> stayops@0.1.0 build
> next build

▲ Next.js 16.2.6 (Turbopack)
- Environments: .env

  Creating an optimized production build ...
✓ Compiled successfully in 12.0s
  Running TypeScript ... pass. End-to-end behavior pending the matching DB
migration (mentioned_user_ids/mention_all columns) from database-engineer.

## 2026-06-25 — Board comments: @mention backend

Comment-side mention support landed on the existing board comment server action (no new route).
`addBoardComment` now takes an optional `{ mentionedUserIds, mentionAll }` and persists them to the
new `board_comments.mentioned_user_ids` / `mention_all` columns (migration in flight from
database-engineer). Server validates every mention id against `memberships(status='active')` of the
caller's org so a stale/forged id cannot leak a notification cross-org.

New notification events on the existing `board_activity` enum (no enum migration): `mentioned`
(individual) and `mention_all` (org-wide fan-out). `mention_all` suppresses the per-user `mentioned`
notifications for the same comment so no recipient gets two pings. When the post author is also a
mention recipient, the `commented` author notification is skipped — again to avoid double-notifying.
Actor is always excluded.

Also added: `searchMentions(query)` server action + `searchMentionableMembers` /
`validateMentionTargets` / `getActiveOrgMemberIds` helpers in `src/lib/board-queries.ts` for
autocomplete + server-side guard. ko/ja/en notification strings added (`boardMentionTitle/Body`,
`boardMentionAllTitle/Body`).

Files: `src/app/mobile/board/[id]/actions.ts`, `src/lib/board-queries.ts`,
`src/lib/notifications/{types,create,display}.ts`, `src/lib/i18n.ts`,
`docs/product/23-board-workflow.md`.

Verification: `npm run lint` + `npm run build` pass. End-to-end behavior pending the matching DB
migration (`mentioned_user_ids` / `mention_all` columns) from database-engineer.

### 2026-06-26 — 교통비 정산 백엔드 (query layer + server actions)

급여(payroll)와 완전 분리된 증빙 기반 교통비 정산 모듈의 서버 사이드 구현. 마이그레이션
(`202606260001_transport_reimbursement.sql`, 3개 테이블 + 5단계 storage 경로 정책)은 이미 작성됨.

Query layer `src/lib/transport-reimbursement.ts` (server-only, caller-agnostic):
`getOrCreateTransportReport`, `getTransportReport`, `getTransportItems` (items+images),
`getLinkedTransportCandidates` (선택 월의 attendance_sessions + cleaning_sessions에서 후보 생성 —
DB 미저장, 쿼리 계산), `syncReportTotalAmount`, `getTransportReportSummaryForAdmin`,
`getTransportReportUserDetailForAdmin`. 모든 함수 organization-scoped. cleaning_sessions는
property_id가 없어 room_label → rooms → properties 매칭으로 건물명 해석.

Server actions `src/app/mobile/attendance/transport/actions.ts` (self-only, service-role write):
`createTransportItemAction` (report 자동 생성, draft/rejected에서만 편집 가능),
`updateTransportItemAction`, `deleteTransportItemAction` (storage 파일 선삭제 후 cascade),
`addTransportItemImageAction` / `deleteTransportItemImageAction` (5단계 경로 검증),
`submitTransportReportAction` (항목 0개 → `no_items`, 증빙 누락 → `missing_evidence`로 제출 차단).
오류는 코드만 반환(i18n 미포함), UI 문자열 없음. 교통비 total은 wage/payroll과 절대 섞지 않음.

타입 주의: `transport_reimbursement_*` 테이블이 아직 `src/types/database.ts`에 생성되지 않아
service-client 접근을 로컬 `untyped()` 캐스트로 우회 중. database.ts 재생성 시 제거 예정
(database-engineer).

Files: `src/lib/transport-reimbursement.ts`,
`src/app/mobile/attendance/transport/actions.ts`,
`docs/engineering/11-attendance-payroll-technical-design.md` (As-built 섹션).

Verification: `npm run lint` + `npm run build` pass.

### 2026-06-26 — 모바일 공지 댓글 UI 제거 (레거시 정리)

모바일 공지 상세(`src/app/mobile/announcements/[id]/page.tsx`)에서 댓글 섹션을 제거.
`AnnouncementCommentsSection` 렌더링, `getAnnouncementComments` 호출, 댓글 관련
`searchParams`(error/commentSaved/commentUpdated/commentDeleted) 처리, 관련 import를 삭제.
읽음 추적(`ensureAnnouncementRead`)은 그대로 유지 — 서버 로직은 살아 있고 모바일 UI 블록만 제거.

보존 대상(어드민 공용이라 미변경): `src/lib/announcements.ts`의
`getAnnouncementComments`/`ensureAnnouncementRead`, 댓글 server actions
(`createAnnouncementComment`/`updateAnnouncementComment`/`deleteAnnouncementComment` —
`src/app/announcements/actions.ts`), `AnnouncementCommentsSection` 컴포넌트,
어드민 상세(`src/app/admin/announcements/[id]/page.tsx`)는 계속 댓글을 렌더. DB 스키마
(`announcement_comments` 테이블, `allow_comments` 컬럼)는 미변경.

Files: `src/app/mobile/announcements/[id]/page.tsx`,
`docs/product/11-announcement-workflow.md`.

Verification: `npm run lint` + `npm run build` pass.

### 2026-06-29 — 컴플레인(customer_complaints) 백엔드 구현

OTA 고객 컴플레인 기록 기능의 서버 사이드를 구현. 도메인 헬퍼 `src/lib/complaints.ts`
(server-only) 와 모바일 server action 래퍼 `src/app/mobile/complaints/actions.ts` 추가.
프론트엔드(목록/상세/작성 화면)는 아직 design-only 목 데이터 — 이번 작업은 백엔드 한정.

핵심:
- 읽기(`listComplaints`/`getComplaint`/`listComplaintComments`)는 RLS-scoped 서버 클라이언트 +
  `organization_id` 직접 필터. 쓰기는 service-role 클라이언트 + 코드 레벨 권한 게이트.
- 권한: 작성 = developer_super_admin·owner·office_admin·cs_staff / 댓글 = part_time_staff 제외
  전원 / 상태변경·삭제 = 작성자 본인 또는 owner·office_admin·developer_super_admin.
- 컴플레인 본체 hard-delete, 댓글 soft-delete(`deleted_at`).
- 이미지: `request-images` 버킷 공유, 경로는 세션 org id 기반 서버 구성
  (`{org}/complaint-images/{id}/...`, 댓글은 `{org}/complaint-comment-images/{id}/{commentId}/...`),
  MIME image/* + 8MB + 최대 5장.
- `customer_complaints`/`complaint_comments` 가 아직 생성 DB 타입에 없어 untyped 클라이언트 뷰로
  접근 (타입 재생성 시 정리 예정).

Files: `src/lib/complaints.ts`, `src/app/mobile/complaints/actions.ts`,
`docs/product/25-complaint-workflow.md`.

Verification: `npm run lint` + `npm run build` pass.

## 2026-07-10 급여 내보내기 상태 정리 + 마감 차단 딥링크 + 패널 교통비 표시

- **급여 PDF/Excel 내보내기 = 최종(완료).** 옛 문서/주석의 "CSV 임시 · 최종 엑셀 템플릿 대기" 표현이
  스테일이라 정정했다: 실제 최종 형식은 월별·직원별 **Excel 워크북 + PDF**(2026-07-03 구현)이며, 6/18의
  CSV(`attendance-export.ts` / `runPayrollExport`)는 레거시/백호환 기반으로만 남는다.
  - 정정 위치: `docs/engineering/11-attendance-payroll-technical-design.md`(Step 13 Superseded 배너 +
    "Still pending"·Export Rules 2곳), `src/lib/attendance-export.ts` 헤더 주석.
- **마감 차단 사유 → 검토 큐 딥링크 + 패널 자동 오픈 (신규).** 급여 사이드 패널의 마감 차단 카드(검토
  필요 세션 / 정정 요청 대기 / 진행 중 세션)를 클릭하면 해당 직원·유형으로 사전 필터된 검토 큐로 이동하며,
  **도착 즉시 그 직원의 사이드 패널(첫 해당 세션/정정 상세)이 자동으로 열린다.**
  - 검토 필요·진행 중 → `filter=review`, 정정 요청 → `filter=corr`, 공통으로 `?ym=<선택월>&q=<직원명>`.
  - `/admin/attendance/queue`가 `filter`(`review|pending|corr|all`, 기본 `review`) + `q`(이름 검색, ≤60자)
    searchParams를 읽어 `AttendanceQueueClient`의 초기 `filter`/`nameQuery`로 시드하고, `panel` useState
    초기화 함수에서 이름·필터에 맞는 첫 세션/정정 항목을 찾아 패널을 연다(명시적 `sessionId` 딥링크 우선).
  - 흐름: 차단 3건(검토 2 + 정정 1 등) 해소 → `finalizationEligible=true`(마감 버튼 활성) → 마감 실행 →
    직원별 PDF/Excel 내보내기 활성. i18n `payPanelBlockerGo`(ko/ja/en) 추가.

- **급여 검토 사이드 패널에 교통비 2줄 추가 (신규).** 직원별 사이드 패널 "월별 요약"의 예상 세전 총액
  아래에 **교통비**(승인분) + **총 지급액(교통비 포함 = 예상 세전 + 교통비)** 2줄을 추가해, 화면 요약과
  내보내기 PDF/Excel의 총액을 일치시킨다.
  - `AdminPayrollRow`에 `transportApproved`(¥) 필드 추가. `getAdminAttendancePayroll`가 내보내기와
    동일 소스(`transport_reimbursement_reports`, `status='approved'`, `target_month='YYYY-MM-01'`,
    `total_amount_cached`)로 조인 → 패널 숫자가 파일 총액과 드리프트하지 않음.
  - 라벨은 기존 `payExportTransport`("교통비") + `payExportTotalWithTransport`("총 지급액(교통비 포함)")
    재사용(ko/ja/en). 총 지급액 줄은 `.kv--total`(상단 구분선 + primary 강조). 정규직은 예상 세전과
    동일하게 총 지급액을 "—"로 표기(임금이 이 패널에서 산출되지 않음), 교통비 금액은 표시.

Files: `src/app/admin/attendance/queue/page.tsx`,
`src/components/admin/attendance/attendance-queue-client.tsx`,
`src/components/admin/attendance/attendance-payroll-client.tsx`,
`src/components/admin/admin-console.css`, `src/lib/i18n.ts`, `src/lib/attendance-export.ts`,
`src/lib/admin-attendance.ts`, `docs/engineering/11-attendance-payroll-technical-design.md`.

Verification: `npm run lint`(0 errors) + `npm run build` pass. 브라우저 프리뷰 검증은 인증된 어드민
세션 + 특정 차단 데이터(6월 임시)가 필요해 샌드박스에서 재현 불가 — 로직은 코드 리딩으로 확인.

## 2026-07-10 근태 추가수당(attendance allowance) 구현

바쁜 날/인력 부족일에 **기본 시급을 바꾸지 않고** 특정 근무일에만 추가 지급하는 "추가수당" 레이어.
보너스/인센티브가 아니라 운영상 추가수당. (마이그레이션 `202607100001`, 프로덕션 적용)

- **테이블 `attendance_pay_allowances`** — `target_date`, `target_user_id`(null=전체 시급직), `allowance_type`
  (`daily_fixed`|`hourly_extra`), `amount_yen`, `reason_type`(5종), `memo`, `status`(`active`|`cancelled`),
  생성/취소 감사 컬럼. RLS 읽기전용(본인 대상 행 또는 급여 관리자). `attendance_month_snapshots`에
  `allowance_breakdown jsonb` 추가 — 마감 시 적용 내역(id/date/type/amount/paidMinutes/calc/reason/memo) 보존.
- **계산(`attendance-pay.ts`)** — 월 활성 추가수당 로드 → **인정 근무가 있는 시급직 날짜에만** 적용.
  `daily_fixed`=하루 1회 고정, `hourly_extra`=인정분×추가시급. `expectedGross`가 이제 **기본급+추가수당**
  (월 최종 10엔 올림 1회), `baseGross`=`expectedGross−allowanceTotal`로 분리 노출. 순수 헬퍼
  `allowanceCalculatedExact`.
- **서버 액션** — `createAttendanceAllowance`/`cancelAttendanceAllowance`(service-role, `isAttendancePayrollAdmin`
  게이트). **확정된 user-month는 생성/취소 차단**(대상 지정=해당 유저, 전체=그 달 확정 스냅샷 있으면 차단) →
  변경하려면 마감 해제 후 재확정. 마감 시 `allowance_breakdown` 저장.
- **UI** — `/admin/attendance/wages`에 **추가수당 섹션**(`AttendanceAllowancesSection`, 유형/대상/날짜/금액/사유/메모,
  목록+취소). 별도 탭 없음. 급여 검토 패널에 기본급·추가수당 분리 표시. `/mobile/attendance/pay`에 본인 적용
  추가수당 섹션 + 기본급 소계.
- **Export** — 월별/직원별 Excel·PDF에 **기본급 / 추가수당 / 교통비**를 각각 별도 컬럼으로(총액=합). 교통비는 계속
  별도 총액. 직원별 일별 기본급은 base total로 정산.
- i18n: `payPanelKvBase`·`payPanelKvAllowance`·`payExportBaseWage`·`payExportAllowance`·`allow*`(어드민),
  `payAllowance*`·`payBaseSubtotal`(모바일) ko/ja/en 추가.

Files: `supabase/migrations/202607100001_attendance_pay_allowances.sql`, `src/types/database.ts`,
`src/lib/attendance-pay.ts`, `src/lib/attendance-pay-calculation.ts`, `src/lib/admin-attendance.ts`,
`src/app/admin/attendance/actions.ts`, `src/app/admin/attendance/wages/page.tsx`,
`src/components/admin/attendance/attendance-allowances-section.tsx`(신규),
`src/components/admin/attendance/attendance-payroll-client.tsx`, `src/components/attendance/attendance-pay.tsx`,
`src/lib/attendance-payroll-workbook.ts`, `src/lib/attendance-payroll-report.ts`,
`src/lib/attendance-user-payroll-export.ts`, `src/components/admin/admin-console.css`, `src/lib/i18n.ts`,
docs(11/04/05/21/01/06).

Verification: 추가수당 관련 파일 **`npx tsc --noEmit` 타입 에러 0** + `npm run lint` **에러 0**(경고만).
전체 `npm run build`는 **무관한 미추적 예약 캘린더 WIP**(`src/lib/property-operation-info.ts`,
`src/app/admin/calendar/page.tsx` — 병렬 작업, database.ts 타입/컴포넌트 prop 미정합)로 인해 통과하지 못함 —
추가수당 코드와 무관. 브라우저 프리뷰 검증은 인증된 어드민 세션 + 실제 데이터 필요로 샌드박스 재현 불가.
## 2026-07-10 Reservation Calendar Status

- Admin reservation calendar building info now has a real shared save path backed by Supabase.
- Mobile calendar map/access view now reads the same building-operation metadata as admin.
- Reservation bar internal notes are shared organization-wide and show a visual indicator on bars.
- Reservation calendar export now uses the A4 landscape print page, not reservation CSV.
- Beds24 webhook/reconcile ingestion is intentionally paused until the external integration is
  restored.

## 2026-07-10 추가수당 → 추가수당/특별수당 2구분 + 엑셀 특별수당 컬럼

- **구분(category) 도입** — `reason_type`(5종 사유) → **`category`**(`regular`=추가수당 / `special`=특별수당)로
  교체(마이그레이션 `202607100003`, 적용). 폼 필드 라벨 **"사유" → "구분"**, 옵션 2개.
- **계산 분리** — `attendance-pay.ts`가 적용 수당을 **추가수당/특별수당 버킷으로 분리 집계**
  (`allowanceRegularTotal`/`allowanceSpecialTotal` + 일별 `allowanceRegularExact`/`allowanceSpecialExact`).
  `allowanceTotal`=둘 합, `baseGross`=`expectedGross−allowanceTotal`. `hourly_extra`는 기본급은 그대로,
  추가 시급×인정시간 **차액만** 해당 구분 칸으로(요구사항대로).
- **엑셀/PDF 특별수당 컬럼 추가** — 월별·직원별 모두 `기본급 | 추가수당 | 특별수당 | 교통비 | 총액`. 폼에서
  구분에 맞춰 자동으로 해당 칸에 반영. `AdminPayrollRow`에 regular/special 분리 노출.
- **표시** — 급여 검토 패널: 추가수당·특별수당 각각 줄. `/mobile/attendance/pay`: 각 적용 수당에 구분(추가/특별)
  라벨. 임금관리 목록 행: 구분 pill(추가=info, 특별=warn) + 유형 pill.
- **취소** — 아래 목록 각 행 "취소" 버튼 + `cancelAttendanceAllowance`(기존 구현, 확인). 등록 건이 생기면 노출.
- **UI 개선(같은 날)** — 추가수당 폼을 전체 폭 4열 그리드로(오른쪽 여백 제거), 그라데이션 제거 → 크림(`--bg2`)
  단색, 사유/직원 셀렉트를 커스텀 `AdminSelectField`(공유 컴포넌트)로 교체.
- i18n `allowFieldCategory`·`allowCatRegular`·`allowCatSpecial`·`payPanelKvSpecial`·`payExportSpecialAllowance`
  (어드민), `payAllowanceRegular`·`payAllowanceSpecial`(모바일) ko/ja/en 추가.

Files: `supabase/migrations/202607100003_attendance_allowance_category.sql`, `src/types/database.ts`,
`src/lib/attendance-pay.ts`, `src/lib/admin-attendance.ts`, `src/app/admin/attendance/actions.ts`,
`src/components/admin/attendance/attendance-allowances-section.tsx`,
`src/components/admin/attendance/attendance-payroll-client.tsx`, `src/components/attendance/attendance-pay.tsx`,
`src/lib/attendance-payroll-workbook.ts`, `src/lib/attendance-payroll-report.ts`,
`src/lib/attendance-user-payroll-export.ts`, `src/components/admin/shared/admin-select-field.tsx`(신규),
`src/components/admin/admin-console.css`, `src/lib/i18n.ts`, docs(04/11/06).

Verification: 전체 `npm run build` **통과**(예약 캘린더 타입 누락도 병렬 세션이 해결, 빌드 그린), `npx tsc --noEmit`
**0 에러**, `npm run lint` **에러 0**. 신규 i18n 키 3로케일 완비 확인. 브라우저 프리뷰는 어드민 인증 필요로 미실행.

## 2026-07-10 수기 근무 입력 + 근무 위치 export + 수당 규칙 완화

현장 변수(외부 근무·출퇴근 누락) 대응. 근무가 (수기로라도) 들어가면 급여·수당이 따라붙는 구조를 완성.

- **수기 근무 입력 UI** — `/admin/attendance/queue`(검토 큐) 툴바 **"근무 추가"** → 모달(`ManualSessionModal`,
  신규): 직원·날짜·출근·퇴근(선택)·**근무 위치(자유 텍스트)**·사유. `createManualAttendanceSession` 확장 —
  **근무지(site) 대신 위치 텍스트 허용**(site 없이 저장, 위치 또는 site 중 하나 필수). ko/ja/en, 공통 모달/토스트.
- **스키마** — `attendance_sessions.manual_location text`(마이그레이션 `202607100004`, 적용).
- **근무 위치 export** — 직원별 PDF/Excel에 **"근무 위치" 열**(수기 위치 우선, 없으면 등록 근무지명).
  `UserPayrollExportRow.location` + `buildUserPayrollExportData` 세션+사이트명 조인.
- **추가수당 규칙 완화** — `daily_fixed`는 **그 날짜 출퇴근 세션이 없어도** hourly 대상이면 그 달 급여에 가산.
  `getMonthlyPayView`에 "수당 전용 일자" 루프 추가(`hourly_extra`는 인정 분 없어 미적용). 근무 없는 날 수당도 반영.
- 경량 헬퍼 `listActiveAttendanceStaff`. i18n `manual*`·`userExportColLocation` ko/ja/en.

Files: `supabase/migrations/202607100004_attendance_manual_location.sql`, `src/types/database.ts`,
`src/app/admin/attendance/actions.ts`, `src/lib/attendance-pay.ts`, `src/lib/admin-attendance.ts`,
`src/lib/attendance-user-payroll-export.ts`, `src/app/admin/attendance/queue/page.tsx`,
`src/components/admin/attendance/attendance-queue-client.tsx`,
`src/components/admin/attendance/manual-session-modal.tsx`(신규), `src/components/admin/admin-console.css`,
`src/lib/i18n.ts`, docs(04/11/24/06).

Verification: `npx tsc --noEmit` **0 에러**. build/lint는 마지막에 실행. 브라우저 프리뷰는 어드민 인증 필요로 미실행.

## 2026-07-13 연차 승인자 관리 탭 제거 + 권한 부여를 사용자 화면으로 통일 (방향 확정)

- **방향 확정:** 모든 **역할·권한 부여를 사용자 화면(`/admin/users`)으로 통일**한다. 급여 담당
  (`attendance_payroll_admin`) · 연차 결재자(`leave_approver_role`) · 시간제한 권한 예외
  (`membership_permission_overrides`) 모두 사용자 상세에서 관리. 부여 가시성은 **대표(owner)·개발자**
  전용(권한 예외 카드 기준).
- **Step 1 (이번 커밋) — 연차 '승인자 관리' 서브탭 제거.** 기능이 사용자 화면으로 이관되므로 연차 콘솔의
  승인자 관리 탭을 삭제. 연차 서브탭은 **5개**(승인 심사 / 팀 캘린더 / 직원 잔여·부여 / 문서 / 이력)로 축소.
  - 제거: `leave-approvers-view.tsx`(파일 삭제), `leave-queue-client.tsx`의 `approvers` 뷰/탭/프롭/`Shield`
    아이콘, `leave/page.tsx`의 `listAdminApprovers` fetch·프롭, `leave/actions.ts`의 `setLeaveApproverAction`.
  - **유지(의도적):** `annual-leave-admin-server.ts`의 `AdminApproverMember`/`listAdminApprovers`/
    `setLeaveApprover` — 곧 사용자 화면 권한 백엔드에서 재사용(주석 명시). `i18n.subTabApprovers` 등 승인자
    전용 문자열은 무해한 dead 항목으로 남겨둠(추후 정리).
  - **주의:** 사용자 백엔드 연결 전까지 `leave_approver_role`는 DB 직접 변경 외 경로 없음(개발 단계 허용).
- **Step 2 (다음, 디자인만) — 사용자 화면 재구현.** `design_handoff_permission_override` 핸드오프대로
  `/admin/users` 명단 + `/admin/users/[id]` 상세 + **권한 예외 카드**를 **100% 디자인만** 구현(서버 미연결).
  핸드오프에 없는 급여 담당·연차 결재자도 같은 디자인 언어로 유동 배치. 백엔드는 **디자인 컨펌 후**.
- **문서 정정(코드 대조):** 기존 status의 "연차 문서출력 미구현/모바일 잔여 미연동" 서술은 **오류**였음 —
  둘 다 이미 구현됨(위 '연차 sub-tabs' 정정 참조). 실제 잔여 연차 갭은 **신청자 알림**과
  **`employment_type` 기준 시급직 제외**뿐.
- 마이그레이션 없음. 빌드/푸시 미실행(사용자 지시), lint만.

Files: `src/components/admin/attendance/leave-queue-client.tsx`,
`src/app/admin/attendance/leave/page.tsx`, `src/app/admin/attendance/leave/actions.ts`,
`src/lib/annual-leave-admin-server.ts`(주석), `src/components/admin/attendance/leave-approvers-view.tsx`(삭제),
docs(26/05/06/01).

## 2026-07-13 사용자 화면 재디자인 (Step 2 — 디자인만, 백엔드 보류)

- **범위:** `design_handoff_permission_override` 핸드오프대로 `/admin/users` 명단 + `/admin/users/[id]`
  상세 + **권한 예외 카드**를 재구현. **디자인/인터랙션만** — 저장/부여/회수는 로컬 상태 + 토스트
  프로토타입이며 **실제 DB 미반영**(백엔드는 디자인 컨펌 후). 역할·상태 서버 액션(`users/actions.ts`)은
  보존(미사용) → 나중에 배선.
- **CSS:** `src/components/admin/users-console.css`(flow.css+perm4.css를 `.adm` 스코프로 이식,
  `--primary-tint` 추가). 기존 클래스 충돌 없음.
- **컴포넌트(신규):** `adm-dropdown.tsx`(커스텀 `.dd` 드롭다운), `users-directory-client.tsx`(명단),
  `user-detail-client.tsx`(상세 — 프로필/역할·상태/근태 권한/권한 예외 hero/부여폼/회수확인/토스트).
  급여 담당·연차 결재자는 핸드오프에 없어 상세의 **별도 '근태 권한' 카드**(owner/개발자 전용)로 배치.
- **권한 예외 카드 가시성:** owner/`developer_super_admin`만 렌더(office_admin은 미렌더). 프로토타입의
  "보는 사람" 데모 토글은 제외(세션 역할로 판정).
- **i18n:** `admin.users.console` 네임스페이스 ko/ja/en 3종 추가(권한 키 화이트리스트 라벨/설명 포함).
- **프리뷰:** ~~`src/app/users-preview/page.tsx`(임시 미인증, mock 데이터)~~ — 디자인 확인용 임시 라우트.
  **삭제 완료.** 같은 성격의 `leave-preview`도 2026-07-15에 함께 삭제됐다(둘 다 코드 참조 0건, 데이터 미조회).
- 검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors, 프리뷰 렌더 확인(콘솔 에러 없음). 빌드/푸시 미실행.
- **미완(컨펌 후):** 서버 배선(역할/상태/리포트 실제 저장, 급여담당/연차결재자/권한예외 CRUD +
  `membership_permission_overrides` 연동·RLS), `27-permission-override-workflow.md`·`05-admin-web-ia.md`
  본문 갱신, 프리뷰 라우트 삭제.

Files(신규): `src/components/admin/users-console.css`,
`src/components/admin/users/adm-dropdown.tsx`, `src/components/admin/users/users-directory-client.tsx`,
`src/components/admin/users/user-detail-client.tsx`, `src/app/users-preview/page.tsx`.
Files(변경): `src/app/admin/users/page.tsx`, `src/app/admin/users/[id]/page.tsx`, `src/lib/i18n.ts`.

## 2026-07-13 사용자 권한 백엔드 연결 (Phase 1 — 실제 저장/CRUD)

디자인 컨펌 후, 재디자인 사용자 화면을 **실제 DB에 연결**. 프로토타입(로컬 상태)이던 저장/부여/회수가
이제 서버 액션 → Supabase로 반영된다. **마이그레이션 없음**(모든 컬럼/테이블 기존재).

- **결과-반환형 서버 액션** (`src/app/admin/users/actions.ts` 전면 정비, FormData·redirect → `{ok,error}`):
  `setMemberRole`/`setMemberStatus`(owner·office_admin·dev, 본인 차단, office_admin은 상위 역할 부여 불가),
  `setMemberReportAccess`(`profiles.can_generate_report`), `setMemberPayrollAdmin`
  (`memberships.attendance_payroll_admin`, **owner·dev만**), `setMemberLeaveApprover`
  (`memberships.leave_approver_role`, **owner·dev만**, min-1·self-lock·시급직 제외 가드),
  `grantPermissionOverrideAction`/`revokePermissionOverrideAction`(**owner·dev만**, service-role).
- **권한키 화이트리스트** `src/config/permission-overrides.ts`(4키) + 서버 검증(키·만료 미래·사유 필수·self-grant 차단).
- **override 데이터 레이어** `src/lib/permission-overrides-server.ts`(list/grant/revoke, service-role).
  `membership_permission_overrides`는 쓰기 RLS 없음 → service-role로만 기록(설계대로). revoke=소프트(`revoked_at`).
- **`setLeaveApprover` 리팩터** — 세션 기반 → `{organizationId, actorUserId, userId, isApprover}` 명시형
  (dev 크로스-org 정확성). ⚠️ "연차 결재=전무 고정" 확정건: 현재 부여 default가 `department_head`라
  전무 지정 경로는 추후 조정 필요(기능상 승인권은 동일, 문서 도장칸만 차이).
- **클라이언트 배선:** 명단/상세가 `useTransition`으로 액션 호출, 성공/실패 토스트(에러 i18n
  `admin.users.console.err*` ko/ja/en 추가). 상세는 `listMemberOverrides` 실데이터 로드.
- 검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors. 빌드/푸시 미실행.

**미완 (Phase 2 — 권한 예외 실효성, 별도):** `has_permission_override()`가 아직 어느 기능의 RLS/게이트에도
연결 안 됨 → 부여해도 실제 권한은 안 변함. 4키를 각 도메인(주문/수리/건물·객실/리포트)에
`OR has_permission_override(...)`로 채택하는 **새 마이그레이션** 필요(사용자가 적용). 도메인별 인증 모델
조사 후 단계 적용 예정. 문서: `27-permission-override-workflow.md`.

Files: `src/app/admin/users/actions.ts`, `src/config/permission-overrides.ts`(신규),
`src/lib/permission-overrides-server.ts`(신규), `src/lib/annual-leave-admin-server.ts`,
`src/components/admin/users/users-directory-client.tsx`,
`src/components/admin/users/user-detail-client.tsx`, `src/app/admin/users/[id]/page.tsx`,
`src/lib/i18n.ts`, docs(27/06).

## 2026-07-13 사용자/권한 모델 개편 — P1 (접근 통제) 백엔드

결정 로그(2026-07-13 "사용자/권한 모델 개편") 기준. **P1 = 사용자 화면 접근을 개발자 기본으로 잠금 + 위임.**

- **마이그레이션(작성, 적용 대기):** `202607130001_membership_manage_users.sql` — `memberships.manage_users boolean default false`.
- **게이트:** `src/lib/user-management-access.ts`(신규) — `isDeveloper`, `actorCanOpenUserManagement`
  (개발자 또는 `manage_users` 보유), `actorCanManageUsersInOrg`(org 범위). `/admin/users`·`/admin/users/[id]`
  진입 시 미통과 → `/admin` 리다이렉트. **owner·office_admin의 자동 사용자관리 접근 제거** — 이제 개발자
  또는 위임받은 사람만.
- **액션 게이트 교체:** 역할/상태/리포트 저장의 기본 게이트를 `actorCanManageUsersInOrg`로 변경(기존
  owner/office_admin/dev → 개발자‖manage_users). 급여담당/연차결재자/권한예외는 여전히 owner‖dev(P2에서 +전무).
- **개발자 전용 액션(신규):** `setMemberManageUsers`(manage_users 위임, **재위임 불가=개발자만**),
  `assignDeveloper`(`platform_admins` 기록, 최고권한, **본인 개발자 해제 차단**=lockout 방지).
- 참고: 마이그레이션 적용 전에도 개발자는 게이트 단축평가로 정상 접근(비개발자는 차단). 김현준=개발자
  (`platform_admins`)이라 영향 없음.
- 검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors.

**P1 UI 완료(2026-07-13):** 사용자 상세에 **개발자 전용 카드 "개발자 · 사용자 관리"**(isDeveloperViewer
게이트) — `개발자 지정`(assignDeveloper)·`사용자 관리 권한`(setMemberManageUsers) 토글 + 안내문.
목록/상세에서 **플랫폼 개발자를 "개발자"로 표시**(org role은 작업 드롭다운에서 별도 편집 유지 — 개발자는
플랫폼 평면). i18n `console.dev*`/`manageUsersLabel` ko/ja/en. 마이그레이션 `202607130001` **적용됨**.
프리뷰 렌더 확인(콘솔 에러 없음), tsc 0 / lint 0.

**다음 단계:** P2 전무 역할(enum+RLS 스윕+연차결재 기본값=전무), P3 상태 축소+완전차단, P4 가드형 삭제.

Files(추가): `src/lib/i18n.ts`, `src/app/admin/users/page.tsx`, `src/app/admin/users/[id]/page.tsx`,
`src/components/admin/users/users-directory-client.tsx`,
`src/components/admin/users/user-detail-client.tsx`, `src/app/users-preview/page.tsx`.
Files(P1 백엔드): `supabase/migrations/202607130001_membership_manage_users.sql`,
`src/lib/user-management-access.ts`, `src/app/admin/users/actions.ts`, `src/types/database.ts`, docs(01/06).

## 2026-07-13 사용자/권한 모델 개편 — P2 (전무 역할, owner 동급)

`senior_managing_director`(전무)를 조직 역할로 추가하고 **owner와 완전 동급**으로 처리.

- **마이그레이션 2개(적용 필요, 순서 중요):** `202607130002_add_senior_managing_director_role.sql`
  (enum 값 추가) → `202607130003_senior_managing_director_owner_equivalent.sql`(`has_org_role` 재정의).
  **핵심 기법:** owner를 검사하는 모든 RLS가 `has_org_role(org, array['owner',...])`를 통과하므로,
  `has_org_role` **함수 하나만** "전무면 owner 허용 통과"로 고쳐 **정책을 하나도 안 건드리고 전역 적용**.
- **연차 결재 기본값 = 전무:** `DEFAULT_APPROVER_ROLE`를 `department_head` → `senior_managing_director`
  (`is_leave_approver()`는 non-null만 보므로 승인권은 동일, 休暇届 도장칸만 전무로).
- **config/roles.ts:** `organizationRoles`에 전무 추가(드롭다운 자동 노출) + `isOrgTopAdmin(role)=owner|전무`
  헬퍼 + `adminWebRoles`/`fieldOperationRoles`/`cleaningRecordViewerRoles`에 전무 포함.
- **앱 코드 owner-게이트 스윕:** `users/actions.ts`(canManagePermissions/canAssignRole),
  `users/[id]/page.tsx`(카드 가시성), `attendance-review.ts`(isAttendancePayrollAdmin) → 전무 포함.
  나머지(settings/announcements/complaints/invite-codes)는 동일 원칙으로 스윕(프로젝트-멤버 owner는 제외).
- **i18n:** `roles.senior_managing_director` + `announcement targetRoles` ko(전무)/ja(専務)/en(Managing Director).
- `database.ts` enum에 전무 추가. tsc 0 / lint 0.
- ⚠️ **마이그레이션 적용 전 전무 배정 금지**(enum 값 없으면 저장 실패). leave_approver_role는 text라 무관.

Files: `supabase/migrations/202607130002_*.sql`·`202607130003_*.sql`(신규), `src/config/roles.ts`,
`src/types/database.ts`, `src/lib/annual-leave-admin-server.ts`, `src/lib/attendance-review.ts`,
`src/app/admin/users/actions.ts`, `src/app/admin/users/[id]/page.tsx`, `src/lib/i18n.ts`,
`src/lib/announcement-i18n.ts` + settings/announcements/complaints(에이전트 스윕), docs(06).

## 2026-07-13 사용자/권한 모델 개편 — P3 (상태 활성/비활성 + 완전 차단)

- **설계 판단(마이그레이션 없음):** Postgres는 enum 값을 삭제할 수 없고 `invited/suspended/removed`는
  초대·온보딩·디렉토리 흐름에서 실사용 중이라, enum을 **파괴적으로 줄이지 않았다.** 대신 **사용자 화면을
  활성/비활성 2개로** 두고, `비활성`은 기존 **`suspended`**(이미 온보딩에서 차단)로 매핑. 안전 + 무마이그레이션.
- **완전 차단(신규):** `setMemberStatus`가 상태 저장 시 **Supabase auth 밴까지** 적용 —
  `service.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" })`. 활성→언밴,
  비활성→밴. 이제 조직 접근 차단(기존 세션 로직)뿐 아니라 **로그인 자체가 차단**됨. 본인 상태 변경은
  기존대로 차단되어 self-lockout 없음.
- **UI:** 상태 SET 드롭다운 = 활성/비활성(비활성 저장 시 `suspended`), 필터 = 활성/비활성(비활성 = non-active
  전체), 표시/상태 pill은 active→활성(green) / 그 외→비활성(muted)로 축약. i18n `console.statusActive/
  statusInactive` ko(활성/비활성)·ja(有効/無効)·en. tsc 0 / lint 0, 프리뷰 확인.
- 참고: 이 변경 전부터 있던 suspended/invited 계정은 auth 밴이 안 걸려 있음 — 필요시 1회 백필(선택).
- **다음:** P4 가드형 하드 삭제(활동 기록 있으면 차단, 허용 시 auth 계정까지 삭제, 2단계 확인).

Files: `src/app/admin/users/actions.ts`, `src/components/admin/users/users-directory-client.tsx`,
`src/components/admin/users/user-detail-client.tsx`, `src/lib/i18n.ts`, docs(06). 마이그레이션 없음.

## 2026-07-13 사용자/권한 모델 개편 — P4 (가드형 하드 삭제) + 본인 행 정리

- **가드형 삭제(`deleteMember`):** 기본은 비활성, 하드 삭제는 **실수/미활동 계정 정리용**. **활동 기록
  가드(넓게, 옵션 A):** `attendance_sessions.user_id` / `cleaning_sessions.staff_user_id` /
  `annual_leave_requests.user_id` 중 하나라도 있으면 **삭제 차단**(`has_activity`) → 비활성 유도(기록 보호).
  기록 없으면 memberships→profiles→**auth 계정까지** 삭제(전체 제거). 개발자‖manage_users 게이트, **본인
  삭제 차단**. 마이그레이션 없음(기존 테이블·auth API).
- **UI:** 사용자 상세 하단 **위험 존**(destructive) — "회원 삭제" + 안내 + **2단계 확인**(취소/삭제).
  본인(self) 상세엔 미표시. i18n `console.delete*`/`toastDeleted`/`errHasActivity` ko/ja/en.
- **본인 UI 정리(목록+상세):** 목록에서 **내(self) 행의 작업(역할/상태) 컨트롤을 "—"로 대체**하고,
  **본인 상세에선 편집 카드 전부 숨김**(역할·상태·개발자관리·근태권한·권한예외·삭제 → 프로필 정보만 표시).
  최고권한이 자기 자신을 설정할 필요가 없고, 자기 변경은 어차피 서버에서 차단(self_update_blocked)됨.
- 검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors, 프리뷰 렌더 확인(삭제 존·본인행 "—").
  (프리뷰 콘솔에 편집 중간 HMR stale 에러가 남을 수 있으나 옛 라인번호 참조로, 현재 컴파일과 무관.)

**→ P1~P4 전부 코드 완료.** 적용 대기 마이그레이션: `202607130002`·`003`(전무, ①→② 순서). P3/P4는 마이그 없음.

Files: `src/app/admin/users/actions.ts`, `src/components/admin/users/user-detail-client.tsx`,
`src/components/admin/users/users-directory-client.tsx`, `src/lib/i18n.ts`, docs(06). 마이그레이션 없음.

## 2026-07-13 권한 예외 실효성 연결(enforcement) + 임시 프리뷰 삭제 — 마무리

권한 예외가 이제 **부여하면 실제 권한이 바뀝니다**(기존엔 카드에 기록만).
- **마이그레이션(적용 필요):** `202607130004_permission_override_enforcement.sql`
  - `order_processor` → `order_requests` UPDATE RLS에 `OR has_permission_override(...)` 추가(주문/비품 상태변경).
  - `maintenance_status_change` → `maintenance_reports` UPDATE RLS 동일.
  - `property_room_manage` → `properties`/`rooms`에 override 관리 정책 신설 + authenticated DML 그랜트
    (쓰기는 여전히 platform-admin 또는 override 보유자만 RLS로 허용).
- **앱 게이트(리포트):** `can_generate_report`는 RLS가 아니라 앱에서 검사 →
  `hasPermissionOverride()`(`permission-overrides-server.ts`)를 `generateDailyReport`(mobile)에 추가.
  활성(미만료·미회수) override면 시급직도 리포트 생성 가능.
- **정리:** 임시 디자인 검증 라우트 `src/app/users-preview` **삭제**.
- 검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors. 문서(27/06) 갱신.

**→ 사용자/권한 개편 전체 완료.** 남은 적용 마이그레이션: `202607130002`·`003`(전무) + `202607130004`(권한예외 enforcement).

Files: `supabase/migrations/202607130004_permission_override_enforcement.sql`(신규),
`src/lib/permission-overrides-server.ts`, `src/app/mobile/tasks/report-actions.ts`,
`src/app/users-preview/`(삭제), docs(27/06).

## 2026-07-13 권한 예외 부여 폼 UI 정리

- **권한 키 드롭다운:** 좌측 mono 키 컬럼 → **세로 스택**(라벨 굵게 → `permission_key`(mono, muted) → 설명)으로
  정리해 스캔이 쉬워짐. `adm-dropdown.tsx` rich 렌더 + `users-console.css`(`.dd__opt__key`/`--wide` 정렬).
- **만료일시:** 네이티브 `datetime-local` → 앱 공용 **`AdminDatePicker`(팝오버 달력) + `AdminTimePicker`(팝오버
  시간)** 로 교체. 날짜+시간을 각각 고르면 `form.expires`(YYYY-MM-DDTHH:mm)로 합침. `min`=오늘.
- **공용 `AdminDatePicker` 보강(빈 값 안전):** 값이 비었을 때 달력이 깨지던 것(`calendarMonth=""`)을
  min→오늘 달로 폴백, `placeholder` prop 추가(빈 트리거 표시). 기존 호출부(항상 값 있음)엔 영향 없음.
- i18n `console.datePrev/dateNext/dateToday/datePlaceholder` ko/ja/en. 검증: tsc 0 / lint 0, 프리뷰에서
  빈 값 달력(2026년 7월·31칸·Invalid 없음)·드롭다운 스택·콘솔 무에러 확인 후 임시 프리뷰 삭제.

Files: `src/components/admin/users/adm-dropdown.tsx`, `src/components/admin/users/user-detail-client.tsx`,
`src/components/admin/users-console.css`, `src/components/admin/shared/admin-date-picker.tsx`,
`src/lib/i18n.ts`, docs(06).

## 2026-07-13 사용자/권한 기능 — 완료 정리 ✅

사용자/권한 개편 이니셔티브를 **완료**로 마감. 멤버 라이프사이클(초대 → 역할·권한 관리 → 비활성 → 삭제)이
모두 **사용자 화면 한 곳**으로 통일되고 실제 동작한다.

**완료 범위:**
- 접근 통제(개발자 기본 + `manage_users` 위임, 재위임 개발자만), 개발자 지정(`platform_admins`)
- 전무(`senior_managing_director`) = owner 동급(RLS는 `has_org_role` 1함수로 전역, 연차 결재 기본=전무)
- 상태 활성/비활성 + 비활성=Supabase auth 밴(로그인 차단, 기존 온보딩 "disabled"와 정합)
- 가드형 하드 삭제(활동 기록 있으면 차단, 없으면 auth 계정까지 삭제, 2단계 확인)
- 권한 예외 CRUD + **enforcement 연결**(주문/수리=RLS, 건물·객실=RLS+grant, 리포트=앱 게이트)
- 초대코드(팀코드) 관리를 `/admin/users/invites`로 이전(설정→리다이렉트), 게이트 통일
- 본인 UI 정리(목록 작업 "—", 본인 상세 편집 카드 숨김), 재디자인 사용자 명단/상세(핸드오프 100%)
- 권한 예외 폼 정리(권한 키 세로 스택, 만료일시 커스텀 팝오버 피커)

**적용 필요 마이그레이션(전부 적용 시 실동작):** `202607130001`(manage_users, 적용됨),
`202607130002`·`003`(전무, 적용됨), `202607130004`(권한 예외 enforcement — **미적용 시 적용 필요**).

**의도적으로 남긴/후속 항목(완료 판단에 지장 없음):**
- 권한 예외 **만료 상한 없음** — 현재 미래이기만 하면 최대 9999년까지 가능(설계상 "영구 금지" 취지와는
  일부 어긋나나, 사용자 결정으로 상한 미적용). 필요 시 피커 `max` + 서버 검증에 상한 추가.
- 연차 stage 3(신청자 알림), employment_type 기반 시급직 연차 제외는 **연차 도메인** 후속(사용자 기능 아님).
- `getManageableOrganizations`는 `manage_users` 기준으로 정렬됨(초대 org 선택).

검증 전반: `npx tsc --noEmit` 0, `npm run lint` 0 errors 유지. 실기기 E2E 클릭 확인은 대표님 몫으로 남김.

## 2026-07-13 예약 캘린더 A4 인쇄 폭 동적 계산 수정

`/admin/calendar/print` 일자 컬럼 폭을 고정 `7.78mm` → `calc((256mm - var(--label-width)) /
<dateCount>)` 동적 계산으로 변경. 고정폭에서는 30~31일 달(예: 7월 31일 → 약 275mm 필요)이 A4 landscape
콘텐츠 폭(약 257mm)을 넘어 `overflow: hidden`으로 우측 날짜가 잘렸음. 이제 28~31일 어떤 달 길이든 라벨
컬럼+전체 일자 컬럼이 한 페이지에 맞는다. 예약 바는 공유 `--day-width` 변수를 기준으로 배치되어 정렬
유지. 상세: `docs/product/15-reservation-calendar.md` → "2026-07-13 A4 Print Fit Fix". Files:
`src/app/admin/calendar/print/page.tsx`.

## 2026-07-13 현장 매니저·직원 어드민 웹 접근 허용 (문서-코드 정합 후속)

문서 감사 중 `05-admin-web-ia.md`의 "part_time 제외 전원 어드민 접근" 서술이 코드(`adminWebRoles`)와
어긋난 게 발견됨. 대표님 확인 결과 **문서 의도(현장 매니저·직원도 접근 가능)가 정답** → 코드를 정정.

- `src/config/roles.ts` `adminWebRoles`에 `field_manager`·`staff` 추가(= part_time 제외 전원 접근).
- **접근 ≠ 기본 착지 분리:** 새 헬퍼 `defaultsToAdminSurface(role)`(field_manager/staff/part_time → 모바일,
  그 외 → 어드민)로 `preferredMode`(`session.ts`)·`getDefaultRouteForRole`(`onboarding.ts`)를 교체 →
  현장 인력은 어드민 접근은 되지만 **기본 착지는 모바일 유지**(기존 동작 불변).
- `canSwitchToFieldMode`를 `role !== 'part_time_staff'`로 완화(직원도 어드민↔현장 모드 전환 가능).
- 민감 페이지(사용자/설정/급여)는 각자 더 강한 페이지별 게이트를 그대로 유지.
- 검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors. 문서 `05-admin-web-ia.md` 정정.

Files: `src/config/roles.ts`, `src/lib/session.ts`, `src/lib/onboarding.ts`, docs(05/06).

## 2026-07-13 근태·사용자·예약 캘린더 — 완료 정리 (연기 항목 명시)

세 도메인의 코드·문서 정합성 작업을 마감. 문서 감사(3도메인)로 나온 코드↔문서 불일치를 코드=정답 기준으로
전부 정정했고(9개 문서, 별도 항목 참조), 남은 것은 아래 **의도적 연기** 항목뿐.

- **사용자/권한 — 완료 ✅.** 접근 통제·전무·상태·삭제·권한 예외(enforcement 포함)·초대코드 이전·UI·문서 전부.
  마이그레이션 `202607130001~0004` **적용 확인**(DB 상태 직접 검증).
- **근태 — 코어 완료 ✅.** 출퇴근·급여(PDF/Excel export, 급여 PDF "총 지급액" 열 잘림 수정 포함)·교통비·
  추가/특별수당·정정·수기 근무입력(근무 위치)·명단·전무 게이트·문서 정합. 
  - **연기:** **연차(annual leave)** 잔여(신청자 알림, `employment_type` 시급직 제외, 결재 흐름 실검증) —
    **연차 결재 담당 전무가 아직 미가입**이라 가입 후 진행.
- **예약 캘린더 — 기능 완료 ✅.** 관리자 콘솔 4뷰·A4 인쇄(폭 동적 계산)·Building info 실저장·모바일 캘린더·문서 정합.
  - **연기:** **Beds24 실시간 연동(webhook/reconcile)** — 인프라 재작업 중(파일:본인). **알림(notifications)** —
    예약 관련 알림은 후속.

검증 전반: `npx tsc --noEmit` 0, `npm run lint` 0 errors 유지.

Files: docs(06) — 상태 기록.

## 2026-07-14 어드민 수리·점검 콘솔 — 디자인 구현 완료 (목데이터)

`/admin/maintenance`가 기존 목록 카드 화면 → **운영 콘솔**로 교체됐다. Claude Design 핸드오프를 100%
이식한 것으로, **데이터는 전부 목데이터**이고 백엔드 연동은 후속이다(청소 콘솔과 동일한 순서).

- **3뷰**: 현황 보드(접수/처리중/무효 3칼럼, 완료는 제외) · 목록·이력 · 완료. KPI 5칸(접수·처리중·긴급·
  오래된 미해결·완료).
- **우측 상세 패널** + **예외 개입 모달 3종**(강제 완료 / 무효 처리 / 삭제, 각각 사유 메모 선택).
- **파생 값**: 재실 중(예약 `ci ≤ 오늘(Tokyo) < co`) · 오래된 미해결(`open` + 접수 72h 초과). 저장 안 함.
- **날짜/드롭다운은 공용 프리미티브**(`AdminDateRangePicker`, `AdmDropdown`) — 어드민 캘린더 캐논 준수.
- **내보내기 버튼 없음** — 핸드오프에 없어서 뺐다(한시적 예외). 서버 액션은 살아 있고, 백엔드 연동 시
  `<AdminExportButtons>`로 다시 붙인다.
- 청소 전용 CSS에 있던 공용 콘솔 프리미티브를 `admin-console.css`로 승격(수리·점검이 두 번째 소비자).
- i18n `dictionary.maintenance.console` ko/ja/en 동시 추가.

검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과, 3뷰·패널·모달 브라우저 렌더 확인
(콘솔 에러 0).

**남은 것(후속 사이클)**: 마이그레이션(`priority`/`category`/`resolution_memo`/`completed_at`/
`resolution_image_urls`/`cancelled` 상태) → 실데이터 연결 → 예외 개입 서버 액션 → 내보내기 재부착 →
모바일 신청 폼 카테고리 10종·우선순위 4종 교체.

Files: `src/app/admin/maintenance/page.tsx`, `src/app/admin/maintenance/actions.ts`(주석),
`src/components/admin/maintenance/*`(7개 신규), `src/components/admin/admin-console.css`,
`src/components/admin/cleaning/cleaning-console.css`, `src/lib/i18n.ts`,
docs(05-admin-web-ia / 08-maintenance-workflow / 01-decision-log / 06-current-status).

## 2026-07-14 수리·점검 — 백엔드 연동 + 모바일 현장 처리 (✅ 완료, 2026-07-15 확정)

어드민 콘솔이 목데이터 → **실데이터**로 붙었고, 그동안 없던 **모바일 현장 처리 UI**를 만들었다.

- **스키마**: `priority` / `category`(10종) / `resolution_memo` / `resolution_image_urls` /
  `completed_at` / `completed_by` / `completed_by_admin` / `is_building_only` 추가.
  상태 enum 재정의 — `resolved` 폐기(→ `closed` 병합), `cancelled` 추가. `property_name` 따라잡기.
- **모바일**: 상세 화면에 "현장 처리" 블록 신설 (상태 + 처리 메모 + 완료 사진 ≤5). 신청 폼의
  카테고리·우선순위가 이제 실제로 저장된다(그전엔 전부 버려졌다).
- **어드민**: 예외 개입(강제 완료 / 무효 처리 / 삭제)이 실제 서버 액션.
  **Excel/PDF 내보내기는 없다**(확정) — 버튼·서버 액션 모두 삭제.
- **같이 고친 버그**: `property_name` 마이그레이션 누락 · 상태 변경 silent-success · RLS UPDATE 정책의
  `staff` 누락 · 건물 전체 신고가 로케일별 문자열로 저장되던 문제.

검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과, `/admin/maintenance`와
`/mobile/maintenance/new` 라우트 컴파일·인증 게이트 확인.

> ✅ **마이그레이션 적용 완료 (2026-07-14).** `202607160001_maintenance_backend.sql`이 연결된
> Supabase 프로젝트에 반영됐고, 원격 DB에서 직접 확인했다 — 컬럼 22개, enum 3종
> (`maintenance_status` / `maintenance_priority` / `maintenance_category`), 인덱스 2개,
> RLS UPDATE 정책에 `staff` + `with check` 포함, 스토리지 정책에 `maintenance-resolutions` 폴더 포함,
> security advisor 신규 경고 없음. 적용 시점 테이블 행 수가 0이라 `resolved`→`closed` 병합과
> 건물 전체 백필은 각각 0행에 적용됐다.
>
> ✅ **기능 완료 확정 (2026-07-15).** 라이브 DB에 테스트 신고 6건을 사진 첨부로 삽입해
> (상태 4종 · 긴급 · 72h 초과 · 건물 전체 · 완료사진 포함) 스토리지 업로드 경로와 public 읽기를
> 실제로 검증했다 — 신고 사진(`maintenance-reports/`)·완료 사진(`maintenance-resolutions/`) 모두
> 인증 없이 `HTTP 200 image/png`로 열린다(스토리지 정책 통과). 코드 외 미검증이던 마지막 경로가
> 닫혔다. **수리·점검은 완료.** 유일한 후속 항목은 긴급 건 푸시 알림이며, 이는 개발 완료 후 출시 전
> **프로젝트 전체 알림 단계**에서 일괄 구현한다(수리·점검만의 미완이 아님).

Files: `supabase/migrations/202607160001_maintenance_backend.sql`, `src/types/database.ts`,
`src/lib/maintenance-constants.ts`(신규), `src/lib/maintenance-reports.ts`,
`src/lib/admin-maintenance.ts`(신규), `src/app/admin/maintenance/{page,actions}.ts(x)`,
`src/app/mobile/requests/maintenance/actions.ts`(신규),
`src/app/mobile/requests/maintenance/[id]/page.tsx`, `src/app/mobile/maintenance/new/actions.ts`,
`src/components/requests/maintenance-handling-form.tsx`(신규),
`src/components/requests/{maintenance-create-form,request-image-upload,requests-filter-view}.tsx`,
`src/components/cleaning/maintenance-linked-form.tsx`, `src/components/admin/maintenance/*`,
`src/lib/i18n.ts`, docs(04/05-eng, 05/08-product, 01/06-planning).

## 2026-07-15 분실물 — 모바일 반환(현장 처리) 백엔드 연동 (디자인 이식 + 백엔드)

수리·점검과 **동일한 매커니즘**을 분실물에 이식했다. 그동안 모바일 분실물은 등록·조회·삭제만 됐고
상태 변경 UI가 없었다(상태 진행바는 읽기 전용). 이번에 **현장이 모바일에서 직접 처리**(상태 변경 +
처리 메모 + 증빙 사진)하게 만들었고, 특히 **반환완료**(손님에게 전달)를 누구나 처리할 수 있다.

- **디자인**: Claude Design 핸드오프(`StayOps 분실물 반환 (mobile)/분실물 반환 처리 (mobile).html`)
  100% 이식. 기존 상세 화면은 그대로 두고, 읽기 전용 상태 스테퍼를 처리 블록으로 승격.
- **상태**: `lost_item_status`에 `returned`(반환완료) 추가(enum ADD VALUE). 완료 = returned/disposed.
- **스키마**: `handling_memo` / `handling_image_urls` / `handled_at` / `handled_by` /
  `handled_by_admin` 추가. storage 폴더 화이트리스트 += `lost-found-handling`.
- **모바일**: 상세에 처리 블록 신설(상태 칩 5 + 메모 + 사진 ≤5). 반환완료는 되돌릴 수 없어 저장 전
  canonical `BottomSheet`로 확인. 완료 → 처리 이력 카드, 파트타임 → 읽기 전용 + 잠금.
- **버그 함께 수정**: lost_items UPDATE RLS에서 `staff` 누락(수리·점검과 동일) → 추가 + `with check`.

검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과.

> ⚠️ **대표님 작업 필요**: 마이그레이션 `202607170001_lostfound_return.sql`을 Supabase 대시보드
> SQL 에디터에서 실행해야 한다. 적용 전에는 `/mobile/requests/lost-found/[id]`가 없는 컬럼을 읽으려다
> 깨진다. (수리·점검 때와 동일한 방식.) 적용 후 라이브 E2E 1회 권장.
>
> **범위**: 이번은 **모바일까지**. 대시보드(어드민)의 반환 이력 표시·예외 개입 UI는 후속.

Files: `supabase/migrations/202607170001_lostfound_return.sql`(신규), `src/types/database.ts`,
`src/lib/lost-found-constants.ts`(신규), `src/lib/lost-found.ts`,
`src/app/mobile/requests/lost-found/actions.ts`(신규),
`src/app/mobile/requests/lost-found/[id]/page.tsx`,
`src/components/requests/lost-found-handling-form.tsx`(신규),
`src/components/requests/request-image-upload.ts`,
`src/app/admin/lost-found/{page,[id]/page}.tsx`, `src/components/requests/requests-filter-view.tsx`,
`src/lib/i18n.ts`, docs(04/05-eng, 09-product, 01/06-planning).

## 2026-07-15 분실물 — 반환완료 전용 목록 화면 (모바일)

반환 처리에 이은 후속. 반환이 쌓이면 일반 목록에서 진행 중 건에 묻혀서, **반환완료만 모아 보는
전용 화면**을 추가했다. Claude Design 핸드오프(반환완료 분실물 목록) 이식.

- **진입점**: 요청 → 분실물 탭 "내 등록" 토글 옆의 네이비 "반환완료" pill →
  `/mobile/requests/lost-found/returned`.
- **화면**: 통계(총 반환/이번 달/이번 주, Tokyo 서버 계산) + 검색 + 기간(전체/오늘/7일/30일)·건물
  필터(canonical BottomSheet) + 월별 그룹 카드(반환일시·처리자·위치·메모).
- **데이터**: `getReturnedLostItems(session)` — `status='returned'`, `handled_at` 내림차순, 기간 무제한.
- **범위**: 기간 필터 프리셋만(커스텀 범위는 후속). DB 변경 없음(반환 처리 마이그레이션에 포함됨).

검증: `npx tsc --noEmit` 0, `npm run lint` 0 errors, `npm run build` 통과(`/mobile/requests/lost-found/returned` 라우트 등록 확인).

Files: `src/app/mobile/requests/lost-found/returned/page.tsx`(신규),
`src/components/requests/returned-lost-found-list.tsx`(신규),
`src/lib/lost-found.ts`, `src/components/requests/requests-filter-view.tsx`,
`src/app/mobile/requests/page.tsx`, `src/lib/i18n.ts`, docs(09-product, 16-product, 06-planning).
