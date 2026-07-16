import { AdminShell } from "@/components/shell/admin-shell";
import { LostFoundConsole } from "@/components/admin/lost-found/lost-found-console";
import { getAdminLostFound } from "@/lib/admin-lost-found";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";

// Admin · 분실물 — 현황 보드 / 목록·이력 / 완료 / 폐기 내역 console. Ported from the Claude Design
// handoff on 2026-07-16 and wired to real data (lost_items + linked reservation) the same day. See
// docs/product/09-lost-found-workflow.md.
export default async function AdminLostFoundPage() {
  const session = await requireAdminPageSession({ nextPath: "/admin/lost-found" });
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);

  const { items, loadError } = await getAdminLostFound(session, dictionary.cleaning.buildingLabels);

  return (
    <AdminShell activeItem="lost-found" title={dictionary.lostFound.adminTitle}>
      <LostFoundConsole locale={locale} items={items} loadError={loadError} />
    </AdminShell>
  );
}
