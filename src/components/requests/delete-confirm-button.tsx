"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, Trash2 } from "lucide-react";

type DeleteConfirmLabels = {
  confirmTitle: string;
  confirmBody: string;
  deletePermanently: string;
  cancel: string;
  deleteFailed: string;
  deleteRecord: string;
};

type DeleteConfirmButtonProps = {
  deleteAction: () => Promise<{ ok: boolean; error?: string }>;
  labels: DeleteConfirmLabels;
  redirectTo: string;
  title: string;
};

export function DeleteConfirmButton({
  deleteAction,
  labels,
  redirectTo,
  title,
}: DeleteConfirmButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (isDeleting) return;
    setOpen(false);
    setError(null);
  }, [isDeleting]);

  async function handleConfirm() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError(null);

    const result = await deleteAction();
    setIsDeleting(false);

    if (!result.ok) {
      setError(labels.deleteFailed);
      return;
    }

    router.push(redirectTo);
  }

  return (
    <>
      <button
        aria-label={labels.deleteRecord}
        className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm font-bold text-destructive transition-colors hover:bg-destructive/15"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        {labels.deleteRecord}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              aria-labelledby="delete-confirm-title"
              aria-modal="true"
              className="fixed inset-0 z-[200] flex items-center justify-center px-6 py-8"
              role="dialog"
            >
              <button
                aria-hidden="true"
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl"
                onClick={close}
                tabIndex={-1}
                type="button"
              />
              <div
                className="relative w-full max-w-[340px] overflow-hidden rounded-[28px] border border-white/55 bg-surface shadow-[0_28px_90px_-34px_rgba(15,23,42,0.7)]"
                style={{ animation: "modal-card-in 280ms cubic-bezier(0.34,1.26,0.64,1) both" }}
              >
                <div className="px-6 pb-6 pt-6">
                  <div className="mb-4 flex flex-col items-center gap-3 text-center">
                    <div className="flex size-14 items-center justify-center rounded-full bg-red-50 text-red-500 ring-1 ring-red-200/70">
                      <AlertTriangle className="size-7" aria-hidden="true" />
                    </div>
                    <div>
                      <h3
                        className="text-lg font-black tracking-tight text-foreground"
                        id="delete-confirm-title"
                      >
                        {labels.confirmTitle}
                      </h3>
                      <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
                        {labels.confirmBody}
                      </p>
                    </div>
                    <div className="w-full rounded-2xl border border-border/60 bg-muted/40 px-3 py-2.5">
                      <p className="truncate text-sm font-black text-foreground">{title}</p>
                    </div>
                  </div>
                  {error ? (
                    <p className="mb-3 text-center text-xs font-semibold text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-background/70 text-sm font-bold text-foreground transition-colors hover:bg-muted/70 disabled:opacity-40"
                      disabled={isDeleting}
                      onClick={close}
                      type="button"
                    >
                      {labels.cancel}
                    </button>
                    <button
                      className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-red-500 text-sm font-black text-white transition-colors hover:bg-red-600 disabled:opacity-40"
                      disabled={isDeleting}
                      onClick={handleConfirm}
                      type="button"
                    >
                      {isDeleting ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <Trash2 className="size-4" aria-hidden="true" />
                      )}
                      {labels.deletePermanently}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
