"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Search } from "lucide-react";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import type { Dictionary } from "@/lib/i18n";
import type { ShareableUser } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];

export function SharePicker({
  copy,
  initialSelected,
  onApply,
  onClose,
  users,
}: {
  copy: Copy;
  initialSelected: string[];
  onApply: (ids: string[]) => void;
  onClose: () => void;
  users: ShareableUser[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [query, setQuery] = useState("");
  // Drives the slide/fade in & out; the sheet stays mounted (parent keeps it open) until the
  // exit transition finishes, then we notify the parent so the down-slide is actually seen.
  const [shown, setShown] = useState(false);
  const q = query.trim();
  const list = q ? users.filter((u) => u.name.includes(q)) : users;

  // Mount at translate-y-full, then flip to 0 on the next frame so it animates up.
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Slide down first, then run the parent callback once the transition (380ms) has played.
  const dismiss = (after: () => void) => {
    setShown(false);
    setTimeout(after, 380);
  };
  const close = () => dismiss(onClose);
  const apply = () => dismiss(() => onApply(selected));

  // iOS-style drag-to-dismiss on the grab handle / header.
  const drag = useSheetDragDismiss({ shown, onDismiss: close });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShown(false);
      setTimeout(onClose, 380);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 transition-opacity duration-300 motion-reduce:transition-none",
        shown ? "opacity-100" : "opacity-0",
      )}
      onClick={close}
      style={drag.scrimStyle}
    >
      <div
        className={cn(
          "flex max-h-[82dvh] w-full max-w-[460px] flex-col rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3",
          "transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
          shown ? "translate-y-0" : "translate-y-full",
        )}
        data-sheet
        onClick={(e) => e.stopPropagation()}
        style={drag.sheetStyle}
      >
        <div
          className="mx-auto mb-3 h-1 w-[38px] shrink-0 rounded-full bg-slate-200"
          {...drag.handleProps}
        />
        <div className="mb-3" {...drag.handleProps}>
          <p className="text-[16px] font-black text-foreground">{copy.shareTitle}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{copy.shareSub}</p>
        </div>

        <div className="relative mb-2 flex items-center">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-slate-400" aria-hidden="true" />
          <input
            className="h-11 w-full rounded-2xl border border-border bg-background/60 pl-10 pr-3 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.shareSearch}
            value={query}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {list.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">{copy.shareNoResult}</p>
          ) : (
            <div className="flex flex-col gap-1">
              {list.map((u) => {
                const on = selected.includes(u.id);
                return (
                  <button
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                      on ? "border-primary bg-primary/[0.06]" : "border-transparent hover:bg-slate-50",
                    )}
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    type="button"
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                      {u.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{u.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{u.role}</span>
                    </span>
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-slate-300",
                      )}
                    >
                      {on ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          className={cn(
            "mt-3 h-[52px] w-full rounded-2xl text-[15px] font-extrabold transition-colors",
            selected.length
              ? "bg-primary text-primary-foreground"
              : "bg-slate-100 text-slate-400",
          )}
          disabled={selected.length === 0}
          onClick={apply}
          type="button"
        >
          {selected.length
            ? copy.shareApply.replace("{count}", String(selected.length))
            : copy.sharePrompt}
        </button>
      </div>
    </div>,
    document.body,
  );
}
