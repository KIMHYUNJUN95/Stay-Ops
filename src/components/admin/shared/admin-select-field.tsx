"use client";

// Shared admin-console form select field — a clean, on-brand replacement for the native <select> whose
// open dropdown list is unstyled OS chrome. Full-width field trigger + styled popover (surface card,
// navy-accented hover/selected, check mark). Single-select, controlled.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type AdminSelectOption = { value: string; label: string };

export function AdminSelectField({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: AdminSelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
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

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div className="selfield" ref={rootRef}>
      <button
        type="button"
        className={`selfield__trig${open ? " is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "selfield__val" : "selfield__ph"}>
          {selected ? selected.label : (placeholder ?? "")}
        </span>
        <span className="ic selfield__chev">
          <ChevronDown />
        </span>
      </button>

      {open ? (
        <div className="selfield__pop" role="listbox" aria-label={ariaLabel}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`selfield__opt${o.value === value ? " sel" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.value === value ? (
                <span className="ic selfield__ck">
                  <Check />
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
