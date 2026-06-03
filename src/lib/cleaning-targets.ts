import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";
import { getCleaningOperatingDateKey } from "@/lib/cleaning";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Room key = canonical property + "_" + canonical room — used for deduplication and turnover detection.
function buildRoomKey(canonicalProperty: string, canonicalRoom: string) {
  return `${canonicalProperty}_${canonicalRoom}`;
}

// Label stored in cleaning_sessions.room_label.
// Okubo buildings return the property name as the canonical room, so no prefix needed.
function buildSessionRoomLabel(canonicalProperty: string, canonicalRoom: string) {
  return canonicalRoom === canonicalProperty
    ? canonicalRoom
    : `${canonicalProperty} ${canonicalRoom}`;
}

function getPax(rawPayload: unknown): number | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const r = rawPayload as Record<string, unknown>;
  for (const key of [
    "numAdult", "num_adult", "num_adults", "adults",
    "guestCount", "guest_count", "pax", "persons", "guests",
  ]) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
    if (typeof v === "string") {
      const n = Number(v.trim());
      if (Number.isFinite(n)) return Math.max(0, Math.round(n));
    }
  }
  return null;
}

function addCalendarDays(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type ResRow = {
  id: string;
  check_in_date: string;
  check_out_date: string;
  guest_name: string;
  property_name: string;
  room_label: string;
  raw_payload: unknown;
};

export type CleaningTarget = {
  roomKey: string;
  sessionRoomLabel: string;
  canonicalPropertyName: string;
  canonicalRoomLabel: string;
  checkOutDate: string;
  departingGuestName: string;
  hasTurnover: boolean;
  // populated when hasTurnover === true
  arrivingGuestName: string | null;
  arrivingPax: number | null;
  // populated when hasTurnover === false and next check-in exists within 30 days
  nextCheckInDate: string | null;
  nextCheckInGuestName: string | null;
  nextCheckInPax: number | null;
};

export type SettingTarget = {
  roomKey: string;
  sessionRoomLabel: string;
  canonicalPropertyName: string;
  canonicalRoomLabel: string;
  checkInDate: string;
  arrivingGuestName: string;
  arrivingPax: number | null;
};

export type CleaningTargetsResult = {
  cleaningList: CleaningTarget[];
  settingList: SettingTarget[];
  targetDate: string;
};

export async function getCleaningTargets(organizationId: string): Promise<CleaningTargetsResult> {
  const targetDate = getCleaningOperatingDateKey();
  const windowEnd = addCalendarDays(targetDate, 30);

  const supabase = await getSupabaseServerClient();

  const [depResult, arrResult] = await Promise.all([
    supabase
      .from("reservations")
      .select("id, check_in_date, check_out_date, guest_name, property_name, room_label, raw_payload")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .eq("check_out_date", targetDate),
    supabase
      .from("reservations")
      .select("id, check_in_date, check_out_date, guest_name, property_name, room_label, raw_payload")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .gte("check_in_date", targetDate)
      .lt("check_in_date", windowEnd)
      .order("check_in_date", { ascending: true }),
  ]);

  if (depResult.error) throw new Error(depResult.error.message);
  if (arrResult.error) throw new Error(arrResult.error.message);

  function excluded(row: ResRow) {
    return (
      isExcludedOperationalProperty(row.property_name) ||
      isExcludedOperationalRoom(row.property_name, row.room_label)
    );
  }

  function canonicalize(row: ResRow) {
    const cp = getCanonicalPropertyName(row.property_name);
    const cr = getCanonicalRoomLabel(cp, row.room_label);
    return { cp, cr, key: buildRoomKey(cp, cr) };
  }

  const departures = ((depResult.data ?? []) as ResRow[]).filter((r) => !excluded(r));
  const arrivals = ((arrResult.data ?? []) as ResRow[]).filter((r) => !excluded(r));

  // Map: roomKey → first departure row (edge-case: multiple checkouts same room)
  const departureMap = new Map<string, { row: ResRow; cp: string; cr: string }>();
  for (const row of departures) {
    const { cp, cr, key } = canonicalize(row);
    if (!departureMap.has(key)) departureMap.set(key, { row, cp, cr });
  }

  // Map: roomKey → arrivals sorted ascending by check_in_date (already ordered from DB)
  const arrivalsByKey = new Map<string, ResRow[]>();
  for (const row of arrivals) {
    const { key } = canonicalize(row);
    const list = arrivalsByKey.get(key) ?? [];
    list.push(row);
    arrivalsByKey.set(key, list);
  }

  // Build cleaning list
  const cleaningList: CleaningTarget[] = [];
  for (const [key, { row: dep, cp, cr }] of departureMap) {
    const roomArrivals = arrivalsByKey.get(key) ?? [];
    const todayArrival = roomArrivals.find((a) => a.check_in_date === targetDate) ?? null;
    const hasTurnover = todayArrival !== null;
    const nextArrival = hasTurnover
      ? null
      : (roomArrivals.find((a) => a.check_in_date > targetDate) ?? null);

    cleaningList.push({
      roomKey: key,
      sessionRoomLabel: buildSessionRoomLabel(cp, cr),
      canonicalPropertyName: cp,
      canonicalRoomLabel: cr,
      checkOutDate: dep.check_out_date,
      departingGuestName: dep.guest_name || "Guest",
      hasTurnover,
      arrivingGuestName: todayArrival ? (todayArrival.guest_name || null) : null,
      arrivingPax: todayArrival ? getPax(todayArrival.raw_payload) : null,
      nextCheckInDate: nextArrival ? nextArrival.check_in_date : null,
      nextCheckInGuestName: nextArrival ? (nextArrival.guest_name || null) : null,
      nextCheckInPax: nextArrival ? getPax(nextArrival.raw_payload) : null,
    });
  }

  // Build setting list: today's arrivals whose room is NOT in the departure set
  const settingList: SettingTarget[] = [];
  const settingKeysSeen = new Set<string>();
  for (const row of arrivals) {
    if (row.check_in_date !== targetDate) continue;
    const { cp, cr, key } = canonicalize(row);
    if (departureMap.has(key) || settingKeysSeen.has(key)) continue;
    settingKeysSeen.add(key);
    settingList.push({
      roomKey: key,
      sessionRoomLabel: buildSessionRoomLabel(cp, cr),
      canonicalPropertyName: cp,
      canonicalRoomLabel: cr,
      checkInDate: row.check_in_date,
      arrivingGuestName: row.guest_name || "Guest",
      arrivingPax: getPax(row.raw_payload),
    });
  }

  return { cleaningList, settingList, targetDate };
}
