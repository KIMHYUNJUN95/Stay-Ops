import { describe, expect, it } from "vitest";
import { planRevertCells, type RevertLog } from "@/lib/ops-revert";

const log = (roomId: string, date: string, from: number | null, to: number | null): RevertLog => ({
  new_value: to,
  old_value: from,
  room_id: roomId,
  room_label: "R",
  stay_date: date,
});

describe("planRevertCells — 되돌리기 계획", () => {
  it("지금 값이 그 작업이 쓴 값이면 이전 값으로 되돌린다", () => {
    const result = planRevertCells({
      current: new Map([["a|2026-10-05", 12000]]),
      field: "price1",
      logs: [log("a", "2026-10-05", 10000, 12000)],
    });
    expect(result.cells).toEqual([{ roomId: "a", roomLabel: "R", stayDate: "2026-10-05", value: 10000 }]);
    expect(result.skippedChanged).toBe(0);
  });

  it("그 뒤에 다시 바뀐 칸은 건너뛰고 센다", () => {
    const result = planRevertCells({
      current: new Map([["a|2026-10-05", 15000]]),
      field: "price1",
      logs: [log("a", "2026-10-05", 10000, 12000)],
    });
    expect(result.cells).toHaveLength(0);
    expect(result.skippedChanged).toBe(1);
  });

  it("이전 값이 없거나 같으면 보내지 않는다(건너뜀으로도 세지 않는다)", () => {
    const result = planRevertCells({
      current: new Map(),
      field: "price1",
      logs: [log("a", "2026-10-05", null, 12000), log("a", "2026-10-06", 12000, 12000)],
    });
    expect(result).toEqual({ cells: [], skippedChanged: 0 });
  });

  it("최소숙박은 1~49 로만 되돌린다", () => {
    const result = planRevertCells({
      current: new Map([["a|2026-10-05", 1], ["a|2026-10-06", 1]]),
      field: "min_stay",
      logs: [log("a", "2026-10-05", 50, 1), log("a", "2026-10-06", 2, 1)],
    });
    expect(result.cells.map((cell) => cell.value)).toEqual([2]);
  });

  it("같은 유닛·날짜는 한 번만", () => {
    const result = planRevertCells({
      current: new Map([["a|2026-10-05", 12000]]),
      field: "price1",
      logs: [log("a", "2026-10-05", 10000, 12000), log("a", "2026-10-05", 10000, 12000)],
    });
    expect(result.cells).toHaveLength(1);
  });
});
