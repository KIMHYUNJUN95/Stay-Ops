"use client";

import { useState, useTransition } from "react";
import { Info, Shield } from "lucide-react";
import { getDictionary, type Dictionary, type Locale } from "@/lib/i18n";
import type { AdminApproverMember } from "@/lib/annual-leave-admin-server";
import { setLeaveApproverAction } from "@/app/admin/attendance/leave/actions";

type Lc = Dictionary["admin"]["leaveConsole"];

function roleLabel(role: string | null, dictionary: Dictionary): string {
  if (!role) return "—";
  const map = dictionary.roles as Record<string, string>;
  return map[role] ?? role;
}

export function LeaveApproversView({
  lc,
  locale,
  members,
  onToast,
}: {
  lc: Lc;
  locale: Locale;
  members: AdminApproverMember[];
  onToast: (msg: string) => void;
}) {
  const dictionary = getDictionary(locale);
  const [approverIds, setApproverIds] = useState<Set<string>>(
    () => new Set(members.filter((m) => m.isApprover).map((m) => m.userId)),
  );
  const [pending, startTransition] = useTransition();

  const activeApprovers = members.filter((m) => approverIds.has(m.userId));

  function toggle(member: AdminApproverMember) {
    if (member.locked || pending) return;
    const isApprover = approverIds.has(member.userId);
    if (isApprover && approverIds.size <= 1) {
      onToast(lc.approversToastMinRequired);
      return;
    }
    // optimistic — revert on server error
    const next = new Set(approverIds);
    if (isApprover) next.delete(member.userId);
    else next.add(member.userId);
    setApproverIds(next);

    startTransition(async () => {
      const res = await setLeaveApproverAction({ userId: member.userId, isApprover: !isApprover });
      if (res.ok) {
        onToast(isApprover ? lc.approversToastRevoked(member.name) : lc.approversToastGranted(member.name));
      } else {
        setApproverIds(approverIds); // revert
        onToast(res.error === "min_one_approver" ? lc.approversToastMinRequired : lc.approversToastError);
      }
    });
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
            <span className="apchip" key={m.userId}>
              <span className="avatar" style={{ background: m.bg, color: "#fff" }}>
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
            {members.map((m) => {
              const isApprover = approverIds.has(m.userId);
              return (
                <tr key={m.userId}>
                  <td style={{ paddingLeft: 16 }}>
                    <div className="who">
                      <span className="avatar" style={{ background: m.bg, color: "#fff" }}>
                        {m.initial}
                      </span>
                      <div>
                        <div className="who__nm">
                          {m.name}
                          {m.self ? <span className="selftag"> {lc.approversSelfTag}</span> : null}
                        </div>
                        <div className="who__sub">{roleLabel(m.role, dictionary)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="dim-cell">—</td>
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
