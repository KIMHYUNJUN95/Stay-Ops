"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Package,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  Undo2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { useBodyScrollLock } from "@/components/shell/use-body-scroll-lock";
import {
  deleteLostItem,
  deleteMaintenanceReport,
  deleteOrderRequest,
} from "@/app/mobile/requests/delete-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import {
  DateRangeCalendar,
  type DateRangeValue,
} from "@/components/requests/date-range-calendar";
import type { Locale } from "@/lib/i18n";
import type { LostItemWithReporter } from "@/lib/lost-found";
import type { MaintenanceReportWithReporter } from "@/lib/maintenance-reports";
import type {
  OrderRequestStatus,
  OrderRequestWithReporter,
  OrderRequestItem,
} from "@/lib/order-requests";
import type { RequestDatePreset } from "@/lib/request-filters";
import {
  OrderDeliveryCalendar,
  type DeliveryCalendarOrder,
} from "@/components/requests/order-delivery-calendar";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { resolveRequestLocation, type RequestLocationDisplay } from "@/lib/request-location";
import type { ActiveRoomCatalogItem } from "@/lib/rooms";
import type { Role } from "@/config/roles";
import type { Database } from "@/types/database";
import { cn } from "@/lib/utils";

type LostItemStatus = Database["public"]["Enums"]["lost_item_status"];
type MaintenanceStatus = Database["public"]["Enums"]["maintenance_status"];

type OrderStatus = OrderRequestStatus;

type ScopeFilter = "all" | "mine";
// "all" type removed: the list now shows exactly one request kind at a time
// via the top tabs, which eliminates the long mixed scroll.
type TypeFilter = "lost-found" | "maintenance" | "order";
type StatusFilter = "all" | "active" | "closed";

const DEFAULT_TYPE: TypeFilter = "lost-found";

// Whitelist of keys that belong to the list filter state.
const LIST_FILTER_KEYS = [
  "scope", "type", "status", "building", "date", "startDate", "endDate",
] as const;

// These sets are module-level constants; stable references across renders.
const activeLostStatuses = new Set<LostItemStatus>([
  "registered",
  "stored",
  "disposal_scheduled",
]);
const activeMaintenanceStatuses = new Set<MaintenanceStatus>(["open", "in_progress"]);
// active: requested/approved/ordered, closed: received/closed
const activeOrderStatuses = new Set<OrderStatus>(["requested", "approved", "ordered"]);

const lostStatusBadgeClass: Record<LostItemStatus, string> = {
  registered:
    "border-primary/20 bg-primary/10 text-primary",
  stored:
    "border-amber-200 bg-amber-50 text-amber-700",
  disposal_scheduled:
    "border-orange-200 bg-orange-50 text-orange-700",
  disposed: "border-border bg-muted/50 text-muted-foreground",
  returned: "border-[#c5cdf0] bg-[#eef1fb] text-[#3949ab]",
};

const maintenanceStatusBadgeClass: Record<MaintenanceStatus, string> = {
  open: "border-primary/20 bg-primary/10 text-primary",
  in_progress:
    "border-amber-200 bg-amber-50 text-amber-700",
  closed:
    "border-green-200 bg-green-50 text-green-700",
  cancelled: "border-border bg-muted/50 text-muted-foreground",
};

const orderStatusBadgeClass: Record<OrderStatus, string> = {
  requested:
    "border-primary/20 bg-primary/10 text-primary",
  approved:
    "border-indigo-200 bg-indigo-50 text-indigo-700",
  ordered:
    "border-amber-200 bg-amber-50 text-amber-700",
  received:
    "border-green-200 bg-green-50 text-green-700",
  closed: "border-border bg-muted/50 text-muted-foreground",
};
const REQUEST_PANEL =
  "rounded-[28px] border border-slate-200/80 bg-surface shadow-[0_22px_46px_-32px_rgba(31,58,95,0.48)] backdrop-blur-none";
const REQUEST_CARD =
  "rounded-[24px] border border-slate-200/80 bg-surface shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)] backdrop-blur-none";
const requestTypeTone = {
  "lost-found": {
    bar: "bg-primary/70",
    icon: "bg-primary/10 text-primary ring-primary/20",
  },
  maintenance: {
    bar: "bg-primary/70",
    icon: "bg-primary/10 text-primary ring-primary/20",
  },
  order: {
    bar: "bg-rose-300/80",
    icon: "bg-rose-50 text-rose-700 ring-rose-200/80",
  },
} as const;

// ── Date grouping (Tokyo operating date) ─────────────────────────────────────
// Requests are bucketed into Today / Yesterday / Earlier using the Asia/Tokyo
// calendar date so grouping is stable regardless of the server/runner timezone.
type DateGroupKey = "today" | "yesterday" | "earlier";

function tokyoDateKey(value: string): string {
  // en-CA → "YYYY-MM-DD"
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function shiftDateKey(key: string, deltaDays: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function GroupHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2.5 mt-[18px] flex items-center gap-2 first:mt-1">
      <span className="text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-slate-500">
        {label}
      </span>
      <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10.5px] font-extrabold text-slate-500 ring-1 ring-slate-200">
        {count}
      </span>
      <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
    </div>
  );
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

// delivery_date is date-only; use 03:00 UTC (= noon JST) + explicit Asia/Tokyo
// so the calendar day is always stable regardless of runner timezone.
function formatDeliveryDate(value: string, locale: Locale) {
  const [y, m, d] = value.split("-").map(Number);
  const noonJst = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(noonJst);
}

