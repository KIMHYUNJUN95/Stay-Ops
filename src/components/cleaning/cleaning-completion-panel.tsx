"use client";

import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Clock3, Edit3, Timer } from "lucide-react";
import { cancelCleaningSession, completeCleaningSession } from "@/app/mobile/cleaning/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { BottomSheet } from "@/components/shell/bottom-sheet";

type CleaningCompletionPanelProps = {
  labels: {
    cancelCleaning: string;
    cancelCleaningMessage: string;
    cancelCleaningTitle: string;
    cancelCompletion: string;
    completedToday: string;
    confirmCancelCleaning: string;
    confirmCompletion: string;
    completionConfirmation: string;
    elapsed: string;
    notesLabel: string;
    notesPlaceholder: string;
    reviewCompletion: string;
    room: string;
    startedAt: string;
    task: string;
  };
  roomLabel: string;
  sessionId: string;
  startedAt: string;
  startedAtLabel: string;
  taskLabel: string;
};

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function CleaningCompletionPanel({
  labels,
  roomLabel,
  sessionId,
  startedAt,
  startedAtLabel,
  taskLabel,
}: CleaningCompletionPanelProps) {
  const [elapsed, setElapsed] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelConfirming, setIsCancelConfirming] = useState(false);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const started = new Date(startedAt).getTime();

    function updateElapsed() {
      setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    }

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const elapsedLabel = formatElapsed(elapsed);

  return (
    <>
      <div
        className={
          isConfirming || isCancelConfirming
            ? "pointer-events-none opacity-0 transition-all duration-200"
            : "transition-all duration-300"
        }
      >
        <div className="mt-2 flex justify-center">
          <div className="relative flex size-64 flex-col items-center justify-center rounded-full border border-border bg-gradient-to-br from-white/45 to-white/20 shadow-[0_20px_40px_-18px_rgba(15,23,42,0.28),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-white/20 via-transparent to-white/45" />
            <p className="z-10 text-[11px] font-black uppercase tracking-[0.14em] text-primary/80">
              {labels.startedAt} {startedAtLabel}
            </p>
            <p className="z-10 mt-2 font-mono text-6xl font-black tracking-tight text-foreground">
              {elapsedLabel}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
            {labels.elapsed}
          </p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">{elapsedLabel}</p>
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-surface/32 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl">
          <Button
            className="h-12 w-full rounded-full border border-border bg-primary/90 font-black uppercase tracking-wide text-white shadow-[0_12px_30px_hsl(var(--primary-hsl)/0.32)] hover:bg-primary"
            onClick={() => setIsConfirming(true)}
            type="button"
          >
            <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
            {labels.completedToday}
          </Button>
          <Button
            className="h-10 w-full rounded-full text-xs font-semibold text-destructive/80 hover:text-destructive"
            onClick={() => setIsCancelConfirming(true)}
            type="button"
            variant="ghost"
          >
            <Ban className="mr-1.5 size-3.5" aria-hidden="true" />
            {labels.cancelCleaning}
          </Button>
        </div>
      </div>

      {isConfirming ? (
        <BottomSheet
          ariaLabel={labels.completionConfirmation}
          header={
            <>
              <div className="flex justify-center">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <CheckCircle2 className="size-6" aria-hidden="true" />
                </div>
              </div>

              <div className="mt-3 text-center">
                <h2 className="text-2xl font-black">
                  {labels.completionConfirmation}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{labels.reviewCompletion}</p>
              </div>
            </>
          }
          onClose={() => setIsConfirming(false)}
        >
          {({ close }) => (
            <>
              <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <div className="min-w-0">
                  <p className="text-lg font-black leading-tight">{labels.room} {roomLabel}</p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{taskLabel}</p>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Clock3 className="size-3.5" aria-hidden="true" />
                      {labels.startedAt}
                    </dt>
                    <dd className="mt-1 font-black">{startedAtLabel}</dd>
                  </div>
                  <div className="rounded-xl border border-border bg-surface p-3">
                    <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <Timer className="size-3.5" aria-hidden="true" />
                      {labels.elapsed}
                    </dt>
                    <dd className="mt-1 font-mono font-black text-primary">{elapsedLabel}</dd>
                  </div>
                </dl>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{labels.notesLabel}</span>
                <div className="relative">
                  <Edit3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder={labels.notesPlaceholder}
                    type="text"
                    value={notes}
                  />
                </div>
              </label>

              <form action={completeCleaningSession} className="mt-4 space-y-2">
                <input name="sessionId" type="hidden" value={sessionId} />
                <input name="notes" type="hidden" value={notes} />
                <SubmitButton autoFocus className="h-12 w-full rounded-xl bg-primary font-black text-white shadow-[0_10px_28px_hsl(var(--primary-hsl)/0.28)] hover:bg-primary/90">
                  {labels.confirmCompletion}
                </SubmitButton>
                <Button
                  className="h-12 w-full rounded-xl border border-border bg-surface font-bold"
                  onClick={close}
                  type="button"
                  variant="secondary"
                >
                  {labels.cancelCompletion}
                </Button>
              </form>
            </>
          )}
        </BottomSheet>
      ) : null}

      {isCancelConfirming ? (
        <BottomSheet
          ariaLabel={labels.cancelCleaningTitle}
          header={
            <>
              <div className="flex justify-center">
                <div className="flex size-12 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
                  <Ban className="size-6" aria-hidden="true" />
                </div>
              </div>

              <div className="mt-3 text-center">
                <h2 className="text-2xl font-black">
                  {labels.cancelCleaningTitle}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{labels.cancelCleaningMessage}</p>
              </div>
            </>
          }
          onClose={() => setIsCancelConfirming(false)}
        >
          {({ close }) => (
            <>
              <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                <div className="min-w-0">
                  <p className="text-lg font-black leading-tight">{labels.room} {roomLabel}</p>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{taskLabel}</p>
                </div>
                <div className="mt-3 rounded-xl border border-border bg-surface p-3">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    {labels.startedAt}
                  </dt>
                  <dd className="mt-1 font-black">{startedAtLabel}</dd>
                </div>
              </div>

              <form action={cancelCleaningSession} className="mt-4 space-y-2">
                <input name="sessionId" type="hidden" value={sessionId} />
                <Button
                  autoFocus
                  className="h-12 w-full rounded-xl bg-destructive font-black text-white hover:bg-destructive/90"
                  type="submit"
                >
                  {labels.confirmCancelCleaning}
                </Button>
                <Button
                  className="h-12 w-full rounded-xl border border-border bg-surface font-bold"
                  onClick={close}
                  type="button"
                  variant="secondary"
                >
                  {labels.cancelCompletion}
                </Button>
              </form>
            </>
          )}
        </BottomSheet>
      ) : null}
    </>
  );
}
