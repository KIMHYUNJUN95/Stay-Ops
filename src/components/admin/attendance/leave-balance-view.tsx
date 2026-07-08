"use client";

import { useState } from "react";
import { ChevronRight, Download, Edit3, Info, TriangleAlert, X } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { useAdminPanelA11y } from "../shared/use-admin-panel-a11y";

type Lc = Dictionary["admin"]["leaveConsole"];

/** Static mock (design-only view — no Supabase/server-action wiring). Mirrors .handoff/src/leave-data.js EMP shape. */
type MockEmployee = {
  id: string;
  name: string;
  initial: string;
  bg: string;
  role: string;
  hire: string; // YYYY-MM-DD
  grant: number; // paid-leave accrual granted so far
  usedBase: number;
  bonus: number; // 4-year special-leave bonus granted
  usedBonus: number;
  nextGrantOn: string; // YYYY-MM-DD
  nextGrantAmt: number;
  expSoon: { on: string; amt: number } | null;
  ineligible?: boolean;
};

const MOCK_EMP: MockEmployee[] = [
  { id: "jung", name: "정유진", initial: "정", bg: "#9a4d6d", role: "프론트 · 정규직", hire: "2020-09-01", grant: 18, usedBase: 4, bonus: 4, usedBonus: 0, nextGrantOn: "2027-03-01", nextGrantAmt: 20, expSoon: { on: "2026-09-30", amt: 2 } },
  { id: "watanabe", name: "와타나베 소라", initial: "와", bg: "#557a8a", role: "시설 관리 · 정규직", hire: "2019-03-01", grant: 20, usedBase: 6, bonus: 4, usedBonus: 0, nextGrantOn: "2027-03-01", nextGrantAmt: 20, expSoon: null },
  { id: "ito", name: "이토 카즈야", initial: "이", bg: "#7a5ea8", role: "운영 매니저 · 정규직", hire: "2021-04-01", grant: 16, usedBase: 2, bonus: 4, usedBonus: 4, nextGrantOn: "2026-10-01", nextGrantAmt: 18, expSoon: null },
  { id: "nakamura", name: "나카무라 아오이", initial: "나", bg: "#4d6db5", role: "프론트 매니저 · 정규직", hire: "2022-06-01", grant: 14, usedBase: 5, bonus: 4, usedBonus: 0, nextGrantOn: "2026-12-01", nextGrantAmt: 16, expSoon: null },
  { id: "oh", name: "오세훈", initial: "오", bg: "#3f7d5a", role: "하우스키핑 리드 · 정규직", hire: "2023-04-01", grant: 12, usedBase: 3, bonus: 0, usedBonus: 0, nextGrantOn: "2026-10-01", nextGrantAmt: 14, expSoon: null },
  { id: "takahashi", name: "다카하시 리쿠", initial: "다", bg: "#b5683f", role: "예약 담당 · 정규직", hire: "2024-01-15", grant: 11, usedBase: 2, bonus: 0, usedBonus: 0, nextGrantOn: "2026-07-15", nextGrantAmt: 12, expSoon: null },
  { id: "kimj", name: "김민준", initial: "민", bg: "#9c5a2c", role: "프론트 · 정규직", hire: "2026-02-01", grant: 0, usedBase: 0, bonus: 0, usedBonus: 0, nextGrantOn: "2026-08-01", nextGrantAmt: 10, expSoon: null, ineligible: true },
];

function fmtMd(iso: string): string {
  return iso.slice(5).replace("-", "/");
}
function fmtYmd(iso: string): string {
  return iso.replace(/-/g, "/");
}

