"use client";

// Shared admin-console chip dropdown primitive.
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type ChipDropdownOption = {
  value: string;
  label: string;
  count?: number;
};

type ChipDropdownProps = {
  icon: React.ReactNode;
  chipLabel: string;
  allLabel: string;
  options: ChipDropdownOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  ariaLabel: string;
  /** Popover horizontal alignment relative to the trigger. Default "right" (existing behavior). */
  align?: "left" | "right";
  /** When true, the popover matches the trigger width and drops straight down (min 150px). */
  fitTrigger?: boolean;
};

/** Chip-trigger popover single-select filter — site / issue-type dropdowns in the queue toolbar. */
export function ChipDropdown({
  icon,
  chipLabel,
  allLabel,
  options,
  value,
  onChange,
  ariaLabel,
  align = "right",
  fitTrigger = false,
}: ChipDropdownProps) {
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

  return (
    <div className="adp" ref={rootRef}>
      <button
        type="button"
        className="chipbtn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ic">{icon}</span>
        {chipLabel}
        <span className="ic chev">
          <ChevronDown />
        </span>
      </button>

      {open ? (
        <div
          className="adp__pop"
          role="listbox"
          aria-label={ariaLabel}
          style={{
            width: fitTrigger ? "100%" : 220,
            minWidth: fitTrigger ? 150 : undefined,
            left: align === "left" ? 0 : "auto",
            right: align === "left" ? "auto" : 0,
          }}
        >
          <button
            type="button"
            className={`adp__opt${value == null ? " sel" : ""}`}
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`adp__opt${value === opt.value ? " sel" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {opt.count != null ? <span className="adp__optcnt">{opt.count}</span> : null}
            </button>
          ))}
          {options.length === 0 ? <div className="adp__optempty">{allLabel}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
