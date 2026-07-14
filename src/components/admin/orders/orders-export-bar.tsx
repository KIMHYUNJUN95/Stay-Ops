"use client";

import { AdminExportButtons, type AdminExportLabels } from "@/components/admin/shared/admin-export-buttons";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import {
  exportOrdersReport,
  exportOrdersWorkbook,
  type OrdersExportFilters,
} from "@/app/admin/orders/actions";

/**
 * Client bridge between the server-rendered 주문·비품 filter bar and the canonical export buttons.
 * Only the current filter values cross the boundary — the server action re-queries the rows.
 */
export function OrdersExportBar({
  filters,
  disabled,
  labels,
}: {
  filters: OrdersExportFilters;
  disabled: boolean;
  labels: AdminExportLabels;
}) {
  const { toast, showToast, dismiss } = useAdminToast();

  return (
    <div className="flex items-center gap-2">
      <AdminExportButtons
        onExportXls={() => exportOrdersWorkbook(filters)}
        onExportPdf={() => exportOrdersReport(filters)}
        disabled={disabled}
        onToast={showToast}
        labels={labels}
      />
      {toast ? <AdminToast message={toast.message} onDismiss={dismiss} /> : null}
    </div>
  );
}
