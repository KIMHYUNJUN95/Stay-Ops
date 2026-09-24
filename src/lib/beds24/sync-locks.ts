import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditSignal } from "@/lib/beds24/calendar-client";
import type { Database } from "@/types/database";

/**
 * Beds24 호출 조율 — 락과 쿨다운.
 *
 * 표: `supabase/migrations/202609240002_beds24_sync_locks.sql`
 * 원본: STAY ARI Manager `functions/index.js` — `acquirePriceJobExecutionLock`,
 *       `acquirePriceSyncLock`, `getBeds24ApiGuardState`, `activateBeds24ApiGuard`
 *
 * 서버리스라 **함수가 중간에 사라지는 일이 정상 범주다.** 그래서 모든 락에 만료가 있고,
 * 만료된 행은 없는 것으로 본다 — 지우지 않아도 된다.
 */

/** 쓰기 작업과 요금 동기화가 다투지 않게 하는 락. */
export const PRICE_JOB_LOCK = "price_job_worker";
/** 요금 동기화가 잡는 락. 쓰기 작업이 도는 사이 옛 값으로 덮지 않게 한다. */
export const RATES_SYNC_LOCK = "rates_sync";
/** 락이 아니라 **쉬는 시각**이다. `expires_at` 까지는 Beds24 를 부르지 않는다. */
export const API_COOLDOWN = "api_cooldown";

/**
 * 쓰기 작업 락의 수명.
 *
 * 저쪽은 5분이었다가 사고를 겪고 15분으로 올렸다 — *"rate limit 백오프 + 검증 재시도로
 * 6분 넘게 도는 job의 락이 만료되어 두 번째 job이 같은 roomId에 동시에 POST하고, 캐시를
 * read-modify-write로 덮어썼다."* 멈춘 작업 회수 임계값과 같은 값으로 맞춘다.
 */
export const PRICE_JOB_LOCK_TTL_MS = 15 * 60 * 1000;
/** 요금 동기화 한 바퀴는 실측 30초. 넉넉히 잡되 크론 주기(15분)보다는 짧게 둔다. */
export const RATES_SYNC_LOCK_TTL_MS = 5 * 60 * 1000;

const MIN_COOLDOWN_SEC = 15;
const DEFAULT_COOLDOWN_SEC = 60;
const MAX_COOLDOWN_SEC = 300;

/**
 * 쉴 시간을 정한다 — **순수 함수**.
 *
 * Beds24 가 알려준 리셋 시각에 2초를 더한다(시계가 다르다). 알려주지 않으면 기본값.
 * 위아래로 가둔다 — 너무 짧으면 바로 또 맞고, 너무 길면 그동안 아무것도 못 한다.
 */
export function resolveCooldownSeconds(
  resetInSec: number | null,
  fallbackSec = DEFAULT_COOLDOWN_SEC,
): number {
  const base = resetInSec !== null && resetInSec > 0 ? resetInSec + 2 : fallbackSec;
  return Math.min(Math.max(base, MIN_COOLDOWN_SEC), MAX_COOLDOWN_SEC);
}

/** 이 응답 뒤에 쉬어야 하는가. 크레딧이 바닥나기 **전에** 멈추는 것이 요점이다. */
export function shouldCooldownForCredit(credit: CreditSignal, threshold = 10): boolean {
  return credit.remaining !== null && credit.remaining < threshold;
}

type Client = SupabaseClient<Database>;

/**
 * 락을 잡는다. 만료됐거나 없으면 내 것이 된다.
 *
 * 경쟁은 **DB 가 판정한다** — `expires_at > now()` 인 행이 있으면 upsert 가 막히도록
 * 조건부 갱신을 쓴다. 두 인스턴스가 동시에 시도해도 하나만 지나간다.
 */
