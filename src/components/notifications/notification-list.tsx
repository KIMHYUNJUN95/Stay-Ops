"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import {
  deleteNotifications,
  markAllNotificationsRead,
  markNotificationAsRead,
} from "@/app/mobile/notifications/actions";
import { SgIcon } from "@/components/suggestions/sg-icons";
import { formatNotificationTimestamp, getNotificationDisplay } from "@/lib/notifications/display";
import type { NotificationRow, NotificationType } from "@/lib/notifications/types";
import type { Locale } from "@/lib/i18n";
import "@/components/suggestions/suggestions.css";

type NotificationListProps = {
  items: NotificationRow[];
  locale: Locale;
  copy: {
    markAllRead: string;
    empty: string;
    unread: string;
    openDetail: string;
    deleteMode: string;
    cancelSelect: string;
    selectAll: string;
    deselectAll: string;
    deleteSelected: string;
    swipeDeleteBtn: string;
  };
};

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
    case "announcement_activity":
      return SgIcon.info;
    default:
      return SgIcon.bell;
  }
}

// ── Swipe-to-delete row ──────────────────────────────────────────────────────
type SwipeItemProps = {
  notification: NotificationRow;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onOpen: (n: NotificationRow) => void;
  onDelete: (id: string) => void;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  locale: Locale;
  swipeDeleteLabel: string;
  isPending: boolean;
};

function SwipeItem({
  notification,
  isSelectMode,
  isSelected,
  onToggle,
  onOpen,
  onDelete,
  openSwipeId,
  setOpenSwipeId,
  locale,
  swipeDeleteLabel,
  isPending,
}: SwipeItemProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const currentOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isOpen = openSwipeId === notification.id;

  const SWIPE_WIDTH = 80;
  const COMMIT_THRESHOLD = 44;

  const applyTransform = useCallback((x: number, animated: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 220ms cubic-bezier(0.32,0.72,0,1)" : "none";
    el.style.transform = `translateX(${x}px)`;
  }, []);

  // Sync open/closed state when openSwipeId changes (another row opened → close this one)
  useEffect(() => {
    if (!isOpen && currentOffsetRef.current !== 0) {
      currentOffsetRef.current = 0;
      applyTransform(0, true);
    }
  }, [isOpen, applyTransform]);

  // Close swipe when entering select mode
  useEffect(() => {
    if (isSelectMode && currentOffsetRef.current !== 0) {
      currentOffsetRef.current = 0;
      applyTransform(0, true);
    }
  }, [isSelectMode, applyTransform]);

  function handleTouchStart(e: React.TouchEvent) {
    if (isSelectMode) return;
    startXRef.current = e.touches[0].clientX;
    isDraggingRef.current = true;
    applyTransform(currentOffsetRef.current, false);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDraggingRef.current || isSelectMode) return;
    const dx = e.touches[0].clientX - startXRef.current;
    const base = isOpen ? -SWIPE_WIDTH : 0;
    const raw = base + dx;
    const clamped = Math.max(-SWIPE_WIDTH, Math.min(8, raw));
    applyTransform(clamped, false);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!isDraggingRef.current || isSelectMode) return;
    isDraggingRef.current = false;
    const dx = e.changedTouches[0].clientX - startXRef.current;
    const base = isOpen ? -SWIPE_WIDTH : 0;
    const finalOffset = base + dx;

    if (finalOffset < -COMMIT_THRESHOLD) {
      currentOffsetRef.current = -SWIPE_WIDTH;
      applyTransform(-SWIPE_WIDTH, true);
      setOpenSwipeId(notification.id);
    } else {
      currentOffsetRef.current = 0;
      applyTransform(0, true);
      setOpenSwipeId(null);
    }
  }

  function handleTouchCancel() {
    isDraggingRef.current = false;
    if (isOpen) {
      currentOffsetRef.current = -SWIPE_WIDTH;
      applyTransform(-SWIPE_WIDTH, true);
    } else {
      currentOffsetRef.current = 0;
      applyTransform(0, true);
    }
  }

  function handleClick() {
    if (isSelectMode) {
      onToggle(notification.id);
      return;
    }
    if (isOpen) {
      setOpenSwipeId(null);
      currentOffsetRef.current = 0;
      applyTransform(0, true);
      return;
    }
    onOpen(notification);
  }

  const display = getNotificationDisplay(notification, locale);
  const isUnread = !notification.read_at;

  return (
    <div
      className="notif-swipe-row"
      style={{ position: "relative", overflow: "hidden", borderRadius: "16px", marginBottom: "6px" }}
    >
      {/* Delete button behind the row */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          background: "linear-gradient(90deg, transparent 0%, #ef4444 40%)",
          borderRadius: "16px",
          paddingRight: "12px",
        }}
      >
        <button
          aria-label={swipeDeleteLabel}
          className="flex flex-col items-center gap-0.5"
          disabled={isPending}
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
          style={{
            color: "#fff",
            width: 56,
            padding: "6px 0",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
          type="button"
        >
          <Trash2 size={18} strokeWidth={2} />
          <span style={{ fontSize: 11, fontWeight: 700 }}>{swipeDeleteLabel}</span>
        </button>
      </div>

      {/* Swipeable content */}
      <div
        ref={contentRef}
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        style={{ position: "relative", zIndex: 1, touchAction: "pan-y", willChange: "transform" }}
      >
        <button
          className={`notif${isUnread ? " unread" : ""}${isSelected ? " notif--selected" : ""}`}
          disabled={isPending}
          onClick={handleClick}
          style={{
            width: "100%",
            textAlign: "left",
            borderRadius: "16px",
            background: isSelected
              ? "color-mix(in srgb, var(--primary) 10%, var(--surface))"
              : undefined,
            transition: "background 160ms ease",
          }}
          type="button"
        >
          {/* Checkbox area */}
          <span
            aria-hidden="true"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: isSelectMode ? 24 : 0,
              overflow: "hidden",
              flexShrink: 0,
              transition: "width 200ms cubic-bezier(0.32,0.72,0,1)",
              marginRight: isSelectMode ? 10 : 0,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: isSelected
                  ? "2px solid var(--primary)"
                  : "2px solid var(--border)",
                background: isSelected ? "var(--primary)" : "var(--surface)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "border-color 160ms, background 160ms",
              }}
            >
              {isSelected ? (
                <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                  <path d="M1.5 4.5L4 7L9.5 1.5" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
          </span>

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
          {isUnread && !isSelectMode ? <span className="notif__dot" /> : null}
        </button>
      </div>
    </div>
  );
}

