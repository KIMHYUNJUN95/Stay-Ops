import "server-only";

import { getDictionary } from "@/lib/i18n";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
  localizePropertyName,
} from "@/lib/room-label-normalization";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

export type ReservationPickRow = {
  reservationId: string;
  plat: "airbnb" | "booking" | "direct";
  propertyName: string;
  roomLabel: string;
  displayPropertyName: string;
  displayRoomLabel: string;
  place: string;
  guest: string;
  stay: string;
  meta: string;
  live: boolean;
  group: "staying" | "upcoming";
};

function detectPlatform(source: string): "airbnb" | "booking" | "direct" {
  const normalized = (source ?? "").toLowerCase();
  if (normalized.includes("airbnb")) return "airbnb";
  if (normalized.includes("booking")) return "booking";
  return "direct";
}

function fmtStayRange(checkIn: string, checkOut: string): string {
  const [, inMonth, inDay] = checkIn.split("-").map(Number);
  const [, outMonth, outDay] = checkOut.split("-").map(Number);
  return `${inMonth}/${inDay} - ${outMonth}/${outDay}`;
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

  const platformDisplay: Record<ReservationPickRow["plat"], string> = {
    airbnb: "Airbnb",
    booking: "Booking.com",
    direct: dict.complaints.platformDirect,
  };

  const tokyoFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });
  const today = tokyoFormatter.format(new Date());
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);
  const window30 = tokyoFormatter.format(limit);

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

  if (error || !data) {
    return [];
  }

  const rows = (data as ReservationRow[])
    .filter((reservation) => {
      if (isExcludedOperationalProperty(reservation.property_name)) return false;
      if (isExcludedOperationalRoom(reservation.property_name, reservation.room_label)) return false;
      return true;
    })
    .map<ReservationPickRow>((reservation) => {
      const plat = detectPlatform(reservation.source ?? "");
      const stay = fmtStayRange(reservation.check_in_date, reservation.check_out_date);
      const live =
        reservation.check_in_date <= today && reservation.check_out_date > today;

      const canonicalProperty = getCanonicalPropertyName(reservation.property_name);
      const canonicalRoom = getCanonicalRoomLabel(
        reservation.property_name,
        reservation.room_label,
      );
      const displayRoom = getDisplayRoomLabel(canonicalProperty, canonicalRoom);
      const displayPropertyName = localizePropertyName(canonicalProperty, buildingLabels);
      const displayRoomLabel = localizePropertyName(displayRoom, buildingLabels);

      return {
        reservationId: reservation.id,
        plat,
        propertyName: canonicalProperty,
        roomLabel: displayRoom,
        displayPropertyName,
        displayRoomLabel,
        place: `${displayPropertyName} · ${displayRoomLabel}`,
        guest: reservation.guest_name,
        stay,
        meta: `${platformDisplay[plat]} · ${stay}`,
        live,
        group: live ? "staying" : "upcoming",
      };
    });

  return [
    ...rows.filter((row) => row.group === "staying"),
    ...rows.filter((row) => row.group === "upcoming"),
  ];
}
