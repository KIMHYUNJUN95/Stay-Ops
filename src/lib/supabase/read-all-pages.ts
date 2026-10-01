/**
 * PostgREST 는 **한 번에 1,000행까지만** 준다(Supabase `db-max-rows` 기본값). 초과분은
 * 오류가 아니라 **조용히 잘린다** — 화면은 그대로 그려지고 데이터만 사라진다.
 *
 * 2026-09-17 에 판매 캘린더에서 실제로 터졌다: 30일 창에 요금이 2,730행 필요한데 1,000행만
 * 와서 **9/28 부터 가격이 통째로 비어 보였다.** 값이 없는 칸은 「안 판다」로 그리므로,
 * 잘린 것이 「팔지 않는 날」처럼 보인다 — 화면만 보고는 구별할 수 없다.
 *
 * 예약도 같은 벽에 있다. 예약 캘린더(`/admin/calendar` · `/mobile/calendar`)는 2026-10-01 까지
 * 한 번에 읽어서, 두 달 창이 1,000건을 넘는 순간 **예약 막대가 조용히 사라질** 상태였다(당시 771건).
 * 그건 이미 팔린 방을 비었다고 보여준다는 뜻이다 — 그래서 이 함수를 공용으로 뺐다.
 *
 * **호출부는 반드시 유일한 정렬 키(`id` 등)까지 걸어야 한다.** 정렬이 같은 행끼리 순서가 페이지마다
 * 바뀌면 경계에서 한 행이 빠지거나 두 번 온다.
 */
export const SUPABASE_PAGE_SIZE = 1000;

/** 한 페이지가 꽉 차면 다음 장을 더 읽는다. 덜 차면 그게 마지막이다. */
export async function readAllPages<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += SUPABASE_PAGE_SIZE) {
    const page = await build(offset, offset + SUPABASE_PAGE_SIZE - 1);
    if (page.error) return { data: rows, error: page.error };
    const batch = page.data ?? [];
    rows.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) return { data: rows, error: null };
  }
}
