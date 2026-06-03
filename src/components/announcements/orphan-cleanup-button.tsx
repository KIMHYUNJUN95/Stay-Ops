"use client";

import { useState, useTransition } from "react";
import {
  purgeOrphanAnnouncementImages,
  type OrphanCleanupResult,
} from "@/app/admin/announcements/orphan-cleanup-actions";
import { Button } from "@/components/ui/button";

type Labels = {
  button: string;
  running: string;
  failed: string;
  deleted: string;
  skippedGrace: string;
  skippedReferenced: string;
  errors: string;
  listingFailures: string;
};

export function OrphanCleanupButton({ labels }: { labels: Labels }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<OrphanCleanupResult | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const r = await purgeOrphanAnnouncementImages();
      setResult(r);
    });
  }

  return (
    <div className="grid gap-3">
      <Button
        className="self-start"
        disabled={isPending}
        onClick={handleClick}
        type="button"
        variant="secondary"
      >
        {isPending ? labels.running : labels.button}
      </Button>
      {result !== null && (
        <div className="grid gap-2">
          {!result.ok && (
            <div
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-bold text-destructive"
              role="alert"
            >
              <p>{labels.failed}</p>
              {result.errorMessage && (
                <p className="mt-1 font-semibold">{result.errorMessage}</p>
              )}
            </div>
          )}
          <dl className="grid gap-1 text-xs font-semibold">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{labels.deleted}</dt>
              <dd>{result.deleted}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{labels.skippedGrace}</dt>
              <dd>{result.skippedGrace}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{labels.skippedReferenced}</dt>
              <dd>{result.skippedReferenced}</dd>
            </div>
            {result.listingFailures > 0 && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{labels.listingFailures}</dt>
                <dd className="text-destructive">{result.listingFailures}</dd>
              </div>
            )}
            {result.errors > 0 && (
              <div className="flex gap-2">
                <dt className="text-muted-foreground">{labels.errors}</dt>
                <dd className="text-destructive">{result.errors}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </div>
  );
}
