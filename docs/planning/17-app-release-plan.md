# iOS · Android 앱 출시 계획

> **이 문서가 출시 작업의 단일 체크리스트다.** 사용자와 진행하는 작업은 전부 iOS · Android 출시를 향한다(2026-10-06 사용자 지시).
> 항목을 끝내면 상태를 `[x]` 로 바꾸고 커밋 해시 · 날짜를 적는다. 세부 근거는 `docs/engineering/03-deployment-strategy.md` 「App Store 준비」.

## 방향 (확정 · 미정)

- **확정 (2026-10-06):** 비공개 배포 먼저 → 준비가 끝나면 공개 출시. iOS 는 Apple Business Manager Custom App 또는 Unlisted App,
  Android 는 Google Play 비공개(내부 · 비공개 테스트 트랙 → 조직 대상 배포).
- **확정 (2026-10-06, 사용자 승인):** 앱 껍데기 = **Capacitor**(iOS · Android 한 코드베이스, 현재 Next.js 앱을 그대로 띄우고 네이티브 기능을 붙임).
  웹 · PWA 는 지금처럼 그대로 운영한다. 결정 로그 2026-10-06.

## 담당 표기

- **👤 사용자** — 계정 · 결제 · 회사 서류 · DNS 처럼 사용자만 할 수 있는 것
- **🤖 Claude** — 코드 · 문서 · 설정 작업
- **🤝 함께** — 사용자가 콘솔에서 누르고 Claude 가 값 · 순서를 안내

---

## 0단계 — 계정 · 도메인 (오래 걸리므로 지금 시작)

| # | 항목 | 담당 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| A1 | **D-U-N-S 번호** (회사 명의) | 👤 | [ ] | Apple · Google 조직 계정에 필요. 발급 1~2주. 일본 법인은 TSR(도쿄상공리서치) |
| A2 | **Apple Developer Program 조직 가입** ($99/년) | 👤 | [ ] Apple ID 생성 완료 · 미결제 | 결제 전에 「조직」으로 가입할 것 — 판매자명이 회사명으로 표시. 회사 도메인 이메일 · 웹사이트 필요 |
| A3 | **Google Play Console 조직 계정** ($25, 1회) | 👤 | [ ] | 개인 계정은 신규 앱 출시 전 「테스터 12명 × 14일」 비공개 테스트 의무 — 조직 계정은 면제 |
| A4 | **자체 도메인** `app.haru-tokyo.com`(안) | 👤→🤝 | [ ] DNS 관리자 확인 중 | 회사 메일 도메인의 하위 도메인이라 메일에 영향 없음. DNS 에 CNAME 1줄 |

## 1단계 — 계정 없이 지금 할 수 있는 것

