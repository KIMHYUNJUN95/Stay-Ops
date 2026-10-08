import { describe, expect, it } from "vitest";
import { getDeviceSurface, getDeviceSurfaceFromHeaders, TOUCH_TABLET_COOKIE } from "@/lib/mobile-device";

const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("device surface", () => {
  it("iPad Safari looks like a Mac until the touch-tablet cookie is set", () => {
    expect(getDeviceSurface(IPAD_SAFARI)).toBe("desktop");
    expect(getDeviceSurface(IPAD_SAFARI, null, `sb=1; ${TOUCH_TABLET_COOKIE}=1`)).toBe("mobile");
    expect(getDeviceSurface(IPAD_SAFARI, null, `${TOUCH_TABLET_COOKIE}=0`)).toBe("desktop");
  });

  it("reads the cookie from request headers", () => {
    const headers = new Headers({ cookie: `${TOUCH_TABLET_COOKIE}=1`, "user-agent": IPAD_SAFARI });
    expect(getDeviceSurfaceFromHeaders(headers)).toBe("mobile");
  });

  it("the iPad app (Mac UA + StayOpsApp tag) is mobile even before the cookie is set", () => {
    expect(getDeviceSurface(`${IPAD_SAFARI} StayOpsApp`)).toBe("mobile");
  });

  it("phones and Android tablets stay mobile, PCs stay desktop", () => {
    expect(getDeviceSurface("Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 Chrome/128 Safari/537.36")).toBe("mobile");
    expect(getDeviceSurface("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36")).toBe("desktop");
  });
});
