"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { UIEvent } from "react";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import {
  BedDouble,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Home,
  List,
  MapIcon,
  MapPin,
  Phone,
  KeyRound,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import { PROPERTY_MAP_META, type PropertyMapMeta, getPropertyAddress } from "@/lib/property-map-links";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { useBodyScrollLock } from "@/components/shell/use-body-scroll-lock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import buildingLottie from "@/assets/building-lottie.json";

export type CalendarReservationItem = {
  checkInDate: string;
  checkOutDate: string;
  guestCount: number | null;
  guestName: string;
  id: string;
  phone: string | null;
  propertyName: string;
  roomLabel: string;
  source: string;
  sourceReservationId: string;
  status: "cancelled" | "checked_in" | "checked_out" | "confirmed" | "no_show";
};

function computeEmptyRooms(
  roomAxisRooms: string[],
  stayingAtReferenceDate: Pick<CalendarReservationItem, "roomLabel">[],
  isAuthoritative: boolean,
): { count: number; isProvisional: boolean } {
  const occupiedRoomSet = new Set(stayingAtReferenceDate.map((item) => item.roomLabel));
  const roomSet = new Set(roomAxisRooms);
  const emptyCount = [...roomSet].filter((room) => !occupiedRoomSet.has(room)).length;
  return { count: Math.max(0, emptyCount), isProvisional: !isAuthoritative };
}

type MobileCalendarViewProps = {
  copy: {
    calendar: string;
    calendarBuildingChange: string;
    calendarBuildingHotelLabel: string;
    calendarBuildingHouseLabel: string;
    calendarBuildingPickerBody: string;
    calendarTokyoNowLabel: string;
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
    phone: string;
    phoneMissing: string;
    listReferenceDate: string;
    emptyRoomsModalTitle: string;
    guestCountLabel: string;
    guestCountUnit: string;
    guestCountUnknown: string;
    propertyLabel: string;
    reservationId: string;
    roomLabel: string;
    stayingToday: string;
    today: string;
  };
  // Computed server-side: true when selectedMonth is outside the 2-month operational window.
  // Passed as a prop to avoid recomputing on the client and to keep a single source of truth.
  isOutOfWindow: boolean;
  locale: Locale;
  reservations: CalendarReservationItem[];
  // When populated with room labels from the room master table, Empty today switches
  // to an authoritative count. Leave undefined while the rooms table does not exist.
  roomMasterRooms?: string[];
  propertyRoomsMap?: Record<string, string[]>;
  roomSourceDebug?: {
    activeRoomLabels: string[];
    fetchWindow?: { from: string; to: string };
    mode: "authoritative_active" | "authoritative_zero" | "provisional";
    reservationsQuery?: "executed" | "skipped";
  } | null;
  selectedMonth: string;
  selectedMonthLabel: string;
  propertyOptions: string[];
  propertyLabelMap: Record<string, string>;
  selectedProperty: string | null;
  statusLabels: Record<CalendarReservationItem["status"], string>;
  today: string;
  initialReservationId?: string | null;
};

const DAY_WIDTH = 34;
const ROOM_LABEL_WIDTH = 64;
const CALENDAR_BAR_HEIGHT = 32;
const CALENDAR_BAR_TOP = 8;
/** Compact vertical offset per lane ??keeps all bars within the fixed row height. */
const CALENDAR_COMPACT_LANE_OFFSET = 4;
const CALENDAR_SINGLE_ROW_HEIGHT = 48;
/** Room grid pane height ??uses remaining viewport below shell chrome + bottom nav padding. */
const CALENDAR_GRID_VIEWPORT_HEIGHT = "calc(100dvh - 20rem)";
const CALENDAR_GRID_MIN_HEIGHT_PX = 220;
const DEFAULT_CHECK_IN_TIME = "16:00";
const DEFAULT_CHECK_OUT_TIME = "10:00";

type ReservationBarBounds = {
  leftPx: number;
  rightPx: number;
  widthPx: number;
};

type ReservationBarLayout = ReservationBarBounds & {
  id: string;
  item: CalendarReservationItem;
  laneIndex: number;
};

function computeReservationBarBounds(
  item: CalendarReservationItem,
  rangeStart: string,
  rangeEndExclusive: string,
  datesLength: number,
): ReservationBarBounds {
  const checkInVisible = item.checkInDate >= rangeStart;
  const checkOutVisible = item.checkOutDate < rangeEndExclusive;

  const msPerDay = 86400000;
  const rangeStartMs = parseDate(rangeStart).getTime();

  const leftPx = checkInVisible
    ? ((parseDate(item.checkInDate).getTime() - rangeStartMs) / msPerDay) * DAY_WIDTH +
      DAY_WIDTH / 2
    : 0;

  const rightPx = checkOutVisible
    ? ((parseDate(item.checkOutDate).getTime() - rangeStartMs) / msPerDay) * DAY_WIDTH +
      DAY_WIDTH / 2
    : datesLength * DAY_WIDTH;

  const widthPx = Math.max(DAY_WIDTH / 2, rightPx - leftPx);
  return {
    leftPx: roundCalendarPx(leftPx),
    rightPx: roundCalendarPx(rightPx),
    widthPx: roundCalendarPx(widthPx),
  };
}

function roundCalendarPx(value: number) {
  return Math.round(value * 100) / 100;
}

/** Half-open rendered interval ??turnover at equal boundary is non-overlapping. */
function reservationBarsOverlap(
  a: Pick<ReservationBarBounds, "leftPx" | "rightPx">,
  b: Pick<ReservationBarBounds, "leftPx" | "rightPx">,
) {
  return a.leftPx < b.rightPx && b.leftPx < a.rightPx;
}

function assignReservationLanes(
  items: CalendarReservationItem[],
  rangeStart: string,
  rangeEndExclusive: string,
  datesLength: number,
): { bars: ReservationBarLayout[] } {
  if (items.length === 0) {
    return { bars: [] };
  }

  const bars = items.map((item) => {
    const bounds = computeReservationBarBounds(item, rangeStart, rangeEndExclusive, datesLength);
    return { ...bounds, id: item.id, item };
  });

  const sorted = [...bars].sort((a, b) => {
    if (a.leftPx !== b.leftPx) return a.leftPx - b.leftPx;
    return a.rightPx - b.rightPx;
  });

  const lanes: Array<Array<Pick<ReservationBarBounds, "leftPx" | "rightPx">>> = [];
  const assigned: ReservationBarLayout[] = [];

  for (const bar of sorted) {
    let laneIndex = 0;
    for (; laneIndex < lanes.length; laneIndex += 1) {
      const overlaps = lanes[laneIndex].some((existing) =>
        reservationBarsOverlap(bar, existing),
      );
      if (!overlaps) break;
    }

    if (laneIndex === lanes.length) {
      lanes.push([]);
    }
    lanes[laneIndex].push({ leftPx: bar.leftPx, rightPx: bar.rightPx });
    assigned.push({ ...bar, laneIndex });
  }

  return { bars: assigned };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calendarRowHeightForBars(_bars: ReservationBarLayout[]) {
  return CALENDAR_SINGLE_ROW_HEIGHT;
}
const GLASS_PANEL =
  "rounded-[24px] border border-slate-200/80 bg-surface shadow-[0_18px_34px_-28px_rgba(31,58,95,0.42)] backdrop-blur-none";
const GLASS_CARD =
  "rounded-2xl border border-slate-200/80 bg-surface shadow-[0_14px_28px_-24px_rgba(31,58,95,0.38)] backdrop-blur-none";
// 以묒븰 怨좎젙 modal card (?덉빟 ?곸꽭 / 鍮?媛앹떎 / 吏??怨듭슜)
const RESERVATION_SHEET_TRANSITION_MS = 440;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateLabel(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
  }).format(parseDate(value));
}

