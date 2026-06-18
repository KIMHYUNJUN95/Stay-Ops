"use client";

/**
 * Attendance home — redesigned to match "Attendance Home (entry buttons).html" handoff.
 * Idle state: greeting header · ring hero · clock-in button · methods · shortcut entry list.
 * Open/break states: same greeting header + live ring data (unchanged).
 */

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import "./attendance.css";
import { AIc, AttIcon, AttRingDefs } from "./att-icons";
import { startBreak, endBreak, respondOpenSessionReminder } from "@/app/mobile/attendance/actions";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import { getDictionary, type Dictionary } from "@/lib/i18n";

type AttendanceCopy = Dictionary["attendance"];

export type HomeState = "idle" | "open" | "break" | "loading";

const RADIUS = 105;
const CIRC = 2 * Math.PI * RADIUS;

function Ring({
  variant,
  state,
  cls,
  big,
  sec,
  lbl,
  pct,
}: {
  variant: "idle" | "open" | "break";
  state?: string;
  cls?: "open" | "break";
  big?: string;
  sec?: string;
  lbl?: string;
  pct?: number;
}) {
  const off = CIRC * (1 - (pct ?? 0));
  return (
    <div className="hero">
      <div className="att-ring">
        <svg width="252" height="252" viewBox="0 0 252 252">
          <circle className="ring__track" cx="126" cy="126" r={RADIUS} />
          {variant !== "idle" ? (
            <circle
              className={`ring__prog ${cls}`}
              cx="126"
              cy="126"
              r={RADIUS}
              strokeDasharray={CIRC}
              strokeDashoffset={off}
            />
          ) : null}
        </svg>
        <div className="ring__center">
          {variant === "idle" ? (
            <>
              <span className="ring__idleicon">{AttIcon.qr}</span>
              <span className="ring__state idle">{state}</span>
              <span className="ring__idletxt">{lbl}</span>
            </>
          ) : (
            <>
              <span className={`ring__state ${cls}`}>
                <span className="pulse" />
                {state}
              </span>
              <span className="ring__big">
                {big}
                {sec ? <span className="sec">:{sec}</span> : null}
              </span>
              <span className="ring__lbl">{lbl}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtElapsed(elapsedSec: number) {
  const safe = Math.max(0, elapsedSec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = Math.floor(safe % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { big: `${pad(h)}:${pad(m)}`, sec: pad(s) };
}

function fmtHM(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

function fmtMS(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}`;
}

function LiveOpenRing({ clockInAt, copy }: { clockInAt: string | null; copy: AttendanceCopy }) {
  const startMs = clockInAt ? new Date(clockInAt).getTime() : null;
  const [elapsed, setElapsed] = useState(() =>
    startMs == null ? 0 : Math.floor((Date.now() - startMs) / 1000),
  );
  useEffect(() => {
    if (startMs == null) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startMs) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startMs]);
  const { big, sec } = fmtElapsed(elapsed);
  const pct = Math.min(Math.max(elapsed, 0) / (8 * 3600), 1);
  return <Ring variant="open" cls="open" state={copy.ringWorking} big={big} sec={sec} lbl={copy.ringAccumLabel} pct={pct} />;
}

function LiveBreakBody({
  clockInAt,
  openBreakStartedAt,
  closedBreakSeconds,
  breakCount,
  onEndBreak,
  busy,
  copy,
}: {
  clockInAt: string | null;
  openBreakStartedAt: string | null;
  closedBreakSeconds: number;
  breakCount: number;
  onEndBreak: () => void;
  busy: boolean;
  copy: AttendanceCopy;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const clockInMs = clockInAt ? new Date(clockInAt).getTime() : null;
  const breakStartMs = openBreakStartedAt ? new Date(openBreakStartedAt).getTime() : null;
  const currentBreakSec = breakStartMs ? Math.max(0, Math.floor((now - breakStartMs) / 1000)) : 0;
  const totalBreakSec = closedBreakSeconds + currentBreakSec;
  const elapsedSec = clockInMs ? Math.max(0, Math.floor((now - clockInMs) / 1000)) : 0;
  const workedSec = Math.max(0, elapsedSec - totalBreakSec);
  const pct = Math.min(workedSec / (8 * 3600), 1);

  return (
    <>
      <div className="breakbanner">
        <AIc>{AttIcon.coffee}</AIc>
        <div>
          <b>{copy.ringOnBreak}</b>
          <p>{copy.breakWarning}</p>
        </div>
        <span className="t mono">{fmtMS(currentBreakSec)}</span>
      </div>
      <Ring variant="break" cls="break" state={copy.ringOnBreak} big={fmtHM(workedSec)} lbl={copy.ringWorkLabel} pct={pct} />
      <div className="infostrip">
        <div className="infocell">
          <div className="infocell__k">{copy.breakTotal}</div>
          <div className="infocell__v mono">{fmtHM(totalBreakSec)}</div>
        </div>
        <div className="infocell">
          <div className="infocell__k">{copy.breakCount}</div>
          <div className="infocell__v">{copy.breakCountOrdinal(breakCount)}</div>
        </div>
      </div>
      <button type="button" className="clockbtn clockbtn--disabled">
        <AIc>{AttIcon.logout}</AIc>{copy.clockOutDisabled}
      </button>
      <button type="button" className="breakbtn breakbtn--active" onClick={onEndBreak} disabled={busy}>
        <AIc>{AttIcon.play}</AIc>{copy.endBreak}
      </button>
    </>
  );
}

function ReminderPrompt({ sessionId, copy }: { sessionId: string; copy: AttendanceCopy }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const drag = useSheetDragDismiss({ shown: open, onDismiss: () => setOpen(false) });

  const onStillWorking = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const res = await respondOpenSessionReminder("still_working");
    setBusy(false);
    setOpen(false);
    if (res.ok) router.refresh();
  }, [busy, router]);

  const onLeftWork = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await respondOpenSessionReminder("left_work");
    router.push(`/mobile/attendance/correction?sessionId=${sessionId}`);
  }, [busy, router, sessionId]);

  if (!hydrated || !open) return null;

  return createPortal(
    <div className="att">
      <div className="dim show" style={drag.scrimStyle} onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="rsheet" data-sheet role="dialog" aria-modal="true" style={drag.sheetStyle}>
        <div {...drag.handleProps}>
          <div className="rsheet__handle" />
        </div>
        <div className="rsheet__ic ic-warn">{AttIcon.warn}</div>
        <h3 className="rsheet__t">{copy.reminderTitle}</h3>
        <p className="rsheet__s">{copy.reminderBody}</p>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onStillWorking} disabled={busy}>
            {copy.ringWorking}
          </button>
          <button type="button" className="rbtn rbtn--ghost" onClick={onLeftWork} disabled={busy}>
            <AIc>{AttIcon.edit}</AIc>{copy.reminderLeft}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Methods({ copy }: { copy: AttendanceCopy }) {
  return (
    <div className="methods">
      <div className="methodchip on">
        <span className="methodchip__ic"><AIc>{AttIcon.qr}</AIc></span>
        <div className="methodchip__t">
          <b>GPS + QR</b>
          <span>{copy.methodQrAvailable}</span>
        </div>
      </div>
      <div className="methodchip ghost">
        <span className="methodchip__ic"><AIc>{AttIcon.wifi}</AIc></span>
        <div className="methodchip__t">
          <b>Wi-Fi</b>
          <span>{copy.methodWifiSoon}</span>
        </div>
      </div>
    </div>
  );
}

export type OpenSessionView = {
  clockInAt: string | null;
  clockInTimeLabel: string;
  siteName: string;
  openBreakStartedAt: string | null;
  closedBreakSeconds: number;
  breakCount: number;
};

export function AttendanceHome({
  userName,
  todayLabel,
  state = "idle",
  openSession = null,
  reminderOpenSessionId = null,
  monthHours = null,
  monthPay = null,
  locale,
}: {
  userName: string;
  userInitial: string;
  todayLabel: string;
  state?: HomeState;
  openSession?: OpenSessionView | null;
  reminderOpenSessionId?: string | null;
  /** Formatted monthly worked hours (e.g. "32:10"). null = no data to show. */
  monthHours?: string | null;
  /** Formatted monthly pay string (e.g. "¥184,260"). null = salaried or no data. */
  monthPay?: string | null;
  locale: string;
}) {
  const copy = getDictionary(locale).attendance;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [payMasked, setPayMasked] = useState(false);

  const onStartBreak = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const res = await startBreak();
    setBusy(false);
    if (res.ok) router.refresh();
  }, [busy, router]);

  const onEndBreak = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const res = await endBreak();
    setBusy(false);
    if (res.ok) router.refresh();
  }, [busy, router]);

  const [booting, setBooting] = useState(true);
  useEffect(() => {
    if (state === "loading") return;
    const t = setTimeout(() => setBooting(false), 800);
    return () => clearTimeout(t);
  }, [state]);
  const showLoading = state === "loading" || booting;

  // Greeting header — replaces old topline with avatar/links
  const greet = (
    <div className="greet">
      <div className="greet__d">{todayLabel}</div>
      <div className="greet__n">{copy.homeGreetFull(userName)}</div>
    </div>
  );

  // Shortcut entry list (idle only)
  const entryList = (
    <>
      <div className="seclbl">{copy.homeShortcutLabel}</div>
      <div className="entrylist">
        <Link href="/mobile/attendance/history" className="entryrow hist">
          <span className="entryrow__ic"><AIc>{AttIcon.clock}</AIc></span>
          <div className="entryrow__b">
            <div className="entryrow__t">{copy.homeHistTitle}</div>
            <div className="entryrow__s">{copy.homeHistSub}</div>
          </div>
          <div className="entryrow__r">
            <span className="entryrow__val">{monthHours ?? "00:00"}</span>
          </div>
        </Link>
        <Link href="/mobile/attendance/pay" className="entryrow pay">
          <span className="entryrow__ic"><AIc>{AttIcon.wallet}</AIc></span>
          <div className="entryrow__b">
            <div className="entryrow__t">{copy.homePayTitle}</div>
            <div className="entryrow__s">{copy.homePaySub}</div>
          </div>
          <div className="entryrow__r">
            <span className={`entryrow__val${payMasked ? " masked" : ""}`}>
              {monthPay ?? "---"}
            </span>
            <button
              type="button"
              className="eyemini"
              onClick={(e) => {
                e.preventDefault();
                setPayMasked((prev) => !prev);
              }}
              aria-label={copy.homePayHide}
            >
              <AIc>{payMasked ? AttIcon.eyeOff : AttIcon.eye}</AIc>
            </button>
          </div>
        </Link>
      </div>
    </>
  );

  if (showLoading) {
    return (
      <div className="att">
        <div className="greet">
          <div className="skel" style={{ width: "160px", height: "13px" }} />
          <div className="skel" style={{ width: "140px", height: "22px", marginTop: "8px" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 18px" }}>
          <div className="skel" style={{ width: "252px", height: "252px", borderRadius: "999px" }} />
        </div>
        <div className="skel" style={{ height: "60px", borderRadius: "18px", marginBottom: "11px" }} />
        <div className="skel" style={{ height: "52px", borderRadius: "14px" }} />
      </div>
    );
  }

  if (state === "open") {
    const siteName = openSession ? openSession.siteName : copy.previewSite;
    const clockInLabel = openSession ? openSession.clockInTimeLabel : "09:02";
    return (
      <div className="att">
        <AttRingDefs />
        {greet}
        <div style={{ height: "5vh" }} />
        {openSession ? (
          <LiveOpenRing clockInAt={openSession.clockInAt} copy={copy} />
        ) : (
          <Ring variant="open" cls="open" state={copy.ringWorking} big="04:38" sec="12" lbl={copy.ringAccumLabel} pct={0.58} />
        )}
        <div className="infostrip">
          <div className="infocell">
            <div className="infocell__k"><AIc>{AttIcon.pin}</AIc>{copy.clockInSite}</div>
            <div className="infocell__v">{siteName}</div>
          </div>
          <div className="infocell">
            <div className="infocell__k"><AIc>{AttIcon.clock}</AIc>{copy.clockInTime}</div>
            <div className="infocell__v mono">{clockInLabel}</div>
          </div>
        </div>
        <Link href="/mobile/attendance/capture?mode=out" className="clockbtn clockbtn--out">
          <AIc>{AttIcon.logout}</AIc>{copy.clockOut}
        </Link>
        {openSession ? (
          <button type="button" className="breakbtn" onClick={onStartBreak} disabled={busy}>
            <AIc>{AttIcon.coffee}</AIc>{copy.startBreak}
          </button>
        ) : (
          <Link href="/mobile/attendance?state=break" className="breakbtn">
            <AIc>{AttIcon.coffee}</AIc>{copy.startBreak}
          </Link>
        )}
        {reminderOpenSessionId ? <ReminderPrompt sessionId={reminderOpenSessionId} copy={copy} /> : null}
      </div>
    );
  }

  if (state === "break") {
    return (
      <div className="att">
        <AttRingDefs />
        {greet}
        <div style={{ height: "5vh" }} />
        {openSession ? (
          <LiveBreakBody
            clockInAt={openSession.clockInAt}
            openBreakStartedAt={openSession.openBreakStartedAt}
            closedBreakSeconds={openSession.closedBreakSeconds}
            breakCount={openSession.breakCount}
            onEndBreak={onEndBreak}
            busy={busy}
            copy={copy}
          />
        ) : (
          <>
            <div className="breakbanner">
              <AIc>{AttIcon.coffee}</AIc>
              <div>
                <b>{copy.ringOnBreak}</b>
                <p>{copy.breakWarning}</p>
              </div>
              <span className="t mono">00:23</span>
            </div>
            <Ring variant="break" cls="break" state={copy.ringOnBreak} big="04:15" lbl={copy.ringWorkLabel} pct={0.52} />
            <div className="infostrip">
              <div className="infocell">
                <div className="infocell__k">{copy.breakTotal}</div>
                <div className="infocell__v mono">00:48</div>
              </div>
              <div className="infocell">
                <div className="infocell__k">{copy.breakCount}</div>
                <div className="infocell__v">{copy.breakCountOrdinal(2)}</div>
              </div>
            </div>
            <button type="button" className="clockbtn clockbtn--disabled">
              <AIc>{AttIcon.logout}</AIc>{copy.clockOutDisabled}
            </button>
            <Link href="/mobile/attendance?state=open" className="breakbtn breakbtn--active">
              <AIc>{AttIcon.play}</AIc>{copy.endBreak}
            </Link>
          </>
        )}
        {reminderOpenSessionId ? <ReminderPrompt sessionId={reminderOpenSessionId} copy={copy} /> : null}
      </div>
    );
  }

  // idle — 출근 전
  return (
    <div className="att">
      <AttRingDefs />
      {greet}
      <div style={{ height: "4vh" }} />
      <Ring variant="idle" state={copy.ringIdle} lbl={copy.ringIdleLabel} />
      <Link href="/mobile/attendance/capture" className="clockbtn clockbtn--in" style={{ marginTop: "4px" }}>
        <AIc>{AttIcon.qr}</AIc>{copy.clockIn}
      </Link>
      <Methods copy={copy} />
      {entryList}
    </div>
  );
}
