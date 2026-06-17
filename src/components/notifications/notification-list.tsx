"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ReactNode } from "react";
import {
  markAllNotificationsRead,
  markNotificationAsRead,
} from "@/app/mobile/notifications/actions";
import { SgIcon } from "@/components/suggestions/sg-icons";
import { formatNotificationTimestamp, getNotificationDisplay } from "@/lib/notifications/display";
import type { NotificationRow, NotificationType } from "@/lib/notifications/types";
import type { Locale } from "@/lib/i18n";
// Notifications screen styled to match the Feedback Box "frame 9" handoff design
// (`.sg .notif` rows + flow hint). Data and behavior (read-state, deep-link) are
// unchanged — only the visual layer was swapped.
import "@/components/suggestions/suggestions.css";

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

// Icon per notification type, echoing the design's per-event icons.
function notifIcon(type: NotificationType): ReactNode {
  switch (type) {
    case "order_processed":
      return SgIcon.inbox;
    case "task_shared":
    case "project_shared":
      return SgIcon.eye;
    case "task_completed":
      return SgIcon.check;
    case "task_updated":
      return SgIcon.comment;
    case "task_due_soon":
    case "task_overdue":
      return SgIcon.flag;
    default:
      return SgIcon.bell;
  }
}

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
      <div className="sg">
        <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm font-semibold text-muted-foreground">
          {copy.empty}
        </p>
      </div>
    );
  }

  return (
    <div className="sg">
      {unreadCount > 0 ? (
        <div className="mb-2.5 flex items-center justify-between gap-3 px-1">
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

      {items.map((notification) => {
        const display = getNotificationDisplay(notification, locale);
        const isUnread = !notification.read_at;

        return (
          <button
            key={notification.id}
            className={`notif${isUnread ? " unread" : ""}`}
            disabled={isPending}
            onClick={() => handleOpen(notification)}
            type="button"
          >
            <span className="notif__ic">{notifIcon(notification.type)}</span>
            <div className="notif__b">
              <div className="notif__t">
                <b>{display.title}</b>
                {display.body ? ` — ${display.body}` : ""}
              </div>
              {display.locationLabel ? (
                <div className="notif__time">{display.locationLabel}</div>
              ) : null}
              <div className="notif__time">
                {formatNotificationTimestamp(notification.created_at, locale)}
              </div>
            </div>
            {isUnread ? <span className="notif__dot" /> : null}
          </button>
        );
      })}

      <div className="flowhint">
        <span className="ic">{SgIcon.info}</span>
        {copy.openDetail}
      </div>
    </div>
  );
}
