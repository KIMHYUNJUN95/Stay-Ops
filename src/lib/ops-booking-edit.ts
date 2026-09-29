import { MAX_STAY_NIGHTS, splitGuestName, stayNights } from "@/lib/ops-manual-booking";

/**
 * 예약 수정 — **순수 규칙만.** Beds24 왕복과 DB 는 호출부(`submitReservationEdit`)가 한다.
 *
 * 도메인 계약: `docs/product/33-calendar-write-features.md` → 「예약 수정」
 * 원본: STAY ARI Manager `ReservationDetailModal.handleUpdate` + `functions/index.js` → `updateBooking`
 *
 * ## 채널 예약은 날짜를 못 바꾼다 (2026-09-29 사용자 결정)
 *
 * 저쪽은 모든 예약의 날짜·금액을 고칠 수 있었다. 그런데 Airbnb·Booking.com 예약은 **채널이
 * 주인**이다 — Beds24 에서 날짜를 바꿔도 채널 쪽 예약은 그대로라 손님이 받은 예약 내용과
 * 어긋나고, 채널이 변경을 보내면 그대로 덮인다. 그래서 채널 예약의 **날짜는 잠근다.**
 *
 * **총액은 채널 예약도 고친다**(같은 날 두 번째 결정). 바꿔도 **손님 청구액은 안 바뀐다** —
 * Beds24 기록, 즉 우리 매출 계산만 바뀐다. 매출 기록을 바로잡는 용도라 화면이 그 사실을 적는다.
 *
 * ## 메모는 **내부 메모**(`notes`)에 쓴다 (2026-09-29 사용자 결정)
 *
 * 저쪽은 `comments`(손님 요청)를 덮어써서 **손님이 채널에서 남긴 원래 요청이 사라졌다.** 우리는
 * Beds24 내부 메모에 쓴다 — 손님에게 안 보이고 원문도 남는다.
 *
 * ## 바뀐 것만 보낸다
 *
 * 저쪽도 `hasOwnProperty` 로 보낸 필드만 매핑했다. 안 바뀐 필드까지 보내면 그 사이 채널이
 * 바꾼 값(예: 손님이 인원을 늘림)을 화면이 들고 있던 **옛 값으로 되돌린다.**
 */

export type BookingEditChannel = "airbnb" | "booking" | "manual";

export type BookingEditDraft = {
  guestName: string;
  email: string;
  phone: string;
  numAdult: number;
  numChild: number;
  notes: string;
  arrival: string;
  departure: string;
  /** **총액**(엔). 모르면 `null` — 0 원과 다르다. */
  totalPrice: number | null;
};

export type BookingEditChanges = Partial<BookingEditDraft>;

export type BookingEditError =
  | "no_changes"
  | "channel_locked"
  | "no_guest_name"
  | "bad_occupancy"
  | "bad_dates"
  | "past_arrival"
  | "stay_too_long"
  | "bad_price";

/** 날짜를 고칠 수 있는가 — 직접·수기 예약만. 총액은 모든 예약이 고친다. */
export function canEditStay(channel: BookingEditChannel): boolean {
  return channel === "manual";
}

/** 채널 예약에서 잠그는 필드. */
const STAY_FIELDS: ReadonlyArray<keyof BookingEditDraft> = ["arrival", "departure"];

const same = (a: unknown, b: unknown) =>
  typeof a === "string" && typeof b === "string" ? a.trim() === b.trim() : a === b;

/** 바뀐 필드만 골라낸다. 문자열은 앞뒤 공백을 무시한다. */
export function diffBookingEdit(original: BookingEditDraft, next: BookingEditDraft): BookingEditChanges {
  const changes: BookingEditChanges = {};
  for (const key of Object.keys(next) as Array<keyof BookingEditDraft>) {
    if (!same(original[key], next[key])) {
      (changes as Record<string, unknown>)[key] =
        typeof next[key] === "string" ? (next[key] as string).trim() : next[key];
    }
  }
  return changes;
}

export function validateBookingEdit(args: {
  original: BookingEditDraft;
  changes: BookingEditChanges;
  channel: BookingEditChannel;
  today: string;
}): BookingEditError | null {
  const { changes, original } = args;
  const keys = Object.keys(changes) as Array<keyof BookingEditDraft>;
  if (keys.length === 0) return "no_changes";

  // 서버에서도 막는다 — 화면이 칸을 숨겨도 요청은 누구나 만들 수 있다.
  if (!canEditStay(args.channel) && keys.some((key) => STAY_FIELDS.includes(key))) {
    return "channel_locked";
  }

  if ("guestName" in changes && !(changes.guestName ?? "").trim()) return "no_guest_name";

  const numAdult = changes.numAdult ?? original.numAdult;
  const numChild = changes.numChild ?? original.numChild;
  if (!Number.isInteger(numAdult) || numAdult < 1) return "bad_occupancy";
  if (!Number.isInteger(numChild) || numChild < 0) return "bad_occupancy";

  if ("arrival" in changes || "departure" in changes) {
    const arrival = changes.arrival ?? original.arrival;
    const departure = changes.departure ?? original.departure;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival) || !/^\d{4}-\d{2}-\d{2}$/.test(departure)) {
      return "bad_dates";
    }
    if (departure <= arrival) return "bad_dates";
    // 체크인을 **옮길 때만** 과거를 막는다. 묵고 있는 손님의 체크아웃을 늘리는 것은 정상이다.
    if ("arrival" in changes && arrival < args.today) return "past_arrival";
    if (stayNights(arrival, departure).length > MAX_STAY_NIGHTS) return "stay_too_long";
  }

  if ("totalPrice" in changes) {
    const price = changes.totalPrice;
    if (price === null || price === undefined || !Number.isFinite(price) || price < 0) return "bad_price";
  }
  return null;
}

/**
 * 수정으로 **새로 묵게 되는 밤** — 원래 숙박에 없던 밤만. 겹침·판매 유닛 검사는 이 밤들만 본다
 * (이미 묵고 있는 밤은 그 예약이 차지한 밤이라 「겹친다」가 아니다).
 */
export function addedNights(original: BookingEditDraft, changes: BookingEditChanges): string[] {
  const before = new Set(stayNights(original.arrival, original.departure));
  const after = stayNights(changes.arrival ?? original.arrival, changes.departure ?? original.departure);
  return after.filter((night) => !before.has(night));
}

/** Beds24 `POST /bookings` 수정 페이로드 — **바뀐 필드만.** */
export function buildBeds24BookingUpdate(
  bookingId: string,
  changes: BookingEditChanges,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: Number(bookingId) };
  if (changes.guestName !== undefined) {
    const { firstName, lastName } = splitGuestName(changes.guestName);
    payload.firstName = firstName;
    payload.lastName = lastName;
  }
  if (changes.email !== undefined) payload.email = changes.email;
  if (changes.phone !== undefined) payload.phone = changes.phone;
  if (changes.numAdult !== undefined) payload.numAdult = changes.numAdult;
  if (changes.numChild !== undefined) payload.numChild = changes.numChild;
  if (changes.notes !== undefined) payload.notes = changes.notes;
  if (changes.arrival !== undefined) payload.arrival = changes.arrival;
  if (changes.departure !== undefined) payload.departure = changes.departure;
  if (changes.totalPrice !== undefined && changes.totalPrice !== null) payload.price = changes.totalPrice;
  return payload;
}
