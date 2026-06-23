"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  History,
  Inbox,
  ListChecks,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  Pencil,
  Send,
  SlidersHorizontal,
  Sun,
  Sunrise,
  Trash2,
  X,
} from "lucide-react";
import {
  quickCreateTask,
  quickCreateTodayTask,
  quickCreateTomorrowTask,
} from "@/app/mobile/tasks/new/actions";
import {
  completeTask,
  deleteTasksInList,
  dismissOverdueTasks,
  reopenTask,
  reorderTasks,
  rescheduleOverdueTo,
} from "@/app/mobile/tasks/[id]/actions";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import { TaskCard } from "@/components/tasks/task-card";
import { ReorderableTaskList } from "@/components/tasks/reorderable-task-list";
import { ReportSheet } from "@/components/tasks/report-sheet";
import { ProjectsBoard } from "@/components/tasks/projects-board";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { ProjectSummary } from "@/lib/projects";
import type { ShareableUser, TaskRecord } from "@/lib/tasks";
import { isStandardRecurrence, recurringOccurrencesInRange } from "@/lib/tasks-recurrence";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];
type View =
  | "today"
  | "tomorrow"
  | "inbox"
  | "projects"
  | "sent"
  | "completed"
  | "calendar";

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

// Shift a YYYY-MM-DD (Tokyo) date string by `n` days, returning the same format.
function ymdShift(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Returns the next Monday (always ≥ 1 day ahead) from a YYYY-MM-DD string.
function nextMonday(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  const days = dow === 1 ? 7 : ((8 - dow) % 7 || 7);
  return ymdShift(ymd, days);
}

// Max days in a given year/month (1-based month).
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}


