import { describe, expect, it } from "vitest";
import { detectExternalPriceChanges } from "@/lib/beds24/external-price-changes";

/**
 * Beds24 에서 바뀐 가격 찾기.
 *
 * 계약: `src/lib/beds24/external-price-changes.ts`
 * 한 번의 변경이 여러 번 잡히거나(링크), 새로 들어온 날을 변경으로 세면 가격 개입 판정이 틀어진다.
 */
const TODAY = "2026-10-01";
const run = (
  before: Array<[string, number | null]>,
  after: Array<{ room_id: string; stay_date: string; price1: number | null }>,
  sources = ["src"],
) =>
  detectExternalPriceChanges({
    after,
    before: new Map(before),
    sourceRoomIds: new Set(sources),
    today: TODAY,
  });

describe("detectExternalPriceChanges", () => {
  it("소스 유닛의 price1 이 바뀌면 잡는다", () => {
    expect(run([["src|2026-11-03", 45000]], [{ price1: 39000, room_id: "src", stay_date: "2026-11-03" }])).toEqual([
      { newValue: 39000, oldValue: 45000, roomId: "src", stayDate: "2026-11-03" },
    ]);
  });

  it("같은 값이면 안 잡는다 — 우리 앱이 쓴 값은 이미 우리 표에 들어가 있다", () => {
    expect(run([["src|2026-11-03", 39000]], [{ price1: 39000, room_id: "src", stay_date: "2026-11-03" }])).toEqual([]);
  });

  it("링크로 따라 바뀐 자식 유닛은 안 센다 — 한 번의 변경이 여러 번 잡힌다", () => {
    expect(
      run([["child|2026-11-03", 45000]], [{ price1: 39000, room_id: "child", stay_date: "2026-11-03" }]),
    ).toEqual([]);
  });

  it("이전 값을 모르면(창에 새로 들어온 날) 변경이 아니다", () => {
    expect(run([], [{ price1: 39000, room_id: "src", stay_date: "2027-10-01" }])).toEqual([]);
    expect(run([["src|2026-11-03", null]], [{ price1: 39000, room_id: "src", stay_date: "2026-11-03" }])).toEqual([]);
  });

  it("지난 날짜는 안 센다", () => {
    expect(run([["src|2026-09-30", 45000]], [{ price1: 39000, room_id: "src", stay_date: "2026-09-30" }])).toEqual([]);
  });

  it("가격이 지워진 것은 안 센다", () => {
    expect(run([["src|2026-11-03", 45000]], [{ price1: null, room_id: "src", stay_date: "2026-11-03" }])).toEqual([]);
  });
});
