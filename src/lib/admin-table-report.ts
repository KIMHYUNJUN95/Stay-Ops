import "server-only";

import type { AdminTableSheet, AdminTableWorkbookInput } from "@/lib/admin-table-workbook";

// CANONICAL admin-console PDF/print export builder — a self-contained HTML document the client opens
// in a new tab and prints to PDF. Takes the exact same input as buildAdminTableWorkbookBase64
// (admin-table-workbook.ts) so the Excel file and the PDF of any given screen are the same table.
// Plain green ledger language: #b6d7a8 title bar, #d9ead3 header, #e2f0d9 totals, #fbfcf8 zebra.
// See docs/product/05-admin-web-ia.md → "공용 프리미티브".

export type AdminTableReportInput = AdminTableWorkbookInput & {
  /** Localized label for the floating print button (hidden when printing). */
  printLabel: string;
  localeTag: string;
};

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleText(sheet: AdminTableSheet): string {
  return [sheet.rangeLabel, sheet.title].filter(Boolean).join(" ");
}

function renderSheet(sheet: AdminTableSheet, input: AdminTableReportInput, index: number): string {
  const colgroup = [
    `<col style="width:4%" />`,
    ...sheet.columns.map((c) => `<col style="width:${c.printWidth}%" />`),
  ].join("");

  const head = [sheet.colNoLabel, ...sheet.columns.map((c) => c.label)]
    .map((label) => `<th>${esc(label)}</th>`)
    .join("");

  const bodyRows = sheet.rows
    .map((r, i) => {
      const cells = sheet.columns
        .map((c) => `<td class="c${c.bold ? " strong" : ""}">${esc(r[c.key] ?? "") || "—"}</td>`)
        .join("");
      return `<tr${i % 2 ? ' class="z"' : ""}><td class="c">${i + 1}</td>${cells}</tr>`;
    })
    .join("");

  const totalCells = sheet.columns
    .map((c, ci) => {
      if (ci === 0) return `<td class="c">${esc(sheet.totalLabel)}</td>`;
      const value = sheet.totals?.[c.key] ?? "";
      return `<td class="c${c.bold ? " strong" : ""}">${esc(value)}</td>`;
    })
    .join("");
  const totalRow = `<tr class="tot"><td class="c">${sheet.rows.length}</td>${totalCells}</tr>`;

  return `<section class="sheet"${index > 0 ? ' style="break-before:page"' : ""}>
    <div class="title">${esc(titleText(sheet))}</div>
    <div class="meta">${esc(input.orgName)} / ${esc(input.generatedLabel)}</div>
    <table>
      <colgroup>${colgroup}</colgroup>
      <thead><tr>${head}</tr></thead>
      <tbody>${bodyRows}${totalRow}</tbody>
    </table>
  </section>`;
}

export function buildAdminTableReportHtml(input: AdminTableReportInput): string {
  const docTitle = input.sheets[0] ? titleText(input.sheets[0]) : "StayOps";
  const sections = input.sheets.map((sheet, i) => renderSheet(sheet, input, i)).join("");

  return `<!DOCTYPE html>
<html lang="${esc(input.localeTag.slice(0, 2))}">
<head>
<meta charset="utf-8" />
<title>${esc(docTitle)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Meiryo','Malgun Gothic','Apple SD Gothic Neo','Hiragino Sans',sans-serif;
    color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact;
    padding: 18px;
  }
  .wrap { max-width: 1160px; margin: 0 auto; }
  .sheet + .sheet { margin-top: 26px; }
  .title { background: #b6d7a8; border: 1px solid #000; font-size: 17px; font-weight: 800; padding: 6px 8px; text-align: center; }
  .meta { margin: 8px 0 10px; font-size: 10px; text-align: center; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th { background: #d9ead3; color: #000; font-size: 11px; font-weight: 800; padding: 6px 8px;
    border: 1px solid #000; white-space: normal; word-break: keep-all; line-height: 1.2; text-align: center; }
  tbody td { border: 1px solid #000; padding: 5px 7px; font-size: 11px; height: 24px; text-align: center; }
  td.c { text-align: center; }
  td.strong { font-weight: 700; font-variant-numeric: tabular-nums; }
  tr.z td { background: #fbfcf8; }
  tr.tot td { background: #e2f0d9; font-weight: 800; }
  tbody tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .toolbar { position: fixed; top: 16px; right: 16px; z-index: 10; }
  .printbtn { border: none; background: #2f3b5c; color: #fff; font-size: 13px; font-weight: 700;
    padding: 9px 16px; border-radius: 8px; cursor: pointer; }
  @media print { .noprint { display: none !important; } }
</style>
</head>
<body>
  <div class="toolbar noprint">
    <button type="button" class="printbtn" onclick="window.print()">${esc(input.printLabel)}</button>
  </div>
  <div class="wrap">${sections}</div>
</body>
</html>`;
}
