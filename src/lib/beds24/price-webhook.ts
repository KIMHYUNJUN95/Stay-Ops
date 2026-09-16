/**
 * Beds24 **가격 변경 웹훅**.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md
 * 원본: STAY ARI Manager `functions/index.js` → `exports.priceWebhook`
 *
 * ## 왜 필요한가
 *
 * 요금은 백필로 한 번 채우면 끝이 아니다. Beds24 화면에서 가격을 바꾸면 그 순간부터 우리 표가
 * 틀린 값을 들고 있게 되고, 판매 캘린더는 **없는 가격을 보여주는 화면**이 된다.
 * 저쪽도 같은 이유로 예약이 아니라 **가격 전용 웹훅**을 따로 받는다.
 *
 * ## 배달 형태
 *
 * 예약 웹훅과 **같은 엔드포인트**로 오지만 예약이 들어 있지 않다. 실린 것은 `roomId` 와
 * `action` 뿐이다.
 *
 * ```
 * V1(GET)  ?roomId=440617&action=PRICE_CHANGE&propId=176430
 * V2(POST) {"roomId":440617,"action":"PRICE_CHANGE","propId":176430}
 * ```
 *
 * `action` 이 비어 오는 경우도 있어 저쪽은 `!action` 도 받아들인다. 우리는 **`roomId` 가 있고
 * 예약이 없으면** 가격 배달로 본다 — 예약 배달은 이 함수에 오기 전에 걸러진다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { syncBeds24RoomRates } from "@/lib/beds24/room-rates-sync";
import type { Database } from "@/types/database";

type JsonRecord = Record<string, unknown>;

/**
 * 같은 건물에 대한 재동기화를 이 시간 안에는 다시 하지 않는다.
 *
 * 가격을 일괄로 바꾸면 웹훅이 **객실 수만큼** 쏟아진다(저쪽도 `PRICE_WEBHOOK_INVALIDATION_
 * DEBOUNCE_MS` 로 합친다). 한 번의 동기화가 그 건물의 전 객실 · 12개월을 가져오므로 첫 배달
 * 하나면 충분하다.
 */
export const PRICE_WEBHOOK_DEBOUNCE_MS = 60_000;

function readString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export type PriceWebhookSignal = {
  action: string | null;
  externalPropertyId: string | null;
  externalRoomId: string;
};

/**
 * 배달에서 가격 신호를 읽는다. 가격 배달이 아니면 `null`.
 *
 * **순수 함수다** — 모양 판정은 테스트로 고정한다
 * (`src/lib/__tests__/beds24-price-webhook.test.ts`).
 */
export function extractPriceWebhookSignal(body: unknown): PriceWebhookSignal | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as JsonRecord;

  const externalRoomId = readString(record, ["roomId", "roomid", "room_id"]);
  if (!externalRoomId) return null;

  const action = readString(record, ["action"]);
  // 저쪽과 같은 집합. `action` 이 없는 배달도 받아들인다 — Beds24 V1 이 그렇게 보낸다.
  if (action && !["PRICE_CHANGE", "SYNC_ROOM"].includes(action.toUpperCase())) return null;

  return {
    action,
    externalPropertyId: readString(record, ["propId", "propertyId", "propid", "property_id"]),
    externalRoomId,
  };
}

export type PriceWebhookResult =
  | { handled: false; reason: "not_a_price_delivery" | "unknown_room" }
  | { handled: true; skipped: true; reason: "debounced"; externalPropertyId: string }
  | {
      handled: true;
      skipped: false;
      externalPropertyId: string;
      organizationId: string;
      rows: number;
    };

