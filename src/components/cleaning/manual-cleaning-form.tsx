"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, SprayCan } from "lucide-react";
import { startCleaningSession } from "@/app/mobile/cleaning/actions";
import { Button } from "@/components/ui/button";

export type ManualRoomEntry = {
  canonicalRoomLabel: string;
  sessionRoomLabel: string;
};

export type ManualBuildingOption = {
  buildingKey: string;
  rooms: ManualRoomEntry[];
};

type ManualCleaningFormProps = {
  buildings: ManualBuildingOption[];
  buildingLabels: Record<string, string>;
  labels: {
    buildingLabel: string;
    buildingPlaceholder: string;
    room: string;
    roomPlaceholder: string;
    start: string;
    task: string;
  };
  taskOptions: { key: string; label: string }[];
};

type SelectOption = {
  value: string;
  label: string;
};

// Max height of the scrollable option list (matches Tailwind max-h-56).
const LIST_MAX_H = 224;
// Gap between the trigger button bottom edge and the panel top edge.
const PANEL_GAP = 8;
// Combined top+bottom padding inside the panel (p-1 = 4 + 4 px).
const PANEL_PADDING_V = 8;
// Minimum list height before we give up and just let it clip.
const MIN_LIST_H = 48;

type PanelPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  listMaxH: number;
};

function computePanelPosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const vh = window.innerHeight;
  const spaceBelow = vh - rect.bottom - PANEL_GAP;
  const spaceAbove = rect.top - PANEL_GAP;
  // Prefer opening downward unless there's clearly more room above.
  const openDown = spaceBelow >= 120 || spaceBelow >= spaceAbove;
  const available = openDown ? spaceBelow : spaceAbove;
  const listMaxH =
    Math.min(LIST_MAX_H, Math.max(available, MIN_LIST_H)) - PANEL_PADDING_V;

  return openDown
    ? { top: rect.bottom + PANEL_GAP, left: rect.left, width: rect.width, listMaxH }
    : { bottom: vh - rect.top + PANEL_GAP, left: rect.left, width: rect.width, listMaxH };
}

