/**
 * Beds24 쪽에서 바뀐 가격 찾기 — 요금 동기화가 우리 표를 덮기 **직전에** 이전 값과 비교한다.
 * **순수하다.**
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「Beds24 에서 바꾼 가격도 개입으로 센다」
 * 원본: 저쪽 `priceWebhook` 이 캐시와 비교해 `price_change_logs`(`origin: Beds24`)를 남기던 것
 *
 * ## 왜 (2026-09-29 사용자 결정)
 *
 * 가격 개입 전환은 가격 이력으로 판정한다. 우리 이력은 **우리 앱이 바꾼 가격만** 남겼다 — Beds24
 * 화면이나 저쪽 앱에서 바꾼 가격은 효과를 볼 수 없었다. Beds24 가격 웹훅에는 **가격이 없고**
 * 「이 방이 바뀌었다」 신호뿐이라, 다시 읽을 때 비교해야 무엇이 바뀌었는지 안다.
 *
 * ## 무엇을 세나
 *
 * - **가격 소스 유닛의 에어비앤비 가격(`price1`)만.** 자식 유닛과 Booking.com·`p3` 는 링크가 계산한
 *   값이라 소스가 바뀌면 같이 바뀐다 — 세면 한 번의 변경이 여러 번 잡힌다.
 * - **이전 값을 알 때만.** 이전이 비어 있으면(12개월 창에 새로 들어온 날) 「변경」이 아니다.
 * - 오늘 이전 날짜는 안 센다 — 지난 밤의 가격은 팔 수 없다.
 * - **우리 앱이 쓴 값은 안 잡힌다.** 워커가 Beds24 에 쓴 뒤 우리 표도 바로 그 값으로 고쳐 두므로
 *   (`patchLocalRates`) 동기화 때는 같은 값이다.
 */

export type ExternalPriceChange = {
  roomId: string;
  stayDate: string;
  oldValue: number;
  newValue: number;
};

export function detectExternalPriceChanges(args: {
  /** `roomId|YYYY-MM-DD` → 우리 표의 지금 `price1`. */
  before: ReadonlyMap<string, number | null>;
  /** 동기화가 막 읽은 값. */
  after: ReadonlyArray<{ room_id: string; stay_date: string; price1: number | null }>;
  /** 가격 소스(또는 링크 없는 단독) 유닛의 `rooms.id`. */
  sourceRoomIds: ReadonlySet<string>;
  today: string;
}): ExternalPriceChange[] {
  const changes: ExternalPriceChange[] = [];
  for (const row of args.after) {
    if (!args.sourceRoomIds.has(row.room_id)) continue;
    if (row.stay_date < args.today) continue;
    const previous = args.before.get(`${row.room_id}|${row.stay_date}`);
    if (previous === undefined || previous === null || row.price1 === null) continue;
    if (previous === row.price1) continue;
    changes.push({ newValue: row.price1, oldValue: previous, roomId: row.room_id, stayDate: row.stay_date });
  }
  return changes;
}

// ───────────────── 최소숙박 · 차단까지 (2026-09-29, 사용자 요청) ─────────────────

/** 우리 표의 이전 값 — `roomId|YYYY-MM-DD` 마다. */
export type RateSnapshot = { price1: number | null; minStay: number | null; override: string | null };

export type ExternalRateChange = {
  roomId: string;
  stayDate: string;
  /** `blackout` 은 1 = 차단, 0 = 열림. */
  field: "price1" | "min_stay" | "blackout";
  oldValue: number;
  newValue: number;
};

/** 판매 중인 유닛의 최소숙박 — 50 이상은 잠근 유닛(`isActiveUnitMinStay` 와 같은 기준). */
const isActiveMinStay = (value: number | null): value is number => value !== null && value >= 1 && value < 50;
const isBlackout = (override: string | null) => override === "blackout";

/**
 * Beds24 에서 바뀐 가격 · 최소숙박 · 차단. **순수하다.**
 *
 * - **가격**: 위 `detectExternalPriceChanges` 와 같다(소스 유닛 `price1` 만 — 링크 슬롯은 따라 바뀐다).
 * - **최소숙박**: 모든 유닛, 단 **이전·이후 둘 다 판매 중 값(1~49)** 일 때만. 50 으로 잠그거나 푸는 것은
 *   유닛 교체라 운영 변경이 아니다.
 * - **차단**: 모든 유닛, `override` 가 blackout ↔ 그 밖으로 바뀐 것. 잠긴 유닛(최소숙박 50+)은 뺀다 — 안
 *   파는 유닛의 차단은 소음이다.
 * - 공통: 이전 값을 알 때만, 오늘 이후만. **우리 앱이 쓴 값은 안 잡힌다** — 워커·차단 쓰기가 우리 표를 먼저
 *   고쳐 두므로 동기화 때는 같은 값이다.
 * - 같은 방의 유닛 둘(가부키초 `203#`·`K203`)이 같이 바뀌면 둘 다 잡힌다 — 화면이 한 칸으로 합친다
 *   (`groupChangeRows`).
 */
export function detectExternalRateChanges(args: {
  before: ReadonlyMap<string, RateSnapshot>;
  after: ReadonlyArray<{
    room_id: string;
    stay_date: string;
    price1: number | null;
    min_stay: number | null;
    override_kind: string | null;
  }>;
  sourceRoomIds: ReadonlySet<string>;
  today: string;
}): ExternalRateChange[] {
  const changes: ExternalRateChange[] = [];
  for (const row of args.after) {
    if (row.stay_date < args.today) continue;
    const previous = args.before.get(`${row.room_id}|${row.stay_date}`);
    if (!previous) continue;
    const base = { roomId: row.room_id, stayDate: row.stay_date };

    if (
      args.sourceRoomIds.has(row.room_id) &&
      previous.price1 !== null &&
      row.price1 !== null &&
      previous.price1 !== row.price1
    ) {
      changes.push({ ...base, field: "price1", newValue: row.price1, oldValue: previous.price1 });
    }

    if (isActiveMinStay(previous.minStay) && isActiveMinStay(row.min_stay) && previous.minStay !== row.min_stay) {
      changes.push({ ...base, field: "min_stay", newValue: row.min_stay, oldValue: previous.minStay });
    }

    const selling = isActiveMinStay(row.min_stay) || isActiveMinStay(previous.minStay);
    if (selling && isBlackout(previous.override) !== isBlackout(row.override_kind)) {
      changes.push({
        ...base,
        field: "blackout",
        newValue: isBlackout(row.override_kind) ? 1 : 0,
        oldValue: isBlackout(previous.override) ? 1 : 0,
      });
    }
  }
  return changes;
}
