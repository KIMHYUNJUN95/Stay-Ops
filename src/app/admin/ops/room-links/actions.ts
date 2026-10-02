"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { canAccessRoomLinks } from "@/lib/ops-admin";
import { CALENDAR_BUILDING_ORDER } from "@/lib/room-label-normalization";
import {
  BUILDING_LINK_CHANNELS,
  parseRoomLinkInput,
  ROOM_LINK_CHANNELS,
  type RoomLinkChannel,
  type RoomLinkInputError,
} from "@/lib/room-links-model";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * 룸 링크 저장 — 유닛 하나 × 채널 하나의 호스트 · 게스트 링크 · 메모 (2026-10-02).
 *
 * 도메인 계약: docs/product/35-room-links.md
 *
 * **권한을 매번 다시 본다**(`room_links.access`) — service-role 로 쓰므로 화면에서 버튼을 감추는 것은 막은 게
 * 아니다(CLAUDE.md §6). 유닛이 **이 조직의 것인지**도 직접 확인한다. 입력은 서버가 다시 검증한다
 * (`parseRoomLinkInput` — 채널 도메인 · URL 형식 · 메모 길이). 셋 다 비우면 그 줄을 지운다.
 *
 * 실패 사유는 코드로만 돌려준다 — 문구는 화면이 사전에서 고른다(ko/ja/en).
 */
export type SaveRoomLinkResult =
  | { ok: true; removed: boolean }
  | { ok: false; error: "forbidden" | "not_found" | "save_failed" | RoomLinkInputError };

export async function saveRoomListingLink(input: {
  roomId: string;
  channel: RoomLinkChannel;
  host: string;
  guest: string;
  memo: string;
}): Promise<SaveRoomLinkResult> {
  const session = await requireAdminSession();
  if (!canAccessRoomLinks(session)) return { error: "forbidden", ok: false };
  if (!ROOM_LINK_CHANNELS.includes(input.channel)) return { error: "not_found", ok: false };

  const parsed = parseRoomLinkInput({
    channel: input.channel,
    guest: String(input.guest ?? ""),
    host: String(input.host ?? ""),
    memo: String(input.memo ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error, ok: false };

  const supabase = getSupabaseServiceClient();
  const organizationId = session.organization.id;
  const room = await supabase
    .from("rooms")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", String(input.roomId ?? ""))
    .maybeSingle();
  if (room.error || !room.data) return { error: "not_found", ok: false };

  if (parsed.empty) {
    const removed = await supabase
      .from("room_listing_links")
      .delete()
      .eq("organization_id", organizationId)
      .eq("room_id", room.data.id)
      .eq("channel", input.channel);
    if (removed.error) return { error: "save_failed", ok: false };
    revalidatePath("/admin/ops/room-links");
    return { ok: true, removed: true };
  }

  const saved = await supabase.from("room_listing_links").upsert(
    {
      channel: input.channel,
      guest_url: parsed.guestUrl,
      host_url: parsed.hostUrl,
      listing_id: parsed.listingId,
      memo: parsed.memo,
      organization_id: organizationId,
      room_id: room.data.id,
      updated_at: new Date().toISOString(),
      updated_by: session.user.id,
    },
    { onConflict: "room_id,channel" },
  );
  if (saved.error) {
    console.error("[room-links] save failed", saved.error);
    return { error: "save_failed", ok: false };
  }

  revalidatePath("/admin/ops/room-links");
  return { ok: true, removed: false };
}

/**
 * 건물 단위 링크 저장 — Booking.com 엑스트라넷 · 손님용 페이지 · 메모 (2026-10-02).
 *
 * Booking.com 은 숙소(건물) 하나에 객실 타입이 붙어 링크가 건물마다 하나다(`building_listing_links`). 건물 키는
 * 캘린더와 같은 이름이고, **정해진 건물 목록에 있는 이름만** 받는다(`CALENDAR_BUILDING_ORDER`). 권한 · 입력 검증은
 * 객실 링크와 같다. 셋 다 비우면 그 줄을 지운다.
 */
export async function saveBuildingListingLink(input: {
  building: string;
  channel: RoomLinkChannel;
  host: string;
  guest: string;
  memo: string;
}): Promise<SaveRoomLinkResult> {
  const session = await requireAdminSession();
  if (!canAccessRoomLinks(session)) return { error: "forbidden", ok: false };
  if (!BUILDING_LINK_CHANNELS.includes(input.channel)) return { error: "not_found", ok: false };
  const building = String(input.building ?? "");
  if (!CALENDAR_BUILDING_ORDER.includes(building)) return { error: "not_found", ok: false };

  const parsed = parseRoomLinkInput({
    channel: input.channel,
    guest: String(input.guest ?? ""),
    host: String(input.host ?? ""),
    memo: String(input.memo ?? ""),
  });
  if (!parsed.ok) return { error: parsed.error, ok: false };

  const supabase = getSupabaseServiceClient();
  const organizationId = session.organization.id;

  if (parsed.empty) {
    const removed = await supabase
      .from("building_listing_links")
      .delete()
      .eq("organization_id", organizationId)
      .eq("canonical_name", building)
      .eq("channel", input.channel);
    if (removed.error) return { error: "save_failed", ok: false };
    revalidatePath("/admin/ops/room-links");
    return { ok: true, removed: true };
  }

  const saved = await supabase.from("building_listing_links").upsert(
    {
      canonical_name: building,
      channel: input.channel,
      guest_url: parsed.guestUrl,
      host_url: parsed.hostUrl,
      listing_id: parsed.listingId,
      memo: parsed.memo,
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
      updated_by: session.user.id,
    },
    { onConflict: "organization_id,canonical_name,channel" },
  );
  if (saved.error) {
    console.error("[room-links] building save failed", saved.error);
    return { error: "save_failed", ok: false };
  }

  revalidatePath("/admin/ops/room-links");
  return { ok: true, removed: false };
}
