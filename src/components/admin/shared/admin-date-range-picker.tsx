"use client";

// Shared admin-console date-RANGE picker primitive — single combined trigger ("시작일 – 종료일")
// that opens a range-select calendar popover (matches the design handoff's `.dpick`/`.calpop`).
// Renders the popover with `position: fixed` + viewport-clamped coordinates computed from the
// trigger's getBoundingClientRect (same escape-ancestor-overflow approach as the day-menu popover
// in leave-team-calendar.tsx) so it can never be clipped by a scrollable ancestor (e.g. `.content`)
// or rendered behind the sidebar.
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

export type AdminDateRangePickerLabels = {
  prevMonth: string;
  nextMonth: string;
  thisMonth: string;
  reset: string;
  apply: string;
};

type AdminDateRangePickerProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  localeTag: string;
  ariaLabel: string;
  labels: AdminDateRangePickerLabels;
};

function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00+09:00`);
}
function formatDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}
function shiftMonthKey(monthKey: string, delta: number): string {
  const date = parseDateKey(`${monthKey}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return formatDateKey(date).slice(0, 7);
}
function monthLabel(monthKey: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
  }).format(new Date(`${monthKey}-01T00:00:00+09:00`));
}
function dateLabel(dateKey: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}
function tokyoDayOfWeek(dateKey: string): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short" }).format(
    parseDateKey(dateKey),
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}
function daysInMonthKey(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
function thisMonthRange(): { from: string; to: string } {
  const todayKey = formatDateKey(new Date());
  const monthKey = todayKey.slice(0, 7);
  const days = daysInMonthKey(monthKey);
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(days).padStart(2, "0")}` };
}

const POPOVER_WIDTH = 292;
const POPOVER_HEIGHT_ESTIMATE = 372;

export function AdminDateRangePicker({
  from,
  to,
  onChange,
  localeTag,
  ariaLabel,
  labels,
}: AdminDateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [calendarMonth, setCalendarMonth] = useState(from.slice(0, 7));
  const [draftFrom, setDraftFrom] = useState<string | null>(from || null);
  const [draftTo, setDraftTo] = useState<string | null>(to || null);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
      const vh = typeof window !== "undefined" ? window.innerHeight : 900;
      const left = Math.min(Math.max(rect.left, 12), vw - POPOVER_WIDTH - 12);
      const fitsBelow = rect.bottom + 6 + POPOVER_HEIGHT_ESTIMATE <= vh - 12;
      const top = fitsBelow ? rect.bottom + 6 : Math.max(12, rect.top - POPOVER_HEIGHT_ESTIMATE - 6);
      setPos({ top, left });
    }
    // Opens to the trigger's current month for orientation, but starts with no range highlighted —
    // the applied from/to only shows as blue once the user actually picks days in this session.
    setCalendarMonth(from.slice(0, 7));
    setDraftFrom(null);
    setDraftTo(null);
    setOpen(true);
  }

  function pick(dateKey: string) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(dateKey);
      setDraftTo(null);
    } else if (dateKey < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(dateKey);
    } else {
      setDraftTo(dateKey);
    }
  }

  function apply() {
    if (draftFrom && draftTo) {
      onChange(draftFrom, draftTo);
      setOpen(false);
    }
  }

  const days = daysInMonthKey(calendarMonth);
  const firstDow = tokyoDayOfWeek(`${calendarMonth}-01`);
  const todayKey = formatDateKey(new Date());
  const dowLabels = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(localeTag, { timeZone: "Asia/Tokyo", weekday: "narrow" }).format(
      new Date(`2026-06-${String(i + 7).padStart(2, "0")}T00:00:00+09:00`),
    ),
  );

  return (
    <div className={`dpick${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="datepick"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className="ic">
          <CalendarDays />
        </span>
        <span className="v">{from ? dateLabel(from, localeTag) : ""}</span>
        <span className="dash">–</span>
        <span className="v">{to ? dateLabel(to, localeTag) : ""}</span>
        <span className="ic dd__chev">
          <ChevronDown />
        </span>
      </button>

      {open ? (
        <div
          className="calpop"
          role="dialog"
          aria-label={ariaLabel}
          style={{ position: "fixed", top: pos.top, left: pos.left }}
        >
          <div className="calpop__head">
            <button
              type="button"
              className="calpop__nav"
              aria-label={labels.prevMonth}
              onClick={() => setCalendarMonth((m) => shiftMonthKey(m, -1))}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="calpop__title">{monthLabel(calendarMonth, localeTag)}</span>
            <button
              type="button"
              className="calpop__nav"
              aria-label={labels.nextMonth}
              onClick={() => setCalendarMonth((m) => shiftMonthKey(m, 1))}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="calpop__wd">
            {dowLabels.map((label, i) => (
              <span key={`${label}-${i}`} className={i === 0 ? "sun" : ""}>
                {label}
              </span>
            ))}
          </div>
          <div className="calpop__grid">
            {Array.from({ length: firstDow }, (_, i) => (
              <span key={`pad-${i}`} className="cald cald--pad" />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1;
              const val = `${calendarMonth}-${String(day).padStart(2, "0")}`;
              const isFrom = val === draftFrom;
              const isTo = val === draftTo;
              const inRange = Boolean(draftFrom && draftTo && val > draftFrom && val < draftTo);
              const isSingle = isFrom && !draftTo;
              const isToday = val === todayKey;
              const cls = [
                "cald",
                isFrom ? "is-from" : "",
                isTo ? "is-to" : "",
                isSingle ? "is-single" : "",
                inRange ? "is-range" : "",
                isToday ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button type="button" key={val} className={cls} onClick={() => pick(val)}>
                  {day}
                </button>
              );
            })}
          </div>
          <div className="calpop__foot">
            <button
              type="button"
              className="calpop__quick"
              onClick={() => {
                const range = thisMonthRange();
                setDraftFrom(range.from);
                setDraftTo(range.to);
                setCalendarMonth(range.from.slice(0, 7));
              }}
            >
              {labels.thisMonth}
            </button>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setDraftFrom(null);
                setDraftTo(null);
              }}
            >
              {labels.reset}
            </button>
            <button
              type="button"
              className={`btn btn--pri btn--sm${draftFrom && draftTo ? "" : " is-disabled"}`}
              onClick={apply}
            >
              {labels.apply}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
