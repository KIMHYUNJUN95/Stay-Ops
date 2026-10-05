import { describe, expect, it } from "vitest";
import { trimBlockRows } from "@/lib/beds24/block-trim";

/** 차단 해제 — 푼 밤만 잘라 낸다(2026-10-06, 아라키초A 302). 계약: `src/lib/beds24/block-trim.ts` */
describe("trimBlockRows", () => {
  const row = (id: string, start_date: string, end_date: string) => ({ end_date, id, start_date });

  it("구간 끝만 풀면 앞쪽이 남는다(10/5~10/6 에서 10/6 해제 — 전엔 줄이 통째로 남았다)", () => {
    expect(trimBlockRows([row("a", "2026-10-05", "2026-10-06")], { endDate: "2026-10-06", startDate: "2026-10-06" })).toEqual({
      deleteIds: ["a"],
      keep: [row("a", "2026-10-05", "2026-10-05")],
    });
  });

  it("가운데를 풀면 둘로 나뉜다", () => {
    const out = trimBlockRows([row("a", "2026-10-01", "2026-10-10")], { endDate: "2026-10-05", startDate: "2026-10-04" });
    expect(out.keep).toEqual([row("a", "2026-10-01", "2026-10-03"), row("a", "2026-10-06", "2026-10-10")]);
  });

  it("통째로 덮으면 지우기만, 안 겹치면 그대로", () => {
    expect(trimBlockRows([row("a", "2026-10-05", "2026-10-06")], { endDate: "2026-10-07", startDate: "2026-10-05" })).toEqual({ deleteIds: ["a"], keep: [] });
    expect(trimBlockRows([row("a", "2026-10-01", "2026-10-02")], { endDate: "2026-10-07", startDate: "2026-10-05" })).toEqual({ deleteIds: [], keep: [] });
  });
});
