"use client";

// Shared admin-console date picker primitive.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export type AdminDatePickerLabels = {
  prevMonth: string;
  nextMonth: string;
  today: string;
  prevDay?: string;
  nextDay?: string;
  open?: string;
  todayTag?: string;
  pastTag?: string;
};

type InlineDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  localeTag: string;
  ariaLabel: string;
  labels: Pick<AdminDatePickerLabels, "prevMonth" | "nextMonth" | "today">;
};

type RosterNavDatePickerProps = {
  date: string;
  todayDate: string;
  localeTag: string;
  basePath: string;
  labels: AdminDatePickerLabels;
};

type AdminDatePickerProps = InlineDatePickerProps | RosterNavDatePickerProps;

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
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function shiftDateKey(key: string, delta: number): string {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + delta);
  return formatDateKey(date);
}

function monthLabel(monthKey: string, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
  }).format(new Date(`${monthKey}-01T00:00:00+09:00`));
}

function tokyoDayOfWeek(dateKey: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(new Date(`${dateKey}T00:00:00+09:00`));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function daysInMonthKey(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function buildCalendarCells(monthKey: string, todayDate: string, selectedDate: string) {
  const firstDow = tokyoDayOfWeek(`${monthKey}-01`);
  const days = daysInMonthKey(monthKey);
  const cells: Array<{ key: string | null; day: number | null; future: boolean; selected: boolean }> =
    [];

  for (let i = 0; i < firstDow; i++) cells.push({ key: null, day: null, future: false, selected: false });
  for (let day = 1; day <= days; day++) {
    const key = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ key, day, future: key > todayDate, selected: key === selectedDate });
  }
  return cells;
}

