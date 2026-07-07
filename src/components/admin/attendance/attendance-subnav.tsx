import Link from "next/link";
import type { ReactNode } from "react";
import { ChartColumn, Clock, Bus, Tags, Users, Wallet, Plane } from "lucide-react";
import { AdminDatePicker } from "../shared/admin-date-picker";
import { AdminMonthPicker } from "../shared/admin-month-picker";
import type { Dictionary } from "@/lib/i18n";

type Tab = "overview" | "roster" | "queue" | "payroll" | "transport" | "wages" | "leave";
type Att = Dictionary["admin"]["attendanceConsole"];

const TABS: { id: Tab; href: string; icon: ReactNode; labelKey: keyof Att }[] = [
  { id: "overview", href: "/admin/attendance", icon: <ChartColumn />, labelKey: "tabOverview" },
  { id: "queue", href: "/admin/attendance/queue", icon: <Clock />, labelKey: "tabQueue" },
  { id: "payroll", href: "/admin/attendance/payroll", icon: <Wallet />, labelKey: "tabPayroll" },
  { id: "wages", href: "/admin/attendance/wages", icon: <Tags />, labelKey: "tabWages" },
  { id: "transport", href: "/admin/attendance/transport", icon: <Bus />, labelKey: "tabTransport" },
  { id: "roster", href: "/admin/attendance/roster", icon: <Users />, labelKey: "tabRoster" },
  { id: "leave", href: "/admin/attendance/leave", icon: <Plane />, labelKey: "tabLeave" },
];

export function AttendanceSubnav({
  active,
  monthLabel,
  c,
  badges,
  ym,
  localeTag,
  monthPickerBasePath,
  preserveMonthQueryKeys,
  datePicker,
}: {
  active: Tab;
  monthLabel: string;
  c: Att;
  badges?: Partial<Record<Tab, { n: number; urgent?: boolean }>>;
  /** When set, carried as `?ym=` on every tab link so the selected month persists across tabs. */
  ym?: string;
  localeTag?: string;
  monthPickerBasePath?: string;
  preserveMonthQueryKeys?: string[];
  datePicker?: {
    date: string;
    todayDate: string;
    basePath?: string;
  };
}) {
  const suffix = ym ? `?ym=${ym}` : "";
  const activeTab = TABS.find((tab) => tab.id === active);
  const pickerBasePath = monthPickerBasePath ?? activeTab?.href ?? "/admin/attendance";
  return (
    <div className="subnav" role="tablist" aria-label={c.crumb}>
      {TABS.map((t) => {
        const badge = badges?.[t.id];
        const label = c[t.labelKey] as string;
        return (
          <Link
            key={t.id}
            href={`${t.href}${suffix}`}
            className={`subnav__t${t.id === "roster" ? " subnav__t--entry" : ""}${
              t.id === active ? " on" : ""
            }`}
            aria-current={t.id === active ? "page" : undefined}
          >
            <span className="ic">{t.icon}</span>
            {label}
            {badge && badge.n > 0 ? (
              <span className={`cnt${badge.urgent ? " urgent" : ""}`}>{badge.n}</span>
            ) : null}
          </Link>
        );
      })}
      <span className="subnav__spacer" />
      <div className="subnav__month" aria-label={monthLabel}>
        {datePicker && localeTag ? (
          <AdminDatePicker
            date={datePicker.date}
            todayDate={datePicker.todayDate}
            localeTag={localeTag}
            basePath={datePicker.basePath ?? activeTab?.href ?? "/admin/attendance/roster"}
            labels={{
              prevDay: c.payPagerPrev,
              nextDay: c.payPagerNext,
              prevMonth: c.monthPickerPrevYear,
              nextMonth: c.monthPickerNextYear,
              open: c.rosterDateSelectLabel,
              today: c.rosterGoToday,
              todayTag: c.rosterTodayTag,
              pastTag: c.rosterPastTag,
            }}
          />
        ) : ym && localeTag ? (
          <AdminMonthPicker
            ym={ym}
            localeTag={localeTag}
            basePath={pickerBasePath}
            preserveQueryKeys={preserveMonthQueryKeys}
            labels={{
              prevMonth: c.payPagerPrev,
              nextMonth: c.payPagerNext,
              prevYear: c.monthPickerPrevYear,
              nextYear: c.monthPickerNextYear,
              open: c.monthPickerOpen,
              thisMonth: c.monthPickerThisMonth,
            }}
          />
        ) : (
          monthLabel
        )}
      </div>
    </div>
  );
}