| # | 항목 | 담당 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| B0 | **Capacitor 채택 결정** | 👤 승인 | [x] 2026-10-06 | 결정 로그 기록 |
| B1 | **Capacitor 골격** (iOS · Android 프로젝트, 앱 ID, 권한 설정) | 🤖 | [x] 2026-10-06 | `capacitor.config.ts` · `android/` · `ios/`. 앱은 배포된 웹을 띄운다. 빌드 방법: `03-deployment-strategy.md` 「앱 빌드」 |
| B1-1 | **실기기 · 에뮬레이터 첫 실행 확인** — Android Studio(Windows 가능) / Xcode(Mac 필요) | 👤 | [ ] Android 부터 — 절차: `03` 「Android 첫 실행」 | 이메일 · Google 로그인 → 홈 → 출퇴근 QR(카메라 · 위치 권한) → 첨부 다운로드 → 외부 링크 → 뒤로가기 버튼 |
| B1-3 | **iOS 빌드 경로** — Mac 없음 → 클라우드 빌드(Codemagic · GitHub Actions macOS 러너) | 🤝 | [ ] | Apple Developer 가입(A2) 후. 사용자 확인: Mac 없음, Android Studio 있음(2026-10-06) |
| B1-2 | **앱 아이콘 · 스플래시** — 1024px 원본에서 생성 | 🤖 | [ ] | 지금은 Capacitor 기본 아이콘. 1024px 원본 이미지 필요 |
| B2 | **앱 안 Google 로그인** — 시스템 브라우저로 로그인 → 딥링크로 앱 복귀 | 🤖 | [x] 2026-10-06 | `getNativeGoogleSignInUrl` + `@capacitor/browser` + `NativeAuthBridge`, 스킴 `com.harutokyo.stayops://auth/callback`. `03` 「앱 안 Google 로그인」 |
| B2-1 | **Supabase Redirect URLs 에 `com.harutokyo.stayops://auth/callback` 추가** | 👤 | [x] 2026-10-06 | 사용자 설정 완료(Redirect URLs 5개). 이게 있어야 앱으로 돌아온다 |
| B2-2 | **실기기에서 앱 Google 로그인 확인** | 👤 | [ ] | B1-1(앱 첫 실행) 때 함께 |
| B3 | **WebView 호환 점검** — 다운로드, 외부 링크(Beds24 · OTA · 지도 · 전화), 카메라 · 위치 권한, Android 뒤로가기 버튼, safe-area | 🤖 | [x] 2026-10-06 | `NativeShellBridge` — 외부 링크 · 다운로드 → 앱 안 브라우저, 같은 출처 새 창 → WebView, 뒤로가기 버튼, SystemBars 설정. 실기기 확인은 B1-1. `03` 「앱 안 WebView 보정」 |
| B4 | **게시판 신고 · 차단** (`/mobile/board`) | 🤖 | [x] 2026-10-06 | 신고(사유 5종 + 메모) → 신고자에게 즉시 숨김, owner · office_admin 이 `/mobile/board/reports` 에서 삭제 / 문제없음. 차단 = 내 게시판에서 숨김, 계정 → 보안에서 해제. `23-board-workflow.md` §12-C |
| B4-2 | **신고 취소 · 관리 콘솔 신고 처리** | 🤖 | [x] 2026-10-06 | 계정 → 보안 「신고한 글 · 댓글」 → 신고 취소(`withdrawn`). `/admin/board-reports` 표 + 상세 패널. 처리 권한을 권한 키 `board.moderate` 로 정식화 |
| B4-1 | 다른 사용자 작성 콘텐츠(공지 댓글 · 제안함 댓글 등)에도 신고 · 차단이 필요한지 검토 | 🤖 | [ ] | 심사 기준은 「사용자 간 공유되는 콘텐츠」. 업무 기록 성격이 강한 화면은 제외 가능 |
| B5 | **웹에서 계정 삭제 요청 경로** | 🤖 | [x] 2026-10-06 | `/legal/account-deletion`(ko/ja/en) — Play Console 「계정 삭제 URL」에 이 주소. 로그인 불가 시 메일 요청은 본인 확인 후 30일 이내 처리(운영 약속) |
| B5-1 | **계정 삭제 시 남는 칸** — 성별 · 입사일 | 👤 결정 | [x] 2026-10-06 | 고용 기록으로 남긴다(결정 로그). 코드 변경 없음 |
| B6 | **심사용 데모 조직 · 계정 · 샘플 데이터** | 🤖 (+👤 확인) | [ ] | 심사관은 초대 코드 없이 바로 들어가야 함. 실제 운영 데이터와 분리 |
| ✅ | 개인정보처리방침 · 이용약관 · 고객지원 페이지 | 🤖 | [x] `dfc5e6a` 2026-10-06 | `/legal/privacy` · `/legal/terms` · `/support` (ko/ja/en) |
| ✅ | 문의 메일 환경 변수 `NEXT_PUBLIC_SUPPORT_EMAIL` | 👤 | [x] 2026-10-06 | Vercel Production 에 설정 · 반영 확인 |
| ✅ | 앱 안 계정 삭제 | — | [x] (기존) | 계정 → 보안 → 계정 삭제 |

## 2단계 — 계정 · 도메인이 생긴 뒤

