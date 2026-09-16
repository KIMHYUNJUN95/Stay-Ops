import { describe, expect, it } from "vitest";
import {
  detectOneNightGaps,
  isActiveUnitMinStay,
  opsCellStatus,
  type OpsGapCellInput,
} from "@/lib/ops-gap-detection";

/**
 * 1박 갭 판정식 고정 — 저쪽 `getCheckInGapInfo` 를 줄 단위로 옮긴 것이다.
 *
 * **이 규칙은 임의로 단순화하지 않는다.** 여기서 한 조건이 느슨해지면 갭이 아닌 칸의 minStay 가
 * 바뀌고, 그건 곧 팔리면 안 되는 방이 팔린다는 뜻이다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「1박 갭 감지」
 */

const TODAY = "2026-11-16";

/** 기본은 「팔 수 있는 2박 최소」 칸. 테스트마다 필요한 것만 덮어쓴다. */
function cell(overrides: Partial<OpsGapCellInput> = {}): OpsGapCellInput {
  return { minStay: 2, numAvail: 1, overrideKind: "none", occupied: false, ...overrides };
}

/** 날짜 → 칸 맵을 만들고, 없는 날짜는 「막힘」으로 본다(예약이 차 있다는 뜻). */
function grid(map: Record<string, OpsGapCellInput | null>) {
  return (date: string) => (date in map ? map[date] : cell({ occupied: true }));
}

describe("opsCellStatus", () => {
  it("다섯 조건이 전부 참이어야 팔 수 있다", () => {
    expect(opsCellStatus(cell())).toBe("available");
  });

  it("minStay 를 못 읽으면 unknown — 갭으로 세지 않는다", () => {
    // 모르는 것을 「비었다」고 하면 팔리면 안 되는 방이 팔린다.
    expect(opsCellStatus(cell({ minStay: null }))).toBe("unknown");
    expect(opsCellStatus(null)).toBe("unknown");
  });

  it("blackout 은 막힘", () => {
    expect(opsCellStatus(cell({ overrideKind: "blackout" }))).toBe("blocked");
    expect(opsCellStatus(cell({ overrideKind: "BLACKOUT" }))).toBe("blocked");
  });

  it("minStay 50 이상은 비활성 유닛이라 막힘", () => {
    // 저쪽 INACTIVE_MINSTAY_THRESHOLD 와 같은 값이어야 한다.
    expect(opsCellStatus(cell({ minStay: 50 }))).toBe("blocked");
    expect(opsCellStatus(cell({ minStay: 99 }))).toBe("blocked");
    expect(opsCellStatus(cell({ minStay: 49 }))).toBe("available");
    expect(opsCellStatus(cell({ minStay: 0 }))).toBe("blocked");
  });

  it("numAvail 0 이면 막힘", () => {
    expect(opsCellStatus(cell({ numAvail: 0 }))).toBe("blocked");
  });

  it("예약·블락이 있으면 막힘 — 요금 동기화 이후 들어온 예약을 잡는다", () => {
    expect(opsCellStatus(cell({ occupied: true }))).toBe("blocked");
  });
});

describe("isActiveUnitMinStay", () => {
  it("1~49 만 운영 중인 유닛이다", () => {
    expect(isActiveUnitMinStay(1)).toBe(true);
    expect(isActiveUnitMinStay(2)).toBe(true);
    expect(isActiveUnitMinStay(49)).toBe(true);
    expect(isActiveUnitMinStay(50)).toBe(false);
    expect(isActiveUnitMinStay(99)).toBe(false);
    expect(isActiveUnitMinStay(0)).toBe(false);
    expect(isActiveUnitMinStay(null)).toBe(false);
  });

  it("numAvail·blackout 과는 무관하다", () => {
    // 「이 유닛이 운영 중인가」와 「그 밤을 팔 수 있는가」는 다른 질문이다.
    // 섞으면 예약이 찬 날마다 비활성 유닛의 minStay 99 가 화면으로 올라온다
    // (2026-09-17 에 실제로 그랬다 — 10/1 부터 가격이 사라지고 99 가 보였다).
    expect(isActiveUnitMinStay(2)).toBe(true);
    expect(opsCellStatus(cell({ minStay: 2, numAvail: 0 }))).toBe("blocked");
  });
});

describe("detectOneNightGaps", () => {
  it("앞뒤가 막힌 하루 + minStay 2 → 갭", () => {
    const dates = ["2026-11-20", "2026-11-21", "2026-11-22"];
    const gaps = detectOneNightGaps({
      dates,
      cellAt: grid({ "2026-11-21": cell() }),
      today: TODAY,
    });
    expect(gaps).toEqual(["2026-11-21"]);
  });

  it("minStay 가 1이면 이미 팔린다 → 갭 아님", () => {
    const gaps = detectOneNightGaps({
      dates: ["2026-11-21"],
      cellAt: grid({ "2026-11-21": cell({ minStay: 1 }) }),
      today: TODAY,
    });
    expect(gaps).toEqual([]);
  });

  it("minStay 3 이상은 다른 정책이다 → 갭 아님", () => {
    const gaps = detectOneNightGaps({
      dates: ["2026-11-21"],
      cellAt: grid({ "2026-11-21": cell({ minStay: 3 }) }),
      today: TODAY,
    });
    expect(gaps).toEqual([]);
  });

  it("이틀 이상 이어지면 2박으로 팔 수 있다 → 갭 아님", () => {
    const gaps = detectOneNightGaps({
      dates: ["2026-11-21", "2026-11-22"],
      cellAt: grid({ "2026-11-21": cell(), "2026-11-22": cell() }),
      today: TODAY,
    });
    expect(gaps).toEqual([]);
  });

  it("구간의 첫날만 센다 — 같은 공실을 여러 번 세지 않는다", () => {
    // 20·21 이 비었고 22 가 막혔다면, 21 은 「어제가 available」이라 첫날이 아니다.
    const gaps = detectOneNightGaps({
      dates: ["2026-11-20", "2026-11-21"],
      cellAt: grid({ "2026-11-20": cell(), "2026-11-21": cell() }),
      today: TODAY,
    });
    expect(gaps).toEqual([]);
  });

  it("어제가 과거면 구간의 첫날로 본다", () => {
    // 창의 왼쪽 끝. 어제 상태를 알 수 없어도 과거면 첫날로 친다(저쪽 isSegmentEntry 와 같다).
    const gaps = detectOneNightGaps({
      dates: [TODAY],
      cellAt: grid({ [TODAY]: cell() }),
      today: TODAY,
    });
    expect(gaps).toEqual([TODAY]);
  });

  it("내일을 모르면 갭이 아니다", () => {
    // availableNightsFromDate = 0. 창 밖이라 데이터가 없는 경우가 이렇다.
    const gaps = detectOneNightGaps({
      dates: ["2026-11-21"],
      cellAt: (date) =>
        date === "2026-11-21" ? cell() : date === "2026-11-20" ? cell({ occupied: true }) : null,
      today: TODAY,
    });
    expect(gaps).toEqual([]);
  });

  it("여러 갭을 한 번에 찾는다", () => {
    const gaps = detectOneNightGaps({
      dates: ["2026-11-21", "2026-11-25", "2026-11-28"],
      cellAt: grid({
        "2026-11-21": cell(),
        "2026-11-25": cell(),
        "2026-11-28": cell(),
      }),
      today: TODAY,
    });
    expect(gaps).toEqual(["2026-11-21", "2026-11-25", "2026-11-28"]);
  });
});
