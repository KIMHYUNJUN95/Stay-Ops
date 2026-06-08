"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";

export type LanguageOption = { code: Locale; label: string };

type LanguageSegmentedProps = {
  /** Form field name; a hidden input carries the value so server actions still receive it. */
  name: string;
  /** Initial selected locale. */
  defaultValue: Locale;
  /** Localized options (labels are language autonyms from the dictionary). */
  options: LanguageOption[];
  /** Accessible label for the radiogroup. */
  ariaLabel: string;
  /** Optional change hook for callers that also track the value in React state. */
  onChange?: (value: Locale) => void;
};

/**
 * Pill-style 3-way segmented toggle for language selection.
 *
 * A white indicator (`thumb`) slides between options and resizes to the active
 * label's width, so differing label lengths stay aligned. Replaces the native
 * `<select>` while keeping the existing form/server-action flow via a hidden
 * input. Colors use the project's semantic tokens (teal `--primary`, `--muted`
 * track, `--surface` thumb, `--muted-foreground` for inactive text).
 */
export function LanguageSegmented({
  name,
  defaultValue,
  options,
  ariaLabel,
  onChange,
}: LanguageSegmentedProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<Locale>(defaultValue);
  const [thumb, setThumb] = useState<{ left: number; width: number }>({
    left: 4,
    width: 0,
  });

  // Measure the active option and position the thumb. Re-measures on value
  // change and whenever the track resizes (container width, async font load),
  // so the indicator always matches the active label's width/position.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const measure = () => {
      const idx = options.findIndex((option) => option.code === value);
      const buttons =
        wrap.querySelectorAll<HTMLButtonElement>("[data-seg-opt]");
      const el = buttons[idx];
      if (el) {
        setThumb({ left: el.offsetLeft, width: el.offsetWidth });
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [value, options]);

  function select(code: Locale) {
    setValue(code);
    onChange?.(code);
  }

  return (
    <div
      ref={wrapRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative flex h-12 rounded-[13px] bg-muted p-1"
    >
      <input type="hidden" name={name} value={value} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1 bottom-1 z-[1] rounded-[9px] bg-surface shadow-[0_2px_6px_rgba(20,40,38,0.12)] transition-[left,width] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ left: thumb.left, width: thumb.width }}
      />
      {options.map((option) => {
        const isActive = option.code === value;
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-seg-opt
            onClick={() => select(option.code)}
            className={`relative z-[2] flex flex-1 items-center justify-center text-[13.5px] transition-colors ${
              isActive
                ? "font-bold text-primary"
                : "font-semibold text-muted-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
