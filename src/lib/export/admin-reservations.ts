import {
  getCanonicalPropertyName,
  getDisplayRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";
import {
  buildPropertyRoomLookups,
  getActiveRoomCatalog,
  getActiveRoomLabels,
} from "@/lib/rooms";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ReservationStatus = Database["public"]["Enums"]["reservation_status"];
type ReservationRow = Pick<
  Database["public"]["Tables"]["reservations"]["Row"],
  | "id"
  | "check_in_date"
  | "check_out_date"
  | "guest_name"
  | "property_name"
  | "room_label"
  | "status"
  | "raw_payload"
>;

export type AdminReservationExportRow = {
  id: string;
  checkInDate: string;
  checkOutDate: string;
  guestName: string;
  propertyName: string;
  roomLabel: string;
  status: ReservationStatus;
};

function toJstDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isValidMonth(value: string | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function normalizePropertyParam(value: string | undefined): string | null {
  if (!value) return null;
  const canonical = getCanonicalPropertyName(value.trim());
  return canonical.length > 0 ? canonical : null;
}

export type AdminReservationExportFilters = {
  month?: string;
  property?: string;
};

export type AdminReservationExportResult = {
  isOutOfWindow: boolean;
  month: string;
  property: string | null;
  rows: AdminReservationExportRow[];
};

export async function getAdminReservationsForExport(
  session: AppSession,
  filters: AdminReservationExportFilters,
): Promise<AdminReservationExportResult> {
  const today = toJstDateString(new Date());
  const currentMonth = today.slice(0, 7);
  const selectedMonth = isValidMonth(filters.month) ? filters.month : currentMonth;
  const selectedProperty = normalizePropertyParam(filters.property);

  const [opY, opM] = currentMonth.split("-").map(Number);
  const opWindowStart = `${currentMonth}-01`;
  const opWindowEnd = new Date(Date.UTC(opY, opM + 1, 1)).toISOString().slice(0, 10);
  const nextJstMonth = new Date(Date.UTC(opY, opM, 1)).toISOString().slice(0, 7);
  const isOutOfWindow =
    selectedMonth !== currentMonth && selectedMonth !== nextJstMonth;

  const [y] = selectedMonth.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, Number(selectedMonth.split("-")[1]), 1))
    .toISOString()
    .slice(0, 7);
  const monthStart = `${selectedMonth}-01`;
  const monthEndExclusive = `${nextMonth}-01`;

  const supabase = await getSupabaseServerClient();
  const [roomCatalog, roomMasterRooms] = await Promise.all([
    getActiveRoomCatalog(session.organization.id, supabase),
    getActiveRoomLabels(session.organization.id, supabase),
  ]);

  const propertyOptions = [
    ...new Set((roomCatalog ?? []).map((c) => c.propertyName)),
  ].filter((p) => !isExcludedOperationalProperty(p));
  const effectiveProperty =
    selectedProperty && propertyOptions.includes(selectedProperty)
      ? selectedProperty
      : null;

  const rows: AdminReservationExportRow[] = [];

  if (!isOutOfWindow && !Number.isNaN(y)) {
    const roomLookups = buildPropertyRoomLookups(roomCatalog ?? []);
    const globalExternalRoomToCanonical = new Map<string, string>(
      (roomCatalog ?? [])
        .filter((c) => c.externalRoomId !== null)
        .map((c) => [c.externalRoomId as string, c.canonicalRoomLabel]),
    );

    const { data, error } = await supabase
      .from("reservations")
      .select(
        "id, check_in_date, check_out_date, guest_name, property_name, room_label, status, raw_payload",
      )
      .eq("organization_id", session.organization.id)
      .lt("check_in_date", opWindowEnd)
      .gte("check_out_date", opWindowStart)
      .neq("status", "cancelled")
      .neq("status", "no_show")
      .order("check_in_date", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const reservationRows = (data ?? []) as ReservationRow[];
    const isAuthoritative = roomMasterRooms !== undefined;

    for (const row of reservationRows) {
      if (isExcludedOperationalProperty(row.property_name)) continue;
      if (isExcludedOperationalRoom(row.property_name, row.room_label)) continue;

      const canonicalProperty = getCanonicalPropertyName(row.property_name);
      const rawLabelMap = roomLookups.canonicalByRawLabel[canonicalProperty] ?? {};
      const externalIdMap = roomLookups.canonicalByExternalId[canonicalProperty] ?? {};

      const payloadUnitId = (() => {
        if (
          !row.raw_payload ||
          typeof row.raw_payload !== "object" ||
          Array.isArray(row.raw_payload)
        ) {
          return null;
        }
        const record = row.raw_payload as Record<string, unknown>;
        for (const key of ["roomId", "room_id", "unitId", "unit_id"]) {
          if (typeof record[key] === "string") return record[key] as string;
          if (typeof record[key] === "number") return String(record[key]);
        }
        return null;
      })();

      let internalKey: string | null = null;
      const allowed =
        roomLookups.allowedCanonicalByProperty[canonicalProperty] ?? new Set<string>();

      if (payloadUnitId) {
        const fromExternal =
          externalIdMap[payloadUnitId] ??
          globalExternalRoomToCanonical.get(payloadUnitId) ??
          null;
        if (fromExternal && allowed.has(fromExternal)) {
          internalKey = fromExternal;
        } else if (isAuthoritative && fromExternal) {
          continue;
        }
      }

      if (!internalKey) {
        const exactMatch = rawLabelMap[row.room_label];
        if (exactMatch && allowed.has(exactMatch)) {
          internalKey = exactMatch;
        }
      }

      if (!internalKey) {
        const normalized = (() => {
          try {
            return getDisplayRoomLabel(canonicalProperty, row.room_label);
          } catch {
            return row.room_label;
          }
        })();
        if (normalized && allowed.has(normalized)) {
          internalKey = normalized;
        } else if (isAuthoritative) {
          continue;
        } else {
          internalKey = normalized || row.room_label;
        }
      }

      const displayRoom = getDisplayRoomLabel(canonicalProperty, internalKey);
      if (effectiveProperty && canonicalProperty !== effectiveProperty) continue;
      if (row.check_in_date >= monthEndExclusive) continue;
      if (row.check_out_date <= monthStart) continue;

      rows.push({
        id: row.id,
        checkInDate: row.check_in_date,
        checkOutDate: row.check_out_date,
        guestName: row.guest_name,
        propertyName: canonicalProperty,
        roomLabel: displayRoom,
        status: row.status,
      });
    }
  }

  return {
    isOutOfWindow,
    month: selectedMonth,
    property: effectiveProperty,
    rows,
  };
}
