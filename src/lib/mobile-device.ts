const MOBILE_DEVICE_UA =
  /Mobi|Android|iPhone|iPad|iPod|IEMobile|Windows Phone|webOS|BlackBerry/i;

export function isMobileUserAgent(userAgent: string | null | undefined) {
  return MOBILE_DEVICE_UA.test(userAgent ?? "");
}
