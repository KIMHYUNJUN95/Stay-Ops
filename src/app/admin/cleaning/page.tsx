import { AdminShell } from "@/components/shell/admin-shell";
import { CleaningConsole } from "@/components/admin/cleaning/cleaning-console";
import { monthRange } from "@/components/admin/cleaning/cleaning-console-data";
import { getAdminCleaningHistory, getAdminCleaningToday } from "@/lib/admin-cleaning";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getCleaningOperatingDateKey } from "@/lib/cleaning";
import { getDictionary } from "@/lib/i18n";
import { getActiveRoomCatalogServer } from "@/lib/rooms";

// Admin · Cleaning — 오늘 현황 (real-time board) / 기록 (filterable history) console. Real
// cleaning_sessions + reservation data (see src/lib/admin-cleaning.ts) as of 2026-07-14 — replaces
// the earlier design-implementation mock. See docs/product/07-cleaning-workflow.md →
// "2026-07-14 어드민 청소 대시보드 — 백엔드 연동".
export default async function AdminCleaningPage() {
  const session = await requireAdminPageSession({ nextPath: "/admin/cleaning" });
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);

  const [ty, tm] = getCleaningOperatingDateKey().split("-").map(Number);
  const range = monthRange(ty, tm - 1);
  const [today, roomCatalog] = await Promise.all([
    getAdminCleaningToday(session),
    getActiveRoomCatalogServer(session.organization.id).catch(() => undefined),
  ]);
  const history = await getAdminCleaningHistory(
    session,
    { startDate: range.from, endDate: range.to },
    roomCatalog,
  );

  return (
    <AdminShell activeItem="cleaning" title={dictionary.cleaning.adminTitle}>
      <CleaningConsole
        locale={locale}
        tasks={today.tasks}
        setupTargets={today.setupTargets}
        staff={today.staff}
        loadError={today.loadError}
        initialHistory={history}
        initialHistoryFrom={range.from}
        initialHistoryTo={range.to}
      />
    </AdminShell>
  );
}
