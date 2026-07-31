"use client";

import { useState } from "react";
import { Power, PowerOff, Trash2 } from "lucide-react";
import {
  deleteAttendanceSiteAction,
  setAttendanceSiteActiveAction,
} from "@/app/admin/settings/attendance/actions";

// 출퇴근 현장 정리 컨트롤 — 비활성화 / 완전 삭제.
//
// 삭제는 되돌릴 수 없고(붙여둔 인쇄 QR 도 즉시 죽는다) 인라인 확인을 한 번 거친다.
// **출퇴근 기록이 있는 현장은 삭제 자체가 불가능하다** — `attendance_sessions` 의 FK 가
// `on delete restrict` 라 DB 가 막는다(급여 근거 보호). 그런 현장은 삭제 버튼 대신 안내를 띄우고
// 비활성화만 남긴다. 조직 삭제(`OrgDeleteButton`)와 같은 인라인 확인 패턴이다.

type Labels = {
  delete: string;
  deleteConfirm: string;
  deactivate: string;
  activate: string;
  inUseHint: string;
  deactivateHint: string;
  cancel: string;
};

export function SiteDangerActions({
  siteId,
  isActive,
  hasHistory,
  labels,
}: {
  siteId: string;
  isActive: boolean;
  /** 출퇴근 기록이 있으면 삭제 불가 — 비활성화만 제공한다. */
  hasHistory: boolean;
  labels: Labels;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <form action={setAttendanceSiteActiveAction}>
          <input name="siteId" type="hidden" value={siteId} />
          <input name="activate" type="hidden" value={isActive ? "0" : "1"} />
          <button className="btn btn--ghost btn--sm" type="submit">
            <span className="ic">{isActive ? <PowerOff /> : <Power />}</span>
            {isActive ? labels.deactivate : labels.activate}
          </button>
        </form>

        {hasHistory || confirming ? null : (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setConfirming(true)}
            type="button"
          >
            <span className="ic">
              <Trash2 aria-hidden="true" />
            </span>
            {labels.delete}
          </button>
        )}
      </div>

      {hasHistory ? (
        <div className="setnote setnote--dim">{labels.inUseHint}</div>
      ) : confirming ? (
        <div
          className="setnote setnote--warn"
          style={{ flexWrap: "wrap", alignItems: "center", gap: 10 }}
        >
          <span style={{ flex: 1, minWidth: 180 }}>{labels.deleteConfirm}</span>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setConfirming(false)}
            type="button"
          >
            {labels.cancel}
          </button>
          <form action={deleteAttendanceSiteAction}>
            <input name="siteId" type="hidden" value={siteId} />
            <button className="btn btn--danger btn--sm" type="submit">
              <span className="ic">
                <Trash2 aria-hidden="true" />
              </span>
              {labels.delete}
            </button>
          </form>
        </div>
      ) : (
        <div className="setnote setnote--dim">{labels.deactivateHint}</div>
      )}
    </div>
  );
}
