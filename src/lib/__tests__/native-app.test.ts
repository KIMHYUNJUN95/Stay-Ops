import { describe, expect, it } from "vitest";
import { NATIVE_AUTH_CALLBACK, nativeCallbackToWebPath } from "@/lib/native-app";

// 앱 OAuth 복귀 주소 → 웹 콜백 경로 변환(2026-10-06, B2). 잘못 넘기면 앱 로그인이 조용히 끊긴다.
describe("nativeCallbackToWebPath", () => {
  it("앱 스킴 콜백의 쿼리를 그대로 웹 콜백으로 옮긴다", () => {
    expect(nativeCallbackToWebPath(`${NATIVE_AUTH_CALLBACK}?code=abc&next=%2Fmobile`)).toBe(
      "/auth/callback?code=abc&next=%2Fmobile",
    );
  });

  it("오류 응답(error_description)도 그대로 넘긴다", () => {
    expect(nativeCallbackToWebPath(`${NATIVE_AUTH_CALLBACK}?error_description=denied`)).toBe(
      "/auth/callback?error_description=denied",
    );
  });

  it("다른 스킴 · 다른 경로는 무시한다", () => {
    expect(nativeCallbackToWebPath("https://stay-ops-two.vercel.app/auth/callback?code=abc")).toBeNull();
    expect(nativeCallbackToWebPath("com.harutokyo.stayops://other/path?code=abc")).toBeNull();
    expect(nativeCallbackToWebPath("evil.app://auth/callback?code=abc")).toBeNull();
    expect(nativeCallbackToWebPath("not a url")).toBeNull();
  });
});
