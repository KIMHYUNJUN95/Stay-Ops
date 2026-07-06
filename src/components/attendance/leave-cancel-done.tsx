import Link from "next/link";
import "./leave.css";
import { AIc, AttIcon } from "./att-icons";
import type { Dictionary } from "@/lib/i18n";

// C3 · 취소 완료 — 취소됨 + 잔여 연차 복구 안내. period/days는 cancelLeaveRequestAction 결과를
// page.tsx가 쿼리 파라미터로 넘겨준 실제 값이다.
// 디자인 cancelDone() 재현.

type LeaveCopy = Dictionary["leave"];

export function LeaveCancelDone({ copy: c, period, days }: { copy: LeaveCopy; period: string; days: number }) {
  return (
    <div className="lv" style={{ padding: 0 }}>
      <div className="pagehead" style={{ padding: "4px 2px 0" }}>
        <span className="pagehead__crumb">{c.crumb}</span>
        <span className="pagehead__t">{c.appTitle}</span>
      </div>

      <div className="exwrap">
        <div className="exwrap__ic ic-info">{AttIcon.undo}</div>
        <p className="exwrap__ey">{c.statusCancelled}</p>
        <h3 className="exwrap__t">{c.cancelDoneT}</h3>
        <p className="exwrap__s">{c.cancelDoneS}</p>
        <div className="exwrap__note">
          <div className="exrow">
            <span className="exrow__k">{c.rPeriod}</span>
            <span className="exrow__v mono">{period}</span>
          </div>
          <div className="exrow">
            <span className="exrow__k">{c.rDays}</span>
            <span className="exrow__v mono">
              {days}
              {c.unitD}
            </span>
          </div>
          <div className="exrow">
            <span className="exrow__k">{c.restored}</span>
            <span className="exrow__v mono pri">
              +{days}
              {c.unitD}
            </span>
          </div>
        </div>
        <div className="exwrap__cta">
          <Link className="exbtn exbtn--pri" href="/mobile/attendance/leave/history">
            <AIc>{AttIcon.list}</AIc>
            {c.goHistBtn}
          </Link>
        </div>
      </div>
    </div>
  );
}
