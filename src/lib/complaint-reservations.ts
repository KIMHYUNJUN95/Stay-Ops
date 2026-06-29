// 컴플레인 생성 화면의 예약 피커용 서버 헬퍼.
// 오늘 투숙 중(staying) + 향후 30일 예약(upcoming)을 조직 기준으로 조회한다.
// Tokyo 날짜 기준, cancelled/no_show 제외.
// 건물명·객실명은 캘린더와 동일한 정규화 로직(room-label-normalization)을 적용하며,
// 표시용 이름(displayPropertyName·displayRoomLabel)은 로케일에 맞게 다국어 변환한다.

import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
  localizePropertyName,
} from "@/lib/room-label-normalization";
import { getDictionary } from "@/lib/i18n";

export type ReservationPickRow = {
  reservationId: string;
  plat: "airbnb" | "booking" | "direct";
  /** canonical 한국어 이름 — 드릴다운 필터링 키로만 사용 */
  propertyName: string;
  /** canonical 룸 라벨 — 드릴다운 필터링 키로만 사용 */
  roomLabel: string;
  /** 로케일 건물 표시명 (UI 렌더링용) */
  displayPropertyName: string;
  /** 로케일 객실 표시명 (UI 렌더링용) */
  displayRoomLabel: string;
  /** "로케일건물 · 로케일객실" — 연결 후 요약 칩 표시용 */
  place: string;
  guest: string;
  stay: string;  // "M/D–M/D"
  meta: string;  // "Airbnb · M/D–M/D"
  live: boolean;
  group: "staying" | "upcoming";
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
  locale: string,
): Promise<ReservationPickRow[]> {
  const supabase = getSupabaseServiceClient();
  const dict = getDictionary(locale);
  const buildingLabels = dict.cleaning.buildingLabels;

  // 직접예약 표시명은 로케일 번역 사용 (Airbnb·Booking.com은 고유명사)
  const PLATFORM_DISPLAY: Record<string, string> = {
    airbnb: "Airbnb",
    booking: "Booking.com",
    direct: dict.complaints.platformDirect,
  };

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
      if (isExcludedOperationalProperty(r.property_name)) return false;
      if (isExcludedOperationalRoom(r.property_name, r.room_label)) return false;
      return true;
    })
    .map((r) => {
      const plat = detectPlatform(r.source ?? "");
      const stay = fmtStayRange(r.check_in_date, r.check_out_date);
      const live = r.check_in_date <= today && r.check_out_date > today;

      // 캘린더와 동일한 canonical 정규화 (필터링 키)
      const canonicalProperty = getCanonicalPropertyName(r.property_name);
      const canonicalRoom = getCanonicalRoomLabel(r.property_name, r.room_label);
      const displayRoom = getDisplayRoomLabel(canonicalProperty, canonicalRoom);

      // 로케일 표시명: localizePropertyName은 canonical→buildingKey→번역 순으로 처리하며
      // 알 수 없는 값(일반 객실 번호 등)은 그대로 반환하므로 안전하게 공용 적용 가능.
      const displayPropertyName = localizePropertyName(canonicalProperty, buildingLabels);
      const displayRoomLabel = localizePropertyName(displayRoom, buildingLabels);

      return {
        reservationId: r.id,
        plat,
        propertyName: canonicalProperty,
        roomLabel: displayRoom,
        displayPropertyName,
        displayRoomLabel,
        place: `${displayPropertyName} · ${displayRoomLabel}`,
        guest: r.guest_name,
        stay,
        meta: `${PLATFORM_DISPLAY[plat]} · ${stay}`,
        live,
        group: live ? "staying" : "upcoming",
      };
    });

  return [
    ...rows.filter((r) => r.group === "staying"),
    ...rows.filter((r) => r.group === "upcoming"),
  ];
}
