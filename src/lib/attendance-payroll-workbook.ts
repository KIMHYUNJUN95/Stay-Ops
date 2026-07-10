import "server-only";

import ExcelJS from "exceljs";
import type { AdminPayrollRow } from "@/lib/admin-attendance";

// Localized, print-quality native .xlsx payroll workbook (built with exceljs).
//
// Designed as a practical accounting sheet: plain grid, compact rows, strong cell borders, and up to
// 50 staff rows like a spreadsheet template rather than a styled report. Returned as base64 for the
// server action to hand to the browser.
// All visible strings arrive already localized (ko/ja/en) from the caller.

export type PayrollWorkbookLabels = {
  title: string;
  monthLabel: string;
  orgName: string;
  generatedLabel: string; // "생성일시 · 2026-07-02 15:40"
  statusEstimated: string;
  statusFinalized: string;
  colNo: string;
  colName: string;
  colRate: string;
  colHours: string;
  colWorkDays: string;
  colBaseWage: string;
  colAllowance: string;
  colSpecialAllowance: string;
  colTransport: string;
  colTotalWithTransport: string;
  totalLabel: string;
};

export type PayrollWorkbookRow = AdminPayrollRow & {
  transportTotal: number;
  totalWithTransport: number;
};

// Shared accounting-template palette + border helper — reused by other admin attendance workbook
// builders (e.g. attendance-transport-workbook.ts) so every exported .xlsx in this console looks
// like one consistent template rather than diverging per feature.
export const WORKBOOK_TITLE_FILL = "FFB6D7A8";
export const WORKBOOK_HEADER_FILL = "FFD9EAD3";
export const WORKBOOK_TOTAL_FILL = "FFE2F0D9";
export const WORKBOOK_INK = "FF000000";
export const WORKBOOK_LINE = "FF000000";
export const WORKBOOK_DASH = "—";

const TITLE_FILL = WORKBOOK_TITLE_FILL;
const HEADER_FILL = WORKBOOK_HEADER_FILL;
const TOTAL_FILL = WORKBOOK_TOTAL_FILL;
const INK = WORKBOOK_INK;
const DASH = WORKBOOK_DASH;
const TEMPLATE_ROWS = 50;

