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
      // 색을 토큰(bg-muted/bg-surface)으로 쓰면 안 된다 — `admin-console.css` 가 `.adm` 안에서 같은
      // 이름의 변수를 **다른 의미로** 재정의한다(`--muted` 는 콘솔에서 어두운 슬레이트). 그래서 이
      // 컨트롤이 관리 콘솔에서만 트랙이 시커멓게 나왔다(2026-07-31). 두 셸 모두에서 같게 보이도록
      // 팔레트 색을 직접 쓴다.
      className="relative flex h-12 rounded-[13px] bg-slate-100 p-1"
    >
      <input type="hidden" name={name} value={value} />
      {thumb ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 bottom-1 z-[1] rounded-[9px] bg-white shadow-[0_2px_6px_rgba(20,40,38,0.12)] transition-[left,width] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
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
