import { AdminShell } from "@/components/shell/admin-shell";
import { MaintenanceConsole } from "@/components/admin/maintenance/maintenance-console";
import { getAdminMaintenance } from "@/lib/admin-maintenance";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";

// Admin · 수리·점검 — 현황 보드 / 목록·이력 / 완료 console. Design ported from the Claude Design
// handoff on 2026-07-14 and wired to real data (maintenance_reports + linked reservation/cleaning)
// the same day. See docs/product/08-maintenance-workflow.md → "2026-07-14 어드민 수리·점검 대시보드".
export default async function AdminMaintenancePage() {
  const session = await requireAdminPageSession({ nextPath: "/admin/maintenance" });
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);

  const { reports, loadError } = await getAdminMaintenance(session, dictionary.cleaning.buildingLabels);

  return (
    <AdminShell activeItem="maintenance" title={dictionary.maintenance.adminTitle}>
      <MaintenanceConsole locale={locale} loadError={loadError} reports={reports} />
    </AdminShell>
  );
}
