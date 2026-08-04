import { AdminShell } from "@/components/shell/admin-shell";
import { MaintenanceConsole } from "@/components/admin/maintenance/maintenance-console";
import { getAdminMaintenance } from "@/lib/admin-maintenance";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";

// Admin · 수리·점검 — 현황 보드 / 목록·이력 / 완료 console. Design ported from the Claude Design
// handoff on 2026-07-14 and wired to real data (maintenance_reports + linked reservation/cleaning)
// the same day. See docs/product/08-maintenance-workflow.md → "2026-07-14 어드민 수리·점검 대시보드".
export default async function AdminMaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const session = await requireAdminPageSession({ nextPath: "/admin/maintenance" });
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);

  const { reports, loadError } = await getAdminMaintenance(session, dictionary.cleaning.buildingLabels);

  // `updateMaintenanceStatus` 는 실패하면 `?error=not_found` 로 이 목록에 되돌려 보낸다. 예전에는
  // 이 화면이 그 파라미터를 읽지 않아, 상태 변경이 막혀도 목록만 다시 그려지고 안내가 없었다
  // (2026-08-04). 상세 화면(`[id]/page.tsx`)은 이미 같은 사유를 배너로 띄우고 있었다.
  const errorRaw = (await searchParams)?.error;
  const errorKey = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;
  const errorMessage = errorKey
    ? (dictionary.maintenance.errors[errorKey] ?? dictionary.maintenance.errors.save_failed)
    : null;

  return (
    <AdminShell activeItem="maintenance" title={dictionary.maintenance.adminTitle}>
      {errorMessage ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {errorMessage}
        </div>
      ) : null}
      <MaintenanceConsole locale={locale} loadError={loadError} reports={reports} />
    </AdminShell>
  );
}
