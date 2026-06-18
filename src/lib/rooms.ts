import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type RawPayload = Database["public"]["Tables"]["reservations"]["Row"]["raw_payload"];

/** Reads the first non-empty string/number value from a reservation raw_payload under any of `keys`. */
export function getRawPayloadString(rawPayload: RawPayload, keys: string[]): string | null {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

/** Catalog row shape needed to resolve a reservation to its active-room canonical key. */
export type ReservationRoomResolveInput = {
  property_name: string;
  room_label: string;
  raw_payload: RawPayload;
};

/**
 * Builds the cross-property externalRoomId → canonical map. Handles property-name mismatch
 * (e.g. Beds24 "荒木町A" not normalizing to canonical "아라키초A"); externalRoomId is globally unique.
 */
export function buildGlobalExternalRoomToCanonical(
  catalog: ActiveRoomCatalogItem[],
): Map<string, string> {
  return new Map(
    catalog
      .filter((item) => item.externalRoomId !== null)
      .map((item) => [item.externalRoomId as string, item.canonicalRoomLabel]),
  );
}

/**
 * Resolves a reservation to its active-room **internal canonical key** (e.g. "402_2"), or null.
 *
 * Single source of truth shared by the reservation calendar and the task context picker so the
 * two never drift. Mirrors the calendar's resolution priority:
 *   raw_payload room/unit id → raw_payload unit name → reservation room_label (exact then normalized).
 * In authoritative mode (room master classified) an unresolved id/label drops the reservation;
 * in provisional mode it falls back to the normalized room_label.
 *
 * Use `getDisplayRoomLabel(canonicalProperty, <result>)` to collapse sub-units (402 / 402_2 → 402).
 */
export function resolveReservationCanonicalRoomLabel(
  item: ReservationRoomResolveInput,
  opts: {
    lookups: PropertyRoomLookups;
    globalExternalRoomToCanonical: Map<string, string>;
    isAuthoritative: boolean;
  },
): string | null {
  const { lookups, globalExternalRoomToCanonical, isAuthoritative } = opts;
  const canonicalPropertyName = getCanonicalPropertyName(item.property_name);
  const allowed = lookups.allowedCanonicalByProperty[canonicalPropertyName] ?? new Set<string>();
  const rawLabelMap = lookups.canonicalByRawLabel[canonicalPropertyName] ?? {};
  const externalIdMap = lookups.canonicalByExternalId[canonicalPropertyName] ?? {};

  const acceptCanonical = (key: string | null | undefined): string | null => {
    if (!key || !allowed.has(key)) return null;
    return key;
  };

  const payloadUnitId = getRawPayloadString(item.raw_payload, [
    "roomId",
    "room_id",
    "unitId",
    "unit_id",
  ]);
  if (payloadUnitId) {
    const fromExternal =
      externalIdMap[payloadUnitId] ?? globalExternalRoomToCanonical.get(payloadUnitId) ?? null;
    const resolved = acceptCanonical(fromExternal);
    if (resolved) return resolved;
    if (isAuthoritative) return null;
  }

  const payloadUnitName = getRawPayloadString(item.raw_payload, [
    "unitName",
    "unit_name",
    "roomName",
    "room_name",
    "roomLabel",
    "unitLabel",
    "unit_label",
    "room_label",
  ]);
  if (payloadUnitName) {
    const exactPayload = acceptCanonical(rawLabelMap[payloadUnitName]);
    if (exactPayload) return exactPayload;
    const normalizedPayload = acceptCanonical(
      getCanonicalRoomLabel(canonicalPropertyName, payloadUnitName),
    );
    if (normalizedPayload) return normalizedPayload;
  }

  const exactRoomLabel = acceptCanonical(rawLabelMap[item.room_label]);
  if (exactRoomLabel) return exactRoomLabel;

  const normalizedRoomLabel = acceptCanonical(
    getCanonicalRoomLabel(canonicalPropertyName, item.room_label),
  );
  if (normalizedRoomLabel) return normalizedRoomLabel;

  if (isAuthoritative) {
    return null;
  }

  if (payloadUnitId) {
    const fromExternal =
      externalIdMap[payloadUnitId] ?? globalExternalRoomToCanonical.get(payloadUnitId) ?? null;
    const resolved = acceptCanonical(fromExternal);
    if (resolved) return resolved;
  }

  return normalizedRoomLabel;
}

// Company internal rule: Beds24 room IDs with minimum_stay >= this threshold are inactive
// for that period and must be excluded from room axis, empty-today counts, and operational lists.
// See docs/engineering/01-beds24-integration.md for full rule documentation.
export const BEDS24_INACTIVE_MIN_STAY_THRESHOLD = 50;

export function isInactiveBeds24Room(minimumStay: number): boolean {
  return minimumStay >= BEDS24_INACTIVE_MIN_STAY_THRESHOLD;
}

export type ActiveRoomCatalogItem = {
  /** Internal key used for reservation matching. Never collapse distinct physical rooms. */
  canonicalRoomLabel: string;
  /** Display label for calendar rows. Strips _N suffix for Arakicho sub-units. */
  displayRoomLabel: string;
  externalRoomId: string | null;
  propertyName: string;
  roomLabel: string;
  /** rooms.id — the physical room row's UUID (for context linking). */
  roomId: string;
  /** rooms.property_id — the owning property's UUID (for context linking). */
  propertyId: string;
};

export type PropertyRoomLookups = {
  allowedCanonicalByProperty: Record<string, Set<string>>;
  canonicalByExternalId: Record<string, Record<string, string>>;
  canonicalByRawLabel: Record<string, Record<string, string>>;
};

export function buildPropertyRoomLookups(
  catalog: ActiveRoomCatalogItem[],
): PropertyRoomLookups {
  const allowedCanonicalByProperty: Record<string, Set<string>> = {};
  const canonicalByExternalId: Record<string, Record<string, string>> = {};
  const canonicalByRawLabel: Record<string, Record<string, string>> = {};

  for (const item of catalog) {
    const { canonicalRoomLabel, propertyName, roomLabel } = item;

    if (!allowedCanonicalByProperty[propertyName]) {
      allowedCanonicalByProperty[propertyName] = new Set<string>();
    }
    allowedCanonicalByProperty[propertyName].add(canonicalRoomLabel);

    if (!canonicalByRawLabel[propertyName]) {
      canonicalByRawLabel[propertyName] = {};
    }
    const labelMap = canonicalByRawLabel[propertyName];
    labelMap[roomLabel] = canonicalRoomLabel;

    const normalizedLabel = getCanonicalRoomLabel(propertyName, roomLabel);
    if (normalizedLabel) {
      labelMap[normalizedLabel] = canonicalRoomLabel;
    }
  }

  for (const item of catalog) {
    if (!item.externalRoomId) continue;
    if (!canonicalByExternalId[item.propertyName]) {
      canonicalByExternalId[item.propertyName] = {};
    }
    canonicalByExternalId[item.propertyName][item.externalRoomId] = item.canonicalRoomLabel;
  }

  return {
    allowedCanonicalByProperty,
    canonicalByExternalId,
    canonicalByRawLabel,
  };
}

function warnDuplicateCanonicalRoomKeys(catalog: ActiveRoomCatalogItem[]) {
  if (process.env.NODE_ENV !== "development") return;

  const seen = new Map<string, string>();
  for (const item of catalog) {
    const dedupeKey = `${item.propertyName}::${item.canonicalRoomLabel}`;
    const previous = seen.get(dedupeKey);
    if (previous && previous !== item.roomLabel) {
      console.warn("[rooms] duplicate canonical room key from different room_label rows", {
        dedupeKey,
        previousRoomLabel: previous,
        nextRoomLabel: item.roomLabel,
        externalRoomId: item.externalRoomId,
      });
    }
    seen.set(dedupeKey, item.roomLabel);
  }
}

// Returns the room_label list for all active rooms in the organization.
// "Active" = status='active' AND:
//   - non-Beds24 room, OR
//   - Beds24 room with an explicit minimum stay value below the inactive threshold.
//
// Beds24 rows with external_minimum_stay = null are excluded on purpose.
// Our company rule needs minimum_stay to decide active vs inactive room IDs, so
// "unknown" must not be treated as active inventory.
//
// Returns undefined while the org does not yet have any classified room-master rows.
// "Classified" means:
//   - non-Beds24 room row, OR
//   - Beds24 room row with external_minimum_stay present.
// Returns string[] (including []) once classified room-master rows exist.
// The calendar component uses undefined vs string[] to switch provisional/authoritative mode.
export async function getActiveRoomLabels(
  organizationId: string,
  supabase: SupabaseClient<Database>,
): Promise<string[] | undefined> {
  const catalog = await getActiveRoomCatalog(organizationId, supabase);
  if (catalog === undefined) {
    return undefined;
  }

  return [...new Set(catalog.map((item) => item.roomLabel))];
}

// Convenience wrapper for RSC/server action contexts that don't already hold a client.
export async function getActiveRoomCatalogServer(
  organizationId: string,
): Promise<ActiveRoomCatalogItem[] | undefined> {
  const supabase = await getSupabaseServerClient();
  return getActiveRoomCatalog(organizationId, supabase);
}

export async function getActiveRoomCatalog(
  organizationId: string,
  supabase: SupabaseClient<Database>,
): Promise<ActiveRoomCatalogItem[] | undefined> {
  const result = await supabase
    .from("rooms")
    .select("id, property_id, room_label, external_room_id, status, external_provider, external_minimum_stay, properties(name)")
    .eq("organization_id", organizationId);

  if (result.error) {
    console.error("[rooms] getActiveRoomLabels query error", result.error);
    return undefined;
  }

  const rows = (result.data ?? []) as Array<{
    id: string;
    property_id: string;
    properties: { name: string } | { name: string }[] | null;
    external_room_id: string | null;
    room_label: string;
    status: Database["public"]["Enums"]["room_status"];
    external_provider: string | null;
    external_minimum_stay: number | null;
  }>;

  // A room row counts as "classified" (org has a usable room master) as soon as it exists.
  // minStay = null no longer disqualifies a beds24 room — unknown min-stay must not hide a
  // real room. Only an explicit >= 50 marks it inactive (applied in the active filter below).
  const classifiedRows = rows;

  if (classifiedRows.length === 0) {
    return undefined;
  }

  const catalog = classifiedRows
    .filter((row) => {
      if (row.status !== "active") {
        return false;
      }
      const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      const propertyName = getCanonicalPropertyName(property?.name?.trim() || "Unknown");
      if (isExcludedOperationalProperty(propertyName)) {
        return false;
      }
      if (isExcludedOperationalRoom(propertyName, row.room_label)) {
        return false;
      }
      if (row.external_provider !== "beds24") {
        return true;
      }
      // null minStay → active (unknown, not yet inventory-synced). Only an explicit
      // >= 50 marks the room inactive, matching classifyBeds24Room in room-sync.ts.
      return (
        row.external_minimum_stay === null ||
        !isInactiveBeds24Room(row.external_minimum_stay)
      );
    })
    .map((row) => {
      const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      const propertyName = getCanonicalPropertyName(property?.name?.trim() || "Unknown");
      const canonicalRoomLabel = getCanonicalRoomLabel(propertyName, row.room_label);
      return {
        canonicalRoomLabel,
        displayRoomLabel: getDisplayRoomLabel(propertyName, canonicalRoomLabel),
        externalRoomId: row.external_room_id,
        propertyName,
        roomLabel: row.room_label,
        roomId: row.id,
        propertyId: row.property_id,
      };
    });

  warnDuplicateCanonicalRoomKeys(catalog);
  return catalog;
}
