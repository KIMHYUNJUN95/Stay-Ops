import "server-only";

import { formatCleaningDuration, type CleaningHistoryWorkbookRow } from "@/lib/cleaning-history-workbook";

// Print-quality cleaning-history REPORT (self-contained HTML document for PDF via browser print).
// Same plain green ledger language as the workbook export and the attendance payroll report
// (attendance-payroll-report.ts) so monthly/user payroll PDFs and cleaning-record PDFs stay visually
// unified across the admin console.

export type CleaningHistoryReportLabels = {
  title: string;
  rangeLabel: string;
  orgName: string;
  generatedLabel: string;
  printLabel: string;
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

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCleaningHistoryReportHtml(
  rows: CleaningHistoryWorkbookRow[],
  labels: CleaningHistoryReportLabels,
  localeTag: string,
): string {
  const totalMinutes = rows.reduce((sum, r) => sum + r.durationMinutes, 0);

  const bodyRows = rows
    .map((r, i) => {
      return `<tr${i % 2 ? " class=z" : ""}>
        <td class=c>${i + 1}</td>
        <td class=c>${esc(r.date)}</td>
        <td class=c>${esc(r.building)}</td>
        <td class=c>${esc(r.room)}</td>
        <td class=c>${esc(r.type)}</td>
        <td class=c>${esc(r.staff)}</td>
        <td class=r>${esc(r.start)}</td>
        <td class=r>${esc(r.end)}</td>
        <td class=r strong>${esc(r.durationLabel)}</td>
        <td class=c>${esc(r.status)}</td>
        <td class=c>${esc(r.note) || "—"}</td>
      </tr>`;
    })
    .join("");

  const totalRow = `<tr class=tot>
    <td class=c>${rows.length}</td>
    <td class=c>${esc(labels.totalLabel)}</td>
    <td class=c></td>
    <td class=c></td>
    <td class=c></td>
    <td class=c></td>
    <td class=r></td>
    <td class=r></td>
    <td class=r strong>${esc(formatCleaningDuration(totalMinutes))}</td>
    <td class=c></td>
    <td class=c></td>
  </tr>`;

  return `<!DOCTYPE html>
<html lang="${esc(localeTag.slice(0, 2))}">
<head>
<meta charset="utf-8" />
<title>${esc(labels.title)} · ${esc(labels.rangeLabel)}</title>
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
  .title { background: #b6d7a8; border: 1px solid #000; font-size: 17px; font-weight: 800; padding: 6px 8px; text-align: center; }
  .meta { margin: 8px 0 10px; font-size: 10px; text-align: center; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead th { background: #d9ead3; color: #000; font-size: 11px; font-weight: 800; padding: 6px 8px;
    border: 1px solid #000; white-space: normal; word-break: keep-all; line-height: 1.2; text-align: center; }
  tbody td { border: 1px solid #000; padding: 5px 7px; font-size: 11px; height: 24px; text-align: center; }
  td.c { text-align: center; }
  td.r { text-align: center; font-variant-numeric: tabular-nums; }
  td[strong], td.strong { font-weight: 700; }
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
    <button type="button" class="printbtn" onclick="window.print()">${esc(labels.printLabel)}</button>
  </div>
  <div class="wrap">
    <div class="title">${esc(labels.rangeLabel)} ${esc(labels.title)}</div>
    <div class="meta">${esc(labels.orgName)} / ${esc(labels.generatedLabel)}</div>
    <table>
      <colgroup>
        <col style="width:4%" /><col style="width:8%" /><col style="width:11%" /><col style="width:7%" /><col style="width:10%" /><col style="width:12%" /><col style="width:7%" /><col style="width:7%" /><col style="width:8%" /><col style="width:10%" /><col style="width:16%" />
      </colgroup>
      <thead>
        <tr>
          <th>${esc(labels.colNo)}</th>
          <th>${esc(labels.colDate)}</th>
          <th>${esc(labels.colBuilding)}</th>
          <th>${esc(labels.colRoom)}</th>
          <th>${esc(labels.colType)}</th>
          <th>${esc(labels.colStaff)}</th>
          <th>${esc(labels.colStart)}</th>
          <th>${esc(labels.colEnd)}</th>
          <th>${esc(labels.colDur)}</th>
          <th>${esc(labels.colStatus)}</th>
          <th>${esc(labels.colNote)}</th>
        </tr>
      </thead>
      <tbody>${bodyRows}${totalRow}</tbody>
    </table>
  </div>
</body>
</html>`;
}
