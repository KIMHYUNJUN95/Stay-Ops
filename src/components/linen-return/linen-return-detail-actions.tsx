"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { deleteLinenReturnRecord } from "@/app/mobile/linen-return/record/[id]/actions";
import type { Dictionary } from "@/lib/i18n";
import { BottomSheet } from "@/components/shell/bottom-sheet";

type LinenReturnDetailActionsProps = {
  building: string;
  copy: Dictionary["linenReturn"];
  recordId: string;
};

export function LinenReturnDetailActions({
  building,
  copy,
  recordId,
}: LinenReturnDetailActionsProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleDelete() {
    const formData = new FormData();
    formData.set("recordId", recordId);
    startTransition(async () => {
      await deleteLinenReturnRecord(formData);
    });
  }

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        aria-label={copy.editAction}
        className="flex size-9 items-center justify-center rounded-full bg-slate-50 text-slate-700"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)]">
          <button
            className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              router.push(
                `/mobile/linen-return/record/${recordId}/edit?building=${encodeURIComponent(building)}`,
              );
            }}
            type="button"
          >
            <Pencil className="size-4" aria-hidden="true" />
            {copy.editAction}
          </button>
          <button
            className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              setConfirmOpen(true);
            }}
            type="button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {copy.deleteAction}
          </button>
        </div>
      ) : null}

      {confirmOpen ? (
        <BottomSheet
          ariaLabel={copy.deleteConfirmTitle}
          header={
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-500">
                <Trash2 className="size-6" aria-hidden="true" />
              </span>
              <p className="text-[17px] font-black tracking-[-0.02em] text-foreground">
                {copy.deleteConfirmTitle}
              </p>
            </div>
          }
          onClose={() => setConfirmOpen(false)}
        >
          {({ close }) => (
            <>
              <p className="mt-3 text-sm text-muted-foreground">{copy.deleteConfirmBody}</p>
              <div className="mt-6 flex gap-2.5">
                <button
                  className="h-12 flex-1 rounded-2xl border border-border bg-surface text-sm font-bold text-slate-700 disabled:opacity-50"
                  disabled={isPending}
                  onClick={close}
                  type="button"
                >
                  {copy.deleteConfirmCancel}
                </button>
                <button
                  className="h-12 flex-1 rounded-2xl bg-red-500 text-sm font-extrabold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
                  disabled={isPending}
                  onClick={handleDelete}
                  type="button"
                >
                  {copy.deleteConfirmConfirm}
                </button>
              </div>
            </>
          )}
        </BottomSheet>
      ) : null}
    </div>
  );
}