/** Grant schedule from hire date: 6/18/30/42/54/66/78 months → 10/11/12/14/16/18/20 days; +4 bonus at 48 months. */
function grantSchedule(hire: string): { dateYm: string; amt: number; kind: "base" | "bonus" }[] {
  const months = [6, 18, 30, 42, 54, 66, 78];
  const amts = [10, 11, 12, 14, 16, 18, 20];
  const [hy, hm, hd] = hire.split("-").map(Number);
  const grantYm = (mo: number) => {
    const dt = new Date(Date.UTC(hy, hm - 1 + mo, hd));
    return `${dt.getUTCFullYear()}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const events: { dateYm: string; amt: number; kind: "base" | "bonus" }[] = months.map((mo, i) => ({
    dateYm: grantYm(mo),
    amt: amts[i],
    kind: "base",
  }));
  events.push({ dateYm: grantYm(48), amt: 4, kind: "bonus" });
  events.sort((a, b) => (a.dateYm < b.dateYm ? -1 : 1));
  return events;
}

export function LeaveBalanceView({ lc, onToast }: { lc: Lc; onToast: (msg: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedEmp = selected ? MOCK_EMP.find((e) => e.id === selected) ?? null : null;

  return (
    <div>
      <div className="toolbar">
        <div style={{ display: "flex", alignItems: "center", fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
          <span>{lc.balanceRegularCount(String(MOCK_EMP.length))}</span>
          <span className="sep" />
          <span>{lc.balanceHourlyExcludedNote}</span>
        </div>
        <span className="toolbar__spacer" />
        <button type="button" className="chipbtn" onClick={() => onToast(lc.balanceExportToast)}>
          <span className="ic">
            <Download />
          </span>
          {lc.balanceExportBtn}
        </button>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <table className="qtbl">
          <thead>
            <tr>
              <th style={{ paddingLeft: 16 }}>{lc.balanceColStaff}</th>
              <th>{lc.balanceColHire}</th>
              <th>{lc.balanceColPaidRemaining}</th>
              <th>{lc.balanceColSpecialRemaining}</th>
              <th style={{ textAlign: "right" }}>{lc.balanceColUsedThisMonth}</th>
              <th>{lc.balanceColExpiring}</th>
              <th>{lc.balanceColNextGrant}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {MOCK_EMP.map((e) => {
              const baseRem = e.grant - e.usedBase;
              const bonusRem = e.bonus - e.usedBonus;
              const pct = e.grant ? Math.round((baseRem / e.grant) * 100) : 0;
              return (
                <tr
                  key={e.id}
                  className={selected === e.id ? "sel" : ""}
                  onClick={() => setSelected(e.id)}
                >
                  <td style={{ paddingLeft: 16 }}>
                    <div className="who">
                      <span
                        className="uhead__av"
                        style={{ background: e.bg, width: 34, height: 34, borderRadius: 9, fontSize: 13 }}
                      >
                        {e.initial}
                      </span>
                      <div>
                        <div className="who__nm">{e.name}</div>
                        <div className="who__sub">{e.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="dim-cell mono">{e.hire}</td>
                  <td>
                    {e.ineligible ? (
                      <span className="pill pill--muted">{lc.balanceIneligiblePill}</span>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span className={`pbar${baseRem <= 3 ? " warn" : ""}`} style={{ width: 64 }}>
                          <i style={{ width: `${pct}%` }} />
                        </span>
                        <span className="mono" style={{ fontWeight: 800 }}>
                          {baseRem}
                          <span style={{ color: "var(--faint)", fontWeight: 600 }}> / {e.grant}</span>
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="mono" style={{ fontWeight: 800 }}>
                    {e.bonus ? (
                      <>
                        {bonusRem}
                        <span style={{ color: "var(--faint)", fontWeight: 600 }}> / {e.bonus}</span>
                      </>
                    ) : (
                      <span className="dim-cell">—</span>
                    )}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {lc.daysUnit(e.usedBase + e.usedBonus)}
                  </td>
                  <td>
                    {e.expSoon ? (
                      <span className="excl-flag">
                        <span className="ic">
                          <TriangleAlert />
                        </span>
                        {fmtMd(e.expSoon.on)} {lc.daysUnit(e.expSoon.amt)}
                      </span>
                    ) : (
                      <span className="dim-cell">—</span>
                    )}
                  </td>
                  <td className="dim-cell mono">
                    {fmtMd(e.nextGrantOn)}{" "}
                    <span style={{ color: "var(--info)" }}>
                      +{e.nextGrantAmt}
                      {e.ineligible ? lc.balanceFirstGrantTag : ""}
                    </span>
                  </td>
                  <td className="colchev">
                    <span className="ic">
                      <ChevronRight />
                    </span>
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
        {lc.balanceFootnote}
      </div>

      {selectedEmp ? (
        <EmployeeDrawer
          emp={selectedEmp}
          lc={lc}
          onClose={() => setSelected(null)}
          onToast={onToast}
        />
      ) : null}
    </div>
  );
}

function EmployeeDrawer({
  emp,
  lc,
  onClose,
  onToast,
}: {
  emp: MockEmployee;
  lc: Lc;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const panelRef = useAdminPanelA11y<HTMLElement>(onClose, { disabled: editing });

  const baseRem = emp.grant - emp.usedBase;
  const bonusRem = emp.bonus - emp.usedBonus;
  const schedule = grantSchedule(emp.hire);
  const nowYmValue = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" })
    .format(new Date())
    .slice(0, 7)
    .replace("-", "/");

  function saveEdit() {
    setEditing(false);
    onToast(lc.balanceEditSavedToast);
  }

  return (
    <>
      <div className="panel-scrim on" onClick={onClose} />
      <aside ref={panelRef} className="panel on" role="dialog" aria-label={lc.balancePanelKicker} tabIndex={-1}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{lc.balancePanelKicker}</span>
            <button type="button" className="panel__x" onClick={onClose} aria-label="close">
              <span className="ic">
                <X />
              </span>
            </button>
          </div>
          <div className="panel__title" style={{ alignItems: "center", gap: 11 }}>
            <span className="uhead__av" style={{ background: emp.bg }}>
              {emp.initial}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-.02em" }}>{emp.name}</div>
              <div className="panel__sub" style={{ fontSize: 12 }}>
                {emp.role} · {lc.balanceHiredPrefix} {emp.hire}
              </div>
            </div>
            {!editing ? (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
                <span className="ic">
                  <Edit3 />
                </span>
                {lc.balanceEditBtn}
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel__body">
          {editing ? (
            <div className="editbox">
              <div className="editbox__h">
                <span className="ic">
                  <Edit3 />
                </span>
                {lc.balanceEditTitle}
              </div>
              <label className="fld">
                <span className="fld__l">{lc.balanceEditHireLabel}</span>
                <input type="date" defaultValue={emp.hire} />
              </label>
              <div className="fld2">
                <label className="fld">
                  <span className="fld__l">{lc.balanceEditGrantLabel}</span>
                  <input type="number" min={0} max={40} defaultValue={emp.grant} />
                </label>
                <label className="fld">
                  <span className="fld__l">{lc.balanceEditBonusLabel}</span>
                  <input type="number" min={0} max={8} defaultValue={emp.bonus} />
                </label>
              </div>
              <div className="editbox__note">
                <span className="ic">
                  <Info />
                </span>
                {lc.balanceEditNote}
              </div>
              <div className="permbtns" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ flex: 1 }}
                  onClick={() => setEditing(false)}
                >
                  {lc.dialogCancel}
                </button>
                <button type="button" className="btn btn--pri" style={{ flex: 1 }} onClick={saveEdit}>
                  {lc.balanceEditSaveBtn}
                </button>
              </div>
            </div>
          ) : null}

          <div className="balrow">
            <div className="balrow__cell">
              <div className="balrow__v" style={{ color: "var(--info)" }}>
                {emp.ineligible ? "—" : baseRem}
              </div>
              <div className="balrow__k">{lc.balanceCellPaid}</div>
            </div>
            <div className="minisep" />
            <div className="balrow__cell">
              <div className="balrow__v" style={{ color: "var(--warn)" }}>
                {emp.bonus ? bonusRem : "—"}
              </div>
              <div className="balrow__k">{lc.balanceCellSpecial}</div>
            </div>
            <div className="minisep" />
            <div className="balrow__cell">
              <div className="balrow__v">{emp.usedBase + emp.usedBonus}</div>
              <div className="balrow__k">{lc.balanceCellUsed}</div>
            </div>
          </div>

          {emp.ineligible ? (
            <div className="errbar is-warn" style={{ margin: "14px 0 0" }}>
              <span className="errbar__ic">
                <span className="ic">
                  <TriangleAlert />
                </span>
              </span>
              <div>
                <div className="errbar__t">{lc.balanceIneligibleTitle}</div>
                <div className="errbar__s">
                  {lc.balanceIneligibleBody(fmtYmd(emp.nextGrantOn), String(emp.nextGrantAmt))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="pblock" style={{ marginTop: 16 }}>
            <div className="pblock__t">{lc.balanceSummaryTitle}</div>
            <div className="kv">
              <span className="kv__k">{lc.balanceKvPaid}</span>
              <span className="kv__v mono">
                {baseRem} / {emp.grant}
                {lc.unitDays}
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">{lc.balanceKvSpecial}</span>
              <span className="kv__v">
                {emp.bonus ? (
                  <span className="mono">
                    {bonusRem} / {emp.bonus}
                    {lc.unitDays}
                  </span>
                ) : (
                  <span className="dim-cell">{lc.balanceKvSpecialNone}</span>
                )}
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">{lc.balanceKvNextGrant}</span>
              <span className="kv__v mono">
                {fmtYmd(emp.nextGrantOn)} · +{emp.nextGrantAmt}
                {lc.unitDays}
              </span>
            </div>
            {emp.expSoon ? (
              <div className="kv">
                <span className="kv__k">{lc.balanceKvExpiring}</span>
                <span className="kv__v">
                  <span className="excl-flag">
                    <span className="ic">
                      <TriangleAlert />
                    </span>
                    {fmtYmd(emp.expSoon.on)} · {lc.daysUnit(emp.expSoon.amt)}
                  </span>
                </span>
              </div>
            ) : null}
          </div>

          <div className="pblock">
            <div className="pblock__t">{lc.balanceScheduleTitle}</div>
            <div className="tl">
              {schedule.map((ev, i) => {
                const past = ev.dateYm <= nowYmValue;
                return (
                  <div className="tlrow" key={i}>
                    <span className={`tlrow__dot${past ? " done" : ""}`} />
                    <div className="tlrow__b">
                      <div className="tlrow__t">
                        {ev.kind === "bonus" ? lc.balanceScheduleBonusLabel : lc.balanceScheduleBaseLabel}{" "}
                        <b className="mono" style={{ color: ev.kind === "bonus" ? "var(--warn)" : "var(--info)" }}>
                          +{ev.amt}
                          {lc.unitDays}
                        </b>
                      </div>
                      <div className="tlrow__s">
                        {past ? lc.balanceScheduleDone : lc.balanceScheduleUpcoming} · {lc.balanceScheduleExpiryNote}
                      </div>
                    </div>
                    <div className="tlrow__time mono">{ev.dateYm}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel__foot">
          <button type="button" className="btn btn--ghost" style={{ flex: 1 }} onClick={onClose}>
            {lc.balancePanelClose}
          </button>
          <button
            type="button"
            className="btn btn--pri"
            style={{ flex: 1 }}
            onClick={() => onToast(lc.balanceExportToast)}
          >
            <span className="ic">
              <Download />
            </span>
            {lc.balancePanelExportBtn}
          </button>
        </div>
      </aside>
    </>
  );
}
