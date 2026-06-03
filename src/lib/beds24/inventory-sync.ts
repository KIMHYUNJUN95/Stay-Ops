import type { SupabaseClient } from "@supabase/supabase-js";
import { getOptionalBeds24ApiEnv } from "@/lib/env";
import { classifyBeds24Room } from "@/lib/beds24/room-sync";
import type { Database } from "@/types/database";

type JsonRecord = Record<string, unknown>;

type InventoryRoomMinimumStay = {
  externalRoomId: string;
  minimumStay: number;
};

type Beds24AccessTokenState =
  | {
      ok: true;
      token: string;
    }
  | {
      ok: false;
      skipped: string;
    };

type InventoryFetchResult = {
  endpointTried: string | null;
  rows: InventoryRoomMinimumStay[];
  skippedReason: string | null;
};

export type Beds24InventorySyncResult = {
  attempted: boolean;
  endpointTried: string | null;
  matchedRooms: number;
  updatedRooms: number;
  skipped: string[];
};

export type Beds24InventoryBackfillPropertyResult = {
  organizationId: string;
  propertyId: string;
  propertyName: string;
  externalPropertyId: string;
  inventorySync: Beds24InventorySyncResult;
};

export type Beds24InventoryBackfillResult = {
  targetCount: number;
  syncedCount: number;
  matchedRooms: number;
  updatedRooms: number;
  skippedTargets: number;
  properties: Beds24InventoryBackfillPropertyResult[];
};

let cachedBeds24AccessToken: { token: string; expiresAt: number } | null = null;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
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

function readNumber(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

function toJstDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildInventoryUrls(baseUrl: string, propId: string, date: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const queryVariants = [
    `propId=${encodeURIComponent(propId)}&from=${date}&to=${date}`,
    `propId=${encodeURIComponent(propId)}&dateFrom=${date}&dateTo=${date}`,
    `propId=${encodeURIComponent(propId)}&start=${date}&end=${date}`,
  ];

  return queryVariants.map((query) => `${normalizedBase}/inventory/rooms/calendar?${query}`);
}

function buildPropertiesUrl(baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  return `${normalizedBase}/properties?includeAllRooms=true`;
}

function extractInventoryRows(value: unknown, inheritedRoomId?: string): InventoryRoomMinimumStay[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractInventoryRows(item, inheritedRoomId));
  }

  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const roomId = readString(record, ["unitId", "unit_id", "roomId", "room_id"]) ?? inheritedRoomId;
  const directMinimumStay = readNumber(record, [
    "minimumStay",
    "minimum_stay",
    "minStay",
    "min_stay",
    "minNights",
    "min_nights",
    "minstay",
  ]);

  const results: InventoryRoomMinimumStay[] = [];
  if (roomId && directMinimumStay !== null) {
    results.push({ externalRoomId: roomId, minimumStay: directMinimumStay });
  }

  for (const nestedKey of ["calendar", "rooms", "data", "items", "dates", "values"]) {
    if (record[nestedKey] !== undefined) {
      results.push(...extractInventoryRows(record[nestedKey], roomId));
    }
  }

  return results;
}

function extractPropertyRows(value: unknown, targetPropertyId: string): InventoryRoomMinimumStay[] {
  const root = asRecord(value);
  if (!root) {
    return [];
  }

  const data = root.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const matches: InventoryRoomMinimumStay[] = [];
  for (const propertyCandidate of data) {
    const property = asRecord(propertyCandidate);
    if (!property) continue;

    const propertyId = readString(property, ["id", "propertyId", "property_id"]);
    if (propertyId !== targetPropertyId) {
      continue;
    }

    const roomTypes = property.roomTypes;
    if (!Array.isArray(roomTypes)) {
      continue;
    }

    for (const roomTypeCandidate of roomTypes) {
      const roomType = asRecord(roomTypeCandidate);
      if (!roomType) continue;
      const roomId = readString(roomType, ["id", "roomId", "room_id"]);
      const minimumStay = readNumber(roomType, [
        "minStay",
        "minimumStay",
        "minimum_stay",
        "min_stay",
        "minNights",
        "min_nights",
      ]);

      if (roomId && minimumStay !== null) {
        matches.push({ externalRoomId: roomId, minimumStay });
      }
    }
  }

  return matches;
}

