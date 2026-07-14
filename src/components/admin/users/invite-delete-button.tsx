"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteInviteCode } from "@/app/admin/settings/actions";

type InviteDeleteButtonProps = {
  inviteCodeId: string;
  organizationId: string;
  labels: { delete: string; cancel: string; confirm: string };
};

/**
 * Invite-code delete control. Mirrors the users-console `.ovconfirm` inline confirm pattern (same as
 * the guarded member delete): a destructive button that expands into a confirm strip before submitting
 * the `deleteInviteCode` server action. Hard delete — members who already joined keep their memberships.
 */
export function InviteDeleteButton({
  inviteCodeId,
  organizationId,
  labels,
}: InviteDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="ovconfirm">
        <span className="ovconfirm__t">{labels.confirm}</span>
        <div className="ovconfirm__act">
          <button
            type="button"
            className="ui-btn ui-btn--secondary ui-btn--sm"
            onClick={() => setConfirming(false)}
          >
            {labels.cancel}
          </button>
          <form action={deleteInviteCode}>
            <input name="inviteCodeId" type="hidden" value={inviteCodeId} />
            <input name="organizationId" type="hidden" value={organizationId} />
            <button type="submit" className="ui-btn ui-btn--destructive ui-btn--sm">
              <span className="ic">
                <Trash2 />
              </span>
              {labels.delete}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="ui-btn ui-btn--destructive ui-btn--sm"
      onClick={() => setConfirming(true)}
    >
      <span className="ic">
        <Trash2 />
      </span>
      {labels.delete}
    </button>
  );
}
