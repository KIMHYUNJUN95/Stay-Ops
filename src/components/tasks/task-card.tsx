"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  Clock,
  Flag,
  ImageIcon,
  Repeat2,
  Share2,
  Sun,
} from "lucide-react";
import { completeTask, moveTaskToToday } from "@/app/mobile/tasks/[id]/actions";
import type { Dictionary } from "@/lib/i18n";
import type { TaskRecord } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];

function tokyoDateOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function repeatLabel(rule: string, copy: Copy): string {
  const map: Record<string, string> = {
    daily: copy.repeatDaily,
    weekly: copy.repeatWeekly,
    monthly: copy.repeatMonthly,
    weekdays: copy.repeatWeekdays,
    weekends: copy.repeatWeekends,
    custom: copy.repeatCustom,
  };
  return map[rule] ?? rule;
}

function shareSummary(task: TaskRecord, currentUserId: string): string | null {
  if (!task.isShared) return null;
  const others = task.participants
    .filter((p) => p.userId !== currentUserId)
    .map((p) => p.name)
    .filter(Boolean);
  if (others.length === 0) return null;
  return others.length === 1 ? others[0] : `${others[0]} +${others.length - 1}`;
}

const PRIO_RING: Record<string, string> = {
  urgent: "border-rose-500 text-rose-500",
  important: "border-amber-500 text-amber-500",
  normal: "border-slate-300 text-slate-300",
};


