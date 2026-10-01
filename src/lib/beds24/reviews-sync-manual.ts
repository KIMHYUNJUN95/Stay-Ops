import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * 외부 리뷰 **「지금 가져오기」** — 상태 기록 (2026-10-02, 사용자 요청).
 *
 * 도메인 계약: `docs/product/25-complaint-workflow.md` → 「지금 가져오기 (수동 수집)」
 *
 * 리뷰는 웹훅이 없어 하루 한 번(08:05 도쿄, GitHub Actions — 실제로는 몇 시간 늦게도 돈다) 가져온다.
 * 보고 싶을 때 누른 시점 기준으로 가져오는 버튼을 위해 두 가지를 `beds24_sync_locks` 에 둔다
 * (새 표를 만들지 않는다 — `api_cooldown` 처럼 이름으로 구분하는 시각 기록이다):
 *
 * - `reviews_sync_run:<조직>` — **도는 중** 잠금. 두 사람이 동시에 눌러도 한 번만 돈다. 한 바퀴는
 *   조각(약 12곳 · 30초)을 화면이 이어 부르는 방식이라 잠금이 여러 호출에 걸친다 — 만료는 넉넉히.
 * - `reviews_sync_done:<조직>` — **마지막으로 끝난 시각**(`locked_at`)과 **다시 누를 수 있는 시각**
 *   (`expires_at` = 끝난 뒤 10분). 아침 정기 수집도 여기에 남긴다 — 그래야 「마지막 수집」이 정확하고,
 *   방금 정기 수집이 끝났는데 또 70곳을 부르는 일이 없다.
 */

type Client = SupabaseClient<Database>;

/** 한 번 끝난 뒤 다시 누를 수 있기까지. 한 바퀴가 Beds24 크레딧을 ~70번 쓴다. */
export const REVIEW_SYNC_COOLDOWN_MS = 10 * 60 * 1000;
/** 도는 중 잠금의 수명. 한 바퀴 실측 1~2분 — 화면이 중간에 닫혀도 이 뒤엔 다시 누를 수 있다. */
export const REVIEW_SYNC_RUN_TTL_MS = 5 * 60 * 1000;

export const reviewSyncRunLockName = (organizationId: string) => `reviews_sync_run:${organizationId}`;
const doneName = (organizationId: string) => `reviews_sync_done:${organizationId}`;

export type ReviewSyncStatus = {
  /** 마지막으로 끝난 시각(ISO). 기록이 없으면 `null`. */
  lastSyncedAt: string | null;
  /** 이 시각 전까지는 다시 누를 수 없다(ISO). 지금 누를 수 있으면 `null`. */
  availableAt: string | null;
  /** 누가 지금 돌리고 있다. */
  running: boolean;
};

export async function getReviewSyncStatus(supabase: Client, organizationId: string): Promise<ReviewSyncStatus> {
  const result = await supabase
    .from("beds24_sync_locks")
    .select("name, locked_at, expires_at")
    .in("name", [doneName(organizationId), reviewSyncRunLockName(organizationId)]);
  const now = Date.now();
  let lastSyncedAt: string | null = null;
  let availableAt: string | null = null;
  let running = false;
  for (const row of (result.data ?? []) as Array<{ name: string; locked_at: string; expires_at: string }>) {
    const active = new Date(row.expires_at).getTime() > now;
    if (row.name === doneName(organizationId)) {
      lastSyncedAt = row.locked_at;
      if (active) availableAt = row.expires_at;
    } else if (active) {
      running = true;
    }
  }
  return { availableAt, lastSyncedAt, running };
}

/** 한 조직의 수집이 끝났다 — 수동이든 정기든 같은 기록을 남긴다. 실패해도 수집 자체는 끝났으므로 던지지 않는다. */
export async function recordReviewSyncDone(
  supabase: Client,
  args: { organizationId: string; by: "manual" | "schedule"; upserted: number },
): Promise<void> {
  const now = new Date();
  const { error } = await supabase.from("beds24_sync_locks").upsert(
    {
      expires_at: new Date(now.getTime() + REVIEW_SYNC_COOLDOWN_MS).toISOString(),
      locked_at: now.toISOString(),
      locked_by: args.by,
      metadata: { upserted: args.upserted },
      name: doneName(args.organizationId),
      reason: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "name" },
  );
  if (error) console.error("[beds24/reviews-sync] done record failed", { error, organizationId: args.organizationId });
}

/** 도는 중 잠금이 아직 이 실행(`runId`)의 것인가 — 만료됐거나 남이 잡았으면 이어 부르지 않는다. */
export async function ownsReviewSyncRun(supabase: Client, organizationId: string, runId: string): Promise<boolean> {
  const result = await supabase
    .from("beds24_sync_locks")
    .select("expires_at, metadata")
    .eq("name", reviewSyncRunLockName(organizationId))
    .maybeSingle();
  const row = result.data as { expires_at: string; metadata: { lockId?: string } | null } | null;
  if (!row) return false;
  return row.metadata?.lockId === runId && new Date(row.expires_at).getTime() > Date.now();
}

/** 정기 수집과 같은 창 — Booking.com 최근 30일(Airbnb 는 기간 없이 객실당 최대 50건). */
export const REVIEW_SYNC_ROUTINE_SINCE_DAYS = 30;
/**
 * 한 호출이 처리하는 대상 수. 대상 하나가 1.5~2초라 12곳이면 30초 안팎 — Vercel Hobby 60초 상한의 절반.
 * 한 바퀴(약 70곳)는 화면이 이어 부른다(`syncReviewsNowStep`).
 */
export const REVIEW_SYNC_SLICE = 12;
