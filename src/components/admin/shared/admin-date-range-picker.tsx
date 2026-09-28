"use client";

// Shared admin-console date-RANGE picker primitive — single combined trigger ("시작일 – 종료일")
// that opens a range-select calendar popover (matches the design handoff's `.dpick`/`.calpop`).
// Renders the popover with `position: fixed` + viewport-clamped coordinates computed from the
// trigger's getBoundingClientRect (same escape-ancestor-overflow approach as the day-menu popover
// in leave-team-calendar.tsx) so it can never be clipped by a scrollable ancestor (e.g. `.content`)
// or rendered behind the sidebar.
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { shiftMonthKey } from "./admin-month-key";

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
  /** `from`/`to` 가 비었을 때 트리거에 남는 문구(예: 「전체 기간」). 없으면 대시만 보인다. */
  emptyLabel?: string;
  /**
   * 고를 수 없는 날(회색·클릭 불가). `pendingFrom` 은 **시작을 찍고 끝을 기다리는 중**일 때의
   * 시작일이다 — 끝으로 고를 수 있는 날과 시작으로 고를 수 있는 날이 다를 때 쓴다(수동 예약:
   * 팔린 밤을 넘어가는 체크아웃은 막는다).
   *
   * 이 값을 주면 범위가 **제약된 것**으로 본다 — 시작보다 앞을 누르면 앞뒤를 바꾸지 않고 그 날부터
   * 다시 고르고(바꾸면 막힌 밤을 낄 수 있다), 「이번 달」 바로가기를 숨긴다(한 달 통째는 제약을
   * 무시한다).
   */
  isDateDisabled?: (dateKey: string, pendingFrom: string | null) => boolean;
  /** 달력이 보여 주는 달이 바뀔 때(열 때 포함). 그 달의 데이터를 늦게 읽는 화면이 쓴다. */
  onMonthChange?: (monthKey: string) => void;
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
/**
 * 달력을 열 달. `from` 이 비어 있으면 **이번 달**이다.
 *
 * 「기간 없음(전체)」은 정당한 상태다 — 채용 지원서 콘솔이 기본값으로 쓴다. 그런데 예전에는
 * `from.slice(0, 7)` 이 빈 문자열을 그대로 넘겨 `new Date("-01T00:00:00+09:00")` 가 되고,
 * 첫 요일을 구하는 Intl 호출이 **RangeError: Invalid time value** 로 화면 전체를 죽였다
 * (2026-09-09). 다른 화면은 전부 기본 기간이 있어 드러나지 않았을 뿐이다.
 */
function calendarMonthOf(from: string): string {
  return from ? from.slice(0, 7) : formatDateKey(new Date()).slice(0, 7);
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
  emptyLabel,
  isDateDisabled,
  onMonthChange,
}: AdminDateRangePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [calendarMonth, setCalendarMonth] = useState(calendarMonthOf(from));
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
    setCalendarMonth(calendarMonthOf(from));
    onMonthChange?.(calendarMonthOf(from));
    setDraftFrom(null);
    setDraftTo(null);
    setOpen(true);
  }

  function showMonth(monthKey: string) {
    setCalendarMonth(monthKey);
    onMonthChange?.(monthKey);
  }

  const constrained = Boolean(isDateDisabled);
  /** 끝을 기다리는 중이면 그 시작일. */
  const pendingFrom = draftFrom && !draftTo ? draftFrom : null;

  function pick(dateKey: string) {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(dateKey);
      setDraftTo(null);
    } else if (dateKey <= draftFrom && constrained) {
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

  /**
   * 이 달의 `dayIndex`(0-based) 칸이 구간 띠를 갖는지. 달 밖이면 false 라, 기간이 이웃 달로
   * 이어져도 격자 끝은 «끊긴 것»으로 보고 둥글게 막는다.
   */
  function hasBand(dayIndex: number): boolean {
    if (dayIndex < 0 || dayIndex >= days || !draftFrom || !draftTo) return false;
    const val = `${calendarMonth}-${String(dayIndex + 1).padStart(2, "0")}`;
    return val >= draftFrom && val <= draftTo;
  }

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
        {from || to || !emptyLabel ? (
          <>
            <span className="v">{from ? dateLabel(from, localeTag) : ""}</span>
            <span className="dash">–</span>
            <span className="v">{to ? dateLabel(to, localeTag) : ""}</span>
          </>
        ) : (
          <span className="v">{emptyLabel}</span>
        )}
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
              onClick={() => showMonth(shiftMonthKey(calendarMonth, -1))}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="calpop__title">{monthLabel(calendarMonth, localeTag)}</span>
            <button
              type="button"
              className="calpop__nav"
              aria-label={labels.nextMonth}
              onClick={() => showMonth(shiftMonthKey(calendarMonth, 1))}
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
              const isOff = isDateDisabled ? isDateDisabled(val, pendingFrom) : false;
              // 띠가 «끊기는» 자리는 둥글게 막는다: 주 경계(토→일), 달 첫날이 주중이라 앞이
              // 빈칸인 자리, 기간이 다음 달로 이어져 격자 끝에서 잘리는 자리.
              // `gridIndex` 는 앞의 빈칸(`cald--pad`)까지 센 값이라 `% 7` 이 그대로 요일이 된다.
              const gridIndex = firstDow + i;
              const isBand = inRange || (isFrom && Boolean(draftTo)) || isTo;
              const capLeft = gridIndex % 7 === 0 || !hasBand(i - 1);
              const capRight = gridIndex % 7 === 6 || !hasBand(i + 1);
              const cls = [
                "cald",
                isFrom ? "is-from" : "",
                isTo ? "is-to" : "",
                isSingle ? "is-single" : "",
                inRange ? "is-range" : "",
                isBand ? "is-band" : "",
                isBand && capLeft ? "is-capl" : "",
                isBand && capRight ? "is-capr" : "",
                isToday ? "is-today" : "",
                isOff ? "is-off" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button type="button" key={val} className={cls} disabled={isOff} onClick={() => pick(val)}>
                  {day}
                </button>
              );
            })}
          </div>
          <div className="calpop__foot">
            {constrained ? null : (
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
            )}
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
