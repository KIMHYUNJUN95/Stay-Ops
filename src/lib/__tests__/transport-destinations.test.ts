import { describe, expect, it } from "vitest";
import {
  TRANSPORT_OFFICE_KEY,
  TRANSPORT_OTHER_KEY,
  matchDestinationByLabel,
  transportDestinationRequiresMemo,
  type TransportDestination,
} from "@/lib/transport-destinations";
import { getCanonicalPropertyName } from "@/lib/room-label-normalization";

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

/**
 * 자동 연결에서 근무 기록을 골랐을 때 출근지를 찾는 규칙.
 *
 * 원래는 근무지(`attendance_sites`)의 건물 FK 를 따라가야 하는데, 2026-09-11 확인 결과 **모든
 * 근무지의 `property_id` 가 비어 있었다.** 그래서 근무 기록을 골라도 건물 칸이 비어 있었다.
 * 이름으로 맞추는 대비책이 그 구멍을 메운다.
 */
describe("matchDestinationByLabel", () => {
  const destinations: TransportDestination[] = [
    { key: "uuid-arakicho-a", label: "아라키초A", propertyId: "uuid-arakicho-a", kind: "property" },
    { key: "uuid-takada", label: "다카다노바바", propertyId: "uuid-takada", kind: "property" },
    { key: TRANSPORT_OFFICE_KEY, label: "사무실", propertyId: null, kind: "office" },
    { key: TRANSPORT_OTHER_KEY, label: "기타", propertyId: null, kind: "other" },
  ];
  const match = (label: string) =>
    matchDestinationByLabel(destinations, label, getCanonicalPropertyName);

  it("사무실처럼 건물이 아닌 근무지도 찾는다", () => {
    // 화면에서 실제로 막혔던 경우: 근무 기록 「9/10 사무실」을 골라도 건물이 안 채워졌다.
    expect(match("사무실")?.key).toBe(TRANSPORT_OFFICE_KEY);
  });

  it("건물 이름이 정확히 같으면 찾는다", () => {
    expect(match("아라키초A")?.key).toBe("uuid-arakicho-a");
  });

  it("표기가 흔들려도 찾는다", () => {
    // 근무지 이름과 건물 이름이 따로 관리돼 표기가 갈린다.
    expect(match("타카다노바바")?.key).toBe("uuid-takada");
    expect(match("Takadanobaba")?.key).toBe("uuid-takada");
  });

  it("못 찾으면 null — 엉뚱한 건물을 고르지 않는다", () => {
    // 「스카이」는 STAY ARI 의 옛 이름이라 지금 목록에 없다.
    expect(match("스카이")).toBeNull();
    expect(match("")).toBeNull();
    expect(match("   ")).toBeNull();
  });
});
