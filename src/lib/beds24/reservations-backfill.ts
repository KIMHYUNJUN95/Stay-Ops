import type { SupabaseClient } from "@supabase/supabase-js";
import { getOptionalBeds24ApiEnv } from "@/lib/env";
import { toOriginalReservationId, toStoredReservationId } from "@/lib/beds24/reservation-id";
import {
  readBeds24BookingId,
  resolveReservationStatusFromBeds24Record,
} from "@/lib/beds24/reservation-status";
import { extractBeds24BookingCandidates } from "@/lib/beds24/booking-payload";
import { normalizeReservationSource } from "@/lib/beds24/source-normalization";
import type { Database } from "@/types/database";

type JsonRecord = Record<string, unknown>;
type ReservationStatus = Database["public"]["Enums"]["reservation_status"];

type Beds24AccessTokenState =
  | { ok: true; token: string }
  | { ok: false; skipped: string };

type BookingRow = {
  externalRoomId: string | null;
  sourceReservationId: string;
  source: string;
  propertyExternalId: string | null;
  propertyName: string;
  roomLabel: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  status: ReservationStatus;
  rawPayload: Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
};

export type BackfillSkippedReason = {
  sourceReservationId: string | null;
  guestName: string | null;
  propertyName: string | null;
  checkInDate: string | null;
  reason: string;
};

export type Beds24ReservationsBackfillResult = {
  attempted: boolean;
  endpointTried: string | null;
  from: string;
  toExclusive: string;
  partial: boolean;
  failedPageUrl: string | null;
  fetchedRows: number;
  upsertedRows: number;
  cancelledUpsertedRows: number;
  skippedRows: number;
  recoveredRows: number;
  skipped: string[];
  skippedReasons: BackfillSkippedReason[];
};

let cachedBeds24AccessToken: { token: string; expiresAt: number } | null = null;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}


function toIsoDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function lastNightToCheckout(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return d.toISOString().slice(0, 10);
}

function sanitizeRawPayload(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value)) as Database["public"]["Tables"]["reservations"]["Insert"]["raw_payload"];
  } catch {
    return {};
  }
}

function toJstDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Operational completeness window (Asia/Tokyo), keyed by ARRIVAL/stay overlap — never by booking
// date. A reservation made a year ago whose check-in falls inside this window is still pulled, because
// the query filters `arrivalTo`/`departureFrom`, not creation time. The window spans the CURRENT month
// plus the next TWO months (3 months total): any check-in in "당월 + 미래 2달" must never be missing.
// `month` is 1-indexed here while Date.UTC's month arg is 0-indexed; `month + 2` therefore lands on the
// first day of the month AFTER the third covered month (e.g. Jul → Oct 1, covering Jul/Aug/Sep).
function getOperationalWindow() {
  const today = toJstDateString(new Date());
  const currentJstMonth = today.slice(0, 7);
  const [year, month] = currentJstMonth.split("-").map(Number);
  const from = `${currentJstMonth}-01`;
  const toExclusive = new Date(Date.UTC(year, month + 2, 1)).toISOString().slice(0, 10);
  return { from, toExclusive };
}

function buildBookingsUrls(baseUrl: string, from: string, toExclusive: string, status?: "cancelled") {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const variants =
    status === "cancelled"
      ? [
          `arrivalTo=${toExclusive}&departureFrom=${from}&status=cancelled`,
          `from=${from}&to=${toExclusive}&status=cancelled`,
          `dateFrom=${from}&dateTo=${toExclusive}&status=cancelled`,
          `start=${from}&end=${toExclusive}&status=cancelled`,
        ]
      : [
          `arrivalTo=${toExclusive}&departureFrom=${from}`,
          `arrivalTo=${toExclusive}&departureFrom=${from}&status=confirmed`,
          `from=${from}&to=${toExclusive}`,
          `dateFrom=${from}&dateTo=${toExclusive}`,
          `start=${from}&end=${toExclusive}`,
        ];
  return variants.map((query) => `${normalizedBase}/bookings?${query}`);
}

