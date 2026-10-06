import type { CapacitorConfig } from "@capacitor/cli";

/**
 * iOS · Android 앱 껍데기 (Capacitor, 2026-10-06 결정 — docs/planning/01-decision-log.md).
 *
 * 앱은 배포된 웹을 그대로 띄운다(`server.url`) — 웹 배포가 곧 앱 내용 갱신이다. 웹 · PWA 는 그대로 운영한다.
 * `webDir` 은 그 주소에 닿지 못할 때만 보이는 대체 화면.
 *
 * - `CAP_SERVER_URL` 로 다른 배포(미리보기 · 자체 도메인)를 가리킬 수 있다. 자체 도메인이 생기면(계획 A4 · C1) 기본값을 바꾼다.
 * - `appId` 는 스토어 등록(계획 C4) 전까지 바꿀 수 있다. 등록 후에는 바꿀 수 없다.
 * - 계획 · 진행: docs/planning/17-app-release-plan.md
 */
const serverUrl = process.env.CAP_SERVER_URL ?? "https://stay-ops-two.vercel.app";

const config: CapacitorConfig = {
  appId: "com.harutokyo.stayops",
  appName: "StayOps",
  webDir: "capacitor-www",
  server: {
    url: serverUrl,
    cleartext: false,
  },
  // 웹이 safe-area(env(safe-area-inset-*))를 직접 처리하므로 네이티브 쪽 여백은 넣지 않는다.
  ios: {
    contentInset: "never",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    // Android 15+ 는 앱을 상태바 · 내비게이션 바 아래까지 그린다(edge-to-edge). 웹은 이미 `viewport-fit=cover` +
    // `env(safe-area-inset-*)` 로 여백을 잡으므로 Capacitor 권장값 `native` 를 쓰고, 첫 화면이 튀지 않게 cover 힌트를 준다.
    SystemBars: {
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
