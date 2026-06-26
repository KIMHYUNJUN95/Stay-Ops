import Link from "next/link";
import { redirect } from "next/navigation";
import { AnnouncementPopup } from "@/components/announcements/announcement-popup";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import { getPopupDismissals, getVisibleAnnouncements } from "@/lib/announcements";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import type { OrganizationRole } from "@/config/roles";

function AlertIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3.5l9 16H3l9-16z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M12 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="16.7" r="1.05" fill="currentColor"/>
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6"/>
      <circle cx="9" cy="10" r="1.4" fill="currentColor"/>
      <path d="M5 17l4.5-4.5 3 3L16 11l3 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function toTokyoDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

function formatDateLabel(dateStr: string | null, locale: string): string {
  if (!dateStr) return "";
  const tag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(tag, {
    year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo",
  }).format(new Date(dateStr));
}

function targetLabel(
  scope: string,
  roles: string[],
  copy: ReturnType<typeof getAnnouncementDictionary>
): string {
  if (scope === "everyone") return copy.targetScopes.everyone;
  if (roles.length === 0) return copy.targetScopes.roles;
  const names = roles.map((r) => copy.targetRoles[r as OrganizationRole] ?? r);
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} +${names.length - 1}`;
}

export default async function MobileAnnouncementsPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/announcements");
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const copy = getAnnouncementDictionary(session.user.preferredLanguage);
  const announcements = await getVisibleAnnouncements(session);
  const now = new Date();
  const popupCandidates = announcements.filter(
    (announcement) => announcement.show_popup_on_app_open,
  );
  const dismissals = await getPopupDismissals(
    session.user.id,
    popupCandidates.map((a) => a.id),
  );
  const popupAnnouncements = popupCandidates
    .filter(
      (announcement) =>
        !dismissals.has(announcement.id) &&
        (!announcement.popup_until || new Date(announcement.popup_until) > now),
    )
    .map((announcement) => ({
      content: announcement.content,
      id: announcement.id,
      imageUrls: announcement.image_urls,
      isImportant: announcement.is_important,
      organizationId: announcement.organization_id,
      publishedAt: announcement.published_at,
      title: announcement.title,
    }));

  const navBadges = await getMobileNavBadges();

  // pinned 먼저, 그 다음 published_at 내림차순으로 이미 DB에서 정렬되어 옴
  // Tokyo 기준 날짜로 그룹핑
  const dateGroupMap = new Map<string, typeof announcements>();
  for (const ann of announcements) {
    const dateKey = toTokyoDate(ann.published_at);
    const key = dateKey || "unknown";
    if (!dateGroupMap.has(key)) {
      dateGroupMap.set(key, []);
    }
    dateGroupMap.get(key)!.push(ann);
  }

  const dateGroups = Array.from(dateGroupMap.entries());

  return (
    <MobileShell
      activeItem="announcements"
      badges={navBadges}
      title={copy.title}
    >
      <AnnouncementPopup
        announcements={popupAnnouncements}
        detailHrefBase="/mobile/announcements"
        locale={session.user.preferredLanguage}
      />

      <h1 className="px-2 pt-2 pb-1 text-[22px] font-black tracking-tight">
        {copy.title}
      </h1>

      {announcements.length === 0 ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm font-bold text-slate-500">{copy.mobileEmpty}</p>
        </div>
      ) : (
        <div>
          {dateGroups.map(([dateKey, items]) => (
            <div key={dateKey}>
              <p className="ml-7 px-4 py-2 pb-3 text-[11.5px] font-extrabold text-slate-700">
                {formatDateLabel(items[0]?.published_at ?? null, session.user.preferredLanguage)}
              </p>
              {items.map((ann, idx) => {
                const isLast = idx === items.length - 1;
                return (
                  <Link
                    key={ann.id}
                    href={`/mobile/announcements/${ann.id}`}
                    className="flex gap-[13px] items-start px-[18px] pb-[18px]"
                  >
                    {/* 도트 + 라인 */}
                    <div className="w-[14px] shrink-0 flex flex-col items-center">
                      <div
                        className={`w-[9px] h-[9px] rounded-full mt-1 shrink-0 ${ann.is_important ? "bg-red-600" : "bg-primary"}`}
                      />
                      {!isLast && (
                        <div className="flex-1 w-0.5 bg-border mt-1.5 min-h-[16px]" />
                      )}
                    </div>

                    {/* 콘텐츠 */}
                    <div className="flex-1 min-w-0 pb-1">
                      {ann.is_important ? (
                        <span className="inline-flex items-center gap-[3px] text-[10.5px] font-extrabold text-red-600 bg-red-50 px-2 py-[3px] rounded-full border border-red-200">
                          <AlertIcon />
                          {copy.important}
                        </span>
                      ) : (
                        <span className="text-[10.5px] font-extrabold uppercase text-slate-500 tracking-wide">
                          {targetLabel(ann.target_scope, ann.target_roles as string[], copy)}
                        </span>
                      )}
                      <h3 className="mt-0.5 text-[14.5px] font-extrabold leading-snug line-clamp-2 text-foreground">
                        {ann.title}
                      </h3>
                      <p className="mt-1.5 text-[11.5px] font-semibold text-slate-500">
                        {targetLabel(ann.target_scope, ann.target_roles as string[], copy)}
                        {" · "}
                        {ann.author_name}
                      </p>
                    </div>

                    {/* 이미지 아이콘 */}
                    {ann.image_urls.length > 0 && <ImageIcon />}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </MobileShell>
  );
}
