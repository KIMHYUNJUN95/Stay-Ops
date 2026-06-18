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

export type CorrectionRequestView = {
  id: string;
  status: AttendanceCorrectionStatus;
  reasonLabel: string;
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

const META: Record<
  AttendanceCorrectionStatus,
  { chip: string; chipIcon: "none" | "check" | "x"; label: string; stage: number; rejected: boolean }
> = {
  requested: { chip: "c-info", chipIcon: "none", label: "요청됨", stage: 0, rejected: false },
  in_review: { chip: "c-warn", chipIcon: "none", label: "검토 중", stage: 1, rejected: false },
  approved: { chip: "c-done", chipIcon: "check", label: "승인", stage: 2, rejected: false },
  rejected: { chip: "c-danger", chipIcon: "x", label: "반려", stage: 2, rejected: true },
};

function Steps({ stage, rejected }: { stage: number; rejected: boolean }) {
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
      {node(0, "요청됨")}
      {line(stage >= 1 || rejected)}
      {node(1, "검토 중")}
      {line(rejected || stage >= 2)}
      {node(2, rejected ? "반려" : "승인")}
    </div>
  );
}

export function AttendanceCorrectionStatus({ request }: { request: CorrectionRequestView }) {
  const m = META[request.status];
  const editHref = request.sessionId
    ? `/mobile/attendance/correction?sessionId=${request.sessionId}`
    : "/mobile/attendance/correction";

  return (
    <div className="att">
      <div className="caphead">
        <div>
          <div className="capttl">요청 상태</div>
          <div className="capsub">
            {request.targetDateLabel ? `${request.targetDateLabel} 세션 정정` : "예외 정정 요청"}
          </div>
        </div>
      </div>

      <div className="statushero">
        <div className="statushero__top">
          <span className="statushero__ttl">정정 요청</span>
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
        <Steps stage={m.stage} rejected={m.rejected} />
      </div>

      <div className="sectt">요청 내용</div>
      <div className="recap">
        <div className="recap__r">
          <span className="recap__k">대상</span>
          <span className="recap__v">{request.targetDateLabel ?? "예외 요청 (세션 없음)"}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">사유</span>
          <span className="recap__v">{request.reasonLabel}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">희망 출근</span>
          <span className="recap__v mono">{request.desiredClockInLabel ?? "—"}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">희망 퇴근</span>
          <span className="recap__v mono">{request.desiredClockOutLabel ?? "—"}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">장소</span>
          <span className="recap__v">{request.desiredSiteName ?? "선택 안 함"}</span>
        </div>
        <div className="recap__r">
          <span className="recap__k">첨부</span>
          <span className="recap__v">{request.photoCount > 0 ? `사진 ${request.photoCount}장` : "없음"}</span>
        </div>
        {request.memo ? (
          <div className="recap__r">
            <span className="recap__k">메모</span>
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
              <b style={{ color: "var(--info)" }}>검토 대기 중</b>
              <p>관리자가 확인 후 최종 값을 확정합니다. 검토 전까지는 다시 요청할 수 있어요.</p>
            </div>
          </div>
          <Link href={editHref} className="ghostbtn">
            <AIc>{AttIcon.edit}</AIc>다시 요청
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
          <span className="review__av">{(request.reviewerName ?? "관")[0]}</span>
          <div className="review__b">
            <b style={{ color: "var(--warn)" }}>{request.reviewerName ?? "관리자"} 님이 검토 중</b>
            <p>관리자가 요청을 살펴보고 있어요.</p>
          </div>
        </div>
      ) : request.status === "approved" ? (
        <div className="review ok">
          <span className="review__av">{(request.reviewerName ?? "관")[0]}</span>
          <div className="review__b">
            <b>승인됨{request.reviewerName ? ` — ${request.reviewerName}` : ""}</b>
            <p>{request.reviewComment ?? "요청이 승인되었습니다."}</p>
            {request.reviewedAtLabel ? <div className="review__t">승인 {request.reviewedAtLabel}</div> : null}
          </div>
        </div>
      ) : (
        <>
          <div className="review rej">
            <span className="review__av">{(request.reviewerName ?? "관")[0]}</span>
            <div className="review__b">
              <b>반려됨{request.reviewerName ? ` — ${request.reviewerName}` : ""}</b>
              <p>{request.reviewComment ?? "요청이 반려되었습니다."}</p>
              {request.reviewedAtLabel ? <div className="review__t">반려 {request.reviewedAtLabel}</div> : null}
            </div>
          </div>
          <Link href={editHref} className="ghostbtn">
            <AIc>{AttIcon.edit}</AIc>다시 요청
          </Link>
        </>
      )}
      <div style={{ height: "16px" }} />
    </div>
  );
}