function addDays(base: string, days: number) {
  const date = parseDate(base);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildRange(start: string, days: number) {
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

function normalizeSource(source: string) {
  const value = source.toLowerCase();
  if (value.includes("booking")) return "booking";
  if (value.includes("airbnb")) return "airbnb";
  return "other";
}

function sourceClass(source: string) {
  const normalized = normalizeSource(source);
  if (normalized === "booking") {
    return "bg-[linear-gradient(180deg,#5379b8_0%,#39588f_100%)] border-[#39588f]/40 shadow-slate-900/25";
  }
  if (normalized === "airbnb") {
    return "bg-[linear-gradient(180deg,#ff718c_0%,#f05273_100%)] border-rose-200/80 shadow-rose-900/25";
  }
  return "bg-[linear-gradient(180deg,#aeb9c8_0%,#8795a8_100%)] border-slate-200/80 shadow-slate-900/20";
}

function reservationBarLabel(name: string, widthPx: number) {
  const trimmed = name.trim();
  if (widthPx < 34) return "";
  if (widthPx < 52) return trimmed.slice(0, 1);
  if (widthPx < 82) return trimmed.split(/\s+/)[0] ?? trimmed;
  return trimmed;
}

function toDialablePhone(value: string | null) {
  if (!value) return null;
  const normalized = value.trim().replace(/[^\d+]/g, "");
  return normalized.length > 0 ? normalized : null;
}

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function sharedAccessLabel(
  item: PropertyMapMeta["sharedAccess"][number],
  copy: MobileCalendarViewProps["copy"],
) {
  const labelByKey: Record<PropertyMapMeta["sharedAccess"][number]["labelKey"], string> = {
    doorPassword: copy.mapAccessKindDoorPassword,
    keyBox: copy.mapAccessKindKeyBox,
    keyBoxPassword: copy.mapAccessKindKeyBoxPassword,
    linenStorageEntrancePassword: copy.mapAccessKindLinenStorageEntrancePassword,
    roomPassword: copy.mapAccessKindRoomPassword,
    storage: copy.mapAccessKindStorage,
    storagePassword: copy.mapAccessKindStoragePassword,
  };
  const label = labelByKey[item.labelKey];
  return item.prefixKey === "floor1" ? `${copy.mapAccessFloor1} ${label}` : label;
}

function sharedAccessCodeLabel(
  item: PropertyMapMeta["sharedAccess"][number],
  copy: MobileCalendarViewProps["copy"],
) {
  return item.noteKey === "allRoomsSame"
    ? `${item.code} (${copy.mapAccessNoteAllRoomsSame})`
    : item.code;
}

export function MobileCalendarView({
  copy,
  isOutOfWindow,
  locale,
  propertyOptions,
  propertyLabelMap,
  reservations,
  roomMasterRooms,
  propertyRoomsMap,
  roomSourceDebug,
  selectedProperty: selectedPropertyProp,
  selectedMonth,
  selectedMonthLabel,
  statusLabels,
  today,
  initialReservationId,
}: MobileCalendarViewProps) {
  const searchParams = useSearchParams();
  // Resolve the active building from the live URL first, falling back to the server prop.
  // A soft client navigation (router.push) to /mobile/calendar may serve a prefetched/cached RSC
  // payload whose searchParams differ from the URL (e.g. the param-less building-picker payload),
  // leaving the server prop stale. The page fetches reservations/propertyRoomsMap/propertyOptions
  // independently of the selected property, so deriving it from the URL renders the grid correctly
  // without a manual refresh. Falls back to the prop on full document loads.
  const selectedProperty = useMemo(() => {
    const fromUrl = searchParams.get("property");
    if (fromUrl && propertyOptions.includes(fromUrl)) return fromUrl;
    return selectedPropertyProp;
  }, [searchParams, propertyOptions, selectedPropertyProp]);
  const [tokyoNow, setTokyoNow] = useState(() =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    }).format(new Date()),
  );

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Tokyo",
    });
    const update = () => setTokyoNow(formatter.format(new Date()));
    update();
    // The clock only shows HH:MM, so tick every 30s instead of every second — a 1s interval
    // re-rendered this whole (large) calendar component once per second for no visible gain.
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, [locale]);

  const [mode, setMode] = useState<"overview" | "lists" | "map">("overview");
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [isReservationSheetOpen, setIsReservationSheetOpen] = useState(false);
  const [isEmptyRoomsModalOpen, setIsEmptyRoomsModalOpen] = useState(false);
  const [selectedMapProperty, setSelectedMapProperty] = useState<PropertyMapMeta | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [mapCopyFeedback, setMapCopyFeedback] = useState<string | null>(null);
  const reservationCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAnyModalOpen =
    Boolean(selectedReservationId) || isEmptyRoomsModalOpen || Boolean(selectedMapProperty);
  useBodyScrollLock(isAnyModalOpen);

  // isOutOfWindow is computed server-side and passed as a prop to keep a single source of truth.
  // Server already passes reservations=[] when out-of-window; this guard is a defensive layer.
  const effectiveReservations = useMemo(() => {
    const base = isOutOfWindow ? [] : reservations;
    if (!selectedProperty) return base;
    return base.filter((item) => item.propertyName === selectedProperty);
  }, [isOutOfWindow, reservations, selectedProperty]);

  const selectedReservation = useMemo(
    () => effectiveReservations.find((item) => item.id === selectedReservationId) ?? null,
    [effectiveReservations, selectedReservationId],
  );

  const rooms = useMemo(() => {
    const source =
      selectedProperty && propertyRoomsMap
        ? propertyRoomsMap[selectedProperty] ?? []
        : roomMasterRooms ?? [];
    return [...new Set(source)].sort();
  }, [roomMasterRooms, propertyRoomsMap, selectedProperty]);

  const rangeStart = `${selectedMonth}-01`;
  const daysInMonth = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }, [selectedMonth]);
  const dates = useMemo(() => buildRange(rangeStart, daysInMonth), [daysInMonth, rangeStart]);
  const [selectedYear, selectedMonthNumber] = selectedMonth.split("-").map(Number);
  const previousMonth = new Date(Date.UTC(selectedYear, selectedMonthNumber - 2, 1))
    .toISOString()
    .slice(0, 7);
  const nextMonth = new Date(Date.UTC(selectedYear, selectedMonthNumber, 1))
    .toISOString()
    .slice(0, 7);
  // Exclusive upper bound for bar width / overlap calculations.
  // Using the first day of next month (not the last day of this month) ensures the final
  // day column is fully included: a stay ending on 06-01 occupies all of 05-31.
  const rangeEndExclusive = `${nextMonth}-01`;
  const monthBaseParams = new URLSearchParams();
  if (selectedProperty) {
    monthBaseParams.set("property", selectedProperty);
  }
  const previousHref = new URLSearchParams(monthBaseParams);
  previousHref.set("month", previousMonth);
  const nextHref = new URLSearchParams(monthBaseParams);
  nextHref.set("month", nextMonth);
  const buildingPickerHref = new URLSearchParams();
  buildingPickerHref.set("month", selectedMonth);
  const propertyMetaByName = useMemo(
    () => new Map(PROPERTY_MAP_META.map((item) => [item.canonicalName, item])),
    [],
  );
  const getPropertyCalendarHref = (property: string) => {
    const params = new URLSearchParams();
    params.set("month", selectedMonth);
    params.set("property", property);
    return `/mobile/calendar?${params.toString()}`;
  };

  const activeInRange = effectiveReservations.filter(
    (item) => item.checkInDate < rangeEndExclusive && item.checkOutDate > rangeStart,
  );

  const byRoom = useMemo(() => {
    const map = new Map<string, CalendarReservationItem[]>();
    for (const room of rooms) {
      map.set(room, []);
    }
    for (const item of activeInRange) {
      map.get(item.roomLabel)?.push(item);
    }
    return map;
  }, [activeInRange, rooms]);

  const roomBarLayouts = useMemo(() => {
    const layouts = new Map<string, { bars: ReservationBarLayout[]; rowHeight: number }>();
    for (const room of rooms) {
      const items = byRoom.get(room) ?? [];
      const { bars } = assignReservationLanes(
        items,
        rangeStart,
        rangeEndExclusive,
        dates.length,
      );
      layouts.set(room, { bars, rowHeight: calendarRowHeightForBars(bars) });
    }
    return layouts;
  }, [byRoom, dates.length, rangeEndExclusive, rangeStart, rooms]);

  const calendarBodyHeight = useMemo(
    () =>
      rooms.reduce(
        (total, room) =>
          total + (roomBarLayouts.get(room)?.rowHeight ?? CALENDAR_SINGLE_ROW_HEIGHT),
        0,
      ),
    [roomBarLayouts, rooms],
  );

  // today is passed from server (Asia/Tokyo) ??never recompute on client
  // findIndex (not indexOf) makes the "date === today" predicate explicit
  const todayIndex = dates.findIndex((date) => date === today);
  const isTodayInView = todayIndex !== -1;
  // Lists mode always uses the real operational "today" snapshot, regardless of selectedMonth.
  const listReferenceDate = today;
  const fallbackVisibleDateRangeLabel = useMemo(() => {
    if (dates.length === 0) return formatDateLabel(rangeStart, locale);
    const firstDate = dates[0];
    const lastPreviewDate = dates[Math.min(dates.length - 1, 6)] ?? firstDate;
    return `${formatDateLabel(firstDate, locale)} - ${formatDateLabel(lastPreviewDate, locale)}`;
  }, [dates, locale, rangeStart]);

  const activeRoomSet = useMemo(() => new Set(rooms), [rooms]);
  const activeReservations = useMemo(
    () => effectiveReservations.filter((item) => activeRoomSet.has(item.roomLabel)),
    [effectiveReservations, activeRoomSet],
  );
  const checkInsToday = activeReservations.filter((item) => item.checkInDate === listReferenceDate);
  const checkOutsToday = activeReservations.filter((item) => item.checkOutDate === listReferenceDate);
  const stayingToday = activeReservations.filter(
    (item) => item.checkInDate <= listReferenceDate && item.checkOutDate > listReferenceDate,
  );
  const emptyToday = useMemo(
    () => computeEmptyRooms(rooms, stayingToday, roomMasterRooms !== undefined),
    [rooms, stayingToday, roomMasterRooms],
  );
  const emptyRoomLabels = useMemo(() => {
    const occupiedRoomSet = new Set(stayingToday.map((item) => item.roomLabel));
    return rooms.filter((room) => !occupiedRoomSet.has(room));
  }, [rooms, stayingToday]);

  // Auto-scroll: bring today (and the day before) into view on first entry per month/property.
  // Uses a Set so each selectedMonth+selectedProperty combo scrolls at most once per session.
  // mode is in the dependency array so the effect re-runs when overview panel mounts.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrolledKeys = useRef(new Set<string>());
  const [visibleDateRangeLabel, setVisibleDateRangeLabel] = useState<string | null>(null);

  const updateVisibleDateRangeLabel = useCallback(
    (scrollLeft: number, clientWidth: number) => {
      if (dates.length === 0) {
        setVisibleDateRangeLabel(null);
        return;
      }

      const startIndex = Math.max(0, Math.min(dates.length - 1, Math.floor(scrollLeft / DAY_WIDTH)));
      const visibleDateCount = Math.max(1, Math.ceil((clientWidth - ROOM_LABEL_WIDTH) / DAY_WIDTH));
      const endIndex = Math.max(
        startIndex,
        Math.min(dates.length - 1, startIndex + visibleDateCount - 1),
      );

      setVisibleDateRangeLabel(
        `${formatDateLabel(dates[startIndex], locale)} - ${formatDateLabel(dates[endIndex], locale)}`,
      );
    },
    [dates, locale],
  );

  const handleGridScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const { clientWidth, scrollLeft, scrollTop } = event.currentTarget;
    updateVisibleDateRangeLabel(scrollLeft, clientWidth);
    window.dispatchEvent(
      new CustomEvent("mobile-shell-scroll", {
        detail: { scrollTop },
      }),
    );
  }, [updateVisibleDateRangeLabel]);

  const openReservationSheet = useCallback((reservationId: string) => {
    if (reservationCloseTimeoutRef.current) {
      clearTimeout(reservationCloseTimeoutRef.current);
      reservationCloseTimeoutRef.current = null;
    }
    setCopyFeedback(null);
    setSelectedReservationId(reservationId);
    setIsReservationSheetOpen(false);
    window.requestAnimationFrame(() => setIsReservationSheetOpen(true));
  }, []);

  const closeReservationSheet = useCallback(() => {
    setIsReservationSheetOpen(false);
    if (reservationCloseTimeoutRef.current) {
      clearTimeout(reservationCloseTimeoutRef.current);
    }
    reservationCloseTimeoutRef.current = setTimeout(() => {
      setCopyFeedback(null);
      setSelectedReservationId(null);
      reservationCloseTimeoutRef.current = null;
    }, RESERVATION_SHEET_TRANSITION_MS);
  }, []);

  // iOS-style drag-to-dismiss on the grab handle / header of the reservation detail sheet.
  const reservationDrag = useSheetDragDismiss({
    shown: isReservationSheetOpen,
    onDismiss: closeReservationSheet,
  });

  // Auto-open the reservation sheet when arriving via deep-link from a task context.
  // Read the reservationId from the live URL (useSearchParams) rather than the server prop, for the
  // same stale-RSC-payload reason as selectedProperty above. The reservations list is fetched
  // independently of this param, so the cached list still holds the target.
  const deepLinkReservationId =
    searchParams.get("reservationId") ?? initialReservationId ?? null;
  // Guard set INSIDE the rAF callback (not before scheduling) so React StrictMode's mount→cleanup→
  // mount double-invoke can't cancel the only scheduled open: the first cleanup cancels its frame
  // without marking it done, and the second mount re-schedules. Deferring via rAF also keeps
  // setState out of the effect body (lint: react-hooks/set-state-in-effect).
  const autoOpenedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkReservationId) return;
    if (autoOpenedIdRef.current === deepLinkReservationId) return;
    if (!reservations.some((r) => r.id === deepLinkReservationId)) return;
    const raf = requestAnimationFrame(() => {
      autoOpenedIdRef.current = deepLinkReservationId;
      openReservationSheet(deepLinkReservationId);
    });
    return () => cancelAnimationFrame(raf);
  }, [deepLinkReservationId, reservations, openReservationSheet]);

  useEffect(() => {
    return () => {
      if (reservationCloseTimeoutRef.current) {
        clearTimeout(reservationCloseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (mode !== "overview") return;
    if (!isTodayInView) return;
    const container = scrollRef.current;
    if (!container) return;
    const scrollKey = `${selectedMonth}:${selectedProperty ?? ""}`;
    if (autoScrolledKeys.current.has(scrollKey)) return;
    // Position so yesterday (today-1) sits at the left edge and today is the next column;
    // the rest is reached by manual scroll. Defer with a double rAF so the scroll content has
    // its full width before we set scrollLeft (otherwise the first-open scroll clamps to 0).
    autoScrolledKeys.current.add(scrollKey);
    const target = Math.max(0, todayIndex - 1) * DAY_WIDTH;
    const apply = () => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollLeft = target;
      updateVisibleDateRangeLabel(el.scrollLeft, el.clientWidth);
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(apply));
    return () => cancelAnimationFrame(raf);
  }, [mode, isTodayInView, todayIndex, selectedMonth, selectedProperty, updateVisibleDateRangeLabel]);

  useEffect(() => {
    if (mode !== "overview") return;
    const container = scrollRef.current;
    if (!container) return;
    updateVisibleDateRangeLabel(container.scrollLeft, container.clientWidth);
  }, [mode, selectedMonth, selectedProperty, updateVisibleDateRangeLabel]);

  if (!selectedProperty) {
    return (
      <div className="relative space-y-4 pb-2">
        {/* Hero sits directly on the ivory canvas — no card chrome. The 3D building
            illustration edge-fades into the background for a seamless blend. */}
        <section className="relative min-h-[244px]">
          <div className="relative z-10 flex items-start justify-between gap-3 px-1 pt-2">
            <div className="ml-1 text-left">
              <p className="text-[15px] font-extrabold leading-none text-foreground">
                {tokyoNow}
              </p>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Tokyo
              </p>
            </div>
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <CalendarDays className="size-4.5" aria-hidden="true" />
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex justify-center">
            <div className="relative h-52 w-52">
              <Lottie
                animationData={buildingLottie}
                aria-hidden="true"
                autoplay
                className="relative z-10 h-full w-full [mask-image:radial-gradient(78%_78%_at_50%_42%,#000_56%,transparent_84%)] [-webkit-mask-image:radial-gradient(78%_78%_at_50%_42%,#000_56%,transparent_84%)]"
                loop
              />
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2.5">
          {propertyOptions.map((property) => {
            const meta = propertyMetaByName.get(property);
            const isHouse = meta?.kind === "house" || property.toLowerCase().includes("okubo");
            const Icon = isHouse ? Home : Building2;

            return (
              <Link
                className="group block"
                href={getPropertyCalendarHref(property)}
                key={property}
              >
                <Card className="relative overflow-hidden rounded-[22px] border border-border bg-surface p-3 text-center shadow-[0_16px_30px_-26px_rgba(34,40,60,0.4)] transition-transform duration-200 group-active:scale-[0.98]">
                  <div className="relative flex flex-col items-center">
                    <div className="relative flex size-14 items-center justify-center">
                      <div
                        className={`absolute inset-0 rounded-full ${isHouse ? "bg-[#4E63B3]/10" : "bg-primary/10"}`}
                        aria-hidden="true"
                      />
                      <div
                        className={`relative flex size-11 items-center justify-center rounded-2xl ring-1 shadow-[0_12px_24px_-18px_rgba(34,40,60,0.5)] ${
                          isHouse
                            ? "bg-[#4E63B3]/10 text-[#4E63B3] ring-[#4E63B3]/20"
                            : "bg-primary/10 text-primary ring-primary/15"
                        }`}
                      >
                        <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
                      </div>
                    </div>
                    <p className="mt-2 text-[13px] font-black text-foreground">
                      {propertyLabelMap[property] ?? property}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                      {isHouse ? copy.calendarBuildingHouseLabel : copy.calendarBuildingHotelLabel}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  const phoneLabel = selectedReservation?.phone?.trim() || null;
  const dialablePhone = toDialablePhone(phoneLabel);
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });

  return (
    <div className="relative space-y-4 pb-2">
      <div className="pointer-events-none absolute inset-x-2 -top-8 h-32 rounded-[28px] bg-[radial-gradient(60%_72%_at_50%_0%,rgba(255,255,255,0.98),transparent_72%)] opacity-85 blur-[2px]" />
      {roomSourceDebug ? (
        <Card className="rounded-xl border-dashed border-sky-300/70 bg-sky-50/70 p-3 text-xs text-sky-950 shadow-sm">
          <p className="font-semibold">Room source debug</p>
          <p className="mt-1">mode: {roomSourceDebug.mode}</p>
          <p>active rooms: {roomSourceDebug.activeRoomLabels.length}</p>
          {roomSourceDebug.fetchWindow ? (
            <p>
              fetch window: {roomSourceDebug.fetchWindow.from} -&gt; {roomSourceDebug.fetchWindow.to} (exclusive)
            </p>
          ) : null}
          {roomSourceDebug.reservationsQuery ? (
            <p>reservations query: {roomSourceDebug.reservationsQuery}</p>
          ) : null}
          <p className="break-words">
            labels: {roomSourceDebug.activeRoomLabels.length > 0 ? roomSourceDebug.activeRoomLabels.join(", ") : "-"}
          </p>
        </Card>
      ) : null}

      <Card className={`${GLASS_PANEL} p-2`}>
        <div className="grid grid-cols-3 gap-1">
          <button
            className={`h-9 rounded-xl text-xs font-bold transition-colors ${mode === "overview" ? "bg-white text-primary shadow-[0_10px_22px_-18px_rgba(31,58,95,0.35)] ring-1 ring-slate-200/70" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("overview")}
            type="button"
          >
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" />
              {copy.calendar}
            </span>
          </button>
          <button
            className={`h-9 rounded-xl text-xs font-bold transition-colors ${mode === "lists" ? "bg-white text-primary shadow-[0_10px_22px_-18px_rgba(31,58,95,0.35)] ring-1 ring-slate-200/70" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("lists")}
            type="button"
          >
            <span className="inline-flex items-center gap-1">
              <List className="size-3.5" />
              {copy.listView}
            </span>
          </button>
          <button
            className={`h-9 rounded-xl text-xs font-bold transition-colors ${mode === "map" ? "bg-white text-primary shadow-[0_10px_22px_-18px_rgba(31,58,95,0.35)] ring-1 ring-slate-200/70" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("map")}
            type="button"
          >
            <span className="inline-flex items-center gap-1">
              <MapIcon className="size-3.5" />
              {copy.mapTab}
            </span>
          </button>
        </div>
      </Card>

      {mode !== "map" ? (
        <Card className={`${GLASS_PANEL} p-3`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[0_12px_24px_-18px_rgba(34,40,60,0.5)] ring-1 ring-primary/15">
                {(propertyMetaByName.get(selectedProperty)?.kind === "house" || selectedProperty.toLowerCase().includes("okubo")) ? (
                  <Home className="size-5" aria-hidden="true" />
                ) : (
                  <Building2 className="size-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">
                  {propertyLabelMap[selectedProperty] ?? selectedProperty}
                </p>
                <p className="text-[11px] font-bold text-muted-foreground">
                  {copy.calendar}
                </p>
              </div>
            </div>
            <Link
              className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-[0_10px_22px_-18px_rgba(31,58,95,0.35)] transition-colors hover:text-slate-950"
              href={`/mobile/calendar?${buildingPickerHref.toString()}`}
            >
              {copy.calendarBuildingChange}
            </Link>
          </div>
        </Card>
      ) : null}

      {mode === "overview" ? (
        <Card className={`overflow-hidden ${GLASS_PANEL}`}>
          <div className="flex items-center justify-between border-b border-slate-200/70 bg-surface/70 px-3 py-2.5">
            <Link
              className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-muted-foreground shadow-[0_10px_22px_-18px_rgba(31,58,95,0.35)] transition-colors hover:text-foreground"
              href={`/mobile/calendar?${previousHref.toString()}`}
            >
              <ChevronLeft className="size-4.5" />
            </Link>
            <div className="text-center">
              <p className="text-sm font-black text-slate-800">{selectedMonthLabel}</p>
              <p className="mt-0.5 text-[10px] font-bold tracking-[-0.01em] text-slate-400">
                {visibleDateRangeLabel ?? fallbackVisibleDateRangeLabel}
              </p>
            </div>
            <Link
              className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-muted-foreground shadow-[0_10px_22px_-18px_rgba(31,58,95,0.35)] transition-colors hover:text-foreground"
              href={`/mobile/calendar?${nextHref.toString()}`}
            >
              <ChevronRight className="size-4.5" />
            </Link>
          </div>
          {isOutOfWindow ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-surface/40">
              <div className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm">
                <CalendarDays className="size-5" />
              </div>
              <p className="text-sm font-black">{copy.calendarOutOfWindowTitle}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground max-w-xs">{copy.calendarOutOfWindowBody}</p>
            </div>
          ) : (
            <>
            <div className="mb-3 flex items-center gap-4 rounded-2xl bg-slate-50 px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-bold text-slate-700">
                <span className="h-3 w-[18px] rounded bg-[linear-gradient(180deg,#ff718c_0%,#f05273_100%)]" aria-hidden="true" />
                Airbnb
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-bold text-slate-700">
                <span className="h-3 w-[18px] rounded bg-[linear-gradient(180deg,#5379b8_0%,#39588f_100%)]" aria-hidden="true" />
                Booking
              </span>
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-bold text-slate-700">
                <span className="h-3 w-[18px] rounded bg-[linear-gradient(180deg,#aeb9c8_0%,#8795a8_100%)]" aria-hidden="true" />
                {copy.legendDirect}
              </span>
            </div>
            <div
              className="min-h-0 overflow-auto overscroll-x-contain bg-surface"
              onScroll={handleGridScroll}
              // Stop touches here from bubbling to the shell's left-edge-back / pull-to-refresh
              // handlers — a horizontal scroll started near the left edge used to fire router.back().
              onTouchMove={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              ref={scrollRef}
              style={{
                height: CALENDAR_GRID_VIEWPORT_HEIGHT,
                maxHeight: CALENDAR_GRID_VIEWPORT_HEIGHT,
                minHeight: `${CALENDAR_GRID_MIN_HEIGHT_PX}px`,
              }}
            >
              {/* Single scroll pane -- room labels and grid rows share identical row heights */}
              <div
                className="relative w-max min-w-full"
                style={{ minWidth: `${ROOM_LABEL_WIDTH + dates.length * DAY_WIDTH}px` }}
              >
                <div
                  className="sticky left-0 top-0 z-40 h-0 overflow-visible"
                  style={{ width: `${ROOM_LABEL_WIDTH}px` }}
                >
                  <div
                    className="overflow-hidden border-r border-slate-200/55 bg-surface shadow-[5px_0_10px_-8px_rgba(15,23,42,0.10)]"
                    style={{
                      width: `${ROOM_LABEL_WIDTH + 2}px`,
                      marginLeft: "-1px",
                      transform: "translateZ(0)",
                    }}
                  >
                    <div className="h-11 shrink-0 border-b border-slate-200/55 bg-surface" />
                    {rooms.map((room, roomIndex) => {
                      const rowHeight =
                        roomBarLayouts.get(room)?.rowHeight ?? CALENDAR_SINGLE_ROW_HEIGHT;
                      return (
                        <div
                          className={cn(
                            "flex items-center justify-center border-b border-slate-200/45 text-[13.5px] font-black tabular-nums text-slate-800",
                            roomIndex % 2 === 1 && "bg-slate-900/[0.018]",
                          )}
                          key={room}
                          style={{ height: `${rowHeight}px` }}
                        >
                          {room}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ paddingLeft: `${ROOM_LABEL_WIDTH}px` }}>
                  <div
                    className="sticky top-0 z-20 flex h-11 bg-surface"
                    style={{ minWidth: `${dates.length * DAY_WIDTH}px` }}
                  >
                    {dates.map((date) => {
                      const isToday = date === today;
                      const dow = parseDate(date).getDay();
                      const isSat = dow === 6;
                      const isSun = dow === 0;
                      return (
                        <div
                          className={cn(
                            "relative flex shrink-0 flex-col items-center justify-center gap-0.5 border-r border-slate-200/60",
                            isToday ? "bg-amber-100/60" : isSat || isSun ? "bg-slate-50/70" : "",
                          )}
                          key={date}
                          style={{ width: `${DAY_WIDTH}px` }}
                        >
                          <span
                            className={cn(
                              "text-[10px] font-bold leading-none",
                              isToday
                                ? "text-amber-700"
                                : isSat
                                  ? "text-blue-600"
                                  : isSun
                                    ? "text-rose-600"
                                    : "text-slate-500",
                            )}
                          >
                            {weekdayFmt.format(parseDate(date))}
                          </span>
                          <span
                            className={cn(
                              "text-[15px] font-extrabold leading-none tabular-nums",
                              isToday ? "text-amber-700" : "text-slate-700",
                            )}
                          >
                            {date.slice(8, 10)}
                          </span>
                          {isToday ? (
                            <span className="absolute bottom-0 whitespace-nowrap rounded-full bg-amber-400 px-1.5 text-[8.5px] font-extrabold leading-[1.35] text-white">
                              {copy.today}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className="relative"
                    style={{
                      minWidth: `${dates.length * DAY_WIDTH}px`,
                      height: `${calendarBodyHeight}px`,
                    }}
                  >
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 flex">
                      {dates.map((date) => {
                        const isToday = date === today;
                        const dow = parseDate(date).getDay();
                        const isWeekend = dow === 0 || dow === 6;
                        return (
                          <div
                            className={cn(
                              "relative h-full shrink-0 border-r border-[color:var(--calendar-grid-line)]/60",
                              isToday ? "bg-amber-100/60" : isWeekend ? "bg-slate-50/50" : "",
                            )}
                            key={`grid-${date}`}
                            style={{ width: `${DAY_WIDTH}px` }}
                          >
                            {isToday ? (
                              <span
                                aria-hidden="true"
                                className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-amber-400/55"
                              />
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    {rooms.map((room, roomIndex) => {
                      const layout = roomBarLayouts.get(room);
                      const rowHeight = layout?.rowHeight ?? CALENDAR_SINGLE_ROW_HEIGHT;

                      return (
                        <div
                          className={cn(
                            "relative z-10 overflow-hidden border-b border-slate-200/45",
                            roomIndex % 2 === 1 && "bg-slate-900/[0.018]",
                          )}
                          key={room}
                          style={{ height: `${rowHeight}px` }}
                        >
                          {layout?.bars
                            .toSorted((a, b) => a.laneIndex - b.laneIndex)
                            .map((bar) => {
                              const isCompactBar = bar.widthPx < 58;
                              const label = reservationBarLabel(bar.item.guestName, bar.widthPx);
                              const isOther = normalizeSource(bar.item.source) === "other";
                              // A reservation that begins/ends outside the visible month gets a
                              // flat edge (and a "›" overflow hint) on the off-screen side.
                              const startsInView = bar.item.checkInDate >= rangeStart;
                              const endsInView = bar.item.checkOutDate < rangeEndExclusive;

                              return (
                                <button
                                  aria-label={`${bar.item.guestName}, ${bar.item.roomLabel}`}
                                  className={cn(
                                    "absolute z-20 flex items-center overflow-hidden border border-white/25 text-[12px] font-bold shadow-[0_4px_10px_-3px_rgba(15,23,42,0.3)] transition-transform hover:-translate-y-px active:scale-[0.98]",
                                    isOther ? "text-slate-800" : "text-white",
                                    isCompactBar ? "justify-center px-1 text-center" : "px-2 text-left",
                                    startsInView ? "rounded-l-[9px]" : "rounded-l-[3px]",
                                    endsInView ? "rounded-r-[9px]" : "rounded-r-[3px]",
                                    sourceClass(bar.item.source),
                                  )}
                                  key={bar.id}
                                  onClick={() => openReservationSheet(bar.id)}
                                  style={{
                                    left: `${bar.leftPx + 3}px`,
                                    width: `${Math.max(12, bar.widthPx - 6)}px`,
                                    top: `${CALENDAR_BAR_TOP + bar.laneIndex * CALENDAR_COMPACT_LANE_OFFSET}px`,
                                    height: `${CALENDAR_BAR_HEIGHT}px`,
                                  }}
                                  title={bar.item.guestName}
                                  type="button"
                                >
                                  {startsInView && bar.widthPx >= 30 ? (
                                    <span
                                      className={cn(
                                        "mr-1 size-1.5 shrink-0 rounded-full",
                                        isOther ? "bg-slate-600" : "bg-white/90",
                                      )}
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <span className="block min-w-0 truncate tracking-[-0.02em]">
                                    {label}
                                  </span>
                                  {!endsInView ? (
                                    <span
                                      className={cn(
                                        "ml-0.5 shrink-0 text-[13px] leading-none",
                                        isOther ? "text-slate-600" : "text-white/80",
                                      )}
                                      aria-hidden="true"
                                    >
                                      &rsaquo;
                                    </span>
                                  ) : null}
                                </button>
                              );
                            })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            </>
          )}
        </Card>
      ) : null}

      {mode === "lists" ? (
        isOutOfWindow ? (
          <Card className={`border-dashed border-border/70 p-8 text-center ${GLASS_PANEL}`}>
            <div className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm">
              <List className="size-5" />
            </div>
            <p className="text-sm font-black">{copy.calendarOutOfWindowTitle}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground max-w-xs">{copy.calendarOutOfWindowBody}</p>
          </Card>
        ) : (
          <div className="space-y-4">
            <button
              className="w-full text-left"
              onClick={() => {
                setIsEmptyRoomsModalOpen(true);
              }}
              type="button"
            >
              <Card
                className={
                  emptyToday.isProvisional
                    ? "rounded-2xl border-dashed border-amber-300/70 bg-amber-50/80 p-4 text-xs text-amber-900 shadow-[0_14px_28px_-24px_rgba(146,64,14,0.38)]"
                    : `${GLASS_CARD} p-4 text-xs`
                }
              >
                <p className="mb-2 text-[11px] font-bold text-muted-foreground">
                  {copy.listReferenceDate}: {formatDateLabel(listReferenceDate, locale)}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">{copy.emptyToday}</p>
                  <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 text-sky-700">
                    {emptyToday.count}
                  </Badge>
                </div>
                {emptyToday.isProvisional ? (
                  <p className="mt-1 text-[11px] leading-4 opacity-90">{copy.emptyAccuracyHint}</p>
                ) : null}
              </Card>
            </button>

            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="inline-flex size-7 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                  <PlaneLanding className="size-4" />
                </span>
                <p className="text-sm font-black text-slate-900">{copy.checkIns}</p>
                <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 text-sky-700">
                  {checkInsToday.length}
                </Badge>
              </div>
              {checkInsToday.length > 0 ? (
                checkInsToday.map((item) => (
                  <button
                    className="w-full text-left"
                    key={item.id}
                    onClick={() => openReservationSheet(item.id)}
                    type="button"
                  >
                    <Card className={`${GLASS_CARD} p-3.5 transition-transform active:scale-[0.99]`}>
                      <p className="truncate text-sm font-black text-slate-900">{item.guestName}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                        {propertyLabelMap[item.propertyName] ?? item.propertyName} - {item.roomLabel}
                      </p>
                    </Card>
                  </button>
                ))
              ) : (
                <Card className="rounded-2xl border-dashed border-slate-200 bg-surface/70 p-3 text-xs font-medium text-muted-foreground">
                  {copy.noFilterResults}
                </Card>
              )}
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="inline-flex size-7 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-200">
                  <PlaneTakeoff className="size-4" />
                </span>
                <p className="text-sm font-black text-slate-900">{copy.checkOuts}</p>
                <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 text-sky-700">
                  {checkOutsToday.length}
                </Badge>
              </div>
              {checkOutsToday.length > 0 ? (
                checkOutsToday.map((item) => (
                  <button
                    className="w-full text-left"
                    key={item.id}
                    onClick={() => openReservationSheet(item.id)}
                    type="button"
                  >
                    <Card className={`${GLASS_CARD} p-3.5 transition-transform active:scale-[0.99]`}>
                      <p className="truncate text-sm font-black text-slate-900">{item.guestName}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                        {propertyLabelMap[item.propertyName] ?? item.propertyName} - {item.roomLabel}
                      </p>
                    </Card>
                  </button>
                ))
              ) : (
                <Card className="rounded-2xl border-dashed border-slate-200 bg-surface/70 p-3 text-xs font-medium text-muted-foreground">
                  {copy.noFilterResults}
                </Card>
              )}
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <span className="inline-flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <BedDouble className="size-4" />
                </span>
                <p className="text-sm font-black text-slate-900">{copy.stayingToday}</p>
                <Badge className="rounded-full border border-sky-200 bg-sky-50 px-3 text-sky-700">
                  {stayingToday.length}
                </Badge>
              </div>
              {stayingToday.length > 0 ? (
                stayingToday.map((item) => (
                  <button
                    className="w-full text-left"
                    key={item.id}
                    onClick={() => openReservationSheet(item.id)}
                    type="button"
                  >
                    <Card className={`${GLASS_CARD} p-3.5 transition-transform active:scale-[0.99]`}>
                      <p className="truncate text-sm font-black text-slate-900">{item.guestName}</p>
                      <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                        {propertyLabelMap[item.propertyName] ?? item.propertyName} - {item.roomLabel}
                      </p>
                    </Card>
                  </button>
                ))
              ) : (
                <Card className="rounded-2xl border-dashed border-slate-200 bg-surface/70 p-3 text-xs font-medium text-muted-foreground">
                  {copy.noFilterResults}
                </Card>
              )}
            </section>
          </div>
        )
      ) : null}

      {mode === "map" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1 pb-0.5">
            <span className="inline-flex size-6 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <MapPin className="size-3.5" />
            </span>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
              {PROPERTY_MAP_META.length} buildings
            </p>
          </div>
          {PROPERTY_MAP_META.map((meta) => {
            const address = getPropertyAddress(meta, locale);
            const roomCount = meta.roomAccess?.length ?? 0;
            const sharedCount = meta.sharedAccess.length;
            const label = propertyLabelMap[meta.canonicalName] ?? meta.canonicalName;
            return (
              <Card
                key={meta.canonicalName}
                className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-surface shadow-[0_18px_34px_-28px_rgba(31,58,95,0.42)] transition-transform duration-200 active:scale-[0.99]"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white" aria-hidden="true" />
                <div className="flex items-center gap-3 p-4">
                  <div
                    className={`shrink-0 inline-flex size-11 items-center justify-center rounded-2xl shadow-[0_12px_24px_-18px_rgba(31,58,95,0.5)] ring-1 ${
                      meta.kind === "house"
                        ? "bg-[#4E63B3]/10 text-[#4E63B3] ring-[#4E63B3]/20"
                        : "bg-primary/10 text-primary ring-primary/15"
                    }`}
                  >
                    {meta.kind === "house" ? (
                      <Home className="size-5" />
                    ) : (
                      <Building2 className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">{label}</p>
                    <p
                      className={`mt-1 line-clamp-2 text-xs font-medium leading-5 ${
                        address ? "text-muted-foreground" : "italic text-muted-foreground/40"
                      }`}
                    >
                      {address ?? copy.mapAddressMissing}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <Badge className="rounded-full border border-slate-200 bg-white px-2.5 text-[10px] text-foreground/80 shadow-sm">
                        {copy.mapSharedAccessLabel} {sharedCount}
                      </Badge>
                      {roomCount > 0 ? (
                        <Badge className="rounded-full border border-slate-200 bg-white px-2.5 text-[10px] text-foreground/80 shadow-sm">
                          {copy.mapRoomAccessLabel} {roomCount}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <button
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-[0_10px_22px_-18px_rgba(31,58,95,0.35)] transition-colors hover:text-slate-950"
                    onClick={() => {
                      setMapCopyFeedback(null);
                      setSelectedMapProperty(meta);
                    }}
                    type="button"
                  >
                    <KeyRound className="size-3" />
                    {copy.mapOpenAccess}
                  </button>
                </div>
                <div className="relative border-t border-slate-200/70 bg-surface/65 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold text-muted-foreground">
                      {copy.mapAddressLabel}
                    </p>
                    <a
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary/80"
                      href={meta.googleMapsUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="size-3" />
                      {copy.mapOpenInMaps}
                    </a>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {typeof document !== "undefined" && selectedReservation
        ? createPortal(
        <div
          className={cn(
            "fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/45 transition-opacity duration-300 ease-out",
            isReservationSheetOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          style={reservationDrag.scrimStyle}
        >
          {/* Transparent click-to-close overlay — background color lives on the wrapper above. */}
          <button
            aria-label={copy.close}
            className="absolute inset-0"
            onClick={closeReservationSheet}
            type="button"
          />
          {/* Bottom sheet — slides up from the bottom edge. */}
          <div
            aria-label={selectedReservation.guestName}
            aria-modal="true"
            role="dialog"
            className="relative flex max-h-[88dvh] w-full max-w-[460px] flex-col rounded-t-[24px] bg-surface pb-[max(20px,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-16px_44px_-12px_rgba(16,28,27,0.3)] will-change-transform"
            data-sheet
            style={
              reservationDrag.dragging
                ? reservationDrag.sheetStyle
                : {
                    transform: isReservationSheetOpen ? "translateY(0)" : "translateY(110%)",
                    transition: "transform 420ms cubic-bezier(0.32,0.72,0,1)",
                  }
            }
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-1 h-1 w-[38px] shrink-0 rounded-full bg-slate-200"
              {...reservationDrag.handleProps}
            />
            <div
              className="shrink-0 border-b border-border/40 px-5 pb-4 pt-5"
              {...reservationDrag.handleProps}
            >
              <Badge>{statusLabels[selectedReservation.status] ?? selectedReservation.status}</Badge>
              <p className="mt-2 text-xl font-black">{selectedReservation.guestName}</p>
              <p className="text-xs text-muted-foreground">
                {copy.reservationId} #{selectedReservation.sourceReservationId}
              </p>
            </div>
            <div className="min-h-0 overflow-y-auto space-y-4 px-5 py-5 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Card className={`${GLASS_CARD} p-3`}>
                  <div className="mb-2 inline-flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Building2 className="size-4" />
                  </div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.propertyLabel}</p>
                  <p className="mt-0.5 text-base font-semibold">
                    {propertyLabelMap[selectedReservation.propertyName] ?? selectedReservation.propertyName}
                  </p>
                </Card>
                <Card className={`${GLASS_CARD} p-3`}>
                  <div className="mb-2 inline-flex size-8 items-center justify-center rounded-full bg-secondary/15 text-secondary-foreground">
                    <BedDouble className="size-4" />
                  </div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.roomLabel}</p>
                  <p className="mt-0.5 text-base font-semibold">{selectedReservation.roomLabel}</p>
                </Card>
                <Card className={`${GLASS_CARD} col-span-2 p-3`}>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.guestCountLabel}</p>
                  <p className="mt-0.5 text-base font-semibold">
                    {selectedReservation.guestCount
                      ? `${selectedReservation.guestCount}${copy.guestCountUnit}`
                      : copy.guestCountUnknown}
                  </p>
                </Card>
              </div>

              <Card className={`${GLASS_CARD} p-4`}>
                <div className="relative space-y-4">
                  <div className="absolute bottom-6 left-3 top-6 w-px bg-border/60" />
                  <div className="relative flex items-start gap-3">
                    <div className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm">
                      <PlaneLanding className="size-3.5" />
                    </div>
                    <div className="flex flex-1 items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {copy.checkInLabel}
                        </p>
                        <p className="text-base font-semibold">
                          {formatDateLabel(selectedReservation.checkInDate, locale)}
                        </p>
                      </div>
                      <p className="text-lg font-semibold">{DEFAULT_CHECK_IN_TIME}</p>
                    </div>
                  </div>
                  <div className="relative flex items-start gap-3">
                    <div className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground shadow-sm">
                      <PlaneTakeoff className="size-3.5" />
                    </div>
                    <div className="flex flex-1 items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {copy.checkOutLabel}
                        </p>
                        <p className="text-base font-semibold">
                          {formatDateLabel(selectedReservation.checkOutDate, locale)}
                        </p>
                      </div>
                      <p className="text-lg font-semibold">{DEFAULT_CHECK_OUT_TIME}</p>
                    </div>
                  </div>
                </div>
              </Card>

              <Card className={`${GLASS_CARD} p-4`}>
                <p className="text-xs text-muted-foreground">{copy.phone}</p>
                <p className="font-semibold">{phoneLabel ?? copy.phoneMissing}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    disabled={!phoneLabel}
                    onClick={async () => {
                      if (!phoneLabel) return;
                      await copyText(phoneLabel);
                      setCopyFeedback(copy.copied);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Copy className="size-4" />
                    {copy.copyNumber}
                  </Button>
                  <Button
                    disabled={!dialablePhone}
                    onClick={() => {
                      if (!dialablePhone) return;
                      window.location.href = `tel:${dialablePhone}`;
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Phone className="size-4" />
                    {copy.call}
                  </Button>
                </div>
                {copyFeedback ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{copyFeedback}</p>
                ) : null}
              </Card>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {isEmptyRoomsModalOpen && (
        <BottomSheet
          onClose={() => setIsEmptyRoomsModalOpen(false)}
          className="max-h-[82dvh] flex flex-col"
          header={
            <div className="px-1 pb-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {copy.listReferenceDate}: {formatDateLabel(listReferenceDate, locale)}
              </p>
              <p className="mt-1 text-lg font-black">{copy.emptyRoomsModalTitle}</p>
            </div>
          }
        >
          <div className="-mx-1 max-h-[60vh] space-y-1 overflow-y-auto px-1 pb-2 pt-1 text-sm">
            {emptyRoomLabels.length > 0 ? (
              emptyRoomLabels.map((roomLabel) => (
                <div className="rounded-xl bg-background px-3 py-3" key={roomLabel}>
                  <p className="font-semibold">{roomLabel}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground">
                {copy.noEmptyRooms}
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {selectedMapProperty && (
        <BottomSheet
          onClose={() => {
            setSelectedMapProperty(null);
            setMapCopyFeedback(null);
          }}
          className="max-h-[82dvh] flex flex-col"
          header={
            <div className="px-1 pb-3 pt-1">
              <p className="text-xs text-muted-foreground">{copy.mapAccessSheetTitle}</p>
              <p className="mt-1 text-lg font-black">
                {propertyLabelMap[selectedMapProperty.canonicalName] ?? selectedMapProperty.canonicalName}
              </p>
            </div>
          }
        >
          <div className="-mx-1 max-h-[65vh] space-y-3 overflow-y-auto px-1 pb-2 pt-1 text-sm">
              <Card className="rounded-2xl border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.mapAddressLabel}</p>
                <p className="mt-1.5 break-words text-sm font-semibold leading-6">
                  {getPropertyAddress(selectedMapProperty, locale) || copy.mapAddressMissing}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    onClick={async () => {
                      const address = getPropertyAddress(selectedMapProperty, locale);
                      if (!address) return;
                      await copyText(address);
                      setMapCopyFeedback(copy.mapCopiedAddress);
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <Copy className="size-4" />
                    {copy.mapAddressCopy}
                  </Button>
                  <Button
                    onClick={() => {
                      window.open(selectedMapProperty.googleMapsUrl, "_blank", "noopener,noreferrer");
                    }}
                    type="button"
                    variant="secondary"
                  >
                    <ExternalLink className="size-4" />
                    {copy.mapOpenInMaps}
                  </Button>
                </div>
              </Card>

              <Card className="rounded-2xl border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.mapSharedAccessLabel}</p>
                <div className="mt-2.5 space-y-2">
                  {selectedMapProperty.sharedAccess.map((item) => (
                    <div
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/55 bg-surface/65 px-3 py-2.5 shadow-sm"
                      key={`${item.prefixKey ?? "none"}-${item.labelKey}-${item.code}`}
                    >
                      <div>
                        <p className="text-xs text-muted-foreground/90">{sharedAccessLabel(item, copy)}</p>
                        <p className="mt-0.5 rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-sm font-semibold text-foreground">
                          {sharedAccessCodeLabel(item, copy)}
                        </p>
                      </div>
                      <Button
                        className="h-8 rounded-full px-3 text-xs"
                        onClick={async () => {
                          await copyText(item.code);
                          setMapCopyFeedback(copy.mapCopiedCode);
                        }}
                        type="button"
                        variant="secondary"
                      >
                        <Copy className="size-3.5" />
                        {copy.copyNumber}
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-2xl border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{copy.mapRoomAccessLabel}</p>
                <div className="mt-2.5 space-y-2">
                  {selectedMapProperty.roomAccess && selectedMapProperty.roomAccess.length > 0 ? (
                    selectedMapProperty.roomAccess.map((item) => (
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/55 bg-surface/65 px-3 py-2.5 shadow-sm" key={item.roomLabel}>
                        <div>
                          <p className="text-xs text-muted-foreground/90">{copy.roomLabel} {item.roomLabel}</p>
                          <p className="mt-0.5 rounded-md bg-black/[0.05] px-1.5 py-0.5 font-mono text-sm font-semibold text-foreground">
                            {item.code}
                          </p>
                        </div>
                        <Button
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={async () => {
                            await copyText(item.code);
                            setMapCopyFeedback(copy.mapCopiedCode);
                          }}
                          type="button"
                          variant="secondary"
                        >
                          <Copy className="size-3.5" />
                          {copy.copyNumber}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <Card className="rounded-xl border-dashed p-3 text-xs text-muted-foreground">
                      {copy.mapNoAccessData}
                    </Card>
                  )}
                </div>
              </Card>

              {mapCopyFeedback ? (
                <p className="text-[11px] text-muted-foreground">{mapCopyFeedback}</p>
              ) : null}
            </div>
        </BottomSheet>
      )}
    </div>
  );
}
