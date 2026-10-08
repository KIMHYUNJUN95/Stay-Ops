"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/native-app";

/**
 * 앱(Capacitor) WebView 보정 (2026-10-06, 앱 출시 준비 B3). 루트 레이아웃에 한 번만 둔다. 브라우저 · PWA 에서는 아무것도 안 한다.
 *
 * 1. **바깥 링크 · 새 창 · 다운로드** — WebView 는 `target="_blank"` · `window.open` · 첨부 다운로드를 조용히 무시하거나
 *    앱 밖 브라우저로 튕긴다. 다른 출처(http/https) 링크, `target="_blank"`, `download` 링크는 앱 안 브라우저
 *    (`@capacitor/browser` — iOS SFSafariViewController · Android Custom Tab)로 연다. 같은 출처 새 창은 WebView 에서 그대로 연다
 *    (시스템 브라우저는 로그인 쿠키가 달라 다시 로그인을 요구한다). `tel:` · `mailto:` 등은 Capacitor 가 OS 로 넘긴다.
 * 2. **Android 뒤로가기 버튼** — 열린 시트 · 대화상자 · 메뉴 · 사진 뷰어가 있으면 먼저 닫고(Esc 와 같은 경로), 없으면 이전 화면,
 *    더 갈 곳이 없으면 앱을 최소화한다(종료하지 않는다). Esc 를 받지 않는 대화상자에서 막히지 않도록, 1.2초 안에 다시 누르면 화면 이동.
 * 3. **상태바 아이콘** — 어두운 아이콘 고정(앱 화면은 늘 밝다). 2026-10-08 네이티브 품질 N1.
 */
const OVERLAY_SELECTOR = '[aria-modal="true"], [role="dialog"], [data-native-back-overlay]';

export function NativeShellBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;

    async function openInAppBrowser(url: string) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url, presentationStyle: "popover" });
    }

    function resolve(href: string): URL | null {
      try {
        return new URL(href, window.location.href);
      } catch {
        return null;
      }
    }

    // 1-a. 링크 클릭(사람이 누른 것 + `a.click()` 으로 만든 다운로드 모두 여기로 온다)
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = resolve(anchor.getAttribute("href") ?? "");
      if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return;
      const external = url.origin !== window.location.origin;
      const newWindow = anchor.target === "_blank";
      const download = anchor.hasAttribute("download");
      if (!external && !newWindow && !download) return;
      event.preventDefault();
      if (external || download) void openInAppBrowser(url.href);
      else window.location.assign(url.href);
    }
    document.addEventListener("click", onClick, true);

    // 1-b. window.open — 같은 출처는 WebView 안에서, 다른 출처는 앱 안 브라우저로. 빈 창(문서 직접 쓰기)은 원래대로.
    const originalOpen = window.open.bind(window);
    window.open = ((target?: string | URL, name?: string, features?: string) => {
      const href = target ? String(target) : "";
      const url = href ? resolve(href) : null;
      if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return originalOpen(target, name, features);
      if (url.origin === window.location.origin) window.location.assign(url.href);
      else void openInAppBrowser(url.href);
      return null;
    }) as typeof window.open;

    // 3. 상태바 아이콘 — 앱 화면은 늘 밝은 아이보리라 어두운 아이콘으로 고정(N1). Android 는 capacitor.config 의
    //    `SystemBars.style` 로도 정하지만 iOS 는 설정값이 없어 여기서 맞춘다(기기 다크 모드면 흰 아이콘이 되어 안 보였다).
    void (async () => {
      const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
      await SystemBars.setStyle({ style: SystemBarsStyle.Light }).catch(() => undefined);
    })();

    // 2. Android 뒤로가기
    let removeBack: (() => void) | null = null;
    let disposed = false;
    void (async () => {
      const { App } = await import("@capacitor/app");
      let lastEscapeAt = 0;
      const listener = await App.addListener("backButton", ({ canGoBack }) => {
        // Esc 를 받지 않는 대화상자도 있다 — 1.2초 안에 다시 눌렀는데도 그대로면 화면 이동으로 넘어간다(먹통 방지).
        const now = Date.now();
        if (document.querySelector(OVERLAY_SELECTOR) && now - lastEscapeAt > 1200) {
          lastEscapeAt = now;
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          return;
        }
        lastEscapeAt = 0;
        if (canGoBack) window.history.back();
        else void App.minimizeApp();
      });
      if (disposed) void listener.remove();
      else removeBack = () => void listener.remove();
    })();

    return () => {
      disposed = true;
      document.removeEventListener("click", onClick, true);
      window.open = originalOpen;
      removeBack?.();
    };
  }, []);

  return null;
}
