"use server";

import { adminNavigation, getNavigationLabel } from "@/config/navigation";
import { requireAdminSession } from "@/lib/admin-session";
import { buildAdminExportMeta, compactRangePart, type AdminExportMeta } from "@/lib/admin-export-meta";
import type { AdminReportExportResult, AdminWorkbookExportResult } from "@/lib/admin-export-result";
import { buildAdminTableReportHtml } from "@/lib/admin-table-report";
import {
  buildAdminTableWorkbookBase64,
  type AdminTableColumn,
  type AdminTableSheet,
} from "@/lib/admin-table-workbook";
import { getDictionary } from "@/lib/i18n";
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

// Excel / PDF 내보내기 for 주문·비품. Replaced the old CSV download on 2026-07-14 — the client sends
// only the current filter values and this action re-queries the list server-side, so the file always
// matches exactly what the filtered screen shows. Rendering goes through the canonical admin table
// exporters (src/lib/admin-table-workbook.ts / admin-table-report.ts) shared by every /admin/* export.
// See docs/product/10-order-request-workflow.md.

export type OrdersExportFilters = {
  startDate?: string;
  endDate?: string;
  status?: string;
};

function parseStatus(value: string | undefined): OrderRequestStatus | undefined {
  return (orderRequestStatuses as readonly string[]).includes(value ?? "")
    ? (value as OrderRequestStatus)
    : undefined;
}

function rangeSuffix(filters: OrdersExportFilters): string {
  const parts = [filters.startDate, filters.endDate]
    .filter((v): v is string => Boolean(v))
    .map(compactRangePart);
  return parts.length ? `_${parts.join("_")}` : "";
}

async function buildOrdersSheet(
  session: AppSession,
  filters: OrdersExportFilters,
  meta: AdminExportMeta,
): Promise<AdminTableSheet> {
  const dictionary = getDictionary(meta.locale);
  const form = dictionary.mobile.orderForm;
  const detail = dictionary.mobile.orderDetail;
  const dateRange = parseRequestDateRange(filters);
  const status = parseStatus(filters.status);

  const [orders, roomCatalog] = await Promise.all([
    getOrgOrderRequests(session, { ...dateRange, status }),
    getActiveRoomCatalogServer(session.organization.id).catch(() => undefined),
  ]);

  const columns: AdminTableColumn[] = [
    { key: "building", label: dictionary.cleaning.manualBuildingLabel, width: 15, printWidth: 12 },
    { key: "location", label: detail.locationTitle, width: 12, printWidth: 9 },
    { key: "title", label: detail.title, width: 24, printWidth: 17, wrap: true },
    { key: "status", label: dictionary.common.status, width: 13, printWidth: 10 },
    { key: "urgency", label: form.urgency, width: 10, printWidth: 8 },
    { key: "requester", label: detail.requesterTitle, width: 15, printWidth: 11 },
    { key: "createdAt", label: detail.createdLabel, width: 18, printWidth: 14 },
    { key: "items", label: form.itemsTitle, width: 34, printWidth: 15, wrap: true },
  ];

  const formatter = new Intl.DateTimeFormat(meta.localeTag, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const navItem = adminNavigation.find((item) => item.id === "orders");
  const title = navItem
    ? getNavigationLabel(navItem, meta.locale)
    : dictionary.mobile.quickActions.order;

  return {
    sheetName: title,
    title,
    rangeLabel:
      dateRange.startDate && dateRange.endDate
        ? `${dateRange.startDate} – ${dateRange.endDate}`
        : undefined,
    colNoLabel: meta.shared.colNo,
    totalLabel: meta.shared.exportTotalLabel,
    columns,
    rows: orders.map((order) => {
      const location = resolveRequestLocation(
        order.room_label,
        roomCatalog,
        dictionary.cleaning.buildingLabels,
      );
      const items = parseOrderItems(order.items);
      return {
        building: location.buildingLabel ?? order.building_name,
        location: location.roomLabel,
        title: order.title,
        status: dictionary.mobile.orderStatusLabels[order.status],
        urgency: order.urgency === "high" ? form.urgencyHigh : form.urgencyNormal,
        requester: order.reporter_name,
        createdAt: formatter.format(new Date(order.created_at)),
        items: items.map((item) => `${item.name} x${item.quantity}`).join("; "),
      };
    }),
  };
}

export async function exportOrdersWorkbook(
  filters: OrdersExportFilters,
): Promise<AdminWorkbookExportResult> {
  const session = await requireAdminSession();
  try {
    const meta = buildAdminExportMeta(session);
    const sheet = await buildOrdersSheet(session, filters, meta);
    if (sheet.rows.length === 0) return { ok: false, reason: "empty" };

    const base64 = await buildAdminTableWorkbookBase64({
      orgName: meta.orgName,
      generatedLabel: meta.generatedLabel,
      sheets: [sheet],
    });
    return {
      ok: true,
      filename: `orders${rangeSuffix(filters)}.xlsx`,
      base64,
      rowCount: sheet.rows.length,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function exportOrdersReport(
  filters: OrdersExportFilters,
): Promise<AdminReportExportResult> {
  const session = await requireAdminSession();
  try {
    const meta = buildAdminExportMeta(session);
    const sheet = await buildOrdersSheet(session, filters, meta);
    if (sheet.rows.length === 0) return { ok: false, reason: "empty" };

    const html = buildAdminTableReportHtml({
      orgName: meta.orgName,
      generatedLabel: meta.generatedLabel,
      printLabel: meta.shared.exportPrint,
      localeTag: meta.localeTag,
      sheets: [sheet],
    });
    return { ok: true, html, rowCount: sheet.rows.length };
  } catch {
    return { ok: false, reason: "error" };
  }
}
