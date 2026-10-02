"use client";

import { useState } from "react";
import { DatePickerSheet } from "@/components/shell/date-picker-sheet";

/**
 * 모바일 판매 캘린더 시트의 공용 입력 조각(시안 `5a 예약 상세 · 수기 예약 시트 v3`, 2026-10-02).
 *
 * - `MobileStepper` — 인원처럼 작은 정수는 키보드 없이 −/+ 로(엄지 한 번).
 * - `MobileStayDates` — 체크인 · 체크아웃을 각각 앱 공용 날짜 시트(`DatePickerSheet`)로 고른다. 데스크톱의 범위 달력
 *   (`AdminDateRangePicker`)은 콘솔 전용 규격이라 모바일 시트 안에서 쓰지 않는다.
 */

export function MobileStepper({
  label,
  max = 30,
  min,
  onChange,
  value,
}: {
  label: string;
  max?: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className="mfm-field">
      <span className="mfm-l">{label}</span>
      <div className="mfm-step" role="group" aria-label={label}>
        <button aria-label="−" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} type="button">
          −
        </button>
        <output aria-live="polite">{value}</output>
        <button aria-label="+" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} type="button">
          +
        </button>
      </div>
    </div>
  );
}

const nextDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

export function MobileStayDates({
  arrival,
  checkInLabel,
  checkOutLabel,
  departure,
  labels,
  locale,
  onChange,
  today,
}: {
  arrival: string;
  checkInLabel: string;
  checkOutLabel: string;
  departure: string;
  labels: { prevMonth: string; nextMonth: string; today: string };
  locale: string;
  /** 체크아웃이 체크인보다 앞이면 다음 날로 밀어 최소 1박을 만든다(데스크톱과 같다). */
  onChange: (arrival: string, departure: string) => void;
  today: string;
}) {
  const [picking, setPicking] = useState<"in" | "out" | null>(null);
  const label = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return (
    <>
      <div className="mfm-two">
        <button className="mfm-date" onClick={() => setPicking("in")} type="button">
          <span>{checkInLabel}</span>
          <b>{label(arrival)}</b>
        </button>
        <button className="mfm-date" onClick={() => setPicking("out")} type="button">
          <span>{checkOutLabel}</span>
          <b>{label(departure)}</b>
        </button>
      </div>
      {picking && (
        <DatePickerSheet
          labels={{ ...labels, title: picking === "in" ? checkInLabel : checkOutLabel }}
          locale={locale}
          onClose={() => setPicking(null)}
          onSelect={(date) => {
            if (picking === "in") onChange(date, departure > date ? departure : nextDay(date));
            else onChange(arrival, date > arrival ? date : nextDay(arrival));
          }}
          today={today}
          value={picking === "in" ? arrival : departure}
        />
      )}
    </>
  );
}
