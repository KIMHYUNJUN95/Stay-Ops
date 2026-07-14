"use client";

import { AdminExportButtons, type AdminExportLabels } from "@/components/admin/shared/admin-export-buttons";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import {
  exportLostFoundReport,
  exportLostFoundWorkbook,
  type LostFoundExportFilters,
} from "@/app/admin/lost-found/actions";

/**
 * Client bridge between the server-rendered 분실물 filter bar and the canonical export buttons.
 * Only the current filter values cross the boundary — the server action re-queries the rows.
 */
export function LostFoundExportBar({
  filters,
  disabled,
  labels,
}: {
  filters: LostFoundExportFilters;
  disabled: boolean;
  labels: AdminExportLabels;
}) {
  const { toast, showToast, dismiss } = useAdminToast();

  return (
    <div className="flex items-center gap-2">
      <AdminExportButtons
        onExportXls={() => exportLostFoundWorkbook(filters)}
        onExportPdf={() => exportLostFoundReport(filters)}
        disabled={disabled}
        onToast={showToast}
        labels={labels}
      />
      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </div>
  );
}
