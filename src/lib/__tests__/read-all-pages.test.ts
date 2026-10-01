import { describe, expect, it } from "vitest";

import { readAllPages, SUPABASE_PAGE_SIZE } from "@/lib/supabase/read-all-pages";

/**
 * 1,000행 상한 페이지 읽기 (2026-10-01 공용화).
 *
 * 예약 캘린더가 한 번에 읽어 1,000건을 넘으면 예약이 조용히 빠질 상태였다. 판매 캘린더가 쓰던 함수를
 * 공용으로 빼면서 「끝까지 읽는다 · 오류는 넘긴다」를 고정한다.
 */
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, index) => ({ id: index }));
  const calls: Array<[number, number]> = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { build, calls };
}

describe("readAllPages", () => {
  it("1,000행을 넘으면 다음 페이지까지 읽는다", async () => {
    const table = fakeTable(SUPABASE_PAGE_SIZE * 2 + 5);
    const result = await readAllPages(table.build);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(SUPABASE_PAGE_SIZE * 2 + 5);
    expect(table.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("정확히 1,000행이면 빈 페이지를 한 번 더 확인하고 멈춘다", async () => {
    const table = fakeTable(SUPABASE_PAGE_SIZE);
    const result = await readAllPages(table.build);
    expect(result.data).toHaveLength(SUPABASE_PAGE_SIZE);
    expect(table.calls).toHaveLength(2);
  });

  it("오류가 나면 그 자리에서 멈추고 오류를 돌려준다", async () => {
    let call = 0;
    const result = await readAllPages<{ id: number }>(() => {
      call += 1;
      return Promise.resolve(
        call === 1
          ? { data: Array.from({ length: SUPABASE_PAGE_SIZE }, (_, id) => ({ id })), error: null }
          : { data: null, error: { message: "boom" } },
      );
    });
    expect(result.error?.message).toBe("boom");
    expect(result.data).toHaveLength(SUPABASE_PAGE_SIZE);
  });
});
