"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
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
      <div className="setnote setnote--warn" style={{ flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 160 }}>{labels.confirm}</span>
        <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(false)} type="button">
          {labels.cancel}
        </button>
        <form action={deleteOrganization}>
          <input name="organizationId" type="hidden" value={organizationId} />
          <button className="btn btn--danger btn--sm" type="submit">
            <span className="ic">
              <Trash2 aria-hidden="true" />
            </span>
            {labels.delete}
          </button>
        </form>
      </div>
    );
  }

  return (
    <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(true)} type="button">
      <span className="ic">
        <Trash2 aria-hidden="true" />
      </span>
      {labels.delete}
    </button>
  );
}
