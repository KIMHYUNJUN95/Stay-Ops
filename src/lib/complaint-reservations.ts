// 컴플레인 생성 화면의 예약 피커용 서버 헬퍼.
// 오늘 투숙 중(staying) + 향후 30일 예약(upcoming)을 조직 기준으로 조회한다.
// Tokyo 날짜 기준, cancelled/no_show 제외.
// 건물명·객실명은 캘린더와 동일한 정규화 로직(room-label-normalization)을 적용한다.

import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";

export type ReservationPickRow = {
  reservationId: string;
  plat: "airbnb" | "booking" | "direct";
  propertyName: string; // 건물명 (드릴다운 1단계)
  roomLabel: string;    // 객실명 (드릴다운 2단계)
  place: string;        // "건물명 · 객실명" (선택 후 요약 표시용)
  guest: string;
  stay: string;         // "M/D–M/D"
  meta: string;         // "Airbnb · M/D–M/D"
  live: boolean;        // 현재 투숙 중 여부
  group: "staying" | "upcoming";
};

const PLATFORM_DISPLAY: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  direct: "직접예약",
};

function detectPlatform(source: string): "airbnb" | "booking" | "direct" {
  const s = (source ?? "").toLowerCase();
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("booking")) return "booking";
  return "direct";
}

function fmtStayRange(checkIn: string, checkOut: string): string {
  const [, inM, inD] = checkIn.split("-").map(Number);
  const [, outM, outD] = checkOut.split("-").map(Number);
  return `${inM}/${inD}–${outM}/${outD}`;
}

type ReservationRow = {
  id: string;
  guest_name: string;
  property_name: string;
  room_label: string;
  source: string;
  check_in_date: string;
  check_out_date: string;
};

export async function listComplaintPickerReservations(
  organizationId: string,
): Promise<ReservationPickRow[]> {
  const supabase = getSupabaseServiceClient();

  const tokyoFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });
  const today = tokyoFmt.format(new Date());
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  const window30 = tokyoFmt.format(limit);

  const { data, error } = await supabase
    .from("reservations")
    .select("id, guest_name, property_name, room_label, source, check_in_date, check_out_date")
    .eq("organization_id", organizationId)
    .not("status", "in", '("cancelled","no_show")')
    .or(
      `and(check_in_date.lte.${today},check_out_date.gt.${today}),` +
      `and(check_in_date.gt.${today},check_in_date.lte.${window30})`,
    )
    .order("check_in_date", { ascending: true });

  if (error || !data) return [];

  const rows: ReservationPickRow[] = (data as unknown as ReservationRow[])
    .filter((r) => {
      // 캘린더와 동일하게 운영 제외 건물/객실 필터링
      if (isExcludedOperationalProperty(r.property_name)) return false;
      if (isExcludedOperationalRoom(r.property_name, r.room_label)) return false;
      return true;
    })
    .map((r) => {
      const plat = detectPlatform(r.source ?? "");
      const stay = fmtStayRange(r.check_in_date, r.check_out_date);
      const live = r.check_in_date <= today && r.check_out_date > today;

      // 캘린더와 동일한 정규화: Beds24 일본어/영어 이름 → 한국어 canonical 이름
      const canonicalProperty = getCanonicalPropertyName(r.property_name);
      const canonicalRoom = getCanonicalRoomLabel(r.property_name, r.room_label);
      const displayRoom = getDisplayRoomLabel(canonicalProperty, canonicalRoom);

      return {
        reservationId: r.id,
        plat,
        propertyName: canonicalProperty,
        roomLabel: displayRoom,
        place: `${canonicalProperty} · ${displayRoom}`,
        guest: r.guest_name,
        stay,
        meta: `${PLATFORM_DISPLAY[plat]} · ${stay}`,
        live,
        group: live ? "staying" : "upcoming",
      };
    });

  // staying 먼저, 그 다음 upcoming (둘 다 check_in_date 오름차순)
  return [
    ...rows.filter((r) => r.group === "staying"),
    ...rows.filter((r) => r.group === "upcoming"),
  ];
}
