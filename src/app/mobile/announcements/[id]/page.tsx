import { notFound, redirect } from "next/navigation";
import { AnnouncementImageGrid } from "@/components/announcements/announcement-image-grid";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import {
  ensureAnnouncementRead,
  getVisibleAnnouncementById,
} from "@/lib/announcements";
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

function ExpandIcon() {
  return (
    <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 4H5a1 1 0 00-1 1v4M15 4h4a1 1 0 011 1v4M9 20H5a1 1 0 01-1-1v-4M15 20h4a1 1 0 001-1v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatDate(value: string | null, locale: string): string {
  if (!value) return "";
  const tag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(tag, {
    year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Tokyo",
  }).format(new Date(value));
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

export default async function MobileAnnouncementDetailPage({
  params,
}: PageProps) {
  const [state, session, routeParams] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=/mobile/announcements/${routeParams.id}`);
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const copy = getAnnouncementDictionary(session.user.preferredLanguage);
  const announcement = await getVisibleAnnouncementById(session, routeParams.id);

  if (!announcement) {
    notFound();
  }

  // 읽음 처리 — 결과값은 사용하지 않음
  await ensureAnnouncementRead(announcement, session.user.id);

  const navBadges = await getMobileNavBadges();
  const locale = session.user.preferredLanguage;

  return (
    <MobileShell
      activeItem="announcements"
      badges={navBadges}
      title={copy.readAnnouncement}
    >
      <div className="px-5 pt-5 pb-10">
        {/* 중요 칩 */}
        {announcement.is_important && (
          <span className="inline-flex items-center gap-[3px] text-[10.5px] font-extrabold text-red-600 bg-red-50 px-2 py-[3px] rounded-full border border-red-200">
            <AlertIcon />
            {copy.important}
          </span>
        )}

        {/* 제목 */}
        <h1 className="text-[21px] font-black tracking-[-0.02em] leading-[1.3] mt-[11px]">
          {announcement.title}
        </h1>

        {/* 메타 블록 */}
        <div className="mt-4 mb-4 rounded-[13px] border border-border bg-surface p-[14px]">
          <div className="flex justify-between py-[5px] text-xs">
            <span className="text-[10.5px] font-extrabold tracking-[0.07em] uppercase text-slate-500">
              {copy.publishedAt}
            </span>
            <span className="font-bold">
              {formatDate(announcement.published_at, locale)}
            </span>
          </div>
          <div className="flex justify-between py-[5px] text-xs border-t border-border/60">
            <span className="text-[10.5px] font-extrabold tracking-[0.07em] uppercase text-slate-500">
              {copy.target}
            </span>
            <span className="font-bold">
              {targetLabel(announcement.target_scope, announcement.target_roles as string[], copy)}
            </span>
          </div>
          <div className="flex justify-between py-[5px] text-xs border-t border-border/60">
            <span className="text-[10.5px] font-extrabold tracking-[0.07em] uppercase text-slate-500">
              {copy.authorCredit}
            </span>
            <span className="font-bold">{announcement.author_name}</span>
          </div>
        </div>

        {/* 본문 */}
        <p className="text-[14px] font-medium leading-[1.72] text-slate-600 whitespace-pre-line break-words">
          {announcement.content}
        </p>

        {/* 이미지 + 탭 힌트 */}
        {announcement.image_urls.length > 0 && (
          <div className="mt-5">
            <AnnouncementImageGrid
              imageUrls={announcement.image_urls}
              variant="feature"
            />
            <div className="flex items-center justify-center gap-1.5 mt-2 text-[11.5px] font-bold text-slate-500">
              <ExpandIcon />
              {copy.tapToZoom}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
