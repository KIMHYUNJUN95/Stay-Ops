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

/**
 * 한 페이지가 꽉 차면 다음 장을 더 읽는다. 덜 차면 그게 마지막이다.
 *
 * `concurrency` 를 주면 첫 장 뒤로 **그만큼 장을 한꺼번에** 요청한다(2026-10-08 — 매출 · 가동률이 예약 1만 2천 행을 1,000행씩
 * 차례로 12번 왕복해 4초 넘게 걸렸다). 순서는 장 번호대로 붙이고, 덜 찬 장(또는 빈 장)이 나오면 거기서 끝낸다 — 끝을 넘어 미리
 * 요청한 장은 빈 결과라 버린다. 기본은 1(예전과 같다).
 */
export async function readAllPages<Row>(
  build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  options?: { concurrency?: number },
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const concurrency = Math.max(1, Math.floor(options?.concurrency ?? 1));
  const rows: Row[] = [];
  const first = await build(0, SUPABASE_PAGE_SIZE - 1);
  if (first.error) return { data: rows, error: first.error };
  rows.push(...(first.data ?? []));
  if ((first.data ?? []).length < SUPABASE_PAGE_SIZE) return { data: rows, error: null };
  for (let page = 1; ; page += concurrency) {
    const batch = await Promise.all(
      Array.from({ length: concurrency }, (_, index) => {
        const offset = (page + index) * SUPABASE_PAGE_SIZE;
        return build(offset, offset + SUPABASE_PAGE_SIZE - 1);
      }),
    );
    for (const result of batch) {
      if (result.error) return { data: rows, error: result.error };
      const data = result.data ?? [];
      rows.push(...data);
      if (data.length < SUPABASE_PAGE_SIZE) return { data: rows, error: null };
    }
  }
}
