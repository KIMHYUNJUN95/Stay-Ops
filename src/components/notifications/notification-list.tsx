"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
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
    title: string;
    subtitle: string;
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

  const SWIPE_WIDTH = 76;
  const COMMIT_THRESHOLD = 40;

  const applyTransform = useCallback((x: number, animated: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 220ms cubic-bezier(0.32,0.72,0,1)" : "none";
    el.style.transform = `translateX(${x}px)`;
  }, []);

  useEffect(() => {
    if (!isOpen && currentOffsetRef.current !== 0) {
      currentOffsetRef.current = 0;
      applyTransform(0, true);
    }
  }, [isOpen, applyTransform]);

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
    const clamped = Math.max(-SWIPE_WIDTH, Math.min(6, base + dx));
    applyTransform(clamped, false);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!isDraggingRef.current || isSelectMode) return;
    isDraggingRef.current = false;
    const dx = e.changedTouches[0].clientX - startXRef.current;
    const base = isOpen ? -SWIPE_WIDTH : 0;

    if (base + dx < -COMMIT_THRESHOLD) {
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
    const target = isOpen ? -SWIPE_WIDTH : 0;
    currentOffsetRef.current = target;
    applyTransform(target, true);
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
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 15, marginBottom: 9 }}>
      {/* Delete button — solid, no gradient */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          background: "#ef4444",
          borderRadius: 15,
        }}
      >
        <button
          aria-label={swipeDeleteLabel}
          disabled={isPending}
          onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
          style={{
            width: SWIPE_WIDTH,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            color: "#fff",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "8px 0",
          }}
          type="button"
        >
          <Trash2 size={17} strokeWidth={2.1} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "-0.01em" }}>
            {swipeDeleteLabel}
          </span>
        </button>
      </div>

      {/* Swipeable content — touch handlers here, not on the .notif button */}
      <div
        ref={contentRef}
        onTouchCancel={handleTouchCancel}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onTouchStart={handleTouchStart}
        style={{ position: "relative", zIndex: 1, touchAction: "pan-y" }}
      >
        <button
          className={`notif${isUnread ? " unread" : ""}`}
          disabled={isPending}
          onClick={handleClick}
          style={{ marginBottom: 0, borderRadius: 15 }}
          type="button"
        >
          {/* Animated checkbox in select mode */}
          <span
            aria-hidden="true"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: isSelectMode ? 22 : 0,
              overflow: "hidden",
              flexShrink: 0,
              transition: "width 200ms cubic-bezier(0.32,0.72,0,1), margin-right 200ms cubic-bezier(0.32,0.72,0,1)",
              marginRight: isSelectMode ? 2 : 0,
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: isSelected ? "2px solid var(--primary)" : "2px solid var(--line)",
                background: isSelected ? "var(--primary)" : "var(--card)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "border-color 150ms, background 150ms",
              }}
            >
              {isSelected && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
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

// ── Main component ───────────────────────────────────────────────────────────
export function NotificationList({ items, locale, copy }: NotificationListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  // Optimistic "mark all read": clear every unread dot the instant the button is tapped, before the
  // server round-trip. useOptimistic re-bases on the fresh `items` after router.refresh(), so the
  // real (all-read) data seamlessly takes over. Same rows/styles — only the timing changes.
  const [displayItems, optimisticMarkAllRead] = useOptimistic<NotificationRow[], void>(
    items,
    (state) => state.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
  );

  const unreadCount = displayItems.filter((n) => !n.read_at).length;
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const anyPending = isPending || isDeleting;

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
    setSelectedIds(allSelected ? new Set() : new Set(items.map((n) => n.id)));
  }

  function handleOpen(notification: NotificationRow) {
    startTransition(async () => {
      if (!notification.read_at) await markNotificationAsRead(notification.id);
      router.push(notification.href);
    });
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      optimisticMarkAllRead();
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function handleDeleteOne(id: string) {
    startDeleteTransition(async () => {
      const result = await deleteNotifications([id]);
      if (result.ok) router.refresh();
    });
  }

  function handleDeleteSelected() {
    if (!selectedIds.size) return;
    const ids = Array.from(selectedIds);
    startDeleteTransition(async () => {
      const result = await deleteNotifications(ids);
      if (result.ok) {
        exitSelectMode();
        router.refresh();
      }
    });
  }

  if (items.length === 0) {
    return (
      <div className="sg">
        <div className="mb-4 space-y-1">
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-foreground">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>
        <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-10 text-center text-sm font-semibold text-muted-foreground">
          {copy.empty}
        </p>
      </div>
    );
  }

  return (
    <div className="sg">
      {/* 헤더 */}
      {isSelectMode ? (
        /* 선택모드: 타이틀 숨기고 버튼만 가로 나열 */
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <button
            className="text-xs font-bold text-primary disabled:opacity-50"
            disabled={anyPending}
            onClick={toggleSelectAll}
            type="button"
          >
            {allSelected ? copy.deselectAll : copy.selectAll}
          </button>
          <div className="flex items-center gap-3">
            <button
              className="text-xs font-bold disabled:opacity-40"
              disabled={anyPending || !selectedIds.size}
              onClick={handleDeleteSelected}
              style={{ color: selectedIds.size ? "#ef4444" : undefined }}
              type="button"
            >
              {copy.deleteSelected.replace("{count}", String(selectedIds.size))}
            </button>
            <button
              className="text-xs font-semibold text-foreground disabled:opacity-50"
              disabled={anyPending}
              onClick={exitSelectMode}
              type="button"
            >
              {copy.cancelSelect}
            </button>
          </div>
        </div>
      ) : (
        /* 일반모드: 타이틀(좌) + 액션 버튼(우) */
        <div className="mb-3 flex items-start justify-between gap-3 px-1">
          <div className="space-y-1">
            <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-foreground">{copy.title}</h1>
            <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>
          <div className="flex items-center gap-3 pt-1">
            {unreadCount > 0 && (
              <button
                className="text-xs font-bold text-primary disabled:opacity-50"
                disabled={anyPending}
                onClick={handleMarkAllRead}
                type="button"
              >
                {copy.markAllRead}
              </button>
            )}
            <button
              className="text-xs font-bold disabled:opacity-50"
              disabled={anyPending}
              onClick={enterSelectMode}
              style={{ color: "#ef4444" }}
              type="button"
            >
              {copy.deleteMode}
            </button>
          </div>
        </div>
      )}

      {/* Notification rows */}
      {displayItems.map((notification) => (
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
