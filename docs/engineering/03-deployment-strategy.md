# Deployment Strategy

## Requirement

StayOps must be usable on both iPhone and Android even before public App Store / Google Play release.

The product may start as an internal company app before public launch.

The first stage must be free/low-cost, and Apple Developer account is not expected to be available immediately.

## Target Platforms

Required:

- iOS
- Android
- Admin web

## Public Store Release

Public store release is not planned immediately.

However, the app should be designed so it can later be released through:

- Apple App Store
- Google Play Store

## Internal Use Before Store Release

Possible approaches:

### PWA

Recommended for first stage.

Pros:

- No Apple Developer account required to start
- No Google Play Console account required to start
- Works on iPhone, Android, and desktop
- Can be added to home screen

Important:

- iPhone web push requires iOS 16.4+ and Home Screen installation.
- Staff onboarding should include "Add to Home Screen" instructions.

### iOS

Options:

- TestFlight
- Apple Business Manager / Custom App later if needed
- Development/internal builds for limited testing

### Android

Options:

- Internal app sharing
- Closed testing track
- APK/AAB internal distribution depending on setup

## Notification Requirement

Push notifications are important and must work on mobile devices.

The notification system should also support an in-app notification center that can be viewed from:

- Mobile app
- Admin web

## Technical Implication

If using React Native + Expo:

- EAS Build should be evaluated for internal iOS/Android builds.
- Push notification setup must be tested on real devices.
- Apple/Google developer account requirements should be checked before implementation.

## Open Questions

- How many internal iPhone users need access?
- How many internal Android users need access?
- Should the first internal version use TestFlight for iOS?
- Should Android use closed testing or direct APK distribution?

## Developer Account Status

Current status:

- Apple Developer account: not available yet
- Google Play Console account: not available yet

Required before reliable internal mobile distribution:

- Create Apple Developer account
- Create Google Play Console account

Priority:

- Apple Developer account is especially important for iPhone testing and TestFlight distribution.

Current recommendation:

- Start with PWA before creating developer accounts.
- Create Apple Developer and Google Play Console accounts later before native app release.

## 앱 빌드 (Capacitor, 2026-10-06)

결정: `docs/planning/01-decision-log.md` 2026-10-06 「앱 껍데기는 Capacitor」. 진행 체크리스트: `docs/planning/17-app-release-plan.md`.

### 구조

| 파일 · 폴더 | 무엇 |
| --- | --- |
| `capacitor.config.ts` | 앱 ID `com.harutokyo.stayops`(C4 전까지 변경 가능) · 앱 이름 · `server.url`(앱이 띄우는 배포 주소, 기본 `https://stay-ops-two.vercel.app`, `CAP_SERVER_URL` 로 덮어씀) |
| `capacitor-www/index.html` | 배포 주소에 닿지 못할 때만 보이는 대체 화면(ko/ja/en) |
| `android/` | Android Studio 프로젝트. 권한: 인터넷 · 카메라 · 위치(정밀 · 대략) |
| `ios/` | Xcode 프로젝트(Swift Package Manager — CocoaPods 불필요). `Info.plist` 권한 문구: 카메라 · 위치(사용 중) · 사진(영문 기본 — ko/ja 현지화는 C6) |
| `.vercelignore` | 웹 배포에서 위 네이티브 폴더 제외 |

- **앱 내용 = 배포된 웹.** 웹을 배포하면 앱도 바로 바뀐다. 네이티브 설정 · 플러그인을 바꿀 때만 앱을 다시 빌드한다.
- 네이티브 폴더는 git 으로 관리한다. 빌드 산출물(`build/`, `public/` 복사본 등)은 각 폴더의 `.gitignore` 가 제외한다.

### 명령

```bash
npm run cap:sync      # capacitor.config.ts · 플러그인 변경을 android/ · ios/ 에 반영
npm run cap:android   # Android Studio 로 열기
npm run cap:ios       # Xcode 로 열기 (macOS 만)
```

### 빌드 환경 (사용자 PC)

- **Android**: Android Studio(Windows · macOS 가능) → `android/` 열기 → 에뮬레이터 · 실기기 실행. 개발자 계정 없이도 실기기 설치(APK) 가능.
- **iOS**: **macOS + Xcode 필수**(Windows · Linux 불가). 실기기 설치 · TestFlight 는 Apple Developer Program 가입 후.
  Mac 이 없으면 클라우드 빌드(GitHub Actions macOS 러너, Codemagic 등)를 검토한다.
- WSL(이 저장소 개발 환경)에는 Java · Android SDK 가 없다 — 네이티브 빌드는 위 환경에서 한다.

### 앱 안 Google 로그인 (B2, 2026-10-06)

Google 은 앱 내 WebView 의 OAuth 를 막는다(`403 disallowed_useragent`). 앱에서는 이렇게 돈다 — 웹 · PWA 는 그대로다.