async function resolveBeds24AccessToken(): Promise<Beds24AccessTokenState> {
  const env = getOptionalBeds24ApiEnv();
  if (!env) {
    return { ok: false, skipped: "inventory:missing-env" };
  }

  if (env.accessToken) {
    return { ok: true, token: env.accessToken };
  }

  if (!env.refreshToken) {
    return { ok: false, skipped: "inventory:missing-token" };
  }

  if (cachedBeds24AccessToken && cachedBeds24AccessToken.expiresAt > Date.now() + 60_000) {
    return { ok: true, token: cachedBeds24AccessToken.token };
  }

  try {
    const response = await fetch(`${env.baseUrl.replace(/\/$/, "")}/authentication/token`, {
      method: "GET",
      headers: {
        accept: "application/json",
        refreshToken: env.refreshToken,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[beds24/inventory] access token refresh failed", { status: response.status });
      return {
        ok: false,
        skipped:
          response.status === 401 || response.status === 403
            ? "inventory:refresh-token-invalid"
            : `inventory:refresh-http-${response.status}`,
      };
    }

    const json = (await response.json()) as { token?: unknown; expiresIn?: unknown };
    const token = typeof json.token === "string" && json.token.trim().length > 0 ? json.token.trim() : null;
    const expiresIn = typeof json.expiresIn === "number" && Number.isFinite(json.expiresIn) ? json.expiresIn : 3600;

    if (!token) {
      return { ok: false, skipped: "inventory:refresh-missing-token" };
    }

    cachedBeds24AccessToken = {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    return { ok: true, token };
  } catch (error) {
    console.warn("[beds24/inventory] access token refresh request error", error);
    return { ok: false, skipped: "inventory:refresh-request-error" };
  }
}

async function fetchInventoryMinimumStays(propId: string): Promise<InventoryFetchResult> {
  const env = getOptionalBeds24ApiEnv();
  if (!env) {
    return { endpointTried: null, rows: [], skippedReason: "inventory:missing-env" };
  }

  const accessTokenState = await resolveBeds24AccessToken();
  if (!accessTokenState.ok) {
    return { endpointTried: null, rows: [], skippedReason: accessTokenState.skipped };
  }

  const date = toJstDateString(new Date());
  const propertiesUrl = buildPropertiesUrl(env.baseUrl);
  const urls = buildInventoryUrls(env.baseUrl, propId, date);

  let lastEndpoint: string | null = propertiesUrl;
  let lastSkippedReason: string | null = null;

  try {
    const response = await fetch(propertiesUrl, {
      headers: {
        accept: "application/json",
        token: accessTokenState.token,
      },
      cache: "no-store",
    });

    if (response.ok) {
      const json = (await response.json()) as unknown;
      const rows = extractPropertyRows(json, propId);
      if (rows.length > 0) {
        return {
          endpointTried: propertiesUrl,
          rows,
          skippedReason: null,
        };
      }
      lastSkippedReason = "inventory:no-property-min-stay-rows";
    } else {
      console.warn("[beds24/inventory] properties request failed", { url: propertiesUrl, status: response.status });
      lastSkippedReason = `inventory:properties-http-${response.status}`;
    }
  } catch (error) {
    console.warn("[beds24/inventory] properties request error", { url: propertiesUrl, error });
    lastSkippedReason = "inventory:properties-request-error";
  }

  for (const url of urls) {
    lastEndpoint = url;
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          token: accessTokenState.token,
        },
        cache: "no-store",
      });

      if (!response.ok) {
        console.warn("[beds24/inventory] request failed", { url, status: response.status });
        lastSkippedReason = `inventory:http-${response.status}`;
        continue;
      }

      const json = (await response.json()) as unknown;
      const rows = extractInventoryRows(json);
      if (rows.length > 0) {
        return { endpointTried: url, rows, skippedReason: null };
      }
    } catch (error) {
      console.warn("[beds24/inventory] request error", { url, error });
      lastSkippedReason = "inventory:request-error";
    }
  }

  return {
    endpointTried: lastEndpoint,
    rows: [],
    skippedReason: lastSkippedReason ?? "inventory:no-minimum-stay-rows",
  };
}

