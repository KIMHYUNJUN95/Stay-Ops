"use client";

/**
 * Attendance self-view history (Step 5). NEW screen built in the existing `.att` design language
 * (the v2 handoff had no 이력 frame). Renders today's summary + the user's own session list; tapping a
 * card opens a detail bottom sheet (reusing the app's shared `useSheetDragDismiss`) with clock-in/out
 * details, break rows, methods, and review/abnormal markers. All data is already self-scoped on the
 * server (`getAttendanceHistory` / `getAttendanceTodaySummary`).
 */

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import type {
  AttendanceSessionView,
  AttendanceTodaySummary,
} from "@/lib/attendance-history";

function fmtDur(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return "0분";
}

function methodLabel(m: string | null): string {
  if (m === "gps_qr") return "GPS+QR";
  if (m === "gps_wifi") return "GPS+Wi-Fi";
  if (m === "manual") return "수동";
  return "—";
}

function StatusChips({ s }: { s: AttendanceSessionView }) {
  return (
    <span className="histchips">
      {s.status === "open" ? (
        <span className="chip c-open">
          <span className="d" />
          진행 중
        </span>
      ) : s.status === "invalid" ? (
        <span className="chip c-invalid">무효</span>
      ) : s.status === "reopened" ? (
        <span className="chip c-info">재개</span>
      ) : (
        <span className="chip c-done">완료</span>
      )}
      {s.reviewState === "review_required" ? <span className="chip c-warn">검토 필요</span> : null}
      {s.manualCreated ? <span className="chip c-info">수동</span> : null}
      {s.correctionStatus === "requested" ? <span className="chip c-info">정정 요청됨</span> : null}
      {s.correctionStatus === "in_review" ? <span className="chip c-warn">정정 검토중</span> : null}
      {s.correctionStatus === "approved" ? <span className="chip c-done">정정 승인</span> : null}
      {s.correctionStatus === "rejected" ? <span className="chip c-danger">정정 반려</span> : null}
    </span>
  );
}

