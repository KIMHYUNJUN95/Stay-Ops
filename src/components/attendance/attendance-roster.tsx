"use client";

/**
 * AttendanceRoster — 매니저/오피스 역할 전용 일일 출근자 명단.
 * 주간 스트립 + 날짜 메타 + 직원 카드 리스트.
 * 날짜 변경 시 router.replace로 ?date= 파라미터를 업데이트해 서버 컴포넌트를 재실행.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { getDictionary } from "@/lib/i18n";
import type { RosterDay, RosterEntry } from "@/lib/attendance-roster";

export type { RosterDay, RosterEntry };

type Props = {
  rosterDay: RosterDay;
  operatingDate: string;  // currently selected date "YYYY-MM-DD"
  todayDate: string;      // today in Tokyo "YYYY-MM-DD"
  locale: string;
};

// ─── 날짜 유틸 ────────────────────────────────────────────────────────────────

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay()); // 일요일 기준
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 오늘부터 최대 9주 전까지의 주 시작일 배열 */
function buildWeeks(todayDate: Date): Date[] {
  const cur = startOfWeek(todayDate);
  const weeks: Date[] = [];
  const s = new Date(cur);
  s.setDate(cur.getDate() - 8 * 7);
  while (s <= cur) {
    weeks.push(new Date(s));
    s.setDate(s.getDate() + 7);
  }
  return weeks;
}

function localeTag(locale: string): string {
  if (locale === "ko") return "ko-KR";
  if (locale === "ja") return "ja-JP";
  return "en-US";
}

function dowLabels(locale: string) {
  const formatter = new Intl.DateTimeFormat(localeTag(locale), {
    weekday: "short",
    timeZone: "UTC",
  });
  return Array.from({ length: 7 }, (_, i) =>
    formatter.format(new Date(Date.UTC(2026, 5, 7 + i))).replace(/\.$/, ""),
  );
}

function fmtDateMeta(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
}

// ─── 직원 행 ──────────────────────────────────────────────────────────────────

function RosterCard({ entry, copy }: { entry: RosterEntry; copy: ReturnType<typeof getDictionary>["attendance"] }) {
  const isActive = entry.statusKey === "working" || entry.statusKey === "on_break";
  const isDone = entry.statusKey === "done";
  const canCall = isActive && !!entry.phoneNumber;
  // 출근 중이면 출근 사이트, 퇴근 완료면 퇴근 사이트 표시
  const displaySite = isDone ? entry.clockOutSiteName : entry.siteName;

  const outCell = () => {
    if (entry.clockOutTimeLabel) {
      return <span className="tv">{entry.clockOutTimeLabel}</span>;
    }
    if (entry.isVoid) {
      return <span className="dash">—</span>;
    }
    return (
      <span className="working">
        <span className="d" />
        {copy.rosterStatusWorking}
      </span>
    );
  };

  return (
    <div className={`rcard${entry.isVoid ? " void" : ""}`}>
      <div className="rcard__av">{entry.avatarInitial}</div>
      <div className="rcard__id">
        <div className="rcard__name">{entry.name}</div>
        <div className="rcard__role">{entry.role}</div>
        {displaySite && <div className="rcard__site">{displaySite}</div>}
      </div>
      <div className="rcard__t inn">{entry.clockInTimeLabel}</div>
      <div className="rcard__t outt">{outCell()}</div>
      {canCall ? (
        <a
          href={`tel:${entry.phoneNumber}`}
          className="rcard__call"
          aria-label={`${entry.name} ${copy.rosterCallLabel}`}
        >
          <AIc>{AttIcon.phone}</AIc>
        </a>
      ) : (
        <div className="rcard__call-ph" />
      )}
    </div>
  );
}

// ─── 달력 시트 ────────────────────────────────────────────────────────────────

type CalendarSheetProps = {
  selectedDate: Date;
  todayDate: Date;
  hasDataDates: Set<string>;
  onSelect: (date: Date) => void;
  onClose: () => void;
  copy: ReturnType<typeof getDictionary>["attendance"];
  locale: string;
};

