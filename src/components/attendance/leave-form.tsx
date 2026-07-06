"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./leave.css";
import { AIc, AttIcon } from "./att-icons";
import { LeaveDatePicker } from "./leave-date-picker";
import { tokyoToday } from "@/lib/annual-leave";
import { submitLeaveRequestAction } from "@/app/mobile/attendance/leave/actions";
import type { LeaveRequestView } from "@/lib/annual-leave-requests-server";
import { getDictionary, type Dictionary } from "@/lib/i18n";

// L2 · 신청서 작성 — 종이 신청서를 그대로 옮긴 폼. 종류 선택 · 휴가 단위(종일/오전·오후 반차)는
// 폼 안에서 바로 전환된다(섹션 T · H). 휴가 기간 필드를 탭하면 날짜 범위 캘린더 바텀시트(섹션 D)가
// 올라온다. 실제 연/월 이동 캘린더 + submitLeaveRequestAction으로 실제 제출/임시저장된다
// (annual_leave_requests 테이블, migration 202607060002). 승인/문서출력은 아직 이후 단계.
// `draft`가 있으면 임시저장 이어쓰기 — 그 draft row를 그대로 update한다(status draft 상태에서만).

type LeaveCopy = Dictionary["leave"];
type LeaveType = "annual" | "paid" | "special" | "other";
type Duration = "full" | "am" | "pm";

const TYPES: LeaveType[] = ["paid", "annual", "special", "other"];
const BEREAVEMENT_DAYS = 3;

function typeLabel(t: LeaveType, c: LeaveCopy): string {
  return t === "annual" ? c.typeAnnual : t === "paid" ? c.typePaid : t === "special" ? c.typeSpecial : c.typeOther;
}

function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function diffDaysISO(start: string, end: string): number {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.round((endMs - startMs) / 86400000) + 1;
}

