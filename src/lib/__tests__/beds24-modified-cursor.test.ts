import { describe, expect, it } from "vitest";

/**
 * 정합성 커서의 겹침 규칙 (2026-09-16).
 *
 * 예약 정합성이 **날짜 창**에서 **「지난번 이후 바뀐 것만」**(`modifiedFrom`)으로 바뀌었다.
 * 창 방식은 창 밖 변경을 영원히 못 봤다 — 2026-09-16 기준 창 밖 예약이 223건 있었고, 그중
 * 크리스마스 예약 3건이 실제로 빠져 있었다.
 *
 * 커서는 **뒤로 물려서** 묻는다. 기준 시각은 우리 서버가 찍고 `modifiedTime` 은 Beds24 가 찍어
 * 두 시계가 다르고, 수집하는 **중에** 수정된 예약도 있기 때문이다. 겹치면 같은 예약을 한두 번 더
 * 읽을 뿐이고(유니크 키 upsert 라 안전하다), 놓치는 것보다 낫다.
 */
const OVERLAP_MINUTES = 30;

/** `reservations-backfill.ts` 의 `cursorWithOverlap` 과 같은 규칙. */
function cursorWithOverlap(cursorIso: string): string {
  const base = new Date(cursorIso).getTime();
  return new Date(base - OVERLAP_MINUTES * 60_000).toISOString().slice(0, 19);
}

describe("정합성 커서", () => {
  it("겹침만큼 뒤로 물린다", () => {
    expect(cursorWithOverlap("2026-09-16T02:00:00.000Z")).toBe("2026-09-16T01:30:00");
  });

  it("Beds24 가 받는 형식이다 — 밀리초·Z 가 없다", () => {
    // `2026-09-16T01:30:00.000Z` 를 보내면 거절당한다.
    const value = cursorWithOverlap("2026-09-16T02:00:00.000Z");
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(value).not.toContain("Z");
    expect(value).not.toContain(".");
  });

  it("시·일 경계를 넘어도 어긋나지 않는다", () => {
    expect(cursorWithOverlap("2026-09-16T00:10:00.000Z")).toBe("2026-09-15T23:40:00");
    expect(cursorWithOverlap("2026-01-01T00:00:00.000Z")).toBe("2025-12-31T23:30:00");
  });

  it("겹침은 앞으로 가지 않는다 — 항상 과거 쪽이다", () => {
    // 커서가 미래로 가면 그 사이 변경을 통째로 건너뛴다. 방향이 뒤집히면 안 된다.
    const cursor = "2026-09-16T02:00:00.000Z";
    expect(new Date(`${cursorWithOverlap(cursor)}Z`).getTime()).toBeLessThan(
      new Date(cursor).getTime(),
    );
  });
});
