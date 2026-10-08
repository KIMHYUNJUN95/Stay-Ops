/**
 * 화면 오류를 서버 로그로 보낸다 (2026-10-09, 앱 출시 준비 — 오류 수집). 받는 쪽: `src/app/api/client-errors/route.ts`.
 *
 * - 오류 화면(`error.tsx` · `global-error.tsx`)에 걸린 오류는 모든 화면에서 보낸다 — 사용자가 실제로 본 고장이다.
 * - 잡히지 않은 오류(`window.onerror` · `unhandledrejection`)는 **앱 · 설치한 PWA 에서만** 보낸다(`ClientErrorReporter`).
 *   일반 브라우저는 확장 프로그램 오류 같은 잡음이 많다.
 * - 한 화면에서 최대 10건, 같은 메시지는 한 번만. 보내기 실패는 무시한다(오류 보고가 또 오류를 내지 않게).
 */
import { getNativeAppInfo, nativePlatform } from "@/lib/native-app";

const MAX_REPORTS_PER_PAGE = 10;
const sent = new Set<string>();

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    );
  } catch {
    return false;
  }
}

/** 지금 어디서 돌고 있나 — "ios" · "android"(앱) · "pwa" · "web". */
export function clientPlatform(): string {
  return nativePlatform() ?? (isStandalonePwa() ? "pwa" : "web");
}

/** 잡히지 않은 오류까지 모을 곳인가(앱 · 설치한 PWA). */
export function shouldCollectUncaughtErrors(): boolean {
  return nativePlatform() !== null || isStandalonePwa();
}

function describe(error: unknown): { message: string; stack: string | null; digest: string | null } {
  if (error instanceof Error) {
    return {
      message: `${error.name}: ${error.message}`,
      stack: error.stack ?? null,
      digest: (error as Error & { digest?: string }).digest ?? null,
    };
  }
  return { message: typeof error === "string" ? error : String(error), stack: null, digest: null };
}

export function reportClientError(error: unknown, source: string): void {
  if (typeof window === "undefined") return;
  const { message, stack, digest } = describe(error);
  const key = `${source}|${message}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS_PER_PAGE) return;
  sent.add(key);

  void (async () => {
    try {
      const info = await getNativeAppInfo();
      await fetch("/api/client-errors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          source,
          message,
          stack,
          digest,
          path: window.location.pathname,
          platform: clientPlatform(),
          appVersion: info?.version ?? null,
          appBuild: info?.build ?? null,
          online: navigator.onLine,
        }),
      });
    } catch {
      /* 보고 실패는 무시 */
    }
  })();
}
