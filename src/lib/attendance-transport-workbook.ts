import "server-only";

import ExcelJS from "exceljs";
import {
  WORKBOOK_HEADER_FILL,
  WORKBOOK_INK,
  WORKBOOK_TITLE_FILL,
  WORKBOOK_TOTAL_FILL,
  workbookBox,
} from "@/lib/attendance-payroll-workbook";

// Localized, print-quality native .xlsx transport-reimbursement ledger (built with exceljs), styled
// to match the payroll workbook template (same green accounting palette, same "at least 50 rows"
// pre-printed-ledger padding). One row per reimbursement item. This is a PLAIN LEDGER: no receipt
// images or links — receipts are reviewed in the dedicated web receipt page. Columns are only the
// essentials for a transport ledger: No / staff / date / building / status / amount. Every cell is
// center-aligned.

export type TransportWorkbookItem = {
  userName: string;
  usageDate: string; // 'YYYY-MM-DD'
  buildingLabel: string;
  statusLabel: string;
  amountYen: number;
};

export type TransportWorkbookLabels = {
  title: string;
  monthLabel: string;
  orgName: string;
  generatedLabel: string;
  colNo: string;
  colStaff: string;
  colDate: string;
  colBuilding: string;
  colStatus: string;
  colAmount: string;
  totalLabel: string;
};

const TEMPLATE_ROWS = 50;

function dateLabel(usageDate: string): string {
  const [, m, d] = usageDate.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export async function buildTransportWorkbookBase64(
  items: TransportWorkbookItem[],
  labels: TransportWorkbookLabels,
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

  // Every column center-aligned per the requested ledger layout.
  const cols: { width: number; numFmt?: string }[] = [
    { width: 6 }, // No
    { width: 24 }, // staff
    { width: 12 }, // date
    { width: 28 }, // building
    { width: 14 }, // status
    { width: 18, numFmt: "¥#,##0" }, // amount
  ];
  ws.columns = cols.map((c) => ({ width: c.width }));
  const LAST = cols.length;
  const AMOUNT_COL = 6;

  // ── Title ──
  ws.mergeCells(1, 1, 1, LAST);
  const t = ws.getCell("A1");
  t.value = `${labels.monthLabel} ${labels.title}`;
  t.font = { name: "Meiryo", bold: true, size: 12, color: { argb: WORKBOOK_INK } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_TITLE_FILL } };
  t.alignment = { vertical: "middle", horizontal: "left" };
  t.border = workbookBox();
  ws.getRow(1).height = 22;

  // ── Header ──
  const headerLabels = [
    labels.colNo,
    labels.colStaff,
    labels.colDate,
    labels.colBuilding,
    labels.colStatus,
    labels.colAmount,
  ];
  const header = ws.getRow(2);
  header.height = 22;
  headerLabels.forEach((label, i) => {
    const cell = header.getCell(i + 1);
    cell.value = label;
    cell.font = { name: "Meiryo", bold: true, size: 9, color: { argb: WORKBOOK_INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false, shrinkToFit: true };
    cell.border = workbookBox();
  });

  // ── Data rows (one per item, padded to at least 50 like the payroll ledger) ──
  const firstDataRow = 3;
  const templateRows = Math.max(TEMPLATE_ROWS, items.length);
  for (let i = 0; i < templateRows; i++) {
    const item = items[i];
    const row = ws.getRow(firstDataRow + i);
    row.height = 18;
    const values: (string | number)[] = [
      item ? i + 1 : "",
      item?.userName ?? "",
      item ? dateLabel(item.usageDate) : "",
      item ? item.buildingLabel || "—" : "",
      item?.statusLabel ?? "",
      item ? item.amountYen : "",
    ];
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { name: "Meiryo", size: 9, color: { argb: WORKBOOK_INK } };
      cell.border = workbookBox();
      cell.alignment = { vertical: "middle", horizontal: "center" };
      if (cols[ci].numFmt && typeof v === "number") cell.numFmt = cols[ci].numFmt!;
    });
  }

  // ── Total row ──
  const lastDataRow = firstDataRow + templateRows - 1;
  const totalRowIdx = lastDataRow + 1;
  const total = ws.getRow(totalRowIdx);
  total.height = 20;
  total.getCell(2).value = labels.totalLabel;
  total.getCell(AMOUNT_COL).value = { formula: `SUM(F${firstDataRow}:F${lastDataRow})` };
  total.getCell(AMOUNT_COL).numFmt = "¥#,##0";
  for (let ci = 1; ci <= LAST; ci++) {
    const cell = total.getCell(ci);
    cell.font = { name: "Meiryo", bold: true, size: 9, color: { argb: WORKBOOK_INK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WORKBOOK_TOTAL_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = workbookBox();
  }

  ws.getCell(`A${totalRowIdx + 2}`).value = `${labels.orgName} / ${labels.generatedLabel}`;
  ws.getCell(`A${totalRowIdx + 2}`).font = { name: "Meiryo", size: 8, color: { argb: WORKBOOK_INK } };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}