export function TaskCard({
  copy,
  currentUserId,
  task,
  today,
  showDate = true,
  swipe = true,
  sentMode = false,
  onQuickComplete,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onLongPress,
  showMoveToday = true,
}: {
  copy: Copy;
  currentUserId: string;
  task: TaskRecord;
  today: string;
  showDate?: boolean;
  swipe?: boolean;
  sentMode?: boolean;
  // When provided, completing from the list is handled client-side (optimistic hide + undo
  // snackbar) instead of the redirecting server-action form. Falls back to the form if absent.
  onQuickComplete?: (task: TaskRecord) => void;
  // Multi-select: in select mode tapping toggles selection (instead of navigating) and a
  // checkbox replaces the complete circle. Long-press (outside select mode) opens the context menu.
  selectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (task: TaskRecord) => void;
  onLongPress?: (task: TaskRecord) => void;
  // "Move to today" swipe action. Hidden in the Today view (where it's redundant); shown elsewhere.
  showMoveToday?: boolean;
}) {
  const router = useRouter();
  const done = task.status === "completed";
  const selected = selectMode && !!selectedIds?.has(task.id);
  const dueDate = tokyoDateOf(task.dueAt);
  const overdue = !done && !!dueDate && dueDate < today;

  // Hide "Move to today" in the Today view; the swipe track shrinks to just the Complete action.
  const showToday = showMoveToday;
  const swipeOpen = showToday ? 138 : 74;
  const swipeSnap = swipeOpen / 2;

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [pressed, setPressed] = useState(false); // "press-down" scale while held
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const axis = useRef<null | "h" | "v">(null); // direction lock so taps/scrolls don't open swipe
  const didSwipe = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Tapping anywhere outside an opened card closes its swipe naturally.
  useEffect(() => {
    if (offset === 0) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOffset(0);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [offset]);

  const canSwipe = swipe && !done && !selectMode;

  // Long-press → context menu. A 480ms hold with little movement fires; a drag/scroll cancels it.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef({ x: 0, y: 0 });
  const longFired = useRef(false);
  function startPress(x: number, y: number) {
    if (!onLongPress || selectMode) return;
    longFired.current = false;
    pressStart.current = { x, y };
    pressTimer.current = setTimeout(() => {
      longFired.current = true;
      setOffset(0); // close any open swipe so the menu opens over a clean card
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
      onLongPress(task);
    }, 480);
  }
  function movePress(x: number, y: number) {
    if (!pressTimer.current) return;
    if (Math.abs(x - pressStart.current.x) > 8 || Math.abs(y - pressStart.current.y) > 8) {
      cancelPress();
    }
  }
  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    pressStart.current = { x, y };
    setPressed(true);
    startPress(x, y);
    if (!canSwipe) return;
    startX.current = x;
    startY.current = y;
    axis.current = null;
    didSwipe.current = false;
    dragging.current = true;
    setIsDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const dx = x - pressStart.current.x;
    const dy = y - pressStart.current.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) setPressed(false);
    movePress(x, y);
    if (!dragging.current) return;
    // Lock to an axis only once the finger has clearly moved — a tap or a vertical scroll
    // must never reveal the swipe actions.
    if (axis.current === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (axis.current !== "h") return;
    didSwipe.current = true;
    const sdx = x - startX.current;
    // Track the finger 1:1 up to fully-open, then add elastic resistance past it for a premium pull.
    const next =
      sdx >= 0
        ? 0
        : sdx < -swipeOpen
          ? -swipeOpen + (sdx + swipeOpen) * 0.18
          : sdx;
    setOffset(next);
  }
  function onTouchEnd() {
    setPressed(false);
    cancelPress();
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    setOffset((o) => (o < -swipeSnap ? -swipeOpen : 0));
  }

  // Card body tap: suppress the click that follows a long-press; toggle in select mode; else open.
  function onBodyClick() {
    const wasLong = longFired.current;
    const wasSwipe = didSwipe.current;
    longFired.current = false;
    didSwipe.current = false;
    if (selectMode) {
      onToggleSelect?.(task);
      return;
    }
    if (offset !== 0) {
      setOffset(0); // tap an open card to close it
      return;
    }
    if (wasLong || wasSwipe) return;
    router.push(`/mobile/tasks/${task.id}`);
  }

  const fromLabel =
    !sentMode && task.createdByUserId !== currentUserId ? `${task.authorName} → ` : "";
  const summary = shareSummary(task, currentUserId);

  const dateChip = (() => {
    if (!showDate) return null;
    if (overdue && dueDate)
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600">
          <Clock className="size-3" aria-hidden="true" />
          {shortDate(dueDate)} {copy.overdueLabel}
        </span>
      );
    if (dueDate)
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
            dueDate === today ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600",
          )}
        >
          <Flag className="size-3" aria-hidden="true" />
          {dueDate === today ? copy.todayLabel : shortDate(dueDate)} {copy.dueLabel}
        </span>
      );
    if (task.scheduledDate)
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
            task.scheduledDate === today
              ? "bg-primary/10 text-primary"
              : "bg-slate-100 text-slate-600",
          )}
        >
          <CalendarDays className="size-3" aria-hidden="true" />
          {task.scheduledDate === today ? copy.todayLabel : shortDate(task.scheduledDate)}
        </span>
      );
    return null;
  })();

  const chip = "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600";

  const cardInner = (
    <div
      className={cn(
        "flex items-start gap-3 rounded-[18px] border bg-surface px-3.5 py-3 shadow-[0_1px_2px_rgba(20,32,43,0.03)] transition-[transform,border-color,background-color] duration-150 ease-out will-change-transform",
        selectMode && selected ? "border-primary bg-primary/[0.04]" : "border-border",
        pressed ? "scale-[0.97] bg-primary/[0.03]" : "active:scale-[0.98]",
      )}
    >
      {selectMode ? (
        <button
          aria-label={copy.actionSelect}
          className={cn(
            "mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-slate-300",
          )}
          onClick={() => onToggleSelect?.(task)}
          type="button"
        >
          {selected ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
        </button>
      ) : done ? (
        <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      ) : onQuickComplete ? (
        <button
          aria-label={copy.complete}
          className={cn(
            "mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors active:scale-90",
            PRIO_RING[task.priority] ?? PRIO_RING.normal,
          )}
          onClick={() => onQuickComplete(task)}
          type="button"
        />
      ) : (
        <form action={completeTask}>
          <input name="taskId" type="hidden" value={task.id} />
          <button
            aria-label={copy.complete}
            className={cn(
              "mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors active:scale-90",
              PRIO_RING[task.priority] ?? PRIO_RING.normal,
            )}
            type="submit"
          />
        </form>
      )}

      <button
        className="min-w-0 flex-1 text-left"
        onClick={onBodyClick}
        type="button"
      >
        <p
          className={cn(
            "text-sm font-extrabold leading-snug tracking-[-0.01em]",
            done ? "text-slate-400 line-through" : "text-foreground",
          )}
        >
          {fromLabel ? <span className="text-muted-foreground">{fromLabel}</span> : null}
          {task.title}
        </p>
        {dateChip ||
        task.timeLabel ||
        task.recurrenceRule ||
        task.tags.length ||
        task.imageUrls.length ||
        summary ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {dateChip}
            {task.timeLabel ? (
              <span className={chip}>
                <Clock className="size-3" aria-hidden="true" />
                {task.timeLabel}
              </span>
            ) : null}
            {task.recurrenceRule ? (
              <span className={chip}>
                <Repeat2 className="size-3" aria-hidden="true" />
                {repeatLabel(task.recurrenceRule, copy)}
              </span>
            ) : null}
            {task.tags.slice(0, 2).map((tg) => (
              <span
                className="rounded-full bg-primary/[0.06] px-2 py-0.5 text-[11px] font-bold text-primary"
                key={tg}
              >
                #{tg}
              </span>
            ))}
            {task.imageUrls.length > 0 ? (
              <span className={chip}>
                <ImageIcon className="size-3" aria-hidden="true" />
                {task.imageUrls.length}
              </span>
            ) : null}
            {summary ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                <Share2 className="size-3" aria-hidden="true" />
                {sentMode ? `${summary} ${copy.sharedSuffix}` : summary}
              </span>
            ) : null}
          </div>
        ) : null}
      </button>

      {task.priority !== "normal" ? (
        <Flag
          className={cn(
            "mt-0.5 size-3.5 shrink-0",
            task.priority === "urgent" ? "text-rose-500" : "text-amber-500",
          )}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );

  const onContextMenu = (e: React.MouseEvent) => {
    if (!onLongPress || selectMode) return;
    e.preventDefault();
    onLongPress(task);
  };

  // 0 → 1 as the card slides open; drives the reveal buttons' scale-in.
  const revealRatio = Math.min(1, Math.abs(offset) / swipeOpen);

  if (!canSwipe) {
    return (
      <div
        className={cn(done && !selectMode && "opacity-60")}
        onContextMenu={onContextMenu}
        onTouchCancel={onTouchEnd}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
      >
        {cardInner}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative overflow-hidden rounded-[18px]">
      {/* Reveal: floating rounded action buttons. Only visible while actually swiping — never
          peeks on tap/long-press. Reveal scales/fades in as the card slides for a polished feel. */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex items-stretch gap-2 py-1 pl-2.5 pr-2",
          offset === 0 ? "pointer-events-none opacity-0" : "opacity-100",
        )}
        style={{
          transform: `scale(${0.9 + 0.1 * revealRatio})`,
          transformOrigin: "right center",
          transition: isDragging
            ? "opacity 100ms ease"
            : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 160ms ease",
        }}
      >
        {showToday ? (
          <form action={moveTaskToToday} className="flex">
            <input name="taskId" type="hidden" value={task.id} />
            <button
              className="flex w-[56px] flex-col items-center justify-center gap-1 rounded-[14px] bg-muted text-muted-foreground shadow-[0_2px_8px_-4px_rgba(20,16,10,0.22)] transition-transform active:scale-[0.93]"
              type="submit"
            >
              <Sun className="size-4" strokeWidth={2.2} aria-hidden="true" />
              <span className="text-[10px] font-bold tracking-tight">{copy.swipeToday}</span>
            </button>
          </form>
        ) : null}
        {onQuickComplete ? (
          <button
            className="flex w-[56px] flex-col items-center justify-center gap-1 rounded-[14px] bg-primary text-primary-foreground shadow-[0_3px_10px_-4px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-[0.93]"
            onClick={() => {
              setOffset(0);
              onQuickComplete(task);
            }}
            type="button"
          >
            <Check className="size-4" strokeWidth={2.4} aria-hidden="true" />
            <span className="text-[10px] font-bold tracking-tight">{copy.swipeComplete}</span>
          </button>
        ) : (
          <form action={completeTask} className="flex">
            <input name="taskId" type="hidden" value={task.id} />
            <button
              className="flex w-[56px] flex-col items-center justify-center gap-1 rounded-[14px] bg-primary text-primary-foreground shadow-[0_3px_10px_-4px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-[0.93]"
              type="submit"
            >
              <Check className="size-4" strokeWidth={2.4} aria-hidden="true" />
              <span className="text-[10px] font-bold tracking-tight">{copy.swipeComplete}</span>
            </button>
          </form>
        )}
      </div>
      <div
        onContextMenu={onContextMenu}
        onTouchCancel={onTouchEnd}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? "none" : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {cardInner}
      </div>
    </div>
  );
}
