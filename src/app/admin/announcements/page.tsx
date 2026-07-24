import { AdminShell } from "@/components/shell/admin-shell";
import { AnnouncementsConsole } from "@/components/admin/announcements/announcements-console";
import { adminNavigation, getNavigationLabel } from "@/config/navigation";
import { getAdminAnnouncements } from "@/lib/admin-announcements";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import { requireAdminPageSession } from "@/lib/admin-page-auth";

// 공지 관리 콘솔 — 게시중/초안/보관 3 상태 + KPI + 목록 표 + 우측 상세 패널 + 작성/편집·읽음 감사.
// 모바일 공지의 배포·감사 관리 표면. AdminShell 이 사이드바/탑바를 소유한다.
// See docs/product/11-announcement-workflow.md → "Admin Dashboard Management Console".
export default async function AdminAnnouncementsPage() {
  const session = await requireAdminPageSession({
    nextPath: "/admin/announcements",
  });
  const locale = session.user.preferredLanguage;
  const data = await getAdminAnnouncements(session);
  const navItem = adminNavigation.find((item) => item.id === "announcements");
  const title = navItem
    ? getNavigationLabel(navItem, locale)
    : getAnnouncementDictionary(locale).title;

  return (
    <AdminShell activeItem="announcements" title={title}>
      <AnnouncementsConsole locale={locale} data={data} />
    </AdminShell>
  );
}
