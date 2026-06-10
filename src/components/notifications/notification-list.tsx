"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronRight } from "lucide-react";
import {
  markAllNotificationsRead,
  markNotificationAsRead,
} from "@/app/mobile/notifications/actions";
import { formatNotificationTimestamp, getNotificationDisplay } from "@/lib/notifications/display";
import type { NotificationRow } from "@/lib/notifications/types";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type NotificationListProps = {
  items: NotificationRow[];
  locale: Locale;
  copy: {
    markAllRead: string;
    empty: string;
    unread: string;
    openDetail: string;
  };
};

export function NotificationList({ items, locale, copy }: NotificationListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const unreadCount = items.filter((item) => !item.read_at).length;

  const handleOpen = (notification: NotificationRow) => {
    startTransition(async () => {
      if (!notification.read_at) {
        await markNotificationAsRead(notification.id);
      }
      router.push(notification.href);
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm font-semibold text-muted-foreground">
        {copy.empty}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {unreadCount > 0 ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <p className="text-xs font-bold text-muted-foreground">
            {copy.unread.replace("{count}", String(unreadCount))}
          </p>
          <button
            className="text-xs font-bold text-primary disabled:opacity-50"
            disabled={isPending}
            onClick={handleMarkAllRead}
            type="button"
          >
            {copy.markAllRead}
          </button>
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((notification) => {
          const display = getNotificationDisplay(notification, locale);
          const isUnread = !notification.read_at;

          return (
            <li key={notification.id}>
              <button
                className={cn(
                  "flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
                  isUnread
                    ? "border-primary/20 bg-primary/[0.06] shadow-[0_10px_24px_-22px_hsl(var(--primary-hsl)/0.4)]"
                    : "border-border bg-surface hover:bg-muted/30",
                )}
                disabled={isPending}
                onClick={() => handleOpen(notification)}
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                      {display.kindLabel}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                        isUnread
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-border bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {display.statusLabel}
                    </span>
                    {isUnread ? (
                      <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-black text-foreground">{display.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs font-medium text-slate-600">
                    {display.body}
                  </p>
                  {display.locationLabel ? (
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {display.locationLabel}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] font-semibold text-slate-400">
                    {formatNotificationTimestamp(notification.created_at, locale)}
                  </p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <p className="sr-only">{copy.openDetail}</p>
    </div>
  );
}
