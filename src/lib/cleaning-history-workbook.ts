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

// Localized, print-quality native .xlsx cleaning-history workbook (built with exceljs). Same green
// ledger template as the attendance payroll/transport workbooks (shared fills/border from
// attendance-payroll-workbook.ts) so every exported .xlsx in the admin console looks like one
// consistent template. See docs/product/07-cleaning-workflow.md → "2026-07-14 청소 기록 내보내기".

export type CleaningHistoryWorkbookRow = {
  date: string; // already locale-formatted (e.g. "7월 8일")
  building: string;
  room: string;
  type: string;
  staff: string;
  start: string;
  end: string;
  durationLabel: string;
  durationMinutes: number;
  status: string;
  note: string;
};

export type CleaningHistoryWorkbookLabels = {
  title: string;
  rangeLabel: string;
  orgName: string;
  generatedLabel: string;
  colNo: string;
  colDate: string;
  colBuilding: string;
  colRoom: string;
  colType: string;
  colStaff: string;
  colStart: string;
  colEnd: string;
  colDur: string;
  colStatus: string;
  colNote: string;
  totalLabel: string;
};

function moneyFont() {
  return { name: "Meiryo", size: 9, bold: true, color: { argb: WORKBOOK_INK } };
}
function textFont() {
  return { name: "Meiryo", size: 9, color: { argb: WORKBOOK_INK } };
}
function box() {
  return workbookBox();
}

export function formatCleaningDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export async function buildCleaningHistoryWorkbookBase64(
  rows: CleaningHistoryWorkbookRow[],
  labels: CleaningHistoryWorkbookLabels,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "StayOps";
  wb.created = new Date();

  const ws = wb.addWorksheet(labels.title.slice(0, 31), {
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
  const LAST = 11;
  ws.pageSetup.printArea = `A1:K${rows.length + 4}`;

  const cols: { width: number }[] = [
    { width: 5 }, // No
    { width: 11 }, // date
    { width: 14 }, // building
    { width: 10 }, // room
    { width: 13 }, // type
    { width: 16 }, // staff
    { width: 10 }, // start
    { width: 10 }, // end
    { width: 11 }, // duration
    { width: 14 }, // status
    { width: 34 }, // note
  ];
  ws.columns = cols.map((c) => ({ width: c.width }));

  // ── Title ──
  ws.mergeCells(1, 1, 1, LAST);
  const t = ws.getCell("A1");
  t.value = `${labels.rangeLabel} ${labels.title}`;
  t.font = { name: "Meiryo", bold: true, size: 12, color: { argb: WORKBOOK_INK } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_TITLE_FILL } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  t.border = box();
  ws.getRow(1).height = 22;

  // ── Header ──
  const headerLabels = [
    labels.colNo,
    labels.colDate,
    labels.colBuilding,
    labels.colRoom,
    labels.colType,
    labels.colStaff,
    labels.colStart,
    labels.colEnd,
    labels.colDur,
    labels.colStatus,
    labels.colNote,
  ];
  const header = ws.getRow(2);
  header.height = 22;
  headerLabels.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { name: "Meiryo", bold: true, size: 9, color: { argb: WORKBOOK_INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
    cell.border = box();
  });

  // ── Data rows ──
  const firstDataRow = 3;
  rows.forEach((r, i) => {
    const row = ws.getRow(firstDataRow + i);
    row.height = 18;
    const values: string[] = [
      String(i + 1),
      r.date,
      r.building,
      r.room,
      r.type,
      r.staff,
      r.start,
      r.end,
      r.durationLabel,
      r.status,
      r.note,
    ];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v || WORKBOOK_DASH;
      cell.font = ci === 8 ? moneyFont() : textFont();
      cell.border = box();
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: ci === 10 };
    });
  });

  // ── Totals row ──
  const lastDataRow = firstDataRow + rows.length - 1;
  const totalRowIdx = lastDataRow + 1;
  const total = ws.getRow(totalRowIdx);
  total.height = 20;
  const totalMinutes = rows.reduce((sum, r) => sum + r.durationMinutes, 0);
  total.getCell(2).value = labels.totalLabel;
  total.getCell(1).value = `${rows.length}`;
  total.getCell(9).value = formatCleaningDuration(totalMinutes);
  for (let ci = 1; ci <= LAST; ci++) {
    const cell = total.getCell(ci);
    cell.font = { name: "Meiryo", bold: true, size: 9, color: { argb: WORKBOOK_INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_TOTAL_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = box();
  }

  ws.getCell(`A${totalRowIdx + 2}`).value = `${labels.orgName} / ${labels.generatedLabel}`;
  ws.getCell(`A${totalRowIdx + 2}`).font = { name: "Meiryo", size: 8, color: { argb: WORKBOOK_INK } };
  ws.getCell(`A${totalRowIdx + 2}`).alignment = { vertical: "middle", horizontal: "center" };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
