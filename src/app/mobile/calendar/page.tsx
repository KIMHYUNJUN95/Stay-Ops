import { redirect } from "next/navigation";
import type { CalendarReservationItem } from "@/components/calendar/mobile-calendar-view";
import { MobileCalendarLiveView } from "@/components/calendar/mobile-calendar-live-view";
import { toOriginalReservationId } from "@/lib/beds24/reservation-id";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import {
  getCanonicalPropertyName,
  getCanonicalRoomLabel,
  getDisplayRoomLabel,
  isExcludedOperationalProperty,
  isExcludedOperationalRoom,
} from "@/lib/room-label-normalization";
import {
  type ActiveRoomCatalogItem,
  buildPropertyRoomLookups,
  getActiveRoomCatalog,
  getActiveRoomLabels,
} from "@/lib/rooms";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ReservationRow = Pick<
  Database["public"]["Tables"]["reservations"]["Row"],
  | "id"
  | "check_in_date"
  | "check_out_date"
  | "guest_name"
  | "property_name"
  | "room_label"
  | "source"
  | "source_reservation_id"
  | "status"
  | "raw_payload"
>;

function toJstDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isValidMonth(value: string | undefined): value is string {
  if (!value) return false;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function getCurrentJstMonth() {
  return toJstDateString(new Date()).slice(0, 7);
}

function resolveMonth(value: string | undefined): string {
  return isValidMonth(value) ? value : getCurrentJstMonth();
}

function getPhone(rawPayload: Database["public"]["Tables"]["reservations"]["Row"]["raw_payload"]) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const keys = ["phone", "mobile", "guest_phone", "guestPhone"];
  for (const key of keys) {
    const value = (rawPayload as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function getDisplayReservationId(item: ReservationRow) {
  const fromPayload = getRawPayloadString(item.raw_payload, [
    "apiReference",
    "api_reference",
    "bookId",
    "book_id",
    "reservationId",
    "reservation_id",
    "bookingId",
    "booking_id",
    "id",
  ]);
  if (fromPayload) {
    return fromPayload;
  }
  return toOriginalReservationId(item.source_reservation_id);
}

function getRawPayloadNumber(
  rawPayload: Database["public"]["Tables"]["reservations"]["Row"]["raw_payload"],
  keys: string[],
) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function getGuestCount(rawPayload: Database["public"]["Tables"]["reservations"]["Row"]["raw_payload"]) {
  const total = getRawPayloadNumber(rawPayload, [
    "numAdult",
    "num_adult",
    "num_adults",
    "adults",
    "guestCount",
    "guest_count",
    "pax",
    "persons",
    "guests",
  ]);
  if (total !== null) {
    return Math.max(0, Math.round(total));
  }

  const adult = getRawPayloadNumber(rawPayload, ["adults", "adult", "numAdult", "num_adult"]);
  const child = getRawPayloadNumber(rawPayload, ["children", "child", "numChild", "num_child"]);
  const infant = getRawPayloadNumber(rawPayload, ["infants", "infant", "numInfant", "num_infant"]);
  const candidates = [adult, child, infant].filter((value): value is number => value !== null);
  if (candidates.length === 0) {
    return null;
  }
  const sum = candidates.reduce((acc, value) => acc + value, 0);
  return Math.max(0, Math.round(sum));
}

function getRawPayloadString(
  rawPayload: Database["public"]["Tables"]["reservations"]["Row"]["raw_payload"],
  keys: string[],
) {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }
  const record = rawPayload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }
  return null;
}

type MobileCalendarPageProps = {
  searchParams: Promise<{
    debug?: string;
    month?: string;
    property?: string;
    reservationId?: string;
  }>;
};

// i18n-ignore-start: canonical building-name domain keys (room-label normalization), not UI copy.
const BUILDING_DISPLAY_ORDER = [
  "아라키초A",
  "아라키초B",
  "가부키초",
  "다카다노바바",
  "오쿠보A",
  "오쿠보B",
  "오쿠보C",
];
// i18n-ignore-end

function normalizePropertyParam(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = getCanonicalPropertyName(value.trim());
  return trimmed.length > 0 ? trimmed : null;
}

function localizePropertyName(
  canonicalPropertyName: string,
  locale: "en" | "ja" | "ko",
) {
  const labels: Record<string, { en: string; ja: string; ko: string }> = {
    "아라키초A": { en: "ArakichoA", ja: "荒木町A", ko: "아라키초A" },
    "아라키초B": { en: "ArakichoB", ja: "荒木町B", ko: "아라키초B" },
    "가부키초": { en: "Kabukicho", ja: "歌舞伎町", ko: "가부키초" },
    "다카다노바바": { en: "Takadanobaba", ja: "高田馬場", ko: "다카다노바바" },
    "오쿠보A": { en: "OkuboA", ja: "大久保A", ko: "오쿠보A" },
    "오쿠보B": { en: "OkuboB", ja: "大久保B", ko: "오쿠보B" },
    "오쿠보C": { en: "OkuboC", ja: "大久保C", ko: "오쿠보C" },
  };
  const entry = labels[canonicalPropertyName];
  if (!entry) return canonicalPropertyName;
  return entry[locale] ?? canonicalPropertyName;
}

function sortBuildings(values: string[]) {
  return values.sort((a, b) => {
    const aIndex = BUILDING_DISPLAY_ORDER.indexOf(a);
    const bIndex = BUILDING_DISPLAY_ORDER.indexOf(b);
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

export default async function MobileCalendarPage({ searchParams }: MobileCalendarPageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  const rawMonth = params.month;
  const selectedProperty = normalizePropertyParam(params.property);
  const initialReservationId = params.reservationId ?? null;
  const roomDebugEnabled =
    process.env.NODE_ENV === "development" && params.debug === "rooms";
  const nextPathParams = new URLSearchParams();
  if (isValidMonth(rawMonth)) {
    nextPathParams.set("month", rawMonth);
  }
  if (selectedProperty) {
    nextPathParams.set("property", selectedProperty);
  }
  const nextPath = nextPathParams.size > 0 ? `/mobile/calendar?${nextPathParams.toString()}` : "/mobile/calendar";

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }
  if (state.status !== "ready" || !session) {
    const onboardingUrl = isValidMonth(rawMonth)
      ? `/onboarding?next=${encodeURIComponent(nextPath)}`
      : "/onboarding";
    redirect(onboardingUrl);
  }

  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const dictionary = getDictionary(session.user.preferredLanguage);
  const selectedMonth = resolveMonth(rawMonth);
  const monthStart = `${selectedMonth}-01`;
  const selectedMonthLabel = new Intl.DateTimeFormat(session.user.preferredLanguage, {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${monthStart}T00:00:00.000Z`));

  const today = toJstDateString(new Date());

  // Operational fetch window: always current month (today's month) + next month.
  // Fixed relative to TODAY, not to selectedMonth (UI navigation).
  const currentJstMonth = today.slice(0, 7); // e.g., "2026-05"
  const [opYear, opMonth] = currentJstMonth.split("-").map(Number);
  const operationalMonthStart = `${currentJstMonth}-01`; // e.g., "2026-05-01"
  // Exclusive upper bound: first day of the month after next (2 months from now)
  const operationalWindowEnd = new Date(Date.UTC(opYear, opMonth + 1, 1)).toISOString().slice(0, 10); // e.g., "2026-07-01"

  // Server-side out-of-window check: skip the reservations query entirely when
  // selectedMonth is outside the 2-month operational window. No DB read needed
  // for a result we already know is empty.
  // getActiveRoomLabels is always fetched for debug consistency and room-source display.
  const nextJstMonth = new Date(Date.UTC(opYear, opMonth, 1)).toISOString().slice(0, 7);
  const isOutOfWindow = selectedMonth !== currentJstMonth && selectedMonth !== nextJstMonth;

  const supabase = await getSupabaseServerClient();

  let reservations: CalendarReservationItem[] = [];
  let roomMasterRooms: string[] | undefined;
  let roomCatalog: ActiveRoomCatalogItem[] | undefined;

  if (isOutOfWindow) {
    const [rooms, catalog] = await Promise.all([
      getActiveRoomLabels(session.organization.id, supabase),
      getActiveRoomCatalog(session.organization.id, supabase),
    ]);
    roomMasterRooms = rooms;
    roomCatalog = catalog;
  } else {
    const [{ data, error }, rooms, catalog] = await Promise.all([
      supabase
        .from("reservations")
        .select(
          "id, check_in_date, check_out_date, guest_name, property_name, room_label, source, source_reservation_id, status, raw_payload",
        )
        .eq("organization_id", session.organization.id)
        .lt("check_in_date", operationalWindowEnd)
        .gte("check_out_date", operationalMonthStart)
        .neq("status", "cancelled")
        .neq("status", "no_show")
        .order("check_in_date", { ascending: true }),
      getActiveRoomLabels(session.organization.id, supabase),
      getActiveRoomCatalog(session.organization.id, supabase),
    ]);

    if (error) {
      throw new Error(error.message);
    }

    roomMasterRooms = rooms;
    roomCatalog = catalog;
    const roomLookups = buildPropertyRoomLookups(roomCatalog ?? []);

    // Cross-property externalRoomId lookup: handles property-name mismatch (e.g., Beds24
    // sends Japanese "荒木町A" which may not normalize to canonical "아라키초A" depending on
    // the normalizer's alias coverage). externalRoomId is unique across the rooms table.
    const globalExternalRoomToCanonical = new Map<string, string>(
      (roomCatalog ?? [])
        .filter((item) => item.externalRoomId !== null)
        .map((item) => [item.externalRoomId as string, item.canonicalRoomLabel]),
    );

    const resolveReservationCanonicalRoomLabel = (item: ReservationRow) => {
      const canonicalPropertyName = getCanonicalPropertyName(item.property_name);
      const allowed =
        roomLookups.allowedCanonicalByProperty[canonicalPropertyName] ?? new Set<string>();
      const rawLabelMap = roomLookups.canonicalByRawLabel[canonicalPropertyName] ?? {};
      const externalIdMap = roomLookups.canonicalByExternalId[canonicalPropertyName] ?? {};
      const isAuthoritative = roomMasterRooms !== undefined;

      const acceptCanonical = (key: string | null | undefined): string | null => {
        if (!key || !allowed.has(key)) return null;
        return key;
      };

      const payloadUnitId = getRawPayloadString(item.raw_payload, [
        "roomId",
        "room_id",
        "unitId",
        "unit_id",
      ]);
      if (payloadUnitId) {
        const fromExternal =
          externalIdMap[payloadUnitId] ??
          globalExternalRoomToCanonical.get(payloadUnitId) ??
          null;
        const resolved = acceptCanonical(fromExternal);
        if (resolved) return resolved;
        if (isAuthoritative) return null;
      }

      const payloadUnitName = getRawPayloadString(item.raw_payload, [
        "unitName",
        "unit_name",
        "roomName",
        "room_name",
        "roomLabel",
        "unitLabel",
        "unit_label",
        "room_label",
      ]);
      if (payloadUnitName) {
        const exactPayload = acceptCanonical(rawLabelMap[payloadUnitName]);
        if (exactPayload) return exactPayload;
        const normalizedPayload = acceptCanonical(
          getCanonicalRoomLabel(canonicalPropertyName, payloadUnitName),
        );
        if (normalizedPayload) return normalizedPayload;
      }

      const exactRoomLabel = acceptCanonical(rawLabelMap[item.room_label]);
      if (exactRoomLabel) return exactRoomLabel;

      const normalizedRoomLabel = acceptCanonical(
        getCanonicalRoomLabel(canonicalPropertyName, item.room_label),
      );
      if (normalizedRoomLabel) return normalizedRoomLabel;

      if (isAuthoritative) {
        return null;
      }

      if (payloadUnitId) {
        const fromExternal =
          externalIdMap[payloadUnitId] ??
          globalExternalRoomToCanonical.get(payloadUnitId) ??
          null;
        const resolved = acceptCanonical(fromExternal);
        if (resolved) return resolved;
      }

      return normalizedRoomLabel;
    };

    const filteredRows = ((data ?? []) as ReservationRow[]).filter(
      (item) =>
        !isExcludedOperationalProperty(item.property_name) &&
        !isExcludedOperationalRoom(item.property_name, item.room_label),
    );

    const mapToCalendarItem = (item: ReservationRow): CalendarReservationItem => {
      const canonicalProperty = getCanonicalPropertyName(item.property_name);
      // Never drop a reservation. Resolve to the active-catalog room when possible; if it
      // does not map (unknown/inactive room), fall back to the normalized room label so the
      // booking still renders on a (fallback) row — mirrors the in-house reference system,
      // which always assigns a room and never discards a booking. Orphan rooms are added to
      // the room axis below so the bar has a row to sit on.
      const internalRoomKey =
        resolveReservationCanonicalRoomLabel(item) ||
        getCanonicalRoomLabel(canonicalProperty, item.room_label) ||
        item.room_label.trim();
      // Convert internal key → display label so 402 and 402_2 share one calendar row.
      const roomLabel = getDisplayRoomLabel(canonicalProperty, internalRoomKey) || internalRoomKey;
      return {
        checkInDate: item.check_in_date,
        checkOutDate: item.check_out_date,
        guestCount: getGuestCount(item.raw_payload),
        guestName: item.guest_name,
        id: item.id,
        phone: getPhone(item.raw_payload),
        propertyName: canonicalProperty,
        roomLabel,
        source: item.source,
        sourceReservationId: getDisplayReservationId(item),
        status: item.status,
      };
    };

    // Authoritative mode: render only reservations that belong to active room-master rows.
    // Company rule is already reflected in room master classification:
    // external_minimum_stay >= 50 => inactive room (excluded).
    // Never drop: map every reservation. Orphan rooms (room not in the active catalog) are
    // added to the room axis (canonicalRoomMasterRooms / propertyRoomsMap) below so their
    // bars still render instead of silently disappearing.
    reservations = filteredRows.map(mapToCalendarItem);
  }

  const propertyOptionsFromCatalog = roomCatalog
    ? [...new Set(roomCatalog.map((item) => item.propertyName))]
    : [];
  const propertyOptionsFromReservations = [...new Set(reservations.map((item) => item.propertyName))];
  const propertyOptions = sortBuildings(
    [...new Set([...propertyOptionsFromCatalog, ...propertyOptionsFromReservations])].filter(
      (name) => name.trim().length > 0 && !isExcludedOperationalProperty(name),
    ),
  );
  const propertyLabelMap = Object.fromEntries(
    propertyOptions.map((property) => [
      property,
      localizePropertyName(property, session.user.preferredLanguage),
    ]),
  );
  const effectiveSelectedProperty =
    selectedProperty && propertyOptions.includes(selectedProperty)
      ? selectedProperty
      : null;
  let propertyRoomsMap =
    roomCatalog === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(
            roomCatalog.reduce<Record<string, string[]>>((acc, item) => {
              if (!acc[item.propertyName]) {
                acc[item.propertyName] = [];
              }
              // Use displayRoomLabel so sub-units (402, 402_2) share one calendar row per property.
              acc[item.propertyName].push(item.displayRoomLabel);
              return acc;
            }, {}),
          ).map(([property, labels]) => [property, [...new Set(labels)].sort()]),
        );
  let canonicalRoomMasterRooms =
    roomCatalog === undefined
      ? roomMasterRooms
      : [...new Set(roomCatalog.map((item) => item.displayRoomLabel))];

  // Fallback axis rows: add any reservation room that is not already in the catalog axis so
  // no booking is hidden for lack of a row (we no longer drop unmapped reservations). Orphan
  // rooms are rare — mostly brand-new or fully long-stay (>=50) physical rooms.
  if (canonicalRoomMasterRooms !== undefined) {
    const masterSet = new Set(canonicalRoomMasterRooms);
    for (const r of reservations) {
      if (r.roomLabel && getCanonicalPropertyName(r.roomLabel) !== r.propertyName)
        masterSet.add(r.roomLabel);
    }
    canonicalRoomMasterRooms = [...masterSet];
  }
  if (propertyRoomsMap !== undefined) {
    const augmented: Record<string, string[]> = { ...propertyRoomsMap };
    for (const r of reservations) {
      if (!r.roomLabel || getCanonicalPropertyName(r.roomLabel) === r.propertyName) continue;
      const list = augmented[r.propertyName] ? [...augmented[r.propertyName]] : [];
      if (!list.includes(r.roomLabel)) {
        list.push(r.roomLabel);
        list.sort();
      }
      augmented[r.propertyName] = list;
    }
    propertyRoomsMap = augmented;
  }

  const roomSourceDebug = roomDebugEnabled
    ? {
        activeRoomLabels: roomMasterRooms ?? [],
        fetchWindow: { from: operationalMonthStart, to: operationalWindowEnd },
        mode:
          roomMasterRooms === undefined
            ? ("provisional" as const)
            : roomMasterRooms.length === 0
              ? ("authoritative_zero" as const)
              : ("authoritative_active" as const),
        reservationsQuery: isOutOfWindow ? ("skipped" as const) : ("executed" as const),
      }
    : null;

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell
      activeItem="calendar"
      appearance="cleaning"
      badges={navBadges}
      title={dictionary.navigation.mobile.calendar}
    >
      <MobileCalendarLiveView
        copy={{
          calendar: dictionary.navigation.mobile.calendar,
          calendarBuildingChange: dictionary.mobile.calendarBuildingChange,
          calendarBuildingHotelLabel: dictionary.mobile.calendarBuildingHotelLabel,
          calendarBuildingHouseLabel: dictionary.mobile.calendarBuildingHouseLabel,
          calendarBuildingPickerBody: dictionary.mobile.calendarBuildingPickerBody,
          calendarBuildingPickerQuestion: dictionary.mobile.calendarBuildingPickerQuestion,
          calendarTokyoNowLabel: dictionary.mobile.calendarTokyoNowLabel,
          legendDirect: dictionary.mobile.calendarLegendDirect,
          calendarBuildingPickerTitle: dictionary.mobile.calendarBuildingPickerTitle,
          call: dictionary.mobile.calendarCall,
          checkInLabel: dictionary.mobile.calendarCheckInLabel,
          checkOutLabel: dictionary.mobile.calendarCheckOutLabel,
          checkIns: dictionary.admin.stats.checkIns,
          checkOuts: dictionary.admin.stats.checkOuts,
          close: dictionary.mobile.calendarClose,
          copied: dictionary.mobile.calendarCopied,
          copyNumber: dictionary.mobile.calendarCopyNumber,
          emptyAccuracyHint: dictionary.mobile.calendarEmptyAccuracyHint,
          calendarOutOfWindowBody: dictionary.mobile.calendarOutOfWindowBody,
          calendarOutOfWindowTitle: dictionary.mobile.calendarOutOfWindowTitle,
          emptyToday: dictionary.admin.stats.emptyToday,
          filterAll: dictionary.mobile.filterAll,
          listView: dictionary.mobile.calendarListView,
          mapTab: dictionary.mobile.calendarMapTab,
          mapAccessSheetTitle: dictionary.mobile.calendarMapAccessSheetTitle,
          mapAddressLabel: dictionary.mobile.calendarMapAddressLabel,
          mapAddressCopy: dictionary.mobile.calendarMapAddressCopy,
          mapAddressMissing: dictionary.mobile.calendarMapAddressMissing,
          mapAccessFloor1: dictionary.mobile.calendarMapAccessFloor1,
          mapAccessKindDoorPassword: dictionary.mobile.calendarMapAccessKindDoorPassword,
          mapAccessKindKeyBox: dictionary.mobile.calendarMapAccessKindKeyBox,
          mapAccessKindKeyBoxPassword: dictionary.mobile.calendarMapAccessKindKeyBoxPassword,
          mapAccessKindLinenStorageEntrancePassword: dictionary.mobile.calendarMapAccessKindLinenStorageEntrancePassword,
          mapAccessKindRoomPassword: dictionary.mobile.calendarMapAccessKindRoomPassword,
          mapAccessKindStorage: dictionary.mobile.calendarMapAccessKindStorage,
          mapAccessKindStoragePassword: dictionary.mobile.calendarMapAccessKindStoragePassword,
          mapAccessNoteAllRoomsSame: dictionary.mobile.calendarMapAccessNoteAllRoomsSame,
          mapCopiedAddress: dictionary.mobile.calendarMapCopiedAddress,
          mapCopiedCode: dictionary.mobile.calendarMapCopiedCode,
          mapOpenAccess: dictionary.mobile.calendarMapOpenAccess,
          mapOpenInMaps: dictionary.mobile.calendarMapOpenInMaps,
          mapOpenRoomAccess: dictionary.mobile.calendarMapOpenRoomAccess,
          mapOpenSharedAccess: dictionary.mobile.calendarMapOpenSharedAccess,
          mapRoomAccessLabel: dictionary.mobile.calendarMapRoomAccessLabel,
          mapSharedAccessLabel: dictionary.mobile.calendarMapSharedAccessLabel,
          mapNoAccessData: dictionary.mobile.calendarMapNoAccessData,
          noFilterResults: dictionary.mobile.noFilterResults,
          noEmptyRooms: dictionary.mobile.calendarNoEmptyRooms,
          listReferenceDate: dictionary.mobile.calendarListReferenceDate,
          emptyRoomsModalTitle: dictionary.mobile.calendarEmptyRoomsModalTitle,
          guestCountLabel: dictionary.mobile.calendarGuestCountLabel,
          guestCountUnit: dictionary.mobile.calendarGuestCountUnit,
          guestCountUnknown: dictionary.mobile.calendarGuestCountUnknown,
          phone: dictionary.admin.users.phone,
          phoneMissing: dictionary.mobile.calendarPhoneMissing,
          propertyLabel: dictionary.mobile.calendarPropertyLabel,
          reservationId: dictionary.mobile.calendarReservationId,
          roomLabel: dictionary.mobile.calendarRoomLabel,
          stayingToday: dictionary.admin.stats.stayingToday,
          today: dictionary.mobile.today,
        }}
        isOutOfWindow={isOutOfWindow}
        locale={session.user.preferredLanguage}
        organizationId={session.organization.id}
        reservations={reservations}
        roomMasterRooms={canonicalRoomMasterRooms}
        roomSourceDebug={roomSourceDebug}
        selectedMonth={selectedMonth}
        selectedMonthLabel={selectedMonthLabel}
        propertyOptions={propertyOptions}
        propertyLabelMap={propertyLabelMap}
        propertyRoomsMap={propertyRoomsMap}
        selectedProperty={effectiveSelectedProperty}
        statusLabels={dictionary.admin.reservationStatusLabels}
        today={today}
        initialReservationId={initialReservationId}
      />
    </MobileShell>
  );
}

