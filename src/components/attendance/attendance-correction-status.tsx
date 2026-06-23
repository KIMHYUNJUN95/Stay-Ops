"use client";

/**
 * Attendance correction request — status read-back (frames 상태 1~4), wired to real data in Step 6.
 * Renders 요청됨 / 검토 중 / 승인 / 반려 from a real `CorrectionRequestView`. Admin approve/reject is
 * Step 7, so in practice requests are `requested` for now; the four-state rendering is kept so Step 7
 * can light up without redesign. Design preserved (steps · recap · review block).
 */

import Link from "next/link";
import "./attendance.css";
import { AIc, AttIcon } from "./att-icons";
import type { AttendanceCorrectionStatus } from "@/lib/attendance";
import { getDictionary, type Dictionary } from "@/lib/i18n";

type AttendanceCopy = Dictionary["attendance"];

export type CorrectionRequestView = {
  id: string;
  status: AttendanceCorrectionStatus;
  /** Localised reason label (deprecated — prefer reasonKey). */
  reasonLabel: string;
  /** i18n key for reason, e.g. "reasonMissingIn". Looked up via dictionary at render time. */
  reasonKey?: string;
  sessionId: string | null;
  targetDateLabel: string | null;
  desiredClockInLabel: string | null;
  desiredClockOutLabel: string | null;
  desiredSiteName: string | null;
  memo: string | null;
  photoCount: number;
  reviewComment: string | null;
  reviewerName: string | null;
  reviewedAtLabel: string | null;
  createdAtLabel: string;
};

type MetaEntry = {
  chip: string;
  chipIcon: "none" | "check" | "x";
  stage: number;
  rejected: boolean;
};

function Steps({
  stage,
  rejected,
  copy,
}: {
  stage: number;
  rejected: boolean;
  copy: AttendanceCopy;
}) {
  const node = (i: number, label: string) => {
    let cls = "";
    if (rejected) {
      if (i < 2) cls = "done";
      if (i === 2) cls = "rej";
    } else if (i < stage) {
      cls = "done";
    } else if (i === stage) {
      cls = "cur";
    }
    const warn = stage === 1 && i === 1 && !rejected;
    const inner =
      cls === "done" ? <AIc>{AttIcon.check}</AIc> : cls === "rej" ? <AIc>{AttIcon.x}</AIc> : i + 1;
    return (
      <div className={`stp ${cls}${warn ? " warn" : ""}`}>
        <span className="stp__dot">{inner}</span>
        <span className="stp__l">{label}</span>
      </div>
    );
  };
  const line = (on: boolean) => <span className={`stpline${on ? " done" : ""}`} />;
  return (
    <div className="steps">
      {node(0, copy.stepRequested)}
      {line(stage >= 1 || rejected)}
      {node(1, copy.stepInReview)}
      {line(rejected || stage >= 2)}
      {node(2, rejected ? copy.stepRejected : copy.stepApproved)}
    </div>
  );
}

