"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import {
  BedDouble,
  BellRing,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clipboard,
  DoorClosed,
  House,
  Info,
  LoaderCircle,
  Lock,
  MapPinned,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  savePropertyOperationInfoAction,
  saveReservationInternalNoteAction,
} from "@/app/admin/calendar/actions";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import {
  getPropertyAddress,
  type PropertyAccessInfo,
  type PropertyMapMeta,
} from "@/lib/property-map-links";
import { getDictionary, type Locale } from "@/lib/i18n";
import { localizePropertyName } from "@/lib/room-label-normalization";
import type { Database } from "@/types/database";
import "./admin-reservation-console.css";

type ReservationStatus = Database["public"]["Enums"]["reservation_status"];

type ReservationChannel = "airbnb" | "booking" | "manual";
type ViewMode = "month" | "today" | "rooms" | "info";

type CalendarSelection =
  | { type: "reservation"; reservationId: string }
  | { type: "room"; roomKey: string }
  | null;

type AccessDraft = PropertyAccessInfo & { id: string };
type RoomCodeDraft = { roomLabel: string; code: string };

export type AdminReservationConsoleProps = {
  beds24SyncPaused: boolean;
  blockedProperties: Array<{
    propertyName: string;
    roomCount: number;
  }>;
  buildingInfos: PropertyMapMeta[];
  currentMonth: string;
  dates: string[];
  initialLocale: Locale;
  isOutOfWindow: boolean;
  nextMonth: string;
  prevMonth: string;
  propertyOptions: string[];
  reservationNotes: Record<string, string>;
  reservations: Array<{
    beds24Id: string;
    channel: ReservationChannel;
    checkInDate: string;
    checkOutDate: string;
    guestCount: number | null;
    guestName: string;
    id: string;
    phone: string | null;
    propertyName: string;
    roomKey: string;
    roomLabel: string;
    status: ReservationStatus;
  }>;
  roomRows: Array<{
    displayRoomLabel: string;
    key: string;
    propertyName: string;
  }>;
  selectedMonth: string;
  selectedProperty: string | null;
  today: string;
};

const DAY_WIDTH_MIN = 34;
const LABEL_WIDTH_BASE = 176;
const PANEL_TRANSITION_MS = 220;

const CHANNEL_STYLE: Record<
  ReservationChannel,
  { accent: string; background: string; badge: string }
> = {
  airbnb: {
    accent: "hsl(352 71% 60%)",
    background: "hsl(353 88% 96.1%)",
    badge: "linear-gradient(180deg, #ff9fad 0%, #f16f82 100%)",
  },
  booking: {
    accent: "hsl(214 57% 46%)",
    background: "hsl(212 70% 95.9%)",
    badge: "linear-gradient(180deg, #7ca3e5 0%, #4b72bf 100%)",
  },
  manual: {
    accent: "hsl(221 11% 42%)",
    background: "hsl(218 17% 95.7%)",
    badge: "linear-gradient(180deg, #bdc6d2 0%, #909daf 100%)",
  },
};

const STATUS_STYLE: Record<
  ReservationStatus,
  { badge: string; dot: string; dimmed?: boolean }
> = {
  cancelled: { badge: "pill pill--danger", dot: "var(--danger)" },
  checked_in: { badge: "pill pill--done", dot: "var(--done)" },
  checked_out: { badge: "pill pill--muted", dot: "var(--muted)", dimmed: true },
  confirmed: { badge: "pill pill--info", dot: "var(--info)" },
  no_show: { badge: "pill pill--danger", dot: "var(--danger)" },
};

function buildMonthLabel(month: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function formatShortDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatDateRangeShort(checkInDate: string, checkOutDate: string, locale: Locale) {
  return `${formatShortDate(checkInDate, locale)} ~ ${formatShortDate(checkOutDate, locale)}`;
}

function formatFullDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T00:00:00Z`));
}

function weekdayLabel(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T00:00:00Z`));
}

