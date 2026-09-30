import type { SupabaseClient } from "@supabase/supabase-js";
import { getBeds24Cooldown } from "@/lib/beds24/sync-locks";
import { countStalledJobs, SEND_STALL_MINUTES } from "@/lib/ops-history";
import type { Database } from "@/types/database";

/** 멈춘 작업을 세려고 읽는 최대 행 — 평소엔 0 이다. 넘치면 이만큼만 센다(숫자 배지라 충분하다). */
const STALLED_SCAN_LIMIT = 200;

/**
 * 판매 캘린더 「이력」 버튼의 빨간 숫자 — 최근 7일 Beds24 전송 실패(가격·최소숙박 작업 + 차단)와
 * 멈춘 대기 작업. 실패는 알림 없이 조용히 쌓이므로 버튼이 먼저 말해야 한다.
 *
 * **Beds24 한도 대기(쿨다운)는 세지 않는다** — 멈춘 게 아니라 알고 기다리는 것이고 1분 틱이 풀리는 대로
 * 다시 보낸다(`resolveSendWait`). 그래서 멈춘 후보를 읽어 JS 로 거른다.
 *
 * 계약: `src/lib/ops-history.ts` · `docs/product/33-calendar-write-features.md` → 「이력 · 전송 로그」
 * 못 세면 0 — 화면을 그리는 길이라 실패가 화면을 망가뜨리면 안 된다.
 */
export async function countOpsHistoryAlerts(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  now = Date.now(),
): Promise<number> {
  const since = new Date(now - 7 * 86_400_000).toISOString();
  const stalledBefore = new Date(now - SEND_STALL_MINUTES * 60_000).toISOString();
  const [failedJobs, stalledJobs, failedBlocks, cooldown] = await Promise.all([
    supabase
      .from("beds24_price_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["failed", "partial_failed"])
      .gte("created_at", since),
    supabase
      .from("beds24_price_jobs")
      .select("status, error")
      .eq("organization_id", organizationId)
      .in("status", ["queued", "processing"])
      .lt("created_at", stalledBefore)
      .limit(STALLED_SCAN_LIMIT),
    supabase
      .from("beds24_block_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "failed")
      .gte("created_at", since),
    getBeds24Cooldown(supabase).catch(() => null),
  ]);
  const stalled = countStalledJobs(
    (stalledJobs.data ?? []) as Array<{ status: string; error: string | null }>,
    cooldown,
    now,
  );
  return (failedJobs.count ?? 0) + stalled + (failedBlocks.count ?? 0);
}
