"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  DateRangeCalendar,
  type DateRangeValue,
} from "@/components/requests/date-range-calendar";
import type { Dictionary, Locale } from "@/lib/i18n";

type LinenLedgerPeriodProps = {
  building: string;
  canGoNext: boolean;
  copy: Dictionary["linenReturn"];
  label: string;
  locale: Locale;
  /** Base month used by the prev/next arrows. */
  month: number;
  range: DateRangeValue;
  year: number;
};

function shiftMonth(year: number, month: number, delta: number) {
  const base = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1 };
}

export function LinenLedgerPeriod({
  building,
  canGoNext,
  copy,
  label,
  locale,
  month,
  range,
  year,
}: LinenLedgerPeriodProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const buildingParam = encodeURIComponent(building);

  function goMonth(delta: number) {
    const next = shiftMonth(year, month, delta);
    router.push(
      `/mobile/linen-return/ledger?building=${buildingParam}&year=${next.year}&month=${next.month}`,
    );
  }

  function applyRange(value: DateRangeValue) {
    setOpen(false);
    if (!value.startDate) {
      router.push(`/mobile/linen-return/ledger?building=${buildingParam}`);
      return;
    }
    const end = value.endDate ?? value.startDate;
    router.push(
      `/mobile/linen-return/ledger?building=${buildingParam}&startDate=${value.startDate}&endDate=${end}`,
    );
  }

  function resetToMonth() {
    setOpen(false);
    router.push(`/mobile/linen-return/ledger?building=${buildingParam}`);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        aria-label="prev-month"
        className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-slate-600"
        onClick={() => goMonth(-1)}
        type="button"
      >
        <ChevronLeft className="size-[18px]" aria-hidden="true" />
      </button>

      <button
        className="inline-flex min-w-[92px] items-center justify-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[13px] font-bold text-foreground"
        onClick={() => setOpen(true)}
        type="button"
      >
        <CalendarDays className="size-[15px] text-slate-400" aria-hidden="true" />
        {label}
      </button>

      {canGoNext ? (
        <button
          aria-label="next-month"
          className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-slate-600"
          onClick={() => goMonth(1)}
          type="button"
        >
          <ChevronRight className="size-[18px]" aria-hidden="true" />
        </button>
      ) : (
        <span className="flex size-9 items-center justify-center text-slate-300">
          <ChevronRight className="size-[18px]" aria-hidden="true" />
        </span>
      )}

      <DateRangeCalendar
        labels={{
          apply: copy.rangeApply,
          clear: copy.rangeClear,
          close: copy.rangeClose,
          selectEnd: copy.rangeHintEnd,
          selectStart: copy.rangeHintStart,
          title: copy.rangeTitle,
        }}
        locale={locale}
        onApply={applyRange}
        onClear={resetToMonth}
        onClose={() => setOpen(false)}
        open={open}
        value={range}
      />
    </div>
  );
}
