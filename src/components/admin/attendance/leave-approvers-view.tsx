"use client";

import { useState } from "react";
import { Info, Shield } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

type Lc = Dictionary["admin"]["leaveConsole"];

/** Static mock (design-only view — no Supabase/server-action wiring). Mirrors .handoff/src/leave-data.js MEMBERS shape. */
type MockMember = {
  id: string;
  name: string;
  initial: string;
  bg: string;
  role: string;
  dept: string;
  self?: boolean;
  locked?: boolean;
};

const MOCK_MEMBERS: MockMember[] = [
  { id: "ceo", name: "김현준", initial: "김", bg: "var(--primary)", role: "대표 · 최고 관리자", dept: "경영", self: true, locked: true },
  { id: "smd", name: "모리 다이스케", initial: "모", bg: "#7a5ea8", role: "전무", dept: "경영" },
  { id: "ito", name: "이토 카즈야", initial: "이", bg: "#7a5ea8", role: "운영 매니저", dept: "신주쿠 아넥스" },
  { id: "nakamura", name: "나카무라 아오이", initial: "나", bg: "#4d6db5", role: "프론트 매니저", dept: "아라키초 A" },
  { id: "oh", name: "오세훈", initial: "오", bg: "#3f7d5a", role: "하우스키핑 리드", dept: "아라키초 B" },
  { id: "watanabe", name: "와타나베 소라", initial: "와", bg: "#557a8a", role: "시설 관리", dept: "아라키초 B" },
];

const INITIAL_APPROVER_IDS = new Set(["ceo", "smd"]);

export function LeaveApproversView({ lc, onToast }: { lc: Lc; onToast: (msg: string) => void }) {
  const [approverIds, setApproverIds] = useState<Set<string>>(new Set(INITIAL_APPROVER_IDS));

  const activeApprovers = MOCK_MEMBERS.filter((m) => approverIds.has(m.id));

  function toggle(member: MockMember) {
    if (member.locked) return;
    const isApprover = approverIds.has(member.id);
    if (isApprover && approverIds.size <= 1) {
      onToast(lc.approversToastMinRequired);
      return;
    }
    const next = new Set(approverIds);
    if (isApprover) {
      next.delete(member.id);
      onToast(lc.approversToastRevoked(member.name));
    } else {
      next.add(member.id);
      onToast(lc.approversToastGranted(member.name));
    }
    setApproverIds(next);
  }

  return (
    <div>
      <div className="toolbar">
        <div className="metaline" style={{ fontSize: 12.5 }}>
          <span style={{ fontWeight: 800, color: "var(--ink-soft)" }}>{lc.approversColToggle}</span>
          <span className="sep" />
          <span>{lc.approversHeaderNote}</span>
        </div>
      </div>

      <div className="apbanner">
        <span className="apbanner__ic">
          <span className="ic">
            <Shield />
          </span>
        </span>
        <div className="apbanner__b">
          <div className="apbanner__t">{lc.approversBannerTitle(String(activeApprovers.length))}</div>
          <div className="apbanner__s">{lc.approversBannerBody}</div>
        </div>
        <div className="apbanner__who">
          {activeApprovers.map((m) => (
            <span className="apchip" key={m.id}>
              <span
                className="uhead__av"
                style={{ background: m.bg, width: 22, height: 22, borderRadius: 6, fontSize: 10.5 }}
              >
                {m.initial}
              </span>
              {m.name}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden", marginTop: 14 }}>
        <table className="qtbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{lc.approversColMember}</th>
              <th>{lc.approversColDept}</th>
              <th>{lc.approversColRole}</th>
              <th style={{ textAlign: "right", paddingRight: 16 }}>{lc.approversColToggle}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_MEMBERS.map((m) => {
              const isApprover = approverIds.has(m.id);
              return (
                <tr key={m.id}>
                  <td style={{ paddingLeft: 16 }}>
                    <div className="who">
                      <span
                        className="uhead__av"
                        style={{ background: m.bg, width: 34, height: 34, borderRadius: 9, fontSize: 13 }}
                      >
                        {m.initial}
                      </span>
                      <div>
                        <div className="who__nm">
                          {m.name}
                          {m.self ? <span className="selftag"> {lc.approversSelfTag}</span> : null}
                        </div>
                        <div className="who__sub">{m.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="dim-cell">{m.dept}</td>
                  <td>
                    {isApprover ? (
                      <span className="pill pill--done">
                        <span className="d" />
                        {lc.approversPillGranted}
                      </span>
                    ) : (
                      <span className="pill pill--muted">{lc.approversPillNone}</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 16 }}>
                    {m.locked ? (
                      <span className="lockchip">
                        <span className="ic">
                          <Shield />
                        </span>
                        {lc.approversLockedChip}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`switch${isApprover ? " on" : ""}`}
                        role="switch"
                        aria-checked={isApprover}
                        aria-label={lc.approversToggleAriaLabel(m.name)}
                        onClick={() => toggle(m)}
                      >
                        <span className="switch__k" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="locknote" style={{ marginTop: 13 }}>
        <span className="ic">
          <Info />
        </span>
        {lc.approversFootnote}
      </div>
    </div>
  );
}