1. 로그인 화면 Google 버튼(`GoogleSubmitButton`)이 앱 안이면(`isNativeApp()`) 폼을 보내지 않고 서버 액션
   `getNativeGoogleSignInUrl` 로 로그인 URL 만 받는다. 이때 `redirectTo` = **`com.harutokyo.stayops://auth/callback?next=…`**,
   PKCE 확인 쿠키는 앱 WebView 에 심긴다.
2. 그 URL 을 `@capacitor/browser` 로 연다(iOS SFSafariViewController · Android Custom Tab).
3. 로그인이 끝나면 Supabase 가 `com.harutokyo.stayops://auth/callback?code=…` 로 보내고, OS 가 앱을 연다.
4. 루트 레이아웃의 `NativeAuthBridge` 가 `appUrlOpen`(실행 중) · `getLaunchUrl()`(콜드 스타트)을 받아 브라우저를 닫고 WebView 를
   `/auth/callback?code=…` 로 보낸다 → 기존 콜백이 1번의 쿠키로 세션을 만든다.

- 스킴 정의는 네 곳이 **같아야** 한다: `src/lib/native-app.ts` `NATIVE_APP_SCHEME` · `AndroidManifest.xml` intent-filter ·
  iOS `Info.plist` `CFBundleURLTypes` · **Supabase Auth → URL Configuration → Redirect URLs 에 `com.harutokyo.stayops://auth/callback`**.
  마지막이 빠지면 Supabase 가 Site URL(웹)로 돌려보내 로그인이 시스템 브라우저에서 끝나고 앱은 로그아웃 상태로 남는다.
- 회원가입 확인 · 비밀번호 재설정 **메일 링크**는 아직 브라우저에서 열린다(앱으로 열려면 Universal Links / App Links — 계획 C2).

### 앱 안 WebView 보정 (B3, 2026-10-06)

`NativeShellBridge`(루트 레이아웃, 앱에서만 동작):

| 상황 | 웹에서 | 앱에서 |
| --- | --- | --- |
| 다른 출처 링크(Beds24 · Airbnb · Booking · 지도 등), `target="_blank"` 다른 출처 | 새 탭 | 앱 안 브라우저(`@capacitor/browser`) |
| `download` 링크 · 첨부 다운로드(서명 URL을 `a.click()`) | 다운로드 | 앱 안 브라우저(미리보기 · 공유 · 저장) |
| 같은 출처 `target="_blank"` · `window.open` | 새 탭 | 같은 WebView 에서 이동(시스템 브라우저는 로그인 쿠키가 다르다) |
| 다른 출처 `window.open`(예: 캘린더 지도) | 새 탭 | 앱 안 브라우저 |
| `tel:` · `mailto:` | OS | Capacitor 가 OS 로 넘김(손대지 않음) |
| Android 뒤로가기 버튼 | — | 오버레이 닫기 → 이전 화면 → 앱 최소화(`16-mobile-navigation.md`) |

- 상태바 · 내비게이션 바: `capacitor.config.ts` `plugins.SystemBars` = `insetsHandling: "native"` + `initialViewportFitValueHint: "cover"`.
  웹의 `viewport-fit=cover` · `env(safe-area-inset-*)` 가 그대로 쓰인다(Android 15+ edge-to-edge 대응).
- 카메라 · 위치: Android 는 Capacitor WebChromeClient 가 웹 요청을 런타임 권한으로 바꿔 묻는다(매니페스트 권한 선언 완료). iOS 는 `Info.plist`
  문구로 OS 팝업.
- 남은 확인: 서비스 워커(iOS WKWebView 는 App-Bound Domains 없이는 등록 안 됨 — 오프라인 대체 화면은 `capacitor-www`), 실기기 확인(B1-1).

### Android 첫 실행 (Windows + Android Studio, Mac 없음)

저장소는 WSL 안에 있지만, Android Studio 는 WSL 경로 프로젝트를 열면 「WSL 안에 JDK 를 설치하라」(`Gradle JVM option is incorrect`)며
동기화에 실패한다(2026-10-06 실제로 겪음). 그래서 **앱 빌드에 필요한 것만 Windows 폴더로 복사해서 연다.**

1. WSL 에서 `npm run cap:android:win` (= `scripts/dev/sync-android-to-windows.sh`) — `cap sync` 후 `android/` 와 그것이 참조하는
   `node_modules/@capacitor/*` 를 같은 구조로 **`C:\dev\stayops-android`** 에 복사한다(빌드 산출물 · `.idea` · `local.properties` 는 건드리지 않음).
2. Android Studio → File → Open → **`C:\dev\stayops-android\android`** → Trust Project → Gradle 동기화(처음 몇 분).
3. Device Manager 에서 에뮬레이터(Pixel 계열 · 최신 API)를 만들거나 USB 디버깅 실기기 연결 → ▶ Run.
4. 확인: 이메일 로그인 → Google 로그인(시스템 브라우저 → 앱 복귀) → 홈 → 출퇴근 QR(카메라 · 위치 권한 팝업) → 게시판 첨부 다운로드 →
   룸 링크 외부 링크 → 시트 열고 뒤로가기 버튼.