function dayOfWeek(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function nightsBetween(checkInDate: string, checkOutDate: string) {
  const start = Date.parse(`${checkInDate}T00:00:00Z`);
  const end = Date.parse(`${checkOutDate}T00:00:00Z`);
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function buildCalendarHref(month: string, property: string | null) {
  const params = new URLSearchParams({ month });
  if (property) params.set("property", property);
  return `/admin/calendar?${params.toString()}`;
}

function buildCalendarPrintHref(month: string, property: string | null) {
  const params = new URLSearchParams({ month });
  if (property) params.set("property", property);
  return `/admin/calendar/print?${params.toString()}`;
}

function buildLinkedActionHref(
  kind: "maintenance" | "complaint" | "lost",
  reservationId: string,
) {
  const path =
    kind === "maintenance"
      ? "/mobile/maintenance/new"
      : kind === "complaint"
        ? "/mobile/complaints/new"
        : "/mobile/lost-found/new";

  return `${path}?reservationId=${encodeURIComponent(reservationId)}`;
}

function buildChannelLabel(
  channel: ReservationChannel,
  dictionary: ReturnType<typeof getDictionary>,
) {
  const copy = dictionary.admin.calendar;
  if (channel === "airbnb") return copy.channelAirbnb;
  if (channel === "booking") return copy.channelBooking;
  return copy.channelManual;
}

function buildChannelShort(channel: ReservationChannel) {
  if (channel === "airbnb") return "ABB";
  if (channel === "booking") return "BDC";
  return "MAN";
}

function buildAccessLabel(
  access: PropertyAccessInfo,
  dictionary: ReturnType<typeof getDictionary>,
) {
  const t = dictionary.mobile;
  const labelMap: Record<PropertyAccessInfo["labelKey"], string> = {
    doorPassword: t.calendarMapAccessKindDoorPassword,
    keyBox: t.calendarMapAccessKindKeyBox,
    keyBoxPassword: t.calendarMapAccessKindKeyBoxPassword,
    linenStorageEntrancePassword: t.calendarMapAccessKindLinenStorageEntrancePassword,
    roomPassword: t.calendarMapAccessKindRoomPassword,
    storage: t.calendarMapAccessKindStorage,
    storagePassword: t.calendarMapAccessKindStoragePassword,
  };

  const prefixMap: Record<NonNullable<PropertyAccessInfo["prefixKey"]>, string> = {
    floor1: t.calendarMapAccessFloor1,
  };

  const noteMap: Record<NonNullable<PropertyAccessInfo["noteKey"]>, string> = {
    allRoomsSame: t.calendarMapAccessNoteAllRoomsSame,
  };

  const label = labelMap[access.labelKey];
  const prefix = access.prefixKey ? prefixMap[access.prefixKey] : null;
  const note = access.noteKey ? noteMap[access.noteKey] : null;
  return {
    label: prefix ? `${prefix} · ${label}` : label,
    note,
  };
}

function cloneBuildingInfos(buildingInfos: PropertyMapMeta[]) {
  return Object.fromEntries(
    buildingInfos.map((item) => [
      item.canonicalName,
      {
        address: { ...item.address },
        googleMapsUrl: item.googleMapsUrl,
        kind: item.kind,
        note: item.note ?? "",
        roomAccess: (item.roomAccess ?? []).map((room) => ({ ...room })),
        sharedAccess: item.sharedAccess.map((access, index) => ({
          ...access,
          id: `${item.canonicalName}-${index}`,
        })),
      },
    ]),
  ) as Record<
    string,
    {
      address: PropertyMapMeta["address"];
      googleMapsUrl: string;
      kind: PropertyMapMeta["kind"];
      note: string;
      roomAccess: RoomCodeDraft[];
      sharedAccess: AccessDraft[];
    }
  >;
}

function copyText(value: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return Promise.reject(new Error("clipboard_unavailable"));
  }
  return navigator.clipboard.writeText(value);
}

export function AdminReservationConsole({
  beds24SyncPaused,
  blockedProperties,
  buildingInfos,
  currentMonth,
  dates,
  initialLocale,
  isOutOfWindow,
  nextMonth,
  prevMonth,
  propertyOptions,
  reservationNotes: initialReservationNotes,
  reservations,
  roomRows,
  selectedMonth,
  selectedProperty,
  today,
}: AdminReservationConsoleProps) {
  const router = useRouter();
  const { dismiss, showToast, toast } = useAdminToast();

  const [activeView, setActiveView] = useState<ViewMode>("month");
  const [channelFilter, setChannelFilter] = useState<ReservationChannel | "all">("all");
  const [isChannelMenuOpen, setIsChannelMenuOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<string | null>(null);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [savingBuilding, setSavingBuilding] = useState<string | null>(null);
  const [panelSelection, setPanelSelection] = useState<CalendarSelection>(null);
  const [propertyDrafts, setPropertyDrafts] = useState(() => cloneBuildingInfos(buildingInfos));
  const [reservationNotes, setReservationNotes] = useState<Record<string, string>>(
    initialReservationNotes,
  );
  const [gridSizes, setGridSizes] = useState({
    dayWidth: DAY_WIDTH_MIN,
    labelWidth: LABEL_WIDTH_BASE,
  });

  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const channelMenuRef = useRef<HTMLDivElement | null>(null);

  const uiLocale = initialLocale;
  const dictionary = getDictionary(uiLocale);
  const copy = dictionary.admin.calendar;
  const statusLabels = dictionary.admin.reservationStatusLabels;
  const buildingLabels = dictionary.cleaning.buildingLabels;

  const localizedPropertyName = (propertyName: string) =>
    localizePropertyName(propertyName, buildingLabels);

  const groupedRows = propertyOptions
    .filter((propertyName) => (selectedProperty ? propertyName === selectedProperty : true))
    .map((propertyName) => {
      const rows = roomRows.filter((row) => row.propertyName === propertyName);
      const blocked = blockedProperties.find((item) => item.propertyName === propertyName) ?? null;
      return {
        blocked,
        propertyName,
        rows,
      };
    });

  const visibleReservations = reservations.filter((reservation) => {
    if (selectedProperty && reservation.propertyName !== selectedProperty) return false;
    if (channelFilter !== "all" && reservation.channel !== channelFilter) return false;
    return true;
  });

  const reservationsByRoom = new Map<string, typeof visibleReservations>();
  for (const reservation of visibleReservations) {
    const bucket = reservationsByRoom.get(reservation.roomKey);
    if (bucket) bucket.push(reservation);
    else reservationsByRoom.set(reservation.roomKey, [reservation]);
  }

  const activeReservations = reservations.filter((reservation) => {
    if (selectedProperty && reservation.propertyName !== selectedProperty) return false;
    return reservation.status !== "cancelled" && reservation.status !== "no_show";
  });
  const hasReservationNote = (reservationId: string) =>
    Boolean(reservationNotes[reservationId]?.trim());

  const arrivalsToday = activeReservations.filter((reservation) => reservation.checkInDate === today);
  const departuresToday = activeReservations.filter((reservation) => reservation.checkOutDate === today);
  const inHouseToday = activeReservations.filter(
    (reservation) => reservation.checkInDate <= today && reservation.checkOutDate > today,
  );
  const departureRoomKeysToday = new Set(departuresToday.map((reservation) => reservation.roomKey));
  const settingTargetsToday = activeReservations.filter((reservation, index, collection) => {
    if (reservation.checkInDate !== today) return false;
    if (departureRoomKeysToday.has(reservation.roomKey)) return false;
    return collection.findIndex((item) => item.roomKey === reservation.roomKey) === index;
  });
  const occupiedKeysToday = new Set(inHouseToday.map((reservation) => reservation.roomKey));
  const activeRoomCount = roomRows.filter(
    (room) => !selectedProperty || room.propertyName === selectedProperty,
  ).length;
  const occupancyPercent =
    activeRoomCount > 0 ? Math.round((occupiedKeysToday.size / activeRoomCount) * 100) : 0;

  const groupOccupancy = Object.fromEntries(
    groupedRows.map((group) => {
      const roomCount = group.rows.length || group.blocked?.roomCount || 0;
      const occupied = group.rows.filter((row) => occupiedKeysToday.has(row.key)).length;
      return [
        group.propertyName,
        {
          occupied,
          percent: roomCount > 0 ? Math.round((occupied / roomCount) * 100) : 0,
          roomCount,
        },
      ];
    }),
  ) as Record<string, { occupied: number; percent: number; roomCount: number }>;

  const reservationLookup = Object.fromEntries(
    activeReservations.map((reservation) => [reservation.id, reservation]),
  ) as Record<string, (typeof activeReservations)[number] | undefined>;
  const roomLookup = Object.fromEntries(roomRows.map((row) => [row.key, row])) as Record<
    string,
    (typeof roomRows)[number] | undefined
  >;

  const panelReservation =
    panelSelection?.type === "reservation"
      ? reservationLookup[panelSelection.reservationId] ?? null
      : null;
  const panelRoom =
    panelSelection?.type === "room" ? roomLookup[panelSelection.roomKey] ?? null : null;

  useEffect(() => {
    if (!gridWrapRef.current || activeView !== "month" || isOutOfWindow) return;

    const element = gridWrapRef.current;
    const days = dates.length;
    const update = () => {
      const available = element.clientWidth - LABEL_WIDTH_BASE;
      const dayWidth = Math.max(DAY_WIDTH_MIN, Math.floor(available / Math.max(1, days)));
      const extra = Math.max(0, available - dayWidth * days);
      setGridSizes({
        dayWidth,
        labelWidth: LABEL_WIDTH_BASE + extra,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [activeView, dates.length, isOutOfWindow]);

  useEffect(() => {
    if (!panelSelection) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePanel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelSelection]);

  useEffect(() => {
    if (!isChannelMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (channelMenuRef.current?.contains(target)) return;
      setIsChannelMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsChannelMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isChannelMenuOpen]);

  function closePanel() {
    setIsPanelVisible(false);
    window.setTimeout(() => {
      setPanelSelection((current) => (current ? null : current));
    }, PANEL_TRANSITION_MS);
  }

  const handleSyncRefresh = () => {
    if (beds24SyncPaused) return;
    if (isRefreshing) return;
    setIsRefreshing(true);
    showToast(copy.syncRefreshStarted);
    startTransition(() => {
      router.refresh();
      window.setTimeout(() => {
        setIsRefreshing(false);
        showToast(copy.syncRefreshFinished);
      }, 500);
    });
  };

  const openReservationPanel = (reservationId: string) => {
    setIsPanelVisible(true);
    setPanelSelection({ type: "reservation", reservationId });
  };

  const openRoomPanel = (roomKey: string) => {
    setIsPanelVisible(true);
    setPanelSelection({ type: "room", roomKey });
  };

  const clearMonthFilters = () => {
    setChannelFilter("all");
  };

  const handleSaveBuildingInfo = async (propertyName: string) => {
    const draft = propertyDrafts[propertyName];
    if (!draft || savingBuilding) return;

    setSavingBuilding(propertyName);
    const result = await savePropertyOperationInfoAction({
      canonicalName: propertyName,
      data: {
        address: draft.address,
        note: draft.note,
        roomAccess: draft.roomAccess,
        sharedAccess: draft.sharedAccess.map((entry) => {
          const { id, ...access } = entry;
          void id;
          return access;
        }),
      },
    });
    setSavingBuilding(null);

    if (!result.ok) {
      showToast(copy.buildingInfoSaveFailedToast, true);
      return;
    }

    setEditingBuilding(null);
    showToast(copy.sessionSavedToast);
    router.refresh();
  };

  const viewTabs: Array<{ key: ViewMode; label: string; icon: ComponentType<{ className?: string }> }> = [
    { key: "month", label: copy.monthView, icon: CalendarDays },
    { key: "today", label: copy.todayOpsView, icon: Sparkles },
    { key: "rooms", label: copy.roomStatusView, icon: BedDouble },
    { key: "info", label: copy.buildingInfoView, icon: Building2 },
  ];

  const channelOptions: Array<{ value: ReservationChannel | "all"; label: string }> = [
    { value: "all", label: copy.channelAll },
    { value: "airbnb", label: copy.channelAirbnb },
    { value: "booking", label: copy.channelBooking },
    { value: "manual", label: copy.channelManual },
  ];

  const renderPropertyChips = () => (
    <div className="admcal__chips">
      <Link
        className={`admcal__chip${selectedProperty ? "" : " is-active"}`}
        href={buildCalendarHref(selectedMonth, null)}
      >
        <span>{copy.allProperties}</span>
      </Link>
      {propertyOptions.map((propertyName) => {
        return (
          <Link
            className={`admcal__chip${selectedProperty === propertyName ? " is-active" : ""}`}
            href={buildCalendarHref(selectedMonth, propertyName)}
            key={propertyName}
          >
            <span>{localizedPropertyName(propertyName)}</span>
          </Link>
        );
      })}
    </div>
  );

  const renderMonthView = () => {
    const hasMatchingReservations = visibleReservations.length > 0;
    const visibleGroups = groupedRows
      .map((group) => {
        const rows = group.rows;
        if (group.blocked && rows.length === 0) {
          return { ...group, rows: [] };
        }
        return { ...group, rows };
      })
      .filter((group) => group.rows.length > 0 || group.blocked);

    return (
      <>
        <div className="admcal__toolbar">
          <div className="admcal__month-nav">
            <Link aria-label={copy.prevMonth} className="admcal__icon-btn" href={buildCalendarHref(prevMonth, selectedProperty)}>
              <ChevronLeft className="size-4" />
            </Link>
            <div className="admcal__month-label">{buildMonthLabel(selectedMonth, uiLocale)}</div>
            <Link aria-label={copy.nextMonth} className="admcal__icon-btn" href={buildCalendarHref(nextMonth, selectedProperty)}>
              <ChevronRight className="size-4" />
            </Link>
            {selectedMonth !== currentMonth ? (
              <Link className="admcal__subtle-btn" href={buildCalendarHref(currentMonth, selectedProperty)}>
                {copy.thisMonth}
              </Link>
            ) : null}
          </div>

          <div className="admcal__toolbar-actions">
            <div className="admcal__menu" ref={channelMenuRef}>
              <button
                aria-expanded={isChannelMenuOpen}
                aria-haspopup="menu"
                className={`admcal__menu-trigger${isChannelMenuOpen ? " is-open" : ""}`}
                onClick={() => setIsChannelMenuOpen((current) => !current)}
                type="button"
              >
                <span className="admcal__menu-kicker">{copy.channelFilter}</span>
                <span className="admcal__menu-value">
                  {channelOptions.find((option) => option.value === channelFilter)?.label}
                </span>
                {isChannelMenuOpen ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </button>

              {isChannelMenuOpen ? (
                <div className="admcal__menu-popover" role="menu">
                  {channelOptions.map((option) => {
                    const isActive = channelFilter === option.value;
                    return (
                      <button
                        aria-checked={isActive}
                        className={`admcal__menu-item${isActive ? " is-active" : ""}`}
                        key={option.value}
                        onClick={() => {
                          setChannelFilter(option.value);
                          setIsChannelMenuOpen(false);
                        }}
                        role="menuitemradio"
                        type="button"
                      >
                        <span>{option.label}</span>
                        {isActive ? <Check className="size-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <Link
              className="admcal__subtle-btn"
              href={buildCalendarPrintHref(selectedMonth, selectedProperty)}
              target="_blank"
            >
              {copy.exportA4}
            </Link>
          </div>
        </div>

        {renderPropertyChips()}

        {isOutOfWindow ? (
          <div className="admcal__state-card">
            <TriangleAlert className="size-5" />
            <div>
              <div className="admcal__state-title">{copy.outOfWindowTitle}</div>
              <div className="admcal__state-body">{copy.outOfWindowBody}</div>
            </div>
          </div>
        ) : visibleGroups.length === 0 ? (
          <div className="admcal__state-card">
            <Search className="size-5" />
            <div>
              <div className="admcal__state-title">{copy.emptyTitle}</div>
              <div className="admcal__state-body">
                {hasMatchingReservations ? copy.emptyBody : copy.emptyBodyNoReservations}
              </div>
            </div>
            <button className="admcal__subtle-btn" onClick={clearMonthFilters} type="button">
              {copy.clearFilters}
            </button>
          </div>
        ) : (
          <>
            <div className="admcal__grid-card">
              <div className="admcal__grid-wrap" ref={gridWrapRef}>
                <div
                  className="admcal__grid"
                  style={
                    {
                      "--admcal-day-count": dates.length,
                      "--admcal-day-width": `${gridSizes.dayWidth}px`,
                      "--admcal-label-width": `${gridSizes.labelWidth}px`,
                    } as CSSProperties
                  }
                >
                  <div className="admcal__grid-head">
                    <div className="admcal__grid-corner">
                      <BedDouble className="size-4" />
                      <span>{copy.room}</span>
                    </div>
                    <div className="admcal__grid-days">
                      {dates.map((date) => {
                        const dow = dayOfWeek(date);
                        const isToday = date === today;
                        return (
                          <div
                            className={[
                              "admcal__day-head",
                              dow === 0 ? "is-sun" : "",
                              dow === 6 ? "is-sat" : "",
                              isToday ? "is-today" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={date}
                          >
                            <span className="admcal__day-week">{weekdayLabel(date, uiLocale)}</span>
                            <span className="admcal__day-number">{date.slice(8)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {visibleGroups.map((group) => {
                    const occupancy = groupOccupancy[group.propertyName] ?? {
                      occupied: 0,
                      percent: 0,
                      roomCount: 0,
                    };
                    return (
                      <div className="admcal__group" key={group.propertyName}>
                        <div className="admcal__group-head">
                          <div className="admcal__group-label">
                            <span className="admcal__group-icon">
                              {group.blocked ? <Lock className="size-4" /> : <Building2 className="size-4" />}
                            </span>
                            <span className="admcal__group-name">
                              {localizedPropertyName(group.propertyName)}
                            </span>
                            <span className="admcal__group-count">
                              {copy.roomCount(occupancy.roomCount || group.blocked?.roomCount || 0)}
                            </span>
                          </div>

                          <div className="admcal__group-meta">
                            {group.blocked ? (
                              <span className="admcal__group-blocked">
                                <Lock className="size-3.5" />
                                {copy.blockedProperty}
                              </span>
                            ) : (
                              <>
                                <span>{copy.groupOccupancy(occupancy.occupied, occupancy.roomCount)}</span>
                                <span className="admcal__group-bar">
                                  <span style={{ width: `${occupancy.percent}%` }} />
                                </span>
                                <span>{copy.groupPercent(occupancy.percent)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {group.blocked ? (
                          <div className="admcal__blocked-row">
                            <div className="admcal__room-label admcal__room-label--blocked">
                              {copy.blockedProperty}
                            </div>
                            <div className="admcal__blocked-track">
                              <span className="admcal__blocked-chip">
                                <Lock className="size-3.5" />
                                {copy.blockedProperty}
                              </span>
                            </div>
                          </div>
                        ) : (
                          group.rows.map((room) => {
                            const roomReservations = (reservationsByRoom.get(room.key) ?? []).filter(
                              (reservation) =>
                                reservation.checkInDate < `${nextMonth}-01` &&
                                reservation.checkOutDate > `${selectedMonth}-01`,
                            );
                            return (
                              <div className="admcal__room-row" key={room.key}>
                                <div className="admcal__room-label">{room.displayRoomLabel}</div>
                                <div className="admcal__room-track">
                                  {dates.map((date) => {
                                    const dow = dayOfWeek(date);
                                    return (
                                      <div
                                        className={[
                                          "admcal__cell",
                                          dow === 0 ? "is-sun" : "",
                                          dow === 6 ? "is-sat" : "",
                                          date === today ? "is-today" : "",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                        key={date}
                                      />
                                    );
                                  })}

                                  {roomReservations.map((reservation) => {
                                    const checkInDay = Number(reservation.checkInDate.slice(8));
                                    const checkOutDay = Number(reservation.checkOutDate.slice(8));
                                    const hasInternalNote = hasReservationNote(reservation.id);
                                    const startsBeforeMonth = reservation.checkInDate < `${selectedMonth}-01`;
                                    // Checkout ON the 1st of next month still occupies the whole last day of
                                    // THIS month, so it must clamp to the month-end edge. Using `>` here left
                                    // checkout==nextMonth-01 to fall through to `checkOutDay(=1) - 1 + 0.5`,
                                    // collapsing multi-night stays that end on the 1st into a 0.75 dot.
                                    const endsAfterMonth = reservation.checkOutDate >= `${nextMonth}-01`;
                                    const startUnit = startsBeforeMonth ? 0 : checkInDay - 1 + 0.5;
                                    const endUnit = endsAfterMonth ? dates.length : checkOutDay - 1 + 0.5;
                                    const span = Math.max(0.75, endUnit - startUnit);
                                    const statusStyle = STATUS_STYLE[reservation.status];
                                    const channelStyle = CHANNEL_STYLE[reservation.channel];
                                    return (
                                      <button
                                        className={[
                                          "admcal__bar",
                                          startsBeforeMonth ? "is-clamped-left" : "",
                                          endsAfterMonth ? "is-clamped-right" : "",
                                          statusStyle.dimmed ? "is-dimmed" : "",
                                          panelSelection?.type === "reservation" &&
                                          panelSelection.reservationId === reservation.id
                                            ? "is-selected"
                                            : "",
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                        key={reservation.id}
                                        onClick={() => openReservationPanel(reservation.id)}
                                        style={
                                          {
                                            "--admcal-bar-accent": channelStyle.accent,
                                            "--admcal-bar-background": channelStyle.background,
                                            "--admcal-status-dot": statusStyle.dot,
                                            left: `calc(${startUnit} * var(--admcal-day-width) + 3px)`,
                                            width: `calc(${span} * var(--admcal-day-width) - 6px)`,
                                          } as CSSProperties
                                        }
                                        title={`${reservation.guestName} · ${buildChannelLabel(
                                          reservation.channel,
                                          dictionary,
                                        )} · ${statusLabels[reservation.status]}`}
                                        type="button"
                                      >
                                        <span className="admcal__bar-dot" />
                                        {span >= 1.4 ? (
                                          <span className="admcal__bar-text">{reservation.guestName}</span>
                                        ) : null}
                                        {hasInternalNote ? (
                                          <span className="admcal__bar-note-indicator" aria-hidden="true" />
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="admcal__legend">
              <div className="admcal__legend-group">
                <span className="admcal__legend-label">{copy.legendChannels}</span>
                {(["airbnb", "booking", "manual"] as ReservationChannel[]).map((channel) => (
                  <span className="admcal__legend-item" key={channel}>
                    <span
                      className="admcal__legend-swatch"
                      style={
                        {
                          "--admcal-bar-accent": CHANNEL_STYLE[channel].accent,
                          "--admcal-bar-background": CHANNEL_STYLE[channel].background,
                        } as CSSProperties
                      }
                    />
                    {buildChannelLabel(channel, dictionary)}
                  </span>
                ))}
              </div>

              <div className="admcal__legend-group">
                <span className="admcal__legend-label">{copy.legendStatuses}</span>
                {(["checked_in", "confirmed", "checked_out"] as ReservationStatus[]).map((status) => (
                  <span className="admcal__legend-item" key={status}>
                    <span
                      className="admcal__legend-dot"
                      style={{ background: STATUS_STYLE[status].dot }}
                    />
                    {statusLabels[status]}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </>
    );
  };

  const renderTodayBoard = () => {
    const cards = [
      {
        count: arrivalsToday.length,
        empty: copy.todayNone,
        icon: CalendarDays,
        items: arrivalsToday,
        title: copy.todayArrivalsTitle,
      },
      {
        count: departuresToday.length,
        empty: copy.todayNone,
        icon: ChevronRight,
        items: departuresToday,
        title: copy.todayDeparturesTitle,
      },
      {
        count: settingTargetsToday.length,
        empty: copy.todaySettingEmpty,
        icon: House,
        items: settingTargetsToday,
        title: copy.todaySettingTitle,
      },
      {
        count: inHouseToday.length,
        empty: copy.todayNone,
        icon: BedDouble,
        items: inHouseToday,
        title: copy.todayInHouseTitle,
      },
    ] as const;

    return (
      <>
        {renderPropertyChips()}
        <div className="admcal__board-grid">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <section className="admcal__board-card" key={card.title}>
                <div className="admcal__board-head">
                  <div className="admcal__board-title">
                    <span className="admcal__board-icon">
                      <Icon className="size-4" />
                    </span>
                    <span>{card.title}</span>
                  </div>
                  <span className="admcal__board-count">{card.count}</span>
                </div>

                {card.items.length === 0 ? (
                  <div className="admcal__board-empty">{card.empty}</div>
                ) : (
                  <div className="admcal__board-list">
                    {card.items.map((reservation) => {
                      const room = roomLookup[reservation.roomKey];
                      return (
                        <button
                          className="admcal__board-row"
                          key={reservation.id}
                          onClick={() => openReservationPanel(reservation.id)}
                          type="button"
                        >
                          <span
                            className="admcal__board-row-badge"
                            style={{ background: CHANNEL_STYLE[reservation.channel].badge }}
                          >
                            {room?.displayRoomLabel ?? reservation.roomLabel}
                          </span>
                          <span className="admcal__board-row-main">
                            <span className="admcal__board-row-title">{reservation.guestName}</span>
                            <span className="admcal__board-row-meta">
                              {localizedPropertyName(reservation.propertyName)} · {reservation.roomLabel}
                            </span>
                          </span>
                          <span className="admcal__board-row-tail">
                            {reservation.checkInDate === today
                              ? formatShortDate(reservation.checkOutDate, uiLocale)
                              : formatShortDate(reservation.checkInDate, uiLocale)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </>
    );
  };

  const renderRoomStatusBoard = () => {
    return (
      <>
        {renderPropertyChips()}
        <div className="admcal__table-card">
          <table className="admcal__table">
            <thead>
              <tr>
                <th>{copy.room}</th>
                <th>{copy.roomStatus}</th>
                <th>{copy.currentGuest}</th>
                <th>{copy.nextReservation}</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group) => {
                if (selectedProperty && group.propertyName !== selectedProperty) return null;
                if (!group.blocked && group.rows.length === 0) return null;
                const groupRows = group.rows;
                return (
                  <FragmentRows
                    group={group}
                    groupRows={groupRows}
                    inHouseToday={inHouseToday}
                    localizedPropertyName={localizedPropertyName}
                    onRoomClick={openRoomPanel}
                    reservations={activeReservations}
                    today={today}
                    copy={copy}
                    uiLocale={uiLocale}
                    key={group.propertyName}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    );
  };

  const renderBuildingInfoBoard = () => {
    const cards = propertyOptions
      .filter((propertyName) => (selectedProperty ? propertyName === selectedProperty : true))
      .map((propertyName) => {
        const info = propertyDrafts[propertyName];
        const meta = buildingInfos.find((item) => item.canonicalName === propertyName) ?? null;
        const blocked = blockedProperties.find((item) => item.propertyName === propertyName) ?? null;
        return {
          blocked,
          info,
          meta,
          propertyName,
        };
      });

    return (
      <>
        {renderPropertyChips()}
        <div className="admcal__info-note">
          <Info className="size-4" />
          <span>{copy.buildingInfoHint}</span>
        </div>
        <div className="admcal__info-grid">
          {cards.map((card) => {
            const isEditing = editingBuilding === card.propertyName;
            if (card.blocked || !card.info || !card.meta) {
              return (
                <section className="admcal__info-card is-blocked" key={card.propertyName}>
                  <div className="admcal__info-head">
                    <div className="admcal__info-title">
                      <span className="admcal__info-icon">
                        <Lock className="size-4" />
                      </span>
                      <span>{localizedPropertyName(card.propertyName)}</span>
                    </div>
                    <span className="pill pill--muted">{copy.blockedProperty}</span>
                  </div>
                  <div className="admcal__info-empty">{copy.blockedPropertyHint}</div>
                </section>
              );
            }

            return (
              <section className="admcal__info-card" key={card.propertyName}>
                <div className="admcal__info-head">
                  <div className="admcal__info-title">
                    <span className="admcal__info-icon">
                      {card.info.kind === "house" ? (
                        <House className="size-4" />
                      ) : (
                        <Building2 className="size-4" />
                      )}
                    </span>
                    <span>{localizedPropertyName(card.propertyName)}</span>
                  </div>

                  <div className="admcal__info-actions">
                    <a
                      className="admcal__chip-button"
                      href={card.info.googleMapsUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <MapPinned className="size-4" />
                      {copy.openMap}
                    </a>
                    {isEditing ? (
                      <>
                        <button
                          className="admcal__chip-button"
                          onClick={() => {
                            setEditingBuilding(null);
                            setPropertyDrafts(cloneBuildingInfos(buildingInfos));
                          }}
                          type="button"
                        >
                          {dictionary.common.cancel}
                        </button>
                        <button
                          className="admcal__chip-button is-primary"
                          disabled={savingBuilding === card.propertyName}
                          onClick={() => void handleSaveBuildingInfo(card.propertyName)}
                          type="button"
                        >
                          {savingBuilding === card.propertyName ? (
                            <LoaderCircle className="size-4 animate-spin" />
                          ) : null}
                          {dictionary.common.save}
                        </button>
                      </>
                    ) : (
                      <button
                        className="admcal__chip-button"
                        onClick={() => setEditingBuilding(card.propertyName)}
                        type="button"
                      >
                        <Settings2 className="size-4" />
                        {copy.editInfo}
                      </button>
                    )}
                  </div>
                </div>

                <div className="admcal__info-body">
                  <div className="admcal__info-row">
                    <div className="admcal__info-label">{copy.address}</div>
                    {isEditing ? (
                      <input
                        className="admcal__input"
                        onChange={(event) =>
                          setPropertyDrafts((current) => ({
                            ...current,
                            [card.propertyName]: {
                              ...current[card.propertyName],
                              address: {
                                ...current[card.propertyName].address,
                                [uiLocale]: event.target.value,
                              },
                            },
                          }))
                        }
                        value={getPropertyAddress(
                          {
                            ...card.meta,
                            address: card.info.address,
                          },
                          uiLocale,
                        )}
                      />
                    ) : (
                      <div className="admcal__info-value">
                        {getPropertyAddress(
                          {
                            ...card.meta,
                            address: card.info.address,
                          },
                          uiLocale,
                        )}
                      </div>
                    )}
                  </div>

                  <div className="admcal__info-block">
                    <div className="admcal__info-block-title">{copy.sharedAccess}</div>
                    <div className="admcal__access-list">
                      {card.info.sharedAccess.map((access) => {
                        const labels = buildAccessLabel(access, dictionary);
                        return (
                          <div className="admcal__access-row" key={access.id}>
                            <span className="admcal__access-name">
                              {labels.label}
                              {labels.note ? (
                                <span className="admcal__access-note">{labels.note}</span>
                              ) : null}
                            </span>
                            {isEditing ? (
                              <input
                                className="admcal__code-input"
                                onChange={(event) =>
                                  setPropertyDrafts((current) => ({
                                    ...current,
                                    [card.propertyName]: {
                                      ...current[card.propertyName],
                                      sharedAccess: current[card.propertyName].sharedAccess.map((item) =>
                                        item.id === access.id
                                          ? { ...item, code: event.target.value }
                                          : item,
                                      ),
                                    },
                                  }))
                                }
                                value={access.code}
                              />
                            ) : (
                              <span className="admcal__code-chip">{access.code}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="admcal__info-block">
                    <div className="admcal__info-block-title">{copy.roomAccess}</div>
                    <div className="admcal__access-list">
                      {(card.info.roomAccess.length === 0 ? [{ roomLabel: copy.noRoomAccess, code: "" }] : card.info.roomAccess).map((room) => (
                        <div className="admcal__access-row" key={room.roomLabel}>
                          <span className="admcal__access-name">{room.roomLabel}</span>
                          {room.code ? (
                            isEditing ? (
                              <input
                                className="admcal__code-input"
                                onChange={(event) =>
                                  setPropertyDrafts((current) => ({
                                    ...current,
                                    [card.propertyName]: {
                                      ...current[card.propertyName],
                                      roomAccess: current[card.propertyName].roomAccess.map((item) =>
                                        item.roomLabel === room.roomLabel
                                          ? { ...item, code: event.target.value }
                                          : item,
                                      ),
                                    },
                                  }))
                                }
                                value={room.code}
                              />
                            ) : (
                              <span className="admcal__code-chip">{room.code}</span>
                            )
                          ) : (
                            <span className="admcal__info-muted">{copy.noRoomAccess}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="admcal__info-block">
                    <div className="admcal__info-block-title">{copy.opsNote}</div>
                    {isEditing ? (
                      <textarea
                        className="admcal__textarea"
                        onChange={(event) =>
                          setPropertyDrafts((current) => ({
                            ...current,
                            [card.propertyName]: {
                              ...current[card.propertyName],
                              note: event.target.value,
                            },
                          }))
                        }
                        value={card.info.note}
                      />
                    ) : (
                      <div className="admcal__note-box">
                        {card.info.note || copy.opsNotePlaceholder}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="admcal">
      <div className="opsbar admcal__opsbar">
        <button className="opscell" onClick={() => setActiveView("today")} type="button">
          <div className="opscell__k">
            <CalendarDays className="size-4" />
            {copy.kpiArrivals}
          </div>
          <div className="opscell__v">{arrivalsToday.length}</div>
          <div className="opscell__delta flat">{copy.todayArrivalsTitle}</div>
        </button>
        <button className="opscell" onClick={() => setActiveView("today")} type="button">
          <div className="opscell__k">
            <ChevronRight className="size-4" />
            {copy.kpiDepartures}
          </div>
          <div className="opscell__v">{departuresToday.length}</div>
          <div className="opscell__delta flat">{copy.todayDeparturesTitle}</div>
        </button>
        <button className="opscell" onClick={() => setActiveView("today")} type="button">
          <div className="opscell__k">
            <BedDouble className="size-4" />
            {copy.kpiInHouse}
          </div>
          <div className="opscell__v">{inHouseToday.length}</div>
          <div className="opscell__delta flat">{copy.todayInHouseTitle}</div>
        </button>
        <button className="opscell" onClick={() => setActiveView("today")} type="button">
          <div className="opscell__k">
            <House className="size-4" />
            {copy.kpiSettingTargets}
          </div>
          <div className="opscell__v">{settingTargetsToday.length}</div>
          <div className="opscell__delta flat">{copy.todaySettingTitle}</div>
        </button>
        <div className="opscell">
          <div className="opscell__k">
            <BellRing className="size-4" />
            {copy.kpiOccupancy}
          </div>
          <div className="opscell__v">
            {occupancyPercent}
            <small>%</small>
          </div>
          <div className="opscell__delta flat">{copy.groupOccupancy(occupiedKeysToday.size, activeRoomCount)}</div>
        </div>
      </div>

      <div className="admcal__topline">
        <div className="admcal__view-tabs">
          {viewTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={`admcal__view-tab${activeView === tab.key ? " is-active" : ""}`}
                key={tab.key}
                onClick={() => {
                  setActiveView(tab.key);
                  setIsPanelVisible(false);
                  setPanelSelection(null);
                }}
                type="button"
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="admcal__topline-actions">
          {beds24SyncPaused ? (
            <div className="admcal__sync-chip is-paused">
              <span className="admcal__sync-dot" />
              <span>{copy.syncPausedLabel}</span>
              <Info className="size-4" />
            </div>
          ) : (
            <button
              className="admcal__sync-chip"
              onClick={handleSyncRefresh}
              type="button"
            >
              <span className="admcal__sync-dot" />
              <span>{copy.syncPassiveLabel}</span>
              {isRefreshing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {activeView === "month" && renderMonthView()}
      {activeView === "today" && renderTodayBoard()}
      {activeView === "rooms" && renderRoomStatusBoard()}
      {activeView === "info" && renderBuildingInfoBoard()}

      <div className={`admcal__panel-scrim${isPanelVisible ? " is-visible" : ""}`} onClick={closePanel} />

      <aside className={`admcal__panel${isPanelVisible ? " is-visible" : ""}`}>
        {panelReservation ? (
          <ReservationPanel
            beds24Id={panelReservation.beds24Id}
            channelLabel={buildChannelLabel(panelReservation.channel, dictionary)}
            channelShort={buildChannelShort(panelReservation.channel)}
            channelStyle={CHANNEL_STYLE[panelReservation.channel]}
            copy={copy}
            dictionary={dictionary}
            note={reservationNotes[panelReservation.id] ?? ""}
            onChangeNote={(value) =>
              setReservationNotes((current) => ({ ...current, [panelReservation.id]: value }))
            }
            onClose={closePanel}
            onCopyBeds24Id={async () => {
              try {
                await copyText(panelReservation.beds24Id);
                showToast(copy.beds24CopiedToast);
              } catch {
                showToast(copy.copyFailedToast, true);
              }
            }}
            onLinkedAction={(kind) => router.push(buildLinkedActionHref(kind, panelReservation.id))}
            onSaveNote={async (value) => {
              const result = await saveReservationInternalNoteAction(panelReservation.id, value);
              if (!result.ok) {
                showToast(copy.internalNoteSaveFailedToast, true);
                return;
              }

              setReservationNotes((current) => ({
                ...current,
                [panelReservation.id]: result.note,
              }));
              showToast(copy.internalNoteSavedToast);
            }}
            phoneLabel={panelReservation.phone ?? copy.phoneMissing}
            reservation={panelReservation}
            roomLabel={panelReservation.roomLabel}
            propertyLabel={localizedPropertyName(panelReservation.propertyName)}
            statusLabel={statusLabels[panelReservation.status]}
            statusStyle={STATUS_STYLE[panelReservation.status]}
            uiLocale={uiLocale}
          />
        ) : null}

        {panelRoom ? (
          <RoomPanel
            copy={copy}
            onClose={closePanel}
            onOpenReservation={openReservationPanel}
            propertyLabel={localizedPropertyName(panelRoom.propertyName)}
            reservations={activeReservations}
            room={panelRoom}
            today={today}
            uiLocale={uiLocale}
          />
        ) : null}
      </aside>

      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </div>
  );
}

function ReservationPanel({
  beds24Id,
  channelLabel,
  channelShort,
  channelStyle,
  copy,
  dictionary,
  note,
  onChangeNote,
  onClose,
  onCopyBeds24Id,
  onLinkedAction,
  onSaveNote,
  phoneLabel,
  propertyLabel,
  reservation,
  roomLabel,
  statusLabel,
  statusStyle,
  uiLocale,
}: {
  beds24Id: string;
  channelLabel: string;
  channelShort: string;
  channelStyle: { accent: string; background: string; badge: string };
  copy: ReturnType<typeof getDictionary>["admin"]["calendar"];
  dictionary: ReturnType<typeof getDictionary>;
  note: string;
  onChangeNote: (value: string) => void;
  onClose: () => void;
  onCopyBeds24Id: () => void;
  onLinkedAction: (kind: "maintenance" | "complaint" | "lost") => void;
  onSaveNote: (value: string) => Promise<void>;
  phoneLabel: string;
  propertyLabel: string;
  reservation: AdminReservationConsoleProps["reservations"][number];
  roomLabel: string;
  statusLabel: string;
  statusStyle: { badge: string };
  uiLocale: Locale;
}) {
  const guestCountLabel =
    reservation.guestCount === null
      ? copy.guestCountUnknown
      : copy.guestCount(reservation.guestCount);
  const activityRows = [
    {
      icon: RefreshCw,
      label: copy.activitySynced,
      value: reservation.beds24Id,
    },
    {
      icon: CalendarDays,
      label: copy.activityCheckIn,
      value: formatFullDate(reservation.checkInDate, uiLocale),
    },
    {
      icon: DoorClosed,
      label: copy.activityCheckOut,
      value: formatFullDate(reservation.checkOutDate, uiLocale),
    },
  ];

  return (
    <div className="admcal__panel-inner">
      <div className="admcal__panel-header">
        <div className="admcal__panel-kicker">
          {channelLabel} · {propertyLabel}
        </div>
        <button className="admcal__panel-close" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
        <div className="admcal__panel-title">{reservation.guestName}</div>
        <div className="admcal__panel-subtitle">
          {propertyLabel} · {roomLabel}
        </div>
        <div className="admcal__panel-pills">
          <span className={statusStyle.badge}>{statusLabel}</span>
          <span className="pill pill--muted">
            {copy.nights(nightsBetween(reservation.checkInDate, reservation.checkOutDate))}
          </span>
          <span className="pill pill--muted">{guestCountLabel}</span>
        </div>
      </div>

      <div className="admcal__panel-body">
        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.stayPeriod}</div>
          <div className="admcal__staybar">
            <div className="admcal__stay-node">
              <span className="admcal__stay-label">{copy.checkIn}</span>
              <strong>{formatShortDate(reservation.checkInDate, uiLocale)}</strong>
              <span>{weekdayLabel(reservation.checkInDate, uiLocale)}</span>
            </div>
            <div className="admcal__stay-line">
              <span>{copy.nights(nightsBetween(reservation.checkInDate, reservation.checkOutDate))}</span>
            </div>
            <div className="admcal__stay-node">
              <span className="admcal__stay-label">{copy.checkOut}</span>
              <strong>{formatShortDate(reservation.checkOutDate, uiLocale)}</strong>
              <span>{weekdayLabel(reservation.checkOutDate, uiLocale)}</span>
            </div>
          </div>
        </section>

        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.reservationInfo}</div>
          <div className="admcal__channel-row">
            <span className="admcal__channel-badge" style={{ background: channelStyle.badge }}>
              {channelShort}
            </span>
            <div>
              <div className="admcal__channel-name">{channelLabel}</div>
              <div className="admcal__channel-sub">{copy.beds24IdLabel(beds24Id)}</div>
            </div>
          </div>
          <dl className="admcal__kv-list">
            <div>
              <dt>{copy.stayRange}</dt>
              <dd>
                {reservation.checkInDate} → {reservation.checkOutDate}
              </dd>
            </div>
            <div>
              <dt>{copy.guestCountLabel}</dt>
              <dd>{guestCountLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.guestContact}</div>
          <dl className="admcal__kv-list">
            <div>
              <dt>{copy.guestName}</dt>
              <dd>{reservation.guestName}</dd>
            </div>
            <div>
              <dt>{copy.phoneLabel}</dt>
              <dd>{phoneLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="admcal__readonly-box">
          <Lock className="size-4" />
          <div>
            <div className="admcal__readonly-title">{copy.readonlyTitle}</div>
            <div className="admcal__readonly-body">{copy.readonlyBody}</div>
          </div>
        </section>

        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.internalNote}</div>
          <textarea
            className="admcal__textarea"
            onChange={(event) => onChangeNote(event.target.value)}
            onBlur={(event) => {
              startTransition(() => {
                void onSaveNote(event.target.value);
              });
            }}
            placeholder={copy.internalNotePlaceholder}
            value={note}
          />
        </section>

        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.linkedActions}</div>
          <div className="admcal__action-grid">
            <button className="admcal__action-tile" onClick={() => onLinkedAction("maintenance")} type="button">
              <span className="admcal__action-icon is-warn">
                <Wrench className="size-4" />
              </span>
              <span className="admcal__action-label">{copy.linkMaintenance}</span>
            </button>
            <button className="admcal__action-tile" onClick={() => onLinkedAction("complaint")} type="button">
              <span className="admcal__action-icon is-danger">
                <ShieldAlert className="size-4" />
              </span>
              <span className="admcal__action-label">{copy.linkComplaint}</span>
            </button>
            <button className="admcal__action-tile" onClick={() => onLinkedAction("lost")} type="button">
              <span className="admcal__action-icon is-info">
                <Info className="size-4" />
              </span>
              <span className="admcal__action-label">{copy.linkLostFound}</span>
            </button>
          </div>
        </section>

        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.activityLog}</div>
          <div className="admcal__timeline">
            {activityRows.map((row) => {
              const Icon = row.icon;
              return (
                <div className="admcal__timeline-row" key={row.label}>
                  <span className="admcal__timeline-dot">
                    <Icon className="size-3.5" />
                  </span>
                  <div>
                    <div className="admcal__timeline-title">{row.label}</div>
                    <div className="admcal__timeline-value">{row.value}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="admcal__panel-footer">
        <button className="admcal__subtle-btn is-full" onClick={onClose} type="button">
          {dictionary.common.close}
        </button>
        <button className="admcal__primary-btn is-full" onClick={onCopyBeds24Id} type="button">
          <Clipboard className="size-4" />
          {copy.copyBeds24Id}
        </button>
      </div>
    </div>
  );
}

function RoomPanel({
  copy,
  onClose,
  onOpenReservation,
  propertyLabel,
  reservations,
  room,
  today,
  uiLocale,
}: {
  copy: ReturnType<typeof getDictionary>["admin"]["calendar"];
  onClose: () => void;
  onOpenReservation: (reservationId: string) => void;
  propertyLabel: string;
  reservations: AdminReservationConsoleProps["reservations"];
  room: AdminReservationConsoleProps["roomRows"][number];
  today: string;
  uiLocale: Locale;
}) {
  const currentGuest =
    reservations.find(
      (reservation) =>
        reservation.roomKey === room.key &&
        reservation.checkInDate <= today &&
        reservation.checkOutDate > today,
    ) ?? null;
  const nextReservation =
    reservations
      .filter((reservation) => reservation.roomKey === room.key && reservation.checkInDate > today)
      .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))[0] ?? null;

  return (
    <div className="admcal__panel-inner">
      <div className="admcal__panel-header">
        <div className="admcal__panel-kicker">
          {copy.roomStatusView} · {propertyLabel}
        </div>
        <button className="admcal__panel-close" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
        <div className="admcal__panel-title">{room.displayRoomLabel}</div>
        <div className="admcal__panel-subtitle">{propertyLabel}</div>
      </div>

      <div className="admcal__panel-body">
        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.currentGuest}</div>
          {currentGuest ? (
            <button className="admcal__linked-card" onClick={() => onOpenReservation(currentGuest.id)} type="button">
              <div className="admcal__linked-card-title">{currentGuest.guestName}</div>
              <div className="admcal__linked-card-body">
                {copy.checkIn}: {formatShortDate(currentGuest.checkInDate, uiLocale)} · {copy.checkOut}:{" "}
                {formatShortDate(currentGuest.checkOutDate, uiLocale)}
              </div>
            </button>
          ) : (
            <div className="admcal__linked-empty">{copy.statusVacant}</div>
          )}
        </section>

        <section className="admcal__panel-section">
          <div className="admcal__section-title">{copy.nextReservation}</div>
          {nextReservation ? (
            <button className="admcal__linked-card" onClick={() => onOpenReservation(nextReservation.id)} type="button">
              <div className="admcal__linked-card-title">{nextReservation.guestName}</div>
              <div className="admcal__linked-card-body">
                {copy.checkIn}: {formatShortDate(nextReservation.checkInDate, uiLocale)} · {copy.checkOut}:{" "}
                {formatShortDate(nextReservation.checkOutDate, uiLocale)}
              </div>
            </button>
          ) : (
            <div className="admcal__linked-empty">{copy.noNextReservation}</div>
          )}
        </section>
      </div>

      <div className="admcal__panel-footer">
        <button className="admcal__subtle-btn is-full" onClick={onClose} type="button">
          {copy.closePanel}
        </button>
      </div>
    </div>
  );
}

function FragmentRows({
  copy,
  group,
  groupRows,
  inHouseToday,
  localizedPropertyName,
  onRoomClick,
  reservations,
  today,
  uiLocale,
}: {
  copy: ReturnType<typeof getDictionary>["admin"]["calendar"];
  group: {
    blocked: AdminReservationConsoleProps["blockedProperties"][number] | null;
    propertyName: string;
    rows: AdminReservationConsoleProps["roomRows"];
  };
  groupRows: AdminReservationConsoleProps["roomRows"];
  inHouseToday: AdminReservationConsoleProps["reservations"];
  localizedPropertyName: (propertyName: string) => string;
  onRoomClick: (roomKey: string) => void;
  reservations: AdminReservationConsoleProps["reservations"];
  today: string;
  uiLocale: Locale;
}) {
  return (
    <>
      <tr className="admcal__table-group">
        <td colSpan={4}>
          <span className="admcal__table-group-title">
            <Building2 className="size-4" />
            {localizedPropertyName(group.propertyName)}
          </span>
        </td>
      </tr>
      {group.blocked ? (
        <tr>
          <td>{copy.blockedProperty}</td>
          <td>
            <span className="pill pill--muted">{copy.blockedProperty}</span>
          </td>
          <td colSpan={2}>{copy.blockedPropertyHint}</td>
        </tr>
      ) : (
        groupRows.map((room) => {
          const currentGuest =
            inHouseToday.find((reservation) => reservation.roomKey === room.key) ?? null;
          const hasDeparture = reservations.some(
            (reservation) =>
              reservation.roomKey === room.key && reservation.checkOutDate === today,
          );
          const hasArrival = reservations.some(
            (reservation) =>
              reservation.roomKey === room.key && reservation.checkInDate === today,
          );
          const nextReservation =
            reservations
              .filter(
                (reservation) =>
                  reservation.roomKey === room.key && reservation.checkInDate > today,
              )
              .sort((a, b) => a.checkInDate.localeCompare(b.checkInDate))[0] ?? null;

          let statusClass = "pill pill--muted";
          let statusText = copy.statusVacant;

          if (currentGuest) {
            statusClass = "pill pill--done";
            statusText = copy.statusOccupied;
          } else if (hasDeparture) {
            statusClass = "pill pill--warn";
            statusText = copy.statusCleaningDue;
          } else if (hasArrival) {
            statusClass = "pill pill--info";
            statusText = copy.statusArrivingToday;
          }

          return (
            <tr className="admcal__table-row" key={room.key}>
              <td>
                <button className="admcal__table-link" onClick={() => onRoomClick(room.key)} type="button">
                  {room.displayRoomLabel}
                </button>
              </td>
              <td>
                <span className={statusClass}>{statusText}</span>
              </td>
              <td>
                {currentGuest ? (
                  <div className="admcal__cell-stack">
                    <span>{currentGuest.guestName}</span>
                    <span>{formatDateRangeShort(currentGuest.checkInDate, currentGuest.checkOutDate, uiLocale)}</span>
                  </div>
                ) : (
                  <span className="admcal__info-muted">{copy.none}</span>
                )}
              </td>
              <td>
                {nextReservation ? (
                  <div className="admcal__cell-stack">
                    <span>{nextReservation.guestName}</span>
                    <span>{formatDateRangeShort(nextReservation.checkInDate, nextReservation.checkOutDate, uiLocale)}</span>
                  </div>
                ) : (
                  <span className="admcal__info-muted">{copy.noNextReservation}</span>
                )}
              </td>
            </tr>
          );
        })
      )}
    </>
  );
}