| # | 항목 | 담당 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| C1 | **도메인 연결 · 주소 교체** — Vercel 도메인, Supabase 로그인 리디렉트, Google OAuth 승인 도메인, `NEXT_PUBLIC_APP_URL`, 약관 · 지원 URL | 🤝 | [ ] | A4 이후 |
| C2 | **앱 링크 검증 파일** — iOS `apple-app-site-association`, Android `assetlinks.json` | 🤖 | [ ] | 링크를 누르면 앱이 열리게 + B2 로그인 복귀 |
| C3 | **Apple 로그인** | 🤝 | [ ] | Google 로그인이 있으므로 iOS 필수(Apple 4.8). Supabase Apple provider + Services ID · 키 |
| C4 | **서명 · 번들 ID(iOS) · 패키지명(Android)** | 🤝 | [ ] | 한 번 정하면 못 바꿈. 안: `com.harutokyo.stayops` |
| C5 | **네이티브 푸시** — iOS APNs · Android FCM | 🤖 | [ ] | 「알림은 막바지에 일괄 구현」 방침과 같은 배치로 |
| C6 | **권한 설명 문구 · 개인정보 신고** — Info.plist(카메라 · 위치 · 사진, ko/ja/en), `PrivacyInfo.xcprivacy`, App Store 개인정보 라벨, Google Play 데이터 보안 양식 | 🤖 (+👤 제출) | [ ] | `src/lib/legal-content.ts` 수집 항목과 일치해야 함 |
| C7 | **스토어 등록 자료** — 아이콘 1024px, 스크린샷(아이폰 · 아이패드 · 안드로이드 폰 · 태블릿), 3개 언어 설명문, 연령 등급, 카테고리 | 🤖 (+👤 제출) | [ ] | |
| C8 | **내부 테스트** — TestFlight · Google Play 내부 테스트 트랙 | 🤝 | [ ] | 실기기에서 로그인 · 출퇴근 QR · 사진 업로드 · 푸시 |
| C9 | **비공개 배포** — Custom/Unlisted App · Play 비공개 트랙 | 🤝 | [ ] | 심사 제출 · 대응 |

## 3단계 — 공개 출시 전

| # | 항목 | 담당 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| D1 | 방침 · 약관에 운영 법인명 · 주소 기재 + 법무 검토 | 👤 | [ ] | |
| D2 | 「웹을 감싼 앱」 거절(Apple 4.2) 대비 — 네이티브 기능 · 오프라인 동작 보강 | 🤖 | [ ] | 비공개 배포 땐 부담이 작지만 공개 심사는 엄격 |
| D3 | 공개 스토어 페이지 · 마케팅 문구 | 🤝 | [ ] | |

---

## 작업 기록

| 날짜 | 커밋 | 무엇 |
| --- | --- | --- |
| 2026-10-06 | `dfc5e6a` | 약관 · 개인정보 · 지원 공개 페이지, 끊긴 링크 연결 |
| 2026-10-06 | — | `NEXT_PUBLIC_SUPPORT_EMAIL` 프로덕션 설정(사용자) · 반영 확인 |
| 2026-10-06 | `56e3061` | 출시 계획 문서 신설 |
| 2026-10-06 | `8431e3f` | B5 계정 삭제 안내 페이지 `/legal/account-deletion` |
| 2026-10-06 | `cecc637` | B4 게시판 신고 · 차단 + 신고 처리 화면 · 차단 해제 |
| 2026-10-06 | `29ff68c` | B0 Capacitor 채택 기록 · B1 골격(android/ · ios/ · 권한) · B5-1 결정 |
| 2026-10-06 | `5e2a027` · `8a42c09` | B4-2 신고 취소 · 관리 콘솔 「게시판 신고」 · `board.moderate` 권한 키 · 콘솔 디자인 정리 |
| 2026-10-06 | `f200832` | B2 앱 안 Google 로그인(시스템 브라우저 + 앱 스킴 복귀) |
| 2026-10-06 | `e4d8179` | B2-1 Supabase Redirect URLs 에 앱 스킴 추가(사용자) |
| 2026-10-06 | `af4ce17` | B3 WebView 보정(외부 링크 · 다운로드 · 새 창 · 뒤로가기 · SystemBars), Android 첫 실행 가이드 |
| 2026-10-06 | (이 커밋) | Windows Android Studio 용 빌드 사본 스크립트(`npm run cap:android:win`) — WSL JDK 오류 회피 |
