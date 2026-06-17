"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

type LinenReturnSuccessProps = {
  building: string;
  copy: Dictionary["linenReturn"];
  show: boolean;
};

// Shown once after a successful registration redirect (?created=<id>). Dismissing
// strips the query param so a refresh does not replay the success moment.
export function LinenReturnSuccess({ building, copy, show }: LinenReturnSuccessProps) {
  const router = useRouter();
  const [open, setOpen] = useState(show);
  // Portal to <body> so the overlay escapes the shell's transformed scroll container and covers the
  // full viewport (top chrome + bottom tab bar included); gate on hydration to match SSR.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!open || !hydrated) return null;

  function dismiss() {
    setOpen(false);
    router.replace(`/mobile/linen-return/list?building=${encodeURIComponent(building)}`, {
      scroll: false,
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 px-7 backdrop-blur-sm"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm rounded-[26px] bg-surface px-6 pb-6 pt-8 text-center shadow-[0_30px_70px_-20px_rgba(0,0,0,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mb-[18px] flex size-[78px] items-center justify-center rounded-full bg-primary/10">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-7" aria-hidden="true" strokeWidth={2.5} />
          </span>
        </span>
        <p className="text-[19px] font-black tracking-[-0.02em] text-foreground">
          {copy.successTitle}
        </p>
        <button
          className="mt-6 h-[50px] w-full rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.98]"
          onClick={dismiss}
          type="button"
        >
          {copy.successToListButton}
        </button>
      </div>
    </div>,
    document.body,
  );
}