async function resolveBeds24AccessToken(): Promise<Beds24AccessTokenState> {
  const env = getOptionalBeds24ApiEnv();
  if (!env) return { ok: false, skipped: "reservations:missing-env" };
  if (env.accessToken) return { ok: true, token: env.accessToken };
  if (!env.refreshToken) return { ok: false, skipped: "reservations:missing-token" };

  if (cachedBeds24AccessToken && cachedBeds24AccessToken.expiresAt > Date.now() + 60_000) {
    return { ok: true, token: cachedBeds24AccessToken.token };
  }

  try {
    const response = await fetch(`${env.baseUrl.replace(/\/$/, "")}/authentication/token`, {
      method: "GET",
      headers: { accept: "application/json", refreshToken: env.refreshToken },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        skipped:
          response.status === 401 || response.status === 403
            ? "reservations:refresh-token-invalid"
            : `reservations:refresh-http-${response.status}`,
      };
    }
    const json = (await response.json()) as { token?: unknown; expiresIn?: unknown };
    const token = typeof json.token === "string" && json.token.trim().length > 0 ? json.token.trim() : null;
    const expiresIn = typeof json.expiresIn === "number" && Number.isFinite(json.expiresIn) ? json.expiresIn : 3600;
    if (!token) return { ok: false, skipped: "reservations:refresh-missing-token" };
    cachedBeds24AccessToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
    return { ok: true, token };
  } catch {
    return { ok: false, skipped: "reservations:refresh-request-error" };
  }
}

type Beds24BookingsEnvelope = {
  count?: number;
  data?: unknown;
  items?: unknown;
  results?: unknown;
  pages?: {
    nextPageExists?: boolean;
    nextPageLink?: string;
  } | null;
};

function mergeBookingRows(primary: JsonRecord[], secondary: JsonRecord[]) {
  const merged = new Map<string, JsonRecord>();
  for (const row of [...primary, ...secondary]) {
    const id = readBeds24BookingId(row);
    if (!id) continue;
    const existing = merged.get(id);
    if (!existing) {
      merged.set(id, row);
      continue;
    }
    const existingCancelled = resolveReservationStatusFromBeds24Record(existing) === "cancelled";
    const nextCancelled = resolveReservationStatusFromBeds24Record(row) === "cancelled";
    if (nextCancelled && !existingCancelled) {
      merged.set(id, row);
    }
  }
  return [...merged.values()];
}

async function fetchBookingsFromUrl(
  url: string,
  token: string,
): Promise<{
  rows: JsonRecord[];
  partial: boolean;
  failedPageUrl: string | null;
  skippedReason: string | null;
}> {
  const rows: JsonRecord[] = [];
  const seenPageUrls = new Set<string>();
  let nextUrl: string | null = url;
  let pageCount = 0;
  let failedPageUrl: string | null = null;
  let skippedReason: string | null = null;

  while (nextUrl && !seenPageUrls.has(nextUrl) && pageCount < 50) {
    seenPageUrls.add(nextUrl);
    pageCount += 1;

    const response = await fetch(nextUrl, {
      headers: { accept: "application/json", token },
      cache: "no-store",
    });
    if (!response.ok) {
      skippedReason = `reservations:http-${response.status}`;
      failedPageUrl = nextUrl;
      return { rows: [], partial: true, failedPageUrl, skippedReason };
    }

    const json = (await response.json()) as Beds24BookingsEnvelope | unknown;
    rows.push(...extractBeds24BookingCandidates(json));

    const envelope = asRecord(json) as Beds24BookingsEnvelope | null;
    const nextPageLink =
      envelope?.pages?.nextPageExists && typeof envelope.pages.nextPageLink === "string"
        ? envelope.pages.nextPageLink
        : null;
    nextUrl = nextPageLink;
  }

  return { rows, partial: false, failedPageUrl: null, skippedReason: null };
}

async function fetchBookingsVariant(
  urls: string[],
  token: string,
): Promise<{
  endpointTried: string | null;
  rows: JsonRecord[];
  partial: boolean;
  failedPageUrl: string | null;
  skippedReason: string | null;
}> {
  let lastEndpoint: string | null = null;
  let lastSkippedReason: string | null = null;

  for (const url of urls) {
    lastEndpoint = url;
    try {
      const result = await fetchBookingsFromUrl(url, token);
      if (result.partial) {
        return {
          endpointTried: url,
          rows: result.rows,
          partial: true,
          failedPageUrl: result.failedPageUrl,
          skippedReason: result.skippedReason ?? "reservations:partial-pagination-failed",
        };
      }
      if (result.rows.length > 0) {
        return {
          endpointTried: url,
          rows: result.rows,
          partial: false,
          failedPageUrl: null,
          skippedReason: null,
        };
      }
      lastSkippedReason = "reservations:no-bookings";
    } catch {
      lastSkippedReason = "reservations:request-error";
    }
  }

  return {
    endpointTried: lastEndpoint,
    rows: [],
    partial: false,
    failedPageUrl: null,
    skippedReason: lastSkippedReason ?? "reservations:no-bookings",
  };
}

