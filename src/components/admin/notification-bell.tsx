"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  getAdminNotifications,
  markAllAdminNotificationsRead,
  type AdminNotifData,
} from "@/app/admin/notification-actions";

/**
 * Admin console notification bell — a dropdown popover anchored to the bell
 * (NOT a navigation to the mobile notifications page). Fetches recent
 * notifications + true unread count, supports "mark all read", and links to
 * the full notification center. See docs/product/05-admin-web-ia.md → "Notification Center".
 */
export function NotificationBell({
  labels,
}: {
  labels: { title: string; markAll: string; viewAll: string; empty: string };
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AdminNotifData>({ unread: 0, items: [] });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getAdminNotifications()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAll() {
    await markAllAdminNotificationsRead();
    const fresh = await getAdminNotifications().catch(() => null);
    if (fresh) setData(fresh);
  }

  return (
    <div className="bellwrap" ref={wrapRef}>
      <button type="button" className="tbtn" aria-label={labels.title} onClick={() => setOpen((v) => !v)}>
        <span className="ic"><Bell /></span>
        {data.unread > 0 && <span className="dot">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>

      {open && (
        <div className="pop" role="dialog" aria-label={labels.title}>
          <div className="pop__h">
            <span className="t">{labels.title}</span>
            {data.unread > 0 && <span className="cnt">{data.unread}</span>}
            <button type="button" className="a" onClick={markAll}>{labels.markAll}</button>
          </div>

          {data.items.length === 0 ? (
            <div className="pop__empty">{labels.empty}</div>
          ) : (
            <div className="pop__list">
              {data.items.map((n) => (
                <Link
                  key={n.id}
                  href={n.href ?? "/notifications"}
                  className="notif"
                  onClick={() => setOpen(false)}
                >
                  <span className="notif__dot" style={{ background: n.read ? "var(--surface)" : "var(--primary)" }} />
                  <div className="notif__b">
                    <div className="notif__t">{n.title}</div>
                    {n.body ? <div className="notif__s">{n.body}</div> : null}
                    <div className="notif__time">{n.timeLabel}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="pop__foot">
            <Link href="/notifications" onClick={() => setOpen(false)}>{labels.viewAll}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
