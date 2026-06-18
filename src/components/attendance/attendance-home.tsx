"use client";

/**
 * Attendance home — ring-hero clock screen (Section A of "Attendance Module v2.html").
 * Renders ONE designed state (출근 전 / 근무 중 / 휴게 중 / 로딩). Steps 3–4 wired it to real data:
 * the open-session ring ticks live, and break start/end + the on-break state are real (`openSession`).
 * `?state=` is retained only as a static design preview. 1:1 with the handoff — every icon is wrapped
 * in `.ic` so it is sized by `.ic svg { width:1em }`.
 */

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import "./attendance.css";
import { AIc, AttIcon, AttRingDefs } from "./att-icons";
import { startBreak, endBreak, respondOpenSessionReminder } from "@/app/mobile/attendance/actions";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";

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
              <span className="ring__state idle">대기</span>
              <span className="ring__idletxt">출근 전</span>
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

/** "HH:mm" from seconds (no seconds component). */
function fmtHM(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}`;
}

/** "mm:ss" from seconds (for the current-break ticker). */
function fmtMS(totalSec: number): string {
  const safe = Math.max(0, totalSec);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}`;
}

/** Live "오늘 누적 근무" ring for a real open session (ticks once per second, client-only). */
function LiveOpenRing({ clockInAt }: { clockInAt: string | null }) {
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
  // Ring fill references an 8-hour shift; purely decorative.
  const pct = Math.min(Math.max(elapsed, 0) / (8 * 3600), 1);
  return <Ring variant="open" cls="open" state="근무 중" big={big} sec={sec} lbl="오늘 누적 근무" pct={pct} />;
}

/**
 * Live 휴게 중 body for a real open session that has an open break. Ticks once per second (client-only):
 * the banner shows the CURRENT break (mm:ss), the ring shows worked time = elapsed − total break, and
 * the strip shows the running break total + count. 퇴근하기 stays disabled (must end break first).
 */
function LiveBreakBody({
  clockInAt,
  openBreakStartedAt,
  closedBreakSeconds,
  breakCount,
  onEndBreak,
  busy,
}: {
  clockInAt: string | null;
  openBreakStartedAt: string | null;
  closedBreakSeconds: number;
  breakCount: number;
  onEndBreak: () => void;
  busy: boolean;
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
          <b>휴게 중</b>
          <p>휴게를 종료해야 퇴근할 수 있어요</p>
        </div>
        <span className="t mono">{fmtMS(currentBreakSec)}</span>
      </div>
      <Ring variant="break" cls="break" state="휴게 중" big={fmtHM(workedSec)} lbl="근무 시간 (휴게 제외)" pct={pct} />
      <div className="infostrip">
        <div className="infocell">
          <div className="infocell__k">휴게 합계</div>
          <div className="infocell__v mono">{fmtHM(totalBreakSec)}</div>
        </div>
        <div className="infocell">
          <div className="infocell__k">휴게 횟수</div>
          <div className="infocell__v">{breakCount}번째</div>
        </div>
      </div>
      <button type="button" className="clockbtn clockbtn--disabled">
        <AIc>{AttIcon.logout}</AIc>퇴근하기 (휴게 종료 필요)
      </button>
      <button
        type="button"
        className="breakbtn breakbtn--active"
        onClick={onEndBreak}
        disabled={busy}
      >
        <AIc>{AttIcon.play}</AIc>휴게 종료
      </button>
    </>
  );
}

/**
 * 18:30 open-session reminder prompt (Step 14). Shown once per Tokyo day while a session is still open.
 * "근무 중이에요" records `still_working` (suppresses the prompt for the rest of the day); "이미 퇴근했어요"
 * records `left_work` and routes to the correction flow — it does NOT auto clock-out. Reuses the shared
 * drag-dismiss bottom sheet.
 */
