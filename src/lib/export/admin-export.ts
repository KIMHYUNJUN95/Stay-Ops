import {
  formatDuration,
  getOrgCleaningSessionsFiltered,
  isCleaningTaskKey,
} from "@/lib/cleaning";
import { parseCleaningExportFilters } from "@/lib/export/cleaning-filters";
import { getAdminReservationsForExport } from "@/lib/export/admin-reservations";
import { buildCsv } from "@/lib/export/csv";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import { getOrgLostItems, lostItemStatuses, type LostItemStatus } from "@/lib/lost-found";
import {
  getOrgMaintenanceReports,
  maintenanceStatuses,
  type MaintenanceStatus,
} from "@/lib/maintenance-reports";
import {
  getOrgOrderRequests,
  orderRequestStatuses,
  parseOrderItems,
  type OrderRequestStatus,
} from "@/lib/order-requests";
import { parseRequestDateRange } from "@/lib/request-filters";
import { resolveRequestLocation } from "@/lib/request-location";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
import type { AppSession } from "@/lib/session";

export const adminExportResources = [
  "reservations",
  "cleaning",
  "maintenance",
  "lost-found",
  "orders",
] as const;

export type AdminExportResource = (typeof adminExportResources)[number];

export function isAdminExportResource(value: string): value is AdminExportResource {
  return (adminExportResources as readonly string[]).includes(value);
}

function localizeProperty(
  propertyName: string,
  buildingLabels: Dictionary["cleaning"]["buildingLabels"],
) {
  const keyMap: Record<string, keyof Dictionary["cleaning"]["buildingLabels"]> = {
    아라키초A: "arakicho_a",
    아라키초B: "arakicho_b",
    가부키초: "kabukicho",
    다카다노바바: "takadanobaba",
    오쿠보A: "okubo_a",
    오쿠보B: "okubo_b",
    오쿠보C: "okubo_c",
  };
  const key = keyMap[propertyName];
  return key ? (buildingLabels[key] ?? propertyName) : propertyName;
}

