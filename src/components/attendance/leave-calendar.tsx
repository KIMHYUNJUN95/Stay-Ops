import type { CSSProperties } from "react";
import Link from "next/link";
import "./leave.css";
import { AttIcon } from "./att-icons";
import type { ApprovedLeaveEntry } from "@/lib/annual-leave-requests-server";
import { getDictionary } from "@/lib/i18n";

// L5 · 연차 캘린더 — 승인된 연차가 자동 기입되는 월 그리드(리본) + 이번 달 목록.
// 확정 정책(2026-07-06): 전 직원의 "승인된" 연차만 표시(본인 포함) — 대기/반려/임시저장/취소는 비공개.
// `entries`는 page.tsx가 서버에서 조회해 내려준다(annual-leave-requests-server.ts, RLS는 migration
// 202607060003의 org-wide-approved-select 정책). 실제 연/월 이동(`?ym=` 쿼리 + Link)로 동작.
// 겹치는 휴가는 각자 레인(행)을 배정해 리본이 안 겹치게 한다.

type LeaveType = "annual" | "paid" | "special" | "other";
const CHIP_CLS: Record<LeaveType, string> = { annual: "c-info", special: "c-violet", paid: "c-done", other: "c-muted" };
const AVATAR_COLORS = ["#4d6db5", "#9c5a2c", "#3f7d5a", "#c98a4b", "#7a5ea8", "#b5504d"];

const pad2 = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function localeTag(locale: string): string {
  return locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
}

type LeaveCopy = ReturnType<typeof getDictionary>["leave"];

function typeLabel(t: LeaveType, c: LeaveCopy): string {
  return t === "annual" ? c.typeAnnual : t === "paid" ? c.typePaid : t === "special" ? c.typeSpecial : c.typeOther;
}

export function LeaveCalendar({
  locale,
  ym,
  entries,
  todayDate,
}: {
  locale: string;
  ym: string;
  entries: ApprovedLeaveEntry[];
  todayDate: string;
}) {
  const c = getDictionary(locale).leave;
  const [year, month] = ym.split("-").map(Number);
  const total = daysInMonth(year, month);
  const lead = firstWeekday(year, month);
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${pad2(total)}`;
  const today = todayDate >= monthStart && todayDate <= monthEnd ? Number(todayDate.slice(8, 10)) : null;
  const monthLabel = new Intl.DateTimeFormat(localeTag(locale), { year: "numeric", month: "long" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );

  // clip each entry to this month's day range, then greedily assign non-overlapping lanes
  const clipped = entries
    .map((e, i) => {
      const s = e.startDate < monthStart ? 1 : Number(e.startDate.slice(8, 10));
      const en = e.endDate > monthEnd ? total : Number(e.endDate.slice(8, 10));
      return { ...e, s, e2: en, color: AVATAR_COLORS[i % AVATAR_COLORS.length] };
    })
    .sort((a, b) => a.s - b.s || a.e2 - b.e2);

  const lanes: { s: number; e: number }[][] = [];
  const withLane = clipped.map((ev) => {
    let lane = lanes.findIndex((l) => l.every((o) => ev.s > o.e || ev.e2 < o.s));
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push({ s: ev.s, e: ev.e2 });
    return { ...ev, lane };
  });
  const laneCount = Math.max(1, lanes.length);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < lead; i++) cells.push(<div className="lcal__cell pad" key={`pad${i}`} />);
  for (let d = 1; d <= total; d++) {
    const bars: React.ReactNode[] = [];
    for (let ln = 0; ln < laneCount; ln++) {
      const ev = withLane.find((e) => e.lane === ln && d >= e.s && d <= e.e2);
      if (ev) {
        const isS = d === ev.s;
        const isE = d === ev.e2;
        const style: CSSProperties = {
          borderRadius: isS && isE ? "999px" : isS ? "999px 0 0 999px" : isE ? "0 999px 999px 0" : "0",
          background: ev.color,
        };
        if (!isS) style.marginLeft = -7;
        if (!isE) style.marginRight = -7;
        bars.push(<span className="lcal__bar" style={style} key={ln} />);
      } else {
        bars.push(<span className="lcal__bar lcal__bar--gap" key={ln} />);
      }
    }
    cells.push(
      <div className={`lcal__cell${d === today ? " today" : ""}`} key={d}>
        <span className="lcal__d">{d}</span>
        <div className="lcal__bars">{bars}</div>
      </div>,
    );
  }

  return (
    <div className="lv" style={{ paddingBottom: 26 }}>
      <div className="pagehead">
        <span className="pagehead__crumb">{c.crumb}</span>
        <span className="pagehead__t">{c.calTitle}</span>
      </div>

      <div className="lcal__nav">
        <span className="lcal__month">{monthLabel}</span>
        <span className="lcal__navsp" />
        <Link
          className="lcal__navbtn"
          aria-label={c.calPrevMonth}
          href={`/mobile/attendance/leave/calendar?ym=${shiftMonth(ym, -1)}`}
        >
          {AttIcon.back}
        </Link>
        <Link
          className="lcal__navbtn"
          aria-label={c.calNextMonth}
          href={`/mobile/attendance/leave/calendar?ym=${shiftMonth(ym, 1)}`}
        >
          {AttIcon.chevR}
        </Link>
      </div>

      <div className="lcal__wk">
        {c.calWk.map((w, i) => (
          <div className={`lcal__wd${i === 0 ? " sun" : i === 6 ? " sat" : ""}`} key={i}>
            {w}
          </div>
        ))}
      </div>
      <div className="lcal__grid">{cells}</div>

      <div className="lcal__auto">
        {AttIcon.info}
        {c.calAuto}
      </div>

      <div className="slabel">
        {c.calList}
        <span style={{ marginLeft: "auto", fontWeight: 800, color: "var(--muted)" }}>{c.calCount(entries.length)}</span>
      </div>
      {entries.length === 0 ? (
        <div className="histempty">{c.histEmpty}</div>
      ) : (
        [...entries]
          .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
          .map((e, idx) => {
            const off = today !== null && e.startDate <= monthEnd && e.endDate >= monthStart && e.startDate <= todayDate && e.endDate >= todayDate;
            return (
              <div className="lrow" key={e.id}>
                <span className="lav" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}>
                  {Array.from(e.applicantName)[0]}
                </span>
                <div className="lrow__b">
                  <div className="lrow__t">
                    {e.applicantName}
                    {off ? (
                      <span className="chip c-warn" style={{ height: 18, fontSize: 10, marginLeft: 6 }}>
                        <span className="d" />
                        {c.calOff}
                      </span>
                    ) : null}
                  </div>
                  <div className="lrow__s mono">
                    {e.startDate} – {e.endDate}
                  </div>
                </div>
                <div className="lrow__meta">
                  <span className={`chip ${CHIP_CLS[e.leaveType as LeaveType]}`}>
                    {typeLabel(e.leaveType as LeaveType, c)}
                  </span>
                  <span className="lrow__days">
                    {e.daysCount}
                    {c.unitD}
                  </span>
                </div>
              </div>
            );
          })
      )}
    </div>
  );
}
