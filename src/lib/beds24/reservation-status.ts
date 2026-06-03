import type { Database } from "@/types/database";

type JsonRecord = Record<string, unknown>;
type ReservationStatus = Database["public"]["Enums"]["reservation_status"];

function readString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function readValue(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && !(typeof value === "string" && value.trim().length === 0)) {
      return value;
    }
  }
  return null;
}

function normalizeBeds24StatusValue(raw: unknown): ReservationStatus {
  if (raw === null || raw === undefined) return "confirmed";

  if (typeof raw === "number") {
    if (raw === 0) return "cancelled";
    if (raw === 1 || raw === 2 || raw === 3 || raw === 5 || raw === -2) return "confirmed";
    if (raw === 4) return "confirmed"; // Black — still occupies calendar in Beds24
    return "confirmed";
  }

  if (typeof raw !== "string") return "confirmed";

  const value = raw.trim().toLowerCase();
  if (value.length === 0) return "confirmed";

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && /^-?\d+$/.test(value)) {
    if (numericValue === 0) return "cancelled";
    if (numericValue === 1 || numericValue === 2 || numericValue === 3 || numericValue === 5) return "confirmed";
    if (numericValue === 4) return "confirmed";
  }

  if (
    ["cancelled", "canceled", "cancel"].includes(value) ||
    value.includes("cancelled") ||
    value.includes("canceled")
  ) {
    return "cancelled";
  }
  if (["checked_in", "checkin", "checked-in", "in_house", "inhouse"].includes(value)) {
    return "checked_in";
  }
  if (["checked_out", "checkout", "checked-out", "departed"].includes(value)) {
    return "checked_out";
  }
  if (["no_show", "noshow", "no-show"].includes(value) || value.includes("no show")) {
    return "no_show";
  }

  if (["new", "request", "inquiry", "confirmed", "modify", "modified", "black"].includes(value)) {
    return "confirmed";
  }

  return "confirmed";
}

/**
 * Maps Beds24 booking/webhook payload fields to StayOps reservation status.
 * Prefer cancelTime and explicit cancelled status over legacy numeric codes.
 * Note: Beds24 API v2 may expose statusCode: 0 on active bookings — do not use statusCode alone.
 */
export function resolveReservationStatusFromBeds24Record(record: JsonRecord): ReservationStatus {
  const cancelTime = readString(record, ["cancelTime", "cancel_time", "cancelledAt", "cancelled_at"]);
  if (cancelTime) return "cancelled";

  const subStatusRaw = readString(record, ["subStatus", "sub_status", "substatus"]);
  if (subStatusRaw) {
    const subStatus = subStatusRaw.toLowerCase();
    if (subStatus === "3" || subStatus === "4" || subStatus.includes("cancelled by")) {
      return "cancelled";
    }
    if (subStatus === "5" || subStatus.includes("no show")) {
      return "no_show";
    }
  }

  return normalizeBeds24StatusValue(
    readValue(record, [
      "statusText",
      "status_text",
      "statusName",
      "status_name",
      "bookingStatusText",
      "booking_status_text",
      "bookingStatus",
      "booking_status",
      "status",
    ]),
  );
}

export function readBeds24BookingId(record: JsonRecord): string | null {
  return readString(record, [
    "bookId",
    "book_id",
    "apiReference",
    "api_reference",
    "reservationId",
    "reservation_id",
    "bookingId",
    "booking_id",
    "id",
  ]);
}
