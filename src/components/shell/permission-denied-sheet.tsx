"use client";

import { Lock } from "lucide-react";
import { BottomSheet } from "@/components/shell/bottom-sheet";

/**
 * Canonical mobile "no permission" popup — same visual pattern as the report-sheet
 * forbidden state (lock icon + title + body), reused wherever a server action rejects
 * an action with `unauthorized`/`forbidden` on `/mobile/*`.
 */
export function PermissionDeniedSheet({
  title,
  body,
  closeLabel,
  onClose,
}: {
  title: string;
  body: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <BottomSheet ariaLabel={title} onClose={onClose}>
      {({ close }) => (
        <div className="flex flex-col items-center px-2 pb-2 pt-1 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">
            <Lock className="size-6" aria-hidden="true" />
          </span>
          <p className="text-[15px] font-extrabold text-foreground">{title}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
            onClick={close}
            type="button"
          >
            {closeLabel}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
