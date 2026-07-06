import Link from "next/link";
import "./leave.css";
import { AIc, AttIcon } from "./att-icons";
import { tokyoToday, type AnnualLeaveSummary } from "@/lib/annual-leave";
import type { LeaveRequestView } from "@/lib/annual-leave-requests-server";
import { getDictionary, type Dictionary } from "@/lib/i18n";

// L1 · 연차 홈 · 현황 — 독립 흐름의 랜딩. 잔여/부여/사용 요약 · 최근 신청 · 부여 규칙.
// 디자인 핸드오프 leaveHome() 재현. 잔여 연차 `summary`와 최근 신청 `recent`/대기중 `pendingCount`는
// 호출부(page.tsx)가 서버에서 계산·조회해 내려준다 — 입사일/baseline이 없으면 page.tsx가 이 컴포넌트
// 대신 LeaveException(missing)을 렌더하므로, 여기서는 summary가 항상 존재한다고 가정한다.
// 승인/문서출력 백엔드는 아직 없어서 상태는 draft/requested/approved/rejected/cancelled만 실제로 나온다.

type LeaveCopy = Dictionary["leave"];

type LeaveType = "annual" | "paid" | "special" | "other";
type LeaveStatus = "requested" | "review" | "approved" | "rejected" | "draft" | "cancelled";

function shortDate(iso: string): string {
  return iso.slice(5).replace("-", "/");
}

const TYPE_ICON: Record<LeaveType, keyof typeof AttIcon> = {
  annual: "heart",
  special: "gift",
  paid: "coin",
  other: "doc",
};

const STATUS_CHIP: Record<LeaveStatus, string> = {
  requested: "c-warn",
  review: "c-info",
  approved: "c-done",
  rejected: "c-danger",
  draft: "c-muted",
  cancelled: "c-muted",
};

function typeLabel(t: LeaveType, c: LeaveCopy): string {
  return t === "annual" ? c.typeAnnual : t === "paid" ? c.typePaid : t === "special" ? c.typeSpecial : c.typeOther;
}

function statusLabel(s: LeaveStatus, c: LeaveCopy): string {
  switch (s) {
    case "requested": return c.statusRequested;
    case "review": return c.statusReview;
    case "approved": return c.statusApproved;
    case "rejected": return c.statusRejected;
    case "draft": return c.statusDraft;
    case "cancelled": return c.statusCancelled;
  }
}