export function TasksWorkspace({
  buildingLabels,
  copy,
  currentUserId,
  initialView,
  locale,
  projectCompletedTasks,
  projects,
  shareableUsers,
  tasks: allTasks,
  today,
}: {
  buildingLabels: Record<string, string>;
  copy: Copy;
  currentUserId: string;
  initialView: View;
  locale: Locale;
  // Completed project tasks, supplied separately so the Completed tab's project filter can show
  // them. `tasks` itself excludes project tasks (they live only in the Projects tab).
  projectCompletedTasks: TaskRecord[];
  projects: ProjectSummary[];
  shareableUsers: ShareableUser[];
  tasks: TaskRecord[];
  today: string;
}) {
  const [view, setView] = useState<View>(initialView);
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(() => new Set());
  const tasks = hiddenTaskIds.size
    ? allTasks.filter((t) => !hiddenTaskIds.has(t.id))
    : allTasks;
  // Split mount vs. visibility so the sheet can play a slide/fade-OUT before unmounting.
  const [quickMounted, setQuickMounted] = useState(false); // present in the DOM
  const [quickShown, setQuickShown] = useState(false); // drives the in/out transition
  const [quickTitle, setQuickTitle] = useState("");
  const openQuick = useCallback(() => {
    setQuickMounted(true);
    // Double rAF: let the element mount at translate-y-full, then flip to 0 so it animates.
    requestAnimationFrame(() => requestAnimationFrame(() => setQuickShown(true)));
  }, []);
  const closeQuick = useCallback(() => {
    setQuickShown(false);
    setTimeout(() => setQuickMounted(false), 380); // must match the sheet transition duration
  }, []);
  // Body portals (FAB + sheet) are client-only; gate on hydration so server and the
  // first client render agree (avoids a hydration mismatch). false on server, true after mount.
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [calDay, setCalDay] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // day sheet present in the DOM
  const [sheetShown, setSheetShown] = useState(false); // drives its slide in/out
  const [calMonth, setCalMonth] = useState(() => {
    const [ty, tm] = today.split("-").map(Number);
    return { y: ty, m: tm };
  });
  const closeDaySheet = useCallback(() => {
    setSheetShown(false);
    setTimeout(() => setSheetOpen(false), 320); // matches the day-sheet transition duration
  }, []);

  // Esc closes the quick-add sheet (scrim tap / X already cover pointer dismissal).
  useEffect(() => {
    if (!quickMounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeQuick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickMounted, closeQuick]);

  // --- Long-press context menu + multi-select (edit/delete convenience).
  const router = useRouter();
  const [pressTask, setPressTask] = useState<TaskRecord | null>(null);
  const [pressShown, setPressShown] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [deleting, startDelete] = useTransition();

  const openPressMenu = useCallback((task: TaskRecord) => {
    setPressTask(task);
    requestAnimationFrame(() => requestAnimationFrame(() => setPressShown(true)));
  }, []);
  const closePressMenu = useCallback(() => {
    setPressShown(false);
    setTimeout(() => setPressTask(null), 240);
  }, []);

  // iOS-style drag-to-dismiss for the three bottom sheets (grab handle / header drives the drag).
  const daySheetDrag = useSheetDragDismiss({ shown: sheetShown, onDismiss: closeDaySheet });
  const quickDrag = useSheetDragDismiss({ shown: quickShown, onDismiss: closeQuick });
  const pressDrag = useSheetDragDismiss({ shown: pressShown, onDismiss: closePressMenu });
  const toggleSelect = useCallback((task: TaskRecord) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }, []);
  const enterSelect = useCallback((task?: TaskRecord) => {
    setSelectMode(true);
    setSelectedIds(new Set(task ? [task.id] : []));
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);
  // Commit a delete (single from the menu, or the multi-select batch). Optimistically hide the
  // rows, then run the server batch delete; only author-owned tasks are actually removed.
  const performDelete = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setHiddenTaskIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      startDelete(async () => {
        await deleteTasksInList(ids);
        setHiddenTaskIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      });
      setConfirmIds(null);
      setSelectMode(false);
      setSelectedIds(new Set());
    },
    [],
  );

  // --- Overdue prompt (Today tab): reschedule / clear past unfinished.
  const [overduePending, startOverdue] = useTransition();
  const [overdueConfirm, setOverdueConfirm] = useState(false);
  const [overdueRescheduleOpen, setOverdueRescheduleOpen] = useState(false);
  const [overdueCustomMode, setOverdueCustomMode] = useState(false);
  const [overdueCustomYear, setOverdueCustomYear] = useState(0);
  const [overdueCustomMonth, setOverdueCustomMonth] = useState(0);
  const [overdueCustomDay, setOverdueCustomDay] = useState(0);
  const [overdueSelection, setOverdueSelection] = useState<Set<string>>(new Set());

  // Overdue reschedule: date computations and handler lifted to component level so the
  // BottomSheet renders at the top-level return (avoids scrim/portal issues inside viewBody IIFE).
  const [overdueY, overdueM, overdueD] = today.split("-").map(Number);
  const overdueSelY = overdueCustomYear || overdueY;
  const overdueSelM = overdueCustomMonth || overdueM;
  const overdueSelD = overdueCustomDay || overdueD;
  const overdueMaxDay = daysInMonth(overdueSelY, overdueSelM);
  const overdueClampedD = Math.min(overdueSelD, overdueMaxDay);
  const overdueCustomYmd = `${String(overdueSelY)}-${String(overdueSelM).padStart(2, "0")}-${String(overdueClampedD).padStart(2, "0")}`;
  const overdueCustomValid = overdueCustomYmd >= today;
  const rescheduleOverdue = (targetDate: string) =>
    startOverdue(async () => {
      await rescheduleOverdueTo(targetDate, [...overdueSelection]);
      setOverdueRescheduleOpen(false);
      setOverdueCustomMode(false);
      setOverdueSelection(new Set());
    });

  // --- Quick complete (status circle tap on any card) + undo toast.
  const [, startComplete] = useTransition();
  const [undoTask, setUndoTask] = useState<TaskRecord | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optimistically hide the row, then run the server action; revalidatePath refreshes the list with
  // the new status and we clear the hidden id. Completing shows an undo toast; reopening (in the
  // 완료/기록 tab, or via undo) is itself the correction, so it shows none.
  const runStatus = useCallback((task: TaskRecord, complete: boolean) => {
    setHiddenTaskIds((prev) => new Set(prev).add(task.id));
    startComplete(async () => {
      try {
        if (complete) await completeTask(task.id);
        else await reopenTask(task.id);
      } finally {
        // Always un-hide: on success revalidatePath re-renders with the new status; on failure the
        // row reappears in its original place instead of silently vanishing until a refresh.
        setHiddenTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    });
  }, []);
  const handleCompleteToggle = useCallback(
    (task: TaskRecord) => {
      const complete = task.status !== "completed";
      runStatus(task, complete);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (complete) {
        setUndoTask(task);
        undoTimer.current = setTimeout(() => setUndoTask(null), 4000);
      } else {
        setUndoTask(null);
      }
    },
    [runStatus],
  );
  const handleUndo = useCallback(() => {
    setUndoTask((t) => {
      if (t) runStatus(t, false);
      return null;
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [runStatus]);

  // 완료/기록 tab: daily-report sheet target date (the day-group whose 보고서 button was tapped).
  const [reportDate, setReportDate] = useState<string | null>(null);
  // 완료/기록 tab: regular vs. project completions filter. Project tasks don't exist yet
  // (data layer deferred), so "project" currently resolves to an empty set.
  const [completedFilter, setCompletedFilter] = useState<"all" | "regular" | "project">("all");

  // Tokyo "tomorrow" (today + 1), used by the Tomorrow tab + its swipe defer action.
  const tomorrowDate = ymdShift(today, 1);
  const isActive = (t: TaskRecord) => t.status !== "completed" && t.status !== "cancelled";
  const dueDateOf = (t: TaskRecord) => tokyoDateOf(t.dueAt);
  const isOverdue = (t: TaskRecord) => isActive(t) && !!dueDateOf(t) && dueDateOf(t)! < today;
  const isToday = (t: TaskRecord) =>
    isActive(t) && !isOverdue(t) && (t.scheduledDate === today || dueDateOf(t) === today);
  // Tomorrow tab: active tasks anchored to tomorrow (scheduled or due). Future-dated, so never
  // overdue. Mirrors isToday so a task can't fall through the IA between the two day tabs.
  const isTomorrow = (t: TaskRecord) =>
    isActive(t) && (t.scheduledDate === tomorrowDate || dueDateOf(t) === tomorrowDate);
  const anchor = (t: TaskRecord) => dueDateOf(t) ?? t.scheduledDate ?? null;
  const prioSort = (a: TaskRecord, b: TaskRecord) =>
    (PRIO_ORD[a.priority] ?? 2) - (PRIO_ORD[b.priority] ?? 2);
  // Today-view ordering: a manual drag-reorder (sort_order) wins; unranked tasks (sort_order null)
  // fall back to priority, preserving the original behaviour until the user drags. Ranked tasks
  // always sort before unranked ones.
  const orderSort = (a: TaskRecord, b: TaskRecord) => {
    const ao = a.sortOrder;
    const bo = b.sortOrder;
    if (ao != null && bo != null) return ao !== bo ? ao - bo : prioSort(a, b);
    if (ao != null) return -1;
    if (bo != null) return 1;
    return prioSort(a, b);
  };

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
    { key: "tomorrow", label: copy.viewTomorrow, icon: Sunrise },
    { key: "inbox", label: copy.viewInbox, icon: Archive },
    { key: "projects", label: copy.viewProjects, icon: FolderOpen },
    { key: "sent", label: copy.viewSent, icon: Send },
    { key: "completed", label: copy.viewCompleted, icon: CheckCircle2 },
    { key: "calendar", label: copy.viewCalendar, icon: CalendarDays },
  ];

  // Swipe defer/pull action per view: Today → push to tomorrow; everywhere else → pull to today
  // (in the Tomorrow tab this means "do it today"). Sent/Calendar render with swipe disabled.
  const swipeActionForView: "today" | "tomorrow" = view === "today" ? "tomorrow" : "today";

  const cardProps = {
    buildingLabels,
    copy,
    currentUserId,
    today,
    selectMode,
    selectedIds,
    onToggleSelect: toggleSelect,
    onLongPress: openPressMenu,
    swipeAction: swipeActionForView,
    // After the move the server action returns here; keep the user on the tab they swiped from.
    swipeReturnView: view,
    // Status-circle tap completes (active) / reopens (completed) with an undo toast.
    onCompleteToggle: handleCompleteToggle,
  };

  // Per-tab counts (same base filters as each view).
  const tabCounts: Record<View, number> = {
    today: tasks.filter((t) => isOverdue(t) || isToday(t)).length,
    tomorrow: tasks.filter(isTomorrow).length,
    // Archive = every active todo in one management list.
    inbox: tasks.filter((t) => isActive(t)).length,
    // Projects badge stays 0 until the Projects data layer lands (deferred).
    projects: 0,
    sent: tasks.filter((t) => t.createdByUserId === currentUserId && t.isShared).length,
    // Completed badge = today's (Tokyo) completions, matching the report's default day.
    completed: tasks.filter(
      (t) => t.status === "completed" && tokyoDateOf(t.completedAt) === today,
    ).length,
    calendar: 0,
  };

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
    // Projects tab — separate workspace (own list / create sheet / FAB).
    if (view === "projects") {
      return <ProjectsBoard copy={copy} projects={projects} shareableUsers={shareableUsers} />;
    }

    if (view === "today") {
      const baseOver = tasks.filter(isOverdue);
      const baseToday = tasks.filter(isToday);
      if (!baseOver.length && !baseToday.length)
        return emptyState(Sun, copy.todayEmptyTitle, copy.todayEmptySub);
      const over = applyFilter(baseOver).sort(orderSort);
      const todays = applyFilter(baseToday).sort(orderSort);
      if (!over.length && !todays.length) return noMatchState();
      // Drag-reorder is offered only on the plain Today list — disabled while a search/date filter
      // is active (the list is a subset) or in multi-select mode (the card body owns the tap).
      const reorderDisabled = filterActive || selectMode;
      // Overdue prompt: only the caller's own overdue tasks are actionable (the bulk actions are
      // author-scoped server-side). Recurring tasks keep their next occurrence; one-offs move/delete.
      const ownedOverdueIds = baseOver
        .filter((t) => t.createdByUserId === currentUserId)
        .map((t) => t.id);
      const ownedOverdue = ownedOverdueIds.length;
      const selectedCount = overdueSelection.size;
      const allOverdueSelected = selectedCount === ownedOverdue && ownedOverdue > 0;

      const toggleOverdueTask = (task: TaskRecord) => {
        const next = new Set(overdueSelection);
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        setOverdueSelection(next);
      };
      const toggleAllOverdue = () =>
        setOverdueSelection(allOverdueSelected ? new Set() : new Set(ownedOverdueIds));

      const clearOverdue = () =>
        startOverdue(async () => {
          await dismissOverdueTasks([...overdueSelection]);
          setOverdueConfirm(false);
          setOverdueSelection(new Set());
        });
      return (
        <>
          {ownedOverdue > 0 && !filterActive && !selectMode ? (
            <div className="mb-3 rounded-[20px] border border-border bg-surface p-4 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.55)]">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-amber-50 text-amber-500">
                  <History className="size-[18px]" strokeWidth={2.1} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-extrabold leading-tight tracking-[-0.01em] text-foreground">
                    {copy.overduePromptTitle.replace("{count}", String(ownedOverdue))}
                  </p>
                  <p className="mt-1 text-[11.5px] font-medium leading-[1.45] text-muted-foreground">
                    {overdueConfirm ? copy.overduePromptConfirm : copy.overduePromptBody}
                  </p>
                </div>
              </div>
              <div className="mt-3.5 flex flex-col gap-2">
                {overdueConfirm ? (
                  <>
                    <button
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-rose-600 px-3 text-[13px] font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
                      disabled={overduePending}
                      onClick={clearOverdue}
                      type="button"
                    >
                      <Trash2 className="size-4 shrink-0" strokeWidth={2.1} aria-hidden="true" />
                      {copy.overduePromptConfirmYes}
                    </button>
                    <button
                      className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-2xl border border-border bg-background px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                      disabled={overduePending}
                      onClick={() => setOverdueConfirm(false)}
                      type="button"
                    >
                      {copy.overduePromptCancel}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-primary px-3 text-[13px] font-bold text-primary-foreground shadow-[0_10px_22px_-12px_hsl(var(--primary-hsl)/0.65)] transition-transform active:scale-[0.98] disabled:opacity-50"
                      disabled={overduePending || selectedCount === 0}
                      onClick={() => { setOverdueRescheduleOpen(true); setOverdueCustomMode(false); }}
                      type="button"
                    >
                      <CalendarDays className="size-4 shrink-0" strokeWidth={2.1} aria-hidden="true" />
                      {copy.overduePromptReschedule}{selectedCount > 0 ? ` ${selectedCount}건` : ""}
                    </button>
                    <button
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-border bg-background px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                      disabled={overduePending || selectedCount === 0}
                      onClick={() => setOverdueConfirm(true)}
                      type="button"
                    >
                      <Trash2 className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                      {copy.overduePromptDismiss}{selectedCount > 0 ? ` ${selectedCount}건` : ""}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {over.length > 0 ? (
            <>
              {/* Overdue section header with select-all toggle */}
              <div className="mb-2.5 mt-1 flex items-center gap-2 px-0.5">
                <span className="text-[11px] font-black uppercase tracking-[0.06em] text-rose-600">
                  {copy.secOverdue}
                </span>
                <span className="rounded-full bg-slate-100 px-[7px] py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
                  {over.length}
                </span>
                <span className="h-px flex-1 bg-border" />
                <button
                  className="text-[11px] font-bold text-primary transition-opacity active:opacity-60"
                  onClick={toggleAllOverdue}
                  type="button"
                >
                  {allOverdueSelected ? copy.overdueDeselectAll : copy.overdueSelectAll}
                </button>
              </div>
              <ReorderableTaskList
                cardProps={{
                  ...cardProps,
                  selectMode: true,
                  selectedIds: overdueSelection,
                  onToggleSelect: toggleOverdueTask,
                  swipe: false,
                }}
                disabled={true}
                items={over}
                onPersist={reorderTasks}
              />
            </>
          ) : null}
          {todays.length > 0 ? (
            <div className={over.length ? "mt-4" : ""}>
              {sectionHead(copy.secToday, todays.length)}
              <ReorderableTaskList
                cardProps={cardProps}
                disabled={reorderDisabled}
                items={todays}
                onPersist={reorderTasks}
              />
            </div>
          ) : null}
        </>
      );
    }

    // Tomorrow (내일): same shape/features as Today (drag-reorder, chip layout), filtered to tasks
    // anchored tomorrow. Swipe here pulls a task back to today (see swipeActionForView).
    if (view === "tomorrow") {
      const base = tasks.filter(isTomorrow);
      if (base.length === 0)
        return emptyState(Sunrise, copy.tomorrowEmptyTitle, copy.tomorrowEmptySub);
      const list = applyFilter(base).sort(orderSort);
      if (list.length === 0) return noMatchState();
      const reorderDisabled = filterActive || selectMode;
      return (
        <>
          {sectionHead(copy.secTomorrow, list.length)}
          <ReorderableTaskList
            cardProps={cardProps}
            disabled={reorderDisabled}
            items={list}
            onPersist={reorderTasks}
          />
        </>
      );
    }

    // Archive (보관함): every active todo, managed in one place. Newest first.
    if (view === "inbox") {
      const base = tasks.filter((t) => isActive(t));
      const list = applyFilter(base).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return (
        <>
          <p className="mb-3 px-0.5 text-[12px] font-medium text-muted-foreground">{copy.inboxHint}</p>
          {base.length === 0 ? (
            emptyState(Archive, copy.inboxEmptyTitle, copy.inboxEmptySub)
          ) : list.length === 0 ? (
            noMatchState()
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((t) => (
                <TaskCard key={t.id} task={t} {...cardProps} />
              ))}
            </div>
          )}
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

    // 완료/기록: every completed task, grouped by completion day (Tokyo), newest day first. Each
    // day header carries a 보고서 button that opens the AI daily-report sheet for that date.
    if (view === "completed") {
      // Regular completed tasks come from `tasks` (project tasks already excluded); project
      // completions are supplied separately. The filter pills pick which set(s) to show.
      const regularCompleted = tasks.filter((t) => t.status === "completed");
      const projectScoped =
        completedFilter === "project"
          ? projectCompletedTasks
          : completedFilter === "regular"
            ? regularCompleted
            : [...regularCompleted, ...projectCompletedTasks];
      if (regularCompleted.length === 0 && projectCompletedTasks.length === 0)
        return emptyState(CheckCircle2, copy.completedEmptyTitle, copy.completedEmptySub);
      const list = applyFilter(projectScoped);
      const byDay = new Map<string, TaskRecord[]>();
      for (const t of list) {
        const k = tokyoDateOf(t.completedAt) ?? "";
        if (!k) continue;
        byDay.set(k, [...(byDay.get(k) ?? []), t]);
      }
      const dayKeys = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));
      const filterPills = (
        <div className="mb-4 flex gap-2">
          {(["all", "regular", "project"] as const).map((f) => (
            <button
              className={cn(
                "inline-flex h-[34px] items-center whitespace-nowrap rounded-full border px-[15px] text-[12.5px] font-bold transition-colors",
                completedFilter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground",
              )}
              key={f}
              onClick={() => setCompletedFilter(f)}
              type="button"
            >
              {f === "all" ? copy.projects.filterAll : f === "regular" ? copy.projects.filterRegular : copy.projects.filterProject}
            </button>
          ))}
        </div>
      );
      if (list.length === 0)
        return (
          <>
            {filterPills}
            {noMatchState()}
          </>
        );
      return (
        <>
          {filterPills}
          <div className="flex flex-col gap-5">
            {dayKeys.map((k) => {
            const dayLabel = new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
              weekday: "short",
              timeZone: "Asia/Tokyo",
            }).format(new Date(`${k}T00:00:00+09:00`));
            const dayIsToday = k === today;
            const items = byDay
              .get(k)!
              .slice()
              .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
            return (
              <div key={k}>
                <div className="mb-2.5 flex items-center gap-2 px-0.5">
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
                    {copy.completedDayCount.replace("{count}", String(items.length))}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                  <button
                    className="inline-flex items-center gap-1 rounded-full bg-primary/[0.07] px-2.5 py-1 text-[11.5px] font-bold text-primary transition-colors hover:bg-primary/10"
                    onClick={() => setReportDate(k)}
                    type="button"
                  >
                    <FileText className="size-3.5" aria-hidden="true" />
                    {copy.reportButton}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((t) => (
                    <TaskCard key={t.id} task={t} showDate={false} swipe={false} {...cardProps} />
                  ))}
                </div>
              </div>
            );
          })}
          </div>
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
    const monthStart = `${monthPrefix}-01`;
    const monthEnd = `${monthPrefix}-${String(daysIn).padStart(2, "0")}`;
    const dated = tasks.filter((t) => isActive(t) && anchor(t));
    // Todoist-style virtual previews: a recurring task is a single row, but the calendar shows it
    // on every occurrence within the visible month (computed from its rule — no extra rows). Each
    // virtual occurrence points back to the same real task (tap/edit affects the series).
    const occurrences: { iso: string; task: TaskRecord }[] = [];
    for (const t of dated) {
      const a = anchor(t) as string;
      if (isStandardRecurrence(t.recurrenceRule)) {
        for (const iso of recurringOccurrencesInRange(t.recurrenceRule, a, monthStart, monthEnd)) {
          occurrences.push({ iso, task: t });
        }
      } else if (a >= monthStart && a <= monthEnd) {
        occurrences.push({ iso: a, task: t });
      }
    }
    const onDay = (iso: string) => occurrences.filter((o) => o.iso === iso).map((o) => o.task);

    const openDay = (iso: string) => {
      setCalDay(iso);
      setSheetOpen(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setSheetShown(true)));
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
                  isSel ? "bg-primary-foreground/80" : t.isShared ? "bg-primary" : "bg-amber-500",
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

    // Agenda for the shown month: occurrences grouped by day (recurring tasks expand virtually).
    const monthTasks = occurrences;
    const byDay = new Map<string, TaskRecord[]>();
    for (const o of occurrences) {
      byDay.set(o.iso, [...(byDay.get(o.iso) ?? []), o.task]);
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
                <span className="size-1.5 rounded-full bg-amber-500" />
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
    if (!hydrated) return null;
    return createPortal(
      <div
        className={cn(
          "fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 transition-opacity duration-300 motion-reduce:transition-none",
          sheetShown ? "opacity-100" : "opacity-0",
        )}
        onClick={closeDaySheet}
        style={daySheetDrag.scrimStyle}
      >
        <div
          className={cn(
            "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3",
            "transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
            sheetShown ? "translate-y-0" : "translate-y-full",
          )}
          data-sheet
          onClick={(e) => e.stopPropagation()}
          style={daySheetDrag.sheetStyle}
        >
          <div
            className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-slate-200"
            {...daySheetDrag.handleProps}
          />
          <div className="mb-3 flex items-center gap-2" {...daySheetDrag.handleProps}>
            <p className="text-[16px] font-black text-foreground">{label}</p>
            {list.length > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                {copy.calMonthTask.replace("{count}", String(list.length))}
              </span>
            ) : null}
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
      </div>,
      document.body,
    );
  }

  // Whole-list "select all" toggles every active task currently in the visible set.
  const selectableIds = tasks.filter(isActive).map((t) => t.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  return (
    <div className="relative min-h-[60vh] pb-24">
      {/* Selection bar replaces the tab chips while multi-selecting. */}
      {selectMode ? (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-border bg-surface px-2.5 py-2">
          <button
            aria-label={copy.cancel}
            className="flex size-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-foreground"
            onClick={exitSelect}
            type="button"
          >
            <X className="size-[18px]" aria-hidden="true" />
          </button>
          <span className="flex-1 text-[14px] font-extrabold text-foreground">
            {copy.selectedCountLabel.replace("{count}", String(selectedIds.size))}
          </span>
          <button
            className="rounded-full bg-primary/[0.07] px-3 py-1.5 text-[12.5px] font-bold text-primary transition-colors hover:bg-primary/10"
            onClick={() =>
              setSelectedIds(allSelected ? new Set() : new Set(selectableIds))
            }
            type="button"
          >
            {allSelected ? copy.selectClear : copy.selectAllLabel}
          </button>
        </div>
      ) : (
      /* Chip tabs */
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
            {tabCounts[t.key] > 0 ? (
              <span
                className={cn(
                  "inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold leading-none tabular-nums",
                  view === t.key ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary",
                )}
              >
                {tabCounts[t.key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      )}

      {/* Search / filter — list views only; Calendar + Projects provide their own controls. */}
      {!selectMode && view !== "calendar" && view !== "projects" ? (
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

      {/* Overdue reschedule sheet — rendered here (top-level return) so createPortal
          targets document.body without any IIFE/stacking-context interference. */}
      {overdueRescheduleOpen && (
        <BottomSheet
          onClose={() => { setOverdueRescheduleOpen(false); setOverdueCustomMode(false); }}
        >
          <div className="pb-2">
            <p className="mb-4 text-[16px] font-extrabold tracking-[-0.01em] text-foreground">
              {copy.overdueRescheduleTitle}
            </p>
            {overdueCustomMode ? (
              <div className="flex flex-col gap-3">
                {/* 미니 캘린더 — 월 헤더 */}
                <div className="flex items-center justify-between px-1">
                  <button
                    aria-label="이전 달"
                    className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-30"
                    disabled={overdueSelY === overdueY && overdueSelM === overdueM}
                    onClick={() => {
                      if (overdueSelM === 1) {
                        setOverdueCustomYear(overdueSelY - 1);
                        setOverdueCustomMonth(12);
                      } else {
                        setOverdueCustomMonth(overdueSelM - 1);
                      }
                      // 날짜는 그대로 유지 (범위 초과 시 overdueClampedD 가 자동 보정)
                    }}
                    type="button"
                  >
                    <ChevronLeft className="size-4 text-foreground" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                  <span className="text-[14px] font-extrabold text-foreground">
                    {new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
                      new Date(overdueSelY, overdueSelM - 1, 1)
                    )}
                  </span>
                  <button
                    aria-label="다음 달"
                    className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-muted/50"
                    onClick={() => {
                      if (overdueSelM === 12) {
                        setOverdueCustomYear(overdueSelY + 1);
                        setOverdueCustomMonth(1);
                      } else {
                        setOverdueCustomMonth(overdueSelM + 1);
                      }
                    }}
                    type="button"
                  >
                    <ChevronRight className="size-4 text-foreground" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
                {/* 요일 헤더 — 일요일 시작, Intl 로 로케일 자동 처리 */}
                <div className="grid grid-cols-7 text-center">
                  {Array.from({ length: 7 }, (_, i) =>
                    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
                      // 2000-01-02 is a Sunday; offset i gives Sun..Sat
                      new Date(2000, 0, 2 + i)
                    )
                  ).map((label, i) => (
                    <span key={i} className="text-[11px] font-semibold text-muted-foreground py-1">
                      {label}
                    </span>
                  ))}
                </div>
                {/* 날짜 그리드 — 6주 × 7일 */}
                {(() => {
                  // 해당 월 1일의 요일(0=일,1=월,...6=토)
                  const firstDow = new Date(overdueSelY, overdueSelM - 1, 1).getDay();
                  const totalDays = daysInMonth(overdueSelY, overdueSelM);
                  // 42칸: 앞쪽 빈 칸 + 날짜 + 뒤쪽 빈 칸
                  const cells: (number | null)[] = [
                    ...Array(firstDow).fill(null),
                    ...Array.from({ length: totalDays }, (_, i) => i + 1),
                  ];
                  while (cells.length < 42) cells.push(null);
                  const todayYmd = today;
                  return (
                    <div className="grid grid-cols-7 gap-y-0.5">
                      {cells.map((day, idx) => {
                        if (day === null) return <div key={idx} />;
                        const cellYmd = `${overdueSelY}-${String(overdueSelM).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const isPast = cellYmd < todayYmd;
                        const isToday = cellYmd === todayYmd;
                        const isSelected = day === overdueCustomDay && overdueSelY === overdueSelY && overdueSelM === overdueSelM;
                        return (
                          <button
                            key={idx}
                            aria-label={cellYmd}
                            aria-pressed={isSelected}
                            className={[
                              "mx-auto flex size-9 items-center justify-center rounded-full text-[13px] transition-colors",
                              isPast
                                ? "pointer-events-none text-slate-300"
                                : isSelected
                                  ? "bg-primary text-primary-foreground font-bold"
                                  : isToday
                                    ? "ring-2 ring-primary font-bold text-foreground hover:bg-muted/50"
                                    : "text-foreground hover:bg-muted/50",
                            ].join(" ")}
                            disabled={isPast}
                            onClick={() => setOverdueCustomDay(day)}
                            type="button"
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
                {/* 적용 / 취소 */}
                <button
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary text-[14px] font-bold text-primary-foreground shadow-[0_10px_22px_-12px_hsl(var(--primary-hsl)/0.65)] transition-transform active:scale-[0.98] disabled:opacity-40"
                  disabled={!overdueCustomValid || overduePending || overdueCustomDay === 0}
                  onClick={() => overdueCustomValid && rescheduleOverdue(overdueCustomYmd)}
                  type="button"
                >
                  {copy.overdueRescheduleApply}
                </button>
                <button
                  className="inline-flex h-10 w-full items-center justify-center rounded-2xl border border-border bg-background text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted/40"
                  onClick={() => setOverdueCustomMode(false)}
                  type="button"
                >
                  {copy.overduePromptCancel}
                </button>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
                {([
                  { label: copy.overdueRescheduleToday, icon: Sun, date: today },
                  { label: copy.overdueRescheduleTomorrow, icon: Sunrise, date: ymdShift(today, 1) },
                  { label: copy.overdueRescheduleNextMonday, icon: CalendarDays, date: nextMonday(today) },
                ] as const).map(({ label, icon: Icon, date }) => (
                  <button
                    key={date}
                    className="flex h-[52px] items-center gap-3 px-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60 disabled:opacity-50"
                    disabled={overduePending}
                    onClick={() => rescheduleOverdue(date)}
                    type="button"
                  >
                    <Icon className="size-[18px] shrink-0 text-primary" strokeWidth={2} aria-hidden="true" />
                    <span className="text-[14px] font-semibold text-foreground">{label}</span>
                    <span className="ml-auto text-[12px] text-muted-foreground">{date}</span>
                  </button>
                ))}
                <button
                  className="flex h-[52px] items-center gap-3 px-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
                  onClick={() => {
                    setOverdueCustomYear(overdueY);
                    setOverdueCustomMonth(overdueM);
                    setOverdueCustomDay(overdueD);
                    setOverdueCustomMode(true);
                  }}
                  type="button"
                >
                  <CalendarDays className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
                  <span className="text-[14px] font-semibold text-foreground">{copy.overdueRescheduleCustom}</span>
                </button>
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {/* Quick-add FAB — portaled to body so it stays viewport-fixed (the scroll
          container has a transform, which would otherwise trap `fixed` and let it
          drift on scroll/pull). Hidden while multi-selecting (the delete bar owns the bottom)
          and on the Projects tab (ProjectsBoard renders its own "프로젝트 만들기" FAB). */}
      {hydrated && !selectMode && view !== "projects"
        ? createPortal(
            <button
              aria-label={copy.quickAddTitle}
              className="fixed bottom-24 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_16px_30px_-10px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-[0.93]"
              onClick={openQuick}
              type="button"
            >
              <Plus className="size-6" strokeWidth={2.2} aria-hidden="true" />
            </button>,
            document.body,
          )
        : null}

      {quickMounted && hydrated
        ? createPortal(
        <div
          className={cn(
            "fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45 pb-[var(--keyboard-inset,0px)] transition-opacity duration-300 motion-reduce:transition-none",
            quickShown ? "opacity-100" : "opacity-0",
          )}
          onClick={closeQuick}
          style={quickDrag.scrimStyle}
        >
          <div
            className={cn(
              "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(22px,env(safe-area-inset-bottom))] pt-3",
              "transition-transform duration-[380ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
              quickShown ? "translate-y-0" : "translate-y-full",
            )}
            data-sheet
            onClick={(e) => e.stopPropagation()}
            style={quickDrag.sheetStyle}
          >
            <div
              className="mx-auto mb-3.5 h-1 w-[38px] rounded-full bg-slate-200"
              {...quickDrag.handleProps}
            />

            {/* 헤더 (닫기는 슬라이드/스크림으로 대체) */}
            <div className="mb-3.5" {...quickDrag.handleProps}>
              <p className="text-[16px] font-black text-foreground">{copy.quickAddTitle}</p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{copy.quickAddSub}</p>
            </div>

            <form action={quickCreateTask} className="space-y-3">
              <input
                autoFocus
                className="h-12 w-full rounded-2xl border border-border bg-muted px-4 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
                name="title"
                onChange={(e) => setQuickTitle(e.target.value)}
                placeholder={copy.quickAddPlaceholder}
                required
                value={quickTitle}
              />
              <div className="flex gap-2.5">
                {/* Full organized create — carries any typed title across so the capture isn't lost. */}
                <Link
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-[13.5px] font-bold text-foreground"
                  href={
                    quickTitle.trim()
                      ? `/mobile/tasks/new?title=${encodeURIComponent(quickTitle.trim())}`
                      : "/mobile/tasks/new"
                  }
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  {copy.quickAddDetailed}
                </Link>
                <button
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary text-[13.5px] font-extrabold text-primary-foreground transition-opacity disabled:opacity-40"
                  disabled={!quickTitle.trim()}
                  type="submit"
                >
                  <Inbox className="size-4" aria-hidden="true" />
                  {copy.quickAddSave}
                </button>
              </div>
              {/* 오늘/내일 탭에 바로 추가 — scheduled_date = today/tomorrow(Tokyo), 해당 탭으로 이동 */}
              <div className="flex gap-2.5">
                <button
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-[13.5px] font-bold text-foreground transition-colors active:bg-slate-50 disabled:opacity-40"
                  disabled={!quickTitle.trim()}
                  formAction={quickCreateTodayTask}
                  type="submit"
                >
                  <Sun className="size-4 text-amber-400" aria-hidden="true" />
                  {copy.quickAddToday}
                </button>
                <button
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-[13.5px] font-bold text-foreground transition-colors active:bg-slate-50 disabled:opacity-40"
                  disabled={!quickTitle.trim()}
                  formAction={quickCreateTomorrowTask}
                  type="submit"
                >
                  <Sunrise className="size-4 text-sky-500" aria-hidden="true" />
                  {copy.quickAddTomorrow}
                </button>
              </div>
            </form>
          </div>
        </div>,
            document.body,
          )
        : null}

      {/* Long-press context menu — quick Edit / Select / Delete for a single task. */}
      {pressTask && hydrated
        ? createPortal(
            <div
              className={cn(
                "fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 transition-opacity duration-200 motion-reduce:transition-none",
                pressShown ? "opacity-100" : "opacity-0",
              )}
              onClick={closePressMenu}
              style={pressDrag.scrimStyle}
            >
              <div
                className={cn(
                  "w-full max-w-[460px] rounded-t-[24px] bg-surface px-3.5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3",
                  "transition-transform duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
                  pressShown ? "translate-y-0" : "translate-y-full",
                )}
                data-sheet
                onClick={(e) => e.stopPropagation()}
                style={pressDrag.sheetStyle}
              >
                <div
                  className="mx-auto mb-2.5 h-1 w-[38px] rounded-full bg-slate-200"
                  {...pressDrag.handleProps}
                />
                <p
                  className="mb-1.5 truncate px-2.5 text-[12.5px] font-bold text-muted-foreground"
                  {...pressDrag.handleProps}
                >
                  {pressTask.title}
                </p>
                <div className="flex flex-col">
                  {pressTask.createdByUserId === currentUserId ? (
                    <button
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-[14.5px] font-bold text-foreground transition-colors active:bg-slate-50"
                      onClick={() => {
                        const id = pressTask.id;
                        closePressMenu();
                        router.push(`/mobile/tasks/${id}/edit`);
                      }}
                      type="button"
                    >
                      <Pencil className="size-[18px] text-muted-foreground" aria-hidden="true" />
                      {copy.actionEdit}
                    </button>
                  ) : null}
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-[14.5px] font-bold text-foreground transition-colors active:bg-slate-50"
                    onClick={() => {
                      const t = pressTask;
                      closePressMenu();
                      enterSelect(t);
                    }}
                    type="button"
                  >
                    <ListChecks className="size-[18px] text-muted-foreground" aria-hidden="true" />
                    {copy.actionSelect}
                  </button>
                  {pressTask.createdByUserId === currentUserId ? (
                    <button
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-left text-[14.5px] font-bold text-rose-600 transition-colors active:bg-rose-50"
                      onClick={() => {
                        const id = pressTask.id;
                        closePressMenu();
                        setConfirmIds([id]);
                      }}
                      type="button"
                    >
                      <Trash2 className="size-[18px]" aria-hidden="true" />
                      {copy.deleteAction}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Multi-select bottom action bar — batch delete (covers the tab bar). */}
      {selectMode && hydrated
        ? createPortal(
            <div className="fixed inset-x-0 bottom-0 z-[75] mx-auto flex max-w-[480px] gap-2.5 rounded-t-[22px] border border-b-0 border-border bg-surface px-4 pb-[max(22px,env(safe-area-inset-bottom))] pt-6 shadow-[0_-14px_36px_-12px_rgba(20,16,10,0.32)]">
              <button
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-600 text-[14.5px] font-extrabold text-white transition-opacity disabled:opacity-40"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmIds(Array.from(selectedIds))}
                type="button"
              >
                <Trash2 className="size-[18px]" aria-hidden="true" />
                {copy.deleteAction}
                {selectedIds.size > 0 ? ` ${selectedIds.size}` : ""}
              </button>
            </div>,
            document.body,
          )
        : null}

      {/* Delete confirm (single from the menu, or the multi-select batch). */}
      {confirmIds && hydrated ? (
        <BottomSheet
          ariaLabel={copy.bulkDeleteConfirmTitle}
          header={
            <>
              <p className="text-[16px] font-black text-foreground">{copy.bulkDeleteConfirmTitle}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {copy.bulkDeleteConfirmBody.replace("{count}", String(confirmIds.length))}
              </p>
            </>
          }
          onClose={() => setConfirmIds(null)}
        >
          {({ close }) => (
            <div className="mt-5 flex gap-2.5">
              <button
                className="h-11 flex-1 rounded-xl border border-border bg-surface text-[14px] font-bold text-foreground"
                onClick={close}
                type="button"
              >
                {copy.cancel}
              </button>
              <button
                className="h-11 flex-[1.4] rounded-xl bg-rose-600 text-[14px] font-extrabold text-white transition-opacity disabled:opacity-60"
                disabled={deleting}
                onClick={() => performDelete(confirmIds)}
                type="button"
              >
                {copy.deleteAction}
              </button>
            </div>
          )}
        </BottomSheet>
      ) : null}

      {/* Quick-complete undo toast — floats above the tab bar after a status-circle tap. */}
      {undoTask && hydrated
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[80] flex justify-center px-4">
              <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-slate-900 py-2.5 pl-4 pr-2.5 text-white shadow-[0_14px_36px_-12px_rgba(20,16,10,0.5)]">
                <span className="text-[13px] font-bold">{copy.completedToast}</span>
                <button
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[12.5px] font-extrabold text-white transition-colors active:bg-white/25"
                  onClick={handleUndo}
                  type="button"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {copy.undo}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* AI daily-report sheet (완료/기록 tab). Permission is enforced server-side; a non-staff tap
          surfaces the "권한 없음" popup inside the sheet. */}
      {reportDate && hydrated ? (
        <ReportSheet
          copy={copy}
          date={reportDate}
          locale={locale}
          onClose={() => setReportDate(null)}
        />
      ) : null}
    </div>
  );
}
