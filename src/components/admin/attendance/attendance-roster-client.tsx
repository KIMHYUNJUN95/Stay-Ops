"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Clock,
  FileText,
  Users,
} from "lucide-react";
import { loadAdminAttendanceRoster } from "@/app/admin/attendance/roster/actions";
import type { RosterDay, RosterEntry, RosterStatusKey } from "@/lib/attendance-roster";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";

type Att = Dictionary["admin"]["attendanceConsole"];

type Props = {
  initialRosterDay: RosterDay;
  initialTodayDate: string;
  locale: Locale;
  localeTag: string;
};

type StatusMeta = {
  cls: string;
  label: string;
  dotVar: string;
  active?: boolean;
};

function Ic({ children }: { children: ReactNode }) {
  return <span className="ic">{children}</span>;
}

function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00+09:00`);
}

function dateLabel(dateKey: string, localeTag: string): string {
  const date = parseDateKey(dateKey);
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function timeLabel(localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

function statusMeta(status: RosterStatusKey, c: Att): StatusMeta {
  const map: Record<RosterStatusKey, StatusMeta> = {
    working: { cls: "work", label: c.rosterStatusWorking, dotVar: "--done", active: true },
    on_break: { cls: "rest", label: c.rosterStatusOnBreak, dotVar: "--warn", active: true },
    done: { cls: "done", label: c.rosterStatusDone, dotVar: "--muted" },
    needs_review: { cls: "review", label: c.rosterStatusNeedsReview, dotVar: "--danger" },
    void: { cls: "void", label: c.rosterStatusVoid, dotVar: "--faint" },
  };
  return map[status];
}

function breakLabel(entry: RosterEntry, c: Att, nowMs: number): string {
  // Total break minutes for the day = closed breaks + (current ongoing break so far).
  let totalSeconds = entry.closedBreakSeconds;
  if (entry.hasOpenBreak && entry.openBreakStartedAt) {
    totalSeconds += Math.max(
      0,
      Math.floor((nowMs - new Date(entry.openBreakStartedAt).getTime()) / 1000),
    );
  }
  if (entry.breakCount === 0 && !entry.hasOpenBreak) return c.rosterBreakNone;
  // An ongoing break with no measurable elapsed time yet.
  if (entry.hasOpenBreak && totalSeconds < 60) return c.rosterBreakOpen;
  return c.rosterBreakElapsed(Math.floor(totalSeconds / 60));
}

function RosterRow({ entry, c, nowMs }: { entry: RosterEntry; c: Att; nowMs: number }) {
  const meta = statusMeta(entry.statusKey, c);
  const out = entry.clockOutTimeLabel ?? c.rosterNotClockedOut;
  const site = entry.clockOutSiteName && entry.clockOutSiteName !== entry.siteName
    ? `${entry.siteName} -> ${entry.clockOutSiteName}`
    : entry.siteName || c.rosterSiteUnknown;

  return (
    <tr className={entry.statusKey === "needs_review" ? "flag" : undefined}>
      <td>
        <div className="rwho">
          <span className="avatar rwho__av">{entry.avatarInitial}</span>
          <div>
            <div className="rwho__nm">{entry.name}</div>
            <div className="rwho__role">
              {entry.role} <span className="code">{entry.roleCode}</span>
            </div>
          </div>
        </div>
      </td>
      <td>
        <span className="rsite">{site}</span>
        <span className="rsite_task">{c.rosterSessionCode(entry.sessionId.slice(0, 8))}</span>
      </td>
      <td>
        <span className="rt-time">{entry.clockInTimeLabel}</span>
      </td>
      <td>
        <span className={`rt-time${entry.clockOutTimeLabel ? "" : " none"}`}>{out}</span>
      </td>
      <td>
        <span className={`rt-break${entry.breakCount === 0 && !entry.hasOpenBreak ? " none" : ""}`}>
          {breakLabel(entry, c, nowMs)}
        </span>
      </td>
      <td>
        <span className={`rchip ${meta.cls}`}>
          <span className={`d${meta.active ? " live-d" : ""}`} />
          {meta.label}
        </span>
        {entry.statusKey === "needs_review" ? (
          <div className="rt-note">
            <Ic>
              <AlertTriangle />
            </Ic>
            {c.rosterReviewNote}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function Summary({ rosterDay, c }: { rosterDay: RosterDay; c: Att }) {
  const cells: Array<{ status: RosterStatusKey; n: number }> = [
    { status: "working", n: rosterDay.counts.working },
    { status: "on_break", n: rosterDay.counts.on_break },
    { status: "needs_review", n: rosterDay.counts.needs_review },
    { status: "done", n: rosterDay.counts.done },
    { status: "void", n: rosterDay.counts.void },
  ];
  return (
    <div className="rsum">
      <div className="rsum__total">
        <Ic>
          <Users />
        </Ic>
        <div>
          <span className="n">
            {rosterDay.counts.total}
            <small>{c.unitPeople}</small>
          </span>
          <span className="k">{c.rosterTotalPeople}</span>
        </div>
      </div>
      {cells.map((cell) => {
        const meta = statusMeta(cell.status, c);
        return (
          <div key={cell.status} className="rsum__cell">
            <span className="rsum__n">
              {cell.n}
              <small>{cell.status === "needs_review" || cell.status === "void" ? c.unitCount : c.unitPeople}</small>
            </span>
            <span className="rsum__lab">
              <span className="d" style={{ background: `var(${meta.dotVar})` }} />
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RosterTable({ rosterDay, c, nowMs }: { rosterDay: RosterDay; c: Att; nowMs: number }) {
  const order: RosterStatusKey[] = ["working", "on_break", "needs_review", "done", "void"];
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <table className="rtbl">
        <thead>
          <tr>
            <th style={{ paddingLeft: 16 }}>{c.rosterColWho}</th>
            <th>{c.rosterColSiteTask}</th>
            <th>{c.rosterColIn}</th>
            <th>{c.rosterColOut}</th>
            <th>{c.rosterColBreak}</th>
            <th>{c.rosterColStatus}</th>
          </tr>
        </thead>
        <tbody>
          {order.map((status) => {
            const rows = rosterDay.entries.filter((entry) => entry.statusKey === status);
            if (rows.length === 0) return null;
            const meta = statusMeta(status, c);
            return (
              <FragmentGroup key={status} label={meta.label} count={rows.length} dotVar={meta.dotVar}>
                {rows.map((entry) => (
                  <RosterRow key={entry.sessionId} entry={entry} c={c} nowMs={nowMs} />
                ))}
              </FragmentGroup>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentGroup({
  label,
  count,
  dotVar,
  children,
}: {
  label: string;
  count: number;
  dotVar: string;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="grouphd">
        <td colSpan={6}>
          <div className="grouphd__l">
            <span className="d" style={{ background: `var(${dotVar})` }} />
            {label}
            <span className="n">{count}</span>
          </div>
        </td>
      </tr>
      {children}
    </>
  );
}

export function AttendanceRosterClient({
  initialRosterDay,
  initialTodayDate,
  locale,
  localeTag,
}: Props) {
  const c = getDictionary(locale).admin.attendanceConsole;
  const [rosterDay, setRosterDay] = useState(initialRosterDay);
  const [todayDate, setTodayDate] = useState(initialTodayDate);
  const [liveTime, setLiveTime] = useState(() => timeLabel(localeTag));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const selectedLabel = useMemo(
    () => dateLabel(rosterDay.operatingDate, localeTag),
    [localeTag, rosterDay.operatingDate],
  );
  const isToday = rosterDay.operatingDate === todayDate;

  const refreshCurrentDate = useCallback(
    (options?: { silent?: boolean }) => {
      if (!options?.silent) setError(null);
      startTransition(async () => {
        const result = await loadAdminAttendanceRoster(rosterDay.operatingDate, localeTag);
        if (result.ok) {
          setRosterDay(result.rosterDay);
          setTodayDate(result.todayDate);
        } else if (!options?.silent) {
          setError(c.rosterLoadFailed);
        }
      });
    },
    [c.rosterLoadFailed, localeTag, rosterDay.operatingDate],
  );

  useEffect(() => {
    if (!isToday) return;
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshCurrentDate({ silent: true });
    }, 10000);
    return () => window.clearInterval(refreshInterval);
  }, [isToday, refreshCurrentDate]);

  useEffect(() => {
    if (!isToday) return;
    const clockInterval = window.setInterval(() => {
      setLiveTime(timeLabel(localeTag));
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(clockInterval);
  }, [isToday, localeTag]);

  const empty = rosterDay.entries.length === 0;

  return (
    <div className="aroster">
      <div className="roster-livebar">
        <div className="roster-date-title">{selectedLabel}</div>
        {isToday ? (
          <span className="liveflag">
            <span className="pulse" />
            {c.rosterLiveUpdated(liveTime)}
          </span>
        ) : (
          <span className="readflag">
            <Ic>
              <FileText />
            </Ic>
            {c.rosterReadOnly}
          </span>
        )}
      </div>

      {error ? <div className="privnote">{error}</div> : null}

      {empty ? (
        <div className="card">
          <div className="rstate">
            <span className="rstate__ic">
              <Ic>
                <Clock />
              </Ic>
            </span>
            <div className="rstate__t">{c.rosterNoEntries}</div>
            <div className="rstate__s">{c.rosterNoEntriesSub}</div>
            <div className="rstate__act">
              <a className="btn btn--pri" href={`?date=${todayDate}`}>
                {c.rosterGoToday}
              </a>
            </div>
          </div>
        </div>
      ) : (
        <>
          <Summary rosterDay={rosterDay} c={c} />
          <RosterTable rosterDay={rosterDay} c={c} nowMs={nowMs} />
          <p className="roster-footnote">
            <Ic>
              <FileText />
            </Ic>
            {c.rosterReadonlyFootnote}
          </p>
        </>
      )}
    </div>
  );
}
