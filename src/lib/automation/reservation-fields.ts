/**
 * 자동화 메시지가 읽는 예약 원본(`reservations.raw_payload` — Beds24 V2) 필드. **순수하다.**
 *
 * 저쪽(STAY ARI Manager)은 저장할 때 `normalize()`(functions/index.js :1356)로 필드를 만들어 두고 리포트가 그것을
 * 읽었다. 우리 표는 원본을 그대로 들고 있으므로, 같은 규칙으로 **읽을 때** 만든다 —
 *
 * | 여기 | 저쪽 |
 * | --- | --- |
 * | `bookDateOf` | `determineDate` (:1229) — bookingTime → bookTime → entryTime → 가장 이른 invoiceDate, 도쿄 날짜 |
 * | `cancelInstantOf` | `cancelTime \|\| (취소면 modifiedTime \|\| modified)` (:1451) |
 * | `exactReferer` | `referer` 원문 — 일일 리포트는 `"Airbnb"` / `"Booking.com"` 과 **정확히 같은** 것만 셌다 |
 * | 금액 | `legacyReservationAmount`(ops-sales-summary — 같은 `normalize` 규칙) |
 */

import { getReservationGuests } from "@/lib/reservation-guests";
import { tokyoDateOf } from "@/lib/tokyo-date";

export type RawPayload = Record<string, unknown>;

export function asRaw(value: unknown): RawPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RawPayload) : {};
}

function text(raw: RawPayload, key: string): string | null {
  const value = raw[key];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** 날짜만 있으면 그대로, 시각이 있으면 도쿄 날짜로(저쪽 `toJapanDate`). */
function toTokyoDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return tokyoDateOf(value);
}

/** 예약 접수일(도쿄). 입실일은 쓰지 않는다 — 저쪽 주석 「뻥튀기 영구 방지」. */
export function bookDateOf(raw: RawPayload): string | null {
  for (const key of ["bookingTime", "bookTime", "entryTime"]) {
    const value = text(raw, key);
    if (value && value.length >= 10) return toTokyoDate(value);
  }
  if (Array.isArray(raw.invoiceItems)) {
    const dates = raw.invoiceItems
      .map((item) => (item && typeof item === "object" ? (item as RawPayload).invoiceDate : null))
      .filter((value): value is string => typeof value === "string" && value.length >= 10)
      .sort();
    if (dates.length > 0) return toTokyoDate(dates[0]);
  }
  return null;
}

/** 취소 시각(원문 ISO). 원본에 cancelTime 이 없으면 마지막 수정 시각을 쓴다 — 취소된 예약일 때만. */
export function cancelInstantOf(raw: RawPayload, cancelled: boolean): string | null {
  const cancelTime = text(raw, "cancelTime");
  if (cancelTime) return cancelTime;
  if (!cancelled) return null;
  return text(raw, "modifiedTime") ?? text(raw, "modified");
}

export function exactReferer(raw: RawPayload): string {
  return text(raw, "referer") ?? "";
}

/** 알림의 「플랫폼」 — 저쪽은 `platform || referer`. */
export function platformLabel(raw: RawPayload): string {
  return text(raw, "referer") ?? text(raw, "channel") ?? text(raw, "source") ?? "-";
}

export function bookingIdOf(raw: RawPayload, fallback: string): string {
  return text(raw, "bookId") ?? text(raw, "id") ?? fallback;
}

/** 성인 · 어린이 — 저쪽 알림 형식(`성인 2명, 아동 1명 (총 3명)`). */
export function guestCountsOf(raw: RawPayload): { adults: number; children: number; total: number } {
  const guests = getReservationGuests(raw);
  const adults = guests.adults ?? 0;
  const children = guests.children ?? 0;
  return { adults, children, total: guests.total ?? adults + children };
}

/** JSON 경로로 받아 올 키 — 원본을 통째로 받지 않는다(ops-calendar 와 같은 이유). */
export const AUTOMATION_PAYLOAD_KEYS = [
  "status",
  "referer",
  "referrer",
  "channel",
  "source",
  "apiSource",
  "subSource",
  "bookingTime",
  "bookTime",
  "entryTime",
  "cancelTime",
  "modifiedTime",
  "modified",
  "price",
  "amount",
  "invoiceItems",
  "numAdult",
  "numChild",
  "numInfant",
  "bookId",
  "id",
] as const;

export const AUTOMATION_RESERVATION_SELECT = [
  "id, property_name, room_label, guest_name, status, check_in_date, check_out_date, updated_at",
  ...AUTOMATION_PAYLOAD_KEYS.map((key) => `rp_${key}:raw_payload->${key}`),
].join(", ");

export type AutomationReservation = {
  id: string;
  propertyName: string;
  roomLabel: string;
  guestName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  updatedAt: string;
  raw: RawPayload;
};

export function toAutomationReservation(row: Record<string, unknown>): AutomationReservation {
  const raw: RawPayload = {};
  for (const key of AUTOMATION_PAYLOAD_KEYS) {
    const value = row[`rp_${key}`];
    if (value !== null && value !== undefined) raw[key] = value;
  }
  return {
    checkIn: String(row.check_in_date ?? ""),
    checkOut: String(row.check_out_date ?? ""),
    guestName: String(row.guest_name ?? ""),
    id: String(row.id ?? ""),
    propertyName: String(row.property_name ?? ""),
    raw,
    roomLabel: String(row.room_label ?? ""),
    status: String(row.status ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
