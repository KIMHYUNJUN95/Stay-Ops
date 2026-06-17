"use client";

/**
 * Frame 9 — notifications screen, reproduced 1:1 from `frameNotif()` in the
 * Feedback Box.html handoff mockup: a minimal centered "알림" header (no back
 * button per request, no app wordmark bar, no bottom tab bar), suggestion
 * notification rows, and a flow hint.
 *
 * UI/UX only — static sample data. This replaces the live notifications list UI
 * with the page-9 mockup; the data-driven `notification-list.tsx` is preserved
 * for re-wiring when the backend is connected.
 * See docs/product/22-staff-suggestions-workflow.md.
 */

import type { ReactNode } from "react";
import "./suggestions.css";
import { SgIcon } from "./sg-icons";

type Notif = { icon: ReactNode; body: ReactNode; time: string; unread: boolean };

const NOTIFS: Notif[] = [
  {
    icon: SgIcon.inbox,
    body: (
      <>
        <b>김민수</b> 님이 의견을 보냈습니다 — <b>&ldquo;3층 린넨 카트 동선 개선 제안&rdquo;</b>
      </>
    ),
    time: "방금",
    unread: true,
  },
  {
    icon: SgIcon.comment,
    body: (
      <>
        <b>한지호</b> 님이 댓글을 남겼습니다 — &ldquo;305호 옆 창고는…&rdquo;
      </>
    ),
    time: "25분 전",
    unread: true,
  },
  {
    icon: SgIcon.flag,
    body: (
      <>
        <b>정해나</b> 님이 상태를 <b>검토중</b>으로 변경했습니다
      </>
    ),
    time: "1시간 전",
    unread: false,
  },
  {
    icon: SgIcon.eye,
    body: (
      <>
        <b>김민수</b> 님이 회원님을 참조에 추가했습니다
      </>
    ),
    time: "3시간 전",
    unread: false,
  },
];

export function SuggestionsNotif() {
  return (
    <div className="sg sg--screen">
      <div className="sgnotif-h">
        <span className="title">알림</span>
      </div>
      <div className="scroll">
        {NOTIFS.map((n, i) => (
          <div key={i} className={`notif${n.unread ? " unread" : ""}`}>
            <span className="notif__ic">{n.icon}</span>
            <div className="notif__b">
              <div className="notif__t">{n.body}</div>
              <div className="notif__time">{n.time}</div>
            </div>
            {n.unread ? <span className="notif__dot" /> : null}
          </div>
        ))}
        <div className="flowhint">
          <span className="ic">{SgIcon.info}</span>
          알림을 탭하면 해당 의견 상세로 바로 이동합니다
        </div>
      </div>
    </div>
  );
}
