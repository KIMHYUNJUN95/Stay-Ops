const ROOM_ASSIGNMENT_SEPARATOR = "::room::";

/**
 * 같은 채널 예약번호·같은 객실 라벨에 **서로 다른 Beds24 예약**이 둘 이상일 때만 붙는 꼬리표.
 * 형식: `<base>::room::<객실>::bid::<Beds24 id>` (2026-10-01).
 *
 * `toOriginalReservationId()` 는 `::room::` 앞만 보므로 이 꼬리표가 붙어도 기준 번호는 그대로다.
 */
const BOOKING_ID_SEPARATOR = "::bid::";

export function toStoredReservationId(
  sourceReservationId: string,
  roomLabel: string,
  collisionBookingId?: string | null,
) {
  const original = toOriginalReservationId(sourceReservationId);
  const base = `${original}${ROOM_ASSIGNMENT_SEPARATOR}${roomLabel}`;
  return collisionBookingId ? `${base}${BOOKING_ID_SEPARATOR}${collisionBookingId}` : base;
}

export function toOriginalReservationId(value: string) {
  const separatorIndex = value.indexOf(ROOM_ASSIGNMENT_SEPARATOR);
  if (separatorIndex === -1) {
    return value;
  }
  return value.slice(0, separatorIndex);
}

export function hasStoredReservationRoomSuffix(value: string) {
  return value.includes(ROOM_ASSIGNMENT_SEPARATOR);
}

function readIdentifier(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/**
 * Beds24 **자기** 예약번호 (v2 `id`, v1 `bookId`).
 *
 * `readBeds24BookingId()` 와 다르다 — 그쪽은 `apiReference`(채널 번호)를 먼저 읽는데, Booking.com
 * 다객실 예약은 방마다 Beds24 예약이 따로 있고(`masterId` 로 묶임) **채널 번호는 하나**다. 「같은
 * 예약인가」는 반드시 이 값으로 판단한다.
 */
export function readBeds24OwnBookingId(record: unknown): string | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  return readIdentifier(record as Record<string, unknown>, ["bookId", "book_id", "id"]);
}

/** 그룹(다객실) 예약의 대표 예약번호. 대표 자신이거나 그룹이 아니면 `null`. */
export function readBeds24MasterId(record: unknown): string | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const masterId = readIdentifier(record as Record<string, unknown>, ["masterId", "master_id"]);
  if (!masterId || masterId === "0") return null;
  return masterId === readBeds24OwnBookingId(record) ? null : masterId;
}

/**
 * 저장된 행과 들어온 예약이 **같은 Beds24 예약**인가 — 방 이동 판정의 유일한 기준 (2026-10-01).
 *
 * 채널 번호(`apiReference`)가 같아도 Beds24 id 가 다르면 **다른 예약**(그룹의 다른 방)이다.
 * 한쪽이라도 id 를 모르면(옛 행) 예전처럼 같은 예약으로 본다 — 판단 근거가 없는데 새 행을 만들면
 * 중복이 생긴다.
 */
export function isSameBeds24Booking(rowBookingId: string | null | undefined, bookingId: string | null | undefined) {
  if (!rowBookingId || !bookingId) return true;
  return rowBookingId === bookingId;
}

export type StoredReservationKeyCandidate = {
  source_reservation_id: string;
  /** 그 행의 `raw_payload` 에 들어 있는 Beds24 자기 예약번호. 모르면 `null`. */
  bookingId: string | null;
};

/**
 * 이 예약이 쓸 `source_reservation_id` 를 고른다 (2026-10-01).
 *
 * 기본은 `<base>::room::<객실>` 이다. 같은 키를 **다른 Beds24 예약**(같은 채널 번호의 그룹 형제)이
 * 이미 쓰고 있을 때만 `::bid::<id>` 를 붙여 따로 저장한다 — 그렇지 않으면 한쪽이 다른 쪽을 덮어쓴다.
 *
 * 순서가 중요하다: 이 예약이 이미 가진 행(평문 키 → 꼬리표 키)을 먼저 찾는다. 형제가 비켰다고
 * 해서 멀쩡한 행의 키를 바꾸면 행 id 가 바뀌어 리뷰·업무 연결이 끊긴다.
 */
export function chooseStoredReservationId(params: {
  sourceReservationId: string;
  roomLabel: string;
  bookingId: string | null;
  existingRows: StoredReservationKeyCandidate[];
}): string {
  const plainKey = toStoredReservationId(params.sourceReservationId, params.roomLabel);
  if (!params.bookingId) return plainKey;

  const suffixedKey = toStoredReservationId(params.sourceReservationId, params.roomLabel, params.bookingId);
  const plainRows = params.existingRows.filter((row) => row.source_reservation_id === plainKey);
  if (plainRows.some((row) => isSameBeds24Booking(row.bookingId, params.bookingId))) return plainKey;
  if (params.existingRows.some((row) => row.source_reservation_id === suffixedKey)) return suffixedKey;
  return plainRows.length > 0 ? suffixedKey : plainKey;
}

/** 같은 채널 번호로 찾은 행들 중 **이 Beds24 예약의 것**만 남긴다. `bookingId` 를 모르면 전부. */
export function filterRowsOfSameBeds24Booking<T extends { bookingId: string | null }>(
  rows: T[],
  bookingId: string | null | undefined,
): T[] {
  if (!bookingId) return rows;
  return rows.filter((row) => isSameBeds24Booking(row.bookingId, bookingId));
}