function formatDeliveryDateWindow(
  startDate: string | null,
  endDate: string | null,
  exactDate: string | null,
  locale: Locale,
) {
  if (startDate && endDate) {
    return `${formatDeliveryDate(startDate, locale)} - ${formatDeliveryDate(endDate, locale)}`;
  }
  if (exactDate) {
    return formatDeliveryDate(exactDate, locale);
  }
  return null;
}

type FilterLabels = {
  building: string;
  calendarApply: string;
  calendarClear: string;
  calendarClose: string;
  clearBuildingFilter: string;
  calendarSelectEnd: string;
  calendarSelectStart: string;
  calendarTitle: string;
  filterAll: string;
  filterButton: string;
  filterCustomRange: string;
  filterLostFound: string;
  filterMaintenance: string;
  filterOrder: string;
  filterActive: string;
  filterClosed: string;
  filterLast7Days: string;
  filterLast30Days: string;
  filterScopeMine: string;
  filterScopeMineRequest: string;
  filterToday: string;
  groupDate: string;
  groupScope: string;
  groupStatus: string;
  groupType: string;
  groupToday: string;
  groupYesterday: string;
  groupEarlier: string;
  openCountTemplate: string;
  noFilterResults: string;
  returnedEntry: string;
  disposedEntry: string;
};

type LostFoundCopy = {
  fromCleaningTag: string;
  mobileListTitle: string;
  noRecords: string;
  reporter: string;
  room: string;
  statusLabels: Record<LostItemStatus, string>;
};

type MaintenanceCopy = {
  fromCleaningTag: string;
  mobileListTitle: string;
  noRecords: string;
  reporter: string;
  room: string;
  statusLabels: Record<MaintenanceStatus, string>;
};

type OrderCopy = {
  sectionTitle: string;
  statusLabels: Record<OrderStatus, string>;
  deliveryDateShort: string;
};

type DeliveryCalendarCopy = {
  title: string;
  openLabel: string;
  empty: string;
  dayEmpty: string;
  today: string;
  close: string;
  countTemplate: string;
  rangeLabel: string;
};

type EnrichedOrder = OrderRequestWithReporter & {
  parsedItems: OrderRequestItem[];
};

type DeleteCopy = {
  confirmTitle: string;
  confirmBody: string;
  deleteAction: string;
  cancel: string;
  deleteFailed: string;
};

type RequestsFilterViewProps = {
  buildingLabels: Record<string, string>;
  currentUserId: string;
  currentUserRole: Role;
  datePreset: RequestDatePreset;
  deleteCopy: DeleteCopy;
  endDate?: string;
  filterLabels: FilterLabels;
  locale: Locale;
  lostFoundCopy: LostFoundCopy;
  lostItems: LostItemWithReporter[];
  maintenanceCopy: MaintenanceCopy;
  maintenanceReports: MaintenanceReportWithReporter[];
  orderRequests: OrderRequestWithReporter[];
  orderCopy: OrderCopy;
  deliveryCalendarCopy: DeliveryCalendarCopy;
  roomCatalog: ActiveRoomCatalogItem[];
  startDate?: string;
};

function SegTrack({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-slate-200/80 bg-white/80 p-1 shadow-[0_10px_22px_-20px_rgba(31,58,95,0.42)]">
      {children}
    </div>
  );
}

function SegButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold transition-all",
        active
          ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
          : "text-slate-500 hover:text-slate-900",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function MetaItem({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold text-slate-500">
      <span className="text-slate-400">{icon}</span>
      <span className="truncate text-foreground/75">{children}</span>
    </span>
  );
}

