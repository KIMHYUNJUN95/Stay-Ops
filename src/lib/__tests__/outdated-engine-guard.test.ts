import { describe, expect, it } from "vitest";
import {
  buildOutdatedEngineScript,
  detectOutdatedEngine,
  MIN_CHROME_MAJOR,
  MIN_IOS,
} from "@/lib/outdated-engine-guard";

const detect = (ua: string) => detectOutdatedEngine(ua, MIN_CHROME_MAJOR, MIN_IOS[0], MIN_IOS[1]);

describe("outdated engine guard", () => {
  it("flags an old Android System WebView inside the app", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 7.0; SM-G930F Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/95.0.4638.74 Mobile Safari/537.36 StayOpsApp";
    expect(detect(ua)).toBe("app");
    // 꼬리표가 없는 첫 빌드여도 WebView 표시(`; wv)`)로 앱으로 본다.
    expect(detect(ua.replace(" StayOpsApp", ""))).toBe("app");
  });

  it("flags an old Chrome browser as a browser, not the app", () => {
    expect(detect("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/100.0.0.0 Mobile Safari/537.36")).toBe("browser");
  });

  it("passes current Chrome / WebView", () => {
    expect(
      detect("Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/124.0.6367.219 Mobile Safari/537.36 StayOpsApp"),
    ).toBeNull();
    expect(detect("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/111.0.0.0 Safari/537.36")).toBeNull();
  });

  it("flags iOS below 16.4 and passes 16.4+", () => {
    expect(detect("Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 Version/15.6 Mobile/15E148 Safari/604.1")).toBe("browser");
    expect(detect("Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("browser");
    expect(detect("Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBeNull();
    expect(detect("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 StayOpsApp")).toBeNull();
    // Chrome for iOS 는 WebKit 이다 — Chrome 버전이 아니라 iOS 버전으로 본다.
    expect(detect("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/90.0 Mobile/15E148")).toBeNull();
  });

  it("builds a self-contained script that runs the same detector", () => {
    const script = buildOutdatedEngineScript({ title: "T</script>", bodyApp: "A", bodyBrowser: "B", action: "C" });
    expect(script).not.toContain("</script>");
    // 스크립트가 문법적으로 온전한지 — 실제로 파싱해 본다.
    expect(() => new Function(script)).not.toThrow();
  });
});
