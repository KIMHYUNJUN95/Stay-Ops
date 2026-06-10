import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  CalendarCheck2,
  Home,
  Search,
  Sparkles,
  Timer,
  Wrench,
} from "lucide-react";
import { HomeElapsedTimer } from "@/components/mobile/home-elapsed-timer";
import { HomeHeroAnimation } from "@/components/mobile/home-hero-animation";
import { HomeLastUpdatedClock } from "@/components/mobile/home-last-updated-clock";
import { HomeRefreshButton } from "@/components/mobile/home-refresh-button";
import { Card } from "@/components/ui/card";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import {
  formatActivityTimeJst,
  getHomeActiveCleaningSession,
  getHomeCheckInOutCounts,
  getHomeTodayActivity,
  type HomeActivityEvent,
} from "@/lib/home";
import { getOnboardingState } from "@/lib/onboarding";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { CANONICAL_TO_BUILDING_KEY, getCanonicalPropertyName } from "@/lib/room-label-normalization";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import type { Dictionary } from "@/lib/i18n";

type QuickActionItem = {
  accentClass: string;
  enabled: boolean;
  href: string;
  Icon: typeof Sparkles;
  iconClass: string;
  id: string;
  label: string;
  ringClass: string;
  subLabel: string;
};

function localizeRoomLabel(rawRoom: string, buildingLabels: Record<string, string>): string {
  const canonicalProperty = getCanonicalPropertyName(rawRoom);
  const buildingKey = CANONICAL_TO_BUILDING_KEY[canonicalProperty];
  if (!buildingKey) return rawRoom;
  const localizedBuilding = buildingLabels[buildingKey];
  if (!localizedBuilding) return rawRoom;
  const roomPart = rawRoom.slice(canonicalProperty.length).trim();
  return roomPart ? `${localizedBuilding} ${roomPart}` : localizedBuilding;
}

const CLEANING_TASK_DOT_COLOR: Record<string, string> = {
  simple: "bg-sky-400",
  checkout: "bg-[#1F3A5F]",
  long_stay: "bg-violet-500",
};

function getActivityDotColor(event: HomeActivityEvent): string {
  if (event.type === "cleaning_completed") {
    return (event.taskLabel && CLEANING_TASK_DOT_COLOR[event.taskLabel]) || "bg-slate-400";
  }
  if (event.type === "lost_item_reported") return "bg-amber-500";
  if (event.type === "maintenance_reported") return "bg-rose-500";
  return "bg-slate-400";
}

function resolveCleaningTaskLabel(
  rawTaskLabel: string | undefined,
  taskOptions: Record<string, string> | undefined,
): string | undefined {
  if (!rawTaskLabel) return undefined;
  if (!taskOptions) return rawTaskLabel;
  return taskOptions[rawTaskLabel] ?? rawTaskLabel;
}

function getActivityLabel(
  event: HomeActivityEvent,
  dict: Dictionary["mobile"],
  taskOptions: Record<string, string> | undefined,
): string {
  switch (event.type) {
    case "cleaning_completed":
      return dict.homeActivityCleaningCompleted(
        event.room,
        resolveCleaningTaskLabel(event.taskLabel, taskOptions),
      );
    case "lost_item_reported":
      return dict.homeActivityLostItemReported(event.room);
    case "maintenance_reported":
      return dict.homeActivityMaintenanceReported(event.room);
  }
}

