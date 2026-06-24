"use client";

/**
 * Attendance self-view history — redesigned to match screenshot handoff.
 * Structure: ptitle-row → summary card (live ticker when open) → attn banners → date-grouped srow cards.
 * Session detail bottom sheet (drag-dismiss) preserved from previous version.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { MonthSwitcher } from "./month-switcher";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import type {
  AttendanceSessionView,
  AttendanceTodaySummary,
} from "@/lib/attendance-history";
import { getDictionary, type Dictionary } from "@/lib/i18n";

type AttendanceCopy = Dictionary["attendance"];

function fmtDur(sec: number, hourLabel: string, minLabel: string): string {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}${hourLabel} ${m}${minLabel}`;
  if (m > 0) return `${m}${minLabel}`;
  return `0${minLabel}`;
}

function fmtHM(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

function fmtHMS(sec: number): { hm: string; ss: string } {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { hm: `${pad(h)}:${pad(m)}`, ss: `:${pad(s)}` };
}

function methodLabel(m: string | null, manual: string): string {
  if (m === "gps_qr") return "GPS+QR";
  if (m === "gps_wifi") return "GPS+Wi-Fi";
  if (m === "manual") return manual;
  return "—";
}

/** Returns "AM" or "PM" from a "HH:MM" time label. */
function amPm(label: string | null): "AM" | "PM" | null {
  if (!label) return null;
  const h = parseInt(label.split(":")[0], 10);
  return h < 12 ? "AM" : "PM";
}

/** Groups sessions by operatingDate (preserves existing order = descending). */
function groupByDate(sessions: AttendanceSessionView[]) {
  const groups: { date: string; sessions: AttendanceSessionView[] }[] = [];
  for (const s of sessions) {
    const last = groups[groups.length - 1];
    if (last && last.date === s.operatingDate) {
      last.sessions.push(s);
    } else {
      groups.push({ date: s.operatingDate, sessions: [s] });
    }
  }
  return groups;
}

/** Compact date group label: "Today 6/18" / "6/17" + locale weekday. */
function dateGroupLabel(
  date: string,
  todayDate: string,
  locale: string,
  todayLabel: string,
): { d: string; wd: string } {
  const dt = new Date(`${date}T00:00:00+09:00`);
  const mm = dt.getMonth() + 1;
  const dd = dt.getDate();
  const wd = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(dt);
  const isToday = date === todayDate;
  return { d: isToday ? `${todayLabel} ${mm}/${dd}` : `${mm}/${dd}`, wd };
}

/** Weekly worked seconds: past days (Mon–yesterday) + today's summary. */
function computeWeekSec(sessions: AttendanceSessionView[], summary: AttendanceTodaySummary): number {
  const todayDate = summary.date;
  const dt = new Date(`${todayDate}T00:00:00+09:00`);
  const dow = dt.getDay(); // 0=Sun
  const monday = new Date(dt);
  monday.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  const mondayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(monday);

  const pastWeekSec = sessions
    .filter((s) => s.operatingDate >= mondayStr && s.operatingDate < todayDate)
    .reduce((acc, s) => acc + (s.workedSec ?? 0), 0);

  return pastWeekSec + summary.workedSec;
}

function StatusChips({ s, copy }: { s: AttendanceSessionView; copy: AttendanceCopy }) {
  return (
    <>
      {s.status === "open" ? (
        <span className="chip c-open"><span className="d" />{copy.sessOpen}</span>
      ) : s.status === "invalid" ? (
        <span className="chip c-invalid">{copy.statusInvalid}</span>
      ) : s.status === "reopened" ? (
        <span className="chip c-info">{copy.sessReopened}</span>
      ) : (
        <span className="chip c-done"><AIc>{AttIcon.check}</AIc>{copy.sessDone}</span>
      )}
      {s.reviewState === "review_required" ? (
        <span className="chip c-warn">{copy.statusReviewRequired}</span>
      ) : null}
      {s.manualCreated ? <span className="chip c-info">{copy.methodManual}</span> : null}
      {s.correctionStatus === "requested" ? (
        <span className="chip c-info">{copy.sessCorrRequested}</span>
      ) : s.correctionStatus === "in_review" ? (
        <span className="chip c-warn">{copy.sessCorrInReview}</span>
      ) : s.correctionStatus === "approved" ? (
        <span className="chip c-done">{copy.sessCorrApproved}</span>
      ) : s.correctionStatus === "rejected" ? (
        <span className="chip c-danger">{copy.sessCorrRejected}</span>
      ) : null}
    </>
  );
}