export function AttendanceCorrectionStatus({
  request,
  locale,
}: {
  request: CorrectionRequestView;
  locale: string;
}) {
  const copy = getDictionary(locale).attendance;
  const META: Record<AttendanceCorrectionStatus, MetaEntry & { label: string }> = {
    requested: { chip: "c-info", chipIcon: "none", label: copy.stepRequested, stage: 0, rejected: false },
    in_review: { chip: "c-warn", chipIcon: "none", label: copy.stepInReview, stage: 1, rejected: false },
    approved: { chip: "c-done", chipIcon: "check", label: copy.stepApproved, stage: 2, rejected: false },
    rejected: { chip: "c-danger", chipIcon: "x", label: copy.stepRejected, stage: 2, rejected: true },
  };

  const m = META[request.status];
  const editHref = request.sessionId
    ? `/mobile/attendance/correction?sessionId=${request.sessionId}`
    : "/mobile/attendance/correction";

  return (
    <div className="att">
      <div className="caphead">
        <div>
          <div className="capttl">{copy.corrStatusTitle}</div>
          <div className="capsub">
            {request.targetDateLabel
              ? copy.corrStatusSubSession(request.targetDateLabel)
              : copy.corrStatusSubException}
          </div>
        </div>
      </div>

      <div className="statushero">
        <div className="statushero__top">
          <span className="statushero__ttl">{copy.corrStatusHeading}</span>
          <span className={`chip ${m.chip}`}>
            {m.chipIcon === "check" ? (
              <AIc>{AttIcon.check}</AIc>
            ) : m.chipIcon === "x" ? (
              <AIc>{AttIcon.x}</AIc>
            ) : (
              <span className="d" />
            )}
            {m.label}
          </span>
          <span className="statushero__time">{request.createdAtLabel}</span>
        </div>
        <Steps stage={m.stage} rejected={m.rejected} copy={copy} />
      </div>

      <div className="sectt">{copy.corrDetailSectionTitle}</div>
      <div className="recap">
        <div className="recap__r">
          <span className="recap__k">{copy.corrDetailTarget}</span>
          <span className="recap__v">{request.targetDateLabel ?? copy.corrDetailNoSession}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">{copy.corrDetailReason}</span>
          <span className="recap__v">
            {request.reasonKey
              ? (copy[request.reasonKey as keyof typeof copy] as string | undefined) ??
                request.reasonLabel
              : request.reasonLabel}
          </span>
        </div>
        <div className="recap__r">
          <span className="recap__k">{copy.corrDetailDesiredIn}</span>
          <span className="recap__v mono">{request.desiredClockInLabel ?? "—"}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">{copy.corrDetailDesiredOut}</span>
          <span className="recap__v mono">{request.desiredClockOutLabel ?? "—"}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">{copy.corrDetailSite}</span>
          <span className="recap__v">{request.desiredSiteName ?? copy.corrSiteNone}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">{copy.corrDetailAttachment}</span>
          <span className="recap__v">
            {request.photoCount > 0 ? copy.corrDetailPhotos(request.photoCount) : copy.corrDetailNone}
          </span>
        </div>
        {request.memo ? (
          <div className="recap__r">
            <span className="recap__k">{copy.corrDetailMemo}</span>
            <span className="recap__v">{request.memo}</span>
          </div>
        ) : null}
      </div>

      {request.status === "requested" ? (
        <>
          <div
            className="review"
            style={{
              background: "var(--info-bg)",
              border: "1px solid color-mix(in oklab, var(--info) 20%, transparent)",
            }}
          >
            <AIc>{AttIcon.info}</AIc>
            <div className="review__b">
              <b style={{ color: "var(--info)" }}>{copy.corrWaitingTitle}</b>
              <p>{copy.corrWaitingBody}</p>
            </div>
          </div>
          <Link href={editHref} className="ghostbtn">
            <AIc>{AttIcon.edit}</AIc>{copy.corrResend}
          </Link>
        </>
      ) : request.status === "in_review" ? (
        <div
          className="review"
          style={{
            background: "var(--warn-bg)",
            border: "1px solid color-mix(in oklab, var(--warn) 22%, transparent)",
          }}
        >
          <span className="review__av">
            {(request.reviewerName ?? copy.corrInReviewAdmin)[0]}
          </span>
          <div className="review__b">
            <b style={{ color: "var(--warn)" }}>
              {copy.corrInReviewTitle(request.reviewerName ?? copy.corrInReviewAdmin)}
            </b>
            <p>{copy.corrInReviewBody}</p>
          </div>
        </div>
      ) : request.status === "approved" ? (
        <div className="review ok">
          <span className="review__av">
            {(request.reviewerName ?? copy.corrInReviewAdmin)[0]}
          </span>
          <div className="review__b">
            <b>
              {request.reviewerName
                ? copy.corrApprovedTitle(request.reviewerName)
                : copy.stepApproved}
            </b>
            <p>{request.reviewComment ?? copy.corrApprovedDefault}</p>
            {request.reviewedAtLabel ? (
              <div className="review__t">{copy.corrApprovedAt(request.reviewedAtLabel)}</div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="review rej">
            <span className="review__av">
              {(request.reviewerName ?? copy.corrInReviewAdmin)[0]}
            </span>
            <div className="review__b">
              <b>
                {request.reviewerName
                  ? copy.corrRejectedTitle(request.reviewerName)
                  : copy.stepRejected}
              </b>
              <p>{request.reviewComment ?? copy.corrRejectedDefault}</p>
              {request.reviewedAtLabel ? (
                <div className="review__t">{copy.corrRejectedAt(request.reviewedAtLabel)}</div>
              ) : null}
            </div>
          </div>
          <Link href={editHref} className="ghostbtn">
            <AIc>{AttIcon.edit}</AIc>{copy.corrResend}
          </Link>
        </>
      )}
      <div style={{ height: "16px" }} />
    </div>
  );
}
