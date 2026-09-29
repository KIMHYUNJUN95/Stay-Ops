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
