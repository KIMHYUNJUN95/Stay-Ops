"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  History,
  Inbox,
  ListChecks,
  Megaphone,
  Plus,
  Repeat,
  RotateCcw,
  Search,
  SearchX,
  SkipForward,
  Pencil,
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
  carryOverdueToToday,
  completeTask,
  deleteTasksInList,
  dismissOverdueTasks,
  reopenTask,
  reorderDateTasks,
  reorderTasks,
  rescheduleOverdueTo,
  restoreTask,
  skipOccurrenceOn,
  skipOverdueOccurrences,
  unskipOccurrenceOn,
} from "@/app/mobile/tasks/[id]/actions";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { TaskSchedulePicker } from "@/components/tasks/task-schedule-sheet";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import { repeatLabel, TaskCard } from "@/components/tasks/task-card";
import { ReorderableTaskList } from "@/components/tasks/reorderable-task-list";
import { ReportSheet } from "@/components/tasks/report-sheet";
import { ProjectsBoard } from "@/components/tasks/projects-board";
import { MiniCalendar } from "@/components/tasks/date-time-fields";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { ProjectSummary } from "@/lib/projects";
import type {
  OccurrenceOrderRecord,
  OccurrenceStateRecord,
  ShareableUser,
  TaskCompletionRecord,
  TaskRecord,
} from "@/lib/tasks";
import { myOwn, recvInstr, sentInstr } from "@/lib/task-directives";
import {
  isStandardRecurrence,
  type OccurrenceState,
  outstandingOverdueOccurrences,
  recurringOccurrencesInRange,
} from "@/lib/tasks-recurrence";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];
type View =
  | "today"
  | "tomorrow"
  | "inbox"
  | "projects"
  | "instr"
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
// 우선순위 사다리(2026-07-30, Todoist P1~P4): urgent > important > medium > normal(기본).
// 콘솔 `src/components/admin/tasks/helpers.ts` 의 PRIO_ORD 와 반드시 같아야 한다 — `medium` 이
// 빠져 있으면 폴백(3)으로 떨어져 normal 과 동점이 되고, 같은 작업이 두 화면에서 다르게 줄 선다.
const PRIO_ORD: Record<string, number> = { urgent: 0, important: 1, medium: 2, normal: 3 };

function stopSheetTouch(e: React.TouchEvent) {
  e.stopPropagation();
}