export function AttendanceHistory({
  summary,
  sessions,
}: {
  summary: AttendanceTodaySummary;
  sessions: AttendanceSessionView[];
}) {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const close = () => setSelectedId(null);
  const drag = useSheetDragDismiss({ shown: selected != null, onDismiss: close });

  return (
    <div className="att">
      <div className="histsum">
        <div className="histsum__cell">
          <span className="histsum__k">오늘 세션</span>
          <span className="histsum__v">{summary.sessionCount}건</span>
        </div>
        <div className="histsum__cell">
          <span className="histsum__k">오늘 근무</span>
          <span className="histsum__v">{fmtDur(summary.workedSec)}</span>
        </div>
        <div className="histsum__cell">
          <span className="histsum__k">오늘 휴게</span>
          <span className="histsum__v">{fmtDur(summary.breakTotalSec)}</span>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="histempty">
          <AIc>{AttIcon.clock}</AIc>
          <p>출퇴근 기록이 아직 없어요</p>
        </div>
      ) : (
        <div className="histlist">
          {sessions.map((s) => (
            <button key={s.id} type="button" className="histcard" onClick={() => setSelectedId(s.id)}>
              <div className="histcard__top">
                <span className="histcard__date">{s.dateLabel}</span>
                <StatusChips s={s} />
              </div>
              <div className="histcard__io">
                <div className="histcard__col">
                  <span className="histcard__k">
                    <AIc>{AttIcon.clock}</AIc>출근
                  </span>
                  <span className="histcard__v mono">{s.clockInLabel ?? "--:--"}</span>
                  <span className="histcard__sub">{s.clockInSiteName ?? "—"}</span>
                </div>
                <div className="histcard__col">
                  <span className="histcard__k">
                    <AIc>{AttIcon.logout}</AIc>퇴근
                  </span>
                  <span className="histcard__v mono">{s.clockOutLabel ?? "--:--"}</span>
                  <span className="histcard__sub">
                    {s.clockOutSiteName ?? (s.status === "open" ? "진행 중" : "기록 없음")}
                  </span>
                </div>
              </div>
              <div className="histcard__meta">
                <span>근무 {s.workedSec != null ? fmtDur(s.workedSec) : "—"}</span>
                <span>
                  휴게 {fmtDur(s.breakTotalSec)}
                  {s.breakCount ? ` · ${s.breakCount}회` : ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {hydrated && selected
        ? createPortal(
            <div className="att">
              <div className="dim show" style={drag.scrimStyle} onClick={close} aria-hidden="true" />
              <div className="rsheet" data-sheet role="dialog" aria-modal="true" style={drag.sheetStyle}>
                <div {...drag.handleProps}>
                  <div className="rsheet__handle" />
                </div>
                <h3 className="rsheet__t">{selected.dateLabel}</h3>
                <div className="histsheet__chips">
                  <StatusChips s={selected} />
                </div>
                <div className="recap">
                  <div className="recap__r">
                    <span className="recap__k">
                      <AIc>{AttIcon.pin}</AIc>출근
                    </span>
                    <span className="recap__v">
                      <span className="mono">{selected.clockInLabel ?? "--:--"}</span> ·{" "}
                      {selected.clockInSiteName ?? "—"} · {methodLabel(selected.clockInMethod)}
                    </span>
                  </div>
                  <div className="recap__r">
                    <span className="recap__k">
                      <AIc>{AttIcon.logout}</AIc>퇴근
                    </span>
                    <span className="recap__v">
                      {selected.clockOutLabel ? (
                        <>
                          <span className="mono">{selected.clockOutLabel}</span> ·{" "}
                          {selected.clockOutSiteName ?? "—"} · {methodLabel(selected.clockOutMethod)}
                        </>
                      ) : selected.status === "open" ? (
                        "진행 중"
                      ) : (
                        "기록 없음"
                      )}
                    </span>
                  </div>
                  <div className="recap__r">
                    <span className="recap__k">근무</span>
                    <span className="recap__v">
                      {selected.workedSec != null ? fmtDur(selected.workedSec) : "—"}
                    </span>
                  </div>
                  <div className="recap__r">
                    <span className="recap__k">휴게 합계</span>
                    <span className="recap__v">
                      {fmtDur(selected.breakTotalSec)}
                      {selected.breakCount ? ` · ${selected.breakCount}회` : ""}
                    </span>
                  </div>
                </div>

                {selected.breaks.length > 0 ? (
                  <div className="histbreaks">
                    {selected.breaks.map((b, i) => (
                      <div className="histbreaks__r" key={`${b.startedAt}-${i}`}>
                        <span className="histbreaks__k">휴게 {i + 1}</span>
                        <span className="mono">
                          {b.startedLabel} – {b.endedLabel ?? "진행 중"}
                        </span>
                        <span className="histbreaks__d">
                          {b.durationSec != null ? fmtDur(b.durationSec) : "진행 중"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {selected.isAbnormal ? (
                  <div className="failnote warn">
                    <AIc>{AttIcon.warn}</AIc>
                    <div>
                      <b>검토가 필요한 기록이에요</b>
                      <p>관리자 확인 또는 정정 요청이 필요할 수 있어요.</p>
                    </div>
                  </div>
                ) : null}

                {selected.correctionStatus ? (
                  <Link
                    href={`/mobile/attendance/correction/status`}
                    className="ghostbtn"
                    style={{ marginTop: "12px" }}
                  >
                    <AIc>{AttIcon.info}</AIc>정정 요청 상태 보기
                  </Link>
                ) : (
                  <Link
                    href={`/mobile/attendance/correction?sessionId=${selected.id}`}
                    className="ghostbtn"
                    style={{ marginTop: "12px" }}
                  >
                    <AIc>{AttIcon.edit}</AIc>이 세션 정정 요청
                  </Link>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
