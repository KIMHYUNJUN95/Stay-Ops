// 근태 QR 토큰 파싱 가드.
//
// 2026-07-31 에 QR 인코딩을 "토큰만" → "절대 URL" 로 바꿨다. 현장에 이미 붙어 있는 인쇄물은
// 여전히 토큰만 담고 있으므로, 스캐너가 두 형식을 모두 받지 못하면 기존 QR 이 전부 죽는다.
// See src/lib/attendance-qr.ts / docs/product/24-attendance-workflow.md → "QR Deep Link".

import { describe, expect, it } from "vitest";
import { extractAttendanceToken } from "@/lib/attendance-qr";

const TOKEN = "att_kGh3Zx9QpL7nT2vWbYc4Rd8sMf1AeJu6";

describe("extractAttendanceToken", () => {
  it("accepts a legacy bare-token QR", () => {
    expect(extractAttendanceToken(TOKEN)).toBe(TOKEN);
    expect(extractAttendanceToken(`  ${TOKEN}  `)).toBe(TOKEN);
  });

  it("accepts the new URL QR", () => {
    expect(extractAttendanceToken(`https://ops.example.com/mobile/attendance/capture?token=${TOKEN}`)).toBe(
      TOKEN,
    );
  });

  it("survives a different host, extra params, or a trailing slash", () => {
    expect(
      extractAttendanceToken(`http://192.168.0.12:3000/mobile/attendance/capture/?token=${TOKEN}&mode=in`),
    ).toBe(TOKEN);
  });

  it("rejects anything that is not an attendance token", () => {
    expect(extractAttendanceToken("")).toBeNull();
    expect(extractAttendanceToken("   ")).toBeNull();
    expect(extractAttendanceToken("https://example.com/hello")).toBeNull();
    expect(extractAttendanceToken("https://example.com/x?token=not-ours")).toBeNull();
    expect(extractAttendanceToken("att_")).toBeNull();
    expect(extractAttendanceToken("random text")).toBeNull();
  });
});