async function fetchBeds24Bookings(from: string, toExclusive: string) {
  const env = getOptionalBeds24ApiEnv();
  if (!env) {
    return {
      endpointTried: null,
      rows: [] as JsonRecord[],
      skippedReason: "reservations:missing-env",
      partial: false,
      failedPageUrl: null as string | null,
    };
  }
  const tokenState = await resolveBeds24AccessToken();
  if (!tokenState.ok) {
    return {
      endpointTried: null,
      rows: [] as JsonRecord[],
      skippedReason: tokenState.skipped,
      partial: false,
      failedPageUrl: null as string | null,
    };
  }

  const activeUrls = buildBookingsUrls(env.baseUrl, from, toExclusive);
  const cancelledUrls = buildBookingsUrls(env.baseUrl, from, toExclusive, "cancelled");

  const activeResult = await fetchBookingsVariant(activeUrls, tokenState.token);
  const cancelledResult = await fetchBookingsVariant(cancelledUrls, tokenState.token);
  const rows = mergeBookingRows(activeResult.rows, cancelledResult.rows);

  const partial = activeResult.partial || cancelledResult.partial;
  const failedPageUrl = activeResult.failedPageUrl ?? cancelledResult.failedPageUrl;
  const endpointTried = cancelledResult.endpointTried ?? activeResult.endpointTried;
  const skippedReason =
    rows.length > 0
      ? null
      : activeResult.skippedReason ?? cancelledResult.skippedReason ?? "reservations:no-bookings";

  return {
    endpointTried,
    rows,
    skippedReason,
    partial: partial && rows.length === 0,
    failedPageUrl,
  };
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function backfillBeds24Reservations(
  supabase: SupabaseClient<Database>,
  options?: { organizationId?: string; dryRun?: boolean; from?: string; toExclusive?: string },
): Promise<Beds24ReservationsBackfillResult> {
  // Default window = current + next operational month (used by the daily reconcile cron and webhooks).
  // A one-time wide catch-up (e.g. the dev backfill route) may override both bounds to pull far-future
  // reservations the narrow window would never reach. Both bounds must be provided together.
  const { from, toExclusive } =
    isIsoDate(options?.from) && isIsoDate(options?.toExclusive)
      ? { from: options.from, toExclusive: options.toExclusive }
      : getOperationalWindow();

  const { endpointTried, rows, skippedReason, partial, failedPageUrl } = await fetchBeds24Bookings(from, toExclusive);
  if (rows.length === 0 || partial) {
    const skipReasons = [skippedReason ?? "reservations:no-bookings"];
    if (partial) {
      skipReasons.unshift("reservations:partial-pagination-failed");
    }
    return {
      attempted: skippedReason !== "reservations:missing-env",
      endpointTried,
      from,
      toExclusive,
      partial,
      failedPageUrl,
      fetchedRows: 0,
      upsertedRows: 0,
      cancelledUpsertedRows: 0,
      skippedRows: 0,
      recoveredRows: 0,
      skipped: skipReasons,
      skippedReasons: [],
    };
  }

  let propertyQuery = supabase
    .from("properties")
    .select("organization_id, name, external_property_id")
    .eq("external_provider", "beds24")
    .not("external_property_id", "is", null);

  if (options?.organizationId) {
    propertyQuery = propertyQuery.eq("organization_id", options.organizationId);
  }

  const propertiesResult = await propertyQuery;
  if (propertiesResult.error) {
    throw new Error(`beds24 reservations backfill property query failed: ${propertiesResult.error.message}`);
  }

  const propertyRows = (propertiesResult.data ?? []) as Array<{
    organization_id: string;
    name: string;
    external_property_id: string | null;
  }>;
  const orgByExternalPropertyId = new Map<string, string>();
  const propertyNameByExternalPropertyId = new Map<string, string>();
  for (const row of propertyRows) {
    const ext = row.external_property_id?.trim();
    if (!ext) continue;
    orgByExternalPropertyId.set(ext, row.organization_id);
    propertyNameByExternalPropertyId.set(ext, row.name);
  }

  const bookingRows: BookingRow[] = [];
  const skippedReasons: BackfillSkippedReason[] = [];

  for (const row of rows) {
    const sourceReservationId = readString(row, [
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
    const checkInDate = toIsoDate(readString(row, ["firstNight", "first_night", "checkIn", "arrival", "startDate"]));
    const checkOutDate =
      lastNightToCheckout(readString(row, ["lastNight", "last_night"])) ??
      toIsoDate(readString(row, ["checkOut", "departure", "endDate"]));
    const propertyExternalId = readString(row, ["propId", "prop_id", "propertyId", "property_id"]);
    const propertyName = readString(row, ["propName", "prop_name", "propertyName", "property_name"]);
    // Real Beds24 /bookings payloads in this account expose the joinable room
    // identity in roomId. unitId is a local unit index and must stay fallback-only.
    const externalRoomId = readString(row, ["roomId", "room_id", "unitId", "unit_id"]);
    const roomLabel = readString(row, ["unitName", "unit_name", "roomName", "room_name", "roomLabel"]);
    const guestFirstName = readString(row, ["guestFirstName", "guest_first_name", "firstName", "first_name"]);
    const guestLastName = readString(row, ["guestLastName", "guest_last_name", "lastName", "last_name"]);
    const guestFullName = [guestFirstName, guestLastName].filter(Boolean).join(" ").trim();
    const guestName = guestFullName.length > 0 ? guestFullName : readString(row, ["guestName", "customerName", "name"]);
    const source = normalizeReservationSource(
      readString(row, ["referer", "source", "channel", "bookingSource", "booking_source"]) ?? "beds24",
    );
    const status = resolveReservationStatusFromBeds24Record(row);

    if (!sourceReservationId || !checkInDate || !checkOutDate || !guestName) {
      const missing = [
        !sourceReservationId && "sourceReservationId",
        !checkInDate && "checkInDate",
        !checkOutDate && "checkOutDate",
        !guestName && "guestName",
      ].filter(Boolean);
      console.warn("[beds24/backfill] skip:missing_required_fields", {
        sourceReservationId,
        guestName,
        propertyName,
        propertyExternalId,
        checkInDate,
        checkOutDate,
        missing,
      });
      skippedReasons.push({ sourceReservationId, guestName, propertyName, checkInDate, reason: "missing_required_fields" });
      continue;
    }

    // Prefer the operator-controlled property MASTER name (resolved by external
    // property id) over the per-booking payload propName. Beds24 responses carry
    // propName inconsistently — some bookings omit it and fall back to the raw
    // property id — so trusting the payload split one building ("Kabukicho") into
    // two ("Kabukicho" + "176431"). The master name is the single source of truth.
    // See docs/planning/01-decision-log.md → 2026-07-22.
    const masterPropertyName = propertyExternalId
      ? propertyNameByExternalPropertyId.get(propertyExternalId) ?? null
      : null;
    const resolvedPropertyName = masterPropertyName || propertyName || null;
    if (!resolvedPropertyName) {
      console.warn("[beds24/backfill] skip:property_name_unresolved", {
        sourceReservationId,
        propertyExternalId,
        guestName,
        checkInDate,
      });
      skippedReasons.push({ sourceReservationId, guestName, propertyName: null, checkInDate, reason: "property_name_unresolved" });
      continue;
    }

    bookingRows.push({
      externalRoomId,
      sourceReservationId,
      source,
      propertyExternalId,
      propertyName: resolvedPropertyName,
      roomLabel: roomLabel ?? "",
      guestName,
      checkInDate,
      checkOutDate,
      status,
      rawPayload: sanitizeRawPayload(row),
    });
  }

  let upsertedRows = 0;
  let cancelledUpsertedRows = 0;
  let skippedRows = 0;
  const dryRun = options?.dryRun ?? false;

  const roomResult = await supabase
    .from("rooms")
    .select("organization_id, external_room_id, room_label")
    .eq("external_provider", "beds24")
    .not("external_room_id", "is", null);
  if (roomResult.error) {
    throw new Error(`beds24 reservations backfill room query failed: ${roomResult.error.message}`);
  }
  const roomRows = (roomResult.data ?? []) as Array<{
    organization_id: string;
    external_room_id: string | null;
    room_label: string;
  }>;
  const roomLabelByExternalRoom = new Map<string, string>();
  for (const row of roomRows) {
    const ext = row.external_room_id?.trim();
    if (!ext) continue;
    roomLabelByExternalRoom.set(`${row.organization_id}:${ext}`, row.room_label);
  }

  // Resolve every booking to a final reservation row in memory first, then write in
  // bulk. Per-row upserts (one network round-trip each) were the bottleneck: ~hundreds
  // of sequential round-trips from a serverless function exceeded the 60s timeout. A
  // chunked bulk upsert collapses that to a handful of round-trips.
  type PreparedRow = {
    row: Database["public"]["Tables"]["reservations"]["Insert"];
    cancelled: boolean;
  };
  const preparedByKey = new Map<string, PreparedRow>();

  for (const booking of bookingRows) {
    const organizationId =
      (booking.propertyExternalId ? orgByExternalPropertyId.get(booking.propertyExternalId) : undefined) ??
      options?.organizationId;
    if (!organizationId) {
      skippedRows += 1;
      console.warn("[beds24/backfill] skip:organization_id_not_found", {
        sourceReservationId: booking.sourceReservationId,
        propertyExternalId: booking.propertyExternalId,
        propertyName: booking.propertyName,
        guestName: booking.guestName,
        checkInDate: booking.checkInDate,
      });
      skippedReasons.push({
        sourceReservationId: booking.sourceReservationId,
        guestName: booking.guestName,
        propertyName: booking.propertyName,
        checkInDate: booking.checkInDate,
        reason: "organization_id_not_found",
      });
      continue;
    }

    const resolvedRoomLabelFromExternalId =
      booking.externalRoomId && roomLabelByExternalRoom.has(`${organizationId}:${booking.externalRoomId}`)
        ? roomLabelByExternalRoom.get(`${organizationId}:${booking.externalRoomId}`) ?? null
        : null;
    const resolvedRoomLabel = (resolvedRoomLabelFromExternalId ?? booking.roomLabel).trim();

    // Store with "(unknown)" when room label can't be resolved rather than silently dropping.
    // This preserves the reservation record; recoverReservationsRoomLabels can fix it later.
    const finalRoomLabel = resolvedRoomLabel || "(unknown)";
    if (!resolvedRoomLabel) {
      console.warn("[beds24/backfill] warn:room_label_unresolved — storing as (unknown)", {
        sourceReservationId: booking.sourceReservationId,
        guestName: booking.guestName,
        propertyName: booking.propertyName,
        externalRoomId: booking.externalRoomId,
        checkInDate: booking.checkInDate,
      });
      skippedReasons.push({
        sourceReservationId: booking.sourceReservationId,
        guestName: booking.guestName,
        propertyName: booking.propertyName,
        checkInDate: booking.checkInDate,
        reason: "room_label_unresolved_stored_as_unknown",
      });
    }

    const storedReservationId = toStoredReservationId(booking.sourceReservationId, finalRoomLabel);
    // Dedup on the table's unique key so one bulk statement never tries to affect the
    // same row twice (Postgres ON CONFLICT rejects that). Last write wins.
    preparedByKey.set(`${organizationId}:${booking.source}:${storedReservationId}`, {
      cancelled: booking.status === "cancelled",
      row: {
        organization_id: organizationId,
        source: booking.source,
        source_reservation_id: storedReservationId,
        property_name: booking.propertyName,
        room_label: finalRoomLabel,
        guest_name: booking.guestName,
        check_in_date: booking.checkInDate,
        check_out_date: booking.checkOutDate,
        status: booking.status,
        raw_payload: booking.rawPayload,
      },
    });
  }

  const prepared = [...preparedByKey.values()];

  if (dryRun) {
    upsertedRows = prepared.length;
    cancelledUpsertedRows = prepared.filter((item) => item.cancelled).length;
  } else {
    const CHUNK_SIZE = 500;
    for (let offset = 0; offset < prepared.length; offset += CHUNK_SIZE) {
      const chunk = prepared.slice(offset, offset + CHUNK_SIZE);
      const upsertResult = await supabase
        .from("reservations")
        .upsert(chunk.map((item) => item.row) as never, {
          onConflict: "organization_id,source,source_reservation_id",
        });

      if (upsertResult.error) {
        skippedRows += chunk.length;
        console.error("[beds24/backfill] skip:bulk_upsert_failed", {
          chunkSize: chunk.length,
          error: upsertResult.error.message,
        });
        skippedReasons.push({
          sourceReservationId: null,
          guestName: null,
          propertyName: null,
          checkInDate: null,
          reason: `bulk_upsert_failed:${upsertResult.error.message}`,
        });
        continue;
      }
      upsertedRows += chunk.length;
      cancelledUpsertedRows += chunk.filter((item) => item.cancelled).length;
    }
  }

  if (process.env.NODE_ENV === "development") {
    const trueSkipped = skippedRows + (bookingRows.length - upsertedRows - skippedRows);
    if (rows.length > 0 && trueSkipped > rows.length * 0.1) {
      console.warn("[beds24/backfill] high skip rate detected", {
        fetchedRows: rows.length,
        parsedRows: bookingRows.length,
        upsertedRows,
        skippedRows: trueSkipped,
        skipRate: `${Math.round((trueSkipped / rows.length) * 100)}%`,
      });
    }
  }

  let recoveredRows = 0;
  if (!dryRun) {
    try {
      const recoveryResult = await recoverReservationsRoomLabels(supabase, options?.organizationId);
      recoveredRows = recoveryResult.recovered;
      if (recoveryResult.errors.length > 0) {
        console.error("[beds24/backfill] recovery routine encountered errors", recoveryResult.errors);
      }
    } catch (err) {
      console.error("[beds24/backfill] failed to run recovery routine", err);
    }
  }

  return {
    attempted: true,
    endpointTried,
    from,
    toExclusive,
    partial: false,
    failedPageUrl: null,
    fetchedRows: rows.length,
    upsertedRows,
    cancelledUpsertedRows,
    skippedRows: skippedRows + Math.max(0, bookingRows.length - upsertedRows - skippedRows),
    recoveredRows,
    skipped: [],
    skippedReasons,
  };
}

export async function recoverReservationsRoomLabels(
  supabase: SupabaseClient<Database>,
  organizationId?: string,
): Promise<{ processed: number; recovered: number; errors: string[] }> {
  // 1. Fetch active rooms to build a mapping from external_room_id -> room_label
  let roomQuery = supabase
    .from("rooms")
    .select("organization_id, external_room_id, room_label")
    .eq("external_provider", "beds24")
    .not("external_room_id", "is", null);

  if (organizationId) {
    roomQuery = roomQuery.eq("organization_id", organizationId);
  }

  const roomResult = await roomQuery;
  if (roomResult.error) {
    return { processed: 0, recovered: 0, errors: [roomResult.error.message] };
  }

  const roomMap = new Map<string, string>(); // key: "orgId:externalRoomId", value: room_label
  const recoveryRoomRows = (roomResult.data ?? []) as Array<{
    organization_id: string;
    external_room_id: string | null;
    room_label: string;
  }>;
  for (const r of recoveryRoomRows) {
    const ext = r.external_room_id?.trim();
    if (!ext) continue;
    roomMap.set(`${r.organization_id}:${ext}`, r.room_label);
  }

  // 2. Fetch existing reservations to check for mapping mismatch.
  // Do not filter by source = "beds24": real rows are stored with channel names
  // such as Booking.com / Airbnb, so historical broken rows would be skipped.
  let resQuery = supabase
    .from("reservations")
    .select("id, organization_id, source, source_reservation_id, room_label, raw_payload")
    .not("raw_payload", "is", null);

  if (organizationId) {
    resQuery = resQuery.eq("organization_id", organizationId);
  }

  const resResult = await resQuery;
  if (resResult.error) {
    return { processed: 0, recovered: 0, errors: [resResult.error.message] };
  }

  let processed = 0;
  let recovered = 0;
  const errors: string[] = [];

  const reservationRows = (resResult.data ?? []) as Array<{
    id: string;
    organization_id: string;
    source: string;
    source_reservation_id: string;
    room_label: string;
    raw_payload: unknown;
  }>;
  for (const res of reservationRows) {
    processed++;
    const raw = asRecord(res.raw_payload);
    if (!raw) continue;

    // Historical rows may have mixed payload shapes, but the joinable room key
    // is roomId when present. Keep unitId as a last-resort fallback only.
    const rawRoomId = readString(raw, ["roomId", "room_id", "unitId", "unit_id"]);
    if (!rawRoomId) continue;

    const expectedRoomLabel = roomMap.get(`${res.organization_id}:${rawRoomId}`);
    if (expectedRoomLabel && expectedRoomLabel !== res.room_label) {
      // Compute the corrected source_reservation_id using the resolved room label.
      // This prevents duplicate rows: if we only fix room_label but leave source_reservation_id
      // as "...::room::(unknown)", the next backfill/webhook will create a new "...::room::5F"
      // row instead of updating the existing one.
      const originalId = toOriginalReservationId(res.source_reservation_id);
      const correctedSourceId = toStoredReservationId(originalId, expectedRoomLabel);

      // Check whether a properly-labeled row already exists (dedup scenario:
      // backfill already created "...::room::5F" before recovery ran).
      const { data: conflictRow } = await supabase
        .from("reservations")
        .select("id")
        .eq("organization_id", res.organization_id)
        .eq("source", res.source)
        .eq("source_reservation_id", correctedSourceId)
        .maybeSingle();

      if (conflictRow) {
        // A properly-labeled row already exists — delete the stale (unknown) row.
        console.warn("[beds24/recovery] dedup: deleting stale (unknown) row in favor of resolved row", {
          staleId: res.id,
          keptId: (conflictRow as { id: string }).id,
          originalId,
          correctedSourceId,
        });
        const deleteResult = await supabase
          .from("reservations")
          .delete()
          .eq("id", res.id);
        if (deleteResult.error) {
          errors.push(`Failed to delete stale reservation ${res.id}: ${deleteResult.error.message}`);
        } else {
          recovered++;
        }
      } else {
        // No conflict — update room_label and source_reservation_id atomically.
        const updateResult = await supabase
          .from("reservations")
          .update({ room_label: expectedRoomLabel, source_reservation_id: correctedSourceId } as never)
          .eq("id", res.id);
        if (updateResult.error) {
          errors.push(`Failed to update reservation ${res.id}: ${updateResult.error.message}`);
        } else {
          recovered++;
        }
      }
    }
  }

  return { processed, recovered, errors };
}

export async function recoverReservationRoomLabelById(
  supabase: SupabaseClient<Database>,
  reservationId: string,
  organizationId: string,
): Promise<{ recovered: boolean; roomLabel: string | null }> {
  const reservationResult = await supabase
    .from("reservations")
    .select("id, organization_id, source, source_reservation_id, room_label, raw_payload")
    .eq("id", reservationId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (reservationResult.error || !reservationResult.data) {
    return { recovered: false, roomLabel: null };
  }

  const reservation = reservationResult.data as {
    id: string;
    organization_id: string;
    source: string;
    source_reservation_id: string;
    room_label: string;
    raw_payload: unknown;
  };

  const raw = asRecord(reservation.raw_payload);
  if (!raw) return { recovered: false, roomLabel: null };

  const rawRoomId = readString(raw, ["roomId", "room_id", "unitId", "unit_id"]);
  if (!rawRoomId) return { recovered: false, roomLabel: null };

  const roomResult = await supabase
    .from("rooms")
    .select("room_label")
    .eq("organization_id", organizationId)
    .eq("external_room_id", rawRoomId)
    .limit(1)
    .maybeSingle();

  const expectedRoomLabel = (roomResult.data as { room_label: string } | null)?.room_label ?? null;
  if (!expectedRoomLabel || expectedRoomLabel === reservation.room_label) {
    return { recovered: false, roomLabel: expectedRoomLabel };
  }

  const originalId = toOriginalReservationId(reservation.source_reservation_id);
  const correctedSourceId = toStoredReservationId(originalId, expectedRoomLabel);

  const { data: conflictRow } = await supabase
    .from("reservations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("source_reservation_id", correctedSourceId)
    .neq("id", reservation.id)
    .maybeSingle();

  if (conflictRow) {
    console.warn("[beds24/recovery] dedup: deleting stale row during single recovery", {
      staleId: reservation.id,
      keptId: (conflictRow as { id: string }).id,
      originalId,
      correctedSourceId,
    });
    const deleteResult = await supabase.from("reservations").delete().eq("id", reservation.id);
    if (deleteResult.error) {
      return { recovered: false, roomLabel: null };
    }
    return { recovered: true, roomLabel: expectedRoomLabel };
  }

  const updateResult = await supabase
    .from("reservations")
    .update({ room_label: expectedRoomLabel, source_reservation_id: correctedSourceId } as never)
    .eq("id", reservation.id);

  if (updateResult.error) {
    return { recovered: false, roomLabel: null };
  }

  return { recovered: true, roomLabel: expectedRoomLabel };
}
