import { describe, expect, it } from "vitest";
import { opsUrgentVacantCells } from "@/lib/ops-urgent-vacant";

const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];

describe("opsUrgentVacantCells", () => {
  it("오늘부터 3일 · 안 팔림 · 안 막힘 · 요금 있음만", () => {
    const cells = opsUrgentVacantCells({
      dates,
      hasPrice: (_, date) => date !== "2026-10-03",
      isBlocked: () => false,
      isSold: (_, date) => date === "2026-10-02",
      roomKeys: ["아라키초A::201"],
      today: "2026-10-01",
    });
    expect(cells.map((cell) => cell.date)).toEqual(["2026-10-01"]);
  });

  it("사노는 뺀다", () => {
    const cells = opsUrgentVacantCells({
      dates,
      hasPrice: () => true,
      isBlocked: () => false,
      isSold: () => false,
      roomKeys: ["사노::1", "가부키초::502"],
      today: "2026-10-01",
    });
    expect(new Set(cells.map((cell) => cell.roomKey))).toEqual(new Set(["가부키초::502"]));
  });

  it("보는 기간에 오늘이 없으면 비어 있다", () => {
    expect(
      opsUrgentVacantCells({
        dates,
        hasPrice: () => true,
        isBlocked: () => false,
        isSold: () => false,
        roomKeys: ["가부키초::502"],
        today: "2026-09-30",
      }),
    ).toEqual([]);
  });
});
