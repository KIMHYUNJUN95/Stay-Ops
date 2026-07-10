import { AdminShell } from "@/components/shell/admin-shell";
import { AttendanceSubnav } from "@/components/admin/attendance/attendance-subnav";
import { AttendanceRosterClient } from "@/components/admin/attendance/attendance-roster-client";
import { getAttendanceRoster } from "@/lib/attendance-roster";
import { currentTokyoYm, getAdminAttendanceBadgeStats } from "@/lib/admin-attendance";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";

function tokyoDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function clampRosterDate(input: string | undefined, todayDate: string): string {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return todayDate;
  if (input > todayDate) return todayDate;

  const ninetyDaysAgo = new Date(`${todayDate}T00:00:00+09:00`);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const minDate = tokyoDateKey(ninetyDaysAgo);
  return input >= minDate ? input : todayDate;
}

function dateLabel(dateKey: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${dateKey}T00:00:00+09:00`));
}

export default async function AdminAttendanceRosterPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const [session, params] = await Promise.all([
    requireAdminPageSession({ nextPath: "/admin/attendance/roster" }),
    searchParams,
  ]);

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const c = dictionary.admin.attendanceConsole;
  const localeTag = locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
  const todayDate = tokyoDateKey();
  const operatingDate = clampRosterDate(params.date, todayDate);
  const carriedYm = currentTokyoYm();

  const [badgeStats, rosterDay] = await Promise.all([
    getAdminAttendanceBadgeStats(session, carriedYm),
    getAttendanceRoster(session.organization.id, operatingDate, localeTag),
  ]);

  return (
    <AdminShell activeItem="attendance" title={c.headerRoster}>
      <AttendanceSubnav
        active="roster"
        monthLabel={dateLabel(rosterDay.operatingDate, localeTag)}
        c={c}
        localeTag={localeTag}
        datePicker={{
          date: rosterDay.operatingDate,
          todayDate,
          basePath: "/admin/attendance/roster",
        }}
        badges={{
          roster: { n: rosterDay.counts.working + rosterDay.counts.on_break },
          queue: {
            n: badgeStats.queueOpen,
            urgent: badgeStats.queueUrgent > 0,
          },
          payroll: { n: badgeStats.payrollTargets },
          transport: { n: badgeStats.transportPending },
        }}
      />
      <AttendanceRosterClient
        key={rosterDay.operatingDate}
        initialRosterDay={rosterDay}
        initialTodayDate={todayDate}
        locale={locale}
        localeTag={localeTag}
      />
    </AdminShell>
  );
}
