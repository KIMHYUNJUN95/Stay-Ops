import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CircleCheck, Megaphone } from "lucide-react";
import { AnnouncementCommentsSection } from "@/components/announcements/announcement-comments-section";
import { AnnouncementImageGrid } from "@/components/announcements/announcement-image-grid";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import {
  ensureAnnouncementRead,
  getAnnouncementComments,
  getVisibleAnnouncementById,
} from "@/lib/announcements";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

const ANNOUNCEMENT_CARD =
  "rounded-[24px] border border-slate-200/80 bg-surface shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)] backdrop-blur-none";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

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

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MobileAnnouncementDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [state, session, routeParams] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
  ]);
  const query = (await searchParams) ?? {};

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=/mobile/announcements/${routeParams.id}`);
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const copy = getAnnouncementDictionary(session.user.preferredLanguage);
  const announcement = await getVisibleAnnouncementById(session, routeParams.id);

  if (!announcement) {
    notFound();
  }

  const [readAt, comments] = await Promise.all([
    ensureAnnouncementRead(announcement, session.user.id),
    getAnnouncementComments(announcement, session.user.id),
  ]);
  const errorKey = firstParam(query.error);
  const errorMessage = errorKey
    ? (copy.errors[errorKey] ?? copy.errors.comment_failed)
    : null;
  const successMessage =
    firstParam(query.commentSaved) === "1"
      ? copy.commentSaved
      : firstParam(query.commentUpdated) === "1"
        ? copy.commentUpdated
        : firstParam(query.commentDeleted) === "1"
          ? copy.commentDeleted
          : null;

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell
      activeItem="announcements"
      appearance="announcement"
      badges={navBadges}
      title={copy.readAnnouncement}
    >
      <div className="space-y-3">
        <Link
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/82 px-3 py-1.5 text-xs font-black text-slate-500 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors hover:text-slate-900"
          href="/mobile/announcements"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {copy.backToAnnouncements}
        </Link>

        <Card className={`${ANNOUNCEMENT_CARD} relative overflow-hidden p-5 text-foreground`}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-10 size-32 rounded-full bg-primary/10 blur-2xl"
          />
          <div className="relative">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {announcement.is_important && (
              <Badge className="rounded-full border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600">
                {copy.important}
              </Badge>
            )}
            <p className="text-xs font-bold text-slate-500">
              {copy.target}
            </p>
          </div>
          <h2 className="break-words text-[24px] font-black leading-tight tracking-normal">
            {announcement.title}
          </h2>
          <div className="mt-4 flex items-center gap-3 border-t border-slate-200/80 pt-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
              <Megaphone className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {announcement.author_name}
              </p>
              <p className="line-clamp-2 text-xs leading-5 text-slate-500">
                {announcement.organization_name}{" "}
                <span
                  aria-hidden="true"
                  className="px-1 text-slate-300"
                >
                  ·
                </span>
                {formatDate(announcement.published_at, session.user.preferredLanguage)}
              </p>
            </div>
          </div>
          </div>
        </Card>

        <Card className={`${ANNOUNCEMENT_CARD} p-5 text-foreground`}>
          <p className="whitespace-pre-line break-words text-[15px] font-semibold leading-7 text-slate-700">
            {announcement.content}
          </p>
        </Card>

        {announcement.image_urls.length > 0 ? (
          <Card className={`${ANNOUNCEMENT_CARD} p-4 text-foreground`}>
            <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">
              {copy.imageAttachments} ({announcement.image_urls.length})
            </p>
            <AnnouncementImageGrid
              imageUrls={announcement.image_urls}
              variant="feature"
            />
          </Card>
        ) : null}

        <Card className={`${ANNOUNCEMENT_CARD} p-4 text-foreground`}>
          <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-3 py-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary ring-1 ring-primary/15">
              <CircleCheck className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {copy.markAsRead}
              </p>
              <p className="text-xs text-slate-500">
                {copy.markedAsRead}
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/82 px-3 py-2 text-xs font-bold text-slate-500 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
            {copy.readAt}:{" "}
            {readAt
              ? formatDate(readAt, session.user.preferredLanguage)
              : copy.notReadYet}
          </div>
        </Card>
      </div>

      <AnnouncementCommentsSection
        allowComments={announcement.allow_comments}
        announcementId={announcement.id}
        comments={comments}
        errorMessage={errorMessage}
        appearance="announcement"
        locale={session.user.preferredLanguage}
        returnTo={`/mobile/announcements/${announcement.id}`}
        successMessage={successMessage}
      />
    </MobileShell>
  );
}
