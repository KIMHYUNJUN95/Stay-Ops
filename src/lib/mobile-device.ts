const MOBILE_DEVICE_UA =
  /Mobi|Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry|KAKAOTALK|Line\/|FB_IAB|FBAN|FBAV|Instagram|Twitter|NAVER/i;

const DESKTOP_UA = /Windows NT|Macintosh|X11.*Linux.*(?!Android)/i;

export function isMobileUserAgent(userAgent: string | null | undefined) {
  return MOBILE_DEVICE_UA.test(userAgent ?? "");
}

export function isDesktopUserAgent(userAgent: string | null | undefined) {
  return DESKTOP_UA.test(userAgent ?? "");
}

