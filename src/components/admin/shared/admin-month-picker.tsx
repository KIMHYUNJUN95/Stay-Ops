"use client";

// Shared admin-console month picker primitive.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type AdminMonthPickerLabels = {
  prevMonth: string;
  nextMonth: string;
  prevYear: string;
  nextYear: string;
  open: string;
  thisMonth: string;
};

type AdminMonthPickerProps = {
  /** Current month, "YYYY-MM". */
  ym: string;
  localeTag: string;
  /** Path the ?ym= query is appended to (e.g. "/admin/attendance/payroll"). */
  basePath: string;
  /** Optional non-month query keys preserved while switching months (e.g. selected user/panel). */
  preserveQueryKeys?: string[];
  labels: AdminMonthPickerLabels;
};

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function AdminMonthPicker({
  ym,
  localeTag,
  basePath,
  preserveQueryKeys = [],
  labels,
}: AdminMonthPickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [selY, selM] = ym.split("-").map(Number);
  const [viewYear, setViewYear] = useState(selY);
  const rootRef = useRef<HTMLDivElement | null>(null);

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

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(localeTag, { year: "numeric", month: "long" }).format(
        new Date(`${ym}-01T00:00:00`),
      ),
    [localeTag, ym],
  );
  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) =>
        new Intl.DateTimeFormat(localeTag, { month: "short" }).format(new Date(2021, i, 1)),
      ),
    [localeTag],
  );

  function toggle() {
    if (!open) setViewYear(selY);
    setOpen((o) => !o);
  }
  function go(targetYm: string) {
    setOpen(false);
    const next = new URLSearchParams();
    next.set("ym", targetYm);
    for (const key of preserveQueryKeys) {
      const value = searchParams.get(key);
      if (value) next.set(key, value);
    }
    router.push(`${basePath}?${next.toString()}`);
  }
  function goThisMonth() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === "year")?.value ?? "1970";
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    go(`${year}-${month}`);
  }

  return (
    <div className="amp" ref={rootRef}>
      <button
        type="button"
        className="chipbtn amp__arw"
        aria-label={labels.prevMonth}
        onClick={() => go(shiftYm(ym, -1))}
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
        aria-label={labels.open}
        onClick={toggle}
      >
        {monthLabel}
      </button>
      <button
        type="button"
        className="chipbtn amp__arw"
        aria-label={labels.nextMonth}
        onClick={() => go(shiftYm(ym, 1))}
      >
        <span className="ic">
          <ChevronRight />
        </span>
      </button>

      {open ? (
        <div className="amp__pop" role="dialog" aria-label={labels.open}>
          <div className="amp__hd">
            <button
              type="button"
              className="adp__nav"
              aria-label={labels.prevYear}
              onClick={() => setViewYear((y) => y - 1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="amp__yr">{viewYear}</span>
            <button
              type="button"
              className="adp__nav"
              aria-label={labels.nextYear}
              onClick={() => setViewYear((y) => y + 1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="amp__grid">
            {monthNames.map((name, i) => {
              const m = i + 1;
              const isSel = viewYear === selY && m === selM;
              const targetYm = `${viewYear}-${String(m).padStart(2, "0")}`;
              return (
                <button
                  key={m}
                  type="button"
                  className={`amp__m${isSel ? " sel" : ""}`}
                  onClick={() => go(targetYm)}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <button type="button" className="amp__today" onClick={goThisMonth}>
            {labels.thisMonth}
          </button>
        </div>
      ) : null}
    </div>
  );
}
