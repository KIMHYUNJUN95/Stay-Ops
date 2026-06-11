"use client";

import { useState } from "react";
import { Check, Search, X } from "lucide-react";
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
  const q = query.trim();
  const list = q ? users.filter((u) => u.name.includes(q)) : users;

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45"
      onClick={onClose}
    >
      <div
        className="flex max-h-[82dvh] w-full max-w-[460px] flex-col rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-[38px] shrink-0 rounded-full bg-slate-200" />
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-[16px] font-black text-foreground">{copy.shareTitle}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{copy.shareSub}</p>
          </div>
          <button
            aria-label={copy.cancel}
            className="flex size-8 items-center justify-center rounded-full bg-slate-50 text-slate-500"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
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
          onClick={() => onApply(selected)}
          type="button"
        >
          {selected.length
            ? copy.shareApply.replace("{count}", String(selected.length))
            : copy.sharePrompt}
        </button>
      </div>
    </div>
  );
}
