import { describe, expect, it } from "vitest";
import {
  detectExternalPriceChanges,
  detectExternalRateChanges,
  type RateSnapshot,
} from "@/lib/beds24/external-price-changes";

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

describe("detectExternalRateChanges — 최소숙박 · 차단까지", () => {
  const snap = (over: Partial<RateSnapshot> = {}): RateSnapshot => ({ minStay: 2, override: null, price1: 45000, ...over });
  const row = (over: Record<string, unknown> = {}) => ({
    min_stay: 2,
    override_kind: null as string | null,
    price1: 45000 as number | null,
    room_id: "src",
    stay_date: "2026-11-03",
    ...over,
  });
  const detect = (before: RateSnapshot, after: ReturnType<typeof row>, sources = ["src"]) =>
    detectExternalRateChanges({
      after: [after as never],
      before: new Map([["src|2026-11-03", before], ["child|2026-11-03", before]]),
      sourceRoomIds: new Set(sources),
      today: TODAY,
    }).map((change) => [change.roomId, change.field, change.oldValue, change.newValue]);

  it("최소숙박이 바뀌면 잡는다 — 자식 유닛도(최소숙박은 링크가 아니다)", () => {
    expect(detect(snap(), row({ min_stay: 1 }))).toEqual([["src", "min_stay", 2, 1]]);
    expect(detect(snap(), row({ min_stay: 1, room_id: "child" }))).toEqual([["child", "min_stay", 2, 1]]);
  });

  it("50 으로 잠그거나 푸는 것은 유닛 교체라 안 센다", () => {
    expect(detect(snap(), row({ min_stay: 50 }))).toEqual([]);
    expect(detect(snap({ minStay: 50 }), row({ min_stay: 2 }))).toEqual([]);
  });

  it("차단 · 해제를 1/0 으로 잡는다", () => {
    expect(detect(snap(), row({ override_kind: "blackout" }))).toEqual([["src", "blackout", 0, 1]]);
    expect(detect(snap({ override: "blackout" }), row({ override_kind: "none" }))).toEqual([["src", "blackout", 1, 0]]);
  });

  it("잠긴 유닛의 차단은 소음이라 안 센다", () => {
    expect(detect(snap({ minStay: 50 }), row({ min_stay: 50, override_kind: "blackout" }))).toEqual([]);
  });

  it("가격은 여전히 소스 유닛만", () => {
    expect(detect(snap(), row({ price1: 39000, room_id: "child" }))).toEqual([]);
    expect(detect(snap(), row({ price1: 39000 }))).toEqual([["src", "price1", 45000, 39000]]);
  });

  it("이전 값을 모르거나 지난 날짜면 안 센다", () => {
    expect(
      detectExternalRateChanges({
        after: [row({ min_stay: 1 }) as never],
        before: new Map(),
        sourceRoomIds: new Set(["src"]),
        today: TODAY,
      }),
    ).toEqual([]);
    expect(detect(snap(), row({ min_stay: 1, stay_date: "2026-09-30" }))).toEqual([]);
  });
});
