"use client";

import { useState } from "react";
import type { deleteAnnouncement } from "@/app/admin/announcements/actions";
import { Button } from "@/components/ui/button";

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

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 py-8 backdrop-blur-sm">
          <section className="w-full max-w-md rounded-lg border border-border bg-background p-5 text-foreground shadow-glass">
            <h2 className="text-lg font-black">{confirmTitle}</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
              {confirmBody}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <Button onClick={() => setOpen(false)} type="button" variant="ghost">
                {cancelLabel}
              </Button>
              <form action={action}>
                <input name="announcementId" type="hidden" value={announcementId} />
                <Button type="submit">{deleteLabel}</Button>
              </form>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