// ── Main list component ──────────────────────────────────────────────────────
export function NotificationList({ items, locale, copy }: NotificationListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  const unreadCount = items.filter((n) => !n.read_at).length;
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  function enterSelectMode() {
    setOpenSwipeId(null);
    setSelectedIds(new Set());
    setIsSelectMode(true);
  }

  function exitSelectMode() {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((n) => n.id)));
    }
  }

  function handleOpen(notification: NotificationRow) {
    startTransition(async () => {
      if (!notification.read_at) {
        await markNotificationAsRead(notification.id);
      }
      router.push(notification.href);
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function handleDeleteOne(id: string) {
    startDeleteTransition(async () => {
      await deleteNotifications([id]);
      router.refresh();
    });
  }

  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    startDeleteTransition(async () => {
      await deleteNotifications(ids);
      exitSelectMode();
      router.refresh();
    });
  }

  const anyPending = isPending || isDeleting;

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
      {/* ── Top action bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
          minHeight: 32,
        }}
      >
        {isSelectMode ? (
          <>
            {/* Select mode left: count */}
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--muted-foreground)" }}>
              {selectedIds.size > 0
                ? copy.deleteSelected.replace("{count}", String(selectedIds.size))
                : copy.selectAll}
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {/* Select all toggle */}
              <button
                disabled={anyPending}
                onClick={toggleSelectAll}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--primary)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
                type="button"
              >
                {allSelected ? copy.deselectAll : copy.selectAll}
              </button>
              {/* Delete selected */}
              <button
                disabled={anyPending || selectedIds.size === 0}
                onClick={handleDeleteSelected}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: selectedIds.size > 0 ? "#ef4444" : "var(--muted-foreground)",
                  background: "none",
                  border: "none",
                  cursor: selectedIds.size > 0 ? "pointer" : "default",
                  padding: "4px 0",
                  transition: "color 160ms",
                }}
                type="button"
              >
                {copy.deleteSelected.replace("{count}", String(selectedIds.size))}
              </button>
              {/* Cancel */}
              <button
                disabled={anyPending}
                onClick={exitSelectMode}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
                type="button"
              >
                {copy.cancelSelect}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Normal mode left: unread count */}
            {unreadCount > 0 ? (
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground)" }}>
                {copy.unread.replace("{count}", String(unreadCount))}
              </p>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {unreadCount > 0 ? (
                <button
                  className="text-xs font-bold text-primary disabled:opacity-50"
                  disabled={anyPending}
                  onClick={handleMarkAllRead}
                  type="button"
                >
                  {copy.markAllRead}
                </button>
              ) : null}
              <button
                disabled={anyPending}
                onClick={enterSelectMode}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#ef4444",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
                type="button"
              >
                {copy.deleteMode}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Notification rows ── */}
      {items.map((notification) => (
        <SwipeItem
          key={notification.id}
          isPending={anyPending}
          isSelectMode={isSelectMode}
          isSelected={selectedIds.has(notification.id)}
          locale={locale}
          notification={notification}
          onDelete={handleDeleteOne}
          onOpen={handleOpen}
          onToggle={toggleSelect}
          openSwipeId={openSwipeId}
          setOpenSwipeId={setOpenSwipeId}
          swipeDeleteLabel={copy.swipeDeleteBtn}
        />
      ))}

      {!isSelectMode && (
        <div className="flowhint">
          <span className="ic">{SgIcon.info}</span>
          {copy.openDetail}
        </div>
      )}
    </div>
  );
}
