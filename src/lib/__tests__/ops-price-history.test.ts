import { describe, expect, it } from "vitest";
import {
  buildHistoryByCell,
  describeCellHistory,
  describeHistoryEntry,
  historyCellKey,
  HISTORY_PER_CELL,
  type HistoryCopy,
  type PriceHistoryRow,
} from "@/lib/ops-price-history";

/**
 * 칸별 가격 변경 이력.
 *
 * 가격이 이상할 때 제일 먼저 나오는 질문이 「누가 언제 얼마에서 얼마로 바꿨나」다.
 * 이 표시가 틀리면 되짚을 근거가 없어진다.
 *
 * 계약: docs/product/33-calendar-write-features.md 「이력을 남긴다」
 */

const COPY: HistoryCopy & { more: string } = {
  change: "{from} → {to}",
  cleared: "{from} 삭제",
  minStay: "{n}박",
  more: "외 {count}건",
  percentSuffix: "({n}%)",
  set: "{to} 로 설정",
  unknownUser: "(알 수 없음)",
};

function row(overrides: Partial<PriceHistoryRow> = {}): PriceHistoryRow {
  return {
    at: "2026-09-24T05:03:00.000Z",
    by: "김현준",
    field: "price1",
    mode: "amount",
    newValue: 42000,
    oldValue: 38453,
    percent: null,
    roomLabel: "201",
    stayDate: "2026-10-14",
    ...overrides,
  };
}

describe("buildHistoryByCell", () => {
  it("칸별로 모은다", () => {
    const map = buildHistoryByCell([row(), row({ roomLabel: "202" })]);
    expect(map.size).toBe(2);
    expect(map.get(historyCellKey("201", "2026-10-14"))?.total).toBe(1);
  });

  it("**최신순으로 정렬한다** — DB 정렬에 기대지 않는다", () => {
    // 쿼리를 손대는 날 조용히 순서가 뒤집히면 「마지막에 누가 바꿨나」가 틀린다.
    const map = buildHistoryByCell([
      row({ at: "2026-09-20T00:00:00.000Z", newValue: 1 }),
      row({ at: "2026-09-24T00:00:00.000Z", newValue: 2 }),
      row({ at: "2026-09-22T00:00:00.000Z", newValue: 3 }),
    ]);
    expect(map.get(historyCellKey("201", "2026-10-14"))?.entries.map((e) => e.newValue)).toEqual([
      2, 3, 1,
    ]);
  });

  it("줄은 잘라도 **전체 횟수는 남긴다**", () => {
    // 몇 번 바뀌었는지는 잘린 뒤에도 알아야 한다.
    const rows = Array.from({ length: 9 }, (_, i) =>
      row({ at: `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const bucket = buildHistoryByCell(rows).get(historyCellKey("201", "2026-10-14"));
    expect(bucket?.entries).toHaveLength(HISTORY_PER_CELL);
    expect(bucket?.total).toBe(9);
  });

  it("빈 입력이면 빈 맵", () => {
    expect(buildHistoryByCell([]).size).toBe(0);
  });
});

describe("describeHistoryEntry", () => {
  it("누가 · 언제 · 얼마 → 얼마", () => {
    // 시각은 **도쿄 기준**이다. 05:03 UTC = 14:03 JST.
    expect(describeHistoryEntry(row(), COPY)).toBe("09-24 14:03 · 김현준 · ¥38,453 → ¥42,000");
  });

  it("값이 없던 칸은 「설정」이다 — 0에서 올렸다고 하면 거짓말이다", () => {
    expect(describeHistoryEntry(row({ oldValue: null }), COPY)).toContain("¥42,000 로 설정");
  });

  it("값을 지운 칸은 「삭제」다", () => {
    expect(describeHistoryEntry(row({ newValue: null }), COPY)).toContain("¥38,453 삭제");
  });

  it("퍼센트로 바꿨으면 그렇게 남는다", () => {
    const text = describeHistoryEntry(row({ mode: "percent", percent: 10 }), COPY);
    expect(text).toContain("(+10%)");
  });

  it("금액으로 바꿨으면 퍼센트를 붙이지 않는다", () => {
    expect(describeHistoryEntry(row(), COPY)).not.toContain("%");
  });

  it("최소숙박은 「박」으로 읽는다 — 엔화가 아니다", () => {
    const text = describeHistoryEntry(
      row({ field: "min_stay", mode: "min_stay", newValue: 1, oldValue: 2 }),
      COPY,
    );
    expect(text).toContain("2박 → 1박");
    expect(text).not.toContain("¥");
  });

  it("작성자를 모르면 그렇게 적는다 — 빈칸으로 두지 않는다", () => {
    expect(describeHistoryEntry(row({ by: null }), COPY)).toContain("(알 수 없음)");
  });
});

describe("describeCellHistory", () => {
  it("여러 줄을 잇고, 잘린 만큼 개수를 덧붙인다", () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({ at: `2026-09-${String(10 + i).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const bucket = buildHistoryByCell(rows).get(historyCellKey("201", "2026-10-14"))!;
    const text = describeCellHistory(bucket, COPY);
    expect(text.split("\n")).toHaveLength(HISTORY_PER_CELL + 1);
    expect(text).toContain("외 2건");
  });

  it("다 보여줄 수 있으면 개수 줄이 없다", () => {
    const bucket = buildHistoryByCell([row()]).get(historyCellKey("201", "2026-10-14"))!;
    expect(describeCellHistory(bucket, COPY)).not.toContain("외");
  });
});
