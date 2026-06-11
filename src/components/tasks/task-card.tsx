"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  Clock,
  Flag,
  ImageIcon,
  Inbox,
  Repeat2,
  Share2,
  Sun,
} from "lucide-react";
import {
  completeTask,
  moveTaskToInbox,
  moveTaskToToday,
} from "@/app/mobile/tasks/[id]/actions";
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
}: {
  copy: Copy;
  currentUserId: string;
  task: TaskRecord;
  today: string;
  showDate?: boolean;
  swipe?: boolean;
  sentMode?: boolean;
}) {
  const router = useRouter();
  const done = task.status === "completed";
  const dueDate = tokyoDateOf(task.dueAt);
  const overdue = !done && !!dueDate && dueDate < today;

  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const dragging = useRef(false);

  const canSwipe = swipe && !done;

  function onTouchStart(e: React.TouchEvent) {
    if (!canSwipe) return;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
    setIsDragging(true);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffset(Math.max(dx, -186));
  }
  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    setOffset((o) => (o < -60 ? -186 : 0));
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
    <div className="flex items-start gap-3 rounded-[18px] border border-border bg-surface px-3.5 py-3 shadow-[0_1px_2px_rgba(20,32,43,0.03)]">
      {done ? (
        <span className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
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
        onClick={() => router.push(`/mobile/tasks/${task.id}`)}
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

  if (!canSwipe) {
    return <div className={cn(done && "opacity-60")}>{cardInner}</div>;
  }

  return (
    <div className="relative overflow-hidden rounded-[18px]">
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <form action={moveTaskToToday} className="flex">
          <input name="taskId" type="hidden" value={task.id} />
          <button className="flex w-[62px] flex-col items-center justify-center gap-0.5 bg-primary/15 text-[10px] font-bold text-primary" type="submit">
            <Sun className="size-4" aria-hidden="true" />
            {copy.swipeToday}
          </button>
        </form>
        <form action={moveTaskToInbox} className="flex">
          <input name="taskId" type="hidden" value={task.id} />
          <button className="flex w-[62px] flex-col items-center justify-center gap-0.5 bg-slate-200 text-[10px] font-bold text-slate-700" type="submit">
            <Inbox className="size-4" aria-hidden="true" />
            {copy.swipeInbox}
          </button>
        </form>
        <form action={completeTask} className="flex">
          <input name="taskId" type="hidden" value={task.id} />
          <button className="flex w-[62px] flex-col items-center justify-center gap-0.5 bg-primary text-[10px] font-bold text-primary-foreground" type="submit">
            <Check className="size-4" aria-hidden="true" />
            {copy.swipeComplete}
          </button>
        </form>
      </div>
      <div
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onTouchStart={onTouchStart}
        style={{ transform: `translateX(${offset}px)`, transition: isDragging ? "none" : "transform 220ms ease" }}
      >
        {cardInner}
      </div>
    </div>
  );
}