function formatDateTime(value: string | null, locale: Locale) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function formatTime(value: string | null, locale: Locale) {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

function parseMaintenanceStatus(value: string | null): MaintenanceStatus | undefined {
  return maintenanceStatuses.includes(value as MaintenanceStatus)
    ? (value as MaintenanceStatus)
    : undefined;
}

function parseLostItemStatus(value: string | null): LostItemStatus | undefined {
  return lostItemStatuses.includes(value as LostItemStatus)
    ? (value as LostItemStatus)
    : undefined;
}

function parseOrderStatus(value: string | null): OrderRequestStatus | undefined {
  return orderRequestStatuses.includes(value as OrderRequestStatus)
    ? (value as OrderRequestStatus)
    : undefined;
}

function summarizeOrderItems(items: ReturnType<typeof parseOrderItems>) {
  return items
    .map((item) => `${item.name} x${item.quantity}`)
    .join("; ");
}

export async function buildAdminExportCsv(
  session: AppSession,
  resource: AdminExportResource,
  searchParams: URLSearchParams,
): Promise<{ csv: string; filename: string } | { error: string; status: number }> {
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const buildingLabels = dictionary.cleaning.buildingLabels;
  const stamp = new Date().toISOString().slice(0, 10);

  if (resource === "reservations") {
    const result = await getAdminReservationsForExport(session, {
      month: searchParams.get("month") ?? undefined,
      property: searchParams.get("property") ?? undefined,
    });
    if (result.isOutOfWindow) {
      return { error: "out_of_window", status: 400 };
    }
    const statusLabels = dictionary.admin.reservationStatusLabels;
    const headers = [
      dictionary.admin.calendar.room,
      dictionary.cleaning.manualBuildingLabel,
      dictionary.admin.calendar.checkIn,
      dictionary.admin.calendar.checkOut,
      dictionary.admin.calendar.guestName,
      dictionary.common.status,
    ];
    const rows = result.rows.map((row) => [
      row.roomLabel,
      localizeProperty(row.propertyName, buildingLabels),
      row.checkInDate,
      row.checkOutDate,
      row.guestName,
      statusLabels[row.status],
    ]);
    const propertySuffix = result.property ? `-${result.property}` : "";
    return {
      csv: buildCsv(headers, rows),
      filename: `stayops-reservations-${result.month}${propertySuffix}.csv`,
    };
  }

  if (resource === "cleaning") {
    const cleaningFilters = parseCleaningExportFilters({
      date: searchParams.get("date") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      staff: searchParams.get("staff") ?? undefined,
      property: searchParams.get("property") ?? undefined,
    });
    const roomCatalog = await getActiveRoomCatalogServer(session.organization.id).catch(
      () => undefined,
    );
    const sessions = await getOrgCleaningSessionsFiltered(
      session,
      cleaningFilters,
      roomCatalog,
    );
    const copy = dictionary.cleaning;
    const headers = [
      dictionary.common.exportWorkDate,
      dictionary.cleaning.manualBuildingLabel,
      copy.room,
      copy.task,
      copy.staff,
      copy.status,
      copy.startedAt,
      copy.duration,
    ];
    const rows = sessions.map((item) => {
      const location = resolveRequestLocation(
        item.room_label,
        roomCatalog,
        buildingLabels,
      );
      return [
        item.cleaning_date,
        location.buildingLabel ?? "",
        location.roomLabel,
        isCleaningTaskKey(item.task_label) ? copy.taskOptions[item.task_label] : item.task_label,
        item.staff_name,
        copy.statusLabels[item.status],
        formatTime(item.started_at, locale),
        formatDuration(item.duration_seconds),
      ];
    });
    const rangeSuffix =
      cleaningFilters.startDate === cleaningFilters.endDate
        ? cleaningFilters.startDate
        : `${cleaningFilters.startDate}_${cleaningFilters.endDate}`;
    const filterSuffix = [
      cleaningFilters.propertyName ? `-${cleaningFilters.propertyName}` : "",
      cleaningFilters.staffUserId ? "-staff" : "",
      cleaningFilters.status ? `-${cleaningFilters.status}` : "",
    ].join("");
    return {
      csv: buildCsv(headers, rows),
      filename: `stayops-cleaning-${rangeSuffix}${filterSuffix}.csv`,
    };
  }

  const dateRange = parseRequestDateRange({
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
  });
  const roomCatalog = await getActiveRoomCatalogServer(session.organization.id).catch(
    () => undefined,
  );

  if (resource === "maintenance") {
    const copy = dictionary.maintenance;
    const status = parseMaintenanceStatus(searchParams.get("status"));
    const reports = await getOrgMaintenanceReports(session, { ...dateRange, status });
    const headers = [
      dictionary.cleaning.manualBuildingLabel,
      copy.room,
      copy.issueTitle,
      copy.statusLabel,
      copy.reporter,
      copy.reportedAt,
    ];
    const rows = reports.map((report) => {
      const location = resolveRequestLocation(
        report.room_label,
        roomCatalog,
        buildingLabels,
      );
      return [
        location.buildingLabel ?? "",
        location.roomLabel,
        report.issue_title,
        copy.statusLabels[report.status],
        report.reporter_name,
        formatDateTime(report.created_at, locale),
      ];
    });
    return {
      csv: buildCsv(headers, rows),
      filename: `stayops-maintenance-${stamp}.csv`,
    };
  }

  if (resource === "lost-found") {
    const copy = dictionary.lostFound;
    const status = parseLostItemStatus(searchParams.get("status"));
    const items = await getOrgLostItems(session, { ...dateRange, status });
    const headers = [
      dictionary.cleaning.manualBuildingLabel,
      copy.room,
      copy.itemName,
      copy.statusLabel,
      copy.reporter,
      copy.foundAt,
    ];
    const rows = items.map((item) => {
      const location = resolveRequestLocation(item.room_label, roomCatalog, buildingLabels);
      return [
        location.buildingLabel ?? "",
        location.roomLabel,
        item.item_name,
        copy.statusLabels[item.status],
        item.reporter_name,
        formatDateTime(item.found_at, locale),
      ];
    });
    return {
      csv: buildCsv(headers, rows),
      filename: `stayops-lost-found-${stamp}.csv`,
    };
  }

  const orderCopy = dictionary.mobile.orderForm;
  const detail = dictionary.mobile.orderDetail;
  const status = parseOrderStatus(searchParams.get("status"));
  const orders = await getOrgOrderRequests(session, { ...dateRange, status });
  const headers = [
    dictionary.cleaning.manualBuildingLabel,
    detail.locationTitle,
    detail.title,
    dictionary.common.status,
    orderCopy.urgency,
    detail.requesterTitle,
    detail.createdLabel,
    orderCopy.itemsTitle,
  ];
  const rows = orders.map((order) => {
    const location = resolveRequestLocation(order.room_label, roomCatalog, buildingLabels);
    const items = parseOrderItems(order.items);
    const urgencyLabel =
      order.urgency === "high" ? orderCopy.urgencyHigh : orderCopy.urgencyNormal;
    return [
      location.buildingLabel ?? order.building_name,
      location.roomLabel,
      order.title,
      dictionary.mobile.orderStatusLabels[order.status],
      urgencyLabel,
      order.reporter_name,
      formatDateTime(order.created_at, locale),
      summarizeOrderItems(items),
    ];
  });
  return {
    csv: buildCsv(headers, rows),
    filename: `stayops-orders-${stamp}.csv`,
  };
}
