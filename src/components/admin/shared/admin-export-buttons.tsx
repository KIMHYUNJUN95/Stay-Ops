"use client";

// CANONICAL admin-console export control: the Excel + PDF `chipbtn` pair. Every "내보내기" in
// /admin/* renders through this component — do not hand-roll export buttons or reintroduce CSV.
// Pair it with buildAdminTableWorkbookBase64 / buildAdminTableReportHtml on the server side.
// See CLAUDE.md → "Admin dashboard shared design contract".
import { useTransition } from "react";
import { Download } from "lucide-react";
import { downloadAdminWorkbook } from "@/components/admin/shared/admin-format";
import type { AdminReportExportResult, AdminWorkbookExportResult } from "@/lib/admin-export-result";
import type { Dictionary } from "@/lib/i18n";

export type AdminExportLabels = Dictionary["admin"]["shared"];

type AdminExportButtonsProps = {
  /** Server action returning the .xlsx as base64. */
  onExportXls: () => Promise<AdminWorkbookExportResult>;
  /** Server action returning the print-ready HTML document. */
  onExportPdf: () => Promise<AdminReportExportResult>;
  /** Pass `true` when there are no rows to export. */
  disabled?: boolean;
  onToast: (message: string) => void;
  labels: AdminExportLabels;
};

export function AdminExportButtons({
  onExportXls,
  onExportPdf,
  disabled = false,
  onToast,
  labels,
}: AdminExportButtonsProps) {
  const [xlsPending, startXlsExport] = useTransition();
  const [pdfPending, startPdfExport] = useTransition();

  function handleExportXls() {
    startXlsExport(async () => {
      const res = await onExportXls();
      if (res.ok) {
        downloadAdminWorkbook(res.base64, res.filename);
        onToast(labels.exportDone);
        return;
      }
      onToast(res.reason === "empty" ? labels.exportEmpty : labels.exportFailed);
    });
  }

  function handleExportPdf() {
    // Open the tab synchronously (still inside the click handler) so pop-up blockers don't kill it
    // once the server action's await resolves.
    const win = window.open("", "_blank");
    startPdfExport(async () => {
      const res = await onExportPdf();
      if (!res.ok) {
        win?.close();
        onToast(res.reason === "empty" ? labels.exportEmpty : labels.exportFailed);
        return;
      }
      if (!win) {
        onToast(labels.exportBlocked);
        return;
      }
      win.document.open();
      win.document.write(res.html);
      win.document.close();
    });
  }

  return (
    <>
      <button type="button" className="chipbtn" onClick={handleExportXls} disabled={disabled || xlsPending}>
        <Download className="ic" aria-hidden="true" />
        {labels.exportXls}
      </button>
      <button type="button" className="chipbtn" onClick={handleExportPdf} disabled={disabled || pdfPending}>
        <Download className="ic" aria-hidden="true" />
        {labels.exportPdf}
      </button>
    </>
  );
}