- 네이티브 설정 · 플러그인을 바꾸면 1번을 다시 돌린다. 웹 화면만 바뀐 것은 다시 빌드할 필요 없다(앱이 배포된 웹을 띄운다).
- Windows Defender 가 Gradle 을 느리게 하면 Android Studio 알림의 「Exclude folders」로 `C:\dev\stayops-android` 를 제외한다.
- **iOS**: Mac 이 없으므로 Apple Developer 가입 후 클라우드 빌드(Codemagic · GitHub Actions macOS 러너 등)로 TestFlight 에 올린다(계획 B1-3).

### 아이콘 · 스플래시

- 앱 아이콘 · 스플래시(B1-2, 2026-10-07): `node scripts/dev/generate-app-icons.mjs` 가 iOS `AppIcon` · `Splash`, Android
  `mipmap-*`(적응형 배경 · 전경) · `drawable*/splash.png`, 스토어 원본 `store-assets/icon-1024.png` · `play-icon-512.png` 를 만든다.
  Android 12+ 시작 화면은 `res/values/styles.xml` 의 `windowSplashScreen*`(아이보리 바탕 + 남색 원). 정식 로고가 생기면 스크립트의
  `mark()` 만 바꾸고 다시 돌린 뒤 `npm run cap:android:win`.

## Initial Web Hosting

Decision:

- Use Vercel for the initial internal PWA/admin web deployment.

Initial domain:

```txt
*.vercel.app
```

Later:

- Add company domain or subdomain if available.
- Consider dedicated product domain before public release.

Reason:

- Fast setup
- Free/low-cost start
- HTTPS support for PWA and Web Push requirements

## App Store 준비 (2026-10-06)

### 방향

1. **비공개 배포 먼저** — Apple Business Manager **Custom App**(조직 단위 배포) 또는 **Unlisted App**(링크로만 설치).
   거래처 · 사내 직원만 쓰는 업무 앱이라 공개 심사 부담(최소 기능 4.2 · 사용자 콘텐츠 1.2)이 작다. 다만 심사 자체는 받는다.
2. **공개 출시는 그 뒤** — 아래 「공개 출시 전」 항목을 채운 다음.
3. 앱 껍데기(네이티브 래퍼)를 무엇으로 할지는 아직 정하지 않았다. 현재 코드를 살리는 Capacitor 래핑 + 네이티브 기능(푸시 · 카메라 ·
   위치 · Apple 로그인 · 공유 시트)이 1안. **PWA-first 방향 변경이므로 결정 시 결정 로그에 남긴다.**

### 지금 갖춘 것

| 항목 | 위치 | 비고 |
| --- | --- | --- |
| 개인정보처리방침 | `/legal/privacy` | App Store Connect 「개인정보처리방침 URL」. `#security` 앵커 = 로그인 화면 「보안」 링크 |
| 이용약관 | `/legal/terms` | |
| 고객지원 | `/support` | App Store Connect 「지원 URL」. 문의 메일 = `NEXT_PUBLIC_SUPPORT_EMAIL`(비면 「관리자에게 확인」 문구) |
| 계정 삭제 안내(웹) | `/legal/account-deletion` | Google Play 「계정 삭제 URL」. 앱 안 · 웹 직접 삭제 + 로그인 불가 시 메일 요청(본인 확인 후 30일 이내). 삭제 · 잔존 항목은 `deleteAccount` 실제 동작 기준 |
| 앱 안 계정 삭제 | 계정 → 보안 → 계정 삭제 (`src/app/account/actions.ts` `deleteAccount`) | 5.1.1(v) 충족 |
| 앱 안에서 약관 · 지원 접근 | 계정 → 보안 「약관 및 지원」, 로그인 화면 하단 · 가입 폼 동의 문구 · 도움말 | |

- 세 페이지는 **로그인 없이** 열린다(미들웨어 보호 경로 밖). 언어 = `?lang=` → `stayops_locale` 쿠키 → Accept-Language.
  상단에서 한국어 · 日本語 · English 전환.
- 본문은 `src/lib/legal-content.ts`(조항 단위 ko/ja/en), 화면 크롬은 `dictionary.legal`. 공용 틀 = `src/components/legal/legal-page-shell.tsx`.
- 폰 · 폴드 · 태블릿 모두 760px 읽기 폭 한 칸(문서라 줄 길이를 넓히지 않는다).
- **본문은 실제 구현과 맞아야 한다.** 수집 항목(계정 · 근태 GPS/기기 정보 · 업무 기록 · Beds24 투숙객 정보) · 외부 처리자
  (Supabase · Vercel · Google · Beds24 · DeepL · Slack) · 삭제 동작이 바뀌면 `legal-content.ts` 와 이 절을 같이 고친다.
  App Store 개인정보 라벨도 같은 목록으로 작성한다.

### 남은 일

남은 항목 · 순서 · 담당 · 진행 상태는 **`docs/planning/17-app-release-plan.md`** 한 곳에서 관리한다(Android 포함).