export function LeaveHome({
  locale,
  summary,
  recent,
  pendingCount,
}: {
  locale: string;
  summary: AnnualLeaveSummary;
  recent: LeaveRequestView[];
  pendingCount: number;
}) {
  const c: LeaveCopy = getDictionary(locale).leave;
  const rules = [c.rule1, c.rule2, c.rule3, c.rule4];
  const today = tokyoToday();

  // main card tracks the "유급 휴가" pool only — the 특별휴가(4-year bonus) pool is
  // a separate, parallel entitlement and is not part of this progress bar/total.
  const basePool = summary.buckets.filter((b) => b.kind !== "bonus");
  const totalPool = basePool.reduce((sum, b) => sum + b.amount, 0);
  const used = Math.max(0, totalPool - summary.baseRemaining);
  const usedPct = totalPool > 0 ? Math.round((used / totalPool) * 100) : 0;

  return (
    <div className="lv" style={{ paddingBottom: 92 }}>
      <div className="pagehead">
        <span className="pagehead__crumb">{c.crumb}</span>
        <span className="pagehead__t">{c.appTitle}</span>
      </div>

      {/* balance summary */}
      <div className="balcard">
        <div className="balcard__deco" />
        <div className="balcard__top">
          <span className="balcard__k">{c.balTitle}</span>
          <span className="balcard__yr">{today.slice(0, 4)}</span>
        </div>
        <div className="balcard__main">
          <div className="balcard__big">
            {summary.baseRemaining}
            <small> {c.unitD}</small>
          </div>
          <div className="balcard__meta">
            <div>
              {c.balUsed} {used}
              {c.unitD} · {c.balGranted} {totalPool}
              {c.unitD}
            </div>
            {summary.nextBaseGrant ? (
              <div>{c.balNextGrant(summary.nextBaseGrant.date, summary.nextBaseGrant.amount)}</div>
            ) : null}
          </div>
        </div>
        <div className="balcard__bar">
          <i style={{ width: `${usedPct}%` }} />
        </div>
        <div className="balcard__foot">
          <span>
            {c.balUsed} {used}
            {c.unitD}
          </span>
          <span>
            {summary.baseRemaining}
            {c.unitD} {c.msRemain}
          </span>
        </div>
      </div>

      {/* 특별휴가(4년 보너스) — 유급 휴가 풀과 별도로 관리되는 독립 항목 */}
      {summary.bonusRemaining > 0 || summary.nextBonusGrant ? (
        <div className="balcard balcard--sub">
          <div className="balcard__top">
            <span className="balcard__k">{c.balSpecialTitle}</span>
          </div>
          {summary.bonusRemaining > 0 ? (
            <div className="balcard__big" style={{ fontSize: 22 }}>
              {summary.bonusRemaining}
              <small> {c.unitD}</small>
            </div>
          ) : summary.nextBonusGrant ? (
            <div className="balcard__meta">
              <div>{c.balSpecialUnlock(summary.nextBonusGrant.date)}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 3-up mini stats */}
      <div className="mstats">
        <div className="mstat">
          <div className="mstat__v pri">{summary.baseRemaining}</div>
          <div className="mstat__k">{c.msRemain}</div>
        </div>
        <div className="mstat">
          <div className="mstat__v">{used}</div>
          <div className="mstat__k">{c.msUsed}</div>
        </div>
        <div className="mstat">
          <div className="mstat__v warn">{pendingCount}</div>
          <div className="mstat__k">{c.msPending}</div>
        </div>
      </div>

      {/* recent requests */}
      <div className="slabel">
        {c.recent}
        <Link className="more" href="/mobile/attendance/leave/history">
          {c.viewAll} <AIc>{AttIcon.chevR}</AIc>
        </Link>
      </div>
      {recent.length === 0 ? <div className="histempty">{c.histEmpty}</div> : null}
      {recent.map((r) => (
        <div className="lrow" key={r.id}>
          <span className={`lrow__ic t-${r.leaveType}`}>
            <AIc>{AttIcon[TYPE_ICON[r.leaveType as LeaveType]]}</AIc>
          </span>
          <div className="lrow__b">
            <div className="lrow__t">{typeLabel(r.leaveType as LeaveType, c)}</div>
            <div className="lrow__s mono">
              {shortDate(r.startDate)} – {shortDate(r.endDate)}
            </div>
          </div>
          <div className="lrow__meta">
            <span className="lrow__days">
              {r.daysCount}
              {c.unitD}
            </span>
            <span className={`chip ${STATUS_CHIP[r.status as LeaveStatus]}`}>
              {r.status === "requested" ? <span className="d" /> : null}
              {statusLabel(r.status as LeaveStatus, c)}
            </span>
          </div>
        </div>
      ))}

      {/* accrual rules */}
      <div className="slabel" style={{ marginTop: 16 }}>
        {c.ruleTitle}
      </div>
      <div className="rulecard">
        {rules.map((rule, i) => (
          <div className="rulerow" key={i}>
            <span className="ic">{AttIcon.check}</span>
            <span>{rule}</span>
          </div>
        ))}
      </div>

      {/* sticky actions (shell bottom nav hidden) */}
      <div className="lv-foot">
        <Link className="fbtn fbtn--draft" href="/mobile/attendance/leave/calendar" aria-label={c.appTitle}>
          <AIc>{AttIcon.calendar}</AIc>
        </Link>
        <Link className="fbtn fbtn--submit" href="/mobile/attendance/leave/new">
          <AIc>{AttIcon.plus}</AIc>
          {c.newReq}
        </Link>
      </div>
    </div>
  );
}