/**
 * 가격 배달을 처리한다 — 그 **건물**의 요금을 다시 가져온다.
 *
 * 객실 하나만 가져오지 않는 이유: Beds24 의 `/inventory/rooms/calendar` 는 **건물 단위**로
 * 응답한다. 한 객실을 위해 요청해도 그 건물이 통째로 오므로, 어차피 전부 저장하는 편이 낫다.
 *
 * ## 되받아치기 방지
 *
 * 우리가 Beds24 에 가격을 쓰면 Beds24 가 다시 웹훅을 보낸다. 지금은 **쓰지 않으므로**
 * 문제가 없지만(병행 기간 원칙), 쓰기를 켤 때는 여기에 「우리가 만든 변경인가」 판정이
 * 필요해진다. 그때까지는 디바운스가 그 역할을 겸한다.
 */
export async function processBeds24PriceWebhook(args: {
  body: unknown;
  supabase: SupabaseClient<Database>;
  /** 배달에 조직 정보가 없으므로 방으로 거슬러 찾는다. */
  fallbackOrganizationId?: string | null;
}): Promise<PriceWebhookResult> {
  const signal = extractPriceWebhookSignal(args.body);
  if (!signal) return { handled: false, reason: "not_a_price_delivery" };

  // roomId → 우리 방 → 건물. 모르는 방이면 **Beds24 를 부르지 않고 끝낸다**(저쪽과 같다) —
  // 남의 계정 웹훅이나 폐기된 방으로 API 크레딧을 쓰지 않기 위해서다.
  const roomResult = await args.supabase
    .from("rooms")
    .select("organization_id, properties(external_property_id)")
    .eq("external_provider", "beds24")
    .eq("external_room_id", signal.externalRoomId)
    .maybeSingle();

  if (roomResult.error) {
    console.error("[beds24/price-webhook] room lookup failed", roomResult.error);
    return { handled: false, reason: "unknown_room" };
  }

  const row = roomResult.data as {
    organization_id: string;
    properties: { external_property_id: string | null } | { external_property_id: string | null }[] | null;
  } | null;
  if (!row) {
    console.warn("[beds24/price-webhook] unknown roomId; ignored without Beds24 call", {
      externalRoomId: signal.externalRoomId,
    });
    return { handled: false, reason: "unknown_room" };
  }

  const propertyRow = Array.isArray(row.properties) ? row.properties[0] : row.properties;
  const externalPropertyId = propertyRow?.external_property_id ?? signal.externalPropertyId;
  if (!externalPropertyId) {
    return { handled: false, reason: "unknown_room" };
  }

  // 디바운스 — **DB 의 `synced_at` 으로 본다.** 서버리스에서는 인스턴스가 매번 새로 뜨므로
  // 메모리 플래그가 남지 않는다.
  //
  // **건물별로 본다.** 조직 전체로 보면 아라키초A 를 방금 동기화한 탓에 가부키초 웹훅이
  // 통째로 버려진다 — 가격을 여러 건물에 걸쳐 바꾸면 실제로 그렇게 된다.
  const roomIdsResult = await args.supabase
    .from("rooms")
    .select("id, properties!inner(external_property_id)")
    .eq("organization_id", row.organization_id)
    .eq("properties.external_property_id", externalPropertyId);
  const propertyRoomIds = ((roomIdsResult.data ?? []) as Array<{ id: string }>).map((r) => r.id);

  const freshResult = propertyRoomIds.length
    ? await args.supabase
        .from("room_daily_rates")
        .select("synced_at")
        .eq("organization_id", row.organization_id)
        .in("room_id", propertyRoomIds)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const lastSyncedAt = (freshResult.data as { synced_at: string } | null)?.synced_at ?? null;
  if (lastSyncedAt && Date.now() - new Date(lastSyncedAt).getTime() < PRICE_WEBHOOK_DEBOUNCE_MS) {
    return { handled: true, skipped: true, reason: "debounced", externalPropertyId };
  }

  const result = await syncBeds24RoomRates(row.organization_id, args.supabase, undefined, {
    externalPropertyIds: [externalPropertyId],
  });

  return {
    handled: true,
    skipped: false,
    externalPropertyId,
    organizationId: row.organization_id,
    rows: result.rows,
  };
}
