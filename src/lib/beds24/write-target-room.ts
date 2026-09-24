import { isActiveUnitMinStay } from "@/lib/ops-gap-detection";

/**
 * **어느 Beds24 유닛에 쓰는가.**
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「쓰기 대상 유닛」
 * 원본: STAY ARI Manager `functions/index.js` —
 *   *"Price writes must target the source price row, while inventory/min-stay writes
 *   must continue to target the active roomId."*
 *
 * **순수 모듈이다.** 여기서 틀리면 엉뚱한 유닛에 값이 들어가는데, **Beds24 는 그래도
 * `success: true` 를 돌려준다.** 화면에는 「적용됨」이라고 뜨고 실제 채널 가격은 그대로다.
 * 눈으로 못 잡으므로 테스트로 고정한다.
 *
 * ## 대상이 둘로 갈린다
 *
 * | 쓰는 것 | 대상 | 왜 |
 * | --- | --- | --- |
 * | 가격 `p1·p2·p3` | **가격 소스 유닛**(메인) | 가격은 연결로 퍼진다. 소스가 아닌 곳에 쓰면 반영되지 않는다 |
 * | 최소숙박 · 재고 | **그 날짜에 운영 중인 유닛** | 재고는 유닛마다 따로다. 안 파는 유닛의 minStay 를 바꿔도 아무 일도 안 일어난다 |
 *
 * 오쿠보C 2026-10-01 을 예로 들면 — 가격은 450096(메인)에, 최소숙박은 648399(그날 파는
 * 유닛)에 써야 한다. **둘이 다른 유닛이다.**
 */

export type WriteTargetUnit = {
  /** 우리 `rooms.id`. */
  id: string;
  /** Beds24 roomId. */
  externalRoomId: string;
  /** 가격을 써야 할 다른 유닛의 Beds24 roomId. 자기가 소스면 `null`. */
  externalPriceSourceRoomId: string | null;
  /** 그 날짜의 `min_stay`. 운영 중인지 판단하는 유일한 근거다. */
  minStay: number | null;
};

/**
 * 가격을 쓸 유닛의 Beds24 roomId.
 *
 * 운영 중인지와 **무관하다** — 비활성 유닛에 걸린 가격도 소스에 써야 연결로 퍼진다.
 * 오쿠보C 10/1 이후 파는 유닛은 648399 지만 가격은 450096 에 쓴다.
 *
 * 여러 유닛이 같은 소스를 가리키면 **한 번만** 쓴다(중복 제거). 같은 값을 두 번 보내면
 * 크레딧만 두 배로 쓴다.
 */
export function resolvePriceWriteRoomIds(units: WriteTargetUnit[]): string[] {
  const targets = new Set<string>();
  for (const unit of units) {
    targets.add(unit.externalPriceSourceRoomId ?? unit.externalRoomId);
  }
  return [...targets];
}

/**
 * 최소숙박·재고를 쓸 유닛의 Beds24 roomId — **그 날짜에 운영 중인 유닛**.
 *
 * 운영 중 = `1 ≤ minStay < 50`. 하나도 없으면 `null` 이고, 그 날짜는 **건너뛴다** —
 * 안 파는 날의 최소숙박을 바꾸는 것은 의미가 없고, 아무 유닛에나 쓰면 나중에 그 유닛이
 * 다시 팔릴 때 엉뚱한 값이 살아난다.
 *
 * 둘 이상이 운영 중이면 `preferredExternalRoomId`(데이터로 지정한 메인)를 먼저 보고,
 * 없으면 목록 순서를 따른다 — 저쪽 `getActiveRoomId` 의 가부키초 803호·아라키초A 501호
 * 예외가 이 자리다.
 */
export function resolveMinStayWriteRoomId(
  units: WriteTargetUnit[],
  preferredExternalRoomId?: string | null,
): string | null {
  const active = units.filter((unit) => isActiveUnitMinStay(unit.minStay));
  if (active.length === 0) return null;
  if (preferredExternalRoomId) {
    const preferred = active.find(
      (unit) => unit.externalRoomId === String(preferredExternalRoomId),
    );
    if (preferred) return preferred.externalRoomId;
  }
  return active[0].externalRoomId;
}

/**
 * 쓴 값을 다시 읽어 대조할 때 **어떤 기준으로 읽어야 하는가.**
 *
 * 소스 유닛은 직접 설정값만 봐야 하고(`includeLinkedPrices: false`), 연결된 유닛은 링크로
 * 전파된 값까지 봐야 한다(`true`). 기준이 다르므로 한 번의 조회로 합칠 수 없다 —
 * 저쪽도 두 번 나눠 읽는다.
 *
 * 연결 유닛이 안 맞는 것은 **작업 실패가 아니다.** 소스 쓰기는 성공했고 Beds24 의 링크
 * 전파가 아직 안 된 것뿐일 수 있다. 크게 로그만 남기고, **그 유닛의 캐시는 건드리지
 * 않는다** — 다음 동기화가 실제 값으로 채우게 둔다.
 */
export function splitVerificationTargets(
  units: WriteTargetUnit[],
): { sourceRoomIds: string[]; linkedRoomIds: string[] } {
  const sourceRoomIds = new Set<string>();
  const linkedRoomIds = new Set<string>();
  for (const unit of units) {
    if (unit.externalPriceSourceRoomId) {
      sourceRoomIds.add(unit.externalPriceSourceRoomId);
      linkedRoomIds.add(unit.externalRoomId);
    } else {
      sourceRoomIds.add(unit.externalRoomId);
    }
  }
  // 소스로 쓰이는 유닛이 연결 목록에도 있으면 소스 기준이 이긴다.
  for (const roomId of sourceRoomIds) linkedRoomIds.delete(roomId);
  return { sourceRoomIds: [...sourceRoomIds], linkedRoomIds: [...linkedRoomIds] };
}
