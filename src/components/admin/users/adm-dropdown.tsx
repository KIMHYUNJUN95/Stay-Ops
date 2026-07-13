"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type AdmOption = {
  value: string;
  label: string;
  /** rich mode only: the mono permission_key shown on the left */
  key?: string;
  /** rich mode only: secondary description line */
  desc?: string;
};

type AdmDropdownProps = {
  options: AdmOption[];
  value: string;
  onChange: (value: string) => void;
  size?: "sm" | "md";
  placeholder?: string;
  /** rich = permission-key picker (mono key + label + description) */
  rich?: boolean;
  wide?: boolean;
  ariaLabel?: string;
};

/**
 * Custom dropdown that replaces the native <select> across the users flow, matching the design
 * handoff `.dd` component (flow.css). Self-manages open state with outside-click + Esc close.
 */
export function AdmDropdown({
  options,
  value,
  onChange,
  size = "md",
  placeholder = "선택",
  rich = false,
  wide = false,
  ariaLabel,
}: AdmDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((option) => option.value === value);
  const label = current ? current.label : placeholder;

  return (
    <div className={`dd${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`dd__btn${size === "sm" ? " dd__btn--sm" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={`dd__val${current ? "" : " ph"}`}>{label}</span>
        <span className="ic dd__chev">
          <ChevronDown />
        </span>
      </button>
      {open ? (
        <div className={`dd__menu${wide ? " dd__menu--wide" : ""}`} role="listbox">
          {options.map((option) => {
            const on = option.value === value;
            return (
              <button
                type="button"
                key={option.value}
                className={`dd__opt${on ? " on" : ""}`}
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {rich ? (
                  <span className="dd__opt__k">
                    <b>{option.label}</b>
                    {option.key ? <span className="dd__opt__key">{option.key}</span> : null}
                    {option.desc ? <small>{option.desc}</small> : null}
                  </span>
                ) : (
                  <span className="dd__opt__k">{option.label}</span>
                )}
                {on ? (
                  <span className="ic dd__chk">
                    <Check />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
