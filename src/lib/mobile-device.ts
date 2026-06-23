const MOBILE_DEVICE_UA =
  /Mobi|Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry|KAKAOTALK|Line\/|FB_IAB|FBAN|FBAV|Instagram|Twitter|NAVER/i;

const DESKTOP_UA = /Windows NT|Macintosh|X11.*Linux.*(?!Android)/i;

export type DeviceSurface = "mobile" | "desktop" | "unknown";

export function isMobileUserAgent(userAgent: string | null | undefined) {
  return MOBILE_DEVICE_UA.test(userAgent ?? "");
}

export function isDesktopUserAgent(userAgent: string | null | undefined) {
  return DESKTOP_UA.test(userAgent ?? "");
}

export function getDeviceSurface(
  userAgent: string | null | undefined,
  secChUaMobile?: string | null,
): DeviceSurface {
  if (secChUaMobile === "?1" || isMobileUserAgent(userAgent)) {
    return "mobile";
  }
  if (secChUaMobile === "?0" || isDesktopUserAgent(userAgent)) {
    return "desktop";
  }
  return "unknown";
}

export function getDeviceSurfaceFromHeaders(headers: { get(name: string): string | null }) {
  return getDeviceSurface(headers.get("user-agent"), headers.get("sec-ch-ua-mobile"));
}