// Shift a YYYY-MM-DD (Tokyo) date string by `n` days, returning the same format.
function ymdShift(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// 반복 회차 카드 리스트(오늘/내일 뷰) — 각 카드는 그 날짜의 회차로 완료 처리(행 status 아님).
// viewBody(거대 IIFE) 밖으로 빼서 컴포넌트 크기를 낮추고(React Compiler 최적화 유지) 오늘·내일에서
// 동일하게 재사용한다.

export function TasksWorkspace({
  buildingLabels,
  completions,
  copy,
  currentUserId,
  initialView,
  locale,
  moveError,
  occurrenceOrders,
  occurrenceStates,
  projectCompletedTasks,
  projects,
  shareableUsers,
  tasks: allTasks,
  today,
}: {
  buildingLabels: Record<string, string>;
  /** 완료 로그(task_updates net). 완료·기록 탭과 그 배지의 유일한 기준 — @/lib/tasks 주석 참고. */
  completions: TaskCompletionRecord[];
  copy: Copy;
  currentUserId: string;
  initialView: View;
  locale: Locale;
  /** 이동이 거절된 이유(반복 회차 중복). 서버 액션이 쿼리로 돌려보낸다. */
  moveError?: string;
  /** 반복 회차의 날짜별 수동 순서(task_occurrence_order). 일회성은 tasks.sort_order 를 쓴다. */
  occurrenceOrders: OccurrenceOrderRecord[];
  occurrenceStates: OccurrenceStateRecord[];
  // Completed project tasks, supplied separately so the Completed tab's project filter can show
  // them. `tasks` itself excludes project tasks (they live only in the Projects tab).
  projectCompletedTasks: TaskRecord[];
  projects: ProjectSummary[];
  shareableUsers: ShareableUser[];
  tasks: TaskRecord[];
  today: string;
}) {
  const [view, setView] = useState<View>(initialView);
  /** 지시 탭 안의 받은/보낸 세그먼트. */
  const [instrTab, setInstrTab] = useState<"recv" | "sent">("recv");
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(() => new Set());
  const visibleTasks = useMemo(
    () => (hiddenTaskIds.size ? allTasks.filter((t) => !hiddenTaskIds.has(t.id)) : allTasks),
    [allTasks, hiddenTaskIds],
  );
  // 오늘/내일/관리함/캘린더/기록은 **내 일정**이다. 내가 보낸 지시는 대상자의 일정이므로 빼고,
  // "지시 › 보낸 지시"에서만 진행 상황을 본다(관리 콘솔 `myOwn` 과 같은 규칙 — @/lib/task-directives).
  // 받은 지시는 내 일정이므로 그대로 남는다.
  // useMemo 필수: 이 배열은 아래 회차 헬퍼들의 수동 메모이제이션 의존성으로 흘러가, 매 렌더 새
  // 배열이면 React Compiler 가 그 메모이제이션을 보존하지 못하고 컴포넌트 전체를 포기한다.
  const tasks = useMemo(
    () => visibleTasks.filter((t) => myOwn(t, currentUserId)),
    [visibleTasks, currentUserId],
  );
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
  // 캘린더에서 고정 반복(표준 반복) 회차 숨김 — 세션 상태(새로고침 시 초기화), 기본 표시.
  const [hideRecurring, setHideRecurring] = useState(false);
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
  // 이동 거절 안내 — 쿼리로 들어온 값을 한 번만 띄우고 URL 을 정리한다(새로고침 시 재노출 방지).
  const [moveNotice, setMoveNotice] = useState<string | null>(moveError ?? null);
  useEffect(() => {
    if (!moveNotice) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search.replace(/[?&]moveError=[^&]*/, "").replace(/^&/, "?"));
    const t = setTimeout(() => setMoveNotice(null), 4000);
    return () => clearTimeout(t);
  }, [moveNotice]);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [deleting, startDelete] = useTransition();

  // 이 카드가 렌더된 회차 날짜(반복 작업일 때만). 삭제 시 "그 날짜만 건너뛰기"를 제안하려면 필요하다.
  const [pressOcc, setPressOcc] = useState<string | null>(null);
  const openPressMenu = useCallback(
    (task: TaskRecord, occurrence?: { date: string; done: boolean }) => {
      setPressTask(task);
      setPressOcc(occurrence?.date ?? null);
      requestAnimationFrame(() => requestAnimationFrame(() => setPressShown(true)));
    },
    [],
  );
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

  /**
   * 반복 회차 건너뛰기 (2026-07-30).
   *
   * 목록의 삭제는 `tasks` 행을 지워 **모든 날짜**에서 사라지게 한다. 반복 작업에는 "오늘만 못 한다"가
   * 흔하므로, 반복 카드를 회차로 보고 있을 때는 삭제 대신 무엇을 지울지 먼저 묻는다(`recurDelete` 시트).
   * 건너뛴 회차는 `task_occurrence_state` 에 `skipped` 로 남고 반복 자체는 예정대로 계속된다.
   *
   * 낙관적 숨김은 하지 않는다 — 반복 회차 동작은 완료 토글과 마찬가지로 revalidate 후 목록이 다시
   * 그려지는 방식을 따른다(행이 아니라 회차라 `hiddenTaskIds` 로는 단위가 맞지 않는다).
   */
  const [recurDelete, setRecurDelete] = useState<{ task: TaskRecord; date: string } | null>(null);
  /** YYYY-MM-DD → "7/30 (목)". UTC 로 고정해 Tokyo 날짜 문자열이 하루 밀리지 않게 한다. */
  const shortDateLabel = useCallback(
    (ymd: string) =>
      new Intl.DateTimeFormat(locale, {
        month: "numeric",
        day: "numeric",
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(`${ymd}T00:00:00Z`)),
    [locale],
  );
  const [, startSkip] = useTransition();
  const [skipUndo, setSkipUndo] = useState<{ taskId: string; date: string } | null>(null);
  const skipUndoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSkipOccurrence = useCallback(
    (taskId: string, date: string) => {
      setRecurDelete(null);
      startSkip(async () => {
        await skipOccurrenceOn(taskId, date);
      });
      if (skipUndoTimer.current) clearTimeout(skipUndoTimer.current);
      setSkipUndo({ taskId, date });
      skipUndoTimer.current = setTimeout(() => setSkipUndo(null), 6000);
    },
    [],
  );
  const undoSkipOccurrence = useCallback(() => {
    setSkipUndo((cur) => {
      if (cur)
        startSkip(async () => {
          await unskipOccurrenceOn(cur.taskId, cur.date);
        });
      return null;
    });
  }, []);

  // --- Overdue prompt (Today tab): reschedule / clear past unfinished.
  const [overduePending, startOverdue] = useTransition();
  const [overdueConfirm, setOverdueConfirm] = useState(false);
  const [overdueRescheduleOpen, setOverdueRescheduleOpen] = useState(false);
  const [overdueSelection, setOverdueSelection] = useState<Set<string>>(new Set());
  /**
   * 지연 섹션의 일괄 선택 모드 (2026-07-31). 꺼져 있으면 지연 카드는 평범한 카드다 — 탭하면 상세가
   * 열리고 롱프레스로 메뉴가 뜬다. 예전엔 이 섹션이 항상 선택 모드로 렌더돼 카드가 통째로 죽어 있었다.
   */
  const [overdueSelectMode, setOverdueSelectMode] = useState(false);

  // --- Quick complete (status circle tap on any card) + undo toast.
  const [, startComplete] = useTransition();
  const [undoTask, setUndoTask] = useState<TaskRecord | null>(null);
  const [undoOcc, setUndoOcc] = useState<string | null>(null); // 반복 완료 undo 시 회차 날짜
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optimistically hide the row, then run the server action; revalidatePath refreshes the list with
  // the new status and we clear the hidden id. Completing shows an undo toast; reopening (in the
  // 완료/기록 tab, or via undo) is itself the correction, so it shows none.
  const runStatus = useCallback(
    (task: TaskRecord, complete: boolean, occurrenceDate?: string) => {
    // 반복 회차 행은 완료해도 목록에서 숨기지 않는다(occurrence 상태로 done 표시). 일회성만 낙관적 숨김.
    if (!occurrenceDate) setHiddenTaskIds((prev) => new Set(prev).add(task.id));
    startComplete(async () => {
      try {
        if (complete) await completeTask(task.id, occurrenceDate);
        else await reopenTask(task.id, occurrenceDate);
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
    (task: TaskRecord, occurrence?: { date: string; done: boolean }) => {
      const complete = occurrence ? !occurrence.done : task.status !== "completed";
      runStatus(task, complete, occurrence?.date);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (complete) {
        setUndoTask(task);
        setUndoOcc(occurrence?.date ?? null);
        undoTimer.current = setTimeout(() => setUndoTask(null), 4000);
      } else {
        setUndoTask(null);
        setUndoOcc(null);
      }
    },
    [runStatus],
  );
  const handleUndo = useCallback(() => {
    if (undoTask) runStatus(undoTask, false, undoOcc ?? undefined);
    setUndoTask(null);
    setUndoOcc(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [runStatus, undoTask, undoOcc]);

  // Delete undo: deleteTask soft-deletes then redirects to ?deleted=<id>. Show a "삭제했습니다 · 실행
  // 취소" toast that calls restoreTask. Guarded by a ref so it fires once per id (no re-show on refresh).
  const searchParams = useSearchParams();
  const [deletedUndoId, setDeletedUndoId] = useState<string | null>(null);
  const processedDelete = useRef<string | null>(null);
  useEffect(() => {
    const id = searchParams.get("deleted");
    if (!id || processedDelete.current === id) return;
    processedDelete.current = id;
    const raf = requestAnimationFrame(() => setDeletedUndoId(id));
    const t = setTimeout(() => setDeletedUndoId((cur) => (cur === id ? null : cur)), 5500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [searchParams]);
  const handleRestore = useCallback(() => {
    setDeletedUndoId((id) => {
      if (id)
        startComplete(async () => {
          await restoreTask(id);
          router.refresh();
        });
      return null;
    });
  }, [router]);

  // 완료/기록 tab: daily-report sheet target date (the day-group whose 보고서 button was tapped).
  const [reportDate, setReportDate] = useState<string | null>(null);
  // 완료/기록 tab: regular vs. project completions filter. Project tasks don't exist yet
  // (data layer deferred), so "project" currently resolves to an empty set.
  const [completedFilter, setCompletedFilter] = useState<"all" | "regular" | "project">("all");

  // Tokyo "tomorrow" (today + 1), used by the Tomorrow tab + its swipe defer action.
  // Memoized: as a plain render const it flows into occurrence helpers in a way the React Compiler
  // couldn't reconcile with their manual memoization (bailed the whole component).
  const tomorrowDate = useMemo(() => ymdShift(today, 1), [today]);
  const isActive = (t: TaskRecord) => t.status !== "completed" && t.status !== "cancelled";
  const dueDateOf = (t: TaskRecord) => tokyoDateOf(t.dueAt);
  // 반복 회차 상태(2026-07-30): taskId → (date → state). 완료/지연 판정에 사용.
  const occByTask = useMemo(() => {
    const m = new Map<string, Map<string, OccurrenceState>>();
    for (const s of occurrenceStates) {
      const inner = m.get(s.taskId) ?? new Map<string, OccurrenceState>();
      inner.set(s.occurrenceDate, s.state);
      m.set(s.taskId, inner);
    }
    return m;
  }, [occurrenceStates]);
  const occStateOf = useCallback(
    (taskId: string, date: string): OccurrenceState | undefined => occByTask.get(taskId)?.get(date),
    [occByTask],
  );
  // 날짜별 반복 회차 순서: `${taskId}|${date}` → sort_order.
  const occOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of occurrenceOrders) m.set(`${o.taskId}|${o.occurrenceDate}`, o.sortOrder);
    return m;
  }, [occurrenceOrders]);
  /**
   * 한 날짜 목록의 정렬 키 — 일회성은 `tasks.sort_order`, 반복은 그 날짜의 회차 순서.
   * 저장처가 둘이라 읽을 때 다시 합친다(2026-07-30 B안). 수동 위치가 없으면 null 로 두고
   * 호출부가 우선순위 폴백을 태운다.
   */
  const dateOrderOf = useCallback(
    (t: TaskRecord, date: string): number | null =>
      isStandardRecurrence(t.recurrenceRule)
        ? occOrderMap.get(`${t.id}|${date}`) ?? null
        : t.sortOrder,
    [occOrderMap],
  );
  const resolvedDatesFor = useCallback(
    (taskId: string): Set<string> => new Set(occByTask.get(taskId)?.keys() ?? []),
    [occByTask],
  );
  const anchor = (t: TaskRecord) => dueDateOf(t) ?? t.scheduledDate ?? null;
  // 반복은 규칙으로 회차 계산, 비반복은 앵커 하루.
  const occursOn = (t: TaskRecord, ymd: string) => {
    const a = anchor(t);
    if (!a) return false;
    if (isStandardRecurrence(t.recurrenceRule))
      return recurringOccurrencesInRange(t.recurrenceRule, a, ymd, ymd).length > 0;
    return a === ymd;
  };
  // 이 날짜에 미완료 반복 회차가 떠야 하는가(완료 회차 제외).
  // 상태 행이 있으면 그 회차는 **해결된 것**이다 — completed(완료) · skipped(건너뜀) · moved(가져옴).
  // 예전엔 completed 만 걸러서, 건너뛴 회차가 그대로 목록에 남았을 것이다(2026-07-30 회차 건너뛰기
  // 도입 시 발견). `outstandingOverdueOccurrences` 의 "행이 있으면 해결" 규약과도 이제 일치한다.
  const openOccursOn = (t: TaskRecord, ymd: string) =>
    isActive(t) &&
    isStandardRecurrence(t.recurrenceRule) &&
    occursOn(t, ymd) &&
    !occStateOf(t.id, ymd);
  // 미해결 지연 회차 날짜들(과거·상태 없음).
  const overdueOccDates = (t: TaskRecord) =>
    isStandardRecurrence(t.recurrenceRule)
      ? outstandingOverdueOccurrences(t.recurrenceRule, anchor(t), today, resolvedDatesFor(t.id))
      : [];
  // 날짜 버킷 술어는 일회성 전용(반복 제외). 반복은 위 occurrence 헬퍼로 따로 처리.
  const isOverdue = (t: TaskRecord) =>
    isActive(t) &&
    !isStandardRecurrence(t.recurrenceRule) &&
    !!dueDateOf(t) &&
    dueDateOf(t)! < today;
  const isToday = (t: TaskRecord) =>
    isActive(t) &&
    !isStandardRecurrence(t.recurrenceRule) &&
    !isOverdue(t) &&
    (t.scheduledDate === today || dueDateOf(t) === today);
  // Tomorrow tab: active tasks anchored to tomorrow (scheduled or due). Future-dated, so never
  // overdue. Mirrors isToday so a task can't fall through the IA between the two day tabs.
  const isTomorrow = (t: TaskRecord) =>
    isActive(t) &&
    !isStandardRecurrence(t.recurrenceRule) &&
    (t.scheduledDate === tomorrowDate || dueDateOf(t) === tomorrowDate);
  // "다음: {날짜}" for the just-completed recurring task (its next occurrence after today).
  const undoSub = (() => {
    if (!undoTask || !isStandardRecurrence(undoTask.recurrenceRule)) return undefined;
    const a = anchor(undoTask);
    if (!a) return undefined;
    const next = recurringOccurrencesInRange(
      undoTask.recurrenceRule,
      a,
      ymdShift(today, 1),
      ymdShift(today, 366),
    )[0];
    if (!next) return undefined;
    const label =
      next === ymdShift(today, 1)
        ? copy.viewTomorrow
        : new Intl.DateTimeFormat(locale, {
            month: "numeric",
            day: "numeric",
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(`${next}T00:00:00Z`));
    return copy.nextLabel.replace("{date}", label);
  })();
  const prioSort = (a: TaskRecord, b: TaskRecord) =>
    (PRIO_ORD[a.priority] ?? 3) - (PRIO_ORD[b.priority] ?? 3);
  /** 하루 안의 정렬 — 시간이 있는 항목이 먼저(빠른 시각 순), 없으면 우선순위. 콘솔 `tasksOn` 과 동일. */
  const timeThenPrio = (a: TaskRecord, b: TaskRecord) =>
    (a.timeLabel ?? "99").localeCompare(b.timeLabel ?? "99") || prioSort(a, b);
  // Today-view ordering: a manual drag-reorder (sort_order) wins; unranked tasks (sort_order null)
  // fall back to priority, preserving the original behaviour until the user drags. Ranked tasks
  // always sort before unranked ones.
  /**
   * 한 날짜의 일회성 + 반복 회차를 하나의 배열로 합쳐 정렬한다.
   * 수동 위치가 있는 항목이 먼저(작은 인덱스 순), 없는 항목은 뒤에서 우선순위 폴백.
   */
  const mergeByDateOrder = useCallback(
    (oneOff: TaskRecord[], recurring: TaskRecord[], date: string): TaskRecord[] =>
      [...oneOff, ...recurring].sort((a, b) => {
        const ao = dateOrderOf(a, date);
        const bo = dateOrderOf(b, date);
        if (ao != null && bo != null) return ao !== bo ? ao - bo : prioSort(a, b);
        if (ao != null) return -1;
        if (bo != null) return 1;
        return prioSort(a, b);
      }),
    [dateOrderOf],
  );
  const orderSort = (a: TaskRecord, b: TaskRecord) => {
    const ao = a.sortOrder;
    const bo = b.sortOrder;
    if (ao != null && bo != null) return ao !== bo ? ao - bo : prioSort(a, b);
    if (ao != null) return -1;
    if (bo != null) return 1;
    return prioSort(a, b);
  };
  // Inbox ordering: manual drag (sort_order) wins; unranked fall back to **newest-first** so a freshly
  // created task still lands on top until the user drags it. (Today uses prio fallback via orderSort.)
  const inboxOrderSort = (a: TaskRecord, b: TaskRecord) => {
    const ao = a.sortOrder;
    const bo = b.sortOrder;
    if (ao != null && bo != null) return ao !== bo ? ao - bo : b.createdAt.localeCompare(a.createdAt);
    if (ao != null) return -1;
    if (bo != null) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  };

  // --- First-slice search / filter: title + author text, and anchor-date single/range.
  // One shared lightweight state across the list views; the date filter reuses the same
  // `anchor()` (due wins over scheduled, Tokyo) used for grouping/listing/calendar.
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [activeDatePicker, setActiveDatePicker] = useState<"single" | "from" | "to">("single");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const q = search.trim().toLowerCase();
  const hasSearch = q.length > 0;
  const hasDate = dateMode === "single" ? !!dateFrom : !!dateFrom || !!dateTo;
  const filterActive = hasSearch || hasDate;

  const matchesFilter = (t: TaskRecord) => {
    if (hasSearch) {
      // case-insensitive partial match across title + author name + tags. 태그는 콘솔
      // (`helpers.ts` matchQuery)이 이미 검색 대상이라, 빠져 있으면 "#체크아웃" 으로 찾던 작업이
      // 모바일에서만 안 나온다. 필드를 이어붙이지 않고 각각 확인해 경계를 넘는 오탐을 막는다.
      if (
        !t.title.toLowerCase().includes(q) &&
        !t.authorName.toLowerCase().includes(q) &&
        !t.tags.some((g) => g.toLowerCase().includes(q))
      )
        return false;
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
  // 항상 **새 배열**을 돌려준다. 호출부가 곧바로 `.sort()` 로 제자리 정렬을 하는데, 필터가 꺼져
  // 있을 때 원본을 그대로 넘기면 뷰 밖에서 공유하는 base 목록(`todayBase` 등)을 뒤섞게 된다.
  const applyFilter = (list: TaskRecord[]) =>
    filterActive ? list.filter(matchesFilter) : list.slice();
  const clearFilters = () => {
    setSearch("");
    setDateMode("single");
    setActiveDatePicker("single");
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
  const activeDateValue =
    dateMode === "range" && activeDatePicker === "to" ? dateTo : dateFrom;
  const setActiveDateValue = (nextValue: string) => {
    if (dateMode === "range" && activeDatePicker === "to") {
      setDateTo(nextValue);
    } else {
      setDateFrom(nextValue);
    }
  };

  const tabs: { key: View; label: string; icon: typeof Sun }[] = [
    { key: "today", label: copy.viewToday, icon: Sun },
    { key: "tomorrow", label: copy.viewTomorrow, icon: Sunrise },
    { key: "inbox", label: copy.viewInbox, icon: Archive },
    { key: "projects", label: copy.viewProjects, icon: FolderOpen },
    { key: "instr", label: copy.viewInstr, icon: Megaphone },
    { key: "completed", label: copy.viewCompleted, icon: CheckCircle2 },
    { key: "calendar", label: copy.viewCalendar, icon: CalendarDays },
  ];

  // Swipe defer/pull action per view: Today → push to tomorrow; everywhere else → pull to today
  // (in the Tomorrow tab this means "do it today"). Sent/Calendar render with swipe disabled.
  const swipeActionForView: "today" | "tomorrow" = view === "today" ? "tomorrow" : "today";

  const cardProps = {
    buildingLabels,
    copy,
    locale,
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

  // 지시 목록 — `tasks` 는 보낸 지시를 이미 뺐으므로 원본(`visibleTasks`)에서 뽑는다.
  const recvInstrTasks = visibleTasks.filter((t) => recvInstr(t, currentUserId));
  const sentInstrTasks = visibleTasks.filter((t) => sentInstr(t, currentUserId));
  /** 아직 손대지 않은 받은 지시 = 탭 배지. 탭을 열지 않아도 밀린 지시가 보인다. */
  const recvUnconfirmed = recvInstrTasks.filter((t) => t.status === "open").length;

  // ── 뷰별 base 목록 ────────────────────────────────────────────────────────────────
  // 뷰 본문(`viewBody`)·탭 배지·"전체 선택"이 **같은 배열**을 보도록 뷰 밖에서 한 번만 계산한다.
  // 예전에는 셋이 각자 필터를 다시 써서, 오늘 탭에 3건이 보이는데 배지는 다른 수를 쓰고 삭제 확인창은
  // 관리함까지 포함한 83건을 말하는 상태였다(2026-07-31 수정).
  const todayOverdueBase = tasks.filter(isOverdue);
  const todayBase = tasks.filter(isToday);
  // 반복 회차: 오늘 미완료 회차 + 반복 지연 backlog(작업별 1건).
  const todayRecBase = tasks.filter((t) => openOccursOn(t, today));
  const todayRecOverdueBase = tasks.filter((t) => overdueOccDates(t).length > 0);
  const tomorrowBase = tasks.filter(isTomorrow);
  const tomorrowRecBase = tasks.filter((t) => openOccursOn(t, tomorrowDate));
  const inboxBase = tasks.filter((t) => isActive(t));
  // 지연 일괄 처리는 작성자 본인 것만 서버가 받아준다 — 남의 작업을 대상에 넣으면 버튼의 건수와
  // 실제 처리 건수가 갈린다. 일정 변경 핸들러도 같은 목록을 봐야 해서 뷰 밖에 둔다.
  const ownedOverdueIds = todayOverdueBase
    .filter((t) => t.createdByUserId === currentUserId)
    .map((t) => t.id);

  // Overdue bulk reschedule handler — applies the chosen date to every targeted overdue task.
  // The date is picked in the shared TaskSchedulePicker (date variant) rendered at the top-level
  // return. 선택 모드가 아니면 내 지연 전체가 대상(오늘 뷰의 `overdueTargets` 와 같은 규칙).
  const rescheduleOverdue = (targetDate: string) =>
    startOverdue(async () => {
      await rescheduleOverdueTo(
        targetDate,
        overdueSelectMode ? [...overdueSelection] : ownedOverdueIds,
      );
      setOverdueRescheduleOpen(false);
      setOverdueSelectMode(false);
      setOverdueSelection(new Set());
    });

  // 완료·기록 — 완료 **로그**(task_updates net) 기준. 2026-07-30 롤포워드 폐지 이후 반복 완료는
  // 행의 status 를 건드리지 않고 `task_occurrence_state` + 로그에만 남으므로, status=completed 만
  // 보면 반복 완료가 목록에서 통째로 사라진다. 같은 화면의 업무일지 버튼은 이미 같은 로그를 읽고
  // 있어서, 목록엔 없는 작업이 보고서엔 찍히고 그날 완료가 반복뿐이면 날짜 그룹조차 안 생겼다.
  // 콘솔 `completedView` 와 같은 소스를 쓴다.
  const completedTaskById = new Map<string, TaskRecord>();
  for (const t of tasks) completedTaskById.set(t.id, t);
  for (const t of projectCompletedTasks) completedTaskById.set(t.id, t);
  const completionRows = completions
    .map((c) => ({ completion: c, task: completedTaskById.get(c.taskId) }))
    .filter((r): r is { completion: TaskCompletionRecord; task: TaskRecord } => !!r.task);

  // Per-tab counts (same base lists as each view).
  const tabCounts: Record<View, number> = {
    // 목록의 **줄 수**와 맞춘다: 반복 지연 backlog 와 오늘 회차를 동시에 가진 작업은 두 줄로
    // 렌더되므로 2로 세야 한다(콘솔 `todayCount` 와 같은 섹션별 합산 — 한 번의 filter 로 세면 1).
    today:
      todayOverdueBase.length +
      todayBase.length +
      todayRecBase.length +
      todayRecOverdueBase.length,
    tomorrow: tomorrowBase.length + tomorrowRecBase.length,
    // Archive = every active todo in one management list.
    inbox: inboxBase.length,
    // Projects badge stays 0 until the Projects data layer lands (deferred).
    projects: 0,
    instr: recvUnconfirmed,
    // Completed badge = today's (Tokyo) completions, from the same completion log the list uses.
    completed: completionRows.filter((r) => r.completion.day === today).length,
    calendar: 0,
  };

  // 캘린더 — 보고 있는 달의 회차 목록. 그리드 마커·선택된 날짜·월 아젠다·"전체 선택"이 모두 이
  // 배열 하나를 본다(예전엔 `renderCalendar` 안에서만 계산해 바깥에서 다시 쓸 수 없었다).
  const calMonthPrefix = `${calMonth.y}-${String(calMonth.m).padStart(2, "0")}`;
  const calDaysIn = new Date(Date.UTC(calMonth.y, calMonth.m, 0)).getUTCDate();
  const calMonthStart = `${calMonthPrefix}-01`;
  const calMonthEnd = `${calMonthPrefix}-${String(calDaysIn).padStart(2, "0")}`;
  // Todoist-style virtual previews: a recurring task is a single row, but the calendar shows it
  // on every occurrence within the visible month (computed from its rule — no extra rows). Each
  // virtual occurrence points back to the same real task (tap/edit affects the series).
  const calOccurrences: { iso: string; task: TaskRecord }[] = [];
  for (const t of tasks) {
    if (!isActive(t)) continue;
    const a = anchor(t);
    if (!a) continue;
    if (isStandardRecurrence(t.recurrenceRule)) {
      if (hideRecurring) continue; // "반복 숨기기" 토글: 고정 반복 회차 제외.
      for (const iso of recurringOccurrencesInRange(t.recurrenceRule, a, calMonthStart, calMonthEnd))
        calOccurrences.push({ iso, task: t });
    } else if (a >= calMonthStart && a <= calMonthEnd) {
      calOccurrences.push({ iso: a, task: t });
    }
  }
  // 하루 안 정렬은 시각 → 우선순위(콘솔 `tasksOn` 과 동일 규칙). 정렬을 빼면 서버가 준
  // created_at desc 가 그대로 남아, 같은 날의 09:00 과 18:00 이 뒤죽박죽으로 읽힌다.
  const calByDay = new Map<string, TaskRecord[]>();
  for (const o of calOccurrences) calByDay.set(o.iso, [...(calByDay.get(o.iso) ?? []), o.task]);
  for (const list of calByDay.values()) list.sort(timeThenPrio);

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
      if (
        !todayOverdueBase.length &&
        !todayBase.length &&
        !todayRecBase.length &&
        !todayRecOverdueBase.length
      )
        return emptyState(Sun, copy.todayEmptyTitle, copy.todayEmptySub);
      const over = applyFilter(todayOverdueBase).sort(orderSort);
      const todays = applyFilter(todayBase).sort(orderSort);
      const recToday = applyFilter(todayRecBase).sort(orderSort);
      const recOverdue = applyFilter(todayRecOverdueBase).sort(orderSort);
      if (!over.length && !todays.length && !recToday.length && !recOverdue.length)
        return noMatchState();
      // Drag-reorder is offered only on the plain Today list — disabled while a search/date filter
      // is active (the list is a subset) or in multi-select mode (the card body owns the tap).
      const reorderDisabled = filterActive || selectMode;
      // Overdue prompt: only the caller's own overdue tasks are actionable (the bulk actions are
      // author-scoped server-side). Recurring tasks keep their next occurrence; one-offs move/delete.
      const ownedOverdue = ownedOverdueIds.length;
      /**
       * 일괄 처리 대상 (2026-07-31).
       *
       * 지연 카드는 예전에 **항상** selectMode 로 렌더돼서, 탭하면 선택 토글이 되고 롱프레스가 죽었다.
       * 남이 만든 지연 작업은 토글마저 무시돼(작성자만 대상) 카드를 눌러도 아무 반응이 없었다.
       * 이제 기본은 평범한 카드(탭 → 상세, 롱프레스 → 메뉴)이고, 섹션 헤더의 "전체 선택"으로만
       * 일괄 선택 모드에 들어간다. 선택 모드가 아니면 프롬프트 버튼은 내 지연 전체를 대상으로 한다 —
       * 프롬프트 제목("지연된 N건")이 말하는 범위 그대로라, 선택을 안 해도 버튼이 죽지 않는다.
       */
      const overdueTargets = overdueSelectMode ? [...overdueSelection] : ownedOverdueIds;
      const selectedCount = overdueSelectMode ? overdueSelection.size : 0;

      const toggleOverdueTask = (task: TaskRecord) => {
        // Only the caller's own overdue tasks are actionable (bulk actions are author-scoped
        // server-side), so non-owned rows must not enter the selection — otherwise the button
        // count would include items the server silently ignores.
        if (task.createdByUserId !== currentUserId) return;
        const next = new Set(overdueSelection);
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        setOverdueSelection(next);
      };
      // 진입 시 내 지연을 전부 선택해 둔다(가장 흔한 의도). 빠질 것만 탭으로 해제하면 된다.
      const toggleOverdueSelectMode = () => {
        if (overdueSelectMode) {
          setOverdueSelectMode(false);
          setOverdueSelection(new Set());
        } else {
          setOverdueSelectMode(true);
          setOverdueSelection(new Set(ownedOverdueIds));
        }
      };

      const clearOverdue = () =>
        startOverdue(async () => {
          await dismissOverdueTasks(overdueTargets);
          setOverdueConfirm(false);
          setOverdueSelectMode(false);
          setOverdueSelection(new Set());
        });
      // 반복 지연 backlog(작업별 1건): 오늘로 가져오기 / 삭제(skip). 서버가 revalidate.
      const carryRec = (id: string) =>
        startOverdue(async () => {
          await carryOverdueToToday(id);
        });
      const skipRec = (id: string) =>
        startOverdue(async () => {
          await skipOverdueOccurrences(id);
        });
      const recOverdueGroup = (t: TaskRecord) => (
        <div
          key={`od-${t.id}`}
          className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3.5 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-foreground">{t.title}</p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-rose-600">
              {copy.odDaysBehind.replace("{n}", String(overdueOccDates(t).length))}
            </p>
          </div>
          <button
            className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[12px] font-bold text-primary-foreground disabled:opacity-50"
            disabled={overduePending}
            onClick={() => carryRec(t.id)}
            type="button"
          >
            {copy.odCarry}
          </button>
          <button
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-muted-foreground disabled:opacity-50"
            disabled={overduePending}
            onClick={() => skipRec(t.id)}
            type="button"
          >
            {copy.odSkip}
          </button>
        </div>
      );
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
                      disabled={overduePending || overdueTargets.length === 0}
                      onClick={() => setOverdueRescheduleOpen(true)}
                      type="button"
                    >
                      <CalendarDays className="size-4 shrink-0" strokeWidth={2.1} aria-hidden="true" />
                      {copy.overduePromptReschedule}
                      {selectedCount > 0 ? ` ${copy.selectedCountLabel.replace("{count}", String(selectedCount))}` : ""}
                    </button>
                    <button
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-border bg-background px-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                      disabled={overduePending || overdueTargets.length === 0}
                      onClick={() => setOverdueConfirm(true)}
                      type="button"
                    >
                      <Trash2 className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
                      {copy.overduePromptDismiss}
                      {selectedCount > 0 ? ` ${copy.selectedCountLabel.replace("{count}", String(selectedCount))}` : ""}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {over.length > 0 ? (
            <>
              {/* Overdue section header. The button enters/leaves 지연 일괄 선택 모드 — 전역
                  선택 모드(상단 선택 바)일 때는 그쪽이 목록 전체를 이미 쥐고 있어 숨긴다. */}
              <div className="mb-2.5 mt-1 flex items-center gap-2 px-0.5">
                <span className="text-[11px] font-black uppercase tracking-[0.06em] text-rose-600">
                  {copy.secOverdue}
                </span>
                <span className="rounded-full bg-slate-100 px-[7px] py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
                  {over.length}
                </span>
                <span className="h-px flex-1 bg-border" />
                {/* 검색/날짜 필터 중에는 목록이 부분집합이라 숨긴다 — 안 그러면 화면에 없는
                    지연 작업까지 선택된다(같은 이유로 위 프롬프트도 이때 숨는다). */}
                {!selectMode && !filterActive && ownedOverdue > 0 ? (
                  <button
                    className="text-[11px] font-bold text-primary transition-opacity active:opacity-60"
                    onClick={toggleOverdueSelectMode}
                    type="button"
                  >
                    {overdueSelectMode ? copy.overdueDeselectAll : copy.overdueSelectAll}
                  </button>
                ) : null}
              </div>
              {/* 일괄 선택 모드에서만 체크박스 카드가 된다. 그 밖에는 전역 cardProps 그대로 —
                  탭하면 상세가 열리고 롱프레스로 메뉴가 뜬다(전역 선택 모드도 그대로 통과). */}
              <ReorderableTaskList
                cardProps={
                  overdueSelectMode && !selectMode
                    ? {
                        ...cardProps,
                        selectMode: true,
                        selectedIds: overdueSelection,
                        onToggleSelect: toggleOverdueTask,
                        swipe: false,
                      }
                    : { ...cardProps, swipe: false }
                }
                disabled={true}
                items={over}
                onPersist={reorderTasks}
              />
            </>
          ) : null}
          {recOverdue.length > 0 ? (
            <div className={over.length ? "mt-4" : ""}>
              {over.length === 0 ? sectionHead(copy.secOverdue, recOverdue.length) : null}
              <div className="flex flex-col gap-2">{recOverdue.map(recOverdueGroup)}</div>
            </div>
          ) : null}
          {(todays.length > 0 || recToday.length > 0) ? (
            <div className={over.length || recOverdue.length ? "mt-4" : ""}>
              {sectionHead(copy.secToday, todays.length + recToday.length)}
              {/* 일회성과 반복 회차를 **하나의 순서 공간**으로 합쳐 렌더한다(2026-07-30 B안).
                  전에는 두 목록으로 갈라 반복 카드에만 드래그 핸들이 없었다. */}
              <ReorderableTaskList
                cardProps={cardProps}
                disabled={reorderDisabled}
                items={mergeByDateOrder(todays, recToday, today)}
                occurrenceDate={today}
                onPersistDate={reorderDateTasks}
              />
            </div>
          ) : null}
        </>
      );
    }

    // Tomorrow (내일): same shape/features as Today (drag-reorder, chip layout), filtered to tasks
    // anchored tomorrow. Swipe here pulls a task back to today (see swipeActionForView).
    if (view === "tomorrow") {
      if (tomorrowBase.length === 0 && tomorrowRecBase.length === 0)
        return emptyState(Sunrise, copy.tomorrowEmptyTitle, copy.tomorrowEmptySub);
      const list = applyFilter(tomorrowBase).sort(orderSort);
      const recList = applyFilter(tomorrowRecBase).sort(orderSort);
      if (list.length === 0 && recList.length === 0) return noMatchState();
      const reorderDisabled = filterActive || selectMode;
      return (
        <>
          {sectionHead(copy.secTomorrow, list.length + recList.length)}
          <ReorderableTaskList
            cardProps={cardProps}
            disabled={reorderDisabled}
            items={mergeByDateOrder(list, recList, tomorrowDate)}
            occurrenceDate={tomorrowDate}
            onPersistDate={reorderDateTasks}
          />
        </>
      );
    }

    // Archive (보관함): every active todo, managed in one place. Newest first.
    if (view === "inbox") {
      const base = inboxBase;
      // 관리함은 수동 드래그 순서를 허용(2026-07-30). 랭크된(드래그된) 작업이 위, 미랭크는 최신순
      // (새 작업 top 유지). 드래그는 검색/필터·선택 모드가 아닐 때만.
      const list = applyFilter(base).sort(inboxOrderSort);
      const reorderDisabled = filterActive || selectMode;
      return (
        <>
          <p className="mb-3 px-0.5 text-[12px] font-medium text-muted-foreground">{copy.inboxHint}</p>
          {base.length === 0 ? (
            emptyState(Archive, copy.inboxEmptyTitle, copy.inboxEmptySub)
          ) : list.length === 0 ? (
            noMatchState()
          ) : (
            <ReorderableTaskList
              cardProps={cardProps}
              disabled={reorderDisabled}
              items={list}
              onPersist={reorderTasks}
            />
          )}
        </>
      );
    }

    // 지시 — 받은/보낸 세그먼트. 상태 그룹은 관리 콘솔 `recvView`/`sentView` 와 같은 순서를 쓴다
    // (지연 → 미확인 → 진행 중 → 완료). 사무실과 현장이 같은 분류를 보게 하는 것이 이 화면의 핵심.
    if (view === "instr") {
      const recv = instrTab === "recv";
      const base = recv ? recvInstrTasks : sentInstrTasks;
      const segment = (
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[13px] bg-slate-100 p-1">
          {(
            [
              ["recv", copy.instrRecv, Bell, recvUnconfirmed],
              ["sent", copy.instrSent, Megaphone, sentInstrTasks.filter((t) => t.status !== "completed").length],
            ] as const
          ).map(([key, label, Icon, n]) => (
            <button
              className={cn(
                "inline-flex h-[38px] items-center justify-center gap-1.5 rounded-[9px] text-[12.5px] font-extrabold transition-colors",
                instrTab === key
                  ? "bg-surface text-foreground shadow-[0_1px_4px_rgba(20,32,43,0.12)]"
                  : "text-slate-500",
              )}
              key={key}
              onClick={() => setInstrTab(key)}
              type="button"
            >
              <Icon className="size-[15px]" aria-hidden="true" />
              {label}
              {n > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10.5px] font-extrabold leading-none tabular-nums",
                    instrTab === key ? "bg-primary text-primary-foreground" : "bg-slate-200 text-slate-600",
                  )}
                >
                  {n}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      );
      const note = (
        <p className="mb-3 px-0.5 text-[12px] font-medium leading-relaxed text-muted-foreground">
          {recv ? copy.instrRecvNote : copy.instrSentNote}
        </p>
      );
      // 보낸 지시 화면에서 바로 지시를 만들 수 있어야 한다 — 상세 생성 폼을 지시 모드로 연다
      // (`?directive=1` → 폼의 "지시로 보내기" 토글이 켜진 채 시작).
      const sendCta = recv ? null : (
        <Link
          className="mb-3 flex items-center gap-2.5 rounded-2xl border border-dashed border-primary/40 bg-primary/[0.04] px-3.5 py-3 transition-colors active:bg-primary/10"
          href="/mobile/tasks/new?directive=1"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Megaphone className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-extrabold text-foreground">
            {copy.sendAsDirective}
          </span>
          <ChevronRight className="size-4 shrink-0 text-primary/60" aria-hidden="true" />
        </Link>
      );
      if (!base.length)
        return (
          <>
            {segment}
            {sendCta}
            {recv
              ? emptyState(Bell, copy.instrEmptyRecvTitle, copy.instrEmptyRecvSub)
              : emptyState(Megaphone, copy.instrEmptySentTitle, copy.instrEmptySentSub)}
          </>
        );
      const list = applyFilter(base);
      if (!list.length)
        return (
          <>
            {segment}
            {noMatchState()}
          </>
        );
      // 받은 지시만 "지연"을 따로 뽑는다. 보낸 지시의 지연은 대상자가 처리할 몫이라 상태 배지로 족하다.
      const byDateThenPrio = (a: TaskRecord, b: TaskRecord) =>
        (dueDateOf(a) ?? "9999").localeCompare(dueDateOf(b) ?? "9999") || prioSort(a, b);
      const overdueList = recv ? list.filter((t) => isOverdue(t)) : [];
      const rest = list.filter((t) => !overdueList.includes(t));
      const groups: { label: string; items: TaskRecord[]; tone?: "over" }[] = [
        { label: copy.instrSecOverdue, items: overdueList.sort(byDateThenPrio), tone: "over" },
        {
          label: recv ? copy.instrSecTodo : copy.instrSecUnconfirmed,
          items: rest.filter((t) => t.status === "open").sort(byDateThenPrio),
        },
        {
          label: copy.instrSecInProgress,
          items: rest.filter((t) => t.status === "in_progress").sort(byDateThenPrio),
        },
        {
          label: copy.instrSecCompleted,
          items: rest
            .filter((t) => t.status === "completed")
            .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
        },
      ];
      return (
        <>
          {segment}
          {sendCta}
          {note}
          {groups.map(({ label, items, tone }) =>
            items.length ? (
              <div key={label}>
                {sectionHead(label, items.length, tone)}
                <div className="mb-1 flex flex-col gap-2">
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      instrMode={recv ? "recv" : "sent"}
                      swipe={false}
                      {...cardProps}
                      // 보낸 지시는 대상자의 일정이다 — 지시자가 대신 완료 처리하지 않으므로 원을
                      // 아예 렌더하지 않는다(TaskCard 는 onCompleteToggle 이 없으면 생략).
                      onCompleteToggle={recv ? cardProps.onCompleteToggle : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </>
      );
    }

    // 완료/기록: every completion, grouped by the day it was logged (Tokyo), newest day first. Each
    // day header carries a 보고서 button that opens the AI daily-report sheet for that date.
    if (view === "completed") {
      // 출처는 완료 로그(`completionRows`) — 행 status 가 아니다. 이유는 위 `completionRows` 주석 참고.
      // 필터 pill 은 일반 작업(프로젝트 밖)과 프로젝트 작업을 가른다.
      if (completionRows.length === 0)
        return emptyState(CheckCircle2, copy.completedEmptyTitle, copy.completedEmptySub);
      const scoped = completionRows.filter(({ task }) =>
        completedFilter === "project"
          ? !!task.projectId
          : completedFilter === "regular"
            ? !task.projectId
            : true,
      );
      const list = scoped.filter(({ task }) => !filterActive || matchesFilter(task));
      const byDay = new Map<string, typeof list>();
      for (const row of list) {
        byDay.set(row.completion.day, [...(byDay.get(row.completion.day) ?? []), row]);
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
            // 로그 시각 기준 최신순. 반복 완료는 `completedAt`(행) 이 비어 있으므로 완료 로그의
            // 타임스탬프를 쓴다 — 행 값으로 정렬하면 반복 완료가 전부 바닥으로 밀린다.
            const items = byDay
              .get(k)!
              .slice()
              .sort((a, b) => b.completion.at.localeCompare(a.completion.at));
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
                  {items.map(({ task, completion }) => {
                    // 반복 완료는 행이 계속 `open` 이라 status 로는 완료로 그려지지 않는다. 그 날짜의
                    // 회차로 넘겨 완료 표시(취소선 + 채운 원)를 살린다. 다만 되돌리기는 붙이지 않는다 —
                    // 로그의 날짜가 회차 날짜와 다를 수 있어(지난 회차를 오늘 처리) 엉뚱한 회차를
                    // 되살릴 위험이 있다. 방금 한 완료는 토스트의 "실행 취소"로 되돌린다.
                    const recurringDone = isStandardRecurrence(task.recurrenceRule);
                    return (
                      <TaskCard
                        key={`${task.id}|${completion.day}`}
                        task={task}
                        showDate={false}
                        swipe={false}
                        {...cardProps}
                        {...(recurringDone
                          ? {
                              occurrence: { date: completion.day, done: true },
                              onCompleteToggle: undefined,
                              // 회차를 넘기면 롱프레스 메뉴가 "그 날짜만 건너뛰기"를 제안하는데,
                              // 이미 완료된 날짜에는 의미가 없다 — 시리즈 메뉴로만 연다.
                              onLongPress: (t: TaskRecord) => openPressMenu(t),
                            }
                          : null)}
                      />
                    );
                  })}
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
    const monthPrefix = calMonthPrefix;
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const daysIn = calDaysIn;
    // 회차 계산은 뷰 밖(`calOccurrences` / `calByDay`)에서 한 번만 한다 — 정렬까지 끝난 상태다.
    const onDay = (iso: string) => calByDay.get(iso) ?? [];

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
    // 모바일 아젠다는 **달 전체**를 보여준다(콘솔은 "다가오는 것만"). 지난 날짜를 되짚는 일이 현장에서
    // 잦아 의도적으로 남긴 차이다.
    const monthTasks = calOccurrences;
    const byDay = calByDay;
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
            <div className="flex items-center gap-1.5">
              <button
                aria-pressed={hideRecurring}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                  hideRecurring
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-slate-500 hover:bg-slate-50",
                )}
                onClick={() => setHideRecurring((v) => !v)}
                type="button"
              >
                <Repeat className="size-3.5" aria-hidden="true" />
                {copy.calHideRepeat}
              </button>
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
    // Match the calendar grid/agenda (which show recurring tasks on every virtual occurrence) so the
    // day sheet isn't empty on a recurring task's future occurrence day. Non-recurring: anchor === iso.
    // 하루 안 정렬도 그리드/아젠다와 같은 규칙(시각 → 우선순위)을 쓴다.
    const list = tasks
      .filter((t) => {
        if (!isActive(t)) return false;
        const a = anchor(t);
        if (!a) return false;
        if (isStandardRecurrence(t.recurrenceRule)) {
          if (hideRecurring) return false; // "반복 숨기기" 토글과 그리드/아젠다를 일치시킴.
          return recurringOccurrencesInRange(t.recurrenceRule, a, iso, iso).length > 0;
        }
        return a === iso;
      })
      .sort(timeThenPrio);
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

  /**
   * "전체 선택" 대상 = **지금 이 탭에 그려진 카드**뿐이다 (2026-07-31).
   *
   * 예전엔 `tasks` 전체(내 모든 활성 작업)를 선택해서, 오늘 탭에 3건만 보이는데 관리함의 80건까지
   * 딸려 들어가고 삭제 확인창이 "83건"으로 떴다 — 보이지 않는 작업을 지우는 데이터 손실 경로였다.
   * 콘솔(`admin-tasks-console.tsx`)은 렌더된 `.trow[data-task-id]` 를 클릭 시점에 읽어 같은 문제를
   * 막는데, 모바일 카드에는 그런 마커가 없고 `TaskCard` 는 이 화면 소유가 아니다. 대신 각 뷰가
   * 쓰는 base 목록을 뷰 밖으로 뽑아 **여기와 뷰 본문이 같은 배열**을 보게 했다.
   *
   * 지연 반복 backlog(`todayRecOverdueBase`)는 체크박스 없는 전용 행으로 렌더되므로 제외한다.
   * 프로젝트 탭은 `ProjectsBoard` 가 자체 목록을 그려서 이 선택 바가 닿지 않는다.
   */
  const visibleSelectable: TaskRecord[] =
    view === "today"
      ? applyFilter([...todayOverdueBase, ...todayBase, ...todayRecBase])
      : view === "tomorrow"
        ? applyFilter([...tomorrowBase, ...tomorrowRecBase])
        : view === "inbox"
          ? applyFilter(inboxBase)
          : view === "instr"
            ? applyFilter(instrTab === "recv" ? recvInstrTasks : sentInstrTasks)
            : view === "completed"
              ? completionRows
                  .filter(
                    ({ task }) =>
                      (completedFilter === "project"
                        ? !!task.projectId
                        : completedFilter === "regular"
                          ? !task.projectId
                          : true) &&
                      (!filterActive || matchesFilter(task)),
                  )
                  .map((r) => r.task)
              : view === "calendar"
                ? Array.from(calByDay.values()).flat()
                : [];
  // 같은 작업이 여러 줄로 렌더될 수 있다(반복 회차·캘린더의 여러 날짜) — 선택은 작업 단위라 중복 제거.
  const selectableIds = Array.from(new Set(visibleSelectable.map((t) => t.id)));
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
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="search"
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.searchPlaceholder}
                type="search"
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
	                    onClick={() => {
	                      setDateMode(m);
	                      setActiveDatePicker(m === "single" ? "single" : "from");
	                    }}
	                    type="button"
	                  >
	                    {m === "single" ? copy.filterDateSingle : copy.filterDateRange}
	                  </button>
	                ))}
	              </div>
	              <div className="flex items-center gap-2">
	                <button
	                  aria-label={dateMode === "range" ? copy.filterDateFrom : copy.filterDateSingle}
	                  className={cn(
	                    "h-10 flex-1 rounded-xl border bg-background/60 px-3 text-left text-sm font-bold outline-none transition-colors focus:border-primary",
	                    activeDatePicker === (dateMode === "single" ? "single" : "from")
	                      ? "border-primary text-foreground"
	                      : "border-border text-foreground",
	                    !dateFrom && "text-muted-foreground",
	                  )}
	                  onClick={() => setActiveDatePicker(dateMode === "single" ? "single" : "from")}
	                  type="button"
	                >
	                  {dateFrom ? chipDate(dateFrom) : dateMode === "range" ? copy.filterDateFrom : copy.filterDateSingle}
	                </button>
	                {dateMode === "range" ? (
	                  <>
	                    <span className="text-sm font-bold text-muted-foreground">–</span>
	                    <button
	                      aria-label={copy.filterDateTo}
	                      className={cn(
	                        "h-10 flex-1 rounded-xl border bg-background/60 px-3 text-left text-sm font-bold outline-none transition-colors focus:border-primary",
	                        activeDatePicker === "to" ? "border-primary text-foreground" : "border-border text-foreground",
	                        !dateTo && "text-muted-foreground",
	                      )}
	                      onClick={() => setActiveDatePicker("to")}
	                      type="button"
	                    >
	                      {dateTo ? chipDate(dateTo) : copy.filterDateTo}
	                    </button>
	                  </>
	                ) : null}
	              </div>
	              <MiniCalendar
	                copy={copy}
	                locale={locale}
	                onClear={() => setActiveDateValue("")}
	                onSelect={setActiveDateValue}
	                value={activeDateValue}
	              />
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

      {/* Overdue bulk reschedule — reuses the canonical schedule picker (date variant): quick
          options (오늘/내일/다음 주/다음 주말) + inline calendar, commit on the 완료 button only.
          Applies the chosen date to every selected overdue task. */}
      {overdueRescheduleOpen && (
        <TaskSchedulePicker
          confirmLabel={copy.overdueRescheduleApply}
          copy={copy}
          hadCustom={false}
          initialDate=""
          initialDuration={0}
          initialRepeat=""
          initialTime=""
          locale={locale}
          onApply={(v) => {
            if (v.date) rescheduleOverdue(v.date);
            else setOverdueRescheduleOpen(false);
          }}
          onCancel={() => setOverdueRescheduleOpen(false)}
          title={copy.overdueRescheduleTitle}
          variant="date"
        />
      )}

      {/* Quick-add FAB — portaled to body so it stays viewport-fixed (the scroll
          container has a transform, which would otherwise trap `fixed` and let it
          drift on scroll/pull). Hidden while multi-selecting (the delete bar owns the bottom)
          and on the Projects tab (ProjectsBoard renders its own "프로젝트 만들기" FAB). */}
      {hydrated && !selectMode && view !== "projects"
        ? createPortal(
            <button
              aria-label={copy.quickAddTitle}
              className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-30 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_16px_30px_-10px_hsl(var(--primary-hsl)/0.5)] transition-transform active:scale-[0.93]"
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
                "fixed inset-0 z-[60] flex items-end justify-center overscroll-contain bg-slate-950/45 transition-opacity duration-300 motion-reduce:transition-none",
                quickShown ? "opacity-100" : "opacity-0",
              )}
              onClick={closeQuick}
              onTouchEnd={stopSheetTouch}
              onTouchMove={stopSheetTouch}
              onTouchStart={stopSheetTouch}
              style={quickDrag.scrimStyle}
            >
              <div
                className={cn(
                  "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[calc(max(22px,env(safe-area-inset-bottom))+var(--keyboard-inset,0px))] pt-3",
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
                        const t = pressTask;
                        const occ = pressOcc;
                        closePressMenu();
                        // 반복 작업을 **회차로** 보고 있으면 무엇을 지울지 먼저 묻는다. 관리함처럼
                        // 회차가 아닌 목록에서는 행 자체가 시리즈를 뜻하므로 기존 확인 모달 그대로.
                        if (occ && isStandardRecurrence(t.recurrenceRule)) setRecurDelete({ task: t, date: occ });
                        else setConfirmIds([t.id]);
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

      {/* 이동 거절 안내 — 반복 작업을 이미 회차가 있는 날짜로 옮기려 했을 때. */}
      {moveNotice && hydrated
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[80] flex justify-center px-4">
              <div className="pointer-events-auto max-w-[420px] rounded-[18px] bg-slate-900 px-4 py-2.5 text-[13px] font-bold tracking-[-0.01em] text-white shadow-[0_16px_40px_-14px_rgba(20,16,10,0.55)]">
                {copy.moveDuplicateOccurrence}
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* 반복 삭제 선택 시트 — "이 날짜만 건너뛰기" vs "반복 전체 삭제".
          두 선택지를 같은 크기의 행으로 놓아 "고르는 화면"으로 읽히게 하고, 되돌릴 수 없는 쪽만
          danger 톤을 준다(콘솔 `RecurDeleteModal` 과 같은 구성). 헤더에 반복 주기를 함께 보여줘
          "전체"가 무엇을 뜻하는지 누르기 전에 알 수 있게 했다. */}
      {recurDelete && hydrated ? (
        <BottomSheet ariaLabel={copy.recurDeleteTitle} onClose={() => setRecurDelete(null)}>
          <div className="px-4 pb-1">
            <div className="flex items-center gap-1.5 px-1 text-[11px] font-black uppercase tracking-[0.06em] text-muted-foreground">
              <Repeat className="size-3.5" aria-hidden="true" />
              {repeatLabel(recurDelete.task.recurrenceRule ?? "", copy, locale)}
            </div>
            <p className="mt-2 line-clamp-2 px-1 text-[15px] font-extrabold leading-snug tracking-[-0.01em] text-foreground">
              {recurDelete.task.title}
            </p>
            <div className="mt-4 overflow-hidden rounded-[18px] border border-border bg-surface">
              <button
                className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-colors active:bg-slate-50"
                onClick={() => runSkipOccurrence(recurDelete.task.id, recurDelete.date)}
                type="button"
              >
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-primary/10 text-primary">
                  <SkipForward className="size-[17px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-extrabold tracking-[-0.01em] text-foreground">
                    {copy.recurSkipOne.replace("{date}", shortDateLabel(recurDelete.date))}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] font-medium text-muted-foreground">
                    {copy.recurSkipOneSub}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
              </button>
              <div className="mx-3.5 h-px bg-border" />
              <button
                className="flex w-full items-center gap-3 px-3.5 py-3.5 text-left transition-colors active:bg-rose-50"
                onClick={() => {
                  const id = recurDelete.task.id;
                  setRecurDelete(null);
                  performDelete([id]);
                }}
                type="button"
              >
                <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px] bg-rose-50 text-rose-600">
                  <Trash2 className="size-[17px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-extrabold tracking-[-0.01em] text-rose-600">
                    {copy.recurDeleteAll}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] font-medium text-muted-foreground">
                    {copy.recurDeleteAllSub}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
              </button>
            </div>
          </div>
        </BottomSheet>
      ) : null}

      {/* 회차 건너뛰기 되돌리기 토스트 — skipped 는 영구 상태라 실행 취소 경로가 반드시 필요하다. */}
      {skipUndo && hydrated
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[80] flex justify-center px-4">
              <div className="pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-[18px] bg-slate-900 py-2.5 pl-4 pr-2 text-white shadow-[0_16px_40px_-14px_rgba(20,16,10,0.55)]">
                <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.01em]">
                  {copy.recurSkippedToast.replace("{date}", shortDateLabel(skipUndo.date))}
                </span>
                <button
                  className="ml-1 inline-flex flex-none items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold text-rose-300 transition-colors active:bg-white/10"
                  onClick={undoSkipOccurrence}
                  type="button"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {copy.undo}
                </button>
                <button
                  className="inline-flex size-8 flex-none items-center justify-center rounded-xl text-slate-400 transition-colors active:bg-white/10"
                  onClick={() => setSkipUndo(null)}
                  type="button"
                  aria-label={copy.undo}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Undo toast — floats above the tab bar after a complete (status-circle) or a delete. */}
      {(undoTask || deletedUndoId) && hydrated
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[80] flex justify-center px-4">
              <div className="pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-[18px] bg-slate-900 py-2.5 pl-4 pr-2 text-white shadow-[0_16px_40px_-14px_rgba(20,16,10,0.55)]">
                <div className="flex min-w-0 flex-col">
                  <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.01em]">
                    {undoTask ? copy.completedToast : copy.deletedToast}
                  </span>
                  {undoTask && undoSub ? (
                    <span className="whitespace-nowrap text-[11.5px] font-medium text-slate-400">{undoSub}</span>
                  ) : null}
                </div>
                <button
                  className="ml-1 inline-flex flex-none items-center gap-1 rounded-xl px-2.5 py-1.5 text-[13px] font-extrabold text-rose-300 transition-colors active:bg-white/10"
                  onClick={undoTask ? handleUndo : handleRestore}
                  type="button"
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  {copy.undo}
                </button>
                <button
                  className="inline-flex size-8 flex-none items-center justify-center rounded-xl text-slate-400 transition-colors active:bg-white/10"
                  onClick={() => {
                    setUndoTask(null);
                    setDeletedUndoId(null);
                  }}
                  type="button"
                  aria-label={copy.undo}
                >
                  <X className="size-4" aria-hidden="true" />
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