function SummaryCard({
  summary,
  todaySession,
  weekSec,
  copy,
}: {
  summary: AttendanceTodaySummary;
  todaySession: AttendanceSessionView | null;
  weekSec: number;
  copy: AttendanceCopy;
}) {
  const [elapsed, setElapsed] = useState<number>(summary.workedSec);

  useEffect(() => {
    if (!summary.hasOpenSession || !todaySession?.clockInAt) return;
    const clockInMs = new Date(todaySession.clockInAt).getTime();
    // Find the open (in-progress) break, if any — endedAt === null means still running.
    const openBreak = todaySession.breaks.find((b) => b.endedAt === null) ?? null;
    const tick = () => {
      const gross = (Date.now() - clockInMs) / 1000;
      const openBreakSec = openBreak
        ? Math.floor((Date.now() - new Date(openBreak.startedAt).getTime()) / 1000)
        : 0;
      setElapsed(Math.max(0, Math.floor(gross) - summary.breakTotalSec - openBreakSec));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [summary.hasOpenSession, summary.breakTotalSec, todaySession?.clockInAt, todaySession?.breaks]);

  if (summary.hasOpenSession && todaySession) {
    const { hm, ss } = fmtHMS(elapsed);
    return (
      <div className="summary summary--open">
        <div className="sm__deco" />
        <div className="sm__top">
          <span className="sm__pulse" />
          <span className="sm__state-label">{copy.ringWorking}</span>
          <span className="sm__tag">{copy.sessOpen}</span>
        </div>
        <div className="sm__mid">
          <div>
            <div className="sm__biglbl">{copy.histTodayAccum}</div>
            <div className="sm__big">{hm}<span className="sec">{ss}</span></div>
          </div>
        </div>
        <div className="sm__divider" />
        <div className="sm__rows">
          <div className="sm__cell">
            <div className="sm__k"><AIc>{AttIcon.pin}</AIc>{copy.clockInSite}</div>
            <div className="sm__v">{todaySession.clockInSiteName ?? "—"}</div>
          </div>
          <div className="sm__cell">
            <div className="sm__k"><AIc>{AttIcon.clock}</AIc>{copy.histClockIn}</div>
            <div className="sm__v" style={{ fontFamily: "var(--mono)" }}>{todaySession.clockInLabel ?? "--:--"}</div>
          </div>
          <div className="sm__cell">
            <div className="sm__k"><AIc>{AttIcon.coffee}</AIc>{copy.histBreakTime}</div>
            <div className="sm__v" style={{ fontFamily: "var(--mono)" }}>{fmtHM(summary.breakTotalSec)}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="summary summary--idle">
      <div className="sm__deco" />
      <div className="sm__top">
        <span className="sm__state-label">{copy.ringIdleLabel}</span>
        <span className="sm__tag">{copy.sumWaiting}</span>
      </div>
      <div className="sm__mid">
        <div className="sm__big">
          {summary.workedSec > 0 ? fmtHM(summary.workedSec) : copy.histIdleMsg}
        </div>
      </div>
      <div className="sm__divider" />
      <div className="sm__rows">
        <div className="sm__cell">
          <div className="sm__k">{copy.histTodayAccum}</div>
          <div className="sm__v" style={{ fontFamily: "var(--mono)" }}>{fmtHM(summary.workedSec)}</div>
        </div>
        <div className="sm__cell">
          <div className="sm__k">{copy.histThisWeek}</div>
          <div className="sm__v" style={{ fontFamily: "var(--mono)" }}>{fmtHM(weekSec)}</div>
        </div>
      </div>
    </div>
  );
}

function TimeCol({
  label,
  siteName,
  lbl,
  isOpen,
  isMissing,
  missingLabel,
  missingOutLabel,
  openLabel,
}: {
  label: string | null;
  siteName: string | null;
  lbl: string;
  isOpen: boolean;
  isMissing: boolean;
  missingLabel: string;
  missingOutLabel?: string;
  openLabel: string;
}) {
  const period = amPm(label);
  return (
    <div className="io__col">
      <div className="io__lbl">{lbl}</div>
      {isOpen ? (
        <div className="io__time">{openLabel}</div>
      ) : label ? (
        <>
          <div className="io__time">
            {label}
            {period ? <span className="io__period">{period}</span> : null}
          </div>
          <div className="io__site">
            <AIc>{AttIcon.pin}</AIc>
            {siteName ?? "—"}
          </div>
        </>
      ) : isMissing ? (
        <>
          <div className="io__time missing">{missingLabel}</div>
          {missingOutLabel ? (
            <div className="io__site" style={{ color: "var(--warn)" }}>
              {missingOutLabel}
            </div>
          ) : null}
        </>
      ) : (
        <div className="io__time">--:--</div>
      )}
    </div>
  );
}

function FlaggedSessionPicker({
  sessions,
  copy,
  locale,
  todayDate,
  onSelect,
  onClose,
}: {
  sessions: AttendanceSessionView[];
  copy: AttendanceCopy;
  locale: string;
  todayDate: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="att">
        <h3 className="rsheet__t">{copy.histSelectFlaggedSession}</h3>
        <div style={{ marginTop: 10 }}>
          {sessions.map((s) => {
            const { d, wd } = dateGroupLabel(s.operatingDate, todayDate, locale, copy.histToday);
            const missOut = !s.clockOutLabel && s.status !== "open";
            return (
              <button
                key={s.id}
                type="button"
                className="srow srow--flag"
                style={{ width: "100%", textAlign: "left", marginBottom: 8 }}
                onClick={() => onSelect(s.id)}
              >
                <div className="srow__top">
                  <div className="srow__chips">
                    <StatusChips s={s} copy={copy} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", flexShrink: 0 }}>
                    {d} ({wd})
                  </span>
                </div>
                <div className="inout">
                  <TimeCol
                    label={s.clockInLabel}
                    siteName={s.clockInSiteName}
                    lbl={copy.histClockIn}
                    isOpen={false}
                    isMissing={false}
                    missingLabel={copy.histNoRecord}
                    openLabel={copy.sessOpen}
                  />
                  <div className="io__arrow"><AIc>{AttIcon.arrowR}</AIc></div>
                  <TimeCol
                    label={s.clockOutLabel}
                    siteName={s.clockOutSiteName}
                    lbl={copy.histClockOut}
                    isOpen={s.status === "open"}
                    isMissing={missOut}
                    missingLabel={copy.histNoRecord}
                    missingOutLabel={copy.reasonMissingOut}
                    openLabel={copy.sessOpen}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </BottomSheet>
  );
}

function SessionRow({
  s,
  copy,
  onClick,
}: {
  s: AttendanceSessionView;
  copy: AttendanceCopy;
  onClick: () => void;
}) {
  const isFlagged = s.reviewState === "review_required" || s.isAbnormal;
  const isInfo = !!s.correctionStatus;
  const flagCls = s.status === "invalid"
    ? "srow--invalid"
    : isFlagged
      ? "srow--flag"
      : isInfo
        ? "srow--flag info"
        : "";

  const paidLabel = s.workedSec != null ? fmtHM(s.workedSec) : "—";
  const missingClockOut = !s.clockOutLabel && s.status !== "open";
  const inMethod = methodLabel(s.clockInMethod, copy.methodManual);

  return (
    <button type="button" className={`srow ${flagCls}`} onClick={onClick}>
      <div className="srow__top">
        <div className="srow__chips">
          <StatusChips s={s} copy={copy} />
        </div>
        <div className="srow__paid">
          <div className="v">{paidLabel}</div>
          <div className="k">{copy.histWorkApproved}</div>
        </div>
      </div>
      <div className="inout">
        <TimeCol
          label={s.clockInLabel}
          siteName={s.clockInSiteName}
          lbl={copy.histClockIn}
          isOpen={false}
          isMissing={false}
          missingLabel={copy.histNoRecord}
          openLabel={copy.sessOpen}
        />
        <div className="io__arrow"><AIc>{AttIcon.arrowR}</AIc></div>
        <TimeCol
          label={s.clockOutLabel}
          siteName={s.clockOutSiteName}
          lbl={copy.histClockOut}
          isOpen={s.status === "open"}
          isMissing={missingClockOut}
          missingLabel={copy.histNoRecord}
          missingOutLabel={copy.reasonMissingOut}
          openLabel={copy.sessOpen}
        />
      </div>
      <div className="srow__foot">
        <span className="sfi">
          <AIc>{AttIcon.qr}</AIc>{inMethod}
        </span>
        {s.breakCount > 0 ? (
          <span className="sfi">
            <AIc>{AttIcon.coffee}</AIc>
            {copy.histBreakCountSuffix(s.breakCount).replace(" · ", "")}
          </span>
        ) : null}
        {missingClockOut ? (
          <span className="sfi note" style={{ color: "var(--warn)" }}>
            <AIc>{AttIcon.warn}</AIc>{copy.reasonMissingOut}
          </span>
        ) : s.isAbnormal ? (
          <span className="sfi note" style={{ color: "var(--warn)" }}>
            <AIc>{AttIcon.warn}</AIc>{copy.histAbnormalTitle}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export function AttendanceHistory({
  summary,
  sessions,
  ym,
  currentYm,
  locale,
}: {
  summary: AttendanceTodaySummary;
  sessions: AttendanceSessionView[];
  ym: string;
  currentYm: string;
  locale: string;
}) {
  const copy = getDictionary(locale).attendance;
  const isCurrentMonth = ym === currentYm;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const close = () => setSelectedId(null);

  function dur(sec: number) {
    return fmtDur(sec, copy.durationHour, copy.durationMin);
  }

  const todayDate = summary.date;
  const todayOpen =
    sessions.find((s) => s.operatingDate === todayDate && s.status === "open") ??
    sessions.find((s) => s.operatingDate === todayDate) ??
    null;

  const weekSec = computeWeekSec(sessions, summary);

  const flagged = sessions.filter(
    (s) => s.reviewState === "review_required" || s.isAbnormal,
  );

  const groups = groupByDate(sessions);

  return (
    <div className="att">
      <div className="ptitle-row">
        <div>
          <h1 className="ptitle">{copy.historyTitle}</h1>
          <div className="ptitle__sub">{copy.histSubtitle}</div>
        </div>
        <MonthSwitcher
          ym={ym}
          currentYm={currentYm}
          basePath="/mobile/attendance/history"
          locale={locale}
          labels={{ prev: copy.monthPrev, next: copy.monthNext, select: copy.monthSelect }}
        />
      </div>

      {isCurrentMonth ? (
        <SummaryCard summary={summary} todaySession={todayOpen} weekSec={weekSec} copy={copy} />
      ) : null}

      {flagged.length > 0 ? (
        <button
          type="button"
          className="attn attn--warn"
          onClick={() => {
              if (flagged.length === 1) setSelectedId(flagged[0].id);
              else setPickerOpen(true);
            }}
        >
          <span className="attn__ic"><AIc>{AttIcon.warn}</AIc></span>
          <div className="attn__b">
            <div className="attn__t">
              {copy.statusReviewRequired} {copy.histFlaggedCount(flagged.length)}
            </div>
            <div className="attn__s">
              {(() => {
                const f = flagged[0];
                const [, mm, dd] = f.operatingDate.split("-");
                const shortDate = `${parseInt(mm, 10)}/${parseInt(dd, 10)}`;
                const missOut = !f.clockOutLabel && f.status !== "open";
                return `${shortDate} ${missOut ? copy.reasonMissingOut : f.dateLabel}`;
              })()}
            </div>
          </div>
          <span className="attn__chev"><AIc>{AttIcon.chevR}</AIc></span>
        </button>
      ) : null}

      {sessions.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 28px", gap: "14px" }}>
          <span style={{ width: 60, height: 60, borderRadius: 19, background: "var(--surface)", color: "var(--faint)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
            <AIc>{AttIcon.clock}</AIc>
          </span>
          <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: "var(--ink)" }}>{copy.histEmpty}</p>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>{copy.histSubtitle}</p>
        </div>
      ) : null}

      {groups.map((g) => {
        const { d, wd } = dateGroupLabel(g.date, todayDate, locale, copy.histToday);
        const groupWorked = g.sessions.reduce((acc, s) => acc + (s.workedSec ?? 0), 0);
        const hasRunning = g.sessions.some((s) => s.status === "open");
        const hasFlagged = g.sessions.some(
          (s) => s.reviewState === "review_required" || s.isAbnormal,
        );
        const sumLabel = hasRunning
          ? copy.sessOpen
          : hasFlagged
            ? copy.statusReviewRequired
            : groupWorked > 0
              ? fmtHM(groupWorked)
              : "—";
        return (
          <div key={g.date}>
            <div className="dgroup">
              <span className="dgroup__d">{d}</span>
              <span className="dgroup__wd">{wd}</span>
              <span
                className="dgroup__sum"
                style={hasFlagged ? { color: "var(--warn)" } : undefined}
              >
                {sumLabel}
              </span>
            </div>
            {g.sessions.map((s) => (
              <SessionRow
                key={s.id}
                s={s}
                copy={copy}
                onClick={() => setSelectedId(s.id)}
              />
            ))}
          </div>
        );
      })}

      {pickerOpen && (
        <FlaggedSessionPicker
          sessions={flagged}
          copy={copy}
          locale={locale}
          todayDate={todayDate}
          onSelect={(id) => {
            setPickerOpen(false);
            setSelectedId(id);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {selected && (
        <BottomSheet onClose={close}>
          <div className="att">
            <h3 className="rsheet__t">{selected.dateLabel}</h3>
            <div className="histsheet__chips">
              <StatusChips s={selected} copy={copy} />
            </div>
            <div className="recap">
              <div className="recap__r">
                <span className="recap__k">
                  <AIc>{AttIcon.pin}</AIc>{copy.histClockIn}
                </span>
                <span className="recap__v">
                  <span className="mono">{selected.clockInLabel ?? "--:--"}</span> ·{" "}
                  {selected.clockInSiteName ?? "—"} ·{" "}
                  {methodLabel(selected.clockInMethod, copy.methodManual)}
                </span>
              </div>
              <div className="recap__r">
                <span className="recap__k">
                  <AIc>{AttIcon.logout}</AIc>{copy.histClockOut}
                </span>
                <span className="recap__v">
                  {selected.clockOutLabel ? (
                    <>
                      <span className="mono">{selected.clockOutLabel}</span> ·{" "}
                      {selected.clockOutSiteName ?? "—"} ·{" "}
                      {methodLabel(selected.clockOutMethod, copy.methodManual)}
                    </>
                  ) : selected.status === "open" ? (
                    copy.sessOpen
                  ) : (
                    copy.histNoRecord
                  )}
                </span>
              </div>
              <div className="recap__r">
                <span className="recap__k">{copy.histWorkTime}</span>
                <span className="recap__v">
                  {selected.workedSec != null ? dur(selected.workedSec) : "—"}
                </span>
              </div>
              <div className="recap__r">
                <span className="recap__k">{copy.histBreakTotal}</span>
                <span className="recap__v">
                  {dur(selected.breakTotalSec)}
                  {selected.breakCount ? copy.histBreakCountSuffix(selected.breakCount) : ""}
                </span>
              </div>
            </div>

            {selected.breaks.length > 0 ? (
              <div className="histbreaks">
                {selected.breaks.map((b, i) => (
                  <div className="histbreaks__r" key={`${b.startedAt}-${i}`}>
                    <span className="histbreaks__k">{copy.histBreakRowLabel(i + 1)}</span>
                    <span className="mono">
                      {b.startedLabel} – {b.endedLabel ?? copy.sessOpen}
                    </span>
                    <span className="histbreaks__d">
                      {b.durationSec != null ? dur(b.durationSec) : copy.sessOpen}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {selected.isAbnormal ? (
              <div className="failnote warn">
                <AIc>{AttIcon.warn}</AIc>
                <div>
                  <b>{copy.histAbnormalTitle}</b>
                  <p>{copy.histAbnormalBody}</p>
                </div>
              </div>
            ) : null}

            {selected.correctionStatus ? (
              <Link
                href={selected.correctionRequestId ? `/mobile/attendance/correction/status?id=${selected.correctionRequestId}` : "/mobile/attendance/correction/status"}
                className="ghostbtn"
                style={{ marginTop: "12px" }}
              >
                <AIc>{AttIcon.info}</AIc>{copy.histViewCorrStatus}
              </Link>
            ) : (
              <Link
                href={`/mobile/attendance/correction?sessionId=${selected.id}`}
                className="ghostbtn"
                style={{ marginTop: "12px" }}
              >
                <AIc>{AttIcon.edit}</AIc>{copy.histRequestCorr}
              </Link>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
