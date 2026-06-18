"use client";

/**
 * MonthSwitcher — shared month navigator for attendance history & pay screens.
 * Layout: ‹ prev · [month ▾] · next › — clicking the month label opens a custom
 * (non-native) dropdown listing the last 12 months. Navigates via `?ym=YYYY-MM`.
 * Scoped under `.att`; visual tokens reuse the attendance palette. UI-only.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AIc, AttIcon } from "./att-icons";

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** "6월" / "6月" / "June"; prefixes the year when it differs from the reference ym. */
function ymLabel(ym: string, locale: string, refYm: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  const sameYear = ym.slice(0, 4) === refYm.slice(0, 4);
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: "long", timeZone: "UTC" }
    : { year: "numeric", month: "long", timeZone: "UTC" };
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

export function MonthSwitcher({
  ym,
  currentYm,
  basePath,
  locale,
  labels,
}: {
  ym: string;
  currentYm: string;
  basePath: string;
  locale: string;
  labels: { prev: string; next: string; select: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const oldest = shiftYm(currentYm, -11);
  const atNewest = ym >= currentYm;
  const atOldest = ym <= oldest;

  const go = (target: string) => {
    setOpen(false);
    router.push(`${basePath}?ym=${target}`);
  };

  const months = Array.from({ length: 12 }, (_, i) => shiftYm(currentYm, -i));

  return (
    <div className="msw">
      <button
        type="button"
        className="msw__arrow"
        onClick={() => !atOldest && go(shiftYm(ym, -1))}
        disabled={atOldest}
        aria-label={labels.prev}
      >
        <AIc>{AttIcon.back}</AIc>
      </button>

      <button
        type="button"
        className={`msw__label${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={labels.select}
      >
        {ymLabel(ym, locale, currentYm)}
        <AIc>{AttIcon.caret}</AIc>
      </button>

      <button
        type="button"
        className="msw__arrow msw__arrow--next"
        onClick={() => !atNewest && go(shiftYm(ym, 1))}
        disabled={atNewest}
        aria-label={labels.next}
      >
        <AIc>{AttIcon.chevR}</AIc>
      </button>

      {open ? (
        <>
          <div className="msw__backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="msw__menu" role="listbox">
            {months.map((mo) => (
              <button
                key={mo}
                type="button"
                className={`msw__opt${mo === ym ? " on" : ""}`}
                onClick={() => go(mo)}
                role="option"
                aria-selected={mo === ym}
              >
                <span>{ymLabel(mo, locale, currentYm)}</span>
                {mo === ym ? <AIc>{AttIcon.check}</AIc> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
