"use client";

import { useState } from "react";
import { Users, X } from "lucide-react";
import type { AnnouncementReadSummary, AnnouncementReadUser } from "@/lib/announcements";
import type { Locale } from "@/lib/i18n";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import { Button } from "@/components/ui/button";

type AnnouncementReadStatusPanelProps = {
  locale: Locale;
  summary: AnnouncementReadSummary;
};

type ModalKind = "read" | "unread" | null;

function formatDate(value: string | null, locale: Locale) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function UserList({
  copy,
  locale,
  showReadAt,
  users,
}: {
  copy: ReturnType<typeof getAnnouncementDictionary>;
  locale: Locale;
  showReadAt: boolean;
  users: AnnouncementReadUser[];
}) {
  if (users.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-background/40 px-4 py-5 text-sm font-semibold text-muted-foreground">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Users className="size-4" aria-hidden="true" />
        </div>
        <span className="leading-6">{copy.noMembers}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div
          className="rounded-lg border border-border/80 bg-background/60 p-4"
          key={user.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-black text-foreground">
                {user.name}
              </p>
              <p className="mt-1 text-xs font-semibold text-muted-foreground">
                {copy.targetRoles[user.role]}
              </p>
            </div>
            {showReadAt && user.readAt && (
              <p className="shrink-0 text-right text-xs font-semibold text-muted-foreground">
                {formatDate(user.readAt, locale)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnnouncementReadStatusPanel({
  locale,
  summary,
}: AnnouncementReadStatusPanelProps) {
  const [open, setOpen] = useState<ModalKind>(null);
  const copy = getAnnouncementDictionary(locale);
  const modalTitle = open === "read" ? copy.readers : copy.unreadMembers;
  const users = open === "read" ? summary.readers : summary.unreadUsers;

  return (
    <>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <button
          className="rounded-lg border border-border/80 bg-background/60 p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-background/80"
          onClick={() => setOpen("read")}
          type="button"
        >
          <p className="text-xs font-black uppercase text-muted-foreground">
            {copy.readCount}
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-primary">{summary.readCount}</p>
            <span className="text-xs font-semibold text-primary/80">
              {copy.openList}
            </span>
          </div>
        </button>
        <button
          className="rounded-lg border border-border/80 bg-background/60 p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-background/80"
          onClick={() => setOpen("unread")}
          type="button"
        >
          <p className="text-xs font-black uppercase text-muted-foreground">
            {copy.unreadCount}
          </p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-3xl font-black text-foreground">
              {summary.unreadCount}
            </p>
            <span className="text-xs font-semibold text-primary/80">
              {copy.openList}
            </span>
          </div>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5 py-8 backdrop-blur-sm">
          <section className="max-h-[calc(100dvh-4rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-5 text-foreground shadow-glass">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase text-muted-foreground">
                    {copy.readSummary}
                  </p>
                  <h2 className="mt-1 text-xl font-black">{modalTitle}</h2>
                </div>
              </div>
              <button
                className="flex size-10 items-center justify-center rounded-lg border border-border bg-surface/80 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setOpen(null)}
                type="button"
              >
                <X className="size-5" aria-hidden="true" />
                <span className="sr-only">{copy.close}</span>
              </button>
            </div>

            <div className="mt-6 max-h-[60vh] overflow-y-auto pr-1">
              <UserList
                copy={copy}
                locale={locale}
                showReadAt={open === "read"}
                users={users}
              />
            </div>

            <div className="mt-6 flex justify-end">
              <Button onClick={() => setOpen(null)} type="button" variant="ghost">
                {copy.close}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
