import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  ChevronRight,
  Package,
  QrCode,
  Search,
  Shirt,
  Sparkles,
  Timer,
  Wifi,
  Wrench,
} from "lucide-react";
import {
  HomeCheckInOut,
  type HomeReservationItem,
} from "@/components/mobile/home-checkinout";
import { HomeElapsedTimer } from "@/components/mobile/home-elapsed-timer";
import { HomeLastUpdatedClock } from "@/components/mobile/home-last-updated-clock";
import { HomeRefreshButton } from "@/components/mobile/home-refresh-button";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getCurrentOpenSession } from "@/lib/attendance-sessions";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import {
  formatActivityTimeJst,
  getHomeActiveCleaningSession,
  getHomeCheckInOutReservations,
  getHomeTodayActivity,
  type HomeActivityEvent,
  type HomeReservationRow,
} from "@/lib/home";
import { getOnboardingState } from "@/lib/onboarding";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { CANONICAL_TO_BUILDING_KEY, getCanonicalPropertyName } from "@/lib/room-label-normalization";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import type { Dictionary, Locale } from "@/lib/i18n";
import "@/components/mobile/home-screen.css";

type QuickActionItem = {
  colorClass: "a" | "b" | "c" | "d";
  href: string;
  Icon: typeof Sparkles;
  id: string;
  label: string;
};

// Build a localized "building room" label from a reservation's raw property + room.
function buildPlaceLabel(
  propertyName: string,
  roomLabel: string,
  buildingLabels: Record<string, string>,
): string {
  const canonicalProperty = getCanonicalPropertyName(propertyName);
  const buildingKey = CANONICAL_TO_BUILDING_KEY[canonicalProperty];
  const building = (buildingKey && buildingLabels[buildingKey]) || propertyName;
  return roomLabel ? `${building} ${roomLabel}`.trim() : building;
}

function toReservationItems(
  rows: HomeReservationRow[],
  buildingLabels: Record<string, string>,
): HomeReservationItem[] {
  return rows.map((row) => ({
    id: row.id,
    guestName: row.guestName,
    place: buildPlaceLabel(row.propertyName, row.roomLabel, buildingLabels),
    source: row.source,
  }));
}

function localizeRoomLabel(rawRoom: string, buildingLabels: Record<string, string>): string {
  const canonicalProperty = getCanonicalPropertyName(rawRoom);
  const buildingKey = CANONICAL_TO_BUILDING_KEY[canonicalProperty];
  if (!buildingKey) return rawRoom;
  const localizedBuilding = buildingLabels[buildingKey];
  if (!localizedBuilding) return rawRoom;
  const roomPart = rawRoom.slice(canonicalProperty.length).trim();
  return roomPart ? `${localizedBuilding} ${roomPart}` : localizedBuilding;
}

// Activity-event → log-row icon accent (mirrors the timeline dot meaning of the
// previous home so each event type stays distinguishable across the redesign).
function getActivityLogClass(event: HomeActivityEvent): string {
  if (event.type === "lost_item_reported") return "lost";
  if (event.type === "maintenance_reported") return "maint";
  if (event.type === "order_requested") return "order";
  if (event.type === "linen_returned") return "linen";
  return "cleaning";
}

function getActivityLogIcon(event: HomeActivityEvent) {
  if (event.type === "lost_item_reported") return <Search aria-hidden="true" />;
  if (event.type === "maintenance_reported") return <Wrench aria-hidden="true" />;
  if (event.type === "order_requested") return <Package aria-hidden="true" />;
  if (event.type === "linen_returned") return <Shirt aria-hidden="true" />;
  return <Sparkles aria-hidden="true" />;
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
    case "order_requested":
      return dict.homeActivityOrderRequested(event.room);
    case "linen_returned":
      return dict.homeActivityLinenReturned(event.room);
  }
}

const GREETING_LOCALE_TAG: Record<Locale, string> = {
  ko: "ko-KR",
  ja: "ja-JP",
  en: "en-US",
};

