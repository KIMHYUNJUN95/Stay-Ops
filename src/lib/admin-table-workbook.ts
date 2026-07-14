import "server-only";

import ExcelJS from "exceljs";
import {
  WORKBOOK_DASH,
  WORKBOOK_HEADER_FILL,
  WORKBOOK_INK,
  WORKBOOK_TITLE_FILL,
  WORKBOOK_TOTAL_FILL,
  workbookBox,
} from "@/lib/attendance-payroll-workbook";

// CANONICAL admin-console .xlsx export builder. Every "Excel 내보내기" button in /admin/* renders
// through this one function so the whole console ships a single green-ledger template: merged title
// bar → header row → numbered data rows → totals row → org/generated footer, all centered, Meiryo 9pt.
// Fills/borders come from attendance-payroll-workbook.ts — do NOT introduce new colors here.
// The paired PDF/print builder is admin-table-report.ts and takes the exact same input shape.
// See docs/product/05-admin-web-ia.md → "공용 프리미티브".

export type AdminTableColumn = {
  /** Row lookup key. */
  key: string;
  /** Localized header label. */
  label: string;
  /** Excel column width (characters). */
  width: number;
  /** Print/PDF column width as a percentage of the table. */
  printWidth: number;
  /** Emphasize values (numbers, durations, money). */
  bold?: boolean;
  /** Allow the cell to wrap (long free-text columns such as 비고). */
  wrap?: boolean;
};

/** One data row: column key → already-localized display string. */
export type AdminTableExportRow = Record<string, string>;

export type AdminTableSheet = {
  /** Worksheet tab name (truncated to Excel's 31-char limit). */
  sheetName: string;
  /** Document title, e.g. "청소 기록". */
  title: string;
  /** Prefix shown before the title in the title bar, e.g. "7월 1일 – 7월 31일". Optional. */
  rangeLabel?: string;
  /** Header label for the auto-generated row-number column. */
  colNoLabel: string;
  /** Label rendered in the totals row (first data column). */
  totalLabel: string;
  columns: AdminTableColumn[];
  rows: AdminTableExportRow[];
  /** Optional totals-row values keyed by column key. The row count always fills the No. cell. */
  totals?: Record<string, string>;
};

export type AdminTableWorkbookInput = {
  orgName: string;
  /** e.g. "생성일시 · 2026-07-14 09:31". */
  generatedLabel: string;
  sheets: AdminTableSheet[];
};

const NO_COLUMN_WIDTH = 5;

function textFont() {
  return { name: "Meiryo", size: 9, color: { argb: WORKBOOK_INK } };
}
function boldFont() {
  return { name: "Meiryo", size: 9, bold: true, color: { argb: WORKBOOK_INK } };
}

function titleText(sheet: AdminTableSheet): string {
  return [sheet.rangeLabel, sheet.title].filter(Boolean).join(" ");
}

function addSheet(wb: ExcelJS.Workbook, sheet: AdminTableSheet, input: AdminTableWorkbookInput) {
  const ws = wb.addWorksheet(sheet.sheetName.slice(0, 31), {
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
  const lastCol = sheet.columns.length + 1; // +1 for the auto No. column
  ws.columns = [{ width: NO_COLUMN_WIDTH }, ...sheet.columns.map((c) => ({ width: c.width }))];

  // ── Title ──
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell("A1");
  title.value = titleText(sheet);
  title.font = { name: "Meiryo", bold: true, size: 12, color: { argb: WORKBOOK_INK } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_TITLE_FILL } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  title.border = workbookBox();
  ws.getRow(1).height = 22;

  // ── Header ──
  const header = ws.getRow(2);
  header.height = 22;
  [sheet.colNoLabel, ...sheet.columns.map((c) => c.label)].forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = boldFont();
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
    cell.border = workbookBox();
  });

  // ── Data rows ──
  const firstDataRow = 3;
  sheet.rows.forEach((r, i) => {
    const row = ws.getRow(firstDataRow + i);
    row.height = 18;

    const no = row.getCell(1);
    no.value = String(i + 1);
    no.font = textFont();
    no.border = workbookBox();
    no.alignment = { vertical: "middle", horizontal: "center" };

    sheet.columns.forEach((col, ci) => {
      const cell = row.getCell(ci + 2);
      cell.value = r[col.key] || WORKBOOK_DASH;
      cell.font = col.bold ? boldFont() : textFont();
      cell.border = workbookBox();
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: Boolean(col.wrap) };
    });
  });

  // ── Totals row ──
  const totalRowIdx = firstDataRow + sheet.rows.length;
  const total = ws.getRow(totalRowIdx);
  total.height = 20;
  total.getCell(1).value = String(sheet.rows.length);
  if (sheet.columns.length > 0) {
    total.getCell(2).value = sheet.totalLabel;
  }
  sheet.columns.forEach((col, ci) => {
    const value = sheet.totals?.[col.key];
    if (value) total.getCell(ci + 2).value = value;
  });
  for (let ci = 1; ci <= lastCol; ci++) {
    const cell = total.getCell(ci);
    cell.font = boldFont();
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_TOTAL_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = workbookBox();
  }

  // ── Footer ──
  const footer = ws.getCell(`A${totalRowIdx + 2}`);
  footer.value = `${input.orgName} / ${input.generatedLabel}`;
  footer.font = { name: "Meiryo", size: 8, color: { argb: WORKBOOK_INK } };
  footer.alignment = { vertical: "middle", horizontal: "center" };

  ws.pageSetup.printArea = `A1:${ws.getColumn(lastCol).letter}${totalRowIdx + 2}`;
}

export async function buildAdminTableWorkbookBase64(input: AdminTableWorkbookInput): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StayOps";
  wb.created = new Date();

  for (const sheet of input.sheets) {
    addSheet(wb, sheet, input);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
