"use client";

import {
  forwardRef,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BottomSheet } from "@/components/shell/bottom-sheet";

const ITEM_H = 44; // px per drum item
const PAD_H = ITEM_H * 2; // 2-item spacer top + bottom keeps selected row centered

const HOUR_ITEMS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
); // "01" … "12"
const MIN_ITEMS = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
); // "00" … "59"

const AMPM_BY_LOCALE: Record<string, [string, string]> = {
  ko: ["오전", "오후"],
  ja: ["午前", "午後"],
};
function ampmLabels(locale: string): [string, string] {
  return AMPM_BY_LOCALE[locale] ?? ["AM", "PM"];
}

function parseValue(value: string): {
  ampmIdx: number;
  hourIdx: number;
  minIdx: number;
} {
  if (!value) return { ampmIdx: 0, hourIdx: 8, minIdx: 0 }; // default 09:00 AM
  const [hStr = "0", mStr = "0"] = value.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ampmIdx = h >= 12 ? 1 : 0;
  const h12 = h % 12;
  // h12=0 → display "12" (HOUR_ITEMS index 11), h12=1 → "01" (index 0), etc.
  const hourIdx = h12 === 0 ? 11 : h12 - 1;
  return { ampmIdx, hourIdx, minIdx: m };
}

function to24h(ampmIdx: number, hourIdx: number, minIdx: number): string {
  const h12 = hourIdx + 1; // 1-12
  let h24: number;
  if (ampmIdx === 0) {
    h24 = h12 === 12 ? 0 : h12;
  } else {
    h24 = h12 === 12 ? 12 : h12 + 12;
  }
  return `${String(h24).padStart(2, "0")}:${String(minIdx).padStart(2, "0")}`;
}

/** Formats a "HH:MM" 24-hour string for display (e.g. "오전 10:30"). */
export function formatTimeDisplay(value: string, locale: string): string {
  if (!value) return "--:--";
  const [hStr = "0", mStr = "0"] = value.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const [amLabel, pmLabel] = ampmLabels(locale);
  const ampm = h >= 12 ? pmLabel : amLabel;
  const h12 = h % 12 || 12;
  return `${ampm} ${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ─── Drum column ──────────────────────────────────────────────────────────────

type DrumColProps = {
  items: string[];
  initialIdx: number;
  onSettle: (idx: number) => void;
};

const DrumCol = forwardRef<HTMLDivElement, DrumColProps>(
  ({ items, initialIdx, onSettle }, ref) => {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Set initial scroll position without triggering snap animation.
    useEffect(() => {
      const el = (ref as RefObject<HTMLDivElement>).current;
      if (el) el.scrollTop = initialIdx * ITEM_H;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleScroll = useCallback(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const el = (ref as RefObject<HTMLDivElement>).current;
        if (!el) return;
        const idx = Math.max(
          0,
          Math.min(Math.round(el.scrollTop / ITEM_H), items.length - 1),
        );
        onSettle(idx);
      }, 80);
    }, [items.length, onSettle, ref]);

    return (
      <div ref={ref} className="drum" onScroll={handleScroll}>
        <div style={{ height: PAD_H }} />
        {items.map((item) => (
          <div key={item} className="drum__item">
            {item}
          </div>
        ))}
        <div style={{ height: PAD_H }} />
      </div>
    );
  },
);
DrumCol.displayName = "DrumCol";

// ─── Sheet ────────────────────────────────────────────────────────────────────

type Props = {
  /** "HH:MM" 24-hour format, or empty string for no initial value. */
  value: string;
  /** Short field label shown above the large time display. */
  label: string;
  confirmLabel: string;
  locale: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
};

export function TimePickerSheet({
  value,
  label,
  confirmLabel,
  locale,
  onConfirm,
  onClose,
}: Props) {
  const [amLabel, pmLabel] = ampmLabels(locale);
  const ampmItems = [amLabel, pmLabel];
  const init = parseValue(value);

  const [ampmIdx, setAmpmIdx] = useState(init.ampmIdx);
  const [hourIdx, setHourIdx] = useState(init.hourIdx);
  const [minIdx, setMinIdx] = useState(init.minIdx);

  const ampmRef = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const minRef = useRef<HTMLDivElement>(null);

  function readFinalIdx(
    r: RefObject<HTMLDivElement | null>,
    max: number,
  ): number {
    if (!r.current) return 0;
    return Math.max(
      0,
      Math.min(Math.round(r.current.scrollTop / ITEM_H), max - 1),
    );
  }

  function handleConfirm(close: () => void) {
    const ai = readFinalIdx(ampmRef, ampmItems.length);
    const hi = readFinalIdx(hourRef, HOUR_ITEMS.length);
    const mi = readFinalIdx(minRef, MIN_ITEMS.length);
    onConfirm(to24h(ai, hi, mi));
    close();
  }

  const h12Display = hourIdx + 1;
  const displayStr = `${ampmItems[ampmIdx]} ${String(h12Display).padStart(2, "0")}:${String(minIdx).padStart(2, "0")}`;

  return (
    <BottomSheet onClose={onClose}>
      {({ close }) => (
        <div className="att">
          <div className="tpick">
            <p className="tpick__label">{label}</p>
            <p className="tpick__display">{displayStr}</p>

            <div className="tpick__outer">
              {/* selection highlight — not inside the masked cols div */}
              <div className="tpick__sel" aria-hidden="true" />
              <div className="tpick__cols">
                <DrumCol
                  ref={ampmRef}
                  items={ampmItems}
                  initialIdx={init.ampmIdx}
                  onSettle={setAmpmIdx}
                />
                <DrumCol
                  ref={hourRef}
                  items={HOUR_ITEMS}
                  initialIdx={init.hourIdx}
                  onSettle={setHourIdx}
                />
                <DrumCol
                  ref={minRef}
                  items={MIN_ITEMS}
                  initialIdx={init.minIdx}
                  onSettle={setMinIdx}
                />
              </div>
            </div>

            <button
              type="button"
              className="tpick__btn"
              onClick={() => handleConfirm(close)}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