// memo: avoids re-rendering unchanged cards when parent re-renders due to filter state change.
const RequestListCard = memo(function RequestListCard({
  cleaningTag,
  deliveryTag,
  href,
  imageUrl,
  leadingIcon,
  locationLabel,
  memo: memoProp,
  onDelete,
  reporter,
  requestType,
  roomLabel,
  statusClass,
  statusLabel,
  time,
  title,
}: {
  cleaningTag?: string | null;
  deliveryTag?: string | null;
  href: string;
  imageUrl?: string | null;
  leadingIcon: React.ReactNode;
  locationLabel: string;
  memo?: string | null;
  onDelete?: () => void;
  reporter: string;
  requestType: TypeFilter;
  roomLabel: string;
  statusClass: string;
  statusLabel: string;
  time: string;
  title: string;
}) {
  const tone = requestTypeTone[requestType];

  return (
    <Link className="block" href={href}>
      <Card className={`${REQUEST_CARD} relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-30px_rgba(31,58,95,0.55)] active:scale-[0.99]`}>
        <div
          aria-hidden="true"
          className={cn("pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full", tone.bar)}
        />
        <div className="flex items-start gap-3">
          {imageUrl ? (
            <div className="relative size-12 shrink-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 shadow-[0_12px_22px_-18px_rgba(31,58,95,0.45)]">
              <Image
                alt={title}
                className="object-cover"
                fill
                sizes="44px"
                src={imageUrl}
              />
            </div>
          ) : (
            <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 shadow-[0_12px_22px_-18px_rgba(31,58,95,0.45)]", tone.icon)}>
              {leadingIcon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-[15px] font-black leading-tight tracking-[-0.03em] text-slate-950">
                    {title}
                  </p>
                  {cleaningTag ? (
                    <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-black tracking-wide text-primary">
                      {cleaningTag}
                    </span>
                  ) : null}
                </div>
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                  <Clock className="size-3" aria-hidden="true" />
                  {time}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {onDelete ? (
                  <button
                    className="inline-flex size-8 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-400 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.45)] transition-colors hover:bg-red-50 hover:text-red-500"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
                    type="button"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
                <Badge className={cn("shrink-0", statusClass)}>{statusLabel}</Badge>
              </div>
            </div>
          </div>
        </div>

        {memoProp ? (
          <p className="mt-3 line-clamp-2 rounded-2xl bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {memoProp}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-200/70 pt-3">
          <MetaItem icon={<MapPin className="size-3.5" aria-hidden="true" />}>
            {locationLabel} {"\u00B7"} {roomLabel}
          </MetaItem>
          <MetaItem icon={<User className="size-3.5" aria-hidden="true" />}>
            {reporter}
          </MetaItem>
          {deliveryTag ? (
            <MetaItem icon={<Clock className="size-3.5" aria-hidden="true" />}>
              {deliveryTag}
            </MetaItem>
          ) : null}
        </div>
      </Card>
    </Link>
  );
});

function sanitizeScope(val: string | null): ScopeFilter {
  if (val === "mine") return "mine";
  return "all";
}

function sanitizeType(val: string | null): TypeFilter {
  if (val === "lost-found" || val === "maintenance" || val === "order") return val;
  return DEFAULT_TYPE;
}

function sanitizeStatus(val: string | null): StatusFilter {
  if (val === "active" || val === "closed") return val;
  return "all";
}

// Enriched item types: location pre-attached, avoids repeated catalog lookups.
type EnrichedLostItem = LostItemWithReporter & { location: RequestLocationDisplay };
type EnrichedMaintenance = MaintenanceReportWithReporter & { location: RequestLocationDisplay };

/** Roles that can delete ANY record (not just their own). Matches the DB RLS policy. */
const DELETE_ANY_ROLES: ReadonlySet<Role> = new Set([
  "developer_super_admin",
  "owner",
  "office_admin",
  "cs_staff",
  "field_manager",
]);

type DeleteTarget = {
  type: "lost-found" | "maintenance" | "order";
  id: string;
  title: string;
};

export function RequestsFilterView({
  buildingLabels,
  currentUserId,
  currentUserRole,
  datePreset,
  deleteCopy,
  endDate,
  filterLabels,
  locale,
  lostFoundCopy,
  lostItems,
  maintenanceCopy,
  maintenanceReports,
  orderRequests,
  orderCopy,
  deliveryCalendarCopy,
  roomCatalog,
  startDate,
}: RequestsFilterViewProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [deliveryCalOpen, setDeliveryCalOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // ── Delete state ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const canDeleteAny = DELETE_ANY_ROLES.has(currentUserRole);

  const openDelete = useCallback((target: DeleteTarget) => {
    setDeleteTarget(target);
    setDeleteError(null);
  }, []);

  const closeDelete = useCallback(() => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, [isDeleting]);

  function handleConfirmDelete() {
    if (!deleteTarget || isDeleting) return;
    startDeleteTransition(async () => {
      const action =
        deleteTarget.type === "lost-found" ? deleteLostItem :
        deleteTarget.type === "maintenance" ? deleteMaintenanceReport :
        deleteOrderRequest;
      const result = await action(deleteTarget.id);
      if (!result.ok) {
        setDeleteError(deleteCopy.deleteFailed);
        return;
      }
      setDeleteTarget(null);
      setDeleteError(null);
      router.refresh();
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Refs for filter sheet focus management.
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetWasOpenRef = useRef(false);

  // Move focus into the sheet on open; restore to trigger on close.
  useEffect(() => {
    if (filterSheetOpen) {
      sheetWasOpenRef.current = true;
      const first = sheetRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    } else if (sheetWasOpenRef.current) {
      sheetWasOpenRef.current = false;
      sheetTriggerRef.current?.focus();
    }
  }, [filterSheetOpen]);

  // Close the sheet on Esc key.
  useEffect(() => {
    if (!filterSheetOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setFilterSheetOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [filterSheetOpen]);

  useBodyScrollLock(filterSheetOpen);

  // Constrain Tab focus inside the sheet panel.
  function handleSheetKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusable = sheetRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // URL-derived filter state; no local useState for scope/type/status.
  const scopeFilter = sanitizeScope(searchParams.get("scope"));
  const typeFilter = sanitizeType(searchParams.get("type"));
  const statusFilter = sanitizeStatus(searchParams.get("status"));
  const selectedBuildingKey = searchParams.get("building");

  // Build a whitelist-filtered query string to append to card hrefs.
  // Keeps detail-page-specific params (e.g. created=1) out of list URLs.
  const listQueryString = useMemo(() => {
    const filtered = new URLSearchParams();
    for (const key of LIST_FILTER_KEYS) {
      const val = searchParams.get(key);
      if (val) filtered.set(key, val);
    }
    return filtered.toString();
  }, [searchParams]);

  const hasCustomRange = Boolean(startDate || endDate);
  const activePreset = hasCustomRange ? null : datePreset;

  // Single URL update utility: null removes a key, string sets it.
  function updateQuery(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function setDatePreset(nextPreset: RequestDatePreset) {
    updateQuery({
      date: nextPreset === "all" ? null : nextPreset,
      startDate: null,
      endDate: null,
    });
  }

  function applyRange(range: DateRangeValue) {
    updateQuery({
      date: null,
      startDate: range.startDate || null,
      endDate: range.endDate || null,
    });
    setCalendarOpen(false);
  }

  function clearRange() {
    updateQuery({ startDate: null, endDate: null });
    setCalendarOpen(false);
  }

  function formatRangeDate(value: string) {
    return new Intl.DateTimeFormat(locale, {
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(`${value}T00:00:00`));
  }

  const rangeLabel = hasCustomRange
    ? startDate && endDate && startDate !== endDate
      ? `${formatRangeDate(startDate)} ~ ${formatRangeDate(endDate)}`
      : formatRangeDate((startDate ?? endDate) as string)
    : filterLabels.filterCustomRange;

  // Memoized: stable as long as roomCatalog/buildingLabels/locale don't change.
  const buildingOptions = useMemo(
    () =>
      Array.from(
        new Set(
          roomCatalog
            .map((item) => item.propertyName)
            .filter((propertyName) => Boolean(propertyName)),
        ),
      )
        .map((propertyName) => ({
          key: propertyName,
          label: localizePropertyName(propertyName, buildingLabels),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    [roomCatalog, buildingLabels, locale],
  );

  const selectedBuildingLabel = useMemo(() => {
    if (!selectedBuildingKey) return null;
    return buildingOptions.find((option) => option.key === selectedBuildingKey)?.label ?? null;
  }, [buildingOptions, selectedBuildingKey]);

  function setBuildingFilter(nextBuildingKey: string | null) {
    updateQuery({ building: nextBuildingKey });
  }

  // Pre-compute location for each item once.
  // resolveRequestLocation does catalog find/filter (O(catalog)) per call;
  // memoizing here prevents re-running on every scope/type/status filter change.
  const enrichedLostItems = useMemo<EnrichedLostItem[]>(
    () =>
      lostItems.map((item) => ({
        ...item,
        location: resolveRequestLocation(item.room_label, roomCatalog, buildingLabels),
      })),
    [lostItems, roomCatalog, buildingLabels],
  );

  const enrichedMaintenance = useMemo<EnrichedMaintenance[]>(
    () =>
      maintenanceReports.map((report) => ({
        ...report,
        location: resolveRequestLocation(report.room_label, roomCatalog, buildingLabels, report.property_name),
      })),
    [maintenanceReports, roomCatalog, buildingLabels],
  );

  // Single-pass filter pipeline: scope + type + status + building applied together.
  // Only re-runs when the enriched data or active filters actually change.
  const visibleLostItems = useMemo<EnrichedLostItem[]>(() => {
    if (typeFilter !== "lost-found") return [];
    return enrichedLostItems.filter((item) => {
      if (scopeFilter === "mine" && item.reported_by_user_id !== currentUserId) return false;
      if (selectedBuildingLabel && item.location.buildingLabel !== selectedBuildingLabel)
        return false;
      if (statusFilter === "active") return activeLostStatuses.has(item.status);
      if (statusFilter === "closed") return !activeLostStatuses.has(item.status);
      return true;
    });
  }, [enrichedLostItems, scopeFilter, typeFilter, statusFilter, selectedBuildingLabel, currentUserId]);

  const visibleMaintenance = useMemo<EnrichedMaintenance[]>(() => {
    if (typeFilter !== "maintenance") return [];
    return enrichedMaintenance.filter((report) => {
      if (scopeFilter === "mine" && report.reported_by_user_id !== currentUserId) return false;
      if (selectedBuildingLabel && report.location.buildingLabel !== selectedBuildingLabel)
        return false;
      if (statusFilter === "active") return activeMaintenanceStatuses.has(report.status);
      if (statusFilter === "closed") return !activeMaintenanceStatuses.has(report.status);
      return true;
    });
  }, [enrichedMaintenance, scopeFilter, typeFilter, statusFilter, selectedBuildingLabel, currentUserId]);

  const enrichedOrders = useMemo<EnrichedOrder[]>(
    () =>
      orderRequests.map((order) => ({
        ...order,
        parsedItems: Array.isArray(order.items) ? (order.items as OrderRequestItem[]) : [],
      })),
    [orderRequests],
  );

  const visibleOrders = useMemo<EnrichedOrder[]>(() => {
    if (typeFilter !== "order") return [];
    return enrichedOrders.filter((order) => {
      if (scopeFilter === "mine" && order.reported_by_user_id !== currentUserId) return false;
      if (selectedBuildingLabel && order.building_name !== selectedBuildingLabel) return false;
      if (statusFilter === "active") return activeOrderStatuses.has(order.status);
      if (statusFilter === "closed") return !activeOrderStatuses.has(order.status);
      return true;
    });
  }, [enrichedOrders, scopeFilter, typeFilter, statusFilter, selectedBuildingLabel, currentUserId]);

  const hasAnyResults =
    visibleLostItems.length > 0 || visibleMaintenance.length > 0 || visibleOrders.length > 0;

  // Delivery calendar dataset — all org orders (or mine), independent of the list's status/building
  // filters. The calendar component itself keeps only those with a delivery date/window.
  const deliveryCalendarOrders = useMemo<DeliveryCalendarOrder[]>(
    () =>
      enrichedOrders
        .filter((o) => scopeFilter !== "mine" || o.reported_by_user_id === currentUserId)
        .map((o) => ({
          id: o.id,
          buildingName: o.building_name,
          roomLabel: o.room_label,
          title: o.title,
          reporterName: o.reporter_name,
          status: o.status,
          deliveryDate: o.delivery_date,
          deliveryStartDate: o.delivery_start_date,
          deliveryEndDate: o.delivery_end_date,
        })),
    [enrichedOrders, scopeFilter, currentUserId],
  );

  // ── Top "open count": current tab + scope, counting only active (open) status.
  // Completed/closed records are excluded, so the number drops as work is closed.
  const openCount = useMemo(() => {
    const inScope = (reporterId: string) =>
      scopeFilter !== "mine" || reporterId === currentUserId;
    if (typeFilter === "lost-found") {
      return enrichedLostItems.filter(
        (i) => inScope(i.reported_by_user_id) && activeLostStatuses.has(i.status),
      ).length;
    }
    if (typeFilter === "maintenance") {
      return enrichedMaintenance.filter(
        (r) => inScope(r.reported_by_user_id) && activeMaintenanceStatuses.has(r.status),
      ).length;
    }
    return enrichedOrders.filter(
      (o) => inScope(o.reported_by_user_id) && activeOrderStatuses.has(o.status),
    ).length;
  }, [typeFilter, scopeFilter, currentUserId, enrichedLostItems, enrichedMaintenance, enrichedOrders]);

  const [openCountPrefix, openCountSuffix] = useMemo(() => {
    const parts = filterLabels.openCountTemplate.split("{n}");
    return [parts[0] ?? "", parts[1] ?? ""];
  }, [filterLabels.openCountTemplate]);

  // ── Date grouping (Tokyo operating date): Today / Yesterday / Earlier.
  const todayKey = useMemo(() => tokyoDateKey(new Date().toISOString()), []);
  const yesterdayKey = useMemo(() => shiftDateKey(todayKey, -1), [todayKey]);

  const groupByDate = useCallback(
    <T,>(items: T[], getTime: (item: T) => string) => {
      const labels: Record<DateGroupKey, string> = {
        today: filterLabels.groupToday,
        yesterday: filterLabels.groupYesterday,
        earlier: filterLabels.groupEarlier,
      };
      const buckets: Record<DateGroupKey, T[]> = { today: [], yesterday: [], earlier: [] };
      for (const item of items) {
        const key = tokyoDateKey(getTime(item));
        const bucket: DateGroupKey =
          key === todayKey ? "today" : key === yesterdayKey ? "yesterday" : "earlier";
        buckets[bucket].push(item);
      }
      return (["today", "yesterday", "earlier"] as DateGroupKey[])
        .filter((key) => buckets[key].length > 0)
        .map((key) => ({ key, label: labels[key], items: buckets[key] }));
    },
    [todayKey, yesterdayKey, filterLabels.groupToday, filterLabels.groupYesterday, filterLabels.groupEarlier],
  );

  const lostGroups = useMemo(
    () => groupByDate(visibleLostItems, (item) => item.found_at),
    [groupByDate, visibleLostItems],
  );
  const maintenanceGroups = useMemo(
    () => groupByDate(visibleMaintenance, (report) => report.created_at),
    [groupByDate, visibleMaintenance],
  );
  const orderGroups = useMemo(
    () => groupByDate(visibleOrders, (order) => order.created_at),
    [groupByDate, visibleOrders],
  );

  const hasDateFilter = hasCustomRange || datePreset !== "all";
  const presetLabel =
    datePreset === "today"
      ? filterLabels.filterToday
      : datePreset === "7d"
        ? filterLabels.filterLast7Days
        : datePreset === "30d"
          ? filterLabels.filterLast30Days
          : null;
  const dateChipLabel = hasCustomRange ? rangeLabel : presetLabel;

  // Active (non-default) filters surfaced as quick-clear chips below the tabs.
  // Scope ("mine") is intentionally excluded here — it is now a dedicated toggle
  // switch in the filter row, not a filter-sheet option.
  const activeChips: { id: string; label: string; onClear: () => void }[] = [];
  if (statusFilter === "active" || statusFilter === "closed") {
    activeChips.push({
      id: "status",
      label: statusFilter === "active" ? filterLabels.filterActive : filterLabels.filterClosed,
      onClear: () => updateQuery({ status: null }),
    });
  }
  if (hasDateFilter && dateChipLabel) {
    activeChips.push({
      id: "date",
      label: dateChipLabel,
      onClear: () => updateQuery({ date: null, startDate: null, endDate: null }),
    });
  }
  if (selectedBuildingLabel) {
    activeChips.push({
      id: "building",
      label: selectedBuildingLabel,
      onClear: () => setBuildingFilter(null),
    });
  }
  const activeFilterCount = activeChips.length;

  function resetFilters() {
    updateQuery({
      scope: null,
      status: null,
      date: null,
      startDate: null,
      endDate: null,
      building: null,
    });
  }

  const typeTabs: { id: TypeFilter; icon: React.ReactNode; label: string }[] = [
    {
      id: "lost-found",
      icon: <Package className="size-3.5" aria-hidden="true" />,
      label: filterLabels.filterLostFound,
    },
    {
      id: "maintenance",
      icon: <Wrench className="size-3.5" aria-hidden="true" />,
      label: filterLabels.filterMaintenance,
    },
    {
      id: "order",
      icon: <ShoppingCart className="size-3.5" aria-hidden="true" />,
      label: filterLabels.filterOrder,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Type tabs (one request kind at a time) + filter trigger */}
      <div className="space-y-3">
        <div className={`${REQUEST_PANEL} grid grid-cols-3 gap-1 p-1.5`}>
          {typeTabs.map((tab) => (
            <button
              key={tab.id}
              aria-pressed={typeFilter === tab.id}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[13px] font-black transition-all",
                typeFilter === tab.id
                  ? "bg-white text-primary shadow-[0_12px_24px_-20px_rgba(31,58,95,0.45)] ring-1 ring-primary/20"
                  : "text-slate-500 hover:bg-white/60 hover:text-slate-900",
              )}
              onClick={() => updateQuery({ type: tab.id === DEFAULT_TYPE ? null : tab.id })}
              type="button"
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filter row: [필터 버튼] · [내 요청 토글] · [총 N건 카운트] */}
        <div className="flex items-center gap-2">
          <button
            ref={sheetTriggerRef}
            aria-haspopup="dialog"
            aria-expanded={filterSheetOpen}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-black shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors",
              activeFilterCount > 0
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-slate-200/80 bg-white/80 text-slate-500 hover:text-slate-900",
            )}
            onClick={() => setFilterSheetOpen(true)}
            type="button"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
            {filterLabels.filterButton}
            {activeFilterCount > 0 ? (
              <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black leading-4 text-white">
                {activeFilterCount}
              </span>
            ) : null}
          </button>

          {/* "내 요청" toggle switch — promotes scope=mine out of the filter sheet. */}
          <button
            aria-checked={scopeFilter === "mine"}
            className="inline-flex shrink-0 items-center gap-1.5"
            onClick={() => updateQuery({ scope: scopeFilter === "mine" ? null : "mine" })}
            role="switch"
            type="button"
          >
            <span
              className={cn(
                "text-[13px] font-extrabold transition-colors",
                scopeFilter === "mine" ? "text-primary" : "text-slate-500",
              )}
            >
              {typeFilter === "lost-found"
                ? filterLabels.filterScopeMine
                : filterLabels.filterScopeMineRequest}
            </span>
            <span
              className={cn(
                "relative h-[22px] w-[38px] rounded-full transition-colors",
                scopeFilter === "mine" ? "bg-primary" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-[18px] rounded-full bg-white shadow-[0_2px_5px_rgba(15,23,42,0.28)] transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  scopeFilter === "mine" ? "left-[18px]" : "left-0.5",
                )}
              />
            </span>
          </button>

          {/* Delivery calendar — order tab only (only order requests carry a delivery date). */}
          {typeFilter === "order" ? (
            <button
              aria-label={deliveryCalendarCopy.openLabel}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/[0.08] text-primary shadow-[0_10px_22px_-16px_rgba(31,58,95,0.5)] transition-colors hover:bg-primary/15 active:scale-[0.96]"
              onClick={() => setDeliveryCalOpen(true)}
              type="button"
            >
              <CalendarDays className="size-[18px]" aria-hidden="true" />
            </button>
          ) : null}

          {/* Total open count — drops as records are completed/closed. */}
          <span className="ml-auto whitespace-nowrap text-xs font-bold text-slate-500">
            {openCountPrefix}
            <b className="text-primary font-extrabold tabular-nums">{openCount}</b>
            {openCountSuffix}
          </span>
        </div>

        {/* 완료-목록 진입 행 (분실물 탭 전용) — 반환완료·폐기 내역. 필터 행이 좁아 별도 줄로 분리했다. */}
        {typeFilter === "lost-found" ? (
          <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              className="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-[#c5cdf0] bg-[#eef1fb] px-3 py-1.5 text-[13px] font-black text-[#3949ab] shadow-[0_10px_22px_-16px_rgba(57,73,171,0.55)] transition-colors hover:bg-[#e2e7f8] active:scale-[0.97]"
              href="/mobile/requests/lost-found/returned"
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              {filterLabels.returnedEntry}
              <ChevronRight className="size-3.5 text-[#3949ab]/60" aria-hidden="true" />
            </Link>
            <Link
              className="inline-flex shrink-0 items-center gap-1 rounded-full border-[1.5px] border-slate-200 bg-slate-100 px-3 py-1.5 text-[13px] font-black text-slate-600 shadow-[0_10px_22px_-16px_rgba(71,85,105,0.5)] transition-colors hover:bg-slate-200 active:scale-[0.97]"
              href="/mobile/requests/lost-found/disposed"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {filterLabels.disposedEntry}
              <ChevronRight className="size-3.5 text-slate-500/60" aria-hidden="true" />
            </Link>
          </div>
        ) : null}

        {/* Active filter chips (scope excluded — handled by the toggle above). */}
        {activeChips.length > 0 ? (
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {activeChips.map((chip) => (
              <button
                key={chip.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[12px] font-bold text-slate-700 shadow-[0_8px_18px_-18px_rgba(31,58,95,0.4)] transition-colors hover:bg-slate-50"
                onClick={chip.onClear}
                type="button"
              >
                {chip.label}
                <X className="size-3 text-muted-foreground" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <DateRangeCalendar
        labels={{
          apply: filterLabels.calendarApply,
          clear: filterLabels.calendarClear,
          close: filterLabels.calendarClose,
          selectEnd: filterLabels.calendarSelectEnd,
          selectStart: filterLabels.calendarSelectStart,
          title: filterLabels.calendarTitle,
        }}
        locale={locale}
        onApply={applyRange}
        onClear={clearRange}
        onClose={() => setCalendarOpen(false)}
        open={calendarOpen}
        value={{ endDate, startDate }}
      />

      {filterSheetOpen ? (
        <BottomSheet
          ariaLabel={filterLabels.filterButton}
          ariaLabelledBy="filter-sheet-title"
          className="flex max-h-[85dvh] flex-col"
          header={
            <p
              id="filter-sheet-title"
              className="px-1 text-[15px] font-black tracking-[-0.03em] text-slate-950"
            >
              {filterLabels.filterButton}
            </p>
          }
          onClose={() => setFilterSheetOpen(false)}
          zIndexClassName="z-[95]"
        >
          {({ close }) => (
            <div
              ref={sheetRef}
              className="flex min-h-0 flex-1 flex-col"
              onKeyDown={handleSheetKeyDown}
            >
                {/* Scrollable options area */}
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-4">
                  {/* Status */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                      {filterLabels.groupStatus}
                    </p>
                    <SegTrack>
                      <SegButton
                        active={statusFilter === "all"}
                        label={filterLabels.filterAll}
                        onClick={() => updateQuery({ status: null })}
                      />
                      <SegButton
                        active={statusFilter === "active"}
                        label={filterLabels.filterActive}
                        onClick={() => updateQuery({ status: "active" })}
                      />
                      <SegButton
                        active={statusFilter === "closed"}
                        label={filterLabels.filterClosed}
                        onClick={() => updateQuery({ status: "closed" })}
                      />
                    </SegTrack>
                  </div>

                  {/* Date */}
                  <div className="space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                      {filterLabels.groupDate}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SegTrack>
                        <SegButton
                          active={activePreset === "all"}
                          label={filterLabels.filterAll}
                          onClick={() => setDatePreset("all")}
                        />
                        <SegButton
                          active={activePreset === "today"}
                          label={filterLabels.filterToday}
                          onClick={() => setDatePreset("today")}
                        />
                        <SegButton
                          active={activePreset === "7d"}
                          label={filterLabels.filterLast7Days}
                          onClick={() => setDatePreset("7d")}
                        />
                        <SegButton
                          active={activePreset === "30d"}
                          label={filterLabels.filterLast30Days}
                          onClick={() => setDatePreset("30d")}
                        />
                      </SegTrack>
                      <button
                        aria-haspopup="dialog"
                        aria-expanded={calendarOpen}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors",
                          hasCustomRange
                            ? "border-primary/20 bg-primary/10 text-primary"
                            : "border-dashed border-border text-muted-foreground hover:border-primary/20 hover:text-foreground",
                        )}
                        onClick={() => setCalendarOpen(true)}
                        type="button"
                      >
                        <CalendarRange className="size-3.5" aria-hidden="true" />
                        {rangeLabel}
                      </button>
                      {hasCustomRange ? (
                        <button
                          aria-label={filterLabels.calendarClear}
                          className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                          onClick={clearRange}
                          type="button"
                        >
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Building */}
                  {buildingOptions.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground/70">
                        {filterLabels.building}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          aria-pressed={!selectedBuildingKey}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors",
                            !selectedBuildingKey
                              ? "bg-primary/10 text-primary"
                              : "bg-muted/50 text-muted-foreground hover:text-foreground",
                          )}
                          onClick={() => setBuildingFilter(null)}
                          type="button"
                        >
                          {filterLabels.filterAll}
                          {!selectedBuildingKey ? <Check className="size-3.5" aria-hidden="true" /> : null}
                        </button>
                        {buildingOptions.map((option) => (
                          <button
                            aria-pressed={selectedBuildingKey === option.key}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-bold transition-colors",
                              selectedBuildingKey === option.key
                                ? "bg-primary/10 text-primary"
                                : "bg-muted/50 text-muted-foreground hover:text-foreground",
                            )}
                            key={option.key}
                            onClick={() => setBuildingFilter(option.key)}
                            type="button"
                          >
                            {option.label}
                            {selectedBuildingKey === option.key ? (
                              <Check className="size-3.5" aria-hidden="true" />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Footer — action buttons */}
                <div className="flex shrink-0 items-center gap-2 border-t border-slate-100 px-1 pt-4">
                  <button
                    className="h-11 flex-1 rounded-2xl border border-border bg-surface text-sm font-bold text-slate-700 shadow-[0_8px_16px_-14px_rgba(34,40,60,0.3)] transition-colors hover:bg-muted/60 disabled:opacity-40"
                    disabled={activeFilterCount === 0}
                    onClick={resetFilters}
                    type="button"
                  >
                    {filterLabels.calendarClear}
                  </button>
                  <button
                    className="h-11 flex-1 rounded-2xl bg-primary text-sm font-black text-white shadow-[0_12px_22px_-14px_hsl(var(--primary-hsl)/0.6)] transition-colors hover:bg-primary/90"
                    onClick={close}
                    type="button"
                  >
                    {filterLabels.calendarApply}
                  </button>
                </div>
            </div>
          )}
        </BottomSheet>
      ) : null}

      {/* No results */}
      {!hasAnyResults ? (
        <Card className={`${REQUEST_CARD} p-5`}>
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 ring-1 ring-slate-200/80">
            <SlidersHorizontal className="size-5" aria-hidden="true" />
          </div>
          <p className="text-center text-sm font-bold text-slate-500">
            {filterLabels.noFilterResults}
          </p>
        </Card>
      ) : null}

      {/* Lost items list (kind is conveyed by the active tab), grouped by date */}
      {lostGroups.map((group) => (
        <div key={group.key}>
          <GroupHeader label={group.label} count={group.items.length} />
          <div className="space-y-2.5">
            {group.items.map((item) => (
              <RequestListCard
                cleaningTag={item.cleaning_session_id ? lostFoundCopy.fromCleaningTag : null}
                href={`/mobile/requests/lost-found/${item.id}${listQueryString ? `?${listQueryString}` : ""}`}
                imageUrl={item.image_urls?.[0] ?? null}
                key={item.id}
                leadingIcon={<Package className="size-5" aria-hidden="true" />}
                locationLabel={item.location.buildingLabel ?? "-"}
                memo={item.memo}
                onDelete={
                  canDeleteAny || item.reported_by_user_id === currentUserId
                    ? () => openDelete({ type: "lost-found", id: item.id, title: item.item_name })
                    : undefined
                }
                reporter={item.reporter_name || "-"}
                requestType="lost-found"
                roomLabel={item.location.roomLabel}
                statusClass={lostStatusBadgeClass[item.status]}
                statusLabel={lostFoundCopy.statusLabels[item.status]}
                time={formatDateTime(item.found_at, locale)}
                title={item.item_name}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Maintenance list, grouped by date */}
      {maintenanceGroups.map((group) => (
        <div key={group.key}>
          <GroupHeader label={group.label} count={group.items.length} />
          <div className="space-y-2.5">
            {group.items.map((report) => (
              <RequestListCard
                cleaningTag={
                  report.cleaning_session_id ? maintenanceCopy.fromCleaningTag : null
                }
                href={`/mobile/requests/maintenance/${report.id}${listQueryString ? `?${listQueryString}` : ""}`}
                imageUrl={report.image_urls?.[0] ?? null}
                key={report.id}
                leadingIcon={<Wrench className="size-5" aria-hidden="true" />}
                locationLabel={report.location.buildingLabel ?? "-"}
                memo={report.description}
                onDelete={
                  canDeleteAny || report.reported_by_user_id === currentUserId
                    ? () => openDelete({ type: "maintenance", id: report.id, title: report.issue_title })
                    : undefined
                }
                reporter={report.reporter_name || "-"}
                requestType="maintenance"
                roomLabel={report.location.roomLabel}
                statusClass={maintenanceStatusBadgeClass[report.status]}
                statusLabel={maintenanceCopy.statusLabels[report.status]}
                time={formatDateTime(report.created_at, locale)}
                title={report.issue_title}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Order requests list, grouped by date */}
      {orderGroups.map((group) => (
        <div key={group.key}>
          <GroupHeader label={group.label} count={group.items.length} />
          <div className="space-y-2.5">
            {group.items.map((order) => (
              <RequestListCard
                deliveryTag={
                  formatDeliveryDateWindow(
                    order.delivery_start_date,
                    order.delivery_end_date,
                    order.delivery_date,
                    locale,
                  )
                    ? `${orderCopy.deliveryDateShort} ${formatDeliveryDateWindow(
                      order.delivery_start_date,
                      order.delivery_end_date,
                      order.delivery_date,
                      locale,
                    )}`
                    : null
                }
                href={`/mobile/requests/orders/${order.id}${listQueryString ? `?${listQueryString}` : ""}`}
                imageUrl={
                  order.parsedItems.find((item) => item.imageUrls && item.imageUrls.length > 0)
                    ?.imageUrls?.[0] ?? null
                }
                key={order.id}
                leadingIcon={<ShoppingCart className="size-5" aria-hidden="true" />}
                locationLabel={localizePropertyName(order.building_name, buildingLabels)}
                memo={order.description}
                onDelete={
                  canDeleteAny || order.reported_by_user_id === currentUserId
                    ? () => openDelete({ type: "order", id: order.id, title: order.title || order.parsedItems[0]?.name || order.id })
                    : undefined
                }
                reporter={order.reporter_name || "-"}
                requestType="order"
                roomLabel={order.room_label}
                statusClass={orderStatusBadgeClass[order.status]}
                statusLabel={orderCopy.statusLabels[order.status]}
                time={formatDateTime(order.created_at, locale)}
                title={order.title || order.parsedItems[0]?.name || "-"}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Delete confirmation sheet ── */}
      {deleteTarget ? (
        <BottomSheet
          ariaLabel={deleteCopy.confirmTitle}
          ariaLabelledBy="delete-confirm-title"
          onClose={closeDelete}
          zIndexClassName="z-[200]"
          header={
            <div className="flex flex-col items-center gap-3 px-1 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-red-50 text-red-500 ring-1 ring-red-200/70">
                <AlertTriangle className="size-7" aria-hidden="true" />
              </div>
              <div>
                <h3
                  className="text-lg font-black tracking-tight text-foreground"
                  id="delete-confirm-title"
                >
                  {deleteCopy.confirmTitle}
                </h3>
                <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
                  {deleteCopy.confirmBody}
                </p>
              </div>
              <div className="w-full rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5">
                <p className="truncate text-sm font-black text-foreground">
                  {deleteTarget.title}
                </p>
              </div>
            </div>
          }
        >
          {({ close }) => (
            <div className="px-1 pt-4">
              {deleteError ? (
                <p className="mb-3 text-center text-xs font-semibold text-destructive">
                  {deleteError}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-background/70 text-sm font-bold text-foreground transition-colors hover:bg-muted/70 disabled:opacity-40"
                  disabled={isDeleting}
                  onClick={close}
                  type="button"
                >
                  {deleteCopy.cancel}
                </button>
                <button
                  className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-red-500 text-sm font-black text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  type="button"
                >
                  {isDeleting ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                  {deleteCopy.deleteAction}
                </button>
              </div>
            </div>
          )}
        </BottomSheet>
      ) : null}

      {deliveryCalOpen ? (
        <OrderDeliveryCalendar
          buildingLabels={buildingLabels}
          copy={{
            title: deliveryCalendarCopy.title,
            empty: deliveryCalendarCopy.empty,
            dayEmpty: deliveryCalendarCopy.dayEmpty,
            today: deliveryCalendarCopy.today,
            close: deliveryCalendarCopy.close,
            countTemplate: deliveryCalendarCopy.countTemplate,
            rangeLabel: deliveryCalendarCopy.rangeLabel,
          }}
          locale={locale}
          onClose={() => setDeliveryCalOpen(false)}
          onOpenOrder={(id) => {
            setDeliveryCalOpen(false);
            router.push(`/mobile/requests/orders/${id}`);
          }}
          orders={deliveryCalendarOrders}
          statusLabels={orderCopy.statusLabels}
        />
      ) : null}
    </div>
  );
}
