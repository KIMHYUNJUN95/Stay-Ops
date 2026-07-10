"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ProfileGender } from "@/lib/onboarding";

export type GenderOption = { code: ProfileGender; label: string };

type GenderSegmentedProps = {
  name: string;
  defaultValue: ProfileGender | "";
  options: GenderOption[];
  ariaLabel: string;
  onChange?: (value: ProfileGender) => void;
};

export function GenderSegmented({
  name,
  defaultValue,
  options,
  ariaLabel,
  onChange,
}: GenderSegmentedProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<ProfileGender | "">(defaultValue);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !value) {
      setThumb(null);
      return;
    }

    const measure = () => {
      const idx = options.findIndex((option) => option.code === value);
      const buttons =
        wrap.querySelectorAll<HTMLButtonElement>("[data-gender-opt]");
      const el = buttons[idx];
      if (el) {
        setThumb({ left: el.offsetLeft, width: el.offsetWidth });
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [options, value]);

  function select(code: ProfileGender) {
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
      {thumb ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 bottom-1 z-[1] rounded-[9px] bg-surface shadow-[0_2px_6px_rgba(20,40,38,0.12)] transition-[left,width] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ left: thumb.left, width: thumb.width }}
        />
      ) : null}
      {options.map((option) => {
        const isActive = option.code === value;
        return (
          <button
            key={option.code}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-gender-opt
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