export async function acquireBeds24Lock(
  supabase: Client,
  name: string,
  lockedBy: string,
  ttlMs: number,
): Promise<{ acquired: boolean; lockId: string | null }> {
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  // 아직 살아 있는 락이 있으면 비켜난다.
  const existing = await supabase
    .from("beds24_sync_locks")
    .select("name, expires_at")
    .eq("name", name)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (existing.error) {
    console.error("[beds24/lock] read failed", { error: existing.error, name });
    return { acquired: false, lockId: null };
  }
  if (existing.data) return { acquired: false, lockId: null };

  const claimed = await supabase
    .from("beds24_sync_locks")
    .upsert(
      {
        expires_at: expiresAt,
        locked_at: nowIso,
        locked_by: lockedBy,
        metadata: { lockId },
        name,
        updated_at: nowIso,
      },
      { onConflict: "name" },
    )
    .select("metadata")
    .single();
  if (claimed.error) {
    console.error("[beds24/lock] claim failed", { error: claimed.error, name });
    return { acquired: false, lockId: null };
  }
  // 같은 순간 둘이 upsert 하면 나중 것이 이긴다. **내 lockId 가 남았을 때만 내 락이다.**
  const stored = (claimed.data as { metadata: { lockId?: string } | null }).metadata;
  if (stored?.lockId !== lockId) return { acquired: false, lockId: null };
  return { acquired: true, lockId };
}

/**
 * 락을 놓는다 — **내 것일 때만**.
 *
 * 저쪽 주석: *"예전에는 소유 여부를 보지 않고 무조건 삭제해서, TTL 만료로 락을 뺏긴 job이
 * 뒤늦게 끝나며 후속 job의 락까지 지워버렸다."*
 */
export async function releaseBeds24Lock(
  supabase: Client,
  name: string,
  lockId: string | null,
): Promise<void> {
  if (!lockId) return;
  const current = await supabase
    .from("beds24_sync_locks")
    .select("metadata")
    .eq("name", name)
    .maybeSingle();
  const stored = (current.data as { metadata: { lockId?: string } | null } | null)?.metadata;
  if (stored?.lockId && stored.lockId !== lockId) {
    console.warn("[beds24/lock] release skipped — 소유자가 바뀌었다", { name });
    return;
  }
  // 지우지 않고 만료시킨다 — 누가 언제 잡았었는지가 진단에 쓸모 있다.
  await supabase
    .from("beds24_sync_locks")
    .update({ expires_at: new Date().toISOString() })
    .eq("name", name);
}

export type CooldownState = { active: boolean; remainingSec: number; reason: string | null };

/** 지금 Beds24 를 불러도 되는가. */
export async function getBeds24Cooldown(supabase: Client): Promise<CooldownState> {
  const result = await supabase
    .from("beds24_sync_locks")
    .select("expires_at, reason")
    .eq("name", API_COOLDOWN)
    .maybeSingle();
  const row = result.data as { expires_at: string; reason: string | null } | null;
  if (!row) return { active: false, reason: null, remainingSec: 0 };
  const remainingMs = new Date(row.expires_at).getTime() - Date.now();
  return {
    active: remainingMs > 0,
    reason: row.reason,
    remainingSec: remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0,
  };
}

/**
 * 쿨다운을 켠다.
 *
 * **쓰기만 쉬면 안 된다** — 크레딧은 계정 단위라 요금 동기화 크론이 계속 긁으면 한도가
 * 안 풀린다. 그래서 이 상태를 모든 Beds24 경로가 먼저 본다.
 */
export async function activateBeds24Cooldown(
  supabase: Client,
  args: { reason: "rate_limit" | "low_credit"; resetInSec: number | null; fallbackSec?: number },
): Promise<number> {
  const cooldownSec = resolveCooldownSeconds(args.resetInSec, args.fallbackSec);
  const nowIso = new Date().toISOString();
  await supabase.from("beds24_sync_locks").upsert(
    {
      expires_at: new Date(Date.now() + cooldownSec * 1000).toISOString(),
      locked_at: nowIso,
      locked_by: "beds24-api",
      name: API_COOLDOWN,
      reason: args.reason,
      updated_at: nowIso,
    },
    { onConflict: "name" },
  );
  console.warn(`[beds24/cooldown] ${args.reason} → ${cooldownSec}초 쉰다`);
  return cooldownSec;
}
