// Return types shared by every admin-console Excel/PDF export server action. Kept in a plain
// (non-`server-only`) module so client components can import the types without pulling exceljs into
// the browser bundle. The canonical consumer is <AdminExportButtons>
// (src/components/admin/shared/admin-export-buttons.tsx).

export type AdminExportFailureReason = "forbidden" | "empty" | "error";

export type AdminWorkbookExportResult =
  | { ok: true; filename: string; base64: string; rowCount: number }
  | { ok: false; reason: AdminExportFailureReason };

export type AdminReportExportResult =
  | { ok: true; html: string; rowCount: number }
  | { ok: false; reason: AdminExportFailureReason };
