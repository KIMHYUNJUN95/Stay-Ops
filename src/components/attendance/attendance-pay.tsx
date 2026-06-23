"use client";

/**
 * Attendance self monthly pay — redesigned to match screenshot handoff.
 * Structure: ptitle-row (seg-month) → paycard → excl banner → rate segments → daily ptbl.
 * Salaried → document icon empty state.
 */

import { useState } from "react";
import Link from "next/link";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { MonthSwitcher } from "./month-switcher";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type { MonthlyPayView, PayExcludeReason } from "@/lib/attendance-pay";
import { getDictionary } from "@/lib/i18n";
import { usePersistentToggle } from "@/lib/use-persistent-toggle";

function fmtDur(totalMinutes: number, hourLabel: string, minLabel: string): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}${hourLabel} ${m}${minLabel}`;
  return `${m}${minLabel}`;
}

function shortMonthLabel(ym: string, locale: string): string {
  const dt = new Date(`${ym}-01T00:00:00+09:00`);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    month: "long",
  }).format(dt);
}

/** "M/D" from YYYY-MM-DD */
function shortDate(date: string): string {
  const [, mm, dd] = date.split("-");
  return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
}

/** Day/weekday for ptbl from YYYY-MM-DD */
function ptblDate(date: string, locale: string): { day: string; wd: string } {
  const dt = new Date(`${date}T00:00:00+09:00`);
  const day = dt.getDate().toString();
  const wd = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(dt);
  return { day, wd };
}

/** "09:00–18:00" / "09:02–진행" / "10:05–미기록" — uses first in / last out across all sessions */
function ioLabel(
  sessions: MonthlyPayView["days"][number]["sessions"],
  openLabel: string,
  missingLabel: string,
): { label: string; cls: "" | "run" | "miss" } {
  if (!sessions.length) return { label: "—", cls: "" };
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const inT = first.clockInLabel ?? "--:--";
  if (!last.clockOutLabel && last.excludeReason === "open") {
    return { label: `${inT}–${openLabel}`, cls: "run" };
  }
  if (!last.clockOutLabel) {
    return { label: `${inT}–${missingLabel}`, cls: "miss" };
  }
  return { label: `${inT}–${last.clockOutLabel}`, cls: "" };
}

/** Break minutes from sessions (sum all) */
function breakMins(sessions: MonthlyPayView["days"][number]["sessions"], minLabel: string): string {
  const total = sessions.reduce((acc, s) => acc + s.breakTotalSec, 0);
  if (total === 0) return "—";
  const m = Math.round(total / 60);
  return `${m}${minLabel}`;
}

type SegmentWithRange = {
  rate: number;
  paidMinutes: number;
  gross: number;
  startDate: string;
  endDate: string;
  isRaise: boolean;
};

/** Compute date ranges for rate segments from the days array. */
function computeSegmentsWithRanges(
  rateSegments: MonthlyPayView["rateSegments"],
  days: MonthlyPayView["days"],
): SegmentWithRange[] {
  const ranges = new Map<number, { start: string; end: string }>();
  for (const d of days) {
    if (d.hourlyRate == null) continue;
    const r = d.hourlyRate;
    const ex = ranges.get(r);
    if (!ex) {
      ranges.set(r, { start: d.date, end: d.date });
    } else {
      if (d.date < ex.start) ex.start = d.date;
      if (d.date > ex.end) ex.end = d.date;
    }
  }

  const sorted = [...rateSegments].sort((a, b) => {
    const aR = ranges.get(a.rate);
    const bR = ranges.get(b.rate);
    if (aR && bR) return aR.start.localeCompare(bR.start);
    return a.rate - b.rate;
  });

  const minRate = Math.min(...sorted.map((s) => s.rate));

  return sorted.map((seg) => {
    const range = ranges.get(seg.rate) ?? { start: "—", end: "—" };
    return {
      ...seg,
      startDate: range.start,
      endDate: range.end,
      isRaise: seg.rate > minRate,
    };
  });
}

export function AttendancePay({
  view,
  currentYm,
  locale,
}: {
  view: MonthlyPayView;
  currentYm: string;
  locale: string;
}) {
  const copy = getDictionary(locale).attendance;
  const isCurrentMonth = view.ym === currentYm;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = view.days.find((d) => d.date === selectedDate) ?? null;
  const close = () => setSelectedDate(null);
  const [excludedOpen, setExcludedOpen] = useState(false);
  // Default hidden (true). Persisted across sessions; shared key with attendance-home.
  const [payHidden, togglePayHidden] = usePersistentToggle(
    "stayops:attendance:pay-amount-visible",
    true,
  );

  function dur(mins: number) {
    return fmtDur(mins, copy.durationHour, copy.durationMin);
  }
  function amount(n: number) {
    return copy.payAmount(n.toLocaleString("ja-JP"));
  }
  function excludeLabel(r: PayExcludeReason): string {
    if (r === "open") return copy.sessOpen;
    if (r === "invalid") return copy.statusInvalid;
    if (r === "review_required") return copy.statusReviewRequired;
    if (r === "pending_correction") return copy.statusPendingCorrection;
    return copy.excludeDefault;
  }

  const isFinal = !!view.finalization;
  const grossAmount = isFinal ? view.finalization!.gross : view.expectedGross;
  const paidMins = isFinal ? view.finalization!.paidMinutes : view.totalPaidMinutes;

  // Page title: "이번 달 급여" / "6월 급여" / "급여" for salaried
  const segCurLabel = shortMonthLabel(view.ym, locale);
  const pageTitle = view.salariedOnly
    ? copy.payPageTitle
    : isCurrentMonth
      ? copy.payThisMonth
      : `${segCurLabel} ${copy.payPageTitle}`;

  // Period label — always show the full calendar month end, not just the last worked day
  const [yyyy, mm] = view.ym.split("-");
  const mNum = parseInt(mm, 10);
  const monthEndDay = new Date(parseInt(yyyy, 10), mNum, 0).getDate();
  const periodLabel = isFinal
    ? `${mNum}/1 – ${mNum}/${monthEndDay} · ${copy.payFinalizedDone}`
    : `${mNum}/1 – ${mNum}/${monthEndDay} · ${copy.payNotFinalized}`;

  const titleRow = (
    <div className="ptitle-row">
      <div>
        <h1 className="ptitle">{pageTitle}</h1>
        <div className="ptitle__sub">{copy.paySubtitle}</div>
      </div>
      <MonthSwitcher
        ym={view.ym}
        currentYm={currentYm}
        basePath="/mobile/attendance/pay"
        locale={locale}
        labels={{ prev: copy.monthPrev, next: copy.monthNext, select: copy.monthSelect }}
      />
    </div>
  );

  // Salaried empty state
  if (view.salariedOnly) {
    return (
      <div className="att">
        {titleRow}
        <div className="salaried">
          <span className="salaried__ic"><AIc>{AttIcon.doc}</AIc></span>
          <p className="salaried__t">{copy.payOnlySalaried}</p>
          <p className="salaried__s">{copy.payOnlySalariedSub}</p>
          <Link href="/mobile/attendance/history" className="salaried__btn">
            <AIc>{AttIcon.clock}</AIc>{copy.historyTitle}
          </Link>
        </div>
      </div>
    );
  }

  // No records
  if (view.days.length === 0) {
    return (
      <div className="att">
        {titleRow}
        <div className="salaried">
          <span className="salaried__ic"><AIc>{AttIcon.clock}</AIc></span>
          <p className="salaried__t">{copy.payNoRecords}</p>
        </div>
      </div>
    );
  }

  const segmentsWithRanges = computeSegmentsWithRanges(view.rateSegments, view.days);

  return (
    <div className="att">
      {titleRow}

      {/* Pay card */}
      <div className={`paycard ${isFinal ? "paycard--final" : "paycard--expected"}${payHidden ? " hide" : ""}`}>
        <div className="pc__deco" />
        <div className="pc__statline">
          <span className="pc__statetag">
            {isFinal ? (
              <><AIc>{AttIcon.lock}</AIc>{copy.payFinalizedBadge}</>
            ) : (
              <><span className="d" />{copy.payExpectedLabel.split(" ")[0]}</>
            )}
          </span>
          <span className="pc__period">{periodLabel}</span>
          <button
            type="button"
            className="pc__eye"
            onClick={togglePayHidden}
            aria-label={copy.homePayHide}
          >
            <AIc>{payHidden ? AttIcon.eyeOff : AttIcon.eye}</AIc>
          </button>
        </div>
        <div className="pc__amtlbl">
          {isFinal ? copy.payFinalizedLabel : copy.payExpectedLabel}
        </div>
        <div className="pc__amt">
          <span className="yen">¥</span>
          {grossAmount.toLocaleString("ja-JP")}
        </div>
        <div className="pc__gross">
          <AIc>{isFinal ? AttIcon.check : AttIcon.info}</AIc>
          {isFinal
            ? copy.payFinalizedNote(view.finalization!.finalizedAtLabel ?? "")
            : copy.payGrossNote}
        </div>
        <div className="pc__foot">
          <div className="pc__cell">
            <div className="pc__k">{copy.payPaidHours}</div>
            <div className="pc__v" style={{ fontFamily: "var(--mono)" }}>{dur(paidMins)}</div>
          </div>
          <div className="pc__cell">
            <div className="pc__k">{copy.payWorkDays}</div>
            <div className="pc__v" style={{ fontFamily: "var(--mono)" }}>
              {copy.payWorkDaysCount(view.days.filter((d) => d.employmentType === "hourly").length)}
            </div>
          </div>
        </div>
      </div>

      {/* Excluded sessions notice */}
      {!isFinal && view.excludedCount > 0 ? (
        <button type="button" className="excl" onClick={() => setExcludedOpen(true)}>
          <span className="excl__ic"><AIc>{AttIcon.warn}</AIc></span>
          <div className="excl__b">
            <div className="excl__t">{copy.payExcludedTitle(view.excludedCount)}</div>
            <div className="excl__s">{copy.payExcludedBody}</div>
          </div>
          <span className="excl__chev"><AIc>{AttIcon.chevR}</AIc></span>
        </button>
      ) : null}

      {/* Rate segments (only when multiple) */}
      {segmentsWithRanges.length > 1 ? (
        <>
          <div className="sectt" style={{ marginTop: "20px" }}>
            {copy.payRateSegments}
            <span className="cnt">{copy.paySegCount(segmentsWithRanges.length)}</span>
          </div>
          <div className="rate">
            {segmentsWithRanges.map((seg, i) => (
              <div key={seg.rate} className="rate__r">
                <span
                  className="rate__dot"
                  style={{ background: i === 0 ? "var(--primary)" : "var(--primary-lift)" }}
                />
                <div className="rate__b">
                  <div className="rate__period">
                    {seg.startDate !== "—" ? `${shortDate(seg.startDate)} – ${shortDate(seg.endDate)}` : "—"}
                    {seg.isRaise ? ` ${copy.payRateRaise}` : ""}
                  </div>
                  <div className="rate__rate">¥{seg.rate.toLocaleString("ja-JP")}{copy.payRatePerHour}</div>
                </div>
                <div className="rate__sub">
                  <div className="rate__min">{dur(seg.paidMinutes)}</div>
                  <div className="rate__amt">{amount(Math.round(seg.gross))}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Daily breakdown table */}
      <div className="sectt" style={{ marginTop: "20px" }}>
        {copy.payDailyBreakdown}
        <span className="cnt">{copy.payWorkDaysCount(view.days.length)}</span>
      </div>
      <div className="ptbl">
        <div className="ptbl__head">
          <span>{copy.payColDate}</span>
          <span>{copy.payColInOut}</span>
          <span style={{ textAlign: "right" }}>{copy.payBreakHeader}</span>
          <span style={{ textAlign: "right" }}>{copy.payColApproved}</span>
          <span style={{ textAlign: "right" }}>{copy.payColDailyPay}</span>
        </div>
        {view.days.map((d) => {
          const { day, wd } = ptblDate(d.date, locale);
          const isExcluded = d.sessions.length > 0 && d.sessions.every((s) => !s.included);
          const isRunning = d.sessions.some((s) => !s.included && s.excludeReason === "open");
          const { label: io, cls: ioCls } = ioLabel(
            d.sessions,
            copy.sessOpen,
            copy.histNoRecord,
          );
          const breakLabel = breakMins(d.sessions, copy.durationMin);
          const paidLabel = d.paidMinutes > 0 ? dur(d.paidMinutes) : "—";
          const amtLabel = isRunning
            ? copy.sessOpen
            : isExcluded
              ? copy.excludeDefault
              : d.employmentType === "hourly"
                ? amount(Math.round(d.grossExact))
                : "—";
          const amtCls = isRunning ? "run" : isExcluded ? "excluded" : "";

          return (
            <button
              key={d.date}
              type="button"
              className={`ptbl__row${isExcluded && !isRunning ? " excluded" : ""}`}
              onClick={() => setSelectedDate(d.date)}
            >
              <div className="ptbl__date">
                <b>{day}</b><span>{wd}</span>
              </div>
              <div className={`ptbl__io${ioCls ? ` ${ioCls}` : ""}`}>{io}</div>
              <div className="ptbl__c" style={{ textAlign: "right" }}>{breakLabel}</div>
              <div className="ptbl__c" style={{ textAlign: "right" }}>{paidLabel}</div>
              <div className={`ptbl__amt${amtCls ? ` ${amtCls}` : ""}`}>{amtLabel}</div>
            </button>
          );
        })}
        <div className="ptbl__foot">
          <span className="k">
            {segCurLabel} {copy.payTotal} · {dur(paidMins)}
          </span>
          <span className="v">{amount(grossAmount)}</span>
        </div>
      </div>

      <p className="gross-note">
        {copy.payDisclaimerBase}{" "}
        {isFinal ? copy.payDisclaimerFinal : copy.payDisclaimerPending}
      </p>

      {/* Excluded sessions list sheet */}
      {excludedOpen && (
        <BottomSheet onClose={() => setExcludedOpen(false)}>
          <div className="att">
            <h3 className="rsheet__t">{copy.payExcludedTitle(view.excludedCount)}</h3>
            <p className="rsheet__s">{copy.payExcludedBody}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {view.days.flatMap((d) =>
                d.sessions
                  .filter((s) => !s.included)
                  .map((s) => (
                    <button
                      key={s.sessionId}
                      type="button"
                      onClick={() => {
                        setExcludedOpen(false);
                        setSelectedDate(d.date);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "var(--bg)",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 14,
                        padding: "12px 13px",
                        textAlign: "left",
                        font: "inherit",
                        cursor: "pointer",
                        color: "inherit",
                        width: "100%",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{d.dateLabel}</div>
                        <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
                          {s.clockInLabel ?? "--:--"} –{" "}
                          {s.clockOutLabel ?? (s.excludeReason === "open" ? copy.sessOpen : copy.histNoRecord)}
                        </div>
                      </div>
                      <span
                        className={`chip ${s.excludeReason === "review_required" || s.excludeReason === "pending_correction" ? "c-warn" : "c-invalid"}`}
                        style={{ fontSize: 10, padding: "2px 7px", flexShrink: 0 }}
                      >
                        {excludeLabel(s.excludeReason)}
                      </span>
                      <span style={{ color: "var(--muted)", flexShrink: 0 }}><AIc>{AttIcon.chevR}</AIc></span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* Detail bottom sheet for day */}
      {selected && (
        <BottomSheet onClose={close}>
          <div className="att">
            <h3 className="rsheet__t">{selected.dateLabel}</h3>
            <div className="histsheet__chips">
              {selected.employmentType === "hourly" ? (
                <span className="chip c-method">
                  {copy.empHourlyRate(selected.hourlyRate?.toLocaleString("ja-JP") ?? "—")}
                </span>
              ) : selected.employmentType === "salaried" ? (
                <span className="chip c-invalid">{copy.empSalaried}</span>
              ) : (
                <span className="chip c-warn">{copy.empUnset}</span>
              )}
            </div>
            <div className="recap">
              <div className="recap__r">
                <span className="recap__k">{copy.payPaidHours}</span>
                <span className="recap__v mono">{dur(selected.paidMinutes)}</span>
              </div>
              <div className="recap__r">
                <span className="recap__k">{copy.payDailyPay}</span>
                <span className="recap__v">
                  {selected.employmentType === "hourly"
                    ? amount(Math.round(selected.grossExact))
                    : "—"}
                </span>
              </div>
            </div>
            <div className="histbreaks">
              {selected.sessions.map((s, i) => (
                <div className="histbreaks__r" key={s.sessionId}>
                  <span className="histbreaks__k">{copy.paySessionLabel(i + 1)}</span>
                  <span className="mono">
                    {s.clockInLabel ?? "--:--"} – {s.clockOutLabel ?? "--:--"}
                  </span>
                  <span className="histbreaks__d">
                    {s.included
                      ? dur(s.paidMinutes)
                      : (excludeLabel(s.excludeReason) || copy.excludeDefault)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
