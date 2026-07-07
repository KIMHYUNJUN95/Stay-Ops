"use client";

// Admin console — leave request creation modal (proxy or self). Tone matches
// admin-reason-modal.tsx (scrim + rounded var(--card) shell) but is form-specific, so it is not
// built on top of that component. Reuses AdminDatePicker (inline mode) for the desktop date fields
// and the same day-count / bereavement-leave / half-day rules as the mobile leave-form.
// See docs/product/26-annual-leave-workflow.md.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { AdminDatePicker } from "../shared/admin-date-picker";
import { createAdminLeaveRequestAction } from "@/app/admin/attendance/leave/actions";
import type {
  LeaveApplicantOption,
  AdminLeaveRequestInput,
} from "@/lib/annual-leave-admin-server";
import type { LeaveType, LeaveDurationUnit } from "@/lib/annual-leave-approvals-server";
import type { Dictionary, Locale } from "@/lib/i18n";

type Lc = Dictionary["admin"]["leaveConsole"];

const TYPES: LeaveType[] = ["paid", "annual", "special", "other"];
const BEREAVEMENT_DAYS = 3;

// Inline styles below stand in for the mobile-only `.field__l` / `.req` / `.fhint` / `.ferr` /
// `.durseg` classes (leave.css is scoped to `.lv`, not `.adm`) so this form stays in the admin
// console's `.adm` visual language without leaking mobile-scoped CSS.
const FIELD_LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12.5,
  fontWeight: 800,
  color: "var(--ink-soft)",
};
const REQ_STYLE: React.CSSProperties = { color: "var(--danger)" };
const HINT_STYLE: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--muted)",
  lineHeight: 1.4,
};
const FERR_STYLE: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: "var(--danger)" };

function typeBadgeClass(type: LeaveType): string {
  switch (type) {
    case "paid":
      return "typebadge--paid";
    case "annual":
      return "typebadge--annual";
    case "special":
      return "typebadge--special";
    default:
      return "typebadge--other";
  }
}

function typeLabel(type: LeaveType, lc: Lc): string {
  switch (type) {
    case "paid":
      return lc.typePaid;
    case "annual":
      return lc.typeAnnual;
    case "special":
      return lc.typeSpecial;
    default:
      return lc.typeOther;
  }
}

function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function tokyoToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function localeTagOf(locale: Locale): string {
  return locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
}

function errLabel(reason: string | undefined, lc: Lc): string {
  switch (reason) {
    case "forbidden":
      return lc.formErrForbidden;
    case "target_not_found":
      return lc.formErrTargetNotFound;
    case "invalid_reason":
      return lc.formErrInvalidReason;
    case "invalid_dates":
      return lc.formErrInvalidDates;
    case "create_failed":
    default:
      return lc.formErrCreateFailed;
  }
}

