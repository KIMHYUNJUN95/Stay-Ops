import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Megaphone, MessageCircle, Users } from "lucide-react";
import { AnnouncementPopup } from "@/components/announcements/announcement-popup";
import { MobileShell } from "@/components/shell/mobile-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import { getPopupDismissals, getVisibleAnnouncements } from "@/lib/announcements";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

const ANNOUNCEMENT_PANEL =
  "rounded-[28px] border border-slate-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_22px_46px_-32px_rgba(31,58,95,0.48)] backdrop-blur-none dark:border-white/12 dark:bg-white/8";
const ANNOUNCEMENT_CARD =
  "rounded-[24px] border border-slate-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#fbfcff_100%)] shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)] backdrop-blur-none dark:border-white/12 dark:bg-white/8";

function formatDate(value: string | null, locale: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
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
    redirect("/admin");
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
      title: announcement.title,
    }));

  return (
    <MobileShell
      activeItem="announcements"
      appearance="announcement"
      title={copy.title}
    >
      <AnnouncementPopup
        announcements={popupAnnouncements}
        detailHrefBase="/mobile/announcements"
        locale={session.user.preferredLanguage}
      />

      <div className="space-y-5">
        <div className={`${ANNOUNCEMENT_PANEL} relative overflow-hidden p-4`}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-10 size-32 rounded-full bg-sky-100/55 blur-2xl"
          />
          <div className="relative flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/80">
              <Megaphone className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400 dark:text-slate-400">
                {copy.publishedForYou}
              </p>
              <h2 className="mt-1 text-[22px] font-black leading-tight text-slate-950 dark:text-slate-50">
                {copy.latest}
              </h2>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
                {copy.mobileDescription}
              </p>
            </div>
          </div>
        </div>

        {announcements.length === 0 ? (
          <Card className={`${ANNOUNCEMENT_CARD} border-dashed p-6 text-center text-slate-950 dark:text-slate-50`}>
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/80">
              <Megaphone className="size-5" aria-hidden="true" />
            </div>
            <p className="mx-auto mt-4 max-w-xs text-sm font-bold leading-6 text-slate-500 dark:text-slate-400">
              {copy.mobileEmpty}
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {[
              {
                items: announcements.filter((announcement) => announcement.is_pinned),
                label: copy.pinned,
              },
              {
                items: announcements.filter((announcement) => !announcement.is_pinned),
                label: copy.latest,
              },
            ].map((section) =>
              section.items.length === 0 ? null : (
                <section className="space-y-3" key={section.label}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black tracking-normal text-slate-950 dark:text-slate-50">
                      {section.label}
                    </p>
                    <span className="inline-flex h-8 min-w-9 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-500 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
                      {section.items.length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {section.items.map((announcement) => (
                      <Link
                        className="block"
                        href={`/mobile/announcements/${announcement.id}`}
                        key={announcement.id}
                      >
                        <Card className={`${ANNOUNCEMENT_CARD} relative overflow-hidden p-4 text-slate-950 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-30px_rgba(31,58,95,0.55)] active:scale-[0.99] dark:text-slate-50`}>
                          {announcement.is_pinned ? (
                            <div
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-4 left-0 w-1 rounded-r-full bg-sky-300/80"
                            />
                          ) : null}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                {announcement.is_important && (
                                  <Badge className="rounded-full border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600 dark:border-red-200 dark:bg-red-50 dark:text-red-600">
                                    {copy.important}
                                  </Badge>
                                )}
                                {announcement.is_pinned && (
                                  <Badge className="rounded-full border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-black text-sky-700">
                                    {copy.pinned}
                                  </Badge>
                                )}
                              </div>
                              <h3 className="line-clamp-2 break-words text-[17px] font-black leading-snug tracking-normal text-slate-950 dark:text-slate-50">
                                {announcement.title}
                              </h3>
                              <p className="line-clamp-3 whitespace-pre-line text-[13px] font-semibold leading-5 text-slate-600 dark:text-slate-300">
                                {announcement.content}
                              </p>
                            </div>
                            {announcement.image_urls[0] ? (
                              <Image
                                alt=""
                                className="mt-1 h-[72px] w-[72px] shrink-0 rounded-xl object-cover shadow-sm"
                                height={72}
                                src={announcement.image_urls[0]}
                                width={72}
                              />
                            ) : null}
                          </div>

                          <div className="mt-3 border-t border-slate-200/80 pt-2.5 dark:border-white/10">
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="max-w-[9rem] truncate font-semibold text-slate-800 dark:text-slate-200">
                                  {announcement.author_name}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-300 dark:text-slate-600"
                                >
                                  &middot;
                                </span>
                                <span className="font-medium">
                                  {formatDate(
                                    announcement.published_at,
                                    session.user.preferredLanguage,
                                  )}
                                </span>
                              </div>
                              <span className="inline-flex shrink-0 items-center gap-2 font-medium">
                                <span className="inline-flex items-center gap-1">
                                  <Users className="size-3.5" aria-hidden="true" />
                                  {copy.target}
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="text-slate-300 dark:text-slate-600"
                                >
                                  &middot;
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <MessageCircle
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                  {announcement.comment_count}
                                </span>
                              </span>
                            </div>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              ),
            )}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