function hoursLabel(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export const workbookThinBorder = { style: "thin" as const, color: { argb: WORKBOOK_LINE } };
export function workbookBox() {
  return {
    top: workbookThinBorder,
    bottom: workbookThinBorder,
    left: workbookThinBorder,
    right: workbookThinBorder,
  };
}

function box() {
  return workbookBox();
}

function moneyFont() {
  return { name: "Meiryo", size: 9, bold: true, color: { argb: INK } };
}

export async function buildPayrollWorkbookBase64(
  rows: PayrollWorkbookRow[],
  labels: PayrollWorkbookLabels,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StayOps";
  wb.created = new Date();

  const ws = wb.addWorksheet(labels.monthLabel.slice(0, 31), {
    views: [{ showGridLines: true }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  ws.properties.defaultRowHeight = 18;
  ws.pageSetup.printArea = `A1:J${TEMPLATE_ROWS + 4}`;

  // Compact payroll ledger layout. Base wage, extra allowance (추가수당), special allowance (특별수당),
  // and transport are kept in separate columns so they never blend; the final column sums all four.
  const cols: { width: number; align: "center"; numFmt?: string }[] = [
    { width: 6, align: "center" }, // No
    { width: 22, align: "center" }, // name
    { width: 10, align: "center", numFmt: "0" }, // work days
    { width: 14, align: "center" }, // hours
    { width: 11, align: "center", numFmt: "¥#,##0" }, // rate
    { width: 15, align: "center", numFmt: "¥#,##0" }, // base wage
    { width: 14, align: "center", numFmt: "¥#,##0" }, // extra allowance (추가수당)
    { width: 14, align: "center", numFmt: "¥#,##0" }, // special allowance (특별수당)
    { width: 14, align: "center", numFmt: "¥#,##0" }, // transport
    { width: 20, align: "center", numFmt: "¥#,##0" }, // total (base + allowances + transport)
  ];
  ws.columns = cols.map((c) => ({ width: c.width }));
  const LAST = cols.length;

  // ── Plain workbook title ──
  ws.mergeCells(1, 1, 1, LAST);
  const t = ws.getCell("A1");
  t.value = `${labels.monthLabel} ${labels.title}`;
  t.font = { name: "Meiryo", bold: true, size: 12, color: { argb: INK } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  t.border = box();
  ws.getRow(1).height = 22;

  // ── Header (row 2) ──
  const headerLabels = [
    labels.colNo,
    labels.colName,
    labels.colWorkDays,
    labels.colHours,
    labels.colRate,
    labels.colBaseWage,
    labels.colAllowance,
    labels.colSpecialAllowance,
    labels.colTransport,
    labels.colTotalWithTransport,
  ];
  const header = ws.getRow(2);
  header.height = 22;
  headerLabels.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = {
      name: "Meiryo",
      bold: true,
      color: { argb: INK },
      size: 9,
    };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
    cell.border = box();
  });

  // ── Data rows ──
  const firstDataRow = 3;
  const templateRows = Math.max(TEMPLATE_ROWS, rows.length);
  for (let i = 0; i < templateRows; i++) {
    const r = rows[i];
    const row = ws.getRow(firstDataRow + i);
    row.height = 18;
    const rate: string | number = r && r.primaryRate > 0 ? r.primaryRate : r ? DASH : "";
    const baseWage: string | number = r ? (r.baseGross > 0 ? r.baseGross : 0) : "";
    const allowance: string | number =
      r ? (r.allowanceRegularTotal > 0 ? r.allowanceRegularTotal : 0) : "";
    const specialAllowance: string | number =
      r ? (r.allowanceSpecialTotal > 0 ? r.allowanceSpecialTotal : 0) : "";
    const transport: string | number = r ? (r.transportTotal > 0 ? r.transportTotal : 0) : "";
    const totalWithTransport: string | number =
      r ? (r.totalWithTransport > 0 ? r.totalWithTransport : 0) : "";
    const values: (string | number)[] = [
      r ? i + 1 : "",
      r?.userName ?? "",
      r?.workDays ?? "",
      r ? hoursLabel(r.totalPaidMinutes) : "",
      rate,
      baseWage,
      allowance,
      specialAllowance,
      transport,
      totalWithTransport,
    ];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = ci >= 4 ? moneyFont() : { name: "Meiryo", size: 9, color: { argb: INK } };
      cell.border = box();
      cell.alignment = { vertical: "middle", horizontal: cols[ci].align };
      if (cols[ci].numFmt && typeof v === "number") cell.numFmt = cols[ci].numFmt!;
    });
  }

  // ── Totals row ──
  const lastDataRow = firstDataRow + templateRows - 1;
  const totalRowIdx = lastDataRow + 1;
  const total = ws.getRow(totalRowIdx);
  total.height = 20;
  const totalMinutes = rows.reduce((sum, r) => sum + r.totalPaidMinutes, 0);
  total.getCell(2).value = labels.totalLabel;
  total.getCell(3).value = { formula: `SUM(C${firstDataRow}:C${lastDataRow})` };
  total.getCell(4).value = hoursLabel(totalMinutes);
  total.getCell(6).value = { formula: `SUM(F${firstDataRow}:F${lastDataRow})` };
  total.getCell(7).value = { formula: `SUM(G${firstDataRow}:G${lastDataRow})` };
  total.getCell(8).value = { formula: `SUM(H${firstDataRow}:H${lastDataRow})` };
  total.getCell(9).value = { formula: `SUM(I${firstDataRow}:I${lastDataRow})` };
  total.getCell(10).value = { formula: `SUM(J${firstDataRow}:J${lastDataRow})` };
  total.getCell(3).numFmt = "0";
  total.getCell(6).numFmt = "¥#,##0";
  total.getCell(7).numFmt = "¥#,##0";
  total.getCell(8).numFmt = "¥#,##0";
  total.getCell(9).numFmt = "¥#,##0";
  total.getCell(10).numFmt = "¥#,##0";
  for (let ci = 1; ci <= LAST; ci++) {
    const cell = total.getCell(ci);
    cell.font = ci >= 6 ? moneyFont() : { name: "Meiryo", bold: true, size: 9, color: { argb: INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
    cell.alignment = { vertical: "middle", horizontal: cols[ci - 1].align };
    cell.border = box();
  }

  ws.getCell(`A${totalRowIdx + 2}`).value = `${labels.orgName} / ${labels.generatedLabel}`;
  ws.getCell(`A${totalRowIdx + 2}`).font = { name: "Meiryo", size: 8, color: { argb: INK } };
  ws.getCell(`A${totalRowIdx + 2}`).alignment = { vertical: "middle", horizontal: "center" };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