export function LeaveRequestModal({
  mode,
  applicants,
  currentUserId,
  currentUserName,
  locale,
  lc,
  onClose,
  onCreated,
}: {
  mode: "proxy" | "self";
  applicants: LeaveApplicantOption[];
  currentUserId: string;
  currentUserName: string;
  locale: Locale;
  lc: Lc;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const router = useRouter();
  const localeTag = localeTagOf(locale);
  const today = tokyoToday();

  const [targetUserId, setTargetUserId] = useState(mode === "self" ? currentUserId : "");
  const [leaveType, setLeaveType] = useState<LeaveType>("paid");
  const [durationUnit, setDurationUnit] = useState<LeaveDurationUnit>("full");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [fieldErr, setFieldErr] = useState<{ target?: boolean; reason?: boolean; dates?: boolean }>(
    {},
  );
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isBereavement = leaveType === "annual";
  const isUnpaid = leaveType === "other";
  const half = durationUnit !== "full" && !isBereavement;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function chooseType(type: LeaveType) {
    setLeaveType(type);
    if (type === "annual") {
      setDurationUnit("full");
      setEndDate(addDaysISO(startDate, BEREAVEMENT_DAYS - 1));
    }
  }

  function chooseStart(next: string) {
    setStartDate(next);
    if (isBereavement) {
      setEndDate(addDaysISO(next, BEREAVEMENT_DAYS - 1));
    } else if (half) {
      setEndDate(next);
    } else if (next > endDate) {
      setEndDate(next);
    }
  }

  function chooseDuration(unit: LeaveDurationUnit) {
    setDurationUnit(unit);
    if (unit !== "full") setEndDate(startDate);
  }

  function submit() {
    const hasTarget = targetUserId.trim().length > 0;
    const hasReason = reason.trim().length > 0;
    const datesOk = isBereavement || half || endDate >= startDate;
    setFieldErr({ target: !hasTarget, reason: !hasReason, dates: !datesOk });
    setSubmitErr(null);
    if (!hasTarget || !hasReason || !datesOk) return;

    const input: AdminLeaveRequestInput = {
      targetUserId,
      leaveType,
      startDate,
      endDate,
      durationUnit,
      reason,
      emergencyContact,
    };

    startTransition(async () => {
      const res = await createAdminLeaveRequestAction(input);
      if (res.ok) {
        onCreated(lc.formDone);
        onClose();
        router.refresh();
      } else {
        setSubmitErr(errLabel(res.error, lc));
      }
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "proxy" ? lc.modalTitleProxy : lc.modalTitleSelf}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15, 23, 32, 0.45)",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="admodal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          maxHeight: "88vh",
          overflowY: "auto",
          background: "var(--card)",
          borderRadius: 16,
          border: "1px solid var(--line)",
          boxShadow: "var(--sh-pop)",
          padding: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: "var(--ink)" }}>
            {mode === "proxy" ? lc.modalTitleProxy : lc.modalTitleSelf}
          </div>
          <button
            type="button"
            className="panel__x"
            onClick={onClose}
            aria-label="close"
            disabled={pending}
          >
            <span className="ic">
              <X />
            </span>
          </button>
        </div>

        {/* 신청 대상 */}
        <div style={{ marginBottom: 14 }}>
          <div style={FIELD_LABEL_STYLE}>
            {lc.formTarget}
            <span style={REQ_STYLE}>*</span>
          </div>
          {mode === "self" ? (
            <div
              style={{
                padding: "9px 11px",
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "var(--surface)",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink-soft)",
              }}
            >
              {currentUserName || lc.formTargetSelf}
            </div>
          ) : (
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 11px",
                border: `1px solid ${fieldErr.target ? "var(--danger)" : "var(--line)"}`,
                borderRadius: 10,
                background: "var(--surface)",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--ink)",
                fontFamily: "inherit",
              }}
            >
              <option value="">{lc.formTargetSelect}</option>
              {applicants.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          {fieldErr.target ? (
            <div style={{ ...FERR_STYLE, marginTop: 4 }}>{lc.formErrTarget}</div>
          ) : null}
        </div>

        {/* 휴가 구분 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...FIELD_LABEL_STYLE, marginBottom: 6 }}>
            {lc.formType}
            <span style={REQ_STYLE}>*</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                className={`typebadge ${typeBadgeClass(t)}`}
                style={{
                  cursor: "pointer",
                  border: t === leaveType ? "1.5px solid var(--primary)" : "1px solid transparent",
                  opacity: t === leaveType ? 1 : 0.55,
                }}
                onClick={() => chooseType(t)}
              >
                {typeLabel(t, lc)}
              </button>
            ))}
          </div>
          {isBereavement ? <div style={{ ...HINT_STYLE, marginTop: 6 }}>{lc.formBereaveHint}</div> : null}
          {isUnpaid ? <div style={{ ...HINT_STYLE, marginTop: 6 }}>{lc.formUnpaidHint}</div> : null}
        </div>

        {/* 기간 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...FIELD_LABEL_STYLE, marginBottom: 6 }}>
            {lc.formPeriod}
            <span style={REQ_STYLE}>*</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="who__sub" style={{ marginBottom: 4 }}>
                {lc.formStart}
              </div>
              <AdminDatePicker
                value={startDate}
                onChange={chooseStart}
                localeTag={localeTag}
                ariaLabel={lc.formStart}
                labels={{ prevMonth: lc.formStart, nextMonth: lc.formEnd, today: lc.formStart }}
              />
            </div>
            {!isBereavement && !half ? (
              <div>
                <div className="who__sub" style={{ marginBottom: 4 }}>
                  {lc.formEnd}
                </div>
                <AdminDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  min={startDate}
                  localeTag={localeTag}
                  ariaLabel={lc.formEnd}
                  labels={{ prevMonth: lc.formStart, nextMonth: lc.formEnd, today: lc.formEnd }}
                />
              </div>
            ) : (
              <div>
                <div className="who__sub" style={{ marginBottom: 4 }}>
                  {lc.formEnd}
                </div>
                <div
                  style={{
                    padding: "9px 11px",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    background: "var(--surface)",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--ink-soft)",
                  }}
                >
                  {endDate}
                </div>
              </div>
            )}
          </div>
          {fieldErr.dates ? <div style={{ ...FERR_STYLE, marginTop: 4 }}>{lc.formErrDates}</div> : null}

          {!isBereavement ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...FIELD_LABEL_STYLE, marginBottom: 6 }}>{lc.formDuration}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {(
                  [
                    ["full", lc.formDurationFull],
                    ["am", lc.formDurationAm],
                    ["pm", lc.formDurationPm],
                  ] as const
                ).map(([unit, label]) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => chooseDuration(unit)}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 9,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      border: durationUnit === unit ? "1.5px solid var(--primary)" : "1px solid var(--line)",
                      background: durationUnit === unit ? "var(--surface)" : "var(--card)",
                      color: durationUnit === unit ? "var(--ink)" : "var(--ink-soft)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 사유 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...FIELD_LABEL_STYLE, marginBottom: 6 }}>
            {lc.formReason}
            <span style={REQ_STYLE}>*</span>
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={lc.formReasonPh}
            rows={3}
            style={{
              width: "100%",
              resize: "none",
              padding: "9px 11px",
              border: `1px solid ${fieldErr.reason ? "var(--danger)" : "var(--line)"}`,
              borderRadius: 10,
              background: "var(--surface)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              fontFamily: "inherit",
            }}
          />
          {fieldErr.reason ? <div style={{ ...FERR_STYLE, marginTop: 4 }}>{lc.formErrReason}</div> : null}
        </div>

        {/* 긴급 연락처 */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...FIELD_LABEL_STYLE, marginBottom: 6 }}>{lc.formEmergency}</div>
          <input
            type="tel"
            value={emergencyContact}
            onChange={(e) => setEmergencyContact(e.target.value)}
            placeholder={lc.formEmergencyPh}
            style={{
              width: "100%",
              padding: "9px 11px",
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: "var(--surface)",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink)",
              fontFamily: "inherit",
            }}
          />
        </div>

        {submitErr ? (
          <div style={{ marginBottom: 10, fontSize: 11.5, fontWeight: 700, color: "var(--danger)" }}>
            {submitErr}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ flex: 1 }}
            onClick={onClose}
            disabled={pending}
          >
            {lc.formCancel}
          </button>
          <button
            type="button"
            className="btn"
            style={{ flex: 1.4, background: "var(--primary)", color: "#fff" }}
            onClick={submit}
            disabled={pending}
          >
            {pending ? lc.formSubmitting : lc.formSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}
