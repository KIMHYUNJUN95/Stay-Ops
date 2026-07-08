"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight, Download, FileText, Users } from "lucide-react";
import type { LeaveDurationUnit, LeaveType } from "@/lib/annual-leave-approvals-server";
import type { Dictionary } from "@/lib/i18n";

type Lc = Dictionary["admin"]["leaveConsole"];

function Ic({ children }: { children: React.ReactNode }) {
  return <span className="ic">{children}</span>;
}

/** Static mock (design-only view — no Supabase/server-action wiring). Mirrors
 * .handoff/src/leave-data.js REQ (approved subset) + EMP + APPROVERS shape. */
type MockDoc = {
  id: string;
  docNo: string;
  empKey: string;
  type: LeaveType;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  dur: LeaveDurationUnit;
  days: number;
  reason: string;
  contact: string;
  appliedOn: string; // YYYY/MM/DD — 申請日
  approverKey: "ceo" | "smd";
  approverName: string;
  decidedAt: string;
};

type MockEmp = {
  key: string;
  name: string;
  initial: string;
  bg: string;
  role: string;
};

const MOCK_EMP: Record<string, MockEmp> = {
  jung: { key: "jung", name: "정유진", initial: "정", bg: "#9a4d6d", role: "프론트" },
  oh: { key: "oh", name: "오세훈", initial: "오", bg: "#3f7d5a", role: "하우스키핑 리드" },
  nakamura: { key: "nakamura", name: "나카무라 아오이", initial: "나", bg: "#4d6db5", role: "프론트 매니저" },
  watanabe: { key: "watanabe", name: "와타나베 소라", initial: "와", bg: "#557a8a", role: "시설 관리" },
  takahashi: { key: "takahashi", name: "다카하시 리쿠", initial: "다", bg: "#b5683f", role: "예약 담당" },
};

const APPROVER_NAME: Record<"ceo" | "smd", string> = { ceo: "김현준", smd: "모리 다이스케" };
const APPROVER_INITIAL: Record<"ceo" | "smd", string> = { ceo: "김", smd: "모" };

const MOCK_DOCS: MockDoc[] = [
  {
    id: "l7",
    docNo: "AL-2026-07-007",
    empKey: "jung",
    type: "paid",
    start: "2026-07-03",
    end: "2026-07-03",
    dur: "pm",
    days: 0.5,
    reason: "개인 용무",
    contact: "090-2841-5567",
    appliedOn: "2026/07/01",
    approverKey: "ceo",
    approverName: APPROVER_NAME.ceo,
    decidedAt: "07/01 15:22",
  },
  {
    id: "l8",
    docNo: "AL-2026-07-008",
    empKey: "oh",
    type: "paid",
    start: "2026-07-07",
    end: "2026-07-08",
    dur: "full",
    days: 2,
    reason: "가족 행사",
    contact: "090-7712-3390",
    appliedOn: "2026/06/30",
    approverKey: "smd",
    approverName: APPROVER_NAME.smd,
    decidedAt: "07/02 13:40",
  },
  {
    id: "l9",
    docNo: "AL-2026-07-009",
    empKey: "nakamura",
    type: "paid",
    start: "2026-07-24",
    end: "2026-07-24",
    dur: "full",
    days: 1,
    reason: "개인 사정",
    contact: "080-4402-8871",
    appliedOn: "2026/07/01",
    approverKey: "ceo",
    approverName: APPROVER_NAME.ceo,
    decidedAt: "07/02 09:05",
  },
  {
    id: "l10",
    docNo: "AL-2026-07-010",
    empKey: "watanabe",
    type: "paid",
    start: "2026-07-15",
    end: "2026-07-17",
    dur: "full",
    days: 3,
    reason: "여름 휴가",
    contact: "090-1123-9987",
    appliedOn: "2026/06/28",
    approverKey: "smd",
    approverName: APPROVER_NAME.smd,
    decidedAt: "06/29 11:20",
  },
  {
    id: "l11",
    docNo: "AL-2026-07-011",
    empKey: "takahashi",
    type: "paid",
    start: "2026-07-15",
    end: "2026-07-15",
    dur: "pm",
    days: 0.5,
    reason: "오후 개인 용무",
    contact: "070-8890-2245",
    appliedOn: "2026/07/02",
    approverKey: "ceo",
    approverName: APPROVER_NAME.ceo,
    decidedAt: "07/03 08:50",
  },
];

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

