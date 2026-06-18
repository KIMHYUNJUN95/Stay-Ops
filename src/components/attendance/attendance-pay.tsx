"use client";

/**
 * Attendance self monthly pay (Step 10) — NEW screen in the existing `.att` token language (the v2
 * handoff had no 급여 frame; user asked for an arbitrary screen to refine later). Hourly EXPECTED pay
 * only, self-scoped (data from `getMonthlyPayView`). Shows: month nav, expected gross + paid time +
 * excluded count, rate-segment breakdown (when rates changed), and a daily list whose rows open a
 * detail bottom sheet (shared `useSheetDragDismiss`) with that day's sessions. Salaried months show the
 * attendance-only message. No finalization here.
 */

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import type { MonthlyPayView, PayExcludeReason } from "@/lib/attendance-pay";

function fmtDur(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}
function yen(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
function excludeLabel(r: PayExcludeReason): string {
  if (r === "open") return "미완료";
  if (r === "invalid") return "무효";
  if (r === "review_required") return "검토 필요";
  if (r === "pending_correction") return "정정 검토중";
  return "";
}

export function AttendancePay({
  view,
  prevYm,
  nextYm,
}: {
  view: MonthlyPayView;
  prevYm: string;
  nextYm: string;
}) {
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selected = view.days.find((d) => d.date === selectedDate) ?? null;
  const close = () => setSelectedDate(null);
  const drag = useSheetDragDismiss({ shown: selected != null, onDismiss: close });

  const nav = (
    <div className="paynav">
      <Link href={`/mobile/attendance/pay?ym=${prevYm}`} className="paynav__b" aria-label="이전 달">
        {AttIcon.chevR}
      </Link>
      <span className="paynav__m">{view.monthLabel}</span>
      <Link href={`/mobile/attendance/pay?ym=${nextYm}`} className="paynav__b paynav__b--next" aria-label="다음 달">
        {AttIcon.chevR}
      </Link>
    </div>
  );

  if (view.salariedOnly) {
    return (
      <div className="att">
        {nav}
        <div className="payempty">
          <AIc>{AttIcon.info}</AIc>
          <p>시급제 근로자만 급여가 표시됩니다.</p>
          <span>정규직은 이 모듈을 근태/근무 기록 용도로 사용해요.</span>
        </div>
      </div>
    );
  }

  if (view.days.length === 0) {
    return (
      <div className="att">
        {nav}
        <div className="payempty">
          <AIc>{AttIcon.clock}</AIc>
          <p>이 달 근태 기록이 없어요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="att">
      {nav}

      <div className="payhero">
        <div className="payhero__k">
          {view.finalization ? "확정 급여" : "예상 급여 (확정 전)"}
          {view.finalization ? <span className="payhero__badge">확정</span> : null}
        </div>
        <div className="payhero__v">
          {yen(view.finalization ? view.finalization.gross : view.expectedGross)}
        </div>
        <div className="payhero__sub">
          유급 {fmtDur(view.finalization ? view.finalization.paidMinutes : view.totalPaidMinutes)}
          {!view.finalization && view.rateSegments.length > 0
            ? ` · 시급 ${view.rateSegments.map((s) => `${s.rate.toLocaleString("ko-KR")}`).join(" / ")}원`
            : ""}
          {view.finalization?.finalizedAtLabel ? ` · 확정 ${view.finalization.finalizedAtLabel}` : ""}
        </div>
      </div>

      {!view.finalization && view.excludedCount > 0 ? (
        <div className="failnote warn" style={{ marginTop: "12px" }}>
          <AIc>{AttIcon.warn}</AIc>
          <div>
            <b>제외된 기록 {view.excludedCount}건</b>
            <p>검토 전이거나 미완료·무효 기록은 예상 급여에 포함되지 않아요. 정정이 승인되면 반영됩니다.</p>
          </div>
        </div>
      ) : null}

      {view.rateSegments.length > 1 ? (
        <div className="payseg">
          <div className="payseg__t">시급 구간</div>
          {view.rateSegments.map((s) => (
            <div key={s.rate} className="payseg__r">
              <span>시급 {yen(s.rate)}</span>
              <span className="mono">{fmtDur(s.paidMinutes)}</span>
              <span className="payseg__g">{yen(s.gross)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="sectt" style={{ marginTop: "16px" }}>일별 내역</div>
      <div className="paylist">
        {view.days.map((d) => (
          <button key={d.date} type="button" className="payday" onClick={() => setSelectedDate(d.date)}>
            <div className="payday__l">
              <span className="payday__d">{d.dateLabel}</span>
              <span className="payday__m">
                {d.employmentType === "hourly"
                  ? `유급 ${fmtDur(d.paidMinutes)}${d.hourlyRate ? ` · 시급 ${d.hourlyRate.toLocaleString("ko-KR")}원` : ""}`
                  : d.employmentType === "salaried"
                    ? "정규직 (급여 비대상)"
                    : "고용형태 미설정"}
              </span>
            </div>
            <span className="payday__g">
              {d.employmentType === "hourly" ? yen(Math.round(d.grossExact)) : "—"}
            </span>
          </button>
        ))}
      </div>

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
                  {selected.employmentType === "hourly" ? (
                    <span className="chip c-method">시급 {selected.hourlyRate?.toLocaleString("ko-KR") ?? "—"}원</span>
                  ) : selected.employmentType === "salaried" ? (
                    <span className="chip c-invalid">정규직 (급여 비대상)</span>
                  ) : (
                    <span className="chip c-warn">고용형태 미설정</span>
                  )}
                </div>
                <div className="recap">
                  <div className="recap__r">
                    <span className="recap__k">유급 시간</span>
                    <span className="recap__v mono">{fmtDur(selected.paidMinutes)}</span>
                  </div>
                  <div className="recap__r">
                    <span className="recap__k">일 급여</span>
                    <span className="recap__v">
                      {selected.employmentType === "hourly" ? yen(Math.round(selected.grossExact)) : "—"}
                    </span>
                  </div>
                </div>
                <div className="histbreaks">
                  {selected.sessions.map((s, i) => (
                    <div className="histbreaks__r" key={s.sessionId}>
                      <span className="histbreaks__k">세션 {i + 1}</span>
                      <span className="mono">
                        {(s.clockInLabel ?? "--:--")} – {(s.clockOutLabel ?? "--:--")}
                      </span>
                      <span className="histbreaks__d">
                        {s.included
                          ? fmtDur(s.paidMinutes)
                          : (excludeLabel(s.excludeReason) || "제외")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
