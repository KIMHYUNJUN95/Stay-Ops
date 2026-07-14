"use server";

import { redirect } from "next/navigation";
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
import { getOrgLostItems, lostItemStatuses, type LostItemStatus } from "@/lib/lost-found";
import { parseRequestDateRange } from "@/lib/request-filters";
import { resolveRequestLocation } from "@/lib/request-location";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function isValidUUID(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isValidStatus(value: string): value is LostItemStatus {
  return (lostItemStatuses as readonly string[]).includes(value);
}

export async function updateLostItemStatus(formData: FormData) {
  const session = await requireAdminSession();

  const itemId = String(formData.get("itemId") ?? "").trim();
  const newStatus = String(formData.get("status") ?? "").trim();

  if (!isValidUUID(itemId)) {
    redirect("/admin/lost-found?error=not_found");
  }
  if (!isValidStatus(newStatus)) {
    redirect(`/admin/lost-found/${itemId}?error=status_update_failed`);
  }

  const supabase = await getSupabaseServerClient();

  // Confirm the record belongs to this org before updating (defense-in-depth; RLS also guards).
  const { data: existing } = await supabase
    .from("lost_items")
    .select("id")
    .eq("id", itemId)
    .eq("organization_id", session.organization.id)
    .maybeSingle();

  if (!existing) {
    redirect(`/admin/lost-found?error=not_found`);
  }

  const { error } = await supabase
    .from("lost_items")
    .update({ status: newStatus } as never)
    .eq("id", itemId)
    .eq("organization_id", session.organization.id);

  if (error) {
    redirect(`/admin/lost-found/${itemId}?error=status_update_failed`);
  }

  redirect(`/admin/lost-found/${itemId}?statusUpdated=1`);
}

export async function deleteLostItemById(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireAdminSession();

  if (!isValidUUID(id)) {
    return { ok: false, error: "not_found" };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("lost_items")
    .delete()
    .eq("id", id)
    .eq("organization_id", session.organization.id)
    .select("id");

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("permission") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: false, error: "delete_failed" };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "not_found" };
  }

  return { ok: true };
}

// ── Excel / PDF 내보내기 ───────────────────────────────────────────────────
// Replaced the old CSV download on 2026-07-14. The client sends only the current filter values —
// never rows — and this action re-queries the list server-side, so the file always matches exactly
// what the filtered screen shows. Rendering goes through the canonical admin table exporters
// (src/lib/admin-table-workbook.ts / admin-table-report.ts) shared by every /admin/* export.
// See docs/product/09-lost-found-workflow.md.

export type LostFoundExportFilters = {
  startDate?: string;
  endDate?: string;
  status?: string;
};

function rangeSuffix(filters: LostFoundExportFilters): string {
  const parts = [filters.startDate, filters.endDate]
    .filter((v): v is string => Boolean(v))
    .map(compactRangePart);
  return parts.length ? `_${parts.join("_")}` : "";
}

async function buildLostFoundSheet(
  session: AppSession,
  filters: LostFoundExportFilters,
  meta: AdminExportMeta,
): Promise<AdminTableSheet> {
  const dictionary = getDictionary(meta.locale);
  const copy = dictionary.lostFound;
  const dateRange = parseRequestDateRange(filters);
  const status = isValidStatus(filters.status ?? "") ? (filters.status as LostItemStatus) : undefined;

  const [items, roomCatalog] = await Promise.all([
    getOrgLostItems(session, { ...dateRange, status }),
    getActiveRoomCatalogServer(session.organization.id).catch(() => undefined),
  ]);

  const columns: AdminTableColumn[] = [
    { key: "building", label: dictionary.cleaning.manualBuildingLabel, width: 16, printWidth: 16 },
    { key: "room", label: copy.room, width: 12, printWidth: 11 },
    { key: "item", label: copy.itemName, width: 28, printWidth: 24, wrap: true },
    { key: "status", label: copy.statusLabel, width: 14, printWidth: 13 },
    { key: "reporter", label: copy.reporter, width: 16, printWidth: 14 },
    { key: "foundAt", label: copy.foundAt, width: 18, printWidth: 18 },
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

  return {
    sheetName: copy.adminTitle,
    title: copy.adminTitle,
    rangeLabel:
      dateRange.startDate && dateRange.endDate
        ? `${dateRange.startDate} – ${dateRange.endDate}`
        : undefined,
    colNoLabel: meta.shared.colNo,
    totalLabel: meta.shared.exportTotalLabel,
    columns,
    rows: items.map((item) => {
      const location = resolveRequestLocation(
        item.room_label,
        roomCatalog,
        dictionary.cleaning.buildingLabels,
      );
      return {
        building: location.buildingLabel ?? "",
        room: location.roomLabel,
        item: item.item_name,
        status: copy.statusLabels[item.status],
        reporter: item.reporter_name,
        foundAt: formatter.format(new Date(item.found_at)),
      };
    }),
  };
}

export async function exportLostFoundWorkbook(
  filters: LostFoundExportFilters,
): Promise<AdminWorkbookExportResult> {
  const session = await requireAdminSession();
  try {
    const meta = buildAdminExportMeta(session);
    const sheet = await buildLostFoundSheet(session, filters, meta);
    if (sheet.rows.length === 0) return { ok: false, reason: "empty" };

    const base64 = await buildAdminTableWorkbookBase64({
      orgName: meta.orgName,
      generatedLabel: meta.generatedLabel,
      sheets: [sheet],
    });
    return {
      ok: true,
      filename: `lost-found${rangeSuffix(filters)}.xlsx`,
      base64,
      rowCount: sheet.rows.length,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function exportLostFoundReport(
  filters: LostFoundExportFilters,
): Promise<AdminReportExportResult> {
  const session = await requireAdminSession();
  try {
    const meta = buildAdminExportMeta(session);
    const sheet = await buildLostFoundSheet(session, filters, meta);
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