function formatGreetingDate(locale: Locale): string {
  return new Intl.DateTimeFormat(GREETING_LOCALE_TAG[locale] ?? "ko-KR", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
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

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const m = dictionary.mobile;
  const a = dictionary.attendance;

  const [checkInOut, todayActivity, activeSession, announcements, openAttendanceSession] =
    await Promise.all([
      getHomeCheckInOutReservations(session),
      getHomeTodayActivity(session, 10),
      getHomeActiveCleaningSession(session),
      getVisibleAnnouncements(session),
      getCurrentOpenSession(session.organization.id, session.user.id),
    ]);

  const buildingLabels = dictionary.cleaning.buildingLabels;

  const latestAnnouncement = announcements.find((announcement) => announcement.is_important) ?? null;
  const lastUpdatedTime = formatActivityTimeJst(new Date().toISOString());

  const greetDate = formatGreetingDate(locale);
  const userName = session.user.name?.trim() || "";
  const avatarInitial = userName ? Array.from(userName)[0] : "·";

  const quickActionItems: QuickActionItem[] = [
    {
      id: "cleaning",
      label: m.quickActions.cleaning,
      href: "/mobile/cleaning",
      Icon: Sparkles,
      colorClass: "a",
    },
    {
      id: "maintenance",
      label: m.quickActions.maintenance,
      href: "/mobile/maintenance/new",
      Icon: Wrench,
      colorClass: "b",
    },
    {
      id: "lostItem",
      label: m.quickActions.lostItem,
      href: "/mobile/lost-found/new",
      Icon: Search,
      colorClass: "c",
    },
    {
      id: "order",
      label: m.quickActions.order,
      href: "/mobile/orders/new",
      Icon: Bell,
      colorClass: "d",
    },
  ];

  const announcementHref = latestAnnouncement
    ? `/mobile/announcements/${latestAnnouncement.id}`
    : "/mobile/announcements";

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="home" badges={navBadges} title={m.homeTitle}>
      <div className="hm pb-2">
        {/* Greeting */}
        <div className="hm__greet">
          <div>
            <div className="hm__greet-d">{greetDate}</div>
            <div className="hm__greet-n">{m.homeGreeting(userName)}</div>
          </div>
          <span className="hm__greet-av" aria-hidden="true">
            {avatarInitial}
          </span>
        </div>

        {/* Last updated — auto-refreshes every minute client-side */}
        <div className="hm__updated">
          <HomeLastUpdatedClock initialTime={lastUpdatedTime} locale={locale} />
        </div>

        {/* Quick attendance hero — now reflects the real open attendance session state. */}
        <Link
          aria-label={openAttendanceSession ? m.homeClockOpenTitle : m.homeClockIdleTitle}
          className="hm__clockhero"
          href="/mobile/attendance"
        >
          <span className="hm__ch-deco" aria-hidden="true" />
          <div className="hm__ch-top">
            <span className="hm__ch-state">
              {openAttendanceSession
                ? (openAttendanceSession.openBreakStartedAt ? a.ringOnBreak : a.ringWorking)
                : m.homeClockBefore}
            </span>
            <span className="hm__ch-tag">
              {openAttendanceSession
                ? (openAttendanceSession.openBreakStartedAt ? a.ringOnBreak : a.ringWorking)
                : m.homeClockWaiting}
            </span>
          </div>
          <div className="hm__ch-mid">
            <div>
              {openAttendanceSession?.clockInAt ? (
                <div className="hm__ch-big hm__ch-big--timer mono">
                  <HomeElapsedTimer startedAt={openAttendanceSession.clockInAt} />
                </div>
              ) : (
                <div className="hm__ch-big">{m.homeClockIdleTitle}</div>
              )}
              <div className="hm__ch-sub">
                {openAttendanceSession
                  ? (openAttendanceSession.openBreakStartedAt
                      ? m.homeClockBreakSub
                      : m.homeClockOpenSub)
                  : m.homeClockIdleSub}
              </div>
            </div>
            <span className="hm__ch-btn">
              <span className="ic">
                <QrCode aria-hidden="true" />
              </span>
              {openAttendanceSession ? m.homeClockOpenCta : m.homeClockIn}
            </span>
          </div>
          {openAttendanceSession ? (
            <div className="hm__ch-meta">
              <div className="hm__ch-meta-item">
                <span className="hm__ch-meta-k">{a.clockInSite}</span>
                <span className="hm__ch-meta-v">{openAttendanceSession.siteName}</span>
              </div>
              <div className="hm__ch-meta-item">
                <span className="hm__ch-meta-k">{a.clockInTime}</span>
                <span className="hm__ch-meta-v mono">{openAttendanceSession.clockInTimeLabel}</span>
              </div>
            </div>
          ) : null}
          <div className="hm__ch-methods">
            <span className="hm__mchip hm__mchip--on">
              <span className="ic">
                <QrCode aria-hidden="true" />
              </span>
              {m.homeClockMethodQr}
            </span>
            <span className="hm__mchip hm__mchip--ghost">
              <span className="ic">
                <Wifi aria-hidden="true" />
              </span>
              {m.homeClockMethodWifi}
            </span>
          </div>
        </Link>

        {/* Important announcement */}
        {latestAnnouncement ? (
          <Link aria-label={latestAnnouncement.title} href={announcementHref}>
            <div className="hm__notice">
              <span className="hm__notice-ic">
                <Bell aria-hidden="true" />
              </span>
              <div className="hm__notice-b">
                <div className="hm__notice-h">
                  <span className="hm__notice-cat">{m.homeAnnouncementTitle}</span>
                  <span className="hm__notice-badge">{m.homeAnnouncementImportant}</span>
                </div>
                <div className="hm__notice-t">{latestAnnouncement.title}</div>
                <div className="hm__notice-s">{latestAnnouncement.content}</div>
                <span className="hm__notice-more">
                  {m.homeAnnouncementViewDetail}
                  <ChevronRight aria-hidden="true" />
                </span>
              </div>
            </div>
          </Link>
        ) : null}

        {/* Today's check-in / check-out — cards tap to open a detail sheet */}
        <div className="hm__sectt">{m.homeStatsSectionLabel}</div>
        <section aria-label={m.homeStatsSectionLabel}>
          {checkInOut.status === "ok" ? (
            <HomeCheckInOut
              checkInLabel={dictionary.admin.stats.checkIns}
              checkOutLabel={dictionary.admin.stats.checkOuts}
              checkIns={toReservationItems(checkInOut.data.checkIns, buildingLabels)}
              checkOuts={toReservationItems(checkInOut.data.checkOuts, buildingLabels)}
              emptyCheckIn={m.homeCheckInEmpty}
              emptyCheckOut={m.homeCheckOutEmpty}
              guestFallback={m.homeGuestUnknown}
            />
          ) : (
            <div className="hm__stats">
              <div className="hm__stat hm__stat--full">
                <p className="hm__stat-k">{m.homeSectionLoadError}</p>
                <HomeRefreshButton label={m.homeRetry} className="hm__state-cta" />
              </div>
            </div>
          )}
        </section>

        {/* Active cleaning task */}
        <div className="hm__sectt">{m.homeActiveTaskTitle}</div>
        <section aria-label={m.homeActiveTaskTitle}>
          {activeSession.status === "ok" ? (
            <div className="hm__task">
              <span className="hm__task-ic">
                <Timer aria-hidden="true" />
              </span>
              <div className="hm__task-b">
                <div className="hm__task-t">{activeSession.data.room_label}</div>
                <div className="hm__task-s">{activeSession.data.task_label}</div>
              </div>
              <div className="hm__task-right">
                <div className="hm__task-rk">{m.homeActiveTaskElapsed}</div>
                <div className="hm__task-rv">
                  <HomeElapsedTimer startedAt={activeSession.data.started_at} />
                </div>
              </div>
            </div>
          ) : activeSession.status === "error" ? (
            <div className="hm__taskempty">
              <div className="hm__taskempty-s" style={{ marginTop: 0 }}>
                {m.homeSectionLoadError}
              </div>
              <HomeRefreshButton label={m.homeRetry} className="hm__state-cta" />
            </div>
          ) : (
            <div className="hm__taskempty">
              <div className="hm__taskempty-t">{m.homeActiveTaskNone}</div>
              <div className="hm__taskempty-s">{m.homeActiveTaskNoneBody}</div>
            </div>
          )}
        </section>

        {/* Quick actions */}
        <div className="hm__sectt-row">
          <span className="hm__sectt">{m.homeQuickActionsTitle}</span>
        </div>
        <nav className="hm__qa" aria-label={m.homeQuickActionsTitle}>
          {quickActionItems.map((action) => (
            <Link className="hm__qa-item" href={action.href} key={action.id}>
              <span className={`hm__qa-ic ${action.colorClass}`}>
                <action.Icon aria-hidden="true" />
              </span>
              <span className="hm__qa-lbl">{action.label}</span>
            </Link>
          ))}
        </nav>

        {/* Today's activity timeline */}
        <div className="hm__sectt-row">
          <span className="hm__sectt">{m.homeTodayActivityTitle}</span>
        </div>
        <section aria-label={m.homeTodayActivityTitle}>
          {todayActivity.status === "error" ? (
            <div className="hm__log">
              <div className="hm__state-msg">
                <p>{m.homeSectionLoadError}</p>
                <HomeRefreshButton label={m.homeRetry} className="hm__state-cta" />
              </div>
            </div>
          ) : todayActivity.status === "empty" ? (
            <div className="hm__log">
              <div className="hm__state-msg">
                <p>{m.homeActivityEmpty}</p>
              </div>
            </div>
          ) : (
            <div className="hm__log">
              {todayActivity.data.map((event) => {
                const localizedRoom = localizeRoomLabel(
                  event.room,
                  dictionary.cleaning.buildingLabels,
                );
                return (
                  <div className="hm__log-r" key={event.id}>
                    <span className={`hm__log-ic ${getActivityLogClass(event)}`}>
                      {getActivityLogIcon(event)}
                    </span>
                    <div className="hm__log-b">
                      <div className="hm__log-t">
                        {getActivityLabel(
                          { ...event, room: localizedRoom },
                          m,
                          dictionary.cleaning?.taskOptions,
                        )}
                      </div>
                    </div>
                    <span className="hm__log-time">
                      {formatActivityTimeJst(event.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <div className="sr-only">
        {m.today}
        {m.snapshotTitle}
        {m.snapshotDescription}
        {m.ready}
      </div>
    </MobileShell>
  );
}