/** "2026-07-14" → "07/14" */
function fmtMd(dateStr: string): string {
  return dateStr.slice(5).replace("-", "/");
}

function fmtPeriod(doc: MockDoc, lc: Lc): string {
  const s = fmtMd(doc.start);
  const e = fmtMd(doc.end);
  const base = s === e ? s : `${s} – ${e}`;
  if (doc.dur === "am") return `${base} · ${lc.durationAm}`;
  if (doc.dur === "pm") return `${base} · ${lc.durationPm}`;
  return base;
}

/** 「休暇届」form period column — Japanese slash-date range + half-day/day-count suffix. */
function fmtFormPeriod(doc: MockDoc): string {
  const s = doc.start.replace(/-/g, "/");
  const e = doc.end.replace(/-/g, "/");
  return s === e ? s : `${s} ～ ${e}`;
}

const JP_TYPE_LABEL: Record<LeaveType, string> = {
  paid: "有給休暇",
  annual: "慶弔休暇",
  special: "特別休暇",
  other: "その他",
};

const JP_DUR_LABEL: Record<LeaveDurationUnit, string> = {
  full: "終日",
  am: "午前半休",
  pm: "午後半休",
};

/** A4 「休暇届」paper form — pixel-matched to .handoff/src/leave-views.js doc() + leave.css .jp*.
 * Form copy is the actual Japanese company form text, not app UI — not an i18n target. */
