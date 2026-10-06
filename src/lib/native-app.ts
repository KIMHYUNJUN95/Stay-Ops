// Capacitor 앱(iOS · Android) 관련 상수 · 판정 (2026-10-06, 앱 출시 준비 B2).
//
// 앱은 배포된 웹을 WebView 로 띄운다(capacitor.config.ts). 같은 웹이 브라우저 · PWA · 앱에서 모두 돌므로,
// 앱에서만 달라야 하는 동작(예: Google 로그인을 시스템 브라우저로)은 여기 판정으로 가른다.
// 문서: docs/engineering/03-deployment-strategy.md 「앱 빌드」 · docs/planning/17-app-release-plan.md B2

/**
 * 앱 전용 URL 스킴 — OAuth 가 끝나면 시스템 브라우저가 이 주소로 앱을 다시 연다.
 * Android `AndroidManifest.xml` intent-filter · iOS `Info.plist` CFBundleURLSchemes · Supabase Auth 「Redirect URLs」와
 * **반드시 같아야** 한다. 앱 ID(`capacitor.config.ts` appId)와 같은 역DNS 형식(Google 권장).
 */
export const NATIVE_APP_SCHEME = "com.harutokyo.stayops";

/** 앱 OAuth 복귀 주소. Supabase 가 여기에 `?code=` 를 붙여 돌려보낸다. */
export const NATIVE_AUTH_CALLBACK = `${NATIVE_APP_SCHEME}://auth/callback`;

/**
 * 지금 Capacitor 앱 안에서 돌고 있는가(클라이언트 전용). Capacitor 는 `server.url` 로 띄운 원격 페이지에도
 * `window.Capacitor` 브리지를 주입한다. 브라우저 · PWA 에서는 false.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** `com.harutokyo.stayops://auth/callback?...` 이면 웹 콜백 경로(`/auth/callback?...`)를, 아니면 null. */
export function nativeCallbackToWebPath(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${NATIVE_APP_SCHEME}:`) return null;
    // 커스텀 스킴은 `//auth/callback` 의 auth 가 host, /callback 이 pathname 으로 읽힌다.
    if (parsed.host !== "auth" || parsed.pathname !== "/callback") return null;
    return `/auth/callback${parsed.search}`;
  } catch {
    return null;
  }
}
