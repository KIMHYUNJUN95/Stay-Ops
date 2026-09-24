import { isActiveUnitMinStay } from "@/lib/ops-gap-detection";

/**
 * 한 캘린더 칸(객실 행 × 날짜)에 걸친 Beds24 유닛들을 하나로 합친다.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「유닛이 여럿인 칸」
 * 원본: STAY ARI Manager `BuildingCalendar.jsx` — `getDisplayUnitInfosForDate` +
 * `getMergedRoomChannelPrices` + `getMinStayFromUnitInfos`
 *
 * **순수 모듈이다.** 이 규칙은 2026-09-17 에 두 번 틀렸고(비활성 유닛 값이 올라옴 →
 * 부킹닷컴 가격이 사라짐) 둘 다 화면에서는 「팔지 않는 날」처럼 보여 눈으로 못 잡는다.
 * 그래서 판정을 여기로 빼고 테스트로 고정한다.
 *
 * ## 운영 값과 가격을 다르게 다루는 것이 요점이다
 *
 * ### 운영 값(최소숙박·재고·blackout)은 **운영 중인 유닛에서만** 읽는다
 *
 * 운영 중 = `1 ≤ minStay < 50`. 하나도 없으면 그 칸은 **비운다** — 비활성 유닛의 `minStay 99`
 * 를 보여주는 것은 정보가 아니라 오답이다(저쪽 `EMPTY_PRICE_CELL`). 화면에는 `–` 로 나가고
 * 갭 판정에서는 `unknown` 이 되어 제외된다.
 *
 * ### 가격은 **항목별로** 따로 내려온다
 *
 * 가격이 운영 중인 유닛에 다 있지는 않다. 오쿠보C 는 Beds24 방 계정이 셋인데
 * **부킹닷컴·아고다 가격은 메인 계정 하나에만** 있다. 나머지 둘은 에어비앤비 가격만 연결로
 * 받는다.
 *
 * ```
 * 450096 오쿠보 2-1 (메인)  p1 79000  p2 116920  p3 102700   minStay 50 ← 10/1 부터 비활성
 * 496532 1-13-1-2           p1 79000  p2 —       p3 —        minStay 99
 * 648399 OkuboCC            p1 79000  p2 —       p3 —        minStay 2  ← 10/1 부터 판매
 * ```
 *
 * 10/1 이후 운영 중인 유닛은 648399 뿐인데 그 유닛에는 부킹닷컴 가격이 없다. 유닛 하나를
 * 골라 그 행을 통째로 쓰면 **부킹닷컴 가격이 사라진다.** 그래서 저쪽처럼 항목마다
 * 「운영 중인 유닛 먼저, 없으면 그 행의 아무 유닛」 순으로 **처음 나오는 값**을 쓴다.
 *
 * 이 폴백은 **가격에만** 건다. 최소숙박까지 끌어오면 위 표에서 450096 의 `50` 이 올라와
 * 「팔 수 없는 날」이 되고, 그건 팔리는 방을 안 판다는 뜻이다.
 */

/** 병합에 필요한 것만. `room_daily_rates` 한 행의 부분집합이다. */
export type OpsRateUnit = {
  price1: number | null;
  price2: number | null;
  price3: number | null;
  min_stay: number | null;
  max_stay: number | null;
  num_avail: number | null;
  override_kind: string | null;
};

export type OpsMergedRate = {
  maxStay: number | null;
  minStay: number | null;
  numAvail: number | null;
  overrideKind: string | null;
  /** 에어비앤비 가격(엔) = `price1`. 격자의 가격 트랙이 쓰는 값이다. */
  price: number | null;
  /** 부킹닷컴 가격(엔) = `price2`. 메인 계정에만 있는 경우가 있다. */
  bookingPrice: number | null;
  /** 대체가(엔) = `price3`. 아고다·자사 홈페이지가 쓴다. */
  altPrice: number | null;
};

/** 첫 번째로 값이 있는 유닛의 값을 쓴다. 없으면 `null`. */
function firstNonNull(
  units: OpsRateUnit[],
  read: (unit: OpsRateUnit) => number | null,
): number | null {
  for (const unit of units) {
    const value = read(unit);
    if (value !== null) return value;
  }
  return null;
}

/** 운영 중인 유닛이 하나도 없으면 `null` — 칸을 비우라는 뜻이다. */
export function mergeOpsRateUnits(units: OpsRateUnit[]): OpsMergedRate | null {
  const active = units.filter((unit) => isActiveUnitMinStay(unit.min_stay));
  if (active.length === 0) return null;

  // 최소숙박은 운영 중인 유닛 중 **가장 짧은 값** — 하나라도 1박에 팔면 그 칸은 1박이다
  // (저쪽 `getMinStayFromUnitInfos`).
  let minStay: number | null = null;
  let numAvail: number | null = null;
  let blackout = false;
  for (const unit of active) {
    if (unit.min_stay !== null && (minStay === null || unit.min_stay < minStay)) {
      minStay = unit.min_stay;
    }
    // 하나라도 팔 수 있으면 그 칸은 팔 수 있다.
    if (unit.num_avail !== null && (numAvail === null || unit.num_avail > numAvail)) {
      numAvail = unit.num_avail;
    }
    // blackout 은 반대로 **하나라도 걸려 있으면** 막힌 것으로 본다(저쪽과 같다).
    if ((unit.override_kind ?? "").toLowerCase() === "blackout") blackout = true;
  }

  // 가격은 운영 중인 유닛 먼저, 그다음 그 행의 나머지 유닛.
  const priceOrder = [...active, ...units.filter((unit) => !active.includes(unit))];

  return {
    altPrice: firstNonNull(priceOrder, (unit) => unit.price3),
    bookingPrice: firstNonNull(priceOrder, (unit) => unit.price2),
    maxStay: active[0].max_stay,
    minStay,
    numAvail,
    overrideKind: blackout ? "blackout" : active[0].override_kind,
    price: firstNonNull(priceOrder, (unit) => unit.price1),
  };
}
