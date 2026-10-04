/**
 * 예약 인원 — 성인 · 어린이 (2026-10-05). 예약 캘린더(현장 모바일 · 관리자)가 같이 쓴다.
 *
 * 문서: docs/product/15-reservation-calendar.md → 「인원 표기」
 *
 * Beds24 원본은 `numAdult` · `numChild` 를 따로 준다. 전에는 두 화면이 각자 「합계」를 구했는데, 합계 키 목록 맨 앞이
 * `numAdult` 라 **어린이가 빠진 성인 수만** 「인원」으로 나왔다. 판매 캘린더(`rpGuestsValue`)처럼 나눠서 보여 주고,
 * 합계는 성인 + 어린이(+ 유아)로 다시 셈한다.
 */

const ADULT_KEYS = ["numAdult", "num_adult", "num_adults", "adults", "adult"];
const CHILD_KEYS = ["numChild", "num_child", "num_children", "children", "child"];
const INFANT_KEYS = ["numInfant", "num_infant", "infants", "infant"];
/** 성인 수가 없을 때만 보는 합계 키(다른 채널 · 옛 데이터). */
const TOTAL_KEYS = ["guestCount", "guest_count", "pax", "persons", "guests"];

function readNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
    }
  }
  return null;
}

export type ReservationGuests = {
  /** 성인 — 모르면 `null`(그때 화면은 합계만 보인다). */
  adults: number | null;
  /** 어린이(유아 포함) — 성인 수를 알면 없을 때 0. */
  children: number | null;
  /** 합계 — 모르면 `null`. */
  total: number | null;
};

export function getReservationGuests(rawPayload: unknown): ReservationGuests {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return { adults: null, children: null, total: null };
  }
  const record = rawPayload as Record<string, unknown>;
  const adults = readNumber(record, ADULT_KEYS);
  const child = readNumber(record, CHILD_KEYS);
  const infant = readNumber(record, INFANT_KEYS);

  if (adults !== null) {
    const children = (child ?? 0) + (infant ?? 0);
    return { adults, children, total: adults + children };
  }
  const total = readNumber(record, TOTAL_KEYS);
  if (total !== null) return { adults: null, children: null, total };
  if (child !== null || infant !== null) {
    const children = (child ?? 0) + (infant ?? 0);
    return { adults: null, children, total: children };
  }
  return { adults: null, children: null, total: null };
}
