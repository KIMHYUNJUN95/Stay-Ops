import "server-only";
import type { Locale } from "@/lib/i18n";
import { listPropertyMapMeta } from "@/lib/property-operation-info";
import { CALENDAR_BUILDING_ORDER } from "@/lib/room-label-normalization";
import {
  findDuplicateListingIds,
  groupRoomLinks,
  type RoomLinkChannel,
  ROOM_LINK_SELLING_WINDOW_DAYS,
  type RoomLinkRecord,
} from "@/lib/room-links-model";
import { isActiveUnitMinStay } from "@/lib/ops-gap-detection";
import { fetchRoomCatalogRows } from "@/lib/rooms";
import type { AppSession } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { readAllPages } from "@/lib/supabase/read-all-pages";
import { tokyoToday, ymdShift } from "@/lib/tokyo-date";

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
};

export type RoomLinkRowView = { key: string; label: string; units: RoomLinkUnitView[] };

export type RoomLinkBuildingView = {
  name: string;
  /** 건물 주소(사용자 언어). 건물 정보에 없으면 `null` — 화면이 「주소 미입력」. */
  address: string | null;
  mapUrl: string | null;
  /** Booking.com 은 건물 단위(`building_listing_links`) — 객실마다가 아니다. */
  booking: RoomLinkView | null;
  rows: RoomLinkRowView[];
};

export type RoomLinksPageData = {
  buildings: RoomLinkBuildingView[];
  /** 두 유닛 이상에 붙은 리스팅 ID — 화면이 경고한다. */
  duplicateListingIds: string[];
};

function toView(link: Omit<RoomLinkRecord, "roomId"> | undefined): RoomLinkView | null {
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
  const today = tokyoToday();
  const [roomsResult, linksResult, buildingLinksResult, metas, rates] = await Promise.all([
    fetchRoomCatalogRows(organizationId, supabase),
    supabase
      .from("room_listing_links")
      .select("room_id, channel, listing_id, host_url, guest_url, memo, updated_at")
      .eq("organization_id", organizationId)
      .eq("channel", "airbnb"),
    supabase
      .from("building_listing_links")
      .select("canonical_name, channel, listing_id, host_url, guest_url, memo, updated_at")
      .eq("organization_id", organizationId)
      .eq("channel", "booking"),
    listPropertyMapMeta(session).catch(() => []),
    // 「지금 판매 중」은 판매 캘린더와 같은 **날짜별 최소숙박**(활성 1~49)으로, 오늘부터 30일을 본다
    // (`pickSellingUnits`). `rooms.external_minimum_stay` 는 한 시점의 값이라 계정이 바뀌는 날을 못 따라간다.
    // 객실 ~100 × 30일 = 1,000행을 넘으므로 페이지로 읽는다.
    readAllPages<{ room_id: string; stay_date: string; min_stay: number | null }>((from, to) =>
      supabase
        .from("room_daily_rates")
        .select("room_id, stay_date, min_stay")
        .eq("organization_id", organizationId)
        .gte("stay_date", today)
        .lt("stay_date", ymdShift(today, ROOM_LINK_SELLING_WINDOW_DAYS))
        .order("room_id", { ascending: true })
        .order("stay_date", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (roomsResult.error) throw new Error(roomsResult.error.message);
  if (linksResult.error) throw new Error(linksResult.error.message);
  if (buildingLinksResult.error) throw new Error(buildingLinksResult.error.message);
  const bookingByBuilding = new Map(
    (buildingLinksResult.data ?? []).map((row) => [
      row.canonical_name,
      {
        channel: "booking" as const,
        guestUrl: row.guest_url,
        hostUrl: row.host_url,
        listingId: row.listing_id,
        memo: row.memo,
        updatedAt: row.updated_at,
      },
    ]),
  );
  // 읽기에 실패하면 객실 표 값으로 대신한다(링크 화면이 판매 표시 때문에 죽지 않게).
  const activeNights = new Map<string, number>();
  for (const row of rates.error ? [] : (rates.data ?? [])) {
    activeNights.set(row.room_id, (activeNights.get(row.room_id) ?? 0) + (isActiveUnitMinStay(row.min_stay) ? 1 : 0));
  }

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
        activeNights: activeNights.get(row.id) ?? null,
        externalMinimumStay: row.external_minimum_stay,
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
        booking: toView(bookingByBuilding.get(building.name)),
        mapUrl: meta?.googleMapsUrl || null,
        name: building.name,
        rows: building.rows.map((row) => ({
          key: row.key,
          label: row.label,
          units: row.units.map((unit) => ({
            airbnb: toView(unit.links.airbnb),
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
