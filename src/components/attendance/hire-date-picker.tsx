"use client";

import { useState } from "react";
import "./leave.css";
import { AIc, AttIcon } from "./att-icons";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { tokyoToday } from "@/lib/annual-leave";
import { getDictionary } from "@/lib/i18n";

// 입사일처럼 임의의 과거 날짜를 고르는 단일 날짜 캘린더 바텀시트.
// leave-date-picker.tsx(연차 신청 기간 선택)와 동일한 dpick__* 시각 톤을 쓰지만,
// 목업 월 고정이 아니라 실제 연/월 이동 + 날짜 연산으로 동작한다. 미래 날짜는 선택 불가
// (입사일은 오늘 이전이어야 함).

function localeTag(locale: string): string {
  return locale === "ko" ? "ko-KR" : locale === "ja" ? "ja-JP" : "en-US";
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function HireDatePicker({
  locale,
  value,
  onApply,
  onClose,
}: {
  locale: string;
  value: string;
  onApply: (date: string) => void;
  onClose: () => void;
}) {
  const c = getDictionary(locale).leave;
  const today = tokyoToday();
  const [ym, setYm] = useState(() => (value || today).slice(0, 7));
  const [selected, setSelected] = useState<string | null>(value || null);
  const [view, setView] = useState<"days" | "months">("days");
  const [viewYear, setViewYear] = useState(() => Number((value || today).slice(0, 4)));

  const [year, month] = ym.split("-").map(Number);
  const tag = localeTag(locale);
  const monthLabel = new Intl.DateTimeFormat(tag, { year: "numeric", month: "long" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(tag, { month: "short" }).format(new Date(Date.UTC(2021, i, 1))),
  );
  const lead = firstWeekday(year, month);
  const total = daysInMonth(year, month);

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < lead; i++) cells.push(<div className="dpick__cell pad" key={`pad${i}`} />);
  for (let d = 1; d <= total; d++) {
    const key = `${ym}-${String(d).padStart(2, "0")}`;
    const future = key > today;
    let cls = "";
    if (future) cls = "dim";
    if (key === selected) cls = "rsingle";
    if (key === today && cls !== "rsingle") cls += " today";
    cells.push(
      <button
        type="button"
        className={`dpick__cell ${cls}`.trim()}
        key={key}
        disabled={future}
        onClick={() => setSelected(key)}
      >
        <span className="dpick__d">{d}</span>
      </button>,
    );
  }

  return (
    <BottomSheet onClose={onClose} className="pb-[max(16px,env(safe-area-inset-bottom))]">
      {({ close }) => (
        <div className="lv-sheet">
          <div className="lsheet__h">
            <span className="lsheet__ic bg-pick">
              <AIc>{AttIcon.calendar}</AIc>
            </span>
            <span className="lsheet__t">{c.exSetupHire}</span>
          </div>

          <div className="dpick__sum">
            <div className="dpick__sumcol">
              <span className="dpick__sumk">{c.exSetupHire}</span>
              <span className={`dpick__sumv mono${selected ? "" : " ph"}`}>{selected ?? c.pickDate}</span>
            </div>
          </div>

          <div className="dpick__nav">
            <button
              type="button"
              className="lcal__month"
              aria-label={c.calPickMonth}
              onClick={() => {
                setViewYear(year);
                setView("months");
              }}
            >
              {monthLabel}
            </button>
            <span className="lcal__navsp" />
            <button
              type="button"
              className="lcal__navbtn"
              aria-label={c.calPrevMonth}
              onClick={() => setYm((m) => shiftMonth(m, -1))}
            >
              {AttIcon.back}
            </button>
            <button
              type="button"
              className="lcal__navbtn"
              aria-label={c.calNextMonth}
              disabled={ym >= today.slice(0, 7)}
              onClick={() => setYm((m) => shiftMonth(m, 1))}
            >
              {AttIcon.chevR}
            </button>
          </div>

          {view === "months" ? (
            <>
              <div className="dpick__yrnav">
                <button
                  type="button"
                  className="lcal__navbtn"
                  aria-label={c.calPrevYear}
                  onClick={() => setViewYear((y) => y - 1)}
                >
                  {AttIcon.back}
                </button>
                <span className="dpick__yr">{viewYear}</span>
                <button
                  type="button"
                  className="lcal__navbtn"
                  aria-label={c.calNextYear}
                  disabled={viewYear >= Number(today.slice(0, 4))}
                  onClick={() => setViewYear((y) => y + 1)}
                >
                  {AttIcon.chevR}
                </button>
              </div>
              <div className="dpick__mgrid">
                {monthNames.map((name, i) => {
                  const m = i + 1;
                  const targetYm = `${viewYear}-${String(m).padStart(2, "0")}`;
                  const future = targetYm > today.slice(0, 7);
                  return (
                    <button
                      type="button"
                      key={m}
                      className={`dpick__mcell${targetYm === ym ? " sel" : ""}`}
                      disabled={future}
                      onClick={() => {
                        setYm(targetYm);
                        setView("days");
                      }}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="dpick__wkrow">
                {c.calWk.map((w, i) => (
                  <div className={`dpick__wd${i === 0 ? " sun" : i === 6 ? " sat" : ""}`} key={i}>
                    {w}
                  </div>
                ))}
              </div>
              <div className="dpick__grid">{cells}</div>
            </>
          )}

          <div className="lsheet__btns" style={{ marginTop: 14 }}>
            <button type="button" className="lbtn lbtn--ghost" onClick={close}>
              {c.close}
            </button>
            <button
              type="button"
              className={`lbtn lbtn--primary${selected ? "" : " dim"}`}
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onApply(selected);
                close();
              }}
            >
              <AIc>{AttIcon.check}</AIc>
              {c.applyDate}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