function FancySelect({
  disabled = false,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  onChange: (nextValue: string) => void;
  options: SelectOption[];
  placeholder: string;
  value: string;
}) {
  const uid = useId();
  const listboxId = `listbox-${uid}`;

  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selected = options.find((o) => o.value === value);

  // ── open / close helpers ───────────────────────────────────────────────────

  function openPanel() {
    if (disabled || !triggerRef.current) return;
    setPanelPos(computePanelPosition(triggerRef.current));
    setOpen(true);
  }

  function closePanel(returnFocusToTrigger = true) {
    setOpen(false);
    if (returnFocusToTrigger) triggerRef.current?.focus();
  }

  function focusOption(index: number) {
    const el = optionRefs.current[index];
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
  }

  // ── P1: outside click + scroll close + resize/orientation reposition ───────

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: PointerEvent) {
      const target = e.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleScroll(e: Event) {
      // Allow scrolling inside the panel itself; close on any outer scroll.
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }

    // Recompute fixed coordinates after resize or screen rotation so the panel
    // stays aligned with the trigger (fixes P1).
    function handleResize() {
      if (triggerRef.current) {
        setPanelPos(computePanelPosition(triggerRef.current));
      }
    }

    document.addEventListener("pointerdown", handleOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      document.removeEventListener("pointerdown", handleOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [open]);

  // ── P3: auto-focus the current/first option when the panel opens ───────────

  useEffect(() => {
    if (!open) return;
    const selectedIdx = options.findIndex((o) => o.value === value);
    const focusIdx = selectedIdx >= 0 ? selectedIdx : 0;
    // rAF ensures the portal has rendered before we try to focus.
    const raf = requestAnimationFrame(() => {
      focusOption(focusIdx);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, options, value]);

  // ── P3: keyboard — trigger ─────────────────────────────────────────────────

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
        e.preventDefault();
        if (!open) openPanel();
        // Focus will be moved by the auto-focus effect above.
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          closePanel(false); // already on trigger, no need to re-focus
        }
        break;
    }
  }

  // ── P3: keyboard — option buttons ─────────────────────────────────────────

  function handleOptionKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusOption((index + 1) % options.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusOption((index - 1 + options.length) % options.length);
        break;
      case "Escape":
        e.preventDefault();
        closePanel(); // return focus to trigger
        break;
      case "Tab":
        // Close and return focus to trigger; user can Tab again from there.
        closePanel();
        break;
      // Enter / Space fire onClick natively on <button> — no extra handling needed.
    }
  }

  // ── panel (portalled to document.body to escape any overflow clip) ─────────

  const panel =
    open && !disabled && panelPos
      ? createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: panelPos.top,
              bottom: panelPos.bottom,
              left: panelPos.left,
              width: panelPos.width,
              zIndex: 9999,
            }}
            className="rounded-2xl border border-white/65 bg-white/88 p-1 shadow-[0_20px_38px_-24px_rgba(15,23,42,0.6)] backdrop-blur-2xl"
          >
            {/* P2: role="listbox" + aria-label for screen-reader context */}
            <ul
              id={listboxId}
              role="listbox"
              aria-label={placeholder}
              className="overflow-auto"
              style={{ maxHeight: panelPos.listMaxH }}
            >
              {options.map((option, index) => {
                const isActive = option.value === value;
                return (
                  // P2: role="presentation" on <li> so listbox owns options directly
                  <li key={option.value} role="presentation">
                    {/* P2: role="option" + aria-selected; tabIndex={-1} for managed focus */}
                    <button
                      ref={(el) => {
                        optionRefs.current[index] = el;
                      }}
                      aria-selected={isActive}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#315F91]/25 ${
                        isActive
                          ? "bg-[#EAF1F8] text-[#1F3A5F]"
                          : "text-foreground hover:bg-white/75"
                      }`}
                      onClick={() => {
                        onChange(option.value);
                        closePanel();
                      }}
                      onKeyDown={(e) => handleOptionKeyDown(e, index)}
                      role="option"
                      tabIndex={-1}
                      type="button"
                    >
                      <span>{option.label}</span>
                      {isActive ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  // ── trigger ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* P2: aria-controls links trigger to listbox; aria-haspopup="listbox" preserved */}
      <button
        ref={triggerRef}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-12 w-full items-center justify-between rounded-2xl border border-white/55 bg-white/55 px-4 text-left text-sm font-semibold text-foreground shadow-[0_8px_24px_-18px_rgba(15,23,42,0.55),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl transition-colors hover:bg-white/65 focus:outline-none focus:ring-2 focus:ring-[#315F91]/25 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => (open ? closePanel(false) : openPanel())}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {panel}
    </>
  );
}

export function ManualCleaningForm({
  buildings,
  buildingLabels,
  labels,
  taskOptions,
}: ManualCleaningFormProps) {
  const [isPending, startTransition] = useTransition();
  const [selectedBuildingKey, setSelectedBuildingKey] = useState("");
  const [selectedRoomLabel, setSelectedRoomLabel] = useState("");
  const [selectedTaskKey, setSelectedTaskKey] = useState(
    taskOptions[0]?.key ?? "",
  );

  const selectedBuilding = buildings.find(
    (b) => b.buildingKey === selectedBuildingKey,
  );
  const buildingOptions: SelectOption[] = buildings.map((b) => ({
    value: b.buildingKey,
    label: buildingLabels[b.buildingKey] ?? b.buildingKey,
  }));
  const roomOptions: SelectOption[] = (selectedBuilding?.rooms ?? []).map(
    (r) => ({
      value: r.sessionRoomLabel,
      label: r.canonicalRoomLabel,
    }),
  );
  const taskSelectOptions: SelectOption[] = taskOptions.map((t) => ({
    value: t.key,
    label: t.label,
  }));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedRoomLabel || !selectedTaskKey || isPending) return;
    const fd = new FormData();
    fd.set("roomLabel", selectedRoomLabel);
    fd.set("taskKey", selectedTaskKey);
    startTransition(async () => {
      await startCleaningSession(fd);
    });
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-bold">{labels.buildingLabel}</span>
        <FancySelect
          onChange={(nextValue) => {
            setSelectedBuildingKey(nextValue);
            setSelectedRoomLabel("");
          }}
          options={buildingOptions}
          placeholder={labels.buildingPlaceholder}
          value={selectedBuildingKey}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-bold">{labels.room}</span>
        <FancySelect
          key={selectedBuildingKey ? "room-enabled" : "room-disabled"}
          disabled={!selectedBuildingKey}
          onChange={setSelectedRoomLabel}
          options={roomOptions}
          placeholder={labels.roomPlaceholder}
          value={selectedRoomLabel}
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-bold">{labels.task}</span>
        <FancySelect
          onChange={setSelectedTaskKey}
          options={taskSelectOptions}
          placeholder={labels.task}
          value={selectedTaskKey}
        />
      </label>

      <Button
        className="h-12 w-full rounded-xl bg-[#315F91] font-black text-white hover:bg-[#274D76] focus-visible:outline-[#315F91]"
        disabled={!selectedRoomLabel || isPending}
        type="submit"
      >
        <SprayCan className="mr-2 size-4" aria-hidden="true" />
        {labels.start}
      </Button>
    </form>
  );
}
