import "server-only";
import type { Locale } from "@/lib/i18n";
import { listPropertyMapMeta } from "@/lib/property-operation-info";
import { CALENDAR_BUILDING_ORDER } from "@/lib/room-label-normalization";
import {
  findDuplicateListingIds,
  groupRoomLinks,
  type RoomLinkChannel,
  type RoomLinkRecord,
} from "@/lib/room-links-model";
import { fetchRoomCatalogRows } from "@/lib/rooms";
import type { AppSession } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { tokyoToday } from "@/lib/tokyo-date";

/**
 * 룸 링크 화면 읽기 — `/admin/ops/room-links`.
 *
 * 도메인 계약: docs/product/35-room-links.md
 *
 * **호출부가 `room_links.access` 를 먼저 확인한다**(`canAccessRoomLinks`). 여기서는 service-role 로 읽으므로
 * 조직을 직접 건다 — RLS 가 막아 주지 않는다. 표는 수백 줄 안쪽(객실 ~100 × 채널 2)이라 한 번에 읽는다.
 */

export type RoomLinkView = {
  listingId: string | null;
  hostUrl: string | null;
  guestUrl: string | null;
  memo: string | null;
  updatedAt: string | null;
};

export type RoomLinkUnitView = {
  roomId: string;
  unitLabel: string;
  selling: boolean;
  airbnb: RoomLinkView | null;
  booking: RoomLinkView | null;
};

export type RoomLinkRowView = { key: string; label: string; units: RoomLinkUnitView[] };

export type RoomLinkBuildingView = {
  name: string;
  /** 건물 주소(사용자 언어). 건물 정보에 없으면 `null` — 화면이 「주소 미입력」. */
  address: string | null;
  mapUrl: string | null;
  rows: RoomLinkRowView[];
};

export type RoomLinksPageData = {
  buildings: RoomLinkBuildingView[];
  /** 두 유닛 이상에 붙은 리스팅 ID — 화면이 경고한다. */
  duplicateListingIds: string[];
};

function toView(link: RoomLinkRecord | undefined): RoomLinkView | null {
  if (!link) return null;
  return {
    guestUrl: link.guestUrl,
    hostUrl: link.hostUrl,
    listingId: link.listingId,
    memo: link.memo,
    updatedAt: link.updatedAt,
  };
}

export async function getRoomLinksPageData(session: AppSession, locale: Locale): Promise<RoomLinksPageData> {
  const organizationId = session.organization.id;
  const supabase = getSupabaseServiceClient();
  const [roomsResult, linksResult, metas, todayRates] = await Promise.all([
    fetchRoomCatalogRows(organizationId, supabase),
    supabase
      .from("room_listing_links")
      .select("room_id, channel, listing_id, host_url, guest_url, memo, updated_at")
      .eq("organization_id", organizationId),
    listPropertyMapMeta(session).catch(() => []),
    // 「지금 판매 중」은 **오늘 요금 칸의 최소숙박**으로 본다 — `rooms.external_minimum_stay` 는 한 시점의 값이라
    // 계정이 바뀌는 날(4월 · 10월)을 따라가지 못한다. 칸이 없으면 객실 표 값으로 대신한다.
    supabase
      .from("room_daily_rates")
      .select("room_id, min_stay")
      .eq("organization_id", organizationId)
      .eq("stay_date", tokyoToday()),
  ]);
  if (roomsResult.error) throw new Error(roomsResult.error.message);
  if (linksResult.error) throw new Error(linksResult.error.message);
  const todayMinStay = new Map<string, number | null>(
    (todayRates.error ? [] : (todayRates.data ?? [])).map((row) => [row.room_id, row.min_stay]),
  );

  const links: RoomLinkRecord[] = (linksResult.data ?? []).map((row) => ({
    channel: row.channel as RoomLinkChannel,
    guestUrl: row.guest_url,
    hostUrl: row.host_url,
    listingId: row.listing_id,
    memo: row.memo,
    roomId: row.room_id,
    updatedAt: row.updated_at,
  }));

  const grouped = groupRoomLinks({
    buildingOrder: CALENDAR_BUILDING_ORDER,
    links,
    units: roomsResult.data.map((row) => {
      const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      return {
        externalMinimumStay: todayMinStay.has(row.id) ? (todayMinStay.get(row.id) ?? null) : row.external_minimum_stay,
        id: row.id,
        propertyName: property?.name,
        roomLabel: row.room_label,
        status: row.status,
      };
    }),
  });

  const metaByName = new Map(metas.map((meta) => [meta.canonicalName, meta]));
  return {
    buildings: grouped.map((building) => {
      const meta = metaByName.get(building.name);
      const address = meta ? meta.address[locale] || meta.address.ko || null : null;
      return {
        address,
        mapUrl: meta?.googleMapsUrl || null,
        name: building.name,
        rows: building.rows.map((row) => ({
          key: row.key,
          label: row.label,
          units: row.units.map((unit) => ({
            airbnb: toView(unit.links.airbnb),
            booking: toView(unit.links.booking),
            roomId: unit.roomId,
            selling: unit.selling,
            unitLabel: unit.unitLabel,
          })),
        })),
      };
    }),
    duplicateListingIds: [...findDuplicateListingIds(links)],
  };
}