export default async function MobileHomePage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile");
  }

  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const dictionary = getDictionary(session.user.preferredLanguage);

  const [counts, todayActivity, activeSession, announcements] =
    await Promise.all([
      getHomeCheckInOutCounts(session),
      getHomeTodayActivity(session, 10),
      getHomeActiveCleaningSession(session),
      getVisibleAnnouncements(session),
    ]);

  const latestAnnouncement = announcements.find((announcement) => announcement.is_important) ?? null;
  const lastUpdatedTime = formatActivityTimeJst(new Date().toISOString());

  const quickActionItems: QuickActionItem[] = [
    {
      accentClass: "from-sky-50 via-white to-sky-50",
      id: "cleaning",
      label: dictionary.mobile.quickActions.cleaning,
      href: "/mobile/cleaning",
      enabled: true,
      iconClass: "bg-[#315F91]/10 text-[#315F91] ring-[#315F91]/20",
      ringClass: "bg-[#315F91]/12",
      Icon: Sparkles,
      subLabel: dictionary.mobile.homeQuickActionStart,
    },
    {
      accentClass: "from-indigo-50 via-white to-blue-50",
      id: "maintenance",
      label: dictionary.mobile.quickActions.maintenance,
      href: "/mobile/maintenance/new",
      enabled: true,
      iconClass: "bg-indigo-50 text-indigo-700 ring-indigo-100",
      ringClass: "bg-indigo-500/12",
      Icon: Wrench,
      subLabel: dictionary.mobile.homeQuickActionGo,
    },
    {
      accentClass: "from-amber-50 via-white to-orange-50",
      id: "lostItem",
      label: dictionary.mobile.quickActions.lostItem,
      href: "/mobile/lost-found/new",
      enabled: true,
      iconClass: "bg-amber-50 text-amber-700 ring-amber-100",
      ringClass: "bg-amber-500/12",
      Icon: Search,
      subLabel: dictionary.mobile.homeQuickActionGo,
    },
    {
      accentClass: "from-rose-50 via-white to-pink-50",
      id: "order",
      label: dictionary.mobile.quickActions.order,
      href: "/mobile/orders/new",
      enabled: true,
      iconClass: "bg-rose-50 text-rose-700 ring-rose-100",
      ringClass: "bg-rose-500/12",
      Icon: Bell,
      subLabel: dictionary.mobile.homeQuickActionGo,
    },
  ];

  const announcementHref = latestAnnouncement
    ? `/mobile/announcements/${latestAnnouncement.id}`
    : "/mobile/announcements";
  const announcementAriaLabel = latestAnnouncement
    ? latestAnnouncement.title
    : dictionary.mobile.homeAnnouncementTitle;

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="home" badges={navBadges} title={dictionary.mobile.homeTitle}>
      <div className="space-y-5 pb-2">
        <HomeHeroAnimation />

        {/* Last updated — auto-refreshes every minute client-side */}
        <HomeLastUpdatedClock
          initialTime={lastUpdatedTime}
          locale={session.user.preferredLanguage}
        />

        {/* Important announcement */}
        {latestAnnouncement ? (
          <Link aria-label={announcementAriaLabel} className="block" href={announcementHref}>
            <Card className="relative overflow-hidden rounded-2xl border-border bg-surface p-4 shadow-[0_16px_32px_-26px_rgba(31,58,95,0.38)] backdrop-blur-none transition-opacity active:opacity-80">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white" aria-hidden="true" />
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Bell className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-[0.12em] text-primary">
                      {dictionary.mobile.homeAnnouncementTitle}
                    </span>
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary">
                      {dictionary.mobile.homeAnnouncementImportant}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-foreground">
                    {latestAnnouncement.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
                    {latestAnnouncement.content}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <span className="text-xs font-semibold text-primary" aria-hidden="true">
                  {dictionary.mobile.homeAnnouncementViewDetail}
                </span>
              </div>
            </Card>
          </Link>
        ) : null}

        {/* Check-in / Check-out counts */}
        <section
          aria-label={dictionary.mobile.homeStatsSectionLabel}
          className="grid grid-cols-2 gap-3.5"
        >
          {counts.status === "error" ? (
            <Card className="col-span-2 rounded-2xl border-border bg-white p-4 text-center shadow-[0_10px_22px_-22px_rgba(15,23,42,0.25)] backdrop-blur-none">
              <p className="text-sm font-semibold text-slate-500">
                {dictionary.mobile.homeSectionLoadError}
              </p>
              <HomeRefreshButton
                label={dictionary.mobile.homeRetry}
                className="mt-2 text-xs font-semibold text-primary disabled:opacity-40"
              />
            </Card>
          ) : (
            <>
              <Card className="relative overflow-hidden rounded-2xl border-border bg-surface p-4 shadow-[0_18px_34px_-28px_rgba(31,58,95,0.42)] backdrop-blur-none">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white" aria-hidden="true" />
                <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <CalendarCheck2 className="size-4" aria-hidden="true" />
                </div>
                <p className="text-3xl font-extrabold text-foreground">
                  {counts.status === "ok" ? counts.data.checkIns : "—"}
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  {dictionary.admin.stats.checkIns}
                </p>
              </Card>
              <Card className="relative overflow-hidden rounded-2xl border-border bg-surface p-4 shadow-[0_18px_34px_-28px_rgba(31,58,95,0.42)] backdrop-blur-none">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white" aria-hidden="true" />
                <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-[#4E63B3]/10 text-[#4E63B3] ring-1 ring-[#4E63B3]/20">
                  <Home className="size-4" aria-hidden="true" />
                </div>
                <p className="text-3xl font-extrabold text-foreground">
                  {counts.status === "ok" ? counts.data.checkOuts : "—"}
                </p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  {dictionary.admin.stats.checkOuts}
                </p>
              </Card>
            </>
          )}
        </section>

        {/* Active cleaning task */}
        <section aria-label={dictionary.mobile.homeActiveTaskTitle}>
          <h3 className="px-1 text-base font-extrabold tracking-[-0.01em] text-foreground">
            {dictionary.mobile.homeActiveTaskTitle}
          </h3>
          <Card className="mt-3 rounded-2xl border-border bg-surface p-4 shadow-[0_16px_30px_-26px_rgba(31,58,95,0.38)] backdrop-blur-none">
            {activeSession.status === "ok" ? (
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Timer className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">
                    {activeSession.data.room_label}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    {activeSession.data.task_label}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    {dictionary.mobile.homeActiveTaskElapsed}
                  </p>
                  <p className="text-sm font-bold text-primary">
                    <HomeElapsedTimer startedAt={activeSession.data.started_at} />
                  </p>
                </div>
              </div>
            ) : activeSession.status === "error" ? (
              <div className="py-1 text-center">
                <p className="text-sm font-semibold text-slate-500">
                  {dictionary.mobile.homeSectionLoadError}
                </p>
                <HomeRefreshButton
                  label={dictionary.mobile.homeRetry}
                  className="mt-2 text-xs font-semibold text-primary disabled:opacity-40"
                />
              </div>
            ) : (
              <div className="py-1 text-center">
                <p className="text-sm font-semibold text-slate-500">
                  {dictionary.mobile.homeActiveTaskNone}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {dictionary.mobile.homeActiveTaskNoneBody}
                </p>
                <Link
                  href="/mobile/cleaning"
                  className="mt-3 inline-block text-xs font-semibold text-primary"
                >
                  {dictionary.mobile.homeActiveTaskStartCta}
                </Link>
              </div>
            )}
          </Card>
        </section>

        {/* Quick actions */}
        <section>
          <h3 className="px-1 text-base font-extrabold tracking-[-0.01em] text-foreground">
            {dictionary.mobile.homeQuickActionsTitle}
          </h3>
          <div className="mt-3 grid grid-cols-2 gap-3.5">
            {quickActionItems.map((action) => {
              const iconClass = !action.enabled
                ? "bg-slate-50 text-slate-400 ring-slate-100"
                : action.iconClass;
              const subLabelClass = !action.enabled
                ? "text-slate-400"
                : "text-slate-500";

              const cardContent = (
                <>
                  <div className="relative mx-auto flex size-16 items-center justify-center">
                    <div
                      className={`absolute inset-0 rounded-full ${action.enabled ? action.ringClass : "bg-slate-100/70"}`}
                      aria-hidden="true"
                    />
                    <div className={`relative flex size-11 items-center justify-center rounded-2xl ring-1 shadow-[0_12px_24px_-18px_rgba(31,58,95,0.5)] ${iconClass}`}>
                      <action.Icon className="size-5" aria-hidden="true" />
                    </div>
                  </div>
                  <p className={`mt-2 text-center text-sm font-bold ${action.enabled ? "text-foreground" : "text-slate-400"}`}>
                    {action.label}
                  </p>
                  <p className={`mt-1 text-center text-xs font-medium ${subLabelClass}`}>
                    {action.enabled ? action.subLabel : dictionary.mobile.homeQuickActionComingSoon}
                  </p>
                </>
              );

              if (!action.enabled) {
                return (
                  <div
                    key={action.id}
                    aria-disabled="true"
                    className="cursor-not-allowed"
                    tabIndex={0}
                  >
                    <Card className="rounded-2xl border-border bg-white p-4 opacity-50 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.24)] backdrop-blur-none select-none">
                      {cardContent}
                    </Card>
                  </div>
                );
              }

              return (
                <Link key={action.id} className="block" href={action.href}>
                  <Card className="relative overflow-hidden rounded-2xl border-border bg-surface p-4 shadow-[0_18px_34px_-28px_rgba(31,58,95,0.42)] backdrop-blur-none transition-[transform,box-shadow] active:scale-[0.98]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white" aria-hidden="true" />
                    {cardContent}
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Today's activity timeline */}
        <section className="pb-2">
          <h3 className="px-1 text-base font-extrabold tracking-[-0.01em] text-foreground">
            {dictionary.mobile.homeTodayActivityTitle}
          </h3>
          <Card className="mt-3 rounded-2xl border-border bg-surface p-5 shadow-[0_16px_30px_-26px_rgba(31,58,95,0.36)] backdrop-blur-none">
            {todayActivity.status === "error" ? (
              <div className="py-1 text-center">
                <p className="text-sm text-slate-500">
                  {dictionary.mobile.homeSectionLoadError}
                </p>
                <HomeRefreshButton
                  label={dictionary.mobile.homeRetry}
                  className="mt-2 text-xs font-semibold text-primary disabled:opacity-40"
                />
              </div>
            ) : todayActivity.status === "empty" ? (
              <div className="py-1 text-center">
                <p className="text-sm text-slate-500">
                  {dictionary.mobile.homeActivityEmpty}
                </p>
                <Link
                  href="/mobile/cleaning"
                  className="mt-3 inline-block text-xs font-semibold text-primary"
                >
                  {dictionary.mobile.homeActivityStartCta}
                </Link>
              </div>
            ) : (
              <ol className="space-y-5 border-l-2 border-border pl-4">
                {todayActivity.data.map((event) => {
                  const localizedRoom = localizeRoomLabel(
                    event.room,
                    dictionary.cleaning.buildingLabels,
                  );
                  return (
                    <li className="relative" key={event.id}>
                      <span
                        className={`absolute -left-[22px] top-1.5 size-2.5 rounded-full ${getActivityDotColor(event)}`}
                        aria-hidden="true"
                      />
                      <p className="text-[11px] font-semibold text-slate-500">
                        {formatActivityTimeJst(event.timestamp)}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {getActivityLabel({ ...event, room: localizedRoom }, dictionary.mobile, dictionary.cleaning?.taskOptions)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </section>
      </div>

      <div className="sr-only">
        {dictionary.mobile.today}
        {dictionary.mobile.snapshotTitle}
        {dictionary.mobile.snapshotDescription}
        {dictionary.mobile.ready}
      </div>
    </MobileShell>
  );
}