function LeaveFormSheet({ doc, emp }: { doc: MockDoc; emp: MockEmp }) {
  const [dy, dm, dd] = doc.appliedOn.split("/");
  const radioOption = (key: LeaveType) => (
    <span className={`jp__opt${doc.type === key ? " on" : ""}`} key={key}>
      <span className="jp__radio" />
      {JP_TYPE_LABEL[key]}
    </span>
  );

  return (
    <div className="jp">
      <div className="jp__title">休　暇　届</div>
      <div className="jp__appdate">
        申請日<span className="jp__cln">：</span>
        <u>{dy}</u> 年 <u>{dm}</u> 月 <u>{dd}</u> 日
      </div>
      <table className="jp__tbl">
        <tbody>
          <tr className="r-sm">
            <th>氏　名</th>
            <td>{emp.name}</td>
          </tr>
          <tr className="r-sm">
            <th>期　間</th>
            <td>
              <span className="jp__per">{fmtFormPeriod(doc)}</span>
              <span className="jp__sub">
                　（{JP_DUR_LABEL[doc.dur]} ・ {doc.days}日）
              </span>
            </td>
          </tr>
          <tr className="r-type">
            <th>休暇区分</th>
            <td>
              <div className="jp__opts">
                {radioOption("paid")}
                {radioOption("annual")}
                {radioOption("special")}
              </div>
              <div className="jp__opts">{radioOption("other")}</div>
            </td>
          </tr>
          <tr className="r-tall">
            <th>事　由</th>
            <td>{doc.reason}</td>
          </tr>
          <tr className="r-md">
            <th>緊急連絡先</th>
            <td>{doc.contact}</td>
          </tr>
        </tbody>
      </table>
      <div className="jp__sign">
        <div className="jp__note">上記の通りお届けします。</div>
        <table className="jp__stamps">
          <tbody>
            <tr>
              <th>本人</th>
              <th>部署長</th>
              <th>専務</th>
            </tr>
            <tr>
              <td>
                <span className="jp__seal">{emp.initial}</span>
              </td>
              <td>{doc.approverKey === "ceo" ? <span className="jp__seal">{APPROVER_INITIAL.ceo}</span> : null}</td>
              <td>{doc.approverKey === "smd" ? <span className="jp__seal">{APPROVER_INITIAL.smd}</span> : null}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LeaveDocumentsView({ lc }: { lc: Lc }) {
  const empKeys = Array.from(new Set(MOCK_DOCS.map((d) => d.empKey)));
  const [empKey, setEmpKey] = useState(empKeys[0]);
  const empDocs = MOCK_DOCS.filter((d) => d.empKey === empKey).sort((a, b) => (a.start < b.start ? -1 : 1));
  const [docId, setDocId] = useState(empDocs[0]?.id);
  const doc = MOCK_DOCS.find((d) => d.id === docId) ?? empDocs[0];
  const emp = MOCK_EMP[empKey];

  const stageRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Scale the fixed 210mm×297mm sheet to the stage width — mirrors handoff fitDoc().
  useLayoutEffect(() => {
    function fit() {
      const stage = stageRef.current;
      const paper = paperRef.current;
      const wrap = wrapRef.current;
      if (!stage || !paper || !wrap) return;
      const scale = Math.min(1, (stage.clientWidth - 52) / paper.offsetWidth);
      paper.style.transform = `scale(${scale})`;
      paper.style.transformOrigin = "top left";
      wrap.style.width = `${paper.offsetWidth * scale}px`;
      wrap.style.height = `${paper.offsetHeight * scale}px`;
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [docId]);

  function selectEmp(key: string) {
    setEmpKey(key);
    const firstDoc = MOCK_DOCS.filter((d) => d.empKey === key).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
    setDocId(firstDoc?.id);
  }

  if (!doc) return null;

  return (
    <div className="dwrap">
      <div className="dlist">
        <div className="dlist__h">
          <Ic>
            <Users />
          </Ic>
          <span className="t">{lc.docsEmpListTitle}</span>
          <span className="card__cnt" style={{ marginLeft: "auto" }}>
            {lc.docsEmpCount(empKeys.length)}
          </span>
        </div>
        <div className="dlist__scroll">
          {empKeys.map((key) => {
            const e = MOCK_EMP[key];
            const docs = MOCK_DOCS.filter((d) => d.empKey === key);
            const latest = docs.slice().sort((a, b) => (a.start < b.start ? 1 : -1))[0];
            return (
              <div
                key={key}
                className={`demp${key === empKey ? " on" : ""}`}
                onClick={() => selectEmp(key)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") selectEmp(key);
                }}
              >
                <span className="avatar" style={{ background: e.bg }}>
                  {e.initial}
                </span>
                <div className="demp__b">
                  <div className="demp__nm">{e.name}</div>
                  <div className="demp__s">
                    {e.role} · {lc.docsEmpLatest(fmtMd(latest.start))}
                  </div>
                </div>
                <span className="demp__cnt">{lc.docsEmpCount(docs.length)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="ddetail">
        <div className="dtop">
          <span className="avatar" style={{ background: emp.bg, width: 28, height: 28, fontSize: 12 }}>
            {emp.initial}
          </span>
          <span className="dtop__t">{emp.name}</span>
          <span className="dtop__s">
            {emp.role} · {lc.docsCountLabel(empDocs.length)}
          </span>
          <span className="toolbar__spacer" />
          <button type="button" className="btn btn--ghost btn--sm">
            <Ic>
              <FileText />
            </Ic>
            {lc.docsBtnOriginal}
          </button>
          <button type="button" className="btn btn--pri btn--sm" onClick={() => window.print()}>
            <Ic>
              <Download />
            </Ic>
            {lc.docsBtnPrint}
          </button>
        </div>

        <div className="card ddocs">
          {empDocs.map((d) => (
            <div
              key={d.id}
              className={`ddoc${d.id === docId ? " on" : ""}`}
              onClick={() => setDocId(d.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") setDocId(d.id);
              }}
            >
              <span className="ddoc__no mono">{d.docNo}</span>
              <span className={`typebadge ${typeBadgeClass(d.type)}`}>{typeLabel(d.type, lc)}</span>
              <span className="mono ddoc__per">{fmtPeriod(d, lc)}</span>
              <span className="ddoc__days">{lc.daysUnit(d.days)}</span>
              <span className="ddoc__by">{lc.docsApprovedBy(d.approverName, d.decidedAt)}</span>
              <span className="ic ddoc__chk">{d.id === docId ? <Check /> : <ChevronRight />}</span>
            </div>
          ))}
        </div>

        <div className="card dviewer">
          <div className="dviewer__bar">
            <span className="dviewer__meta">
              <b className="mono">{doc.docNo}</b> · {lc.docsViewerMeta}
            </span>
          </div>
          <div className="dviewer__stage" ref={stageRef}>
            <div className="dviewer__wrap" id="paperWrap" ref={wrapRef}>
              <div id="docSheet" ref={paperRef}>
                <LeaveFormSheet doc={doc} emp={emp} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