function ReminderPrompt({ sessionId }: { sessionId: string }) {
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
        <h3 className="rsheet__t">아직 근무 중인가요?</h3>
        <p className="rsheet__s">18:30이 지났어요. 진행 중인 근무가 있어요.</p>
        <div className="rbtns">
          <button type="button" className="rbtn rbtn--primary" onClick={onStillWorking} disabled={busy}>
            근무 중이에요
          </button>
          <button type="button" className="rbtn rbtn--ghost" onClick={onLeftWork} disabled={busy}>
            <AIc>{AttIcon.edit}</AIc>이미 퇴근했어요
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Methods() {
  return (
    <div className="methods">
      <div className="methodchip on">
        <span className="methodchip__ic">
          <AIc>{AttIcon.qr}</AIc>
        </span>
        <div className="methodchip__t">
          <b>GPS + QR</b>
          <span>사용 가능</span>
        </div>
      </div>
      <div className="methodchip ghost">
        <span className="methodchip__ic">
          <AIc>{AttIcon.wifi}</AIc>
        </span>
        <div className="methodchip__t">
          <b>Wi-Fi</b>
          <span>준비중</span>
        </div>
      </div>
    </div>
  );
}

export type OpenSessionView = {
  clockInAt: string | null;
  clockInTimeLabel: string;
  siteName: string;
  /** Non-null when a break is currently open (Step 4). */
  openBreakStartedAt: string | null;
  closedBreakSeconds: number;
  breakCount: number;
};

export function AttendanceHome({
  userName,
  userInitial,
  todayLabel,
  state = "idle",
  openSession = null,
  reminderOpenSessionId = null,
}: {
  userName: string;
  userInitial: string;
  todayLabel: string;
  state?: HomeState;
  /** Real open session (Steps 3–4). When present the open/break states render live data; null = preview. */
  openSession?: OpenSessionView | null;
  /** Non-null → show the 18:30 open-session reminder prompt for this session (Step 14). */
  reminderOpenSessionId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

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

  // Brief "loading" skeleton on entry, like a real app fetching attendance state. Opening
  // `?state=loading` keeps it static (for design review) by skipping the auto-reveal.
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    if (state === "loading") return;
    const t = setTimeout(() => setBooting(false), 800);
    return () => clearTimeout(t);
  }, [state]);
  const showLoading = state === "loading" || booting;

  const topline = (
    <div className="topline">
      <div>
        <div className="topline__d">{todayLabel}</div>
        <div className="topline__n">{userName} 님</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Link href="/mobile/attendance/history" className="histlink">
          <AIc>{AttIcon.clock}</AIc>이력
        </Link>
        <Link href="/mobile/attendance/pay" className="histlink">
          급여
        </Link>
        <span className="topline__av">{userInitial}</span>
      </div>
    </div>
  );

  if (showLoading) {
    return (
      <div className="att">
        <div className="topline">
          <div>
            <div className="skel" style={{ width: "130px", height: "13px" }} />
            <div className="skel" style={{ width: "120px", height: "22px", marginTop: "8px" }} />
          </div>
          <div className="skel" style={{ width: "42px", height: "42px", borderRadius: "14px" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 18px" }}>
          <div className="skel" style={{ width: "252px", height: "252px", borderRadius: "999px" }} />
        </div>
        <div className="skel" style={{ height: "64px", borderRadius: "18px", marginBottom: "14px" }} />
        <div className="skel" style={{ height: "62px", borderRadius: "18px", marginBottom: "11px" }} />
        <div className="skel" style={{ height: "52px", borderRadius: "15px" }} />
      </div>
    );
  }

  if (state === "open") {
    // Real open session (Step 3) → live data; otherwise the static design preview.
    const siteName = openSession ? openSession.siteName : "아라키초 A";
    const clockInLabel = openSession ? openSession.clockInTimeLabel : "09:02";
    return (
      <div className="att">
        <AttRingDefs />
        {topline}
        <div style={{ height: "5vh" }} />
        {openSession ? (
          <LiveOpenRing clockInAt={openSession.clockInAt} />
        ) : (
          <Ring variant="open" cls="open" state="근무 중" big="04:38" sec="12" lbl="오늘 누적 근무" pct={0.58} />
        )}
        <div className="infostrip">
          <div className="infocell">
            <div className="infocell__k">
              <AIc>{AttIcon.pin}</AIc>출근 장소
            </div>
            <div className="infocell__v">{siteName}</div>
          </div>
          <div className="infocell">
            <div className="infocell__k">
              <AIc>{AttIcon.clock}</AIc>출근 시각
            </div>
            <div className="infocell__v mono">{clockInLabel}</div>
          </div>
        </div>
        {/* Clock-out requires GPS + QR again → launch the capture flow in clock-out mode. */}
        <Link href="/mobile/attendance/capture?mode=out" className="clockbtn clockbtn--out">
          <AIc>{AttIcon.logout}</AIc>퇴근하기
        </Link>
        {openSession ? (
          <button type="button" className="breakbtn" onClick={onStartBreak} disabled={busy}>
            <AIc>{AttIcon.coffee}</AIc>휴게 시작
          </button>
        ) : (
          <Link href="/mobile/attendance?state=break" className="breakbtn">
            <AIc>{AttIcon.coffee}</AIc>휴게 시작
          </Link>
        )}
        {reminderOpenSessionId ? <ReminderPrompt sessionId={reminderOpenSessionId} /> : null}
      </div>
    );
  }

  if (state === "break") {
    return (
      <div className="att">
        <AttRingDefs />
        {topline}
        <div style={{ height: "5vh" }} />
        {openSession ? (
          <LiveBreakBody
            clockInAt={openSession.clockInAt}
            openBreakStartedAt={openSession.openBreakStartedAt}
            closedBreakSeconds={openSession.closedBreakSeconds}
            breakCount={openSession.breakCount}
            onEndBreak={onEndBreak}
            busy={busy}
          />
        ) : (
          <>
            <div className="breakbanner">
              <AIc>{AttIcon.coffee}</AIc>
              <div>
                <b>휴게 중</b>
                <p>휴게를 종료해야 퇴근할 수 있어요</p>
              </div>
              <span className="t mono">00:23</span>
            </div>
            <Ring variant="break" cls="break" state="휴게 중" big="04:15" lbl="근무 시간 (휴게 제외)" pct={0.52} />
            <div className="infostrip">
              <div className="infocell">
                <div className="infocell__k">휴게 합계</div>
                <div className="infocell__v mono">00:48</div>
              </div>
              <div className="infocell">
                <div className="infocell__k">휴게 횟수</div>
                <div className="infocell__v">2번째</div>
              </div>
            </div>
            <button type="button" className="clockbtn clockbtn--disabled">
              <AIc>{AttIcon.logout}</AIc>퇴근하기 (휴게 종료 필요)
            </button>
            <Link href="/mobile/attendance?state=open" className="breakbtn breakbtn--active">
              <AIc>{AttIcon.play}</AIc>휴게 종료
            </Link>
          </>
        )}
        {reminderOpenSessionId ? <ReminderPrompt sessionId={reminderOpenSessionId} /> : null}
      </div>
    );
  }

  // idle (출근 전) — original compact layout, nudged down slightly.
  return (
    <div className="att">
      <AttRingDefs />
      {topline}
      <div style={{ height: "5vh" }} />
      <Ring variant="idle" />
      <Link href="/mobile/attendance/capture" className="clockbtn clockbtn--in" style={{ marginTop: "4px" }}>
        <AIc>{AttIcon.qr}</AIc>출근하기
      </Link>
      <Methods />
    </div>
  );
}
