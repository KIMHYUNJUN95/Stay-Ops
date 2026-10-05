"use client";

import { useEffect } from "react";
import { TOUCH_TABLET_COOKIE } from "@/lib/mobile-device";

/**
 * 아이패드를 모바일 앱으로(2026-10-05 — 01번 결정 로그). 아이패드 사파리는 Mac 으로 알리므로 서버가 모른다 —
 * 「터치 되는 Mac」이면 쿠키를 심고(1년), PC 쪽 화면(`/`, 로그인, `/admin`)에 있었다면 한 번 다시 불러 서버가 모바일로
 * 보내게 한다. 이미 쿠키가 있으면 아무것도 하지 않는다. 진짜 Mac 은 `maxTouchPoints` 가 0 이라 걸리지 않는다.
 */
export function TouchTabletDetect() {
  useEffect(() => {
    const isTouchMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    if (!isTouchMac) return;
    if (document.cookie.split(";").some((part) => part.trim() === `${TOUCH_TABLET_COOKIE}=1`)) return;
    document.cookie = `${TOUCH_TABLET_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
    const path = window.location.pathname;
    if (path === "/" || path.startsWith("/admin") || path.startsWith("/auth/login")) window.location.reload();
  }, []);
  return null;
}
