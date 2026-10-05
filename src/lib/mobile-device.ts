const MOBILE_DEVICE_UA =
  /Mobi|Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry|KAKAOTALK|Line\/|FB_IAB|FBAN|FBAV|Instagram|Twitter|NAVER/i;

const DESKTOP_UA = /Windows NT|Macintosh|X11.*Linux.*(?!Android)/i;

export type DeviceSurface = "mobile" | "desktop" | "unknown";

/**
 * 아이패드 표시 쿠키(2026-10-05 — 01번 결정 로그 「아이패드는 모바일 앱으로」).
 *
 * 아이패드 사파리는 사용자 에이전트를 **Mac 으로** 보내서 서버는 PC 와 구별하지 못한다. 그래서 화면에서
 * 「터치 되는 Mac」(`navigator.maxTouchPoints > 1` — 진짜 Mac 은 0)을 알아보고 이 쿠키를 심는다
 * (`TouchTabletDetect`). 서버는 쿠키가 있으면 모바일로 본다 — 관리자 화면 대신 `/mobile` 로 간다.
 */
export const TOUCH_TABLET_COOKIE = "stayops_touch_tablet";

function hasTouchTabletCookie(cookieHeader: string | null | undefined) {
  return (cookieHeader ?? "").split(";").some((part) => part.trim() === `${TOUCH_TABLET_COOKIE}=1`);
}

export function isMobileUserAgent(userAgent: string | null | undefined) {
  return MOBILE_DEVICE_UA.test(userAgent ?? "");
}

export function isDesktopUserAgent(userAgent: string | null | undefined) {
  return DESKTOP_UA.test(userAgent ?? "");
}

export function getDeviceSurface(
  userAgent: string | null | undefined,
  secChUaMobile?: string | null,
  cookieHeader?: string | null,
): DeviceSurface {
  if (secChUaMobile === "?1" || isMobileUserAgent(userAgent) || hasTouchTabletCookie(cookieHeader)) {
    return "mobile";
  }
  if (secChUaMobile === "?0" || isDesktopUserAgent(userAgent)) {
    return "desktop";
  }
  return "unknown";
}

export function getDeviceSurfaceFromHeaders(headers: { get(name: string): string | null }) {
  return getDeviceSurface(headers.get("user-agent"), headers.get("sec-ch-ua-mobile"), headers.get("cookie"));
}
