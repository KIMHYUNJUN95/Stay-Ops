import { describe, expect, it } from "vitest";
import {
  TRANSPORT_OFFICE_KEY,
  TRANSPORT_OTHER_KEY,
  transportDestinationRequiresMemo,
} from "@/lib/transport-destinations";

/**
 * 출근지 키와 메모 필수 판정 (2026-09-11).
 *
 * 입력 화면(클라이언트)과 저장 경로(서버)가 **같은 판정**을 써야 한다. 갈라지면 화면은
 * 통과시키고 서버는 거절하는(또는 그 반대) 상태가 된다.
 */
describe("transportDestinationRequiresMemo", () => {
  it("기타만 메모가 필수다", () => {
    expect(transportDestinationRequiresMemo(TRANSPORT_OTHER_KEY)).toBe(true);
  });

  it("사무실은 필수가 아니다", () => {
    expect(transportDestinationRequiresMemo(TRANSPORT_OFFICE_KEY)).toBe(false);
  });

  it("건물(property_id)은 필수가 아니다", () => {
    // 건물 키는 UUID 다 — 고정 키와 절대 겹치지 않는다.
    expect(transportDestinationRequiresMemo("2f1c8a3e-0b44-4f90-9c31-77a0d5b6e112")).toBe(false);
  });

  it("빈 값은 필수가 아니다 — 출근지를 아직 안 고른 상태를 막지 않는다", () => {
    expect(transportDestinationRequiresMemo("")).toBe(false);
  });

  it("고정 키는 서로 다르다", () => {
    expect(TRANSPORT_OFFICE_KEY).not.toBe(TRANSPORT_OTHER_KEY);
  });
});
