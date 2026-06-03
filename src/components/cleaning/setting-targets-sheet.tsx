"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { startCleaningSession } from "@/app/mobile/cleaning/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type SettingTargetSheetItem = {
  arrivingPax: number | null;
  arrivingGuestName: string;
  roomLabel: string;
  roomTitle: string;
};

type SettingTargetsSheetProps = {
  closeLabel: string;
  count: number;
  description: string;
  emptyMessage: string;
  items: SettingTargetSheetItem[];
  paxUnit: string;
  startLabel: string;
  title: string;
};

function subscribeHydration(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const id = window.requestAnimationFrame(() => callback());

  return () => window.cancelAnimationFrame(id);
}

export function SettingTargetsSheet({
  closeLabel,
  count,
  description,
  emptyMessage,
  items,
  paxUnit,
  startLabel,
  title,
}: SettingTargetsSheetProps) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const titleId = useId();
  const isHydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="cursor-pointer rounded-full bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-slate-300/70"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="text-2xl font-black leading-none tracking-[-0.04em] text-slate-950 underline decoration-2 underline-offset-4">
          {count}
        </span>
      </button>

      {isHydrated && open
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6">
              <button
                aria-label={closeLabel}
                className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
                onClick={() => setOpen(false)}
                type="button"
              />
              <section
                aria-labelledby={titleId}
                aria-modal="true"
                className="relative w-full max-w-[28rem] max-h-[84dvh] overflow-hidden rounded-[30px] border border-slate-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_32px_84px_-34px_rgba(15,23,42,0.46)] backdrop-blur-2xl dark:border-white/12 dark:bg-[linear-gradient(180deg,rgba(11,22,33,0.9),rgba(11,22,33,0.74))]"
                id={dialogId}
                role="dialog"
              >
                <div className="flex items-center justify-center px-4 pt-3">
                  <div className="h-1.5 w-12 rounded-full bg-slate-200" />
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-5 pb-4 pt-4 dark:border-white/10">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {title}
                    </p>
                    <p id={titleId} className="mt-1 text-lg font-black">
                      {description}
                    </p>
                  </div>
                  <Button
                    className="size-9 rounded-full border border-slate-200/80 bg-white p-0 shadow-[0_12px_24px_-20px_rgba(31,58,95,0.45)] hover:bg-slate-50 dark:border-white/12 dark:bg-white/10"
                    onClick={() => setOpen(false)}
                    type="button"
                    variant="ghost"
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="max-h-[calc(84dvh-6rem)] space-y-3 overflow-y-auto px-5 py-5">
                  {items.length > 0 ? (
                    <div className="space-y-3">
                      {items.map((item) => (
                        <Card
                          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_14px_28px_-24px_rgba(31,58,95,0.42)] dark:border-white/10 dark:bg-white/8"
                          key={item.roomLabel}
                        >
                          <div className="flex items-start justify-between gap-3 p-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-[15px] font-bold leading-tight text-foreground">
                                {item.roomTitle}
                              </p>
                              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                                {item.arrivingGuestName}
                                {item.arrivingPax !== null ? ` · ${item.arrivingPax}${paxUnit}` : ""}
                              </p>
                            </div>
                            <form action={startCleaningSession}>
                              <input name="roomLabel" type="hidden" value={item.roomLabel} />
                              <input name="taskKey" type="hidden" value="simple" />
                              <Button
                                className="h-9 rounded-2xl border border-slate-200/70 bg-white px-3 text-xs font-black text-slate-800 shadow-[0_12px_24px_-22px_rgba(31,58,95,0.45)]"
                                type="submit"
                              >
                                {startLabel}
                              </Button>
                            </form>
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="rounded-2xl border-dashed border-white/60 bg-white/40 p-4 text-sm font-semibold text-muted-foreground shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/8">
                      {emptyMessage}
                    </Card>
                  )}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
