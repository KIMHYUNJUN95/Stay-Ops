"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteOrganization } from "@/app/admin/settings/actions";

type OrgDeleteButtonProps = {
  organizationId: string;
  labels: { delete: string; cancel: string; confirm: string };
};

/**
 * Organization delete control (developer-only page). Inline confirm before submitting the
 * `deleteOrganization` server action. The action itself only allows deleting an EMPTY org (no members)
 * because every org-scoped table cascades on delete — this button just gates the destructive submit.
 */
export function OrgDeleteButton({ organizationId, labels }: OrgDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-destructive">{labels.confirm}</span>
        <Button
          className="h-9 px-3 text-sm"
          type="button"
          variant="secondary"
          onClick={() => setConfirming(false)}
        >
          {labels.cancel}
        </Button>
        <form action={deleteOrganization}>
          <input name="organizationId" type="hidden" value={organizationId} />
          <Button className="h-9 px-3 text-sm" type="submit" variant="destructive">
            <Trash2 className="mr-1.5 size-4" />
            {labels.delete}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <Button
      className="h-9 px-3 text-sm"
      type="button"
      variant="destructive"
      onClick={() => setConfirming(true)}
    >
      <Trash2 className="mr-1.5 size-4" />
      {labels.delete}
    </Button>
  );
}