function InlineDatePicker({
  value,
  onChange,
  min,
  max,
  localeTag,
  ariaLabel,
  labels,
}: InlineDatePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(value.slice(0, 7));
  const upperDate = max ?? "9999-12-31";
  const cells = useMemo(
    () => buildCalendarCells(calendarMonth, upperDate, value),
    [calendarMonth, upperDate, value],
  );
  const dowLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(localeTag, { timeZone: "Asia/Tokyo", weekday: "narrow" }).format(
          new Date(`2026-06-${String(i + 7).padStart(2, "0")}T00:00:00+09:00`),
        ),
      ),
    [localeTag],
  );

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

  function choose(targetDate: string) {
    if ((min && targetDate < min) || (max && targetDate > max)) return;
    setOpen(false);
    onChange(targetDate);
  }

  return (
    <div className="adp" ref={rootRef}>
      <button
        type="button"
        className="adp__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!open) setCalendarMonth(value.slice(0, 7));
          setOpen((current) => !current);
        }}
      >
        <span>{value}</span>
        <CalendarDays className="adp__trigger-ic" aria-hidden="true" />
      </button>
      {open ? (
        <div className="adp__pop" role="dialog" aria-label={ariaLabel}>
          <div className="adp__hd">
            <button
              type="button"
              className="adp__nav"
              aria-label={labels.prevMonth}
              onClick={() => setCalendarMonth((month) => shiftDateKey(`${month}-01`, -1).slice(0, 7))}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="adp__ml">{monthLabel(calendarMonth, localeTag)}</span>
            <button
              type="button"
              className="adp__nav"
              aria-label={labels.nextMonth}
              onClick={() => setCalendarMonth((month) => shiftDateKey(`${month}-01`, 32).slice(0, 7))}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="adp__wd">
            {dowLabels.map((label, i) => (
              <span key={`${label}-${i}`}>{label}</span>
            ))}
          </div>
          <div className="adp__grid">
            {cells.map((cell, i) =>
              cell.key ? (
                <button
                  key={cell.key}
                  type="button"
                  className={`adp__cell${cell.selected ? " sel" : ""}`}
                  disabled={(min ? cell.key < min : false) || (max ? cell.key > max : false)}
                  onClick={() => choose(cell.key!)}
                >
                  {cell.day}
                </button>
              ) : (
                <span key={`blank-${i}`} className="adp__cell empty" />
              ),
            )}
          </div>
          <button type="button" className="adp__today" onClick={() => choose(formatDateKey(new Date()))}>
            {labels.today}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RosterNavDatePicker({
  date,
  todayDate,
  localeTag,
  basePath,
  labels,
}: RosterNavDatePickerProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(date.slice(0, 7));
  const cells = useMemo(
    () => buildCalendarCells(calendarMonth, todayDate, date),
    [calendarMonth, date, todayDate],
  );
  const dowLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Intl.DateTimeFormat(localeTag, {
          timeZone: "Asia/Tokyo",
          weekday: "narrow",
        }).format(new Date(Date.UTC(2026, 5, i + 7, 12))),
      ),
    [localeTag],
  );
  const fullLabel = useMemo(() => {
    const d = parseDateKey(date);
    const md = new Intl.DateTimeFormat(localeTag, {
      timeZone: "Asia/Tokyo",
      month: "long",
      day: "numeric",
    }).format(d);
    const dow = new Intl.DateTimeFormat(localeTag, {
      timeZone: "Asia/Tokyo",
      weekday: "short",
    }).format(d);
    return `${md} (${dow})`;
  }, [date, localeTag]);

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

  function go(targetDate: string) {
    const nextDate = targetDate > todayDate ? todayDate : targetDate;
    setOpen(false);
    router.push(`${basePath}?date=${nextDate}`);
  }
  function toggle() {
    if (!open) setCalendarMonth(date.slice(0, 7));
    setOpen((value) => !value);
  }

  return (
    <div className="amp" ref={rootRef}>
      <button
        type="button"
        className="chipbtn amp__arw"
        aria-label={labels.prevDay ?? labels.prevMonth}
        onClick={() => go(shiftDateKey(date, -1))}
      >
        <span className="ic">
          <ChevronLeft />
        </span>
      </button>
      <button
        type="button"
        className="amp__label"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={labels.open ?? labels.today}
        onClick={toggle}
      >
        {fullLabel}
      </button>
      <button
        type="button"
        className="chipbtn amp__arw"
        aria-label={labels.nextDay ?? labels.nextMonth}
        onClick={() => go(shiftDateKey(date, 1))}
        disabled={date >= todayDate}
      >
        <span className="ic">
          <ChevronRight />
        </span>
      </button>

      {open ? (
        <div className="amp__pop amp__pop--day" role="dialog" aria-label={labels.open ?? labels.today}>
          <div className="amp__hd">
            <button
              type="button"
              className="adp__nav"
              aria-label={labels.prevMonth}
              onClick={() =>
                setCalendarMonth((month) => shiftDateKey(`${month}-01`, -1).slice(0, 7))
              }
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="amp__yr">{monthLabel(calendarMonth, localeTag)}</span>
            <button
              type="button"
              className="adp__nav"
              aria-label={labels.nextMonth}
              disabled={calendarMonth >= todayDate.slice(0, 7)}
              onClick={() =>
                setCalendarMonth((month) => shiftDateKey(`${month}-01`, 32).slice(0, 7))
              }
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="adp__wd">
            {dowLabels.map((label, i) => (
              <span key={`${label}-${i}`} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
                {label}
              </span>
            ))}
          </div>
          <div className="adp__grid">
            {cells.map((cell, i) =>
              cell.key ? (
                <button
                  key={cell.key}
                  type="button"
                  className={`adp__cell${cell.selected ? " sel" : ""}${
                    cell.key === todayDate && !cell.selected ? " today" : ""
                  }`}
                  disabled={cell.future}
                  onClick={() => go(cell.key!)}
                >
                  {cell.day}
                </button>
              ) : (
                <span key={`blank-${i}`} className="adp__cell empty" />
              ),
            )}
          </div>
          <button type="button" className="adp__today" onClick={() => go(todayDate)}>
            {labels.today}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminDatePicker(props: AdminDatePickerProps) {
  if ("value" in props) return <InlineDatePicker {...props} />;
  return <RosterNavDatePicker {...props} />;
}