export function LeaveForm({
  locale,
  userName,
  draft,
}: {
  locale: string;
  userName: string;
  draft?: LeaveRequestView | null;
}) {
  const c: LeaveCopy = getDictionary(locale).leave;
  const router = useRouter();
  const today = tokyoToday();
  const [selType, setSelType] = useState<LeaveType>(draft?.leaveType ?? "annual");
  const [dur, setDur] = useState<Duration>(draft?.durationUnit ?? "full");
  const [reason, setReason] = useState(draft?.reason ?? "");
  const [emergency, setEmergency] = useState(draft?.emergencyContact ?? "");
  const [startDate, setStartDate] = useState(draft?.startDate ?? today);
  const [endDate, setEndDate] = useState(draft?.endDate ?? addDaysISO(today, BEREAVEMENT_DAYS - 1));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reasonErr, setReasonErr] = useState(false);
  const [emergencyErr, setEmergencyErr] = useState(false);
  const [submitErr, setSubmitErr] = useState(false);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  const isBereavement = selType === "annual";
  const isUnpaid = selType === "other";
  const half = dur !== "full" && !isBereavement;
  const rangeDays = diffDaysISO(startDate, endDate);
  const daysCount = half ? 0.5 : rangeDays;

  async function submit(asDraft: boolean) {
    const hasReason = reason.trim().length > 0;
    const hasEmergency = emergency.trim().length > 0;
    setReasonErr(!hasReason);
    setEmergencyErr(!hasEmergency);
    setSubmitErr(false);
    if (!asDraft && (!hasReason || !hasEmergency)) return;

    setBusy(asDraft ? "draft" : "submit");
    const result = await submitLeaveRequestAction({
      requestId: draft?.id,
      applicantName: userName,
      leaveType: selType,
      startDate,
      endDate,
      durationUnit: half ? dur : "full",
      daysCount,
      reason,
      emergencyContact: emergency,
      asDraft,
    });
    setBusy(null);

    if (!result.ok) {
      setSubmitErr(true);
      return;
    }
    router.push(asDraft ? "/mobile/attendance/leave" : `/mobile/attendance/leave/done?id=${result.id}`);
  }

  return (
    <div className="lv" style={{ paddingBottom: 96 }}>
      <div className="pagehead">
        <span className="pagehead__crumb">{c.crumb}</span>
        <span className="pagehead__t">{c.formTitle}</span>
      </div>

      {/* 신청일 (자동) */}
      <div className="field">
        <div className="field__l">
          {c.fApp}
          <span className="auto">{c.fAuto}</span>
        </div>
        <div className="finput ro mono">
          {today}
          <span className="ro-badge">{c.fAuto}</span>
        </div>
      </div>

      {/* 신청자 (읽기전용) */}
      <div className="field">
        <div className="field__l">{c.fName}</div>
        <div className="finput ro">
          <span className="lead"><AIc>{AttIcon.users}</AIc></span>
          {userName}
          <span className="ro-badge">{c.fRo}</span>
        </div>
      </div>

      {/* 휴가 기간 */}
      <div className={`field period${half ? " half" : ""}`}>
        <div className="field__l">
          {c.fPeriod}
          <span className="req">*</span>
        </div>
        <div className="daterange">
          <button type="button" className="finput mono start" onClick={() => setPickerOpen(true)}>
            {startDate}
            <span className="tail"><AIc>{AttIcon.calendar}</AIc></span>
          </button>
          <span className="daterange__arrow"><AIc>{AttIcon.arrowR}</AIc></span>
          <button type="button" className="finput mono end" onClick={() => setPickerOpen(true)}>
            {endDate}
            <span className="tail"><AIc>{AttIcon.calendar}</AIc></span>
          </button>
        </div>
        {isBereavement ? null : (
          <div className="durseg">
            {([["full", c.dFull], ["am", c.dAm], ["pm", c.dPm]] as const).map(([d, label]) => (
              <button
                key={d}
                type="button"
                className={dur === d ? "on" : ""}
                onClick={() => {
                  setDur(d);
                  if (d !== "full") setEndDate(startDate);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="periodfoot">
          <span className="daycount">
            <AIc>{AttIcon.calendar}</AIc>
            {isBereavement ? c.fBereaveDays : half ? c.fHalf : c.fDays(rangeDays)}
          </span>
        </div>
        {isBereavement ? <div className="fhint">{c.fBereaveHint}</div> : null}
      </div>

      {/* 휴가 종류 */}
      <div className="field">
        <div className="field__l">
          {c.fType}
          <span className="req">*</span>
        </div>
        <div className="ftypes">
          {TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              className={`ftype${ty === selType ? " on" : ""}`}
              onClick={() => {
                setSelType(ty);
                if (ty === "annual") {
                  setDur("full");
                  setEndDate(addDaysISO(startDate, BEREAVEMENT_DAYS - 1));
                }
              }}
            >
              <span className="ftype__box">{ty === selType ? AttIcon.check : null}</span>
              <span className="ftype__l">{typeLabel(ty, c)}</span>
            </button>
          ))}
        </div>
        {isUnpaid ? <div className="fhint">{c.fOtherUnpaidHint}</div> : null}
      </div>

      {/* 사유 */}
      <div className="field">
        <div className="field__l">
          {c.fReason}
          <span className="req">*</span>
        </div>
        <textarea
          className="ftext"
          placeholder={c.fReasonPh}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="fcount">{reason.length} / 300</div>
        {reasonErr ? <div className="ferr">{c.fReasonErr}</div> : null}
      </div>

      {/* 비상 연락처 */}
      <div className="field">
        <div className="field__l">
          {c.fEmg}
          <span className="req">*</span>
        </div>
        <div className={`finput${emergencyErr ? " err" : ""}`}>
          <span className="lead"><AIc>{AttIcon.phone}</AIc></span>
          <input
            inputMode="tel"
            placeholder={c.fEmgPh}
            value={emergency}
            onChange={(e) => setEmergency(e.target.value)}
          />
        </div>
        {emergencyErr ? <div className="ferr">{c.fEmgErr}</div> : null}
      </div>

      {submitErr ? (
        <div className="fhint" style={{ color: "var(--danger)" }}>
          {c.exSetupSaveErr}
        </div>
      ) : null}

      {/* sticky actions */}
      <div className="lv-foot">
        <button type="button" className="fbtn fbtn--draft" disabled={busy !== null} onClick={() => submit(true)}>
          <AIc>{AttIcon.save}</AIc>
          {c.save}
        </button>
        <button type="button" className="fbtn fbtn--submit" disabled={busy !== null} onClick={() => submit(false)}>
          <AIc>{AttIcon.check}</AIc>
          {c.submit}
        </button>
      </div>

      {/* D · 날짜 범위 캘린더 (바텀시트) */}
      {pickerOpen ? (
        <LeaveDatePicker
          locale={locale}
          copy={c}
          startDate={startDate}
          endDate={endDate}
          singleDay={half}
          fixedRangeDays={isBereavement ? BEREAVEMENT_DAYS : undefined}
          onApply={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
