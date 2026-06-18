"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/components/shell/bottom-sheet";

export type DateRangeValue = {
  endDate?: string;
  startDate?: string;
};

export type DateRangeCalendarLabels = {
  apply: string;
  clear: string;
  close: string;
  selectEnd: string;
  selectStart: string;
  title: string;
};

type DateRangeCalendarProps = {
  labels: DateRangeCalendarLabels;
  locale: Locale;
  onApply: (range: DateRangeValue) => void;
  onClear: () => void;
  onClose: () => void;
  open: boolean;
  value: DateRangeValue;
};

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

// 2021-08-01 is a Sunday — used to derive localized short weekday names.
function getWeekdayNames(locale: Locale): string[] {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone: "UTC",
  });
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2021, 7, 1 + index))),
  );
}

export function DateRangeCalendar({ open, ...rest }: DateRangeCalendarProps) {
  if (!open) return null;
  // Remount the panel every time the popup opens so its draft state is
  // re-seeded from the latest `value` without a state-syncing effect.
  return <CalendarPanel {...rest} />;
}

function CalendarPanel({
  labels,
  locale,
  onApply,
  onClear,
  onClose,
  value,
}: Omit<DateRangeCalendarProps, "open">) {
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    value.startDate ? startOfMonth(isoToDate(value.startDate)) : startOfMonth(new Date()),
  );
  const [draftStart, setDraftStart] = useState<string | undefined>(value.startDate);
  const [draftEnd, setDraftEnd] = useState<string | undefined>(value.endDate);

  const weekdayNames = useMemo(() => getWeekdayNames(locale), [locale]);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
        viewMonth,
      ),
    [locale, viewMonth],
  );
  const dayLabelFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
    [locale],
  );

  const cells = useMemo(() => {
    const firstWeekday = viewMonth.getDay();
    const daysInMonth = new Date(
      viewMonth.getFullYear(),
      viewMonth.getMonth() + 1,
      0,
    ).getDate();
    const result: (string | null)[] = [];
    for (let i = 0; i < firstWeekday; i += 1) result.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      result.push(
        toIsoDate(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day)),
      );
    }
    return result;
  }, [viewMonth]);

  const todayIso = toIsoDate(new Date());

  function handleDayClick(iso: string) {
    // No start yet, or a full range already chosen → begin a new range.
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(iso);
      setDraftEnd(undefined);
      return;
    }
    // Second click completes the range, auto-swapping if reversed.
    if (iso < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(iso);
    } else {
      setDraftEnd(iso);
    }
  }

  function handleApply() {
    if (!draftStart) {
      onClear();
      return;
    }
    onApply({ startDate: draftStart, endDate: draftEnd ?? draftStart });
  }

  function handleClear() {
    setDraftStart(undefined);
    setDraftEnd(undefined);
    onClear();
  }

  const rangeStart = draftStart;
  const rangeEnd = draftEnd ?? draftStart;
  const hintLabel = !draftStart || draftEnd ? labels.selectStart : labels.selectEnd;

  return (
    <BottomSheet
      ariaLabel={labels.title}
      header={
        <div className="min-w-0">
          <h3 className="text-base font-black tracking-tight text-foreground">
            {labels.title}
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            {hintLabel}
          </p>
        </div>
      }
      onClose={onClose}
    >
      {() => (
        <>
          <div className="mt-4 flex items-center justify-between">
            <button
              aria-label="prev-month"
              className="flex size-9 items-center justify-center rounded-full border border-border bg-background/70 text-foreground transition-colors hover:bg-muted/60"
              onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
              type="button"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-black text-foreground">{monthLabel}</span>
            <button
              aria-label="next-month"
              className="flex size-9 items-center justify-center rounded-full border border-border bg-background/70 text-foreground transition-colors hover:bg-muted/60"
              onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
              type="button"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1">
            {weekdayNames.map((name, index) => (
              <div
                className={cn(
                  "py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground",
                  index === 0 && "text-rose-500/80",
                  index === 6 && "text-[#315F91]",
                )}
                key={name}
              >
                {name}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1 pb-2">
            {cells.map((iso, index) => {
            if (!iso) return <div key={`empty-${index}`} />;
            const isStart = iso === rangeStart;
            const isEnd = iso === rangeEnd;
            const inRange =
              rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd;
            const isEdge = isStart || isEnd;
            const dayNumber = Number(iso.slice(8, 10));

            return (
              <div className="relative flex items-center justify-center" key={iso}>
                {inRange ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-1 inset-x-0 bg-[#EAF1F8]"
                  />
                ) : null}
                {isEdge && rangeStart !== rangeEnd ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-1 w-1/2 bg-[#EAF1F8]",
                      isStart ? "right-0" : "left-0",
                    )}
                  />
                ) : null}
                <button
                  aria-label={dayLabelFormatter.format(isoToDate(iso))}
                  aria-pressed={isEdge}
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-full text-sm font-bold transition-colors",
                    isEdge
                      ? "bg-[#315F91] text-white shadow-sm"
                      : inRange
                        ? "text-[#1F3A5F]"
                        : "text-foreground hover:bg-muted/70",
                    !isEdge && iso === todayIso && "ring-1 ring-[#C9D8E8]",
                  )}
                  onClick={() => handleDayClick(iso)}
                  type="button"
                >
                  {dayNumber}
                </button>
                </div>
              );
            })}
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-border/70 pt-4">
            <button
              className="h-11 flex-1 rounded-xl border border-border bg-background/70 text-sm font-bold text-foreground transition-colors hover:bg-muted/60"
              onClick={handleClear}
              type="button"
            >
              {labels.clear}
            </button>
            <button
              className="h-11 flex-1 rounded-xl bg-[#315F91] text-sm font-black text-white transition-colors hover:bg-[#274D76] disabled:opacity-50"
              disabled={!draftStart}
              onClick={handleApply}
              type="button"
            >
              {labels.apply}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
