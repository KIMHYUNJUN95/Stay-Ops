"use client";

import { useState } from "react";
import type { deleteAnnouncement } from "@/app/admin/announcements/actions";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { BottomSheet } from "@/components/shell/bottom-sheet";

type DeleteAnnouncementButtonProps = {
  action: typeof deleteAnnouncement;
  announcementId: string;
  cancelLabel: string;
  confirmBody: string;
  confirmTitle: string;
  deleteLabel: string;
};

export function DeleteAnnouncementButton({
  action,
  announcementId,
  cancelLabel,
  confirmBody,
  confirmTitle,
  deleteLabel,
}: DeleteAnnouncementButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className="w-full" onClick={() => setOpen(true)} type="button" variant="ghost">
        {deleteLabel}
      </Button>

      {open ? (
        <BottomSheet
          ariaLabel={confirmTitle}
          header={<h2 className="text-lg font-black">{confirmTitle}</h2>}
          onClose={() => setOpen(false)}
        >
          {({ close }) => (
            <>
              <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
                {confirmBody}
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <Button onClick={close} type="button" variant="ghost">
                  {cancelLabel}
                </Button>
                <form action={action}>
                  <input name="announcementId" type="hidden" value={announcementId} />
                  <SubmitButton>{deleteLabel}</SubmitButton>
                </form>
              </div>
            </>
          )}
        </BottomSheet>
      ) : null}
    </>
  );
}