function CalendarSheet({ selectedDate, todayDate, hasDataDates, onSelect, onClose, copy, locale }: CalendarSheetProps) {
  const [calY, setCalY] = useState(selectedDate.getFullYear());
  const [calM, setCalM] = useState(selectedDate.getMonth());
  const [pendingDate, setPendingDate] = useState<Date>(selectedDate);

  const leadDow = new Date(calY, calM, 1).getDay();
  const daysInMonth = new Date(calY, calM + 1, 0).getDate();

  const canNext = new Date(calY, calM + 1, 1) <= todayDate;

  const cells = useMemo(() => {
    const items: { day: number; date: Date; isFuture: boolean; isToday: boolean; isSel: boolean; hasData: boolean }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(calY, calM, d);
      items.push({
        day: d,
        date,
        isFuture: date > todayDate,
        isToday: fmtKey(date) === fmtKey(todayDate),
        isSel: fmtKey(date) === fmtKey(pendingDate),
        hasData: hasDataDates.has(fmtKey(date)),
      });
    }
    return items;
  }, [calY, calM, daysInMonth, todayDate, pendingDate, hasDataDates]);

  const monthLabel = new Intl.DateTimeFormat(
    locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US",
    { year: "numeric", month: "long" }
  ).format(new Date(calY, calM, 1));

  return (
    <BottomSheet onClose={onClose} ariaLabel={copy.rosterPageTitle}>
      <div className="att">
        <div className="roster-cal-head">
          <span className="roster-cal-m">{monthLabel}</span>
          <div className="roster-cal-nav">
            <button
              type="button"
              onClick={() => { if (calM === 0) { setCalM(11); setCalY(y => y - 1); } else setCalM(m => m - 1); }}
              aria-label={copy.monthPrev}
            >
              <AIc>{AttIcon.back}</AIc>
            </button>
            <button
              type="button"
              disabled={!canNext}
              onClick={() => { if (!canNext) return; if (calM === 11) { setCalM(0); setCalY(y => y + 1); } else setCalM(m => m + 1); }}
              aria-label={copy.monthNext}
            >
              <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="roster-cal-dow">
          {dowLabels(locale).map((l) => <span key={l}>{l}</span>)}
        </div>
        <div className="roster-cal-grid">
          {cells.map((cell, i) => {
            const cls = [
              "cal-btn",
              cell.isFuture ? "future" : "",
              cell.isToday ? "today" : "",
              cell.isSel ? "sel" : "",
              cell.hasData ? "has" : "",
            ].filter(Boolean).join(" ");
            const style = i === 0 ? { gridColumnStart: leadDow + 1 } : undefined;
            return (
              <button
                key={cell.day}
                type="button"
                className={cls}
                style={style}
                disabled={cell.isFuture}
                onClick={() => !cell.isFuture && setPendingDate(cell.date)}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
        <div className="roster-cal-foot">
          <button type="button" className="ghost" onClick={() => { setPendingDate(todayDate); }}>
            {copy.rosterGoToday}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => { onSelect(pendingDate); onClose(); }}
          >
            {copy.rosterViewThisDate}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

// ─── 주간 스트립 ──────────────────────────────────────────────────────────────

type WeekStripProps = {
  weeks: Date[];
  selectedKey: string;
  todayKey: string;
  hasDataDates: Set<string>;
  onSelect: (key: string) => void;
  locale: string;
};

function WeekStrip({ weeks, selectedKey, todayKey, hasDataDates, onSelect, locale }: WeekStripProps) {
  const dow = dowLabels(locale);
  return (
    <div className="week-scroller">
      {weeks.map((weekStart, wi) => (
        <div key={wi} className="week-page">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(weekStart);
            d.setDate(weekStart.getDate() + i);
            const k = fmtKey(d);
            const isFuture = k > todayKey;
            const isSel = k === selectedKey;
            const hasData = hasDataDates.has(k);
            const cls = [
              "week-day",
              i === 0 ? "sun" : "",
              isFuture ? "future" : "",
              isSel ? "sel" : "",
              hasData ? "has" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={k}
                type="button"
                className={cls}
                disabled={isFuture}
                onClick={() => !isFuture && onSelect(k)}
                aria-label={k}
                aria-pressed={isSel}
              >
                <span className="week-day__dow">{dow[d.getDay()]}</span>
                <span className="week-day__num">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function AttendanceRoster({ rosterDay, operatingDate, todayDate, locale }: Props) {
  const copy = getDictionary(locale).attendance;
  const router = useRouter();
  const [calOpen, setCalOpen] = useState(false);

  const todayDateObj = useMemo(() => parseDate(todayDate), [todayDate]);
  const selectedDateObj = useMemo(() => parseDate(operatingDate), [operatingDate]);
  const weeks = useMemo(() => buildWeeks(todayDateObj), [todayDateObj]);

  // 데이터가 있는 날짜 Set — 현재 rosterDay만 갖고 있으므로 선택된 날만 dot 표시
  const hasDataDates = useMemo(() => {
    const s = new Set<string>();
    if (rosterDay.entries.length > 0) s.add(rosterDay.operatingDate);
    return s;
  }, [rosterDay]);

  const navigateToDate = useCallback((dateKey: string) => {
    router.replace(`/mobile/attendance/roster?date=${dateKey}`);
  }, [router]);

  const handleCalSelect = useCallback((date: Date) => {
    navigateToDate(fmtKey(date));
  }, [navigateToDate]);

  const isToday = operatingDate === todayDate;
  const dateLabel = fmtDateMeta(selectedDateObj, locale);

  return (
    <div className="att">
      {/* 페이지 타이틀 + 캘린더 버튼 */}
      <div className="roster-ttl">
        <h1 style={{ fontSize: 23, fontWeight: 900, letterSpacing: "-0.03em", margin: 0 }}>
          {copy.rosterPageTitle}
          {isToday && (
            <span className="roster-live">
              <span className="pulse" />
              {copy.rosterLiveLabel}
            </span>
          )}
        </h1>
        <button
          type="button"
          className="roster-calbtn"
          aria-label={copy.rosterDateSelectLabel}
          onClick={() => setCalOpen(true)}
        >
          <AIc>{AttIcon.calendar}</AIc>
        </button>
      </div>

      {/* 주간 스트립 */}
      <WeekStrip
        weeks={weeks}
        selectedKey={operatingDate}
        todayKey={todayDate}
        hasDataDates={hasDataDates}
        onSelect={navigateToDate}
        locale={locale}
      />

      {/* 날짜 메타 행 */}
      <div className="roster-datemeta">
        <div className="roster-datemeta__d">
          {dateLabel}
          {isToday && <span className="todaytag">{copy.rosterTodayTag}</span>}
        </div>
        <div className="roster-datemeta__c">
          <span className="cin">
            <span className="cdot" style={{ background: "var(--work-dot)" }} />
            {copy.rosterSummaryIn(rosterDay.counts.working + rosterDay.counts.on_break)}
          </span>
          <span className="cout">
            <span className="cdot" style={{ background: "var(--out-col)" }} />
            {copy.rosterSummaryOut(rosterDay.counts.done)}
          </span>
        </div>
      </div>

      {/* 직원 행 리스트 — 출근 중 / 퇴근 완료 섹션 분리 */}
      <div style={{ marginTop: 8 }}>
        {rosterDay.entries.length === 0 ? (
          <div className="roster-empty">
            <div className="roster-empty__ic">
              <AIc>{AttIcon.clock}</AIc>
            </div>
            <div className="roster-empty__t">{copy.rosterNoEntries}</div>
            <div className="roster-empty__s">{copy.rosterNoEntriesSub}</div>
          </div>
        ) : (() => {
          const activeEntries = rosterDay.entries.filter(
            (e) => e.statusKey === "working" || e.statusKey === "on_break",
          );
          const doneEntries = rosterDay.entries.filter((e) => e.statusKey === "done");
          const otherEntries = rosterDay.entries.filter(
            (e) => e.statusKey !== "working" && e.statusKey !== "on_break" && e.statusKey !== "done",
          );
          const colHead = (
            <div className="roster-colhead">
              <span className="rch-who">{copy.rosterColWho}</span>
              <span className="rch-ci">{copy.rosterColIn}</span>
              <span className="rch-co">{copy.rosterColOut}</span>
              <span className="rch-sp" />
            </div>
          );
          return (
            <>
              {/* 출근 중 섹션 */}
              {activeEntries.length > 0 && (
                <div className="roster-section">
                  <div className="roster-section__hd">
                    <span className="cdot" style={{ background: "var(--work-dot)" }} />
                    {copy.rosterSummaryIn(activeEntries.length)}
                  </div>
                  {colHead}
                  {activeEntries.map((entry) => (
                    <RosterCard key={entry.sessionId} entry={entry} copy={copy} />
                  ))}
                </div>
              )}
              {/* 퇴근 완료 섹션 */}
              {doneEntries.length > 0 && (
                <div className="roster-section">
                  <div className="roster-section__hd">
                    <span className="cdot" style={{ background: "var(--out-col)" }} />
                    {copy.rosterSummaryOut(doneEntries.length)}
                  </div>
                  {colHead}
                  {doneEntries.map((entry) => (
                    <RosterCard key={entry.sessionId} entry={entry} copy={copy} />
                  ))}
                </div>
              )}
              {/* 검토 필요 / 무효 (기타) */}
              {otherEntries.length > 0 && (
                <div className="roster-section">
                  {colHead}
                  {otherEntries.map((entry) => (
                    <RosterCard key={entry.sessionId} entry={entry} copy={copy} />
                  ))}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* 날짜 선택 캘린더 BottomSheet */}
      {calOpen && (
        <CalendarSheet
          selectedDate={selectedDateObj}
          todayDate={todayDateObj}
          hasDataDates={hasDataDates}
          onSelect={handleCalSelect}
          onClose={() => setCalOpen(false)}
          copy={copy}
          locale={locale}
        />
      )}
    </div>
  );
}
