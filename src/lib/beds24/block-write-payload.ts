/**
 * 블록(차단) 쓰기 페이로드 — **순수 함수만.** Beds24 왕복은 호출부가 한다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「저쪽 블록의 실제 규칙」
 * 원본: STAY ARI Manager `functions/index.js`
 *   → `createBeds24BlackoutOverride`(7664) · `clearBeds24BlackoutOverride`(7689)
 *
 * ## 블록은 예약이 아니다
 *
 * Beds24 에서 방을 막는 표현은 **인벤토리 오버라이드**다 —
 * `POST /inventory/rooms/calendar` 에 `override: "blackout"`. 저쪽 `createBooking` 이
 * `isBlock` 이면 `/bookings` 를 아예 부르지 않고 이 경로로 빠진다.
 *
 * ## 날짜는 「밤」이다
 *
 * 체크인 10/1 · 체크아웃 10/4 면 막히는 밤은 **10/1 · 10/2 · 10/3** 이다. 10/4 는 아침에
 * 나가는 날이라 그날 밤은 팔 수 있다. 저쪽 `getInventoryOverrideEndDate` 가 `departure - 1`
 * 을 쓰는 이유이고, 우리 `room_blocks.start_date`/`end_date`(양끝 포함)와 같은 규칙이다.
 *
 * 이 모듈은 **밤 범위를 그대로 받는다.** 체크아웃 날짜를 받아서 빼지 않는다 — 두 규칙이
 * 한 코드베이스에 섞이면 어느 쪽인지 매번 확인해야 한다.
 *
 * ## 해제는 `override: none` 만으로는 부족하다
 *
 * blackout 을 걸면 Beds24 가 그 날짜의 재고를 건드린다. 그냥 풀면 **막기 전 재고로 돌아가지
 * 않는다.** 그래서 막기 전에 numAvail 을 찍어 두었다가 해제할 때 같이 써넣는다.
 * 스냅샷이 없는 블록(사람이 Beds24 화면에서 직접 건 것)은 **재고를 건드리지 않고** 오버라이드만
 * 푼다 — 모르는 값을 추측해서 쓰는 것보다 그대로 두는 쪽이 안전하다.
 */

import {
  type CalendarSegment,
  consolidateCalendarRanges,
} from "@/lib/beds24/calendar-write-payload";

/** 가격 쓰기와 **같은 구간 타입**을 쓴다 — 구간을 합치는 규칙도 같아야 한다. */
export type Beds24RoomCalendarPayload = { roomId: number; calendar: CalendarSegment[] };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type BlockRangeError = "invalid_date" | "range_reversed" | "invalid_room_id";

export type BlockRange = { startDate: string; endDate: string };

/**
 * 밤 범위를 검증한다. **하루짜리 블록은 유효하다**(`start === end`) — 그날 밤 하나를 막는 것이다.
 *
 * 저쪽은 체크인/체크아웃을 받아서 `departure > arrival` 을 요구했다. 우리는 밤 범위를 받으므로
 * 같은 날이 정상이고, 뒤집힌 범위만 막는다.
 */
export function validateBlockRange(range: BlockRange): BlockRangeError | null {
  if (!DATE_PATTERN.test(range.startDate) || !DATE_PATTERN.test(range.endDate)) {
    return "invalid_date";
  }
  if (range.endDate < range.startDate) return "range_reversed";
  return null;
}

/** `YYYY-MM-DD` 밤 범위를 날짜 배열로. 시간대에 의존하지 않도록 문자열로만 센다. */
export function eachNight(range: BlockRange): string[] {
  const nights: string[] = [];
  // UTC 정오로 고정한다 — 자정으로 만들면 DST 없는 UTC 라도 파서 구현 차이에 걸릴 여지가 있다.
  const cursor = new Date(`${range.startDate}T12:00:00Z`);
  const last = new Date(`${range.endDate}T12:00:00Z`);
  while (cursor.getTime() <= last.getTime()) {
    nights.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
}

/**
 * 블록을 거는 페이로드. 같은 밤 범위의 여러 방을 **한 번의 POST** 로 묶는다.
 *
 * 듀얼 ID 객실은 모든 roomId 가 같은 구간이라 따로 보내면 왕복(약 3.5초)이 그 수만큼 직렬로
 * 쌓인다 — 저쪽이 `createBeds24BlackoutOverrideBatch` 를 만든 이유와 같다.
 */
export function buildBlockSegments(args: {
  externalRoomIds: string[];
  range: BlockRange;
}): Beds24RoomCalendarPayload[] {
  const seen = new Set<string>();
  const payloads: Beds24RoomCalendarPayload[] = [];
  for (const raw of args.externalRoomIds) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    const numeric = Number(id);
    if (!Number.isInteger(numeric) || numeric <= 0) continue;
    seen.add(id);
    payloads.push({
      roomId: numeric,
      calendar: [{ from: args.range.startDate, to: args.range.endDate, override: "blackout" }],
    });
  }
  return payloads;
}

/**
 * 블록을 푸는 페이로드.
 *
 * `preBlockNumAvail` 이 있으면 날짜별로 재고를 같이 써넣는다. 값이 날짜마다 다를 수 있어
 * 하루씩 구간을 만든 뒤 **같은 값이 이어지는 구간만 합친다**(`consolidateCalendarRanges`) —
 * 저쪽도 같은 순서로 한다. 스냅샷이 없는 날짜는 `override: none` 만 보낸다.
 */
export function buildUnblockSegments(args: {
  externalRoomId: string;
  range: BlockRange;
  preBlockNumAvail?: Record<string, number> | null;
}): Beds24RoomCalendarPayload | null {
  const numeric = Number(String(args.externalRoomId ?? "").trim());
  if (!Number.isInteger(numeric) || numeric <= 0) return null;

  const perNight: CalendarSegment[] = eachNight(args.range).map((night) => {
    const restored = args.preBlockNumAvail?.[night];
    const segment: CalendarSegment = { from: night, to: night, override: "none" };
    if (typeof restored === "number" && Number.isInteger(restored) && restored >= 0) {
      segment.numAvail = restored;
    }
    return segment;
  });

  return { roomId: numeric, calendar: consolidateCalendarRanges(perNight) };
}

/**
 * 되읽기 검증 — 걸었으면 `blackout`, 풀었으면 `blackout 아님`이어야 한다.
 *
 * **Beds24 는 아무것도 안 들어갔어도 `success: true` 를 준다.** 가격 쓰기에서 이미 겪었다
 * (`price-write-verification.ts`). 블록은 틀리면 「팔리면 안 되는 방이 팔린다」 또는
 * 「팔아야 할 방이 잠긴다」라 되읽기를 건너뛸 수 없다.
 */
export function diffBlockReadback(args: {
  nights: string[];
  /** 되읽은 날짜별 override. 없으면 `null`. */
  actual: Map<string, string | null>;
  expect: "blackout" | "cleared";
}): string[] {
  const mismatched: string[] = [];
  for (const night of args.nights) {
    const override = args.actual.get(night) ?? null;
    const isBlackout = override === "blackout";
    if (args.expect === "blackout" ? !isBlackout : isBlackout) mismatched.push(night);
  }
  return mismatched;
}
