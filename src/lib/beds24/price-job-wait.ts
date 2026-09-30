/**
 * 쿨다운 때문에 `queued` 로 되돌린 가격·최소숙박 작업의 **대기 사유** — 순수하다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「한도 대기는 이유와 재전송 시각을 보여 준다」
 *
 * 새 열을 만들지 않고 `beds24_price_jobs.error` 에 코드로 적는다: `cooldown_rate_limit@<ISO>` ·
 * `cooldown_low_credit@<ISO>`. `@` 뒤가 쿨다운이 풀리는 시각(= 자동 재전송 예정)이다.
 * `queued` 인 작업의 `error` 는 원래 비어 있어서(실패 요약은 끝난 작업에만 적힌다) 겹치지 않는다.
 * 워커가 다시 집을 때(`claimNextJob`) 지우고, 끝나면 완료 기록이 덮는다.
 */

export type PriceJobWaitReason = "rate_limit" | "low_credit";

const PREFIX = "cooldown_";

export function encodePriceJobWait(reason: PriceJobWaitReason, retryAt: string | null): string {
  return retryAt ? `${PREFIX}${reason}@${retryAt}` : `${PREFIX}${reason}`;
}

/** `error` 가 대기 사유 코드면 풀어서, 아니면 `null`. */
export function parsePriceJobWait(
  error: string | null | undefined,
): { reason: PriceJobWaitReason; retryAt: string | null } | null {
  if (!error || !error.startsWith(PREFIX)) return null;
  const body = error.slice(PREFIX.length);
  const cut = body.indexOf("@");
  const reason = cut >= 0 ? body.slice(0, cut) : body;
  if (reason !== "rate_limit" && reason !== "low_credit") return null;
  const rawAt = cut >= 0 ? body.slice(cut + 1) : "";
  const retryAt = rawAt && !Number.isNaN(new Date(rawAt).getTime()) ? rawAt : null;
  return { reason, retryAt };
}

/** 쿨다운 사유(`beds24_sync_locks.reason`) → 대기 사유. 모르는 값은 요청 한도로 본다. */
export function toPriceJobWaitReason(reason: string | null | undefined): PriceJobWaitReason {
  return reason === "low_credit" ? "low_credit" : "rate_limit";
}
