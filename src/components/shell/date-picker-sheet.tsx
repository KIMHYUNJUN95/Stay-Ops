"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { cn } from "@/lib/utils";

/**
 * 모바일 공용 날짜 선택 바텀시트.
 *
 * 화살표만으로는 먼 날짜로 못 간다는 문제에서 나왔다(2026-08-04). 네이티브 `<input type="date">`
 * 를 잠깐 썼지만 OS 달력이라 앱의 시각 언어와 어긋났고, **CLAUDE.md §3 — 모든 슬라이드업 시트는
 * 공용 `BottomSheet` 를 쓴다** 는 계약과도 맞지 않았다.
 *
 * 여기 하나만 두고 모든 모바일 화면이 같은 달력을 쓴다. 콘솔은 별개다 — 그쪽은 `.calpop` 규격의
 * `AdminDatePicker` 를 쓰며(§4a), 두 규격을 섞지 않는다.
 *
 * 날짜 계산은 전부 **Tokyo 운영일 문자열(YYYY-MM-DD)** 기준이다. `Date` 로 왕복시키면 자정 근처에서
 * 하루가 밀린다 — 이 저장소가 반복해서 겪은 종류의 버그다.
 */

function ymdOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 그 달의 1일이 무슨 요일인지(0=일). UTC 로 계산해 로컬 타임존 영향을 받지 않는다. */
function firstDowOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function DatePickerSheet({
  value,
  today,
  locale,
  labels,
  onClose,
  onSelect,
}: {
  /** 현재 선택된 날짜(YYYY-MM-DD). */
  value: string;
  /** Tokyo 운영일 기준 오늘. 서버가 계산해 내려준 값을 쓴다. */
  today: string;
  locale: string;
  labels: { title: string; prevMonth: string; nextMonth: string; today: string };
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  const [cursor, setCursor] = useState(() => value.slice(0, 7));
  const [cy, cm] = cursor.split("-").map(Number);

  const shiftMonth = (delta: number) => {
    const idx = cy * 12 + (cm - 1) + delta;
    setCursor(`${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`);
  };

  const monthLabel = new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(cy, cm - 1, 1)));

  // 요일 머리글 — 2026-06-07 이 일요일이라 그 주를 기준으로 로케일 약칭을 뽑는다.
  const dowLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "narrow" }).format(
      new Date(Date.UTC(2026, 5, 7 + i)),
    ),
  );

  const lead = firstDowOf(cy, cm);
  const total = daysInMonth(cy, cm);
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <BottomSheet
      ariaLabel={labels.title}
      header={
        <div className="mb-3 flex items-center gap-2">
          <button
            aria-label={labels.prevMonth}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors active:bg-muted"
            onClick={() => shiftMonth(-1)}
            type="button"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <p className="flex-1 text-center text-[15px] font-black tracking-[-0.01em] text-foreground">
            {monthLabel}
          </p>
          <button
            aria-label={labels.nextMonth}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors active:bg-muted"
            onClick={() => shiftMonth(1)}
            type="button"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      }
      onClose={onClose}
    >
      <div className="pb-2">
        <div className="mb-1 grid grid-cols-7">
          {dowLabels.map((d, i) => (
            <span
              className={cn(
                "py-1.5 text-center text-[11px] font-bold",
                i === 0 ? "text-rose-400" : i === 6 ? "text-sky-400" : "text-muted-foreground",
              )}
              key={`${d}-${i}`}
            >
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((day, i) => {
            if (day === null) return <span key={`pad-${i}`} />;
            const key = ymdOf(cy, cm, day);
            const isSelected = key === value;
            const isToday = key === today;
            return (
              <button
                className={cn(
                  "mx-auto flex size-10 items-center justify-center rounded-full text-[14px] font-bold transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : isToday
                      ? "text-primary ring-1 ring-primary/35"
                      : "text-foreground active:bg-muted",
                )}
                key={key}
                onClick={() => onSelect(key)}
                type="button"
              >
                {day}
              </button>
            );
          })}
        </div>

        <button
          className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl border border-border bg-surface text-[14px] font-extrabold text-foreground transition-colors active:bg-muted"
          onClick={() => onSelect(today)}
          type="button"
        >
          {labels.today}
        </button>
      </div>
    </BottomSheet>
  );
}
