import type { SupabaseClient } from "@supabase/supabase-js";
import { runNextPriceJob } from "@/lib/beds24/price-job-worker";
import type { Database } from "@/types/database";

/**
 * 가격·최소숙박 작업 워커를 깨운다 — **응답 뒤에**(`after()`) 부른다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「이력 · 전송 로그」
 *
 * 부르는 곳이 셋이다.
 * - 작업을 넣은 직후(판매 캘린더 서버 액션) — 사람이 방금 누른 것은 몇 초 안에 나가야 한다.
 * - **판매 캘린더를 열 때 대기 작업이 있으면**(2026-09-29) — 접수 직후 깨우기가 실패하면
 *   (서버 재시작 · 개발 서버 등) 작업이 백업 크론(실측 몇 시간 간격)까지 그대로 앉아 있었다.
 *   실제로 06:28 에 넣은 최소숙박 작업이 22분째 대기였다.
 * - 전송 로그의 「지금 보내기」.
 *
 * 큐가 빌 때까지(시간 예산 안에서) 이어서 돈다. 실패해도 조용히 넘긴다 — 크론이 안전망이다.
 */
const KICK_MAX_JOBS = 5;
const KICK_BUDGET_MS = 50_000;

export async function kickPriceJobWorker(supabase: SupabaseClient<Database>): Promise<void> {
  const startedAt = Date.now();
  try {
    for (let index = 0; index < KICK_MAX_JOBS; index += 1) {
      if (Date.now() - startedAt > KICK_BUDGET_MS) break;
      const outcome = await runNextPriceJob(supabase);
      // 비었거나, 쿨다운이거나, 남이 돌고 있으면(그쪽이 이어서 처리한다) 멈춘다. 쿨다운에 걸려
      // 다시 대기로 돌린 작업(`requeued`)도 — 지금 다시 집어도 쿨다운이라 못 보낸다.
      if (!outcome.ran || outcome.status === "requeued") break;
    }
  } catch (error) {
    console.error("[beds24/price-job] worker kick failed; cron will pick it up", error);
  }
}
