"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { BottomSheet } from "@/components/shell/bottom-sheet";
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

  function dismiss() {
    setOpen(false);
    router.replace(`/mobile/linen-return/list?building=${encodeURIComponent(building)}`, {
      scroll: false,
    });
  }

  return open ? (
    <BottomSheet
      ariaLabel={copy.successTitle}
      header={
        <div className="text-center">
          <span className="mx-auto mb-[18px] flex size-[78px] items-center justify-center rounded-full bg-primary/10">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-7" aria-hidden="true" strokeWidth={2.5} />
            </span>
          </span>
          <p className="text-[19px] font-black tracking-[-0.02em] text-foreground">
            {copy.successTitle}
          </p>
        </div>
      }
      onClose={dismiss}
    >
      {({ close }) => (
        <button
          className="mt-6 h-[50px] w-full rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.98]"
          onClick={close}
          type="button"
        >
          {copy.successToListButton}
        </button>
      )}
    </BottomSheet>
  ) : null;
}
