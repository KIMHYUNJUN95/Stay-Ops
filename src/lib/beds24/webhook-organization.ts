import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Beds24 예약 한 건이 **어느 조직의 것인지**는 우리 DB 매핑(건물·객실 → 조직)이 정한다.
 *
 * 외부 페이로드의 조직 id 는 쓰지 않는다 — 웹훅 본문은 밖에서 오는 값이라, 그걸 믿으면 다른
 * 조직 표에 예약을 써 넣을 수 있다. 매핑이 없을 때(처음 보는 건물)만 서버가 정한 기본값
 * (세션 조직 · `BEDS24_DEFAULT_ORGANIZATION_ID`)으로 떨어진다.
 *
 * - 매핑에 기본값 조직이 있으면 기본값(세션 조직이 그 건물을 가진 경우 그대로).
 * - 매핑이 정확히 한 조직이면 그 조직.
 * - 매핑이 없거나 여러 조직으로 갈리면 기본값.
 */
export function pickWebhookOrganizationId(args: {
  mappedOrganizationIds: readonly string[];
  fallbackOrganizationId: string | null;
}): string | null {
  const mapped = [...new Set(args.mappedOrganizationIds.filter(Boolean))];
  const fallback = args.fallbackOrganizationId?.trim() || null;
  if (fallback && mapped.includes(fallback)) return fallback;
  if (mapped.length === 1) return mapped[0];
  return fallback;
}

/** Beds24 건물 id → 조직, 없으면 Beds24 객실 id → 조직. 읽기 실패는 「매핑 없음」과 같다. */
export async function readMappedOrganizationIds(
  supabase: SupabaseClient<Database>,
  ids: { externalPropertyId: string | null; externalRoomId: string | null },
): Promise<string[]> {
  if (ids.externalPropertyId) {
    const result = await supabase
      .from("properties")
      .select("organization_id")
      .eq("external_provider", "beds24")
      .eq("external_property_id", ids.externalPropertyId);
    const orgIds = ((result.data ?? []) as Array<{ organization_id: string }>).map((row) => row.organization_id);
    if (!result.error && orgIds.length > 0) return orgIds;
  }
  if (ids.externalRoomId) {
    const result = await supabase
      .from("rooms")
      .select("organization_id")
      .eq("external_provider", "beds24")
      .eq("external_room_id", ids.externalRoomId);
    if (!result.error) {
      return ((result.data ?? []) as Array<{ organization_id: string }>).map((row) => row.organization_id);
    }
  }
  return [];
}
