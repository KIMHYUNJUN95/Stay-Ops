"use server";

import { requireAdminSession } from "@/lib/admin-session";
import { buildAdminExportMeta, type AdminExportMeta } from "@/lib/admin-export-meta";
import type { AdminReportExportResult, AdminWorkbookExportResult } from "@/lib/admin-export-result";
import { buildAdminTableReportHtml } from "@/lib/admin-table-report";
import { buildAdminTableWorkbookBase64, type AdminTableSheet } from "@/lib/admin-table-workbook";
import { getDictionary } from "@/lib/i18n";
import { canAccessOpsAdmin } from "@/lib/ops-admin";
import { changePct } from "@/lib/ops-revenue";

// 공용 계약(CLAUDE.md §4b): 버튼은 <AdminExportButtons>, 워크북은 buildAdminTableWorkbookBase64,
// 인쇄본은 buildAdminTableReportHtml — 같은 입력 형태. 로케일은 서버가 세션에서 정한다.
// 숫자는 화면이 합계에 넣은 건물 기준으로 넘기고(화면과 같은 숫자), 글자 모양은 여기서 만든다.

export type OpsRevenueExportRow = {
  name: string;
  revenue: number;
  previous: number;
  occupancyPct: number | null;
  adr: number | null;
  revpar: number | null;
  commission: number;
  net: number;
};

export type OpsRevenueExportPayload = {
  rangeLabel: string;
  rows: OpsRevenueExportRow[];
  total: OpsRevenueExportRow;
  /** 「건물 × 월」 시트 — 머리 글자와 건물마다 달별 매출. */
  monthLabels: string[];
  monthly: Array<{ name: string; values: Array<number | null> }>;
};

const yen = (value: number, localeTag: string) => `¥${Math.round(value).toLocaleString(localeTag)}`;

function sheetsOf(payload: OpsRevenueExportPayload, meta: AdminExportMeta): AdminTableSheet[] {
  const t = getDictionary(meta.locale).opsRevenue;
  const tag = meta.localeTag;
  const pct = (value: number | null) => (value === null ? "—" : `${value.toFixed(1)}%`);
  const money = (value: number | null) => (value === null ? "—" : yen(value, tag));
  const change = (row: OpsRevenueExportRow) => {
    const delta = changePct(row.revenue, row.previous);
    return delta === null ? t.newLabel : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}%`;
  };
  const line = (row: OpsRevenueExportRow) => ({
    adr: money(row.adr),
    change: change(row),
    commission: yen(row.commission, tag),
    name: row.name,
    net: yen(row.net, tag),
    occupancy: pct(row.occupancyPct),
    previous: row.previous > 0 ? yen(row.previous, tag) : "—",
    revenue: yen(row.revenue, tag),
    revpar: money(row.revpar),
  });
  const totalLine = line(payload.total);

  const monthColumns = payload.monthLabels.map((label, index) => ({
    bold: true,
    key: `m${index}`,
    label,
    printWidth: Math.floor(80 / Math.max(1, payload.monthLabels.length)),
    width: 12,
  }));

  return [
    {
      colNoLabel: meta.shared.colNo,
      columns: [
        { key: "name", label: t.colProperty, printWidth: 16, width: 22, bold: true },
        { key: "revenue", label: t.colRevenue, printWidth: 12, width: 15, bold: true },
        { key: "previous", label: t.colLastYear, printWidth: 12, width: 15 },
        { key: "change", label: t.colChange, printWidth: 8, width: 10 },
        { key: "occupancy", label: t.colOccupancy, printWidth: 8, width: 10 },
        { key: "adr", label: t.colAdr, printWidth: 10, width: 12 },
        { key: "revpar", label: t.colRevpar, printWidth: 10, width: 12 },
        { key: "commission", label: t.colCommission, printWidth: 11, width: 14 },
        { key: "net", label: t.colNet, printWidth: 13, width: 15, bold: true },
      ],
      rangeLabel: payload.rangeLabel,
      rows: payload.rows.map(line),
      sheetName: t.sheetProperties,
      title: `${t.title} · ${t.sheetProperties}`,
      totalLabel: meta.shared.exportTotalLabel,
      totals: { ...totalLine, name: "" },
    },
    {
      colNoLabel: meta.shared.colNo,
      columns: [{ key: "name", label: t.colProperty, printWidth: 20, width: 20, bold: true }, ...monthColumns],
      rangeLabel: payload.rangeLabel,
      rows: payload.monthly.map((row) => ({
        name: row.name,
        ...Object.fromEntries(row.values.map((value, index) => [`m${index}`, value === null ? "—" : yen(value, tag)])),
      })),
      sheetName: t.sheetMonthly,
      title: `${t.title} · ${t.sheetMonthly}`,
      totalLabel: meta.shared.exportTotalLabel,
    },
  ];
}

async function requireRevenueExport() {
  const session = await requireAdminSession();
  return canAccessOpsAdmin(session) ? session : null;
}

export async function exportOpsRevenueWorkbook(payload: OpsRevenueExportPayload): Promise<AdminWorkbookExportResult> {
  const session = await requireRevenueExport();
  if (!session) return { ok: false, reason: "error" };
  if (payload.rows.length === 0) return { ok: false, reason: "empty" };
  try {
    const meta = buildAdminExportMeta(session);
    const base64 = await buildAdminTableWorkbookBase64({
      generatedLabel: meta.generatedLabel,
      orgName: meta.orgName,
      sheets: sheetsOf(payload, meta),
    });
    return {
      base64,
      filename: `revenue_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`,
      ok: true,
      rowCount: payload.rows.length,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function exportOpsRevenueReport(payload: OpsRevenueExportPayload): Promise<AdminReportExportResult> {
  const session = await requireRevenueExport();
  if (!session) return { ok: false, reason: "error" };
  if (payload.rows.length === 0) return { ok: false, reason: "empty" };
  try {
    const meta = buildAdminExportMeta(session);
    const html = buildAdminTableReportHtml({
      generatedLabel: meta.generatedLabel,
      localeTag: meta.localeTag,
      orgName: meta.orgName,
      printLabel: meta.shared.exportPrint,
      sheets: sheetsOf(payload, meta),
    });
    return { html, ok: true, rowCount: payload.rows.length };
  } catch {
    return { ok: false, reason: "error" };
  }
}
