"use client";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";

export function BoardPinToggle({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mt-[18px] flex items-center gap-3 rounded-[14px] border border-border bg-surface px-[14px] py-[13px]">
      <div className="flex flex-1 min-w-0 items-center gap-[11px]">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-[hsl(40_78%_92%)] text-[hsl(38_72%_42%)]">
          <Pin className="size-[18px]" aria-hidden="true" />
        </span>
        <div>
          <div className="text-[13.5px] font-extrabold tracking-[-0.01em]">{title}</div>
          <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[27px] w-[46px] shrink-0 rounded-full transition-colors duration-150",
          checked ? "bg-primary" : "bg-[hsl(40_22%_90%)]",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] size-[21px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-[left] duration-150",
            checked ? "left-[22px]" : "left-[3px]",
          )}
        />
      </button>
    </div>
  );
}
