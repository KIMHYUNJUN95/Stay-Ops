"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { MobileCalendarView, type CalendarReservationItem, type CalendarRoomBlock } from "@/components/calendar/mobile-calendar-view";
import type { PropertyMapMeta } from "@/lib/property-map-links";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Locale } from "@/lib/i18n";
import { BEDS24_LIVE_CHANNEL_OPTIONS, BEDS24_LIVE_EVENT, beds24LiveTopic } from "@/lib/beds24-live";

type MobileCalendarLiveViewProps = {
  copy: {
    calendar: string;
    calendarBuildingChange: string;
    calendarBuildingHotelLabel: string;
    calendarBuildingHouseLabel: string;
    calendarBuildingPickerBody: string;
    calendarBuildingPickerQuestion: string;
    calendarTokyoNowLabel: string;
    calendarMapBuildingCount: string;
    legendDirect: string;
    calendarBuildingPickerTitle: string;
    call: string;
    checkInLabel: string;
    checkOutLabel: string;
    checkIns: string;
    checkOuts: string;
    close: string;
    copyNumber: string;
    copied: string;
    emptyAccuracyHint: string;
    calendarOutOfWindowBody: string;
    calendarOutOfWindowTitle: string;
    emptyToday: string;
    filterAll: string;
    listView: string;
    mapTab: string;
    mapAccessSheetTitle: string;
    mapAddressLabel: string;
    mapAddressCopy: string;
    mapAddressMissing: string;
    mapAccessFloor1: string;
    mapAccessKindDoorPassword: string;
    mapAccessKindKeyBox: string;
    mapAccessKindKeyBoxPassword: string;
    mapAccessKindLinenStorageEntrancePassword: string;
    mapAccessKindRoomPassword: string;
    mapAccessKindStorage: string;
    mapAccessKindStoragePassword: string;
    mapAccessNoteAllRoomsSame: string;
    mapCopiedAddress: string;
    mapCopiedCode: string;
    mapOpenAccess: string;
    mapOpenInMaps: string;
    mapOpenRoomAccess: string;
    mapOpenSharedAccess: string;
    mapRoomAccessLabel: string;
    mapSharedAccessLabel: string;
    mapNoAccessData: string;
    noFilterResults: string;
    noEmptyRooms: string;
    blockedRoom: string;
    internalNote: string;
    internalNoteEmpty: string;
    opsNote: string;
    opsNoteEmpty: string;
    phone: string;
    phoneMissing: string;
    listReferenceDate: string;
    emptyRoomsModalTitle: string;
    guestCountLabel: string;
    guestCountUnit: string;
    guestCountUnknown: string;
    guestBreakdown: string;
    propertyLabel: string;
    reservationId: string;
    roomLabel: string;
    stayingToday: string;
    today: string;
  };
  isOutOfWindow: boolean;
  buildingInfos: PropertyMapMeta[];
  locale: Locale;
  organizationId: string;
  propertyLabelMap: Record<string, string>;
  propertyOptions: string[];
  propertyRoomsMap?: Record<string, string[]>;
  reservations: CalendarReservationItem[];
  roomBlocks: CalendarRoomBlock[];
  roomMasterRooms?: string[];
  roomSourceDebug?: {
    activeRoomLabels: string[];
    fetchWindow?: { from: string; to: string };
    mode: "authoritative_active" | "authoritative_zero" | "provisional";
    reservationsQuery?: "executed" | "skipped";
  } | null;
  selectedMonth: string;
  selectedMonthLabel: string;
  selectedProperty: string | null;
  statusLabels: Record<CalendarReservationItem["status"], string>;
  today: string;
  initialReservationId?: string | null;
};

export function MobileCalendarLiveView(props: MobileCalendarLiveViewProps) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef(false);
  const channelName = useMemo(
    () => `calendar-reservations:${props.organizationId}`,
    [props.organizationId],
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const scheduleRefresh = () => {
      if (document.visibilityState !== "visible") {
        pendingRefreshRef.current = true;
        return;
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        pendingRefreshRef.current = false;
        router.refresh();
      }, 250);
    };

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "reservations",
        filter: `organization_id=eq.${props.organizationId}`,
      }, () => {
        scheduleRefresh();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "reservation_internal_notes",
        filter: `organization_id=eq.${props.organizationId}`,
      }, () => {
        scheduleRefresh();
      })
      .subscribe();

    // 차단·요금 등 Beds24 쪽 변경 — 서버가 동기화 뒤 보내는 신호(`src/lib/beds24-live.ts`).
    // 예약 변경도 이 신호가 오지만 위 구독과 같은 `scheduleRefresh` 라 한 번만 다시 읽는다.
    // private 채널 — 구독 전에 사용자 JWT 를 실시간 연결에 싣는다.
    let disposed = false;
    const beds24Channel = supabase
      .channel(beds24LiveTopic(props.organizationId), BEDS24_LIVE_CHANNEL_OPTIONS)
      .on("broadcast", { event: BEDS24_LIVE_EVENT }, () => {
        scheduleRefresh();
      });
    const subscribeBeds24 = () => {
      if (!disposed) beds24Channel.subscribe();
    };
    void supabase.realtime.setAuth().then(subscribeBeds24, subscribeBeds24);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && pendingRefreshRef.current) {
        scheduleRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      void supabase.removeChannel(channel);
      void supabase.removeChannel(beds24Channel);
    };
  }, [channelName, props.organizationId, router]);

  return <MobileCalendarView {...props} />;
}
