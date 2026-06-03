import {
  readBeds24BookingId,
  resolveReservationStatusFromBeds24Record,
} from "@/lib/beds24/reservation-status";

export type Beds24JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): Beds24JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Beds24JsonRecord;
}

function readString(record: Beds24JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function hasStayDateFields(record: Beds24JsonRecord): boolean {
  return (
    !!readString(record, ["firstNight", "first_night", "checkIn", "check_in", "arrival", "startDate"]) &&
    !!readString(record, ["lastNight", "last_night", "checkOut", "check_out", "departure", "endDate"])
  );
}

/** Strict shape used by backfill `/bookings` responses. */
function looksLikeBookingRecord(record: Beds24JsonRecord): boolean {
  return !!readBeds24BookingId(record) && hasStayDateFields(record);
}

function hasWebhookCancelSignals(record: Beds24JsonRecord): boolean {
  if (readString(record, ["cancelTime", "cancel_time", "cancelledAt", "cancelled_at"])) {
    return true;
  }
  if (readString(record, ["subStatus", "sub_status", "substatus"])) {
    return true;
  }
  if (
    readString(record, [
      "statusText",
      "status_text",
      "statusName",
      "status_name",
      "bookingStatusText",
      "booking_status_text",
      "bookingStatus",
      "booking_status",
      "status",
    ])
  ) {
    return resolveReservationStatusFromBeds24Record(record) === "cancelled";
  }
  return false;
}

/**
 * Relaxed webhook shape: accepts sparse cancellation payloads without stay dates.
 */
export function looksLikeWebhookBookingRecord(record: Beds24JsonRecord): boolean {
  if (!readBeds24BookingId(record)) return false;
  if (looksLikeBookingRecord(record)) return true;
  if (hasWebhookCancelSignals(record)) return true;
  return false;
}

function extractWithMatcher(
  value: unknown,
  matchesRecord: (record: Beds24JsonRecord) => boolean,
): Beds24JsonRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractWithMatcher(item, matchesRecord));
  }

  const record = asRecord(value);
  if (!record) return [];

  const results: Beds24JsonRecord[] = matchesRecord(record) ? [record] : [];
  for (const key of ["data", "bookings", "items", "results"]) {
    if (record[key] !== undefined) {
      results.push(...extractWithMatcher(record[key], matchesRecord));
    }
  }
  return results;
}

/**
 * Strict extractor for backfill `/bookings` API responses.
 */
export function extractBeds24BookingCandidates(value: unknown): Beds24JsonRecord[] {
  return extractWithMatcher(value, looksLikeBookingRecord);
}

/**
 * Relaxed extractor for Beds24 webhooks (includes sparse cancellation payloads).
 */
export function extractBeds24WebhookBookingCandidates(value: unknown): Beds24JsonRecord[] {
  return extractWithMatcher(value, looksLikeWebhookBookingRecord);
}

export function readBeds24String(record: Beds24JsonRecord, keys: string[]): string | null {
  return readString(record, keys);
}

export function toBeds24IsoDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function beds24LastNightToCheckout(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return d.toISOString().slice(0, 10);
}

export function isLikelyNumericRoomLabel(value: string) {
  return /^\d+$/.test(value.trim());
}

export function readBeds24ExternalRoomId(record: Beds24JsonRecord): string | null {
  return (
    readString(record, ["roomId", "room_id"]) ??
    readString(record, ["unitId", "unit_id"])
  );
}
