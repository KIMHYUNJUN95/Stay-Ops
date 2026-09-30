/**
 * Beds24 틱이 이번에 무엇을 할지 — **순수 함수**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「쿨다운이 풀리면 1분 안에 이어서 보낸다 ·
 * 미뤄 둔 웹훅 재조회」
 *
 * DB 쪽 `beds24_tick_if_needed()` (`supabase/migrations/202609300004_beds24_tick_cron.sql`) 가 같은
 * 판단으로 라우트를 부를지 정한다. 한쪽을 바꾸면 다른 쪽도 바꾼다.
 *
 * 가격 작업이 **먼저**다. 작업이 남아 있는 동안 건물을 다시 읽으면 Beds24 에서 옛 값을 읽어 오고
 * 크레딧도 작업과 다툰다 — 웹훅 재조회가 가격 작업 대기 중에 물러나는 것과 같은 이유다.
 */

/** 틱이 한 건물 재조회를 이 횟수만큼 실패하면 더 부르지 않는다. 새 웹훅이 오면 0 으로 돌아간다. */
export const DEFERRED_REFRESH_MAX_ATTEMPTS = 5;

/** 틱끼리 겹치지 않게 하는 락(`beds24_sync_locks`). SQL 이 이 이름을 보고 「busy」로 건너뛴다. */
export const BEDS24_TICK_LOCK = "beds24_tick";

export type Beds24TickInput = {
  cooldownActive: boolean;
  pendingPriceJobs: boolean;
  /** 재시도 한도 안의 미뤄 둔 재조회 수. */
  deferredRefreshes: number;
};

export type Beds24TickAction = "cooldown" | "run_price_jobs" | "refresh_deferred" | "idle";

export function decideBeds24Tick(input: Beds24TickInput): Beds24TickAction {
  if (input.cooldownActive) return "cooldown";
  if (input.pendingPriceJobs) return "run_price_jobs";
  if (input.deferredRefreshes > 0) return "refresh_deferred";
  return "idle";
}
