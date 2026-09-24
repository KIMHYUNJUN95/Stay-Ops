import type { SupabaseClient } from "@supabase/supabase-js";
import { hasPendingPriceJobs } from "@/lib/beds24/price-job-queue";
import { syncBeds24RoomRates } from "@/lib/beds24/room-rates-sync";
import {
  acquireBeds24Lock,
  getBeds24Cooldown,
  RATES_SYNC_LOCK,
  releaseBeds24Lock,
} from "@/lib/beds24/sync-locks";
import type { Database } from "@/types/database";

/**
 * **보고 있는 창이 낡았으면 그 자리에서 당겨 온다.**
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「요금이 우리 표로 들어오는 경로」
 *
 * ## 왜 필요한가
 *
 * 저쪽은 Cloud Scheduler 로 **15분마다 정확히** 돈다. 우리 주기 동기화는 GitHub Actions 라
 * 같은 15분을 걸어 뒀는데 실제 간격이 **3~5시간**이다(2026-09-24 실측:
 * `06:14 → 01:17 → 22:53 → 19:52`). 그 사이 Beds24 화면에서 가격을 바꾸면 우리 화면은
 * 몇 시간째 옛 값을 보여주고, **그 값을 기준으로 퍼센트 조정을 하게 된다.**
 *
 * 그래서 화면을 열 때 낡았으면 채운다. 응답을 보낸 **뒤에** 돌므로(`after()`) 화면 속도는
 * 그대로다 — 이번 화면은 여전히 옛 값이지만 다음 화면은 맞는다. 그동안 얼마나 오래된
 * 값인지는 화면에 적어 둔다.
 *
 * ## 전부 당기지 않는다
 *
 * 보이는 창 + 고른 건물만. 9건물 × 12개월은 30초가 걸리고 Beds24 크레딧도 그만큼 쓴다 —
 * 화면을 열 때마다 할 일이 아니다.
 */

/** 이보다 오래됐으면 낡은 것으로 본다. 저쪽 주기(15분)와 같은 값. */
export const RATES_STALE_MS = 15 * 60 * 1000;

export function isRatesStale(syncedAt: string | null, now = Date.now()): boolean {
  // 아예 없으면 **낡은 게 아니라 없는 것**이다. 그래도 당겨 와야 한다.
  if (!syncedAt) return true;
  const at = new Date(syncedAt).getTime();
  if (!Number.isFinite(at)) return true;
  return now - at > RATES_STALE_MS;
}

export type RatesRefreshOutcome =
  | "refreshed"
  | "fresh"
  | "cooldown"
  | "yielded_to_price_job"
  | "lock_busy"
  | "failed";

/**
 * 낡았으면 채운다. **던지지 않는다** — 화면을 그리는 길에 얹히는 일이라 실패가 화면을
 * 망가뜨리면 안 된다.
 */
export async function refreshOpsCalendarRates(args: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  syncedAt: string | null;
  /** 보이는 창. 양끝 포함으로 Beds24 에 넘긴다. */
  window: { from: string; to: string };
  /** 고른 건물의 Beds24 `propertyId`. 없으면 전 건물. */
  externalPropertyIds?: string[];
}): Promise<RatesRefreshOutcome> {
  if (!isRatesStale(args.syncedAt)) return "fresh";

  let lockId: string | null = null;
  try {
    // 크레딧은 계정 단위다 — 쓰기가 429 를 맞았으면 읽기도 쉬어야 한도가 풀린다.
    const cooldown = await getBeds24Cooldown(args.supabase);
    if (cooldown.active) return "cooldown";

    // 쓰기 작업 중이면 물러난다. 지금 쓴 값을 옛 값으로 덮으면 「되돌아갔다」로 보인다.
    if (await hasPendingPriceJobs(args.supabase)) return "yielded_to_price_job";

    // 같은 화면을 여럿이 동시에 열어도 한 번만 당긴다.
    const lock = await acquireBeds24Lock(
      args.supabase,
      RATES_SYNC_LOCK,
      "ops-calendar-open",
      2 * 60 * 1000,
    );
    if (!lock.acquired) return "lock_busy";
    lockId = lock.lockId;

    const result = await syncBeds24RoomRates(args.organizationId, args.supabase, args.window, {
      externalPropertyIds: args.externalPropertyIds,
    });
    if (result.skipped.length > 0) {
      console.warn("[ops-calendar] 요금 당겨오기 일부 실패", { skipped: result.skipped });
    }
    return "refreshed";
  } catch (error) {
    console.error("[ops-calendar] 요금 당겨오기 실패", error);
    return "failed";
  } finally {
    if (lockId) await releaseBeds24Lock(args.supabase, RATES_SYNC_LOCK, lockId);
  }
}
