"use client";

import { useMemo, useState } from "react";
import { Clock3, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ConfirmationLabels = {
  cancelConfirm: string;
  confirmSubmit: string;
  confirmationTitle: string;
  reportTime: string;
  reservationSuggestion: string;
  reservationUnavailable: string;
  reviewHint: string;
  room: string;
};

type SummaryField = {
  label: string;
  value: string;
};

type CleaningLinkedConfirmationSheetProps = {
  action: (formData: FormData) => void;
  bodyPreview?: string | null;
  bodyPreviewLabel?: string;
  hiddenFields: Array<{ name: string; value: string }>;
  labels: ConfirmationLabels;
  onBeforeOpen?: () => boolean;
  primaryActionLabel: string;
  summaryFields: SummaryField[];
};

function getReportTimeLabel() {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function getSummaryFieldKey(item: SummaryField) {
  return `${item.label}-${item.value}`;
}

export function CleaningLinkedConfirmationSheet({
  action,
  bodyPreview,
  bodyPreviewLabel,
  hiddenFields,
  labels,
  onBeforeOpen,
  primaryActionLabel,
  summaryFields,
}: CleaningLinkedConfirmationSheetProps) {
  const [open, setOpen] = useState(false);
  const reportTime = useMemo(() => getReportTimeLabel(), []);

  function handleOpen() {
    if (onBeforeOpen && !onBeforeOpen()) return;
    setOpen(true);
  }

  return (
    <>
      <Button
        className="h-12 w-full rounded-xl font-black"
        onClick={handleOpen}
        type="button"
      >
        {primaryActionLabel}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md rounded-3xl border border-white/70 bg-background/96 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                  {labels.reportTime}
                </p>
                <h3 className="mt-1 text-xl font-black">{labels.confirmationTitle}</h3>
              </div>
              <button
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="size-4" aria-hidden="true" />
                <span className="sr-only">{labels.cancelConfirm}</span>
              </button>
            </div>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {labels.reviewHint}
            </p>

            <div className="mt-3 space-y-2 rounded-2xl border border-border bg-background/80 p-3">
              {summaryFields.map((item) => (
                <div
                  className="flex items-start justify-between gap-3 text-sm"
                  key={getSummaryFieldKey(item)}
                >
                  <span className="font-semibold text-muted-foreground">
                    {item.label}
                  </span>
                  <span className="text-right font-semibold">{item.value}</span>
                </div>
              ))}
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="font-semibold text-muted-foreground">
                  {labels.reportTime}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold">
                  <Clock3 className="size-3.5" aria-hidden="true" />
                  {reportTime}
                </span>
              </div>
            </div>

            {bodyPreviewLabel && bodyPreview ? (
              <div className="mt-3 rounded-2xl border border-border bg-background/80 p-3">
                <p className="text-sm font-semibold text-muted-foreground">
                  {bodyPreviewLabel}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">
                  {bodyPreview}
                </p>
              </div>
            ) : null}

            <div className="mt-3 rounded-2xl border border-border bg-background/80 p-3">
              <p className="text-sm font-semibold text-muted-foreground">
                {labels.reservationSuggestion}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {labels.reservationUnavailable}
              </p>
            </div>

            <form action={action} className="mt-4 space-y-2">
              {hiddenFields.map((field) => (
                <input
                  key={`${field.name}-${field.value}`}
                  name={field.name}
                  type="hidden"
                  value={field.value}
                />
              ))}
              <Button className="h-12 w-full rounded-xl font-black" type="submit">
                {labels.confirmSubmit}
              </Button>
              <Button
                className="h-12 w-full rounded-xl"
                onClick={() => setOpen(false)}
                type="button"
                variant="secondary"
              >
                {labels.cancelConfirm}
              </Button>
            </form>
          </Card>
        </div>
      ) : null}
    </>
  );
}