export async function syncBeds24InventoryMinimumStay(
  organizationId: string,
  externalPropertyId: string | null,
  supabase: SupabaseClient<Database>,
): Promise<Beds24InventorySyncResult> {
  const env = getOptionalBeds24ApiEnv();
  if (!env) {
    return {
      attempted: false,
      endpointTried: null,
      matchedRooms: 0,
      updatedRooms: 0,
      skipped: ["inventory:missing-env"],
    };
  }

  if (!externalPropertyId) {
    return {
      attempted: false,
      endpointTried: null,
      matchedRooms: 0,
      updatedRooms: 0,
      skipped: ["inventory:no-external-property-id"],
    };
  }

  const { endpointTried, rows, skippedReason } = await fetchInventoryMinimumStays(externalPropertyId);
  if (rows.length === 0) {
    return {
      attempted: skippedReason !== "inventory:missing-env",
      endpointTried,
      matchedRooms: 0,
      updatedRooms: 0,
      skipped: [skippedReason ?? "inventory:no-minimum-stay-rows"],
    };
  }

  const deduped = new Map<string, number>();
  for (const row of rows) {
    deduped.set(row.externalRoomId, row.minimumStay);
  }

  let matchedRooms = 0;
  let updatedRooms = 0;
  for (const [externalRoomId, minimumStay] of deduped.entries()) {
    const status = classifyBeds24Room(minimumStay);
    const result = await supabase
      .from("rooms")
      .update(
        {
          external_minimum_stay: minimumStay,
          status,
        } as never,
      )
      .eq("organization_id", organizationId)
      .eq("external_provider", "beds24")
      .eq("external_room_id", externalRoomId)
      .select("id")
      .maybeSingle();

    if (result.error) {
      console.error("[beds24/inventory] room update failed", { externalRoomId, minimumStay, error: result.error });
      continue;
    }

    if (result.data) {
      matchedRooms += 1;
      updatedRooms += 1;
    }
  }

  return {
    attempted: true,
    endpointTried,
    matchedRooms,
    updatedRooms,
    skipped: matchedRooms > 0 ? [] : ["inventory:no-room-match"],
  };
}

export async function backfillBeds24InventoryMinimumStay(
  supabase: SupabaseClient<Database>,
  options?: {
    organizationId?: string;
  },
): Promise<Beds24InventoryBackfillResult> {
  let query = supabase
    .from("properties")
    .select("id, organization_id, name, external_property_id")
    .eq("external_provider", "beds24")
    .not("external_property_id", "is", null)
    .order("organization_id", { ascending: true })
    .order("name", { ascending: true });

  if (options?.organizationId) {
    query = query.eq("organization_id", options.organizationId);
  }

  const propertiesResult = await query;
  if (propertiesResult.error) {
    throw new Error(`beds24 property backfill query failed: ${propertiesResult.error.message}`);
  }

  const properties = (propertiesResult.data ?? []) as Array<{
    id: string;
    organization_id: string;
    name: string;
    external_property_id: string | null;
  }>;

  const results: Beds24InventoryBackfillPropertyResult[] = [];
  let syncedCount = 0;
  let matchedRooms = 0;
  let updatedRooms = 0;
  let skippedTargets = 0;

  for (const property of properties) {
    const externalPropertyId = property.external_property_id?.trim();
    if (!externalPropertyId) {
      skippedTargets += 1;
      continue;
    }

    const inventorySync = await syncBeds24InventoryMinimumStay(
      property.organization_id,
      externalPropertyId,
      supabase,
    );

    if (inventorySync.attempted) {
      syncedCount += 1;
    }
    matchedRooms += inventorySync.matchedRooms;
    updatedRooms += inventorySync.updatedRooms;
    if (inventorySync.skipped.length > 0) {
      skippedTargets += 1;
    }

    results.push({
      organizationId: property.organization_id,
      propertyId: property.id,
      propertyName: property.name,
      externalPropertyId,
      inventorySync,
    });
  }

  return {
    targetCount: properties.length,
    syncedCount,
    matchedRooms,
    updatedRooms,
    skippedTargets,
    properties: results,
  };
}
