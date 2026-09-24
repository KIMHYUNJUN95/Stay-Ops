import { describe, expect, it } from "vitest";
import { mergeOpsRateUnits, type OpsRateUnit } from "@/lib/ops-rate-merge";

/**
 * 한 칸에 Beds24 유닛이 여럿일 때의 병합 규칙 고정.
 *
 * **이 규칙은 2026-09-17 에 두 번 틀렸다.**
 *
 * 1. 운영 중 판정에 `numAvail`·`blackout` 을 섞어서, 예약이 찬 날마다 비활성 유닛의
 *    `minStay 99` 가 화면으로 올라왔다
 * 2. 유닛 하나를 골라 그 행을 통째로 써서, 메인 계정에만 있는 부킹닷컴 가격이 사라졌다
 *
 * 둘 다 화면에서는 **「안 파는 날」과 똑같이 보인다** — 눈으로는 못 잡는다. 그래서 여기서
 * 고정한다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「유닛이 여럿인 칸」
 */

function unit(overrides: Partial<OpsRateUnit> = {}): OpsRateUnit {
  return {
    max_stay: 30,
    min_stay: 2,
    num_avail: 1,
    override_kind: "none",
    price1: 40000,
    price2: null,
    price3: null,
    ...overrides,
  };
}

/** 오쿠보C 2026-10-01 실측값. 메인만 부킹닷컴·아고다 가격을 들고 있다. */
const OKUBO_C_OCT_1: OpsRateUnit[] = [
  // 450096 오쿠보 2-1 (메인) — 10/1 부터 비활성
  unit({ min_stay: 50, price1: 79000, price2: 116920, price3: 102700 }),
  // 496532 1-13-1-2 — 계속 비활성
  unit({ min_stay: 99, price1: 79000 }),
  // 648399 OkuboCC — 10/1 부터 판매
  unit({ min_stay: 2, price1: 79000 }),
];

describe("mergeOpsRateUnits", () => {
  it("유닛이 하나면 그대로 쓴다", () => {
    expect(mergeOpsRateUnits([unit({ price1: 42000 })])).toMatchObject({
      minStay: 2,
      numAvail: 1,
      price: 42000,
    });
  });

  it("운영 중인 유닛이 하나도 없으면 칸을 비운다", () => {
    // 비활성 유닛의 minStay 99 를 보여주는 것은 정보가 아니라 오답이다.
    expect(mergeOpsRateUnits([unit({ min_stay: 99 }), unit({ min_stay: 50 })])).toBeNull();
    expect(mergeOpsRateUnits([])).toBeNull();
  });

  it("최소숙박·재고는 **운영 중인 유닛에서만** 읽는다", () => {
    const merged = mergeOpsRateUnits(OKUBO_C_OCT_1);
    // 메인(450096)의 50 이 올라오면 「팔 수 없는 날」이 되고, 그건 팔리는 방을 안 판다는 뜻이다.
    expect(merged?.minStay).toBe(2);
  });

  it("가격은 운영 중인 유닛에 없으면 **그 행의 다른 유닛**에서 가져온다", () => {
    // 오쿠보C 는 방 계정이 셋인데 부킹닷컴·아고다 가격은 메인 하나에만 있다.
    // 유닛 하나를 골라 통째로 쓰면 그 가격이 사라진다.
    const merged = mergeOpsRateUnits(OKUBO_C_OCT_1);
    expect(merged?.price).toBe(79000);
    expect(merged?.bookingPrice).toBe(116920);
    expect(merged?.altPrice).toBe(102700);
  });

  it("가격 폴백은 **항목별**이다 — 한 유닛을 통째로 쓰지 않는다", () => {
    const merged = mergeOpsRateUnits([
      unit({ min_stay: 2, price1: 50000, price2: null }),
      unit({ min_stay: 99, price1: 79000, price2: 116920 }),
    ]);
    // p1 은 운영 중인 유닛 것, p2 는 비활성 유닛 것 — 섞여야 맞다.
    expect(merged?.price).toBe(50000);
    expect(merged?.bookingPrice).toBe(116920);
  });

  it("운영 중인 유닛이 둘이면 최소숙박은 **짧은 쪽**", () => {
    // 하나라도 1박에 팔면 그 칸은 1박이다.
    const merged = mergeOpsRateUnits([unit({ min_stay: 3 }), unit({ min_stay: 1 })]);
    expect(merged?.minStay).toBe(1);
  });

  it("운영 중인 유닛이 둘이면 재고는 **하나라도 있으면 있다**", () => {
    const merged = mergeOpsRateUnits([unit({ num_avail: 0 }), unit({ num_avail: 1 })]);
    expect(merged?.numAvail).toBe(1);
  });

  it("blackout 은 반대로 **하나라도 걸리면 막힘**", () => {
    // 재고와 방향이 다르다 — 막으라고 걸어 둔 것을 다른 유닛이 덮으면 안 된다.
    const merged = mergeOpsRateUnits([
      unit({ override_kind: "none" }),
      unit({ override_kind: "blackout" }),
    ]);
    expect(merged?.overrideKind).toBe("blackout");
  });

  it("비활성 유닛의 blackout 은 칸을 막지 않는다", () => {
    // 안 파는 유닛에 걸린 blackout 은 그 유닛 사정이다.
    const merged = mergeOpsRateUnits([
      unit({ min_stay: 2, override_kind: "none" }),
      unit({ min_stay: 99, override_kind: "blackout" }),
    ]);
    expect(merged?.overrideKind).toBe("none");
  });

  it("가격이 어느 유닛에도 없으면 null — 0원으로 만들지 않는다", () => {
    // 0원은 「공짜로 판다」는 뜻이다. 모르는 것은 비워 둔다.
    const merged = mergeOpsRateUnits([unit({ price1: null, price2: null, price3: null })]);
    expect(merged?.price).toBeNull();
    expect(merged?.bookingPrice).toBeNull();
  });
});
