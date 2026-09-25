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
 * 최소숙박·재고를 쓸 유닛 — **그 날짜에 운영 중인 유닛 전부**.
 *
 * 운영 중 = `1 ≤ minStay < 50`. 하나도 없으면 빈 배열이고, 그 날짜는 **건너뛴다** —
 * 안 파는 날의 최소숙박을 바꾸는 것은 의미가 없고, 아무 유닛에나 쓰면 나중에 그 유닛이
 * 다시 팔릴 때 엉뚱한 값이 살아난다.
 *
 * ## 왜 하나만 고르지 않는가 (2026-09-25 변경)
 *
 * 저쪽은 활성 유닛 **하나**를 골라 거기에만 쓰고, 어느 것을 고를지 헷갈리는 방 둘을
 * 코드에 박아 뒀다(`PREFERRED_DUAL_ROOM_IDS` — 가부키초 803호 · 아라키초A 501호).
 * 그게 필요했던 이유는 **활성이 둘인 날짜가 실제로 있기 때문**이다. 실측:
 *
 * ```
 * 아라키초A·가부키초 듀얼 21개 방   10/01~10/04  4일   ← 유닛 교체 구간
 * 다카다노바바 401호                188일 전부
 * ```
 *
 * 그런데 **하나만 쓰면 화면의 숫자가 안 바뀐다.** 화면은 활성 유닛들의 **가장 짧은**
 * minStay 를 보여주므로(`ops-rate-merge.ts`), 다른 활성 유닛이 더 짧은 값을 들고 있으면
 * 한쪽만 고쳐도 표시가 그대로다 — 「저장했는데 그대로인데?」가 된다. 저쪽이 803호에서
 * 겪은 것이 이것이고, 하드코딩은 그 증상을 방마다 때운 것이다.
 *
 * 그래서 **활성 전부에 쓴다.** 어느 것이 「진짜」인지 고를 필요가 없어지고, 방이 늘거나
 * 유닛이 교체돼도 표를 고칠 일이 없다.
 *
 * ## 잠긴 유닛은 절대 건드리지 않는다
 *
 * Beds24 에 「비활성」 스위치가 따로 없고 **`minStay ≥ 50` 이 곧 잠금**이다. 거기에 `1` 을
 * 쓰면 잠금이 풀려, **일부러 접어둔 listing 이 조용히 다시 열린다.** 접어둔 유닛은 나중에
 * 다시 쓸 수 있는 상태로 남겨 둔 것이라(사용자 확인 2026-09-25) 더더욱 건드리면 안 된다.
 *
 * > 더블부킹은 이 규칙의 이유가 아니다. 실측 결과 듀얼 유닛 47개 중 46개가 **서로 의존**
 * > (`qty 1` · `sumAllBookings` · `includeBookings`)이라 Beds24 가 이미 막는다.
 * > 예외는 가부키초 302호(`452062`, `includeBookings` 없음) 하나인데, 둘이 동시에 팔리는
 * > 날이 0일이라 지금 노출은 없다.
 *
 * ## `preferredExternalRoomId` 는 탈출구다
 *
 * 보통은 비어 있다. 특정 유닛에만 써야 하는 예외가 생기면 그 유닛이 **활성일 때만**
 * 적용된다 — 잠긴 유닛을 지정해도 무시된다.
 */
export function resolveMinStayWriteRoomIds(
  units: WriteTargetUnit[],
  preferredExternalRoomId?: string | null,
): string[] {
  const active = units.filter((unit) => isActiveUnitMinStay(unit.minStay));
  if (active.length === 0) return [];
  if (preferredExternalRoomId) {
    const preferred = active.find(
      (unit) => unit.externalRoomId === String(preferredExternalRoomId),
    );
    if (preferred) return [preferred.externalRoomId];
  }
  // 같은 유닛이 두 번 들어와도 한 번만 쓴다 — 같은 값을 두 번 보내면 크레딧만 두 배다.
  return [...new Set(active.map((unit) => unit.externalRoomId))];
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
