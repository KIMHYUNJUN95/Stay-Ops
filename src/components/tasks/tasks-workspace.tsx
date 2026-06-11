"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  ListChecks,
  Plus,
  Search,
  SearchX,
  Send,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import { quickCreateTask } from "@/app/mobile/tasks/new/actions";
import { TaskCard } from "@/components/tasks/task-card";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { TaskRecord } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];
type View = "today" | "inbox" | "my" | "sent" | "completed" | "calendar";

function tokyoDateOf(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
const PRIO_ORD: Record<string, number> = { urgent: 0, important: 1, normal: 2 };

export function TasksWorkspace({
  copy,
  currentUserId,
  initialView,
  locale,
  tasks,
  today,
}: {
  copy: Copy;
  currentUserId: string;
  initialView: View;
  locale: Locale;
  tasks: TaskRecord[];
  today: string;
}) {
  const [view, setView] = useState<View>(initialView);
  const [doneFilter, setDoneFilter] = useState<"all" | "mine" | "recv">("all");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [calDay, setCalDay] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const [ty, tm] = today.split("-").map(Number);
    return { y: ty, m: tm };
  });

  const isActive = (t: TaskRecord) => t.status !== "completed" && t.status !== "cancelled";
  const dueDateOf = (t: TaskRecord) => tokyoDateOf(t.dueAt);
  const isOverdue = (t: TaskRecord) => isActive(t) && !!dueDateOf(t) && dueDateOf(t)! < today;
  const isToday = (t: TaskRecord) =>
    isActive(t) && !isOverdue(t) && (t.scheduledDate === today || dueDateOf(t) === today);
  const anchor = (t: TaskRecord) => dueDateOf(t) ?? t.scheduledDate ?? null;
  const prioSort = (a: TaskRecord, b: TaskRecord) =>
    (PRIO_ORD[a.priority] ?? 2) - (PRIO_ORD[b.priority] ?? 2);

  // --- First-slice search / filter: title + author text, and anchor-date single/range.
  // One shared lightweight state across the list views; the date filter reuses the same
  // `anchor()` (due wins over scheduled, Tokyo) used for grouping/listing/calendar.
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const q = search.trim().toLowerCase();
  const hasSearch = q.length > 0;
  const hasDate = dateMode === "single" ? !!dateFrom : !!dateFrom || !!dateTo;
  const filterActive = hasSearch || hasDate;

  const matchesFilter = (t: TaskRecord) => {
    if (hasSearch) {
      // case-insensitive partial match across title + author name
      if (!`${t.title} ${t.authorName}`.toLowerCase().includes(q)) return false;
    }
    if (hasDate) {
      const a = anchor(t);
      if (!a) return false; // dateless tasks never match an active date filter
      if (dateMode === "single") {
        if (a !== dateFrom) return false;
      } else {
        if (dateFrom && a < dateFrom) return false;
        if (dateTo && a > dateTo) return false;
      }
    }
    return true;
  };
  const applyFilter = (list: TaskRecord[]) =>
    filterActive ? list.filter(matchesFilter) : list;
  const clearFilters = () => {
    setSearch("");
    setDateMode("single");
    setDateFrom("");
    setDateTo("");
    setFilterOpen(false);
  };
  const chipDate = (ymd: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "Asia/Tokyo",
    }).format(new Date(`${ymd}T00:00:00+09:00`));
  const dateLabel = !hasDate
    ? ""
    : dateMode === "single"
      ? chipDate(dateFrom)
      : `${dateFrom ? chipDate(dateFrom) : "…"} – ${dateTo ? chipDate(dateTo) : "…"}`;

  const tabs: { key: View; label: string; icon: typeof Sun }[] = [
    { key: "today", label: copy.viewToday, icon: Sun },
    { key: "inbox", label: copy.viewInbox, icon: Inbox },
    { key: "my", label: copy.viewMy, icon: ListChecks },
    { key: "sent", label: copy.viewSent, icon: Send },
    { key: "completed", label: copy.viewCompleted, icon: CheckCircle2 },
    { key: "calendar", label: copy.viewCalendar, icon: CalendarDays },
  ];

  const cardProps = { copy, currentUserId, today };

  const sectionHead = (label: string, n: number, tone?: "over") => (
    <div className="mb-2.5 mt-1 flex items-center gap-2 px-0.5">
      <span
        className={cn(
          "text-[11px] font-black uppercase tracking-[0.06em]",
          tone === "over" ? "text-rose-600" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span className="rounded-full bg-slate-100 px-[7px] py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
        {n}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );

  const emptyState = (Icon: typeof Sun, title: string, sub?: string) => (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex size-[60px] items-center justify-center rounded-[18px] bg-slate-50 text-slate-400">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <p className="text-[15px] font-extrabold text-foreground">{title}</p>
      {sub ? <p className="mt-1.5 text-[13px] text-muted-foreground">{sub}</p> : null}
    </div>
  );

  // Shown when a view has tasks but the active search/filter matches none of them —
  // distinct from a genuinely empty view, and offers a one-tap reset.
  const noMatchState = () => (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 flex size-[60px] items-center justify-center rounded-[18px] bg-slate-50 text-slate-400">
        <SearchX className="size-7" aria-hidden="true" />
      </span>
      <p className="text-[15px] font-extrabold text-foreground">{copy.filterNoResultTitle}</p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{copy.filterNoResultSub}</p>
      <button
        className="mt-4 rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-bold text-primary"
        onClick={clearFilters}
        type="button"
      >
        {copy.filterClear}
      </button>
    </div>
  );

  const viewBody = (() => {
    if (view === "today") {
      const baseOver = tasks.filter(isOverdue);
      const baseToday = tasks.filter(isToday);
      if (!baseOver.length && !baseToday.length)
        return emptyState(Sun, copy.todayEmptyTitle, copy.todayEmptySub);
      const over = applyFilter(baseOver).sort(prioSort);
      const todays = applyFilter(baseToday).sort(prioSort);
      if (!over.length && !todays.length) return noMatchState();
      return (
        <>
          {over.length > 0 ? (
            <>
              {sectionHead(copy.secOverdue, over.length, "over")}
              <div className="flex flex-col gap-2">
                {over.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            </>
          ) : null}
          {todays.length > 0 ? (
            <div className={over.length ? "mt-4" : ""}>
              {sectionHead(copy.secToday, todays.length)}
              <div className="flex flex-col gap-2">
                {todays.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      );
    }

    if (view === "inbox") {
      const base = tasks.filter((t) => isActive(t) && t.isInbox);
      const list = applyFilter(base).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return (
        <>
          <p className="mb-3 px-0.5 text-[12px] font-medium text-muted-foreground">{copy.inboxHint}</p>
          {base.length === 0 ? (
            emptyState(Inbox, copy.inboxEmptyTitle, copy.inboxEmptySub)
          ) : list.length === 0 ? (
            noMatchState()
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((t) => (
                <TaskCard key={t.id} task={t} showDate={false} {...cardProps} />
              ))}
            </div>
          )}
        </>
      );
    }

    if (view === "my") {
      const base = tasks.filter((t) => isActive(t) && !t.isInbox);
      if (base.length === 0) return emptyState(ListChecks, copy.myEmptyTitle, copy.myEmptySub);
      const list = applyFilter(base);
      if (list.length === 0) return noMatchState();
      const dated = list.filter((t) => anchor(t)).sort((a, b) => anchor(a)!.localeCompare(anchor(b)!));
      const undated = list.filter((t) => !anchor(t));
      return (
        <>
          {dated.length > 0 ? (
            <>
              {sectionHead(copy.secScheduled, dated.length)}
              <div className="flex flex-col gap-2">
                {dated.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            </>
          ) : null}
          {undated.length > 0 ? (
            <div className={dated.length ? "mt-4" : ""}>
              {sectionHead(copy.secNoDate, undated.length)}
              <div className="flex flex-col gap-2">
                {undated.map((t) => (
                  <TaskCard key={t.id} task={t} {...cardProps} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      );
    }

    if (view === "sent") {
      const base = tasks.filter((t) => t.createdByUserId === currentUserId && t.isShared);
      if (!base.length) return emptyState(Send, copy.sentEmptyTitle, copy.sentEmptySub);
      const list = applyFilter(base).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return (
        <>
          <p className="mb-3 px-0.5 text-[12px] font-medium text-muted-foreground">{copy.sentHint}</p>
          {list.length === 0 ? (
            noMatchState()
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((t) => (
                <TaskCard key={t.id} task={t} sentMode swipe={false} {...cardProps} />
              ))}
            </div>
          )}
        </>
      );
    }

    if (view === "completed") {
      let base = tasks.filter((t) => t.status === "completed");
      if (doneFilter === "mine") base = base.filter((t) => t.createdByUserId === currentUserId);
      if (doneFilter === "recv") base = base.filter((t) => t.createdByUserId !== currentUserId);
      const list = applyFilter(base);
      const chips: { k: typeof doneFilter; l: string }[] = [
        { k: "all", l: copy.filterAll },
        { k: "mine", l: copy.filterMine },
        { k: "recv", l: copy.filterReceived },
      ];
      return (
        <>
          <div className="mb-3 flex gap-2">
            {chips.map((c) => (
              <button
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors",
                  doneFilter === c.k
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-surface text-slate-600",
                )}
                key={c.k}
                onClick={() => setDoneFilter(c.k)}
                type="button"
              >
                {c.l}
              </button>
            ))}
          </div>
          {base.length === 0 ? (
            emptyState(CheckCircle2, copy.completedEmptyTitle)
          ) : list.length === 0 ? (
            noMatchState()
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((t) => (
                <TaskCard key={t.id} task={t} showDate={false} swipe={false} {...cardProps} />
              ))}
            </div>
          )}
        </>
      );
    }

    // calendar
    return renderCalendar();
  })();

  function renderCalendar() {
    const { y, m } = calMonth;
    const monthPrefix = `${y}-${String(m).padStart(2, "0")}`;
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dated = tasks.filter((t) => isActive(t) && anchor(t));
    const onDay = (iso: string) => dated.filter((t) => anchor(t) === iso);

    const openDay = (iso: string) => {
      setCalDay(iso);
      setSheetOpen(true);
    };
    const shiftMonth = (delta: number) =>
      setCalMonth(({ y: cy, m: cm }) => {
        const idx = cy * 12 + (cm - 1) + delta;
        return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
      });
    const goToday = () => {
      const [ty, tm] = today.split("-").map(Number);
      setCalMonth({ y: ty, m: tm });
      setCalDay(today);
    };

    const cells: React.ReactNode[] = [];
    for (let i = 0; i < first; i++) cells.push(<span key={`pad-${i}`} />);
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      const list = onDay(iso);
      const isT = iso === today;
      const isSel = iso === calDay;
      const w = (first + d - 1) % 7;
      cells.push(
        <button
          className={cn(
            "flex aspect-square flex-col items-center justify-start gap-1 rounded-xl pt-1.5 text-[12.5px] font-bold transition-colors",
            isSel
              ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_hsl(var(--primary-hsl)/0.7)]"
              : isT
                ? "bg-primary/[0.07] text-primary ring-1 ring-inset ring-primary/25"
                : "text-foreground hover:bg-slate-50",
          )}
          key={iso}
          onClick={() => openDay(iso)}
          type="button"
        >
          <span
            className={cn(
              !isSel && !isT && w === 0 && "text-rose-500",
              !isSel && !isT && w === 6 && "text-blue-600",
            )}
          >
            {d}
          </span>
          {/* Fixed-height marker row keeps every cell on the same vertical rhythm */}
          <span className="flex h-1.5 items-center gap-0.5">
            {list.slice(0, 3).map((t, i) => (
              <span
                className={cn(
                  "size-1 rounded-full",
                  isSel ? "bg-primary-foreground/80" : t.isShared ? "bg-primary" : "bg-slate-400",
                )}
                key={i}
              />
            ))}
          </span>
        </button>,
      );
    }

    const monthLabel = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Tokyo",
    }).format(new Date(Date.UTC(y, m - 1, 15)));
    const isCurrentMonth = monthPrefix === today.slice(0, 7);
    const selectedList = calDay ? onDay(calDay) : [];
    const selectedLabel = calDay
      ? new Intl.DateTimeFormat(locale, {
          month: "long",
          day: "numeric",
          weekday: "short",
          timeZone: "Asia/Tokyo",
        }).format(new Date(`${calDay}T00:00:00+09:00`))
      : null;

    // Agenda for the shown month: dated tasks grouped by their anchor day, in date order.
    const monthTasks = dated.filter((t) => (anchor(t) as string).slice(0, 7) === monthPrefix);
    const byDay = new Map<string, TaskRecord[]>();
    for (const t of monthTasks) {
      const k = anchor(t) as string;
      byDay.set(k, [...(byDay.get(k) ?? []), t]);
    }
    const dayKeys = Array.from(byDay.keys()).sort();

    return (
      <div>
        {/* Calendar card — a calm white surface lifted off the ivory canvas */}
        <div className="rounded-[22px] border border-border bg-surface p-3.5 shadow-[0_14px_50px_-32px_rgba(15,23,42,0.4)]">
          {/* Month navigation */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                aria-label={copy.calPrevMonth}
                className="flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-foreground"
                onClick={() => shiftMonth(-1)}
                type="button"
              >
                <ChevronLeft className="size-[18px]" aria-hidden="true" />
              </button>
              <span className="min-w-[124px] text-center text-[15px] font-black tracking-[-0.01em] text-foreground">
                {monthLabel}
              </span>
              <button
                aria-label={copy.calNextMonth}
                className="flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-foreground"
                onClick={() => shiftMonth(1)}
                type="button"
              >
                <ChevronRight className="size-[18px]" aria-hidden="true" />
              </button>
            </div>
            {!isCurrentMonth ? (
              <button
                className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] px-3 py-1.5 text-[12px] font-bold text-primary transition-colors hover:bg-primary/10"
                onClick={goToday}
                type="button"
              >
                <CalendarDays className="size-3.5" aria-hidden="true" />
                {copy.todayLabel}
              </button>
            ) : null}
          </div>

          {/* Weekday row */}
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
            {Array.from({ length: 7 }, (_, i) =>
              new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
                new Date(Date.UTC(2025, 0, 5 + i)),
              ),
            ).map((label, i) => (
              <span className={cn(i === 0 && "text-rose-500", i === 6 && "text-blue-600")} key={i}>
                {label}
              </span>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-7 gap-1">{cells}</div>

          {/* Legend — placed by the grid it explains */}
          {isCurrentMonth ? (
            <div className="mt-3 flex items-center justify-center gap-4 border-t border-slate-100 pt-2.5 text-[10.5px] font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-slate-400" />
                {copy.calLegendPersonal}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-primary" />
                {copy.calLegendShared}
              </span>
            </div>
          ) : null}
        </div>

        {calDay ? (
          <div className="mt-4 rounded-[18px] border border-border bg-surface px-4 py-3 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.42)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                  {copy.calSelectedLabel}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-black tracking-[-0.01em] text-foreground">
                    {selectedLabel}
                  </p>
                  <span className="rounded-full bg-slate-100 px-[7px] py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
                    {copy.calMonthTask.replace("{count}", String(selectedList.length))}
                  </span>
                  {calDay === today ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">
                      {copy.todayLabel}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  {selectedList.length > 0 ? copy.calSelectedHint : copy.calSelectedEmpty}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  className="inline-flex h-9 items-center gap-1 rounded-full bg-primary/[0.07] px-3 text-[12px] font-bold text-primary transition-colors hover:bg-primary/10"
                  onClick={() => openDay(calDay)}
                  type="button"
                >
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {copy.calOpenDay}
                </button>
                <button
                  aria-label={copy.calClearSelected}
                  className="flex size-9 items-center justify-center rounded-full bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-foreground"
                  onClick={() => setCalDay(null)}
                  type="button"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Month agenda — operational reading of the shown month's dated tasks */}
        <div className="mt-5">
          {sectionHead(copy.calAgenda, monthTasks.length)}
          {dayKeys.length === 0 ? (
            <div className="flex flex-col items-center rounded-[18px] border border-dashed border-border bg-surface/60 px-6 py-8 text-center">
              <span className="mb-2.5 flex size-10 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                <CalendarDays className="size-5" aria-hidden="true" />
              </span>
              <p className="text-[12.5px] font-semibold text-muted-foreground">{copy.calMonthEmpty}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {dayKeys.map((k) => {
                const dayLabel = new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  weekday: "short",
                  timeZone: "Asia/Tokyo",
                }).format(new Date(`${k}T00:00:00+09:00`));
                const dayIsToday = k === today;
                return (
                  <div key={k}>
                    <button
                      className="mb-1.5 flex w-full items-center gap-2 px-0.5 text-left"
                      onClick={() => openDay(k)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "text-[12px] font-black tracking-[-0.01em]",
                          dayIsToday ? "text-primary" : "text-foreground",
                        )}
                      >
                        {dayLabel}
                      </span>
                      {dayIsToday ? (
                        <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">
                          {copy.todayLabel}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-slate-100 px-[7px] py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
                        {byDay.get(k)!.length}
                      </span>
                      <span className="h-px flex-1 bg-border" />
                    </button>
                    <div className="flex flex-col gap-2">
                      {byDay.get(k)!.map((t) => (
                        <TaskCard key={t.id} task={t} swipe={false} {...cardProps} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {sheetOpen && calDay ? renderDaySheet(calDay) : null}
      </div>
    );
  }

  function renderDaySheet(iso: string) {
    const list = tasks.filter((t) => isActive(t) && anchor(t) === iso);
    const label = new Intl.DateTimeFormat(locale, {
      month: "long",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Tokyo",
    }).format(new Date(`${iso}T00:00:00+09:00`));
    return (
      <div
        className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45"
        onClick={() => setSheetOpen(false)}
      >
        <div
          className="w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-slate-200" />
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[16px] font-black text-foreground">{label}</p>
              {list.length > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  {copy.calMonthTask.replace("{count}", String(list.length))}
                </span>
              ) : null}
            </div>
            <button
              aria-label={copy.cancel}
              className="flex size-8 items-center justify-center rounded-full bg-slate-50 text-slate-500"
              onClick={() => setSheetOpen(false)}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          {list.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <span className="mb-2.5 flex size-11 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                <CalendarDays className="size-5" aria-hidden="true" />
              </span>
              <p className="text-[13px] font-semibold text-muted-foreground">{copy.calNoTask}</p>
            </div>
          ) : (
            <div className="-mx-1 flex max-h-[56vh] flex-col gap-2 overflow-y-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {list.map((t) => (
                <TaskCard key={t.id} task={t} swipe={false} {...cardProps} />
              ))}
            </div>
          )}
          <Link
            className="mt-3 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary/[0.06] text-[13.5px] font-bold text-primary transition-colors hover:bg-primary/10"
            href={`/mobile/tasks/new?date=${iso}`}
          >
            <Plus className="size-4" aria-hidden="true" />
            {copy.calAddOnDate}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[60vh] pb-24">
      {/* Chip tabs */}
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors",
              view === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-slate-600",
            )}
            key={t.key}
            onClick={() => setView(t.key)}
            type="button"
          >
            <t.icon className="size-[15px]" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Search / filter — list views only; Calendar provides its own date navigation. */}
      {view !== "calendar" ? (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                className="h-11 w-full rounded-2xl border border-border bg-surface pl-9 pr-9 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.searchPlaceholder}
                value={search}
              />
              {hasSearch ? (
                <button
                  aria-label={copy.filterClear}
                  className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                  onClick={() => setSearch("")}
                  type="button"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <button
              aria-label={copy.filterDate}
              className={cn(
                "relative flex size-11 shrink-0 items-center justify-center rounded-2xl border transition-colors",
                filterOpen || hasDate
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-slate-500",
              )}
              onClick={() => setFilterOpen((v) => !v)}
              type="button"
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {hasDate ? (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
              ) : null}
            </button>
          </div>

          {filterOpen ? (
            <div className="mt-2 rounded-2xl border border-border bg-surface p-3">
              <div className="mb-2.5 flex gap-1.5 rounded-full bg-slate-100 p-1">
                {(["single", "range"] as const).map((m) => (
                  <button
                    className={cn(
                      "h-8 flex-1 rounded-full text-[12.5px] font-bold transition-colors",
                      dateMode === m ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground",
                    )}
                    key={m}
                    onClick={() => setDateMode(m)}
                    type="button"
                  >
                    {m === "single" ? copy.filterDateSingle : copy.filterDateRange}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  aria-label={dateMode === "range" ? copy.filterDateFrom : copy.filterDateSingle}
                  className="h-10 flex-1 rounded-xl border border-border bg-background/60 px-3 text-sm font-bold text-foreground outline-none focus:border-primary"
                  onChange={(e) => setDateFrom(e.target.value)}
                  type="date"
                  value={dateFrom}
                />
                {dateMode === "range" ? (
                  <>
                    <span className="text-sm font-bold text-muted-foreground">–</span>
                    <input
                      aria-label={copy.filterDateTo}
                      className="h-10 flex-1 rounded-xl border border-border bg-background/60 px-3 text-sm font-bold text-foreground outline-none focus:border-primary"
                      onChange={(e) => setDateTo(e.target.value)}
                      type="date"
                      value={dateTo}
                    />
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {filterActive ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {copy.filterActive}
              </span>
              {hasSearch ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/[0.08] px-2.5 py-1 text-[11.5px] font-bold text-primary">
                  “{search.trim()}”
                </span>
              ) : null}
              {hasDate ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/[0.08] px-2.5 py-1 text-[11.5px] font-bold text-primary">
                  <CalendarDays className="size-3" aria-hidden="true" />
                  {dateLabel}
                </span>
              ) : null}
              <button
                className="ml-0.5 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-bold text-slate-500"
                onClick={clearFilters}
                type="button"
              >
                <X className="size-3" aria-hidden="true" />
                {copy.filterClear}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {viewBody}

      {/* Quick-add FAB */}
      <button
        className="fixed bottom-24 right-4 z-30 inline-flex h-[52px] items-center gap-1.5 rounded-full bg-primary pl-[18px] pr-5 text-[14.5px] font-extrabold text-primary-foreground shadow-[0_16px_30px_-10px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-95"
        onClick={() => setQuickOpen(true)}
        type="button"
      >
        <Plus className="size-5" aria-hidden="true" />
        {copy.quickAddTitle}
      </button>

      {quickOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45"
          onClick={() => setQuickOpen(false)}
        >
          <div
            className="w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-slate-200" />
            <div className="mb-3">
              <p className="text-[16px] font-black text-foreground">{copy.quickAddTitle}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{copy.quickAddSub}</p>
            </div>
            <form action={quickCreateTask} className="space-y-3">
              <input
                autoFocus
                className="h-12 w-full rounded-2xl border border-border bg-background/60 px-4 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                name="title"
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder={copy.quickAddPlaceholder}
                required
                value={quickTitle}
              />
              <div className="flex gap-2.5">
                {/* Full organized create — carries any typed title across so the capture isn't lost. */}
                <Link
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-border bg-surface text-[13.5px] font-bold text-foreground"
                  href={
                    quickTitle.trim()
                      ? `/mobile/tasks/new?title=${encodeURIComponent(quickTitle.trim())}`
                      : "/mobile/tasks/new"
                  }
                >
                  {copy.quickAddDetailed}
                </Link>
                <button
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary text-[13.5px] font-extrabold text-primary-foreground"
                  type="submit"
                >
                  <Inbox className="size-4" aria-hidden="true" />
                  {copy.quickAddSave}
                </button>
              </div>
              <p className="px-0.5 text-[11.5px] font-medium text-muted-foreground">
                {copy.detailedCreateHint}
              </p>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
