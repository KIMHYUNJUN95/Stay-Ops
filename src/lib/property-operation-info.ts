import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppSession } from "@/lib/session";
import {
  PROPERTY_MAP_META,
  type PropertyAccessInfo,
  type PropertyMapMeta,
  type PropertyRoomCode,
} from "@/lib/property-map-links";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database, Json } from "@/types/database";

type PropertyOperationInfoRow =
  Database["public"]["Tables"]["property_operation_infos"]["Row"];
type PropertyOperationInfoOverride = Pick<
  PropertyOperationInfoRow,
  | "canonical_name"
  | "address_ko"
  | "address_ja"
  | "address_en"
  | "shared_access"
  | "room_access"
  | "note"
>;

const ACCESS_LABEL_KEYS = new Set<PropertyAccessInfo["labelKey"]>([
  "doorPassword",
  "keyBox",
  "keyBoxPassword",
  "linenStorageEntrancePassword",
  "roomPassword",
  "storage",
  "storagePassword",
]);

const ACCESS_PREFIX_KEYS = new Set<NonNullable<PropertyAccessInfo["prefixKey"]>>(["floor1"]);
const ACCESS_NOTE_KEYS = new Set<NonNullable<PropertyAccessInfo["noteKey"]>>(["allRoomsSame"]);

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeSharedAccess(value: unknown, fallback: PropertyAccessInfo[]) {
  if (!Array.isArray(value)) return fallback;

  const sanitized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const labelKey = record.labelKey;
      const code = normalizeText(typeof record.code === "string" ? record.code : null);
      const prefixKey = record.prefixKey;
      const noteKey = record.noteKey;
      if (!ACCESS_LABEL_KEYS.has(labelKey as PropertyAccessInfo["labelKey"])) return null;
      if (!code) return null;
      const safeLabelKey = labelKey as PropertyAccessInfo["labelKey"];
      return {
        labelKey: safeLabelKey,
        code,
        prefixKey: ACCESS_PREFIX_KEYS.has(prefixKey as NonNullable<PropertyAccessInfo["prefixKey"]>)
          ? (prefixKey as NonNullable<PropertyAccessInfo["prefixKey"]>)
          : undefined,
        noteKey: ACCESS_NOTE_KEYS.has(noteKey as NonNullable<PropertyAccessInfo["noteKey"]>)
          ? (noteKey as NonNullable<PropertyAccessInfo["noteKey"]>)
          : undefined,
      } satisfies PropertyAccessInfo;
    })
    .filter((entry) => entry !== null) as PropertyAccessInfo[];

  return sanitized.length > 0 ? sanitized : fallback;
}

function sanitizeRoomAccess(value: unknown, fallback: PropertyRoomCode[]) {
  if (!Array.isArray(value)) return fallback;
  const sanitized = value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      const roomLabel = normalizeText(typeof record.roomLabel === "string" ? record.roomLabel : null);
      const code = normalizeText(typeof record.code === "string" ? record.code : null);
      if (!roomLabel || !code) return null;
      return { roomLabel, code } satisfies PropertyRoomCode;
    })
    .filter((entry) => entry !== null) as PropertyRoomCode[];
  return sanitized.length > 0 ? sanitized : fallback;
}

function toJson(value: PropertyAccessInfo[] | PropertyRoomCode[]): Json {
  return value as unknown as Json;
}

function mergePropertyMapMeta(
  base: PropertyMapMeta,
  override?: PropertyOperationInfoOverride,
): PropertyMapMeta {
  if (!override) {
    return {
      ...base,
      note: base.note ?? "",
      roomAccess: (base.roomAccess ?? []).map((room) => ({ ...room })),
      sharedAccess: base.sharedAccess.map((access) => ({ ...access })),
    };
  }

  return {
    ...base,
    address: {
      ko: normalizeText(override.address_ko) || base.address.ko,
      ja: normalizeText(override.address_ja) || base.address.ja,
      en: normalizeText(override.address_en) || base.address.en,
    },
    note: normalizeText(override.note),
    roomAccess: sanitizeRoomAccess(override.room_access, base.roomAccess ?? []),
    sharedAccess: sanitizeSharedAccess(override.shared_access, base.sharedAccess),
  };
}

function untyped(client: SupabaseClient<Database>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

function cloneBasePropertyMapMeta(item: PropertyMapMeta): PropertyMapMeta {
  return {
    ...item,
    note: item.note ?? "",
    roomAccess: (item.roomAccess ?? []).map((room) => ({ ...room })),
    sharedAccess: item.sharedAccess.map((access) => ({ ...access })),
  };
}

export async function listPropertyMapMeta(session: AppSession): Promise<PropertyMapMeta[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await untyped(supabase)
    .from("property_operation_infos")
    .select(
      "canonical_name, address_ko, address_ja, address_en, shared_access, room_access, note",
    )
    .eq("organization_id", session.organization.id);

  if (error) {
    if (error.message.includes("property_operation_infos")) {
      return PROPERTY_MAP_META.map(cloneBasePropertyMapMeta);
    }
    throw new Error(error.message);
  }

  const overrideMap = new Map(
    ((data ?? []) as PropertyOperationInfoOverride[]).map((row) => [row.canonical_name, row]),
  );

  return PROPERTY_MAP_META.map((item) =>
    mergePropertyMapMeta(item, overrideMap.get(item.canonicalName)),
  );
}

export async function savePropertyOperationInfo(input: {
  canonicalName: string;
  data: Pick<PropertyMapMeta, "address" | "note" | "roomAccess" | "sharedAccess">;
  session: AppSession;
}) {
  const base = PROPERTY_MAP_META.find((item) => item.canonicalName === input.canonicalName);
  if (!base) {
    throw new Error("invalid_property");
  }

  const service = getSupabaseServiceClient();
  const payload: Database["public"]["Tables"]["property_operation_infos"]["Insert"] = {
    organization_id: input.session.organization.id,
    canonical_name: input.canonicalName,
    address_ko: normalizeText(input.data.address.ko) || base.address.ko,
    address_ja: normalizeText(input.data.address.ja) || base.address.ja,
    address_en: normalizeText(input.data.address.en) || base.address.en,
    note: normalizeText(input.data.note),
    room_access: toJson(
      sanitizeRoomAccess(input.data.roomAccess ?? [], base.roomAccess ?? []),
    ),
    shared_access: toJson(
      sanitizeSharedAccess(input.data.sharedAccess ?? [], base.sharedAccess),
    ),
  };

  const { error } = await untyped(service)
    .from("property_operation_infos")
    .upsert(payload, { onConflict: "organization_id,canonical_name" });

  if (error) {
    throw new Error(error.message);
  }
}
