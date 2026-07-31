"use client";

// 어드민 Todoist 콘솔(데스크톱). 모바일 코어 패리티 + 매니저 "업무 지시".
// 셸(사이드바/탑바)은 AdminShell 이 소유하고, 여기서는 서브내비 + 뷰 + 상세/팝오버/모달을 렌더한다.
// 디자인: Claude Design "StayOps 투두 (admin)" 이식. CSS: admin-tasks-console.css (.adm 스코프).
// 서버 액션(@/app/admin/tasks/actions)이 모든 쓰기를 처리하고, revalidatePath + router.refresh() 로 갱신한다.
// See docs/product/28-admin-todoist-console.md.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Bell,
  Building2,
  CalendarDays,
  CalendarX2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  Crown,
  FileText,
  Flag,
  GripVertical,
  Hash,
  Inbox,
  Lock,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  SkipForward,
  RotateCcw,
  Search,
  Send,
  Share2,
  Smartphone,
  Sun,
  Sunrise,
  Ticket,
  Trash2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import {
  addConsoleNote,
  addConsoleProjectSection,
  bulkDeleteConsoleTasks,
  carryConsoleOverdueToToday,
  createConsoleProject,
  createConsoleTask,
  deleteConsoleProject,
  deleteConsoleProjectSection,
  deleteConsoleTask,
  dismissConsoleOverdue,
  rescheduleConsoleOverdue,
  skipConsoleOccurrence,
  unskipConsoleOccurrence,
  generateConsoleReport,
  getConsoleProjectDetail,
  getConsoleTaskDetail,
  inviteConsoleProjectMembers,
  leaveConsoleTask,
  moveConsoleToInbox,
  moveConsoleToToday,
  moveConsoleToTomorrow,
  removeConsoleProjectMember,
  renameConsoleProjectSection,
  reorderConsoleDateTasks,
  reorderConsoleTasks,
  rescheduleConsoleTask,
  restoreConsoleTask,
  restoreConsoleTasks,
  setConsoleTaskStatus,
  shareConsoleTask,
  skipConsoleOverdue,
  toggleConsoleComplete,
  updateConsoleTaskCore,
  type TaskActionResult,
} from "@/app/admin/tasks/actions";
import {
  CUSTOM_RECURRENCE_PREFIX,
  isStandardRecurrence,
  type OccurrenceState,
  parseCustomWeekdays,
  recurringOccurrencesInRange,
} from "@/lib/tasks-recurrence";
import type { AdminTasksData } from "@/lib/admin-tasks";
import { getAdminTasksDictionary } from "@/lib/admin-tasks-i18n";
import type { Locale } from "@/lib/i18n";
import type { ProjectDetailData } from "@/lib/projects";
import type { TaskDetail, TaskRecord } from "@/lib/tasks";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
import { ImageLightbox } from "@/components/shell/image-lightbox";
import {
  addDays,
  avatarColor,
  completedDateOf,
  ctxItems,
  dateOf,
  DURATION_OPTIONS,
  dueDateOf,
  fill,
  fmtLong,
  fmtShort,
  fmtWeekday,
  initial,
  isActive,
  isMine,
  isOverdue,
  isSharedTask,
  isTodayTask,
  isTomorrowTask,
  matchDate,
  matchPrio,
  matchQuery,
  myOwn,
  overdueOccurrenceDates,
  partsOf,
  prioLabel,
  prioSort,
  dateSort,
  recvInstr,
  REPEAT_RULES,
  customWeekdayNames,
  repeatLabel,
  repeatShort,
  weekdayShortName,
  WEEKDAY_ORDER,
  sentInstr,
  systemLogLabel,
  timeRange,
  tokyoToday,
  weekdayIndex,
  type DateFilterKey,
} from "./helpers";
import {
  TaskPhotoUploader,
  uploadPendingTaskPhotos,
  uploadPendingTaskUpdatePhotos,
  type PhotoUploaderCopy,
} from "@/components/admin/tasks/task-photo-uploader";
import type { PreviewItem } from "@/components/announcements/announcement-image-uploader";
import {
  ContextPickerPopover,
  type ContextPickerCopy,
  type TaskContextValue,
} from "@/components/admin/tasks/context-picker-popover";
import "./admin-tasks-console.css";

type View = "today" | "tomorrow" | "inbox" | "shared" | "instr" | "completed" | "calendar";

type AddDraft = {
  /** "instr" = 지시 탭에서 바로 보내기. 대상이 반드시 있어야 저장된다(아래 `saveInlineAdd`). */
  ctx: "today" | "tomorrow" | "inbox" | "project" | "day" | "instr";
  sectionId: string | null;
  onDate: string; // for "day"/day-anchored adds
  title: string;
  desc: string;
  date: string;
  time: string;
  dur: number | null;
  repeat: string;
  prio: string;
  targets: string[];
  tags: string[];
  /** 태그 입력 버퍼 — 커밋 전 문자열이라 `tags` 와 분리해 둔다. */
  tagInput: string;
  /** 연결된 건물/객실/예약/게스트. 미연결이면 undefined. */
  context?: TaskContextValue;
};

type Anchor = { x: number; y: number; aTop: number };
type SchedulePop = {
  kind: "schedule";
  src: "add" | "task" | "overdue";
  taskId: string | null;
  draft: { date: string; time: string; dur: number | null; repeat: string };
  calMonth: string;
  expand: "time" | "repeat" | null;
} & Anchor;
type PrioPop = { kind: "prio"; src: "add" | "task"; taskId: string | null; cur: string } & Anchor;
type SharePop = {
  kind: "share";
  /** "project" = 프로젝트 멤버 관리(초대 + 제거). taskId 대신 projectId 를 쓴다. */
  src: "add" | "task" | "project";
  taskId: string | null;
  projectId?: string;
  mode: "target" | "share";
  sel: string[];
  q: string;
} & Anchor;
/** 컨텍스트(건물·객실·예약) 연결 팝오버. `src` 는 인라인 추가 드래프트인지 기존 작업인지. */
type ContextPop = { kind: "context"; src: "add" | "task"; taskId: string | null } & Anchor;
/** `occ` = 이 행이 렌더된 회차 날짜(반복 작업일 때만). 삭제가 시리즈 전체인지 그 날짜만인지 가른다. */
type RowMenuPop = { kind: "rowmenu"; taskId: string; occ?: string } & Anchor;
type DateFilterPop = { kind: "datefilter" } & Anchor;
type PrioFilterPop = { kind: "priofilter" } & Anchor;
type Pop =
  | SchedulePop
  | PrioPop
  | SharePop
  | ContextPop
  | RowMenuPop
  | DateFilterPop
  | PrioFilterPop
  | null;

function anchorFrom(e: ReactMouseEvent): Anchor {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.bottom + 6, aTop: r.top };
}

/** 연결 없음 상태. 컴포넌트 밖에 두는 이유: `PopoverLayer()` 가 컴포넌트 본문 중간에서 호출되므로
 *  본문 안의 `const` 는 그 시점에 아직 TDZ 라 `ReferenceError` 가 난다(2026-07-29 실제 발생). */
const EMPTY_TASK_CONTEXT: TaskContextValue = {
  propertyId: null,
  roomId: null,
  reservationId: null,
  guestName: null,
  propertyName: null,
  roomLabel: null,
};

// useLayoutEffect on the client (positions before paint → no flicker), useEffect on the server
// (avoids the SSR warning; the popover never renders during SSR anyway).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Detail-panel status segments, in display order. The CSS thumb assumes exactly these three, in
// this order (it translates by whole segment widths) — adding a fourth means updating
// `.dp__status__thumb` width/offsets in admin-tasks-console.css too.
const STATUS_SEGMENTS = [
  { status: "open", labelKey: "stOpen" },
  { status: "in_progress", labelKey: "stInProgress" },
  { status: "completed", labelKey: "stCompleted" },
] as const satisfies readonly {
  status: "open" | "in_progress" | "completed";
  labelKey: "stOpen" | "stInProgress" | "stCompleted";
}[];

export function AdminTasksConsole({
  locale,
  data,
  organizationId,
}: {
  locale: Locale;
  data: AdminTasksData;
  /** Needed for the photo Storage path (`${organizationId}/task-images/...`). */
  organizationId: string;
}) {
  const dict = getAdminTasksDictionary(locale);
  // 업로더는 i18n 모듈을 모르고 이미 번역된 문자열만 받는다(재사용 가능한 프리젠테이션 컴포넌트).
  const photoCopy: PhotoUploaderCopy = {
    add: dict.phAdd,
    addCompact: dict.phAddCompact,
    dropHint: dict.phDropHint,
    count: dict.phCount,
    remove: dict.phRemove,
    tooMany: dict.phTooMany,
    invalidType: dict.phInvalidType,
    tooLarge: dict.phTooLarge,
    uploading: dict.phUploading,
  };
  const contextCopy: ContextPickerCopy = {
    title: dict.cpTitle, hintBuilding: dict.cpHintBuilding, hintRoom: dict.cpHintRoom,
    buildings: dict.cpBuildings, rooms: dict.cpRooms, reservations: dict.cpReservations,
    search: dict.cpSearch, searchClear: dict.cpSearchClear,
    searchEmpty: dict.cpSearchEmpty, searchEmptySub: dict.cpSearchEmptySub,
    noBuilding: dict.cpNoBuilding, noRooms: dict.cpNoRooms, noReservation: dict.cpNoReservation,
    guest: dict.cpGuest, loading: dict.cpLoading, back: dict.cpBack, clear: dict.cpClear,
    apply: dict.cpApply, cancel: dict.cpCancel, occupied: dict.cpOccupied, vacant: dict.cpVacant,
    nightsUnit: dict.cpNightsUnit, live: dict.cpLive, roomsUnit: dict.cpRoomsUnit,
    todayGuests: dict.cpTodayGuests, roomSuffix: dict.cpRoomSuffix, bookingId: dict.cpBookingId,
  };
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { toast, showToast, dismiss } = useAdminToast();

  const meId = data.me.id;
  // Tokyo operating date. Kept live so a console left open across Tokyo midnight rolls today/내일/
  // overdue over without a manual refresh (checked each minute + on focus/visibility change).
  const [today, setToday] = useState(() => tokyoToday());

  const [view, setView] = useState<View>("today");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailData | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  // Optimistic status for the detail panel's 대기/진행 중/완료 segmented control. `setConsoleTaskStatus`
  // + `router.refresh()` is a full server round-trip, so without this the segment sits frozen on the
  // old value until fresh data lands and then jumps. Lives here (not in DetailPanel) because
  // DetailPanel is a conditionally-called plain function — hooks inside it would break hook order.
  //
  // `from` is what makes this self-expiring without a clean-up effect: the draft only applies while
  // the task still reads as `from`. The moment the server (or the separately-refetched `detail`)
  // catches up, the guard fails and the real status takes over on its own.
  const [statusDraft, setStatusDraft] = useState<{
    id: string;
    from: string;
    status: "open" | "in_progress" | "completed";
  } | null>(null);
  // 상세 패널 제목·본문·태그 인라인 편집. Lives here (not in DetailPanel) for the same reason
  // `statusDraft` does — DetailPanel is a conditionally-called plain function, so hooks inside it
  // would break hook order.
  const [coreEdit, setCoreEdit] = useState<{
    id: string;
    title: string;
    desc: string;
    tags: string[];
    tagInput: string;
  } | null>(null);
  // 사진: `pending` 은 아직 업로드 안 된 로컬 선택본. 세 자리(인라인 추가 · 상세 코어 편집 · 노트)가
  // 각자 드래프트를 들고, 저장 시점에 uploadPending…() 로 Storage 에 올린 뒤 URL 만 액션에 넘긴다.
  const [addPhotos, setAddPhotos] = useState<PreviewItem[]>([]);
  const [editPhotos, setEditPhotos] = useState<{ value: string[]; pending: PreviewItem[] }>({
    value: [],
    pending: [],
  });
  const [notePhotos, setNotePhotos] = useState<PreviewItem[]>([]);
  // Panel slide-in/out. `sel` is the open/close intent; `panelTask` is the task actually rendered
  // and PERSISTS through the exit transition (so content doesn't vanish mid-slide); `panelOn`
  // toggles the `.dp.on` slide position. The animation timing lives in an effect whose setState
  // calls are all inside rAF/setTimeout (never synchronous in the effect body).
  const [panelTask, setPanelTask] = useState<string | null>(null);
  const [panelOn, setPanelOn] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [add, setAdd] = useState<AddDraft | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const popAnchorRef = useRef<HTMLDivElement>(null);
  const [instrTab, setInstrTab] = useState<"recv" | "sent">("recv");
  const [calMonth, setCalMonth] = useState<string>(() => today.slice(0, 7));
  // 캘린더에서 고정 반복(표준 반복) 회차를 숨김 — 세션 상태(새로고침 시 초기화), 기본 표시.
  const [hideRecurring, setHideRecurring] = useState(false);
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterKey | null>(null);
  const [prioFilter, setPrioFilter] = useState("");
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [report, setReport] = useState<{ date: string; text: string; loading: boolean; error: string | null } | null>(
    null,
  );
  const [reportEdited, setReportEdited] = useState("");
  const [newProj, setNewProj] = useState<{ name: string; members: string[]; q: string } | null>(null);
  // 프로젝트 섹션 편집 — 이름 변경 인라인 드래프트 / 새 섹션 이름 버퍼.
  const [sectionEdit, setSectionEdit] = useState<{ id: string; title: string } | null>(null);
  const [newSection, setNewSection] = useState("");
  const [confirm, setConfirm] = useState<{ message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
  /**
   * 반복 삭제 선택 모달 — "이 날짜만 건너뛰기" vs "반복 전체 삭제" (2026-07-30).
   * 반복 작업을 회차로 보고 있을 때만 뜬다. 모바일 `recurDelete` 시트와 같은 규칙.
   */
  const [recurDel, setRecurDel] = useState<{ task: TaskRecord; date: string } | null>(null);
  // ── selection mode (bulk delete) ──
  // `picked` holds ids across every section of the current view.
  const [selMode, setSelMode] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  /**
   * 지연 배너의 처리 대상 선택(2026-07-31) — 전역 선택모드(`picked`)와 **별개의 집합**이다.
   * 전에는 "일정 변경"/"지난 미완료 삭제"가 지연 목록 전체를 무조건 처리해서, 12건 중 3건만
   * 오늘로 당길 수 없었다. 모바일 지연 카드의 체크박스 + 전체 선택 토글과 같은 모델.
   * 담을 수 있는 건 **내가 만든 일회성 지연**뿐이다 — 서버(`rescheduleConsoleOverdue` /
   * `dismissConsoleOverdue`)가 그 조건으로 다시 걸러내므로, 아닌 걸 담으면 개수만 거짓이 된다.
   */
  const [odPicked, setOdPicked] = useState<ReadonlySet<string>>(() => new Set());
  /** 사진 확대(작업 사진 · 노트 사진) — 공용 `ImageLightbox` 에 넘길 묶음과 시작 인덱스. */
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  // Undo toast (Todoist-style): dark bottom-left toast with a "실행 취소" action, ~6s.
  const [undo, setUndo] = useState<{ id: number; message: string; sub?: string; onUndo: () => void } | null>(null);

  // ── name / role maps ──────────────────────────────────────────────────────────
  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of data.users) m.set(u.id, u.name);
    m.set(data.me.id, data.me.name);
    for (const t of data.tasks) {
      m.set(t.createdByUserId, t.authorName);
      if (t.completedByUserId) m.set(t.completedByUserId, t.completedByName);
      for (const p of t.participants) m.set(p.userId, p.name);
    }
    return m;
  }, [data]);
  const roleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of data.users) m.set(u.id, u.role);
    m.set(data.me.id, data.me.role);
    for (const t of data.tasks) for (const p of t.participants) m.set(p.userId, p.role);
    return m;
  }, [data]);
  const nameOf = useCallback((id: string) => nameMap.get(id) ?? "", [nameMap]);
  const roleOf = useCallback((id: string) => roleMap.get(id) ?? "", [roleMap]);

  const tasks = data.tasks;
  // 관리함/오늘/내일/공유함/지시/캘린더 등 메인 뷰는 **프로젝트에 속하지 않은** 작업만 다룬다
  // (Todoist 모델: 관리함 = 프로젝트 밖 모든 활성 작업, 오늘/내일은 그 필터). 프로젝트 작업은
  // 프로젝트 뷰에만. `tasks`(전체)는 완료·기록/프로젝트/상세 조회에만 쓴다. 모바일 page.tsx 와 동일 분리.
  const personalTasks = useMemo(() => data.tasks.filter((t) => !t.projectId), [data.tasks]);
  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);

  // 반복 회차 상태(2026-07-30) — taskId → (occurrenceDate → state). 회차 완료 여부/지연 판정에 사용.
  const occByTask = useMemo(() => {
    const m = new Map<string, Map<string, OccurrenceState>>();
    for (const s of data.occurrenceStates) {
      let inner = m.get(s.taskId);
      if (!inner) {
        inner = new Map();
        m.set(s.taskId, inner);
      }
      inner.set(s.occurrenceDate, s.state);
    }
    return m;
  }, [data.occurrenceStates]);
  // 반복 회차의 날짜별 수동 순서: `${taskId}|${date}` → sort_order (2026-07-30 B안).
  const occOrderMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of data.occurrenceOrders) m.set(`${o.taskId}|${o.occurrenceDate}`, o.sortOrder);
    return m;
  }, [data.occurrenceOrders]);
  /** 일회성은 `tasks.sort_order`, 반복은 그 날짜의 회차 순서 — 저장처가 둘이라 읽을 때 합친다. */
  const dateOrderOf = useCallback(
    (t: TaskRecord, date: string): number | null =>
      isStandardRecurrence(t.recurrenceRule) ? occOrderMap.get(`${t.id}|${date}`) ?? null : t.sortOrder,
    [occOrderMap],
  );
  /** 수동 위치가 있는 항목이 먼저, 없으면 우선순위 폴백. */
  const sortByDateOrder = useCallback(
    (arr: TaskRecord[], date: string): TaskRecord[] =>
      [...arr].sort((a, b) => {
        const ao = dateOrderOf(a, date);
        const bo = dateOrderOf(b, date);
        if (ao != null && bo != null) return ao !== bo ? ao - bo : prioSort(a, b);
        if (ao != null) return -1;
        if (bo != null) return 1;
        return prioSort(a, b);
      }),
    [dateOrderOf],
  );
  const occState = useCallback(
    (taskId: string, date: string): OccurrenceState | undefined => occByTask.get(taskId)?.get(date),
    [occByTask],
  );
  const resolvedDatesFor = useCallback(
    (taskId: string): Set<string> => new Set(occByTask.get(taskId)?.keys() ?? []),
    [occByTask],
  );
  // 관리함(Inbox) 드래그 재정렬(2026-07-30). dragId=집는 행, overId=놓을 위치, inboxOrder=낙관적 순서.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [inboxOrder, setInboxOrder] = useState<string[] | null>(null);
  // 날짜 목록(오늘/내일)의 낙관적 순서 — `${date}` → taskId[]. 서버 갱신되면 초기화된다.
  const [dateOrder, setDateOrder] = useState<{ date: string; ids: string[] } | null>(null);
  // 서버 새로고침(revalidate)되면 낙관적 순서 초기화 — sort_order가 이미 반영돼 있으므로.
  // rAF로 감싸 effect 내 동기 setState 경고를 피한다(이 파일의 기존 패턴).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setInboxOrder(null);
      setDateOrder(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [data.tasks]);
  // 특정 토쿄일에 이 작업이 걸리는가 — 반복은 규칙으로 회차 계산(Todoist 가상 미리보기), 비반복은 앵커 하루.
  const occursOn = useCallback((t: TaskRecord, ymd: string) => {
    const a = dateOf(t);
    if (!a) return false;
    if (isStandardRecurrence(t.recurrenceRule))
      return recurringOccurrencesInRange(t.recurrenceRule, a, ymd, ymd).length > 0;
    return a === ymd;
  }, []);
  // 반복 회차가 오늘/특정일에 미완료로 떠야 하는가(완료·스킵·이동된 회차 제외).
  const openOccursOn = useCallback(
    (t: TaskRecord, ymd: string) =>
      // 상태 행이 있으면 그 회차는 해결된 것이다(completed · skipped · moved). 주석은 처음부터 셋 다
      // 제외한다고 적혀 있었지만 코드는 completed 만 걸렀다 — 모바일에서 건너뛴 회차가 콘솔에는
      // 그대로 떠 두 화면이 어긋났다(2026-07-30).
      // `isActive` 가드(2026-07-31): 캘린더는 이미 isActive 를 걸러서, 완료/취소된 반복 행이
      // 오늘 목록에는 뜨고 캘린더에는 안 뜨는 내부 모순이 있었다. 모바일 openOccursOn 과 동일.
      isActive(t) && isStandardRecurrence(t.recurrenceRule) && occursOn(t, ymd) && !occState(t.id, ymd),
    [occursOn, occState],
  );

  // ── action runner ──────────────────────────────────────────────────────────────
  // 서버 액션이 돌려주는 모든 코드를 실제 문구로 매핑한다. 예전에는 auth/forbidden/save_failed 외
  // 전부가 errGeneric("처리하지 못했습니다")으로 뭉개져, 제목 누락인지 날짜 누락인지 화면에서
  // 구분할 수 없었다(2026-07-30 수정).
  const errMsg = useCallback(
    (code: string) => {
      const map: Record<string, string> = {
        auth: dict.errAuth,
        forbidden: dict.errForbidden,
        save_failed: dict.errSave,
        delete_failed: dict.errSave,
        missing_title: dict.errMissingTitle,
        time_needs_date: dict.errTimeNeedsDate,
        repeat_needs_date: dict.errRepeatNeedsDate,
        not_found: dict.errNotFound,
        invalid_date: dict.errInvalidDate,
        invalid_project: dict.errNotFound,
        empty: dict.errEmpty,
        duplicate_occurrence: dict.errDuplicateOccurrence,
      };
      return map[code] ?? dict.errGeneric;
    },
    [dict],
  );
  const run = useCallback(
    (
      fn: () => Promise<TaskActionResult>,
      opts?: { toast?: string; after?: () => void; onError?: () => void },
    ) => {
      startTransition(async () => {
        const res = await fn();
        if (res.ok) {
          if (opts?.toast) showToast(opts.toast);
          opts?.after?.();
          router.refresh();
        } else {
          opts?.onError?.();
          showToast(errMsg(res.error));
        }
      });
    },
    [errMsg, router, showToast],
  );


  // Auto-dismiss the undo toast (~6s). Clicking undo or a new toast replaces it.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 6000);
    return () => clearTimeout(t);
  }, [undo]);
  const showUndo = useCallback(
    (message: string, onUndo: () => void, sub?: string) =>
      setUndo({ id: Date.now(), message, onUndo, sub }),
    [],
  );

  // ── detail loading (updates + resolved context) ─────────────────────────────────
  // Load full detail (updates + context) for the open task. `detail` may briefly hold the previous
  // task's data after `sel` changes; consumers gate on `detail.id === sel` (no sync setState here).
  useEffect(() => {
    if (!panelTask) return;
    let alive = true;
    getConsoleTaskDetail(panelTask).then((res) => {
      if (alive && res.ok) setDetail(res.task);
    });
    return () => {
      alive = false;
    };
  }, [panelTask, data]);

  const openTask = useCallback((id: string) => {
    // Opening the detail panel dismisses transient overlays (calendar day sheet, any popover) so
    // their scrims don't sit on top of the panel and block it.
    setDaySheet(null);
    setPop(null);
    setNoteDraft("");
    setStatusDraft(null); // never carry a pending segment click into another task
    setPanelTask(id); // content is ready immediately
    setSel(id); // intent → the effect below runs the slide-in
  }, []);
  const closePanel = useCallback(() => {
    // Keep `detail` during the exit so the panel content persists while it slides out — even after a
    // delete/leave removes the task from `tasks` (detail is local state, so it survives the refresh).
    // Both panelTask and detail are cleared together when the exit finishes (effect below).
    setSel(null);
  }, []);
  const goView = useCallback((v: View) => {
    setProjectId(null);
    setView(v);
    setAdd(null);
    // Selection is scoped to the list you can see — leaving the view drops it rather than carrying
    // invisible picks into a bulk delete.
    setSelMode(false);
    setPicked(new Set());
    // 캘린더는 필터바가 없어 활성 필터를 해제할 UI가 없으므로, 진입 시 검색/우선순위/날짜 필터를 초기화한다.
    if (v === "calendar") {
      setQ("");
      setPrioFilter("");
      setDateFilter(null);
    }
  }, []);
  // "다음: {date}" for a recurring task (its next occurrence after today), else undefined.
  const recurringNextLabel = useCallback(
    (t: TaskRecord): string | undefined => {
      if (!isStandardRecurrence(t.recurrenceRule)) return undefined;
      const anchor = dueDateOf(t) ?? t.scheduledDate;
      if (!anchor) return undefined;
      const next = recurringOccurrencesInRange(t.recurrenceRule, anchor, addDays(today, 1), addDays(today, 366))[0];
      if (!next) return undefined;
      const label =
        next === addDays(today, 1) ? dict.tomorrow : `${fmtShort(next, locale)} (${fmtWeekday(next, locale)})`;
      return fill(dict.undoNext, { date: label });
    },
    [today, dict, locale],
  );
  // Toggle complete; on completing show a "완료 · 실행 취소" undo toast (reopen). Reopen is itself the
  // correction → plain toast, no undo.
  // ── 상세 패널 코어 편집(제목·본문·태그) ────────────────────────────────────────────
  const startCoreEdit = useCallback((t: TaskRecord) => {
    setCoreEdit({ id: t.id, title: t.title, desc: t.description ?? "", tags: [...t.tags], tagInput: "" });
    setEditPhotos({ value: [...t.imageUrls], pending: [] });
  }, []);
  const cancelCoreEdit = useCallback(() => {
    setCoreEdit(null);
    setEditPhotos({ value: [], pending: [] });
  }, []);
  const addCoreTag = useCallback(() => {
    setCoreEdit((prev) => {
      if (!prev) return prev;
      const tag = prev.tagInput.trim().replace(/^#/, "");
      // Server slices to 10; stop at the same cap here so the UI never shows a tag that won't persist.
      if (!tag || prev.tags.includes(tag) || prev.tags.length >= 10) return { ...prev, tagInput: "" };
      return { ...prev, tags: [...prev.tags, tag], tagInput: "" };
    });
  }, []);
  const saveCoreEdit = useCallback(
    (t: TaskRecord, draft: NonNullable<typeof coreEdit>) => {
      if (!draft.title.trim()) return;
      // Date/time/repeat/priority are not edited here, but the action rewrites all of them — pass the
      // task's current values back or this edit would silently clear its schedule.
      const photos = editPhotos;
      run(
        async () => {
          const uploaded = photos.pending.length
            ? await uploadPendingTaskPhotos({
                pending: photos.pending,
                organizationId,
                taskId: t.id,
              })
            : [];
          return updateConsoleTaskCore({
            taskId: t.id,
            title: draft.title,
            desc: draft.desc,
            tags: draft.tags,
            date: dueDateOf(t) ?? t.scheduledDate ?? "",
            time: t.timeLabel ?? "",
            durationMinutes: t.durationMinutes,
            repeat: t.recurrenceRule ?? "none",
            priority: t.priority,
            // Kept photos + newly uploaded ones. The action treats this as the full replacement
            // set and hard-deletes whatever the user removed.
            imageUrls: [...photos.value, ...uploaded],
          });
        },
        {
          toast: dict.tUpdated,
          after: () => {
            setCoreEdit(null);
            setEditPhotos({ value: [], pending: [] });
          },
        },
      );
    },
    [dict, editPhotos, organizationId, run],
  );

  const toggleComplete = useCallback(
    (t: TaskRecord, occ?: { date: string; done: boolean }) => {
      // The checkbox can move status behind the segmented control's back; drop any pending segment
      // click so it can't re-apply if the status happens to land back on its `from` value.
      setStatusDraft(null);
      // Recurring: completion is per-occurrence (occ.date) and the done state comes from the
      // occurrence, not the row's status (which stays open). One-off: row status.
      const occDate = occ?.date;
      const isDone = occ ? occ.done : t.status === "completed";
      if (isDone) {
        run(() => toggleConsoleComplete(t.id, false, occDate), { toast: dict.tReopened });
        return;
      }
      const sub = occ ? undefined : recurringNextLabel(t);
      run(() => toggleConsoleComplete(t.id, true, occDate), {
        after: () =>
          showUndo(
            dict.tCompleted,
            () =>
              run(() => toggleConsoleComplete(t.id, false, occDate), { after: () => setUndo(null) }),
            sub,
          ),
      });
    },
    [run, dict, recurringNextLabel, showUndo],
  );
  // Immediate (soft) delete + undo toast — replaces the confirm modal for single-task delete.
  const deleteWithUndo = useCallback(
    (t: TaskRecord) => {
      run(() => deleteConsoleTask(t.id), {
        after: () => {
          if (sel === t.id || panelTask === t.id) closePanel();
          showUndo(dict.tDeletedUndoable, () =>
            run(() => restoreConsoleTask(t.id), { after: () => setUndo(null) }),
          );
        },
      });
    },
    [run, dict, sel, panelTask, closePanel, showUndo],
  );
  /**
   * 회차 하나만 건너뛰기 + 실행 취소. `skipped` 는 영구 상태라 되돌릴 경로가 반드시 있어야 한다
   * (그래서 확인 모달 대신 실행 취소 토스트를 쓴다 — 이 콘솔의 단건 삭제와 같은 판단).
   */
  const skipOccurrenceWithUndo = useCallback(
    (t: TaskRecord, date: string) => {
      setRecurDel(null);
      run(() => skipConsoleOccurrence(t.id, date), {
        after: () =>
          showUndo(fill(dict.recurSkippedToast, { date: fmtShort(date, locale) }), () =>
            run(() => unskipConsoleOccurrence(t.id, date), { after: () => setUndo(null) }),
          ),
      });
    },
    [run, dict, locale, showUndo],
  );
  // Enter/exit animation driven by the open/close intent (`sel`). All setState is deferred into
  // rAF/setTimeout so nothing runs synchronously in the effect body.
  useEffect(() => {
    if (sel) {
      // Mount is already done (panelTask set by openTask); flip `.on` next frame to slide in.
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setPanelOn(true)));
      return () => cancelAnimationFrame(r);
    }
    // Slide out, then unmount the content once the transition has finished.
    const r = requestAnimationFrame(() => setPanelOn(false));
    const t = setTimeout(() => {
      setPanelTask(null);
      setDetail(null);
    }, 300);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, [sel]);

  // ── project detail loading ───────────────────────────────────────────────────────
  // Load project sections+tasks for the project view. Gated on `projectDetail.id === projectId`.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    getConsoleProjectDetail(projectId).then((res) => {
      if (alive && res.ok) setProjectDetail(res.project);
    });
    return () => {
      alive = false;
    };
  }, [projectId, data]);

  // ── global close on outside click / Esc ──────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirm) setConfirm(null);
      else if (pop) setPop(null);
      else if (daySheet) setDaySheet(null);
      else if (report) setReport(null);
      else if (newProj) setNewProj(null);
      else if (sel) closePanel();
      else if (add) setAdd(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, pop, daySheet, report, newProj, sel, add, closePanel]);

  // ── keep the Tokyo operating date live (roll over at Tokyo midnight without a refresh) ──────
  useEffect(() => {
    const check = () => setToday((prev) => (tokyoToday() !== prev ? tokyoToday() : prev));
    const id = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  // ── popover placement: put the whole popover on screen (no scroll on normal viewports) ──────
  // Measured before paint (useLayoutEffect): fit below the trigger, else above, else clamp.
  // Positioned imperatively via the DOM (no setState) so there's no re-render/flicker/jump.
  useIsoLayoutEffect(() => {
    const el = popAnchorRef.current;
    if (!el || !pop) return;
    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const left = Math.max(8, Math.min(pop.x, vw - w - 8));
      let top = pop.y; // below the trigger
      if (top + h > vh - 8) {
        const above = pop.aTop - 6 - h; // flip above the trigger
        top = above >= 8 ? above : Math.max(8, vh - 8 - h);
      }
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
    };
    place();
    // Popovers that load their content async (컨텍스트 피커) or expand a section (일정 피커) grow
    // AFTER this effect measured them, and a one-shot placement leaves the grown part off-screen.
    // Re-clamping on resize keeps the footer reachable without special-casing any one popover.
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pop]);

  // ── derived task groups (프로젝트 제외 personalTasks 기준, 내 뷰는 myOwn) ─────────────────
  const overdueList = personalTasks.filter((t) => isOverdue(t, today) && myOwn(t, meId));
  // 관리함 = 프로젝트 밖 모든 활성 작업(날짜 무관).
  const inboxCount = personalTasks.filter((t) => isActive(t) && myOwn(t, meId)).length;
  // 반복 회차 포함: 오늘 미완료 회차 + 반복 지연 backlog(작업별 1건) + 내일 미완료 회차.
  const recTodayCount = personalTasks.filter((t) => myOwn(t, meId) && openOccursOn(t, today)).length;
  const recOverdueCount = personalTasks.filter(
    (t) => myOwn(t, meId) && overdueOccurrenceDates(t, today, resolvedDatesFor(t.id)).length > 0,
  ).length;
  const recTomorrowCount = personalTasks.filter(
    (t) => myOwn(t, meId) && openOccursOn(t, addDays(today, 1)),
  ).length;
  const todayCount =
    personalTasks.filter((t) => isTodayTask(t, today) && myOwn(t, meId)).length +
    overdueList.length +
    recTodayCount +
    recOverdueCount;
  const tomorrowCount =
    personalTasks.filter((t) => isTomorrowTask(t, today) && myOwn(t, meId)).length + recTomorrowCount;
  const sharedCount = personalTasks.filter(
    (t) => isActive(t) && isSharedTask(t) && !sentInstr(t, meId) && !recvInstr(t, meId),
  ).length;
  const recvOpen = personalTasks.filter((t) => recvInstr(t, meId) && isActive(t)).length;
  const sentOpen = personalTasks.filter((t) => sentInstr(t, meId) && isActive(t)).length;

  const matches = useCallback(
    (t: TaskRecord) =>
      matchQuery(t, q, nameOf) && matchPrio(t, prioFilter) && matchDate(t, dateFilter, today),
    [q, nameOf, prioFilter, dateFilter, today],
  );
  const filtered = useCallback(
    (arr: TaskRecord[]) => arr.filter(matches),
    [matches],
  );
  const hasActiveFilter = !!(q || prioFilter || dateFilter);

  // ── small building blocks ─────────────────────────────────────────────────────────
  const Avatar = ({ id, cls }: { id: string; cls?: string }) => (
    <span className={cls ? `av ${cls}` : "av"} style={{ background: avatarColor(id, meId) }}>
      {initial(nameOf(id))}
    </span>
  );
  const Avatars = ({ ids }: { ids: string[] }) => (
    <>
      {ids.slice(0, 4).map((id) => (
        <Avatar key={id} id={id} />
      ))}
    </>
  );

  const partsSummary = (t: TaskRecord): string => {
    const list = (isMine(t, meId) ? partsOf(t) : [t.createdByUserId, ...partsOf(t)]).filter(
      (id, i, a) => a.indexOf(id) === i && id !== meId,
    );
    if (list.length === 0) return dict.sharedWith;
    if (list.length === 1) return nameOf(list[0]);
    return fill(dict.andMore, { name: nameOf(list[0]), n: list.length - 1 });
  };

  const CTX_IC: Record<string, ReactNode> = {
    building: <Building2 size={14} />,
    bed: <BedDouble size={14} />,
    ticket: <Ticket size={14} />,
    guest: <UserRound size={14} />,
  };
  const ctxKey: Record<string, string> = {
    building: dict.ctxBuilding,
    bed: dict.ctxBed,
    ticket: dict.ctxTicket,
    guest: dict.ctxGuest,
  };

  // ── TASK ROW ──────────────────────────────────────────────────────────────────────
  const renderRow = (
    t: TaskRecord,
    opts?: {
      hideDate?: boolean;
      extraByLabel?: string;
      forceDone?: boolean;
      // 반복 회차 행: 이 날짜 회차의 완료 여부로 체크박스/완료 처리(행 status가 아니라).
      occurrence?: { date: string; done: boolean };
      // 관리함 드래그 재정렬: 왼쪽에 그립 핸들 표시(호버 시).
      reorder?: boolean;
      // 지연 일괄 처리 대상 선택. 전역 선택모드와 같은 `.tpick` 체크박스를 쓰되 집합만 다르다.
      pick?: { on: boolean; toggle: () => void };
    },
  ) => {
    const occ = opts?.occurrence;
    const realDone = occ ? occ.done : t.status === "completed";
    // forceDone: 완료·기록 탭의 반복 완료 이력(행은 open 으로 롤포워드됨)을 완료 상태로 표시.
    const done = realDone || !!opts?.forceDone;
    const overdue = isOverdue(t, today);
    const selected = sel === t.id;
    const instr = t.isDirective && !isMine(t, meId) ? t.authorName : null;
    const received = !isMine(t, meId) && !instr;
    const pcls = t.priority !== "normal" ? `p-${t.priority}` : "";
    const d = dateOf(t);
    const cx = ctxItems(t);
    const trng = timeRange(t.timeLabel, t.durationMinutes);

    const dateText = !d
      ? ""
      : overdue
        ? `${fmtShort(d, locale)} · ${dict.stOverdue}`
        : d === today
          ? dict.today
          : d === addDays(today, 1)
            ? dict.tomorrow
            : `${fmtShort(d, locale)} (${fmtWeekday(d, locale)})`;
    const dateCls = `chip chip--date ${overdue ? "chip--over" : d === today ? "chip--today" : ""}`;
    // 칩을 눌러 여는 일정 팝오버도 결국 `rescheduleConsoleTask` 라 **작성자 전용**이다. 남의 작업에서는
    // 눌리지 않는 표시용 칩으로 렌더한다 — 열어 준 뒤 저장에서 "권한이 없습니다"를 띄우지 않도록.
    const dateChip =
      !opts?.hideDate && d ? (
        isMine(t, meId) ? (
          <button
            className={`${dateCls} chip--btn`}
            onClick={(e) => {
              e.stopPropagation();
              openSchedulePop(e, t);
            }}
          >
            <CalendarDays size={13} />
            {dateText}
          </button>
        ) : (
          <span className={dateCls}>
            <CalendarDays size={13} />
            {dateText}
          </span>
        )
      ) : null;

    // 전역 선택모드가 켜져 있으면 그쪽이 이긴다 — 두 선택 UI 가 한 행에 겹치지 않게.
    const odPick = selMode ? undefined : opts?.pick;
    const picking = selMode || !!odPick;
    const isPicked = odPick ? odPick.on : picked.has(t.id);
    const togglePick = odPick ? odPick.toggle : () => togglePicked(t.id);

    return (
      <div
        key={t.id}
        data-task-id={t.id} /* read by 전체 선택 (selectAllVisible) */
        className={`trow ${done ? "is-done" : ""} ${selected && !picking ? "sel" : ""} ${
          picking ? "is-picking" : ""
        } ${isPicked ? "is-picked" : ""} ${opts?.reorder ? "trow--reorder" : ""}`}
        onClick={() => (picking ? togglePick() : openTask(t.id))}
      >
        {opts?.reorder && !picking ? (
          <span className="tgrip" aria-hidden="true">
            <GripVertical size={16} />
          </span>
        ) : null}
        {picking ? (
          <button
            type="button"
            className={`tpick ${isPicked ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              togglePick();
            }}
            role="checkbox"
            aria-checked={isPicked}
            aria-label={t.title}
          >
            <Check size={13} />
          </button>
        ) : (
          <button
            className={`tchk ${pcls} ${done ? "is-done" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              // 반복 완료 이력은 이미 다음 회차로 넘어가 있어 되돌릴 대상이 아님 → 토글 금지.
              if (opts?.forceDone && !realDone) return;
              toggleComplete(t, occ);
            }}
            aria-label={dict.stCompleted}
          >
            <Check size={13} />
          </button>
        )}
        <div className="tbody">
          <div className="trow__head">
            {received && (
              <span className="tfrom">
                <Avatar id={t.createdByUserId} /> {nameOf(t.createdByUserId)} →
              </span>
            )}
            <span className="ttitle">{t.title}</span>
          </div>
          {(dateChip || trng || t.recurrenceRule || t.tags.length || t.imageUrls.length || instr || isSharedTask(t)) && (
            <div className="tmeta">
              {dateChip}
              {trng && (
                <span className="chip">
                  <Clock size={13} />
                  {trng}
                </span>
              )}
              {t.recurrenceRule && (
                <span className="chip">
                  <Repeat size={13} />
                  {repeatShort(t.recurrenceRule, dict, locale)}
                </span>
              )}
              {t.tags.slice(0, 2).map((g) => (
                <span key={g} className="chip chip--tag">
                  {g}
                </span>
              ))}
              {instr && (
                <span className="chip chip--instr">
                  <Megaphone size={13} />
                  {fill(dict.instructedBy, { name: instr })}
                </span>
              )}
              {isSharedTask(t) && (
                <span className="tshare">
                  <span className="tshare__avs">
                    <Avatars ids={partsOf(t).filter((id) => id !== meId)} />
                  </span>
                  {partsSummary(t)}
                </span>
              )}
            </div>
          )}
          {opts?.extraByLabel && <span className="tmid tmid--desc"><span className="tmid__x">{opts.extraByLabel}</span></span>}
          {!opts?.extraByLabel && cx.length > 0 && (
            <span className="tmid tmid--ctx">
              {cx.slice(0, 2).map((c, i) => (
                <span key={i} className="tmid__c">
                  {CTX_IC[c.k]}
                  {c.v}
                </span>
              ))}
            </span>
          )}
          {!opts?.extraByLabel && cx.length === 0 && t.description && (
            <span className="tmid tmid--desc">
              <span className="tmid__x">{t.description}</span>
            </span>
          )}
        </div>
        {overdue ? (
          <span className="pill pill--danger">
            <span className="d" />
            {dict.stOverdue}
          </span>
        ) : t.status === "in_progress" ? (
          <span className="pill pill--open">
            <span className="d" />
            {dict.stInProgress}
          </span>
        ) : null}
        {t.priority !== "normal" && (
          <span className={`tflag ${pcls}`}>
            <Flag size={14} fill="currentColor" />
          </span>
        )}
        <button
          className="trow__dots"
          onClick={(e) => {
            e.stopPropagation();
            openRowMenu(e, t.id, occ?.date);
          }}
          aria-label={dict.mPriority}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
    );
  };

  const Section = ({
    title,
    n,
    mod,
    listClass,
    children,
  }: {
    title: string;
    n: number;
    mod?: string;
    listClass?: string;
    children: ReactNode;
  }) => (
    <>
      <div className={`sech ${mod ? `sech--${mod}` : ""}`}>
        <span className="sech__t">{title}</span>
        <span className="sech__n">{n}</span>
        <span className="sech__line" />
      </div>
      <div className={listClass ? `tlist ${listClass}` : "tlist"}>{children}</div>
    </>
  );

  const EmptyState = ({
    icon,
    t,
    s,
    ctx,
  }: {
    icon: ReactNode;
    t: string;
    s: string;
    ctx?: AddDraft["ctx"];
  }) => (
    <div className="tempty">
      <div className="tempty__ic">{icon}</div>
      <p className="tempty__t">{t}</p>
      <p className="tempty__s">{s}</p>
      {ctx && (
        <button className="btn btn--pri tempty__cta" onClick={() => openInlineAdd(ctx)}>
          <Plus size={15} />
          {dict.addTask}
        </button>
      )}
    </div>
  );

  // ── INLINE ADD ──────────────────────────────────────────────────────────────────────
  const openInlineAdd = (ctx: AddDraft["ctx"], onDate = "", sectionId: string | null = null) => {
    // 지시는 날짜 없이 보내면 대상자의 관리함에 묻히기 쉬워 오늘로 잡아 둔다(스케줄 칩에서 변경 가능).
    const date =
      ctx === "today" || ctx === "instr"
        ? today
        : ctx === "tomorrow"
          ? addDays(today, 1)
          : ctx === "day"
            ? onDate
            : "";
    setAdd({
      ctx,
      sectionId,
      onDate,
      title: "",
      desc: "",
      date,
      time: "",
      dur: null,
      repeat: "none",
      prio: "normal",
      targets: [],
      tags: [],
      tagInput: "",
      context: undefined,
    });
    setAddPhotos([]);
  };
  const saveInlineAdd = () => {
    if (!add || !add.title.trim()) return;
    const draft = add;
    const photos = addPhotos;
    // The task id is minted here so the photos can be uploaded to their final
    // `${organizationId}/task-images/${id}/` path BEFORE the row exists — the same order the mobile
    // form uses. If the insert then fails the objects are orphaned, which is the accepted trade
    // (an orphan file beats a row referencing an upload that never happened).
    const newTaskId = crypto.randomUUID();
    run(
      async () => {
        const imageUrls = photos.length
          ? await uploadPendingTaskPhotos({ pending: photos, organizationId, taskId: newTaskId })
          : [];
        return createConsoleTask({
          title: draft.title,
          desc: draft.desc,
          date: draft.date,
          time: draft.time,
          durationMinutes: draft.dur,
          repeat: draft.repeat,
          priority: draft.prio,
          // 커밋 안 된 입력 버퍼도 마지막 태그로 인정한다(Enter 없이 바로 저장하는 흐름).
          tags: [...draft.tags, draft.tagInput.trim().replace(/^#/, "")].filter(Boolean).slice(0, 10),
          projectId: draft.ctx === "project" ? projectId : null,
          sectionId: draft.ctx === "project" ? draft.sectionId : null,
          targetUserIds: draft.targets,
          isDirective: draft.targets.length > 0,
          context: draft.context,
          imageUrls,
        });
      },
      {
        toast: draft.targets.length > 0 ? dict.tInstructed : dict.tCreated,
        after: () => {
          setAdd(null);
          setAddPhotos([]);
        },
      },
    );
  };

  const InlineAdd = () => {
    if (!add) return null;
    const schLabel = add.date
      ? `${fmtShort(add.date, locale)}(${fmtWeekday(add.date, locale)})${add.time ? ` ${add.time}` : ""}`
      : dict.iaSchedule;
    const prLabel = add.prio === "normal" ? dict.iaPriority : prioLabel(add.prio, dict);
    const tgLabel =
      add.targets.length === 0
        ? dict.iaTarget
        : add.targets.length === 1
          ? nameOf(add.targets[0])
          : fill(dict.andMore, { name: nameOf(add.targets[0]), n: add.targets.length - 1 });
    const projName = add.ctx === "project" && projectId ? projById.get(projectId)?.title ?? "" : "";
    const footLabel = projName
      ? projName
      : add.targets.length > 0
        ? dict.iaSendInstr
        : dict.iaInbox;
    return (
      <div className="iadd" onClick={(e) => e.stopPropagation()}>
        <div className="iadd__main">
          <input
            className="iadd__title"
            autoFocus
            placeholder={dict.iaTitle}
            value={add.title}
            onChange={(e) => setAdd({ ...add, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveInlineAdd();
            }}
          />
          <textarea
            className="iadd__desc"
            placeholder={dict.iaDesc}
            rows={1}
            value={add.desc}
            onChange={(e) => setAdd({ ...add, desc: e.target.value })}
          />
        </div>
        <div className="iadd__chips">
          <button
            className={`achip ${add.date ? (isOverduePlain(add.date) ? "set set--red" : "set") : ""}`}
            onClick={(e) => openSchedulePop(e, null)}
          >
            <CalendarDays size={13} />
            {schLabel}
          </button>
          <button
            className={`achip ${add.prio === "urgent" ? "set set--rose" : add.prio === "important" ? "set set--amber" : ""}`}
            onClick={(e) => openPrioPop(e, null)}
          >
            <Flag size={13} />
            {prLabel}
          </button>
          {add.ctx !== "project" && (
            <button
              className={`achip ${add.targets.length ? "set" : ""}`}
              onClick={(e) => openSharePop(e, null, "target")}
            >
              <UserPlus size={13} />
              {tgLabel}
            </button>
          )}
          <button
            className={`achip ${add.context?.propertyId || add.context?.reservationId ? "set" : ""}`}
            onClick={(e) => openContextPop(e, null)}
          >
            <Building2 size={13} />
            {[add.context?.propertyName, add.context?.roomLabel].filter(Boolean).join(" · ") ||
              dict.cpTitle}
          </button>
          {/* 칩 줄의 마지막 칩. `display: contents` 라 드롭존과 썸네일이 이 flex 줄의 직접 자식이
              되어, 사진이 없으면 칩 하나, 있으면 아래 줄로 자연스럽게 감긴다. */}
          <TaskPhotoUploader
            compact
            value={[]}
            pending={addPhotos}
            maxImages={add.ctx === "project" ? 20 : 5}
            copy={photoCopy}
            onChange={(next) => setAddPhotos(next.pending)}
          />
          {/* 태그는 칩 순서상 마지막(사진 바로 오른쪽). 사진 썸네일은 `order: 99` 라 아래 줄로
              빠지므로 그 사이를 끊지 않는다. */}
          <span className="iadd__tagwrap">
            {/* 태그 — 칩 줄 안에서 바로 입력. 10개 상한은 서버(slice 10)와 동일. */}
            {add.tags.map((g) => (
              <span key={g} className="chip chip--tag">
                {g}
                <button
                  type="button"
                  className="chip__x"
                  aria-label={`${g} ${dict.iaCancel}`}
                  onClick={() => setAdd({ ...add, tags: add.tags.filter((x) => x !== g) })}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {add.tags.length < 10 && (
              <input
                className="iadd__taginput"
                value={add.tagInput}
                placeholder={dict.dpTagAdd}
                onChange={(e) => setAdd({ ...add, tagInput: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const tag = add.tagInput.trim().replace(/^#/, "");
                    if (!tag || add.tags.includes(tag)) {
                      setAdd({ ...add, tagInput: "" });
                      return;
                    }
                    setAdd({ ...add, tags: [...add.tags, tag], tagInput: "" });
                  } else if (e.key === "Backspace" && !add.tagInput && add.tags.length) {
                    setAdd({ ...add, tags: add.tags.slice(0, -1) });
                  }
                }}
              />
            )}
          </span>
        </div>
        <div className="iadd__foot">
          <span className="proj">
            <Hash size={12} />
            {footLabel}
          </span>
          <span className="sp" />
          <button className="btn btn--ghost btn--sm" onClick={() => setAdd(null)}>
            {dict.iaCancel}
          </button>
          {/* 지시 탭에서 시작한 추가는 대상이 없으면 지시가 아니라 내 개인 작업이 되어, 저장 직후
              이 목록에서 사라진다. 그래서 대상을 필수로 건다. */}
          <button
            className="btn btn--pri btn--sm"
            disabled={!add.title.trim() || (add.ctx === "instr" && add.targets.length === 0)}
            onClick={saveInlineAdd}
          >
            {add.ctx === "instr" ? dict.iaSendInstrCta : dict.iaSave}
          </button>
        </div>
      </div>
    );
  };
  const isOverduePlain = (ymd: string) => ymd < today;

  const InlineAddSlot = ({ ctx, sectionId, label }: { ctx: AddDraft["ctx"]; sectionId?: string | null; label?: string }) => {
    if (add && add.ctx === ctx && (ctx !== "project" || add.sectionId === (sectionId ?? null)))
      return InlineAdd();
    return (
      <button className="iadd-trigger" onClick={() => openInlineAdd(ctx, "", sectionId ?? null)}>
        <span className="p">
          <Plus size={14} />
        </span>
        {label ?? dict.addTask}
      </button>
    );
  };

  // ── POPOVER OPENERS ─────────────────────────────────────────────────────────────────
  const openSchedulePop = (e: ReactMouseEvent, t: TaskRecord | null) => {
    e.stopPropagation();
    const a = anchorFrom(e);
    if (t) {
      const d = dueDateOf(t) ?? t.scheduledDate ?? "";
      setPop({
        kind: "schedule",
        src: "task",
        taskId: t.id,
        draft: { date: d, time: t.timeLabel ?? "", dur: t.durationMinutes, repeat: t.recurrenceRule ?? "none" },
        calMonth: (d || today).slice(0, 7),
        expand: null,
        ...a,
      });
    } else if (add) {
      setPop({
        kind: "schedule",
        src: "add",
        taskId: null,
        draft: { date: add.date, time: add.time, dur: add.dur, repeat: add.repeat },
        calMonth: (add.date || today).slice(0, 7),
        expand: null,
        ...a,
      });
    }
  };
  const openPrioPop = (e: ReactMouseEvent, t: TaskRecord | null) => {
    e.stopPropagation();
    const a = anchorFrom(e);
    setPop({ kind: "prio", src: t ? "task" : "add", taskId: t?.id ?? null, cur: t ? t.priority : add?.prio ?? "normal", ...a });
  };
  const openSharePop = (e: ReactMouseEvent, t: TaskRecord | null, mode: "target" | "share") => {
    e.stopPropagation();
    const a = anchorFrom(e);
    const sel0 = t ? partsOf(t) : add?.targets ?? [];
    setPop({ kind: "share", src: t ? "task" : "add", taskId: t?.id ?? null, mode, sel: sel0, q: "", ...a });
  };
  const openProjectMembersPop = (e: ReactMouseEvent, pid: string, current: string[]) => {
    e.stopPropagation();
    setPop({
      kind: "share",
      src: "project",
      taskId: null,
      projectId: pid,
      mode: "share",
      sel: current,
      q: "",
      ...anchorFrom(e),
    });
  };
  const openContextPop = (e: ReactMouseEvent, t: TaskRecord | null) => {
    e.stopPropagation();
    setPop({ kind: "context", src: t ? "task" : "add", taskId: t?.id ?? null, ...anchorFrom(e) });
  };
  const openRowMenu = (e: ReactMouseEvent, taskId: string, occ?: string) => {
    e.stopPropagation();
    setPop({ kind: "rowmenu", taskId, occ, ...anchorFrom(e) });
  };

  // ── SCHEDULE / PRIO / SHARE APPLY ─────────────────────────────────────────────────────
  const applySchedule = (p: SchedulePop) => {
    if (p.src === "add") {
      if (add) setAdd({ ...add, date: p.draft.date, time: p.draft.time, dur: p.draft.dur, repeat: p.draft.repeat });
      setPop(null);
      return;
    }
    if (p.src === "overdue") {
      // 대상은 사용자가 고른 지연 작업들(`odPicked`). 각 작업의 시각은 서버가 보존하므로 피커의
      // 시간·반복 값은 여기서 의미가 없다 — 날짜만 넘긴다.
      // 전에는 클라이언트의 `overdueList` 를 그대로 돌며 작업마다 `rescheduleConsoleTask` 를 불렀다.
      // 이제는 서버가 "내가 만든 · 일회성 · 진짜 지연"인지 다시 계산한다(`rescheduleConsoleOverdue`).
      const date = p.draft.date;
      const ids = [...odPicked];
      setPop(null);
      // 피커의 "날짜 없음"은 일괄 처리에서는 뜻이 없다(지연 12건을 통째로 관리함에 쏟는 조작).
      // 서버도 invalid_date 로 막으므로 여기서 조용히 접는다.
      if (ids.length === 0 || !date) return;
      run(() => rescheduleConsoleOverdue(date, ids), {
        toast: dict.tRescheduled,
        after: () => setOdPicked(new Set()),
      });
      return;
    }
    if (!p.taskId) {
      setPop(null);
      return;
    }
    // Empty date is allowed here: rescheduleConsoleTask clears the schedule → task moves to Inbox.
    const id = p.taskId;
    const d = p.draft;
    run(() => rescheduleConsoleTask(id, { date: d.date, time: d.time, durationMinutes: d.dur, repeat: d.repeat }), {
      toast: dict.tRescheduled,
      after: () => setPop(null),
    });
  };
  const applyPrio = (p: PrioPop, prio: string) => {
    if (p.src === "add") {
      if (add) setAdd({ ...add, prio });
      setPop(null);
      return;
    }
    const t = tasks.find((x) => x.id === p.taskId);
    if (!t) {
      setPop(null);
      return;
    }
    run(
      () =>
        updateConsoleTaskCore({
          taskId: t.id,
          title: t.title,
          desc: t.description ?? "",
          date: dueDateOf(t) ?? t.scheduledDate ?? "",
          time: t.timeLabel ?? "",
          durationMinutes: t.durationMinutes,
          repeat: t.recurrenceRule ?? "none",
          priority: prio,
          tags: t.tags,
        }),
      { toast: dict.tUpdated, after: () => setPop(null) },
    );
  };
  const applyShare = (p: SharePop) => {
    if (p.src === "project" && p.projectId) {
      const pid = p.projectId;
      const detail = projectDetail && projectDetail.id === pid ? projectDetail : null;
      // 소유자는 목록에서 빼고 비교한다 — 서버도 생성자 제거를 거부하므로 diff 에 넣을 이유가 없다.
      const ownerId = detail?.createdByUserId;
      const before = (detail?.members ?? [])
        .map((mem) => mem.userId)
        .filter((uid) => uid !== ownerId);
      const after = p.sel.filter((uid) => uid !== ownerId);
      const added = after.filter((uid) => !before.includes(uid));
      const removed = before.filter((uid) => !after.includes(uid));
      if (added.length === 0 && removed.length === 0) {
        setPop(null);
        return;
      }
      run(
        async () => {
          for (const uid of removed) {
            const res = await removeConsoleProjectMember(pid, uid);
            if (!res.ok) return res;
          }
          return added.length
            ? await inviteConsoleProjectMembers(pid, added)
            : ({ ok: true } as TaskActionResult);
        },
        { toast: dict.tShared, after: () => setPop(null) },
      );
      return;
    }
    if (p.src === "add") {
      if (add) setAdd({ ...add, targets: p.sel });
      setPop(null);
      return;
    }
    if (!p.taskId) {
      setPop(null);
      return;
    }
    const id = p.taskId;
    const t = tasks.find((x) => x.id === id);
    const asDirective = p.mode === "target" || (t?.isDirective ?? false);
    run(() => shareConsoleTask(id, p.sel, asDirective), {
      toast: asDirective ? dict.tInstructed : dict.tShared,
      after: () => setPop(null),
    });
  };

  // ── 프로젝트 섹션 ────────────────────────────────────────────────────────────────────
  const addSection = (projectId: string) => {
    const title = newSection.trim();
    if (!title) return;
    run(() => addConsoleProjectSection(projectId, title), {
      toast: dict.tCreated,
      after: () => setNewSection(""),
    });
  };
  const saveSectionRename = (projectId: string, draft: { id: string; title: string }) => {
    const title = draft.title.trim();
    // 빈 이름은 취소로 처리 — blur 로도 호출되므로 여기서 막지 않으면 실패 토스트가 뜬다.
    if (!title) {
      setSectionEdit(null);
      return;
    }
    run(() => renameConsoleProjectSection(projectId, draft.id, title), {
      toast: dict.tUpdated,
      after: () => setSectionEdit(null),
    });
  };

  // ── SELECTION MODE + BULK DELETE ────────────────────────────────────────────────────
  const clearSel = useCallback(() => setPicked(new Set()), []);
  const exitSelMode = useCallback(() => {
    setSelMode(false);
    setPicked(new Set());
  }, []);
  const togglePicked = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  /** "전체 선택" = every row currently on screen, read from the rendered list at click time.
   *  Each view builds its own list inline (today = 지난 + 오늘, 공유함 = 받음 + 보냄, …) with the
   *  search/date/priority filters already applied, so reading the DOM is what actually matches what
   *  the user sees — recomputing those seven filter expressions here would be a second source of
   *  truth that silently drifts. This only ever runs from a click, never during render. */
  const selectAllVisible = useCallback(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>(".adm .trow[data-task-id]"))
      .map((el) => el.dataset.taskId)
      .filter((id): id is string => Boolean(id));
    setPicked(new Set(ids));
  }, []);

  /** Delete every id in one round trip. Only rows the user authored come back as `deletedIds`, so
   *  the undo toast is offered for those alone — a "leave" can't be reversed by clearing deleted_at. */
  const runBulkDelete = useCallback(
    (ids: string[], onDone?: () => void) => {
      if (!ids.length) return;
      startTransition(async () => {
        const res = await bulkDeleteConsoleTasks(ids);
        if (!res.ok) {
          showToast(errMsg(res.error));
          return;
        }
        const removed = res.deletedIds.length + res.leftIds.length;
        if (res.failedIds.length) {
          showToast(fill(dict.tBulkPartial, { n: removed, f: res.failedIds.length }));
        } else if (res.deletedIds.length) {
          showUndo(fill(dict.tBulkDeleted, { n: removed }), () =>
            run(() => restoreConsoleTasks(res.deletedIds), { after: () => setUndo(null) }),
          );
        } else {
          showToast(fill(dict.tBulkDeleted, { n: removed }));
        }
        onDone?.();
        router.refresh();
      });
    },
    [dict, errMsg, run, router, showToast, showUndo],
  );

  const askBulkDelete = () => {
    const ids = [...picked];
    if (!ids.length) return;
    const hasShared = ids.some((id) => {
      const t = tasks.find((x) => x.id === id);
      return t ? !isMine(t, meId) : false;
    });
    setConfirm({
      message: `${fill(dict.confirmBulkMsg, { n: ids.length })}${
        hasShared ? `\n${dict.confirmBulkSharedNote}` : ""
      }`,
      confirmLabel: dict.confirmDeleteBtn,
      onConfirm: () => runBulkDelete(ids, exitSelMode),
    });
  };

  // ── OVERDUE BULK ────────────────────────────────────────────────────────────────────
  // 대상은 사용자가 고른 `odPicked` 뿐이고, 서버가 다시 "내가 만든 · 일회성 · 진짜 지연"만 남긴다
  // (`dismissConsoleOverdue`). 전부 내 작업이므로 실행 취소(복원)를 그대로 제공할 수 있다.
  const clearOverdue = () => {
    const ids = [...odPicked];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await dismissConsoleOverdue(ids);
      if (!res.ok) {
        showToast(errMsg(res.error));
        return;
      }
      setOdPicked(new Set());
      if (res.deletedIds.length > 0) {
        const restoreIds = res.deletedIds;
        showUndo(fill(dict.tBulkDeleted, { n: restoreIds.length }), () =>
          run(() => restoreConsoleTasks(restoreIds), { after: () => setUndo(null) }),
        );
      } else {
        showToast(dict.tDeleted);
      }
      router.refresh();
    });
  };

  // ── VIEWS ────────────────────────────────────────────────────────────────────────────
  // 반복 지연 backlog 묶음 행(작업별 1건 · N일 밀림 · [오늘로 가져오기]/[삭제]).
  const renderOverdueGroup = (t: TaskRecord, days: number) => (
    <div key={`od-${t.id}`} className="odgroup">
      <button className="odgroup__b" onClick={() => openTask(t.id)}>
        <span className="odgroup__t">{t.title}</span>
        <span className="odgroup__n">{fill(dict.odDaysBehind, { n: days })}</span>
      </button>
      <div className="odgroup__acts">
        <button
          className="od-b"
          onClick={(e) => {
            e.stopPropagation();
            run(() => carryConsoleOverdueToToday(t.id), { toast: dict.tMoved });
          }}
        >
          {dict.odCarry}
        </button>
        <button
          className="od-b od-b--ghost"
          onClick={(e) => {
            e.stopPropagation();
            run(() => skipConsoleOverdue(t.id), { toast: dict.tDeleted });
          }}
        >
          {dict.odSkip}
        </button>
      </div>
    </div>
  );

  const todayView = () => {
    const odOne = filtered(overdueList).sort((a, b) => dateSort(a, b) || prioSort(a, b));
    // 반복 지연 backlog — 작업별 1건.
    // 필터는 네 갈래(지연/오늘 일회성, 지연/오늘 반복) 모두 `filtered()` 로 통일한다(2026-07-31).
    // 전에는 반복 행만 matchQuery/matchPrio 로 걸러 날짜 필터를 빠져나갔고, "날짜 없음"을 걸면
    // 일회성만 사라지고 반복 회차는 남아 필터 결과가 조건과 모순됐다. 모바일도 네 갈래 전부
    // 같은 `applyFilter` 를 통과시킨다.
    const recOverdue = filtered(
      personalTasks.filter((t) => myOwn(t, meId) && isStandardRecurrence(t.recurrenceRule)),
    )
      .map((t) => ({ t, days: overdueOccurrenceDates(t, today, resolvedDatesFor(t.id)).length }))
      .filter((x) => x.days > 0)
      .sort((a, b) => prioSort(a.t, b.t));
    // 오늘 회차 — 일회성(today) + 반복(openOccursOn today = 활성 · 미해결 회차).
    const tdRec = filtered(
      personalTasks.filter((t) => myOwn(t, meId) && openOccursOn(t, today)),
    );
    // 정렬은 renderDateList 가 회차 순서까지 합쳐 처리한다(여기서 미리 정렬하지 않는다).
    const td = [
      ...filtered(personalTasks.filter((t) => isTodayTask(t, today) && myOwn(t, meId))),
      ...tdRec,
    ];
    const overdueCount = odOne.length + recOverdue.length;
    /* 지연 일괄 처리 대상 선택 — 서버가 "내가 만든 · 일회성 · 진짜 지연"만 처리하므로, 남의 공유
       작업은 애초에 담을 수 없게 한다(담아 봐야 서버가 조용히 버려 개수만 거짓이 된다).
       전역 선택모드가 켜져 있으면 그쪽에 자리를 내준다. */
    const odOwnIds = odOne.filter((t) => isMine(t, meId)).map((t) => t.id);
    const odPickable = !selMode && odOwnIds.length > 0;
    const odSelCount = odOwnIds.filter((id) => odPicked.has(id)).length;
    const odAllSel = odSelCount > 0 && odSelCount === odOwnIds.length;
    const toggleOd = (id: string) => {
      const next = new Set(odPicked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setOdPicked(next);
    };
    const toggleAllOd = () => setOdPicked(odAllSel ? new Set() : new Set(odOwnIds));
    if (overdueCount === 0 && td.length === 0 && !add)
      return hasActiveFilter ? (
        <EmptyState icon={<Search size={26} />} t={dict.emFilter} s={dict.emFilterS} />
      ) : (
        <EmptyState icon={<Sun size={26} />} t={dict.emToday} s={dict.emTodayS} ctx="today" />
      );
    return (
      <>
        {overdueCount > 0 && (
          <>
            {odOne.length > 0 && (
              <div className="odbanner">
                <div className="odbanner__ic">
                  <AlertTriangle size={18} />
                </div>
                <div className="odbanner__b">
                  <div className="odbanner__t">{fill(dict.overdueTitle, { n: odOne.length })}</div>
                  <div className="odbanner__s">
                    {odSelCount > 0
                      ? fill(dict.selSelected, { n: odSelCount })
                      : odPickable
                        ? dict.odPickHint
                        : dict.overdueSub}
                  </div>
                </div>
                <div className="odbanner__acts">
                  {odPickable && (
                    <button className="od-b od-b--ghost" onClick={toggleAllOd}>
                      {odAllSel ? dict.selClear : dict.selAll}
                    </button>
                  )}
                  <button
                    className="od-b"
                    disabled={odSelCount === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      const a = anchorFrom(e);
                      setPop({
                        kind: "schedule",
                        src: "overdue",
                        taskId: null,
                        draft: { date: today, time: "", dur: null, repeat: "none" },
                        calMonth: today.slice(0, 7),
                        expand: null,
                        ...a,
                      });
                    }}
                  >
                    {dict.overdueReschedule}
                  </button>
                  <button
                    className="od-b od-b--ghost"
                    disabled={odSelCount === 0}
                    onClick={() =>
                      setConfirm({
                        message: fill(dict.confirmBulkMsg, { n: odSelCount }),
                        confirmLabel: dict.confirmDeleteBtn,
                        onConfirm: clearOverdue,
                      })
                    }
                  >
                    {dict.overdueClear}
                  </button>
                </div>
              </div>
            )}
            {Section({
              title: dict.secOverdue,
              n: overdueCount,
              mod: "over",
              children: (
                <>
                  {odOne.map((t) =>
                    renderRow(
                      t,
                      odPickable && isMine(t, meId)
                        ? { pick: { on: odPicked.has(t.id), toggle: () => toggleOd(t.id) } }
                        : undefined,
                    ),
                  )}
                  {recOverdue.map(({ t, days }) => renderOverdueGroup(t, days))}
                </>
              ),
            })}
          </>
        )}
        {Section({
          title: dict.secToday,
          n: td.length,
          children: (
            <>
              {renderDateList(td, today)}
              {InlineAddSlot({ ctx: "today" })}
            </>
          ),
        })}
      </>
    );
  };

  /**
   * 오늘/내일 목록 렌더 — 일회성과 반복 회차가 **하나의 순서 공간**을 공유한다(2026-07-30 B안).
   * 저장은 `reorderConsoleDateTasks` 가 일회성/반복으로 나눠 쓴다. 드래그 방식은 관리함과 동일한
   * HTML5 draggable 이라 콘솔 안에서 조작 감각이 갈리지 않는다.
   */
  const renderDateList = (arr: TaskRecord[], date: string) => {
    const ranked = sortByDateOrder(arr, date);
    const pending = dateOrder && dateOrder.date === date ? dateOrder.ids : null;
    const items = pending
      ? pending
          .map((id) => ranked.find((t) => t.id === id))
          .filter((t): t is TaskRecord => !!t)
          .concat(ranked.filter((t) => !pending.includes(t.id)))
      : ranked;
    // 검색/필터 중엔 부분집합이라 재정렬 비활성(순서가 의미 없음) — 관리함과 같은 규칙.
    const canDrag = !hasActiveFilter && !selMode;
    const onRowDrop = (targetId: string) => {
      if (!dragId || dragId === targetId) {
        setDragId(null);
        setOverId(null);
        return;
      }
      const ids = items.map((t) => t.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      setDragId(null);
      setOverId(null);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      setDateOrder({ date, ids });
      run(() =>
        reorderConsoleDateTasks(
          date,
          ids.map((id) => ({
            taskId: id,
            recurring: isStandardRecurrence(items.find((t) => t.id === id)?.recurrenceRule ?? null),
          })),
        ),
      );
    };
    return items.map((t) => (
      <div
        key={t.id}
        className={`idrag ${dragId === t.id ? "is-drag" : ""} ${
          overId === t.id && dragId && dragId !== t.id ? "is-over" : ""
        }`}
        draggable={canDrag}
        onDragStart={canDrag ? () => setDragId(t.id) : undefined}
        onDragOver={
          canDrag
            ? (e) => {
                e.preventDefault();
                if (overId !== t.id) setOverId(t.id);
              }
            : undefined
        }
        onDrop={canDrag ? () => onRowDrop(t.id) : undefined}
        onDragEnd={canDrag ? () => { setDragId(null); setOverId(null); } : undefined}
      >
        {isStandardRecurrence(t.recurrenceRule)
          ? renderRow(t, { occurrence: { date, done: false }, reorder: canDrag })
          : renderRow(t, { reorder: canDrag })}
      </div>
    ));
  };

  const listView = (arr: TaskRecord[], label: string, ctx: AddDraft["ctx"], emptyIcon: ReactNode, emT: string, emS: string) => {
    const items = filtered(arr).sort((a, b) => prioSort(a, b) || dateSort(a, b));
    if (items.length === 0 && !add)
      return hasActiveFilter ? (
        <EmptyState icon={<Search size={26} />} t={dict.emFilter} s={dict.emFilterS} />
      ) : (
        <EmptyState icon={emptyIcon} t={emT} s={emS} ctx={ctx} />
      );
    return Section({
      title: label,
      n: items.length,
      children: (
        <>
          {items.map((t) => renderRow(t))}
          {InlineAddSlot({ ctx })}
        </>
      ),
    });
  };

  // 내일 — 일회성(내일 기준일) + 반복(내일 회차, 미완료). 반복은 occurrence 행으로 렌더.
  const tomorrowView = () => {
    const tm = addDays(today, 1);
    // 오늘 뷰와 같은 이유로 반복 회차도 `filtered()`(검색·우선순위·**날짜**)를 통과시킨다.
    const rec = filtered(personalTasks.filter((t) => myOwn(t, meId) && openOccursOn(t, tm)));
    // 정렬은 renderDateList 가 회차 순서까지 합쳐 처리한다.
    const items = [
      ...filtered(personalTasks.filter((t) => isTomorrowTask(t, today) && myOwn(t, meId))),
      ...rec,
    ];
    if (items.length === 0 && !add)
      return hasActiveFilter ? (
        <EmptyState icon={<Search size={26} />} t={dict.emFilter} s={dict.emFilterS} />
      ) : (
        <EmptyState icon={<Sunrise size={26} />} t={dict.emTomorrow} s={dict.emTomorrowS} ctx="tomorrow" />
      );
    return Section({
      title: dict.vTomorrow,
      n: items.length,
      children: (
        <>
          {renderDateList(items, tm)}
          {InlineAddSlot({ ctx: "tomorrow" })}
        </>
      ),
    });
  };

  const inboxView = () => {
    // 관리함 = 프로젝트 밖 모든 활성 작업(날짜 무관). 수동 드래그 순서 허용(2026-07-30):
    // 랭크된(sort_order) 작업이 위, 미랭크는 최신순(새 작업 top 유지). 드래그 직후엔 낙관적 순서.
    const base = filtered(personalTasks.filter((t) => isActive(t) && myOwn(t, meId)));
    const ranked = base.slice().sort((a, b) => {
      const ao = a.sortOrder;
      const bo = b.sortOrder;
      if (ao != null && bo != null) return ao !== bo ? ao - bo : b.createdAt.localeCompare(a.createdAt);
      if (ao != null) return -1;
      if (bo != null) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
    const items = inboxOrder
      ? inboxOrder
          .map((id) => ranked.find((t) => t.id === id))
          .filter((t): t is TaskRecord => !!t)
          .concat(ranked.filter((t) => !inboxOrder.includes(t.id)))
      : ranked;
    // 검색/필터 중엔 부분집합이라 재정렬 비활성(순서가 의미 없음).
    const canDrag = !hasActiveFilter && !selMode;
    const onRowDrop = (targetId: string) => {
      if (!dragId || dragId === targetId) {
        setDragId(null);
        setOverId(null);
        return;
      }
      const ids = items.map((t) => t.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      setDragId(null);
      setOverId(null);
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      setInboxOrder(ids);
      run(() => reorderConsoleTasks(ids));
    };
    return (
      <>
        <p className="tempty__s" style={{ textAlign: "left", padding: "0 2px 10px" }}>
          {dict.inboxNote}
        </p>
        {items.length === 0 && !add ? (
          hasActiveFilter ? (
            <EmptyState icon={<Search size={26} />} t={dict.emFilter} s={dict.emFilterS} />
          ) : (
            <EmptyState icon={<Inbox size={26} />} t={dict.emInbox} s={dict.emInboxS} ctx="inbox" />
          )
        ) : (
          <div className="tlist">
            {items.map((t) => (
              <div
                key={t.id}
                className={`idrag ${dragId === t.id ? "is-drag" : ""} ${
                  overId === t.id && dragId && dragId !== t.id ? "is-over" : ""
                }`}
                draggable={canDrag}
                onDragStart={canDrag ? () => setDragId(t.id) : undefined}
                onDragOver={
                  canDrag
                    ? (e) => {
                        e.preventDefault();
                        if (overId !== t.id) setOverId(t.id);
                      }
                    : undefined
                }
                onDrop={canDrag ? () => onRowDrop(t.id) : undefined}
                onDragEnd={canDrag ? () => { setDragId(null); setOverId(null); } : undefined}
              >
                {renderRow(t, { reorder: canDrag })}
              </div>
            ))}
            {InlineAddSlot({ ctx: "inbox" })}
          </div>
        )}
      </>
    );
  };

  const sharedView = () => {
    const all = filtered(
      personalTasks.filter((t) => isActive(t) && isSharedTask(t) && !sentInstr(t, meId) && !recvInstr(t, meId)),
    );
    const received = all.filter((t) => !isMine(t, meId)).sort((a, b) => prioSort(a, b) || dateSort(a, b));
    const sent = all.filter((t) => isMine(t, meId)).sort((a, b) => prioSort(a, b) || dateSort(a, b));
    if (received.length === 0 && sent.length === 0)
      return <EmptyState icon={<Share2 size={26} />} t={dict.emShared} s={dict.emSharedS} />;
    return (
      <>
        {received.length > 0 &&
          Section({ title: dict.sharedRecvSec, n: received.length, children: received.map((t) => renderRow(t)) })}
        {sent.length > 0 &&
          Section({ title: dict.sharedSentSec, n: sent.length, children: sent.map((t) => renderRow(t)) })}
      </>
    );
  };

  // ── INSTR (지시) ─────────────────────────────────────────────────────────────────────
  const sentView = () => {
    const all = filtered(personalTasks.filter((t) => sentInstr(t, meId)));
    const note = (
      <div className="sentnote">
        <Megaphone size={15} />
        <span>{dict.instrSentNote}</span>
      </div>
    );
    if (all.length === 0)
      return (
        <>
          {note}
          {hasActiveFilter ? (
            <EmptyState icon={<Search size={26} />} t={dict.emFilter} s={dict.emFilterS} />
          ) : (
            <EmptyState icon={<Megaphone size={26} />} t={dict.instrEmptySentT} s={dict.instrEmptySentS} />
          )}
          {!hasActiveFilter && InlineAddSlot({ ctx: "instr", label: dict.iaSendInstrCta })}
        </>
      );
    const openT = all.filter((t) => t.status === "open").sort((a, b) => dateSort(a, b) || prioSort(a, b));
    const progT = all.filter((t) => t.status === "in_progress").sort((a, b) => dateSort(a, b) || prioSort(a, b));
    const doneT = all
      .filter((t) => t.status === "completed")
      .sort((a, b) => (completedDateOf(b) ?? "").localeCompare(completedDateOf(a) ?? ""));
    const srow = (t: TaskRecord) => {
      const targets = partsOf(t);
      const d = dateOf(t);
      const overdue = isOverdue(t, today);
      const st: [string, string] =
        t.status === "completed"
          ? ["done", dict.stCompleted]
          : overdue
            ? ["danger", dict.stOverdue]
            : t.status === "in_progress"
              ? ["open", dict.stInProgress]
              : ["muted", dict.instrUnconfirmed];
      return (
        <div key={t.id} className={`srow ${t.status === "completed" ? "is-done" : ""}`} onClick={() => openTask(t.id)}>
          <div className="srow__b">
            <div className="srow__t">
              {t.priority !== "normal" && (
                <span className={`tflag p-${t.priority}`}>
                  <Flag size={12} fill="currentColor" />
                </span>
              )}
              {t.title}
            </div>
            <div className="srow__m">
              <span className="chip">
                <UserPlus size={13} />
                {targets.map((id) => nameOf(id)).join(", ")}
              </span>
              {d ? (
                <span className={`chip ${overdue ? "chip--over" : ""}`}>
                  <CalendarDays size={13} />
                  {fmtShort(d, locale)} ({fmtWeekday(d, locale)})
                </span>
              ) : (
                <span className="chip">
                  <CalendarX2 size={13} />
                  {dict.noDate}
                </span>
              )}
              {t.imageUrls.length > 0 && (
                <span className="chip">
                  <FileText size={13} />
                  {t.imageUrls.length}
                </span>
              )}
            </div>
          </div>
          <div className="srow__r">
            <span className="srow__avs">
              <Avatars ids={targets} />
            </span>
            <span className={`pill pill--${st[0]}`}>
              <span className="d" />
              {st[1]}
            </span>
            <button
              className="srow__b2"
              onClick={(e) => openSharePop(e, t, "share")}
              title={dict.instrChangeTarget}
            >
              <UserPlus size={15} />
            </button>
          </div>
        </div>
      );
    };
    const sec = (title: string, list: TaskRecord[]) =>
      list.length > 0 ? Section({ title, n: list.length, listClass: "slist", children: list.map(srow) }) : null;
    return (
      <>
        {note}
        {sec(dict.instrSecUnconfirmed, openT)}
        {sec(dict.instrSecInProgress, progT)}
        {sec(dict.instrSecCompleted, doneT)}
        {InlineAddSlot({ ctx: "instr", label: dict.iaSendInstrCta })}
      </>
    );
  };

  const recvView = () => {
    const all = filtered(personalTasks.filter((t) => recvInstr(t, meId)));
    const note = (
      <div className="sentnote sentnote--recv">
        <Bell size={15} />
        <span>{dict.instrRecvNote}</span>
      </div>
    );
    if (all.length === 0)
      return (
        <>
          {note}
          {hasActiveFilter ? (
            <EmptyState icon={<Search size={26} />} t={dict.emFilter} s={dict.emFilterS} />
          ) : (
            <EmptyState icon={<Bell size={26} />} t={dict.instrEmptyRecvT} s={dict.instrEmptyRecvS} />
          )}
        </>
      );
    const od = all.filter((t) => isOverdue(t, today));
    const openT = all
      .filter((t) => t.status === "open" && !isOverdue(t, today))
      .sort((a, b) => dateSort(a, b) || prioSort(a, b));
    const progT = all
      .filter((t) => t.status === "in_progress" && !isOverdue(t, today))
      .sort((a, b) => dateSort(a, b) || prioSort(a, b));
    const doneT = all
      .filter((t) => t.status === "completed")
      .sort((a, b) => (completedDateOf(b) ?? "").localeCompare(completedDateOf(a) ?? ""));
    const rrow = (t: TaskRecord) => {
      const others = partsOf(t).filter((id) => id !== meId);
      const d = dateOf(t);
      const done = t.status === "completed";
      const overdue = isOverdue(t, today);
      const trng = timeRange(t.timeLabel, t.durationMinutes);
      return (
        <div key={t.id} className={`srow srow--recv ${done ? "is-done" : ""}`} onClick={() => openTask(t.id)}>
          <button
            className={`tchk ${t.priority !== "normal" ? `p-${t.priority}` : ""} ${done ? "is-done" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              toggleComplete(t);
            }}
            aria-label={dict.stCompleted}
          >
            <Check size={13} />
          </button>
          <div className="srow__b">
            <div className="srow__t">
              {t.priority !== "normal" && (
                <span className={`tflag p-${t.priority}`}>
                  <Flag size={12} fill="currentColor" />
                </span>
              )}
              {t.title}
            </div>
            <div className="srow__m">
              <span className="chip chip--instr">
                <Megaphone size={13} />
                {fill(dict.instructedBy, { name: nameOf(t.createdByUserId) })}
              </span>
              {d ? (
                <button
                  className={`chip chip--btn ${overdue ? "chip--over" : d === today ? "chip--today" : ""}`}
                  onClick={(e) => openSchedulePop(e, t)}
                >
                  <CalendarDays size={13} />
                  {overdue
                    ? `${fmtShort(d, locale)} · ${dict.stOverdue}`
                    : d === today
                      ? dict.today
                      : `${fmtShort(d, locale)} (${fmtWeekday(d, locale)})`}
                </button>
              ) : (
                <span className="chip">
                  <CalendarX2 size={13} />
                  {dict.noDate}
                </span>
              )}
              {trng && (
                <span className="chip">
                  <Clock size={13} />
                  {trng}
                </span>
              )}
              {others.length > 0 && (
                <span className="tshare">
                  <span className="tshare__avs">
                    <Avatars ids={others} />
                  </span>
                  {fill(dict.instrCommon, { n: others.length + 1 })}
                </span>
              )}
            </div>
          </div>
          <div className="srow__r">
            {done ? (
              <span className="pill pill--done">
                <span className="d" />
                {dict.stCompleted}
              </span>
            ) : (
              <div className="rstat" onClick={(e) => e.stopPropagation()}>
                <button
                  className={t.status === "open" ? "on" : ""}
                  onClick={() => run(() => setConsoleTaskStatus(t.id, "open"))}
                >
                  {dict.stOpen}
                </button>
                <button
                  className={t.status === "in_progress" ? "on" : ""}
                  onClick={() => run(() => setConsoleTaskStatus(t.id, "in_progress"))}
                >
                  {dict.stInProgress}
                </button>
              </div>
            )}
            <button
              className="srow__b2"
              onClick={(e) => {
                e.stopPropagation();
                openTask(t.id);
              }}
              title={dict.instrReply}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      );
    };
    const sec = (title: string, list: TaskRecord[], mod?: string) =>
      list.length > 0
        ? Section({ title, n: list.length, mod, listClass: "slist", children: list.map(rrow) })
        : null;
    return (
      <>
        {note}
        {sec(dict.stOverdue, od, "over")}
        {sec(dict.instrSecTodo, openT)}
        {sec(dict.instrSecInProgress, progT)}
        {sec(dict.instrSecCompleted, doneT)}
      </>
    );
  };

  const instrView = () => (
    <>
      <div className="iseg">
        <button className={instrTab === "recv" ? "on" : ""} onClick={() => setInstrTab("recv")}>
          <Bell size={15} />
          {dict.instrRecv}
          {recvOpen > 0 && <span className="iseg__n alert">{recvOpen}</span>}
        </button>
        <button className={instrTab === "sent" ? "on" : ""} onClick={() => setInstrTab("sent")}>
          <Megaphone size={15} />
          {dict.instrSent}
          {sentOpen > 0 && <span className="iseg__n">{sentOpen}</span>}
        </button>
      </div>
      {instrTab === "sent" ? sentView() : recvView()}
    </>
  );

  // ── COMPLETED ────────────────────────────────────────────────────────────────────────
  const completedView = () => {
    // 완료·기록 = task_updates 완료 로그(net) 기준. 반복 완료는 행이 open 으로 롤포워드되어
    // status=completed 가 아니므로 로그에서만 보인다 → 보고서(같은 소스)와 목록이 일치한다.
    // 검색/우선순위 필터만 적용(날짜는 완료일 그룹 자체가 담당).
    type CmpRow = { task: TaskRecord; day: string; byUserId: string | null };
    const rows: CmpRow[] = [];
    for (const r of data.completions) {
      const task = tasks.find((t) => t.id === r.taskId);
      if (!task) continue;
      if (!(matchQuery(task, q, nameOf) && matchPrio(task, prioFilter))) continue;
      rows.push({ task, day: r.day, byUserId: r.byUserId });
    }
    if (rows.length === 0)
      return <EmptyState icon={<CheckCircle2 size={26} />} t={dict.emCompleted} s={dict.emCompletedS} />;
    const byDay = new Map<string, CmpRow[]>();
    for (const row of rows) {
      if (!byDay.has(row.day)) byDay.set(row.day, []);
      byDay.get(row.day)!.push(row);
    }
    const days = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));
    return (
      <>
        {days.map((day) => {
          const list = byDay.get(day)!;
          const dlabel =
            day === today ? dict.cmpToday : day === addDays(today, -1) ? dict.cmpYesterday : fmtLong(day, locale);
          return (
            <div key={day} className="cmp-day">
              <div className="cmp-h">
                <span className="cmp-h__d">{dlabel}</span>
                <span className="cmp-h__n">{fill(dict.cmpDone, { n: list.length })}</span>
                <span className="cmp-h__line" />
                <button className="cmp-h__report" onClick={() => openReport(day)}>
                  <FileText size={14} />
                  {dict.cmpReport}
                </button>
              </div>
              <div className="tlist">
                {list.map(({ task, byUserId }) =>
                  renderRow(task, {
                    hideDate: true,
                    forceDone: true,
                    extraByLabel:
                      byUserId && byUserId !== meId
                        ? fill(dict.cmpBy, { name: nameOf(byUserId) })
                        : undefined,
                  }),
                )}
              </div>
            </div>
          );
        })}
      </>
    );
  };

  // ── CALENDAR ─────────────────────────────────────────────────────────────────────────
  const calendarView = () => {
    const [y, m] = calMonth.split("-").map(Number);
    const pad = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    const iso = (dd: number) => `${y}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    const monthStart = iso(1);
    const monthEnd = iso(days);
    // Todoist 가상 미리보기: 반복 작업은 단일 행이지만 규칙으로 이달의 모든 회차를 계산해 각 날짜 칸에
    // 표시(추가 행 없음). 비반복은 앵커 하루만. 앵커=dateOf(마감 or 예정) — 모바일 캘린더와 동일 정의.
    const occ = new Map<string, TaskRecord[]>();
    for (const t of personalTasks) {
      if (!(isActive(t) && myOwn(t, meId))) continue;
      const a = dateOf(t);
      if (!a) continue;
      if (isStandardRecurrence(t.recurrenceRule)) {
        if (hideRecurring) continue; // "반복 숨기기" 토글: 고정 반복 회차 제외.
        for (const dstr of recurringOccurrencesInRange(t.recurrenceRule, a, monthStart, monthEnd)) {
          if (!occ.has(dstr)) occ.set(dstr, []);
          occ.get(dstr)!.push(t);
        }
      } else if (a >= monthStart && a <= monthEnd) {
        if (!occ.has(a)) occ.set(a, []);
        occ.get(a)!.push(t);
      }
    }
    const tasksOn = (dstr: string) =>
      (occ.get(dstr) ?? [])
        .slice()
        .sort((a, b) => (a.timeLabel ?? "99").localeCompare(b.timeLabel ?? "99") || prioSort(a, b));
    const monthCount = Array.from(occ.values()).reduce((n, arr) => n + arr.length, 0);
    const wdHead = ["0", "1", "2", "3", "4", "5", "6"].map((_, i) =>
      new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "ko-KR", {
        weekday: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2024, 0, 7 + i))),
    );
    const cells: ReactNode[] = [];
    for (let i = pad; i > 0; i--)
      cells.push(
        <div key={`p${i}`} className="ccell ccell--pad">
          <span className="ccell__d">{prevDays - i + 1}</span>
        </div>,
      );
    for (let dd = 1; dd <= days; dd++) {
      const dstr = iso(dd);
      const wd = weekdayIndex(dstr);
      const ev = tasksOn(dstr);
      cells.push(
        <div
          key={dstr}
          className={`ccell ${dstr === today ? "ccell--today" : ""} ${wd === 0 ? "ccell--sun" : wd === 6 ? "ccell--sat" : ""}`}
          onClick={() => setDaySheet(dstr)}
        >
          <div className="ccell__h">
            <span className="ccell__d">{dd}</span>
            {ev.length > 0 && <span className="ccell__n">{ev.length}</span>}
          </div>
          <div className="ccell__ev">
            {ev.slice(0, 3).map((t) => {
              const cls = ["cev"];
              if (isOverdue(t, today)) cls.push("cev--over");
              else if (t.priority === "urgent") cls.push("cev--urgent");
              else if (t.priority === "important") cls.push("cev--imp");
              else if (t.priority === "medium") cls.push("cev--med");
              if (isSharedTask(t)) cls.push("cev--shared");
              return (
                <div
                  key={t.id}
                  className={cls.join(" ")}
                  title={t.title}
                  onClick={(e) => {
                    e.stopPropagation();
                    openTask(t.id);
                  }}
                >
                  <span className="cev__d" />
                  {t.timeLabel && <span className="cev__t">{t.timeLabel}</span>}
                  <span className="cev__x">{t.title}</span>
                </div>
              );
            })}
            {ev.length > 3 && (
              <button
                className="ccell__more"
                onClick={(e) => {
                  e.stopPropagation();
                  setDaySheet(dstr);
                }}
              >
                {fill(dict.calMore, { n: ev.length - 3 })}
              </button>
            )}
          </div>
        </div>,
      );
    }
    const tail = (7 - ((pad + days) % 7)) % 7;
    for (let i = 1; i <= tail; i++)
      cells.push(
        <div key={`t${i}`} className="ccell ccell--pad">
          <span className="ccell__d">{i}</span>
        </div>,
      );
    // "다가오는 일정" = 이달 미래(오늘 제외) — 반복 회차 포함. 그리드와 같은 occ 맵에서 파생해 통일.
    // (오늘 작업은 그리드 오늘 칸/오늘 탭에.)
    const agByDay = new Map<string, TaskRecord[]>();
    let upcomingCount = 0;
    for (const [d, arr] of Array.from(occ.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      if (d <= today) continue;
      const sorted = arr
        .slice()
        .sort((a, b) => (a.timeLabel ?? "99").localeCompare(b.timeLabel ?? "99") || prioSort(a, b));
      agByDay.set(d, sorted);
      upcomingCount += sorted.length;
    }
    const shiftMonth = (delta: number) => {
      const nm = new Date(Date.UTC(y, m - 1 + delta, 1));
      setCalMonth(`${nm.getUTCFullYear()}-${String(nm.getUTCMonth() + 1).padStart(2, "0")}`);
    };
    return (
      <div className="cv">
        <div className="cal-card">
          <div className="cal-top">
            <div className="cal-top__nav">
              <button onClick={() => shiftMonth(-1)} aria-label="prev">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => shiftMonth(1)} aria-label="next">
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="cal-top__t">
              <b>{fmtMonthTitle(y, m, locale)}</b>
              <span>{fill(dict.taskWord, { n: monthCount })}</span>
            </div>
            <button className="cal-top__today" onClick={() => setCalMonth(today.slice(0, 7))}>
              {dict.calThisMonth}
            </button>
            <button
              type="button"
              className={`cal-top__rep ${hideRecurring ? "on" : ""}`}
              onClick={() => setHideRecurring((v) => !v)}
              aria-pressed={hideRecurring}
              title={dict.calHideRepeat}
            >
              <Repeat size={14} />
              {dict.calHideRepeat}
            </button>
            <div className="cal-top__lg">
              <span className="lgi">
                <span className="d" style={{ background: "var(--faint)" }} />
                {dict.calLegendPersonal}
              </span>
              <span className="lgi">
                <span className="d" style={{ background: "var(--primary)" }} />
                {dict.calLegendShared}
              </span>
              <span className="lgi">
                <span className="d" style={{ background: "var(--danger)" }} />
                {dict.calLegendUrgent}
              </span>
            </div>
          </div>
          <div className="cgrid">
            {wdHead.map((w, i) => (
              <div key={i} className={`cgrid__wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>
                {w}
              </div>
            ))}
            {cells}
          </div>
        </div>
        <div className="cv__agenda">
          {add?.ctx === "day" && <div className="tlist">{InlineAdd()}</div>}
          <div className="sech">
            <span className="sech__t">{dict.calUpcoming}</span>
            <span className="sech__n">{upcomingCount}</span>
            <span className="sech__line" />
          </div>
          {agByDay.size === 0 ? (
            <div className="tempty__s" style={{ padding: "16px 2px", textAlign: "left" }}>
              {dict.calNoMonth}
            </div>
          ) : (
            Array.from(agByDay.keys())
              .sort()
              .map((dd) => (
                <div key={dd} className="ag-day">
                  <div className={`ag-h ${dd === today ? "today" : ""}`}>
                    <b>{dd === today ? dict.today : fmtLong(dd, locale)}</b>
                    <span>{fill(dict.taskWord, { n: agByDay.get(dd)!.length })}</span>
                  </div>
                  <div className="tlist">{agByDay.get(dd)!.map((t) => renderRow(t, { hideDate: true }))}</div>
                </div>
              ))
          )}
        </div>
      </div>
    );
  };

  // ── PROJECT ───────────────────────────────────────────────────────────────────────────
  const projectView = () => {
    const summary = projectId ? projById.get(projectId) : null;
    if (!summary) return null;
    // summary.members 는 owner(=createdByUserId) 행을 이미 포함한다. 별도로 createdByUserId 를
    // 앞에 덧붙이면 소유자가 중복 표시·중복 카운트되므로(멤버 4명 버그) Set 으로 합쳐 dedup.
    const memberIds = Array.from(
      new Set([summary.createdByUserId, ...summary.members.map((mem) => mem.userId)]),
    );
    const canDeleteProject = summary.viewerRole === "owner" || summary.createdByUserId === meId;
    const askDeleteProject = () =>
      setConfirm({
        message: fill(dict.pjDeleteMsg, { title: summary.title }),
        confirmLabel: dict.confirmDeleteBtn,
        onConfirm: () =>
          run(() => deleteConsoleProject(summary.id), {
            toast: dict.pjDeleted,
            after: () => goView("today"), // 삭제된 프로젝트 뷰에서 빠져나옴
          }),
      });
    const pd = projectDetail && projectDetail.id === projectId ? projectDetail : null;
    const sections =
      pd?.sections && pd.sections.length > 0
        ? pd.sections
        : [{ id: "__default", title: dict.dpTask, sortOrder: 0 }];
    const projTasks = filtered(tasks.filter((t) => t.projectId === projectId && isActive(t)));
    const banner = (
      <div className="pjbanner">
        <div className="pjbanner__b">
          <div className="pjbanner__t">{fill(dict.pjBanner, { n: memberIds.length })}</div>
          <div className="pjbanner__avs">
            <div className="row">
              <Avatars ids={memberIds} />
            </div>
            <span className="names">{memberIds.map((id) => nameOf(id)).join(", ")}</span>
          </div>
        </div>
        {canDeleteProject && (
          <>
            <button
              className="pjbanner__act"
              onClick={(e) => openProjectMembersPop(e, summary.id, memberIds)}
              title={dict.pjMembersManage}
            >
              <UserPlus size={14} />
              {dict.pjMembersManage}
            </button>
            <button className="pjbanner__del" onClick={askDeleteProject} title={dict.pjDelete}>
              <Trash2 size={14} />
              {dict.pjDelete}
            </button>
          </>
        )}
      </div>
    );
    if (projTasks.length === 0 && !hasActiveFilter && !(add && add.ctx === "project")) {
      return (
        <>
          {banner}
          <EmptyState icon={<Hash size={26} />} t={dict.pjEmptyT} s={dict.pjEmptyS} ctx="project" />
        </>
      );
    }
    return (
      <>
        {banner}
        {sections.map((sec) => {
          const list = projTasks
            .filter((t) => (t.sectionId ?? "__default") === sec.id)
            .sort(prioSort);
          return (
            <div key={sec.id} className="pjsec">
              <div className="pjsec-h">
                <span className="chev">
                  <ChevronDown size={14} />
                </span>
                {sectionEdit?.id === sec.id ? (
                  <input
                    className="pjsec-h__input"
                    value={sectionEdit.title}
                    autoFocus
                    onChange={(e) => setSectionEdit({ ...sectionEdit, title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveSectionRename(summary.id, sectionEdit);
                      else if (e.key === "Escape") setSectionEdit(null);
                    }}
                    onBlur={() => saveSectionRename(summary.id, sectionEdit)}
                  />
                ) : (
                  <b>{sec.title}</b>
                )}
                <span className="n">{list.length}</span>
                {/* `__default` 는 섹션이 없는 프로젝트의 가상 그룹이라 실제 행이 없다 — 이름 변경·
                    삭제 대상이 될 수 없다. */}
                {canDeleteProject && sec.id !== "__default" && !sectionEdit && (
                  <span className="pjsec-h__acts">
                    <button
                      className="pjsec-h__b"
                      title={dict.pjSectionRename}
                      onClick={() => setSectionEdit({ id: sec.id, title: sec.title })}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      className="pjsec-h__b pjsec-h__b--danger"
                      title={dict.pjSectionDelete}
                      onClick={() =>
                        setConfirm({
                          message: fill(dict.pjSectionDeleteMsg, { title: sec.title }),
                          confirmLabel: dict.confirmDeleteBtn,
                          onConfirm: () =>
                            run(() => deleteConsoleProjectSection(summary.id, sec.id), {
                              toast: dict.tDeleted,
                            }),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                )}
              </div>
              <div className="tlist">{list.map((t) => renderRow(t))}</div>
              {InlineAddSlot({ ctx: "project", sectionId: sec.id, label: fill(dict.pjAddTaskTo, { name: sec.title }) })}
            </div>
          );
        })}
        {canDeleteProject && (
          <div className="pjsec-add">
            <input
              className="pjsec-add__input"
              placeholder={dict.pjSectionNamePh}
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSection(summary.id);
              }}
            />
            <button
              className="btn btn--ghost btn--sm"
              disabled={!newSection.trim() || pending}
              onClick={() => addSection(summary.id)}
            >
              <Plus size={14} />
              {dict.pjSectionAdd}
            </button>
          </div>
        )}
      </>
    );
  };

  // ── body routing ───────────────────────────────────────────────────────────────────────
  const showRail = !projectId ? view !== "completed" && view !== "calendar" : true;
  const body = projectId
    ? projectView()
    : view === "today"
      ? todayView()
      : view === "tomorrow"
        ? tomorrowView()
        : view === "inbox"
          ? inboxView()
          : view === "shared"
            ? sharedView()
            : view === "instr"
              ? instrView()
              : view === "completed"
                ? completedView()
                : calendarView();

  // ── SELECTION BAR ────────────────────────────────────────────────────────────────────────
  // Built on the same banner skeleton as `.odbanner` (icon tile → text block → right-aligned
  // actions), tinted primary instead of danger, so selection mode reads as part of this console
  // rather than a bar borrowed from another screen.
  const selectionBar = () => {
    if (!selMode || !filterableView) return null;
    const n = picked.size;
    return (
      <div className="selbar">
        <div className={`selbar__ic ${n > 0 ? "on" : ""}`} aria-hidden="true">
          {n > 0 ? <span className="selbar__n">{n}</span> : <CheckCheck size={19} />}
        </div>
        <div className="selbar__b">
          <div className="selbar__t">{n > 0 ? fill(dict.selSelected, { n }) : dict.selEmptyHint}</div>
          <div className="selbar__s">{dict.selHint}</div>
        </div>
        <div className="selbar__acts">
          <button type="button" className="sel-b" onClick={selectAllVisible}>
            {dict.selAll}
          </button>
          <button type="button" className="sel-b" onClick={clearSel} disabled={n === 0}>
            {dict.selClear}
          </button>
          <button
            type="button"
            className="sel-b sel-b--danger"
            onClick={askBulkDelete}
            disabled={n === 0 || pending}
          >
            <Trash2 size={15} />
            {dict.selDelete}
          </button>
          <button type="button" className="selbar__x" onClick={exitSelMode} aria-label={dict.iaCancel}>
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  // ── RAIL ─────────────────────────────────────────────────────────────────────────────────
  const rail = () => {
    /**
     * 레일의 집계 단위는 **오늘 탭에 실제로 보이는 행 수**다 — 탭 배지(`todayCount`)와 같은 기준.
     *
     * 예전엔 `isTodayTask || isOverdue` 만 셌는데, `isTodayTask` 는 반복 작업을 **명시적으로
     * 제외한다**(helpers.ts — 반복은 회차 헬퍼가 따로 처리). 그래서 오늘 목록이 9건인데 대기가
     * 2로 뜨는 식으로 반복 회차가 통째로 빠졌다(2026-07-31).
     *
     * 한 작업이 오늘 회차와 지연 회차를 동시에 가지면 두 번 세는데, 목록도 그 작업을 두 줄로
     * 보여주므로(지연 섹션 + 오늘) 화면과 숫자가 일치한다.
     */
    const scope = [
      ...personalTasks.filter((t) => (isTodayTask(t, today) || isOverdue(t, today)) && myOwn(t, meId)),
      ...personalTasks.filter((t) => myOwn(t, meId) && openOccursOn(t, today)),
      ...personalTasks.filter(
        (t) => myOwn(t, meId) && overdueOccurrenceDates(t, today, resolvedDatesFor(t.id)).length > 0,
      ),
    ];
    // 반복 회차에는 회차별 상태가 없으므로 행 status 로 가른다(목록의 상태 칩과 같은 기준).
    const open = scope.filter((t) => t.status !== "in_progress").length;
    const prog = scope.filter((t) => t.status === "in_progress").length;
    // 오늘 완료 = 완료 로그(task_updates net) 기준. 반복 완료는 행이 open 으로 롤포워드되어
    // status=completed 가 아니므로 로그를 봐야 실제 오늘 완료 건수가 나온다(내 개인 작업 한정).
    const myPersonalIds = new Set(personalTasks.filter((t) => myOwn(t, meId)).map((t) => t.id));
    const doneToday = data.completions.filter(
      (r) => r.day === today && r.byUserId === meId && myPersonalIds.has(r.taskId),
    ).length;
    const pct = scope.length + doneToday ? Math.round((doneToday / (scope.length + doneToday)) * 100) : 0;
    const qrow = (t: TaskRecord, right: ReactNode) => {
      const cx = ctxItems(t);
      return (
        <div key={t.id} className="qrow" onClick={() => openTask(t.id)}>
          <span
            className={`qrow__ic ${t.priority === "urgent" ? "bg-danger" : t.priority === "important" ? "bg-warn" : t.priority === "medium" ? "bg-info" : "bg-surf"}`}
          >
            {t.priority === "normal" ? <Check size={13} /> : <Flag size={13} fill="currentColor" />}
          </span>
          <div className="qrow__b">
            <div className="qrow__t">{t.title}</div>
            <div className="qrow__s">
              {nameOf(t.createdByUserId)}
              {t.isDirective && !isMine(t, meId) ? ` ${dict.vInstr}` : ""}
              {cx.length > 0 && (
                <>
                  <span className="sep" />
                  {cx[0].v}
                </>
              )}
            </div>
          </div>
          <div className="qrow__meta">{right}</div>
        </div>
      );
    };
    const inbound = personalTasks
      .filter((t) => recvInstr(t, meId) && isActive(t))
      .sort((a, b) => prioSort(a, b) || dateSort(a, b))
      .slice(0, 4);
    const up = personalTasks
      .filter((t) => {
        const d = dateOf(t);
        return isActive(t) && myOwn(t, meId) && !!d && d > today;
      })
      .sort(dateSort)
      .slice(0, 4);
    const byMember = new Map<string, number>();
    for (const t of personalTasks.filter((t) => isActive(t) && isSharedTask(t)))
      for (const id of [t.createdByUserId, ...partsOf(t)]) if (id !== meId) byMember.set(id, (byMember.get(id) ?? 0) + 1);
    const mem = Array.from(byMember.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sent = personalTasks
      .filter((t) => sentInstr(t, meId) && isActive(t))
      .sort((a, b) => dateSort(a, b) || prioSort(a, b))
      .slice(0, 4);
    const statusPill = (t: TaskRecord, unconfirmedLabel: string) => {
      const overdue = isOverdue(t, today);
      const cls = overdue ? "danger" : t.status === "in_progress" ? "open" : "muted";
      return (
        <span className={`pill pill--${cls}`}>
          <span className="d" />
          {overdue ? dict.stOverdue : t.status === "in_progress" ? dict.stInProgress : unconfirmedLabel}
        </span>
      );
    };
    return (
      <aside className="wrail">
        <div className="card">
          <div className="card__h">
            <div className="card__ti">
              <span className="card__ic bg-done">
                <CheckCircle2 size={14} />
              </span>
              <span className="card__t">{dict.railTodayTitle}</span>
            </div>
          </div>
          <div className="card__body">
            <div className="minirow">
              <div className="ministat">
                <div className="ministat__v">{open}</div>
                <div className="ministat__k">{dict.stOpen}</div>
              </div>
              <div className="minisep" />
              <div className="ministat">
                <div className="ministat__v">{prog}</div>
                <div className="ministat__k">{dict.stInProgress}</div>
              </div>
              <div className="minisep" />
              <div className="ministat">
                <div className="ministat__v">{doneToday}</div>
                <div className="ministat__k">{dict.railDoneToday}</div>
              </div>
            </div>
            <div className="railbar">
              <div className="railbar__k">
                {dict.railTodayProgress}
                <b>{pct}%</b>
              </div>
              <div className={`pbar ${pct >= 70 ? "done" : ""}`}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__h">
            <div className="card__ti">
              <span className="card__ic bg-pri">
                <Bell size={14} />
              </span>
              <span className="card__t">{dict.instrRecv}</span>
            </div>
            <div className="card__act">
              <button className="linkmore" onClick={() => { goView("instr"); setInstrTab("recv"); }}>
                {dict.vInstr}
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          {inbound.length > 0 ? (
            inbound.map((t) => qrow(t, statusPill(t, dict.instrUnconfirmed)))
          ) : (
            <div className="card__body">
              <div className="railempty">{dict.instrEmptyRecvT}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card__h">
            <div className="card__ti">
              <span className="card__ic bg-warn">
                <Megaphone size={14} />
              </span>
              <span className="card__t">{dict.instrSent}</span>
            </div>
            <div className="card__act">
              <button className="linkmore" onClick={() => { goView("instr"); setInstrTab("sent"); }}>
                {dict.vInstr}
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          {sent.length > 0 ? (
            sent.map((t) => qrow(t, statusPill(t, dict.instrUnconfirmed)))
          ) : (
            <div className="card__body">
              <div className="railempty">{dict.instrEmptySentT}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card__h">
            <div className="card__ti">
              <span className="card__ic bg-info">
                <CalendarDays size={14} />
              </span>
              <span className="card__t">{dict.calUpcoming}</span>
            </div>
            <div className="card__act">
              <button className="linkmore" onClick={() => goView("calendar")}>
                {dict.vCalendar}
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          {up.length > 0 ? (
            up.map((t) =>
              qrow(
                t,
                <span className="qrow__time">
                  {fmtShort(dateOf(t)!, locale)} ({fmtWeekday(dateOf(t)!, locale)})
                </span>,
              ),
            )
          ) : (
            <div className="card__body">
              <div className="railempty">{dict.railUpcomingEmpty}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card__h">
            <div className="card__ti">
              <span className="card__ic bg-violet">
                <Share2 size={14} />
              </span>
              <span className="card__t">{dict.vShared}</span>
            </div>
          </div>
          <div className="card__body">
            {mem.length > 0 ? (
              mem.map(([id, n]) => (
                <div key={id} className="memrow">
                  <Avatar id={id} />
                  <div className="memrow__b">
                    <div className="memrow__n">{nameOf(id)}</div>
                    <div className="memrow__r">{roleOf(id)}</div>
                  </div>
                  <span className="memrow__n2">{n}</span>
                </div>
              ))
            ) : (
              <div className="railempty">{dict.emShared}</div>
            )}
          </div>
        </div>
      </aside>
    );
  };

  // ── report ────────────────────────────────────────────────────────────────────────────────
  const openReport = (date: string) => {
    setReport({ date, text: "", loading: true, error: null });
    setReportEdited("");
    generateConsoleReport(date).then((res) => {
      if (res.ok) {
        setReport({ date, text: res.text, loading: false, error: null });
        setReportEdited(res.text);
      } else {
        setReport({ date, text: "", loading: false, error: res.reason });
      }
    });
  };
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportEdited);
      showToast(dict.rptCopied);
    } catch {
      showToast(dict.errGeneric);
    }
  };

  // ── note send ────────────────────────────────────────────────────────────────────────────
  const sendNote = () => {
    // 사진만 있고 본문이 비어도 보낼 수 있다(서버도 같은 규칙).
    if (!panelTask || (!noteDraft.trim() && notePhotos.length === 0)) return;
    const id = panelTask;
    const body = noteDraft;
    const photos = notePhotos;
    run(
      async () => {
        // 노트 사진은 `task-update-images/` 경로 — 작업 레벨 사진과 폴더를 나눠 서로의 정리
        // 로직에 걸리지 않게 한다(모바일과 동일).
        const imageUrls = photos.length
          ? await uploadPendingTaskUpdatePhotos({ pending: photos, organizationId, taskId: id })
          : [];
        return addConsoleNote(id, body, imageUrls);
      },
      {
        toast: dict.tNoteAdded,
        after: () => {
          setNoteDraft("");
          setNotePhotos([]);
          getConsoleTaskDetail(id).then((res) => {
            if (res.ok) setDetail(res.task);
          });
        },
      },
    );
  };

  // ── loadError ────────────────────────────────────────────────────────────────────────────
  if (data.loadError) {
    return (
      <div className="admtasks">
        <div className="tempty">
          <div className="tempty__ic">
            <CloudOff size={26} />
          </div>
          <p className="tempty__t">{dict.errT}</p>
          <p className="tempty__s">{dict.errS}</p>
          <button className="btn btn--ghost tempty__cta" onClick={() => router.refresh()}>
            <RotateCcw size={15} />
            {dict.retry}
          </button>
        </div>
      </div>
    );
  }

  const filterableView = view !== "calendar" || !!projectId;

  return (
    <div className="admtasks" onClick={() => setPop(null)}>
      {/* SUBNAV */}
      <div className="tsubnav">
        <div className="tsubnav__tabs">
          {(
            [
              ["today", dict.vToday, <Sun key="i" size={15} />, todayCount, overdueList.length > 0 || recOverdueCount > 0],
              ["tomorrow", dict.vTomorrow, <Sunrise key="i" size={15} />, tomorrowCount, false],
              ["inbox", dict.vInbox, <Inbox key="i" size={15} />, inboxCount, false],
              ["instr", dict.vInstr, <Megaphone key="i" size={15} />, recvOpen + sentOpen, recvOpen > 0],
              ["shared", dict.vShared, <Share2 key="i" size={15} />, sharedCount, false],
              ["calendar", dict.vCalendar, <CalendarDays key="i" size={15} />, 0, false],
              ["completed", dict.vCompleted, <CheckCircle2 key="i" size={15} />, 0, false],
            ] as [View, string, ReactNode, number, boolean][]
          ).map(([v, label, icon, count, alert]) => (
            <button
              key={v}
              className={`tab ${!projectId && view === v ? "on" : ""}`}
              onClick={() => goView(v)}
            >
              {icon}
              {label}
              {count > 0 && <span className={`tab__n ${alert ? "alert" : ""}`}>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* PROJECT CHIPS */}
      <div className="tsubnav tsubnav--proj">
        <span className="tsubnav__lbl">{dict.sharedProjects}</span>
        {data.projects.map((p) => (
          <button
            key={p.id}
            className={`pjchip ${projectId === p.id ? "on" : ""}`}
            onClick={() => {
              setProjectId(p.id);
              setAdd(null);
              setSelMode(false);
              setPicked(new Set());
            }}
          >
            <Hash size={13} />
            <span>{p.title}</span>
            <span className="pjchip__avs">
              <Avatars ids={p.members.map((mem) => mem.userId).slice(0, 3)} />
            </span>
            <span className="pjchip__n">{p.totalTasks - p.completedTasks}</span>
          </button>
        ))}
        <button className="pjchip pjchip--new" onClick={() => setNewProj({ name: "", members: [], q: "" })}>
          <Plus size={13} />
          {dict.newProject}
        </button>
      </div>

      {/* FILTER BAR */}
      {filterableView && (
        <div className="filt">
          <div className="filt__search">
            <span className="ic">
              <Search size={16} />
            </span>
            <input placeholder={dict.filterSearch} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button
            className={`fbtn ${dateFilter ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setPop({ kind: "datefilter", ...anchorFrom(e) });
            }}
          >
            <CalendarDays size={14} />
            {dateFilter
              ? dateFilter === "today"
                ? dict.today
                : dateFilter === "week"
                  ? dict.filterDate
                  : dateFilter === "overdue"
                    ? dict.stOverdue
                    : dict.noDate
              : dict.filterDate}
            {dateFilter && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setDateFilter(null);
                }}
              >
                <X size={12} />
              </span>
            )}
          </button>
          <button
            className={`fbtn ${prioFilter ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setPop({ kind: "priofilter", ...anchorFrom(e) });
            }}
          >
            <Flag size={14} />
            {prioFilter ? prioLabel(prioFilter, dict) : dict.filterPrio}
          </button>
          {/* Sits inline with the filters, not pushed right: `.filt` spans the full width including
              the rail column, so a `flex:1` spacer would fling this chip past the task list. */}
          <button
            type="button"
            className={`fbtn ${selMode ? "on" : ""}`}
            aria-pressed={selMode}
            onClick={() => (selMode ? exitSelMode() : setSelMode(true))}
          >
            <CheckCheck size={14} />
            {dict.selMode}
          </button>
        </div>
      )}

      {/* BODY — the selection bar lives INSIDE `.wcol` so it lines up with the task list card
          instead of stretching across the rail like the filter bar does. */}
      {showRail ? (
        <div className="tgrid">
          <div className="wcol">
            {selectionBar()}
            {body}
          </div>
          {rail()}
        </div>
      ) : (
        <div className="wcol">
          {selectionBar()}
          {body}
        </div>
      )}

      {/* DETAIL PANEL */}
      {panelTask && DetailPanel()}

      {/* POPOVERS / SHEETS / MODALS */}
      {pop && PopoverLayer()}
      {daySheet && DaySheet()}
      {report && ReportModal()}
      {newProj && NewProjectModal()}
      {confirm && ConfirmModal()}
      {recurDel && RecurDeleteModal()}

      {toast && <AdminToast message={toast.message} onDismiss={dismiss} />}
      {undo && (
        <div className="undobar" role="status" onClick={(e) => e.stopPropagation()}>
          <div className="undobar__txt">
            <span className="undobar__msg">{undo.message}</span>
            {undo.sub && <span className="undobar__sub">{undo.sub}</span>}
          </div>
          <button
            className="undobar__act"
            onClick={() => {
              undo.onUndo();
            }}
          >
            {dict.undoBtn}
          </button>
          <button className="undobar__x" onClick={() => setUndo(null)} aria-label={dict.iaCancel}>
            <X size={15} />
          </button>
        </div>
      )}
      {/* 사진 확대 — 근태(교통비 영수증)와 같은 공용 뷰어를 쓴다. 콘솔용 별도 라이트박스는 만들지 않는다. */}
      <ImageLightbox
        closeLabel={dict.rptClose}
        onClose={() => setLightbox(null)}
        openIndex={lightbox ? lightbox.index : null}
        urls={lightbox?.urls ?? []}
      />
      {pending && <span className="sr-only" aria-live="polite" />}
    </div>
  );

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // DETAIL PANEL (E)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  function DetailPanel() {
    const loaded = detail && detail.id === panelTask ? detail : null;
    const t = loaded ?? tasks.find((x) => x.id === panelTask) ?? null;
    if (!t) return null;
    const done = t.status === "completed";
    // 코어 편집 드래프트가 이 작업의 것일 때만 편집 모드로 렌더한다.
    const editing = coreEdit && coreEdit.id === t.id ? coreEdit : null;
    // What the segmented control shows: the pending click while the data still reads as it did when
    // the click happened, else server truth.
    const shownStatus =
      statusDraft && statusDraft.id === t.id && t.status === statusDraft.from
        ? statusDraft.status
        : t.status;
    const mine = isMine(t, meId);
    const instr = t.isDirective && !mine ? t.authorName : null;
    const proj = t.projectId ? projById.get(t.projectId) : null;
    const d = dueDateOf(t) ?? t.scheduledDate ?? null;
    const trng = timeRange(t.timeLabel, t.durationMinutes);
    const cx = ctxItems(t);
    const shared = isSharedTask(t);
    const participantIds = [t.createdByUserId, ...partsOf(t)].filter((v, i, a) => a.indexOf(v) === i);
    const firstRecipient = t.participants.find((p) => p.isFirstRecipient)?.userId ?? null;

    return (
      <>
        <div className={`dp-scrim ${panelOn ? "on" : ""}`} onClick={closePanel} />
        <aside className={`dp ${panelOn ? "on" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="dp__top">
          <span className="dp__crumb">
            {proj ? (
              <>
                <Hash size={14} />
                <b>{proj.title}</b>
              </>
            ) : (
              <>
                {t.isInbox ? <Inbox size={14} /> : <Sun size={14} />}
                <b>{t.isInbox ? dict.dpInbox : dict.dpTask}</b>
              </>
            )}
          </span>
          <span className="sp" />
          <Link className="dp__tb" href={`/mobile/tasks/${t.id}`} title={dict.dpMobileDetail}>
            <Smartphone size={16} />
          </Link>
          <button className="dp__tb" onClick={(e) => openRowMenu(e, t.id)} title={dict.mPriority}>
            <MoreHorizontal size={16} />
          </button>
          <button className="dp__tb" onClick={closePanel} title={dict.iaCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="dp__body">
          <div className="dp__lead">
            <button
              className={`tchk ${t.priority !== "normal" ? `p-${t.priority}` : ""} ${done ? "is-done" : ""}`}
              onClick={() => toggleComplete(t)}
            >
              <Check size={13} />
            </button>
            <div className="dp__headwrap">
              {(t.priority !== "normal" || instr) && (
                <div className="dp__flags">
                  {t.priority === "important" && (
                    <span className="dbadge dbadge--amber">
                      <Flag size={12} fill="currentColor" />
                      {dict.prioImportant}
                    </span>
                  )}
                  {t.priority === "urgent" && (
                    <span className="dbadge dbadge--rose">
                      <Flag size={12} fill="currentColor" />
                      {dict.prioUrgent}
                    </span>
                  )}
                  {t.priority === "medium" && (
                    <span className="dbadge dbadge--blue">
                      <Flag size={12} fill="currentColor" />
                      {dict.prioMedium}
                    </span>
                  )}
                  {instr && (
                    <span className="dbadge dbadge--instr">
                      <Megaphone size={12} />
                      {fill(dict.instructedBy, { name: instr })}
                    </span>
                  )}
                </div>
              )}
              {editing ? (
                <div className="dpedit">
                  <input
                    className="dpedit__title"
                    value={editing.title}
                    placeholder={dict.iaTitle}
                    autoFocus
                    onChange={(e) => setCoreEdit({ ...editing, title: e.target.value })}
                  />
                  <textarea
                    className="dpedit__desc"
                    value={editing.desc}
                    placeholder={dict.iaDesc}
                    rows={3}
                    onChange={(e) => setCoreEdit({ ...editing, desc: e.target.value })}
                  />
                  <div className="dpedit__tags">
                    {editing.tags.map((g) => (
                      <span key={g} className="chip chip--tag">
                        {g}
                        <button
                          type="button"
                          className="chip__x"
                          aria-label={`${g} ${dict.iaCancel}`}
                          onClick={() =>
                            setCoreEdit({ ...editing, tags: editing.tags.filter((x) => x !== g) })
                          }
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                    {editing.tags.length < 10 && (
                      <input
                        className="dpedit__taginput"
                        value={editing.tagInput}
                        placeholder={dict.dpTagAdd}
                        onChange={(e) => setCoreEdit({ ...editing, tagInput: e.target.value })}
                        onKeyDown={(e) => {
                          // Enter/comma commit; Backspace on an empty input pops the last chip.
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addCoreTag();
                          } else if (e.key === "Backspace" && !editing.tagInput && editing.tags.length) {
                            setCoreEdit({ ...editing, tags: editing.tags.slice(0, -1) });
                          }
                        }}
                        onBlur={addCoreTag}
                      />
                    )}
                  </div>
                  <TaskPhotoUploader
                    value={editPhotos.value}
                    pending={editPhotos.pending}
                    maxImages={t.projectId ? 20 : 5}
                    copy={photoCopy}
                    onChange={setEditPhotos}
                  />
                  <div className="dpedit__acts">
                    <button className="btn btn--ghost btn--sm" onClick={cancelCoreEdit}>
                      {dict.iaCancel}
                    </button>
                    <button
                      className="btn btn--pri btn--sm"
                      disabled={!editing.title.trim() || pending}
                      onClick={() => saveCoreEdit(t, editing)}
                    >
                      {dict.dpSave}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className={`dp__title ${done ? "is-done" : ""}`}>{t.title}</h1>
                  {t.description && <p className="dp__desc">{t.description}</p>}
                  {t.tags.length > 0 && (
                    <div className="dp__tags">
                      {t.tags.map((g) => (
                        <span key={g} className="chip chip--tag">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Segmented control. `shownStatus` is the optimistic value so the thumb slides the instant
              the button is pressed; the CSS thumb is driven by data-active, not per-button bg. */}
          <div className="dp__status" data-active={shownStatus} role="group">
            <span className="dp__status__thumb" aria-hidden="true" />
            {STATUS_SEGMENTS.map((seg) => (
              <button
                key={seg.status}
                type="button"
                className={`${seg.status === "completed" ? "done " : ""}${
                  shownStatus === seg.status ? "on" : ""
                }`}
                aria-pressed={shownStatus === seg.status}
                onClick={() => {
                  if (shownStatus === seg.status) return;
                  setStatusDraft({ id: t.id, from: t.status, status: seg.status });
                  run(() => setConsoleTaskStatus(t.id, seg.status), {
                    toast: seg.status === "completed" ? dict.tCompleted : undefined,
                    onError: () => setStatusDraft(null),
                  });
                }}
              >
                {dict[seg.labelKey]}
              </button>
            ))}
          </div>

          <div className="dsec">
            <div className="dsec__t">{dict.dpSchedule}</div>
            <div className="meta">
              {d && (
                <MetaRow icon={<CalendarDays size={14} />} k={dueDateOf(t) ? dict.dpDue : dict.dpSched}>
                  {fmtLong(d, locale)}
                  {isOverdue(t, today) && <span className="over"> · {dict.stOverdue}</span>}
                </MetaRow>
              )}
              {trng && (
                <MetaRow icon={<Clock size={14} />} k={dict.dpTime}>
                  {trng}
                  {t.durationMinutes && durText(t.durationMinutes) && (
                    <span className="sub"> · {durText(t.durationMinutes)}</span>
                  )}
                </MetaRow>
              )}
              {t.recurrenceRule && (
                <MetaRow icon={<Repeat size={14} />} k={dict.dpRepeat}>
                  {repeatLabel(t.recurrenceRule, d, today, locale, dict)}
                </MetaRow>
              )}
              {!d && !trng && !t.recurrenceRule && (
                <MetaRow icon={<CalendarX2 size={14} />} k={dict.dpSchedule}>
                  <span className="sub">{dict.dpNoDate}</span>
                </MetaRow>
              )}
              {/* 일정 변경은 **작성자 전용**이다(`rescheduleConsoleTask` 가 서버에서도 거절한다).
                  참여자는 상단 ⋯ 메뉴의 오늘/내일로 이동만 쓸 수 있다 — 모바일과 같은 경계. */}
              {mine && (
                <button
                  className="dp__sharebtn"
                  style={{ marginTop: 10 }}
                  onClick={(e) => openSchedulePop(e, t)}
                >
                  <CalendarDays size={14} />
                  {dict.dpScheduleChange}
                </button>
              )}
            </div>
          </div>

          {cx.length > 0 && (
            <div className="dsec">
              <div className="dsec__t">{dict.dpLinked}</div>
              <div className="ctx">
                {cx.map((c, i) => (
                  <div key={i} className="ctxrow">
                    <div className="ctxrow__ic">{CTX_IC[c.k]}</div>
                    <div className="ctxrow__b">
                      <div className="ctxrow__k">{ctxKey[c.k]}</div>
                      <div className="ctxrow__v">{c.v}</div>
                    </div>
                    {c.k === "ticket" && (
                      <Link className="ctxrow__go" href="/admin/calendar">
                        {dict.dpViewResv}
                        <ArrowUpRight size={13} />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {shared ? (
            <div className="dsec">
              <div className="dsec__t">{fill(dict.dpParticipants, { n: participantIds.length })}</div>
              <div className="plist">
                {participantIds.map((id) => (
                  <div key={id} className="prow">
                    <Avatar id={id} />
                    <div className="prow__b">
                      <div className="prow__n">
                        {nameOf(id)}
                        {id === t.createdByUserId && (
                          <span className="ptag ptag--author">
                            <Crown size={11} />
                            {dict.dpAuthor}
                          </span>
                        )}
                        {id === firstRecipient && id !== t.createdByUserId && (
                          <span className="ptag">{dict.dpFirstRecipient}</span>
                        )}
                        {id === meId && <span className="ptag">{dict.dpMe}</span>}
                      </div>
                      <div className="prow__r">{roleOf(id)}</div>
                    </div>
                  </div>
                ))}
              </div>
              {mine && !t.projectId && (
                <button className="dp__sharebtn" onClick={(e) => openSharePop(e, t, "share")}>
                  <UserPlus size={14} />
                  {dict.dpShareManage}
                </button>
              )}
            </div>
          ) : mine && !t.projectId ? (
            <div className="dsec">
              <div className="dsec__t">{dict.dpShare}</div>
              <button className="dp__sharebtn" onClick={(e) => openSharePop(e, t, "share")}>
                <UserPlus size={14} />
                {dict.dpShareCta}
              </button>
            </div>
          ) : null}

          {t.imageUrls.length > 0 && (
            <div className="dsec">
              <div className="dsec__t">{fill(dict.dpPhotos, { n: t.imageUrls.length })}</div>
              <div className="dp__photos">
                {t.imageUrls.map((url, i) => (
                  <button
                    key={url}
                    type="button"
                    className="ph ph--btn"
                    onClick={() => setLightbox({ urls: t.imageUrls, index: i })}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="dsec">
            <div className="dsec__t">{dict.dpLog}</div>
            <div className="log">
              <div className="log-sys">
                <span className="log-sys__line" />
                {fill(dict.dpLogCreated, { name: nameOf(t.createdByUserId) })}
              </div>
              {/* 노트만 걸러 내던 것을 시스템 로그까지 전부 렌더한다(2026-07-31). 전에는 완료·재개·
                  상태변경·공유·수정 기록이 콘솔에서 통째로 안 보여서, "누가 언제 완료했다가 다시
                  열었는지"를 관리자 화면에서 확인할 수 없었다(모바일 상세에는 계속 보였다).
                  노트는 카드(.log-note), 시스템은 한 줄 타임라인(.log-sys)으로 시각적으로 가른다.
                  노트 사진도 여기서 처음으로 보인다 — 콘솔이 업로드는 시키면서 표시는 안 했다. */}
              {(loaded?.updates ?? []).map((u) =>
                u.type === "note" ? (
                  <div key={u.id} className="log-note">
                    <Avatar id={u.byUserId ?? ""} />
                    <div className="log-note__b">
                      <div className="log-note__h">
                        <b>{u.byName}</b>
                        <span>{fmtLog(u.createdAt, locale)}</span>
                      </div>
                      {u.body && <p className="log-note__p">{u.body}</p>}
                      {u.imageUrls.length > 0 && (
                        <div className="log-note__photos">
                          {u.imageUrls.map((url, i) => (
                            <button
                              key={url}
                              type="button"
                              className="log-thumb"
                              onClick={() => setLightbox({ urls: u.imageUrls, index: i })}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={u.id} className="log-sys">
                    <span className="log-sys__line" />
                    {systemLogLabel(u.type, u.body, u.byName, dict)} · {fmtLog(u.createdAt, locale)}
                  </div>
                ),
              )}
              <div className="log-input">
                <input
                  placeholder={dict.dpLogInput}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendNote();
                  }}
                />
                <button
                  className="log-send"
                  onClick={sendNote}
                  disabled={!noteDraft.trim() && notePhotos.length === 0}
                >
                  <Send size={15} />
                </button>
              </div>
              {/* `display: contents` 컴포넌트라 flex 줄을 하나 감싸 준다. */}
              <div className="log-photos">
                <TaskPhotoUploader
                  compact
                  value={[]}
                  pending={notePhotos}
                  maxImages={5}
                  copy={photoCopy}
                  onChange={(next) => setNotePhotos(next.pending)}
                />
              </div>
            </div>
          </div>
        </div>
        <div className="dp__foot">
          {mine ? (
            <>
              <button
                className={`dp__tb ${editing ? "on" : ""}`}
                onClick={() => (editing ? cancelCoreEdit() : startCoreEdit(t))}
                title={dict.dpEdit}
                aria-pressed={!!editing}
              >
                <Pencil size={16} />
              </button>
              {!t.projectId && (
                <button className="dp__tb" onClick={(e) => openSharePop(e, t, "share")} title={dict.dpShare}>
                  <Share2 size={16} />
                </button>
              )}
              <span className="sp" />
              <button className="btn btn--warn btn--sm" onClick={() => deleteWithUndo(t)}>
                <Trash2 size={15} />
                {shared ? dict.dpUnshareDelete : dict.dpDelete}
              </button>
            </>
          ) : (
            <>
              <div className="authnote">
                <Lock size={14} />
                {fill(dict.dpAuthorOnly, { name: nameOf(t.createdByUserId) })}
              </div>
              <span className="sp" />
              <button
                className="btn btn--ghost btn--sm"
                onClick={() =>
                  setConfirm({
                    message: dict.confirmLeaveMsg,
                    confirmLabel: dict.dpLeave,
                    onConfirm: () => run(() => leaveConsoleTask(t.id), { toast: dict.tDeleted, after: closePanel }),
                  })
                }
              >
                {dict.dpLeave}
              </button>
            </>
          )}
        </div>
      </aside>
      </>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // POPOVER LAYER
  // ────────────────────────────────────────────────────────────────────────────────────────────
  function PopoverLayer() {
    if (!pop) return null;
    // Initial guess (below the trigger); the layout effect measures and repositions before paint.
    const style: CSSProperties = { left: pop.x, top: pop.y };
    return (
      <>
        <div className="tpop-scrim" onClick={() => setPop(null)} />
        <div ref={popAnchorRef} className="tpop-anchor" style={style} onClick={(e) => e.stopPropagation()}>
          {pop.kind === "schedule" && SchedulePopover({ p: pop })}
          {pop.kind === "prio" && PrioMenu({ p: pop })}
          {pop.kind === "share" && SharePopover({ p: pop })}
          {pop.kind === "context" && ContextPicker({ p: pop })}
          {pop.kind === "rowmenu" && RowMenu({ p: pop })}
          {pop.kind === "datefilter" && DateFilterMenu()}
          {pop.kind === "priofilter" && PrioFilterMenu()}
        </div>
      </>
    );
  }

  function SchedulePopover({ p }: { p: SchedulePop }) {
    const sel0 = p.draft.date;
    const dow = weekdayIndex(today);
    const nextMon = addDays(today, ((8 - dow) % 7) || 7);
    const nextSat = addDays(today, ((6 - dow + 7) % 7) || 7);
    const set = (patch: Partial<SchedulePop["draft"]>) => {
      const draft = { ...p.draft, ...patch };
      // 반복 또는 시간을 새로 켰는데 날짜가 없으면 오늘로 자동 앵커한다. 반복은 날짜 앵커가
      // 필수라, 그냥 두면 저장 시 서버가 repeat_needs_date 로 거부해 "처리하지 못했습니다"만 뜬다.
      const settingRepeat =
        "repeat" in patch &&
        !!patch.repeat &&
        patch.repeat !== "none" &&
        patch.repeat !== CUSTOM_RECURRENCE_PREFIX;
      const settingTime = "time" in patch && !!patch.time;
      if ((settingRepeat || settingTime) && !draft.date) draft.date = today;
      setPop({ ...p, draft });
    };
    const [cy, cmm] = p.calMonth.split("-").map(Number);
    const firstDow = new Date(Date.UTC(cy, cmm - 1, 1)).getUTCDay();
    const dim = new Date(Date.UTC(cy, cmm, 0)).getUTCDate();
    const qd = (iso: string) => `${fmtShort(iso, locale)} (${fmtWeekday(iso, locale)})`;
    const quick = (label: string, icon: ReactNode, iso: string, mod: string) => (
      <button
        className={`qopt qopt--${mod} ${(iso ? sel0 === iso : !sel0) ? "on" : ""}`}
        onClick={() => set({ date: iso })}
      >
        <span className="qopt__ic">{icon}</span>
        <span className="qopt__t">{label}</span>
        <span className="qopt__d">{iso ? qd(iso) : ""}</span>
      </button>
    );
    const shiftCal = (delta: number) => {
      const nm = new Date(Date.UTC(cy, cmm - 1 + delta, 1));
      setPop({ ...p, calMonth: `${nm.getUTCFullYear()}-${String(nm.getUTCMonth() + 1).padStart(2, "0")}` });
    };
    const wdHead = ["0", "1", "2", "3", "4", "5", "6"].map((_, i) =>
      new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "ko-KR", {
        weekday: "narrow",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2024, 0, 7 + i))),
    );
    const curRep = p.draft.repeat || "none";
    const anchorForRepeat = sel0 || today;
    // `customDays` is the picker's mode flag AND its value: an array (possibly empty) while the
    // 사용자 지정 row is on, null otherwise. `custom:` with an empty body parses to null, so the
    // in-progress "custom mode, nothing picked yet" state needs this explicit prefix check.
    const inCustomMode = curRep.startsWith(CUSTOM_RECURRENCE_PREFIX);
    const customDays = inCustomMode ? (parseCustomWeekdays(curRep) ?? []) : null;
    const repeatIncomplete = inCustomMode && customDays!.length === 0;
    return (
      <div className="pop sch">
        <div className="sch__label">
          <b>{sel0 ? fmtLong(sel0, locale) : dict.schQNoDate}</b>
          <span>
            {p.draft.time ? `${timeRange(p.draft.time, p.draft.dur)} · ` : ""}
            {curRep !== "none" ? repeatLabel(curRep, anchorForRepeat, today, locale, dict) : dict.schNoRepeat}
          </span>
        </div>
        <div className="sch__quick">
          {quick(dict.schQToday, <Sun size={14} />, today, "today")}
          {quick(dict.schQTomorrow, <Sunrise size={14} />, addDays(today, 1), "tmr")}
          {quick(dict.schQNextWeek, <ArrowRight size={14} />, nextMon, "week")}
          {quick(dict.schQNextWeekend, <CalendarDays size={14} />, nextSat, "wend")}
          {quick(dict.schQNoDate, <CalendarX2 size={14} />, "", "none")}
        </div>
        <div className="sch__cal">
          <div className="cal-head">
            <button className="cal-nav" onClick={() => shiftCal(-1)}>
              <ChevronLeft size={15} />
            </button>
            <b>{fmtMonthTitle(cy, cmm, locale)}</b>
            <button className="cal-nav" onClick={() => shiftCal(1)}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="cal-wd">
            {wdHead.map((w, i) => (
              <span key={i} className={i === 0 ? "sun" : i === 6 ? "sat" : ""}>
                {w}
              </span>
            ))}
          </div>
          <div className="cal-grid">
            {Array.from({ length: firstDow }).map((_, i) => (
              <button key={`pad${i}`} className="cal-c pad" />
            ))}
            {Array.from({ length: dim }).map((_, i) => {
              const dd = i + 1;
              const iso = `${cy}-${String(cmm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
              const wd = weekdayIndex(iso);
              return (
                <button
                  key={iso}
                  className={`cal-c ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""} ${iso === today ? "today" : ""} ${iso === sel0 ? "sel" : ""}`}
                  onClick={() => set({ date: iso })}
                >
                  {dd}
                </button>
              );
            })}
          </div>
        </div>
        <div className="sch__exp">
          <div className={`exp-row ${p.expand === "time" ? "open" : ""}`}>
            <button className="exp-h" onClick={() => setPop({ ...p, expand: p.expand === "time" ? null : "time" })}>
              <Clock size={14} />
              {dict.schTime}
              <span className="val">
                {p.draft.time ? timeRange(p.draft.time, p.draft.dur) : dict.schTimeNone}
                <span className="ic chev">
                  <ChevronDown size={13} />
                </span>
              </span>
            </button>
            <div className="exp-body">
              <div className="time-in">
                <input type="time" value={p.draft.time} onChange={(e) => set({ time: e.target.value })} />
              </div>
              <div className="dur-lbl">{dict.schDuration}</div>
              <div className="opt-chips">
                {DURATION_OPTIONS.map((o) => (
                  <button
                    key={String(o.value)}
                    className={`ochip ${p.draft.dur === o.value ? "on" : ""}`}
                    onClick={() => set({ dur: o.value })}
                  >
                    {dict[o.key]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className={`exp-row ${p.expand === "repeat" ? "open" : ""}`}>
            <button className="exp-h" onClick={() => setPop({ ...p, expand: p.expand === "repeat" ? null : "repeat" })}>
              <Repeat size={14} />
              {dict.schRepeat}
              <span className="val">
                {curRep !== "none" ? repeatLabel(curRep, anchorForRepeat, today, locale, dict) : dict.schNoRepeat}
                <span className="ic chev">
                  <ChevronDown size={13} />
                </span>
              </span>
            </button>
            <div className="exp-body">
              <div className="rep-list">
                {REPEAT_RULES.map((r) => (
                  <button
                    key={r}
                    className={`ritem ${curRep === r ? "on" : ""}`}
                    onClick={() => set({ repeat: r })}
                  >
                    {r === "none" ? <CalendarX2 size={14} /> : <Repeat size={14} />}
                    {repeatLabel(r === "none" ? null : r, anchorForRepeat, today, locale, dict)}
                    <span className="ic chk">
                      <Check size={13} />
                    </span>
                  </button>
                ))}
                {/* 사용자 지정 — 켜면 요일 칩이 펼쳐진다. 아무 요일도 안 고르면 `custom:` 뒤가
                    비어 저장할 수 없으므로 적용 버튼이 잠긴다(아래 sch__foot). */}
                <button
                  type="button"
                  className={`ritem ${customDays !== null ? "on" : ""}`}
                  onClick={() =>
                    set({ repeat: customDays !== null ? "none" : `${CUSTOM_RECURRENCE_PREFIX}` })
                  }
                  aria-expanded={customDays !== null}
                >
                  <CalendarDays size={14} />
                  {dict.repPickDays}
                  <span className="ic chk">
                    <Check size={13} />
                  </span>
                </button>
                {customDays !== null && (
                  <div className="wdpick">
                    <div className="wdpick__row">
                      {WEEKDAY_ORDER.map((wd) => {
                        const on = customDays.includes(wd);
                        return (
                          <button
                            key={wd}
                            type="button"
                            className={`wdchip ${on ? "on" : ""} ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""}`}
                            aria-pressed={on}
                            onClick={() =>
                              set({
                                repeat: `${CUSTOM_RECURRENCE_PREFIX}${(on
                                  ? customDays.filter((d) => d !== wd)
                                  : [...customDays, wd].sort((a, b) => a - b)
                                ).join(",")}`,
                              })
                            }
                          >
                            {weekdayShortName(wd, locale)}
                          </button>
                        );
                      })}
                    </div>
                    <p className="wdpick__hint">
                      {customDays.length
                        ? fill(dict.repCustomDays, { wd: customWeekdayNames(curRep, locale) })
                        : dict.repPickDaysHint}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="sch__foot">
          <button className="btn btn--ghost btn--sm" onClick={() => setPop(null)}>
            {dict.schCancel}
          </button>
          <button
            className="btn btn--pri btn--sm"
            onClick={() => applySchedule(p)}
            disabled={repeatIncomplete}
            title={repeatIncomplete ? dict.repPickDaysHint : undefined}
          >
            {dict.schApply}
          </button>
        </div>
      </div>
    );
  }

  function PrioMenu({ p }: { p: PrioPop }) {
    const it = (v: string, label: string, color: string, filled: boolean) => (
      <button className="mitem" onClick={() => applyPrio(p, v)}>
        <span className="ic" style={{ color }}>
          <Flag size={15} fill={filled ? "currentColor" : "none"} />
        </span>
        {label}
        {p.cur === v && (
          <span className="ic" style={{ marginLeft: "auto", color: "var(--primary)" }}>
            <Check size={15} />
          </span>
        )}
      </button>
    );
    return (
      <div className="pop menu">
        {it("urgent", dict.prioUrgent, "var(--flag-urgent)", true)}
        {it("important", dict.prioImportant, "var(--flag-warn)", true)}
        {it("medium", dict.prioMedium, "var(--flag-medium)", true)}
        {it("normal", dict.prioNormal, "var(--faint)", false)}
      </div>
    );
  }

  function SharePopover({ p }: { p: SharePop }) {
    const list = data.users.filter(
      (u) => u.id !== meId && (!p.q || u.name.includes(p.q) || u.role.includes(p.q)),
    );
    /**
     * 참여자(비작성자)는 **부를 수만** 있다 — 서버가 제거분을 버리므로, 화면에서도 기존 참여자의
     * 체크를 못 풀게 잠근다. 안 그러면 해제했다가 새로고침에 되살아나는 유령 조작이 된다.
     */
    const shareTask = p.src === "task" && p.taskId ? tasks.find((t) => t.id === p.taskId) : null;
    const lockedIds =
      shareTask && !isMine(shareTask, meId)
        ? new Set(shareTask.participants.filter((x) => x.role !== "author").map((x) => x.userId))
        : new Set<string>();
    const toggle = (uid: string) => {
      if (lockedIds.has(uid)) return;
      setPop({ ...p, sel: p.sel.includes(uid) ? p.sel.filter((x) => x !== uid) : [...p.sel, uid] });
    };
    const cta =
      p.mode === "target"
        ? p.sel.length
          ? p.sel.length === 1
            ? fill(dict.instructedBy, { name: nameOf(p.sel[0]) })
            : fill(dict.shTargetCta, { n: p.sel.length })
          : dict.shTargetTitle
        : p.sel.length
          ? fill(dict.shShareCta, { n: p.sel.length })
          : dict.shShareTitle;
    return (
      <div className="pop shp">
        <div className="shp__h">
          <b>{p.mode === "target" ? dict.shTargetTitle : dict.shShareTitle}</b>
          <span>{p.mode === "target" ? dict.shTargetSub : dict.shShareSub}</span>
        </div>
        {p.mode === "target" && (
          <div className="shp__hint">
            <Megaphone size={14} />
            {fill(dict.shTargetHint, { name: nameOf(meId) })}
          </div>
        )}
        <div className="shp__search">
          <span className="ic">
            <Search size={14} />
          </span>
          <input
            placeholder={dict.shSearch}
            value={p.q}
            onChange={(e) => setPop({ ...p, q: e.target.value })}
          />
        </div>
        <div className="shp__list">
          {list.length === 0 ? (
            <div className="tempty__s" style={{ padding: 16 }}>
              {dict.shNoResult}
            </div>
          ) : (
            list.map((u) => (
              <button
                key={u.id}
                className={`urow ${p.sel.includes(u.id) ? "on" : ""}`}
                disabled={lockedIds.has(u.id)}
                onClick={() => toggle(u.id)}
              >
                <Avatar id={u.id} />
                <div className="urow__b">
                  <div className="urow__n">{u.name}</div>
                  <div className="urow__r">{u.role}</div>
                </div>
                <span className="ucheck">
                  <Check size={14} />
                </span>
              </button>
            ))
          )}
        </div>
        <div className="shp__foot">
          <button
            className="btn btn--pri"
            /* 기존 작업 공유 관리(src=task)는 0명(전원 제거)도 적용 가능. 인라인 추가 대상 선택만 0에서 비활성. */
            disabled={p.src === "add" && p.sel.length === 0}
            onClick={() => applyShare(p)}
          >
            {cta}
          </button>
        </div>
      </div>
    );
  }

  // 인라인 추가는 로컬 드래프트만 갱신하고, 기존 작업은 곧바로 서버에 저장한다(다른 팝오버와 동일).
  function ContextPicker({ p }: { p: ContextPop }) {
    const t = p.taskId ? tasks.find((x) => x.id === p.taskId) : null;
    const current: TaskContextValue =
      p.src === "add"
        ? add?.context ?? EMPTY_TASK_CONTEXT
        : t?.resolvedContext
          ? {
              propertyId: t.resolvedContext.propertyId,
              roomId: t.resolvedContext.roomId,
              reservationId: t.resolvedContext.reservationId,
              guestName: t.resolvedContext.guestName,
              propertyName: t.resolvedContext.propertyName,
              roomLabel: t.resolvedContext.roomLabel,
            }
          : EMPTY_TASK_CONTEXT;
    return (
      <ContextPickerPopover
        value={current}
        copy={contextCopy}
        onClose={() => setPop(null)}
        onChange={(v) => {
          setPop(null);
          if (p.src === "add") {
            if (add) setAdd({ ...add, context: v });
            return;
          }
          if (!t) return;
          // 기존 작업은 코어 편집과 같은 액션을 쓴다 — 날짜/시간/반복/우선순위는 현재 값 그대로.
          run(
            () =>
              updateConsoleTaskCore({
                taskId: t.id,
                title: t.title,
                desc: t.description ?? "",
                tags: t.tags,
                date: dueDateOf(t) ?? t.scheduledDate ?? "",
                time: t.timeLabel ?? "",
                durationMinutes: t.durationMinutes,
                repeat: t.recurrenceRule ?? "none",
                priority: t.priority,
                context: v,
              }),
            { toast: dict.tUpdated },
          );
        }}
      />
    );
  }

  function RowMenu({ p }: { p: RowMenuPop }) {
    const t = tasks.find((x) => x.id === p.taskId);
    if (!t) return null;
    const mine = isMine(t, meId);
    const close = () => setPop(null);
    return (
      <div className="pop menu">
        {/* 일정 변경 = 마감·시간·반복 주기 수정이라 **작성자 전용**(서버도 forbidden). 참여자에게는
            아래 오늘/내일로 이동만 남는다 — 그쪽은 모바일에서도 참여자에게 열려 있다. */}
        {mine && (
          <button className="mitem" onClick={(e) => openSchedulePop(e, t)}>
            <CalendarDays size={15} />
            {dict.mScheduleChange}
          </button>
        )}
        {mine && (
          <button className="mitem" onClick={(e) => openPrioPop(e, t)}>
            <Flag size={15} />
            {dict.mPriority}
          </button>
        )}
        {/* 참여자도 사람을 부를 수 있다(Re-sharing). 다만 서버는 작성자가 아닐 때 **추가만**
            적용하고 제거·지시 전환은 무시한다(`shareConsoleTask`). */}
        {!t.projectId && (
          <button className="mitem" onClick={(e) => openSharePop(e, t, "share")}>
            <UserPlus size={15} />
            {dict.mShareInstr}
          </button>
        )}
        {mine && (
          <button className="mitem" onClick={(e) => openContextPop(e, t)}>
            <Building2 size={15} />
            {dict.cpTitle}
          </button>
        )}
        {/* 이동 대상은 탭이 아니라 **작업 자신의 날짜**로 정한다: 오늘 작업이면 내일로, 그 밖이면
            오늘로. 이 메뉴는 관리함·공유함·지시·캘린더·프로젝트에서도 같이 뜨므로 탭 기준으로는
            판단할 수 없고, 현재 날짜와 같은 쪽으로 옮기는 무의미한 항목도 사라진다. */}
        {dateOf(t) === today ? (
          <button
            className="mitem"
            onClick={() => {
              close();
              run(() => moveConsoleToTomorrow(t.id), { toast: dict.tMoved });
            }}
          >
            <Sunrise size={15} />
            {dict.mMoveTomorrow}
          </button>
        ) : (
          <button
            className="mitem"
            onClick={() => {
              close();
              run(() => moveConsoleToToday(t.id), { toast: dict.tMoved });
            }}
          >
            <Sun size={15} />
            {dict.mMoveToday}
          </button>
        )}
        {/* "관리함으로" = 프로젝트에서 빼기. 비프로젝트 작업은 이미 관리함이라 프로젝트 작업에만 노출. */}
        {t.projectId && (
          <button
            className="mitem"
            onClick={() => {
              close();
              run(() => moveConsoleToInbox(t.id), { toast: dict.tMoved });
            }}
          >
            <Inbox size={15} />
            {dict.mMoveInbox}
          </button>
        )}
        <div className="msep" />
        {mine ? (
          <button
            className="mitem mitem--warn"
            onClick={() => {
              close();
              // 반복 작업을 **회차로** 보고 있으면 무엇을 지울지 먼저 묻는다(모바일과 같은 규칙).
              // 관리함처럼 회차가 아닌 목록에서는 행이 곧 시리즈이므로 기존 즉시 삭제 + 실행 취소.
              if (p.occ && isStandardRecurrence(t.recurrenceRule)) setRecurDel({ task: t, date: p.occ });
              else deleteWithUndo(t);
            }}
          >
            <Trash2 size={15} />
            {dict.mDelete}
          </button>
        ) : (
          <button
            className="mitem mitem--warn"
            onClick={() => {
              close();
              setConfirm({
                message: dict.confirmLeaveMsg,
                confirmLabel: dict.dpLeave,
                onConfirm: () =>
                  run(() => leaveConsoleTask(t.id), { toast: dict.tDeleted, after: () => sel === t.id && closePanel() }),
              });
            }}
          >
            <Trash2 size={15} />
            {dict.mLeave}
          </button>
        )}
      </div>
    );
  }

  function DateFilterMenu() {
    const opt = (k: DateFilterKey, label: string) => (
      <button
        className="mitem"
        onClick={() => {
          setDateFilter(dateFilter === k ? null : k);
          setPop(null);
        }}
      >
        <CalendarDays size={15} />
        {label}
        {dateFilter === k && (
          <span className="ic" style={{ marginLeft: "auto", color: "var(--primary)" }}>
            <Check size={15} />
          </span>
        )}
      </button>
    );
    return (
      <div className="pop menu">
        {opt("today", dict.today)}
        {opt("week", dict.filterDate)}
        {opt("overdue", dict.stOverdue)}
        {opt("nodate", dict.noDate)}
      </div>
    );
  }

  function PrioFilterMenu() {
    const opt = (k: string, label: string, color: string) => (
      <button
        className="mitem"
        onClick={() => {
          setPrioFilter(prioFilter === k ? "" : k);
          setPop(null);
        }}
      >
        <span className="ic" style={{ color }}>
          <Flag size={15} fill="currentColor" />
        </span>
        {label}
        {prioFilter === k && (
          <span className="ic" style={{ marginLeft: "auto", color: "var(--primary)" }}>
            <Check size={15} />
          </span>
        )}
      </button>
    );
    return (
      <div className="pop menu">
        {opt("urgent", dict.prioUrgent, "var(--flag-urgent)")}
        {opt("important", dict.prioImportant, "var(--flag-warn)")}
        {opt("medium", dict.prioMedium, "var(--flag-medium)")}
        {opt("normal", dict.prioNormal, "var(--faint)")}
        <div className="msep" />
        <button
          className="mitem"
          onClick={() => {
            setPrioFilter("");
            setPop(null);
          }}
        >
          <X size={15} />
          {dict.filterPrio}
        </button>
      </div>
    );
  }

  // ── DAY SHEET ────────────────────────────────────────────────────────────────────────────
  function DaySheet() {
    if (!daySheet) return null;
    const iso = daySheet;
    const list = personalTasks
      .filter(
        (t) =>
          isActive(t) &&
          myOwn(t, meId) &&
          occursOn(t, iso) &&
          !(hideRecurring && isStandardRecurrence(t.recurrenceRule)),
      )
      .sort(prioSort);
    return (
      <>
        <div className="day-scrim" onClick={() => setDaySheet(null)} />
        <div className="day-wrap" onClick={() => setDaySheet(null)}>
          <div className="pop" style={{ width: 400, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="dp__top" style={{ borderBottom: "1px solid var(--line-soft)" }}>
              <span className="dp__crumb">
                <CalendarDays size={14} />
                <b>{fmtLong(iso, locale)}</b>
              </span>
              <span className="sp" />
              <button className="dp__tb" onClick={() => setDaySheet(null)}>
                <X size={16} />
              </button>
            </div>
            <div style={{ padding: "8px 14px 4px", maxHeight: "52vh", overflowY: "auto" }}>
              {list.length > 0 ? (
                <div className="tlist">{list.map((t) => renderRow(t, { hideDate: true }))}</div>
              ) : (
                <div className="tempty__s" style={{ padding: 24, textAlign: "center" }}>
                  {dict.calDayEmpty}
                </div>
              )}
            </div>
            <div className="sch__foot">
              <button
                className="btn btn--pri btn--sm"
                style={{ width: "100%" }}
                onClick={() => {
                  setDaySheet(null);
                  openInlineAdd("day", iso);
                }}
              >
                <Plus size={14} />
                {dict.calAddOnDay}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── REPORT MODAL ─────────────────────────────────────────────────────────────────────────
  function ReportModal() {
    if (!report) return null;
    return (
      <>
        <div className="day-scrim" onClick={() => setReport(null)} />
        <div className="day-wrap" onClick={() => setReport(null)}>
          <div className="pop rpt" onClick={(e) => e.stopPropagation()}>
            <div className="dp__top">
              <span className="dp__crumb">
                <FileText size={14} />
                <b>{fill(dict.rptTitle, { date: fmtLong(report.date, locale) })}</b>
              </span>
              <span className="sp" />
              <button className="dp__tb" onClick={() => setReport(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="rpt__body">
              {report.loading ? (
                <div className="tempty__s" style={{ padding: 24 }}>
                  …
                </div>
              ) : report.error ? (
                <div className="tempty__s" style={{ padding: 24 }}>
                  {report.error === "forbidden"
                    ? dict.errForbidden
                    : report.error === "empty"
                      ? dict.emCompleted
                      : dict.errGeneric}
                </div>
              ) : (
                <>
                  <div className="rpt__hint">
                    <Share2 size={14} />
                    {fill(dict.rptHint, {
                      // 보고서는 본인 완료만 집계(generateDailyReport) → 힌트 건수도 본인 기준으로 맞춘다.
                      n: tasks.filter(
                        (t) =>
                          t.status === "completed" &&
                          completedDateOf(t) === report.date &&
                          t.completedByUserId === meId,
                      ).length,
                    })}
                  </div>
                  <textarea
                    className="rpt__ta"
                    spellCheck={false}
                    value={reportEdited}
                    onChange={(e) => setReportEdited(e.target.value)}
                  />
                </>
              )}
            </div>
            <div className="sch__foot">
              <button className="btn btn--ghost btn--sm" onClick={() => setReportEdited(report.text)}>
                <Repeat size={14} />
                {dict.rptReset}
              </button>
              <span style={{ flex: 1 }} />
              <button className="btn btn--ghost btn--sm" onClick={() => setReport(null)}>
                {dict.rptClose}
              </button>
              <button className="btn btn--pri btn--sm" onClick={copyReport} disabled={!!report.error || report.loading}>
                <FileText size={14} />
                {dict.rptCopy}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── NEW PROJECT MODAL ────────────────────────────────────────────────────────────────────
  function NewProjectModal() {
    if (!newProj) return null;
    const list = data.users.filter(
      (u) => u.id !== meId && (!newProj.q || u.name.includes(newProj.q) || u.role.includes(newProj.q)),
    );
    const toggle = (uid: string) =>
      setNewProj({
        ...newProj,
        members: newProj.members.includes(uid)
          ? newProj.members.filter((x) => x !== uid)
          : [...newProj.members, uid],
      });
    const save = () => {
      if (!newProj.name.trim()) return;
      const { name, members } = newProj;
      run(() => createConsoleProject(name, members), {
        toast: dict.tProjectCreated,
        after: () => setNewProj(null),
      });
    };
    return (
      <>
        <div className="day-scrim" onClick={() => setNewProj(null)} />
        <div className="day-wrap" onClick={() => setNewProj(null)}>
          <div className="pop npm" onClick={(e) => e.stopPropagation()}>
            <div className="dp__top">
              <span className="dp__crumb">
                <Hash size={14} />
                <b>{dict.npTitle}</b>
              </span>
              <span className="sp" />
              <button className="dp__tb" onClick={() => setNewProj(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="npm__body">
              <div className="npm__f">
                <label>{dict.npName}</label>
                <input
                  className="npm__in"
                  placeholder={dict.npNamePh}
                  value={newProj.name}
                  onChange={(e) => setNewProj({ ...newProj, name: e.target.value })}
                />
              </div>
              <div className="npm__f">
                <label>{fill(dict.npMembers, { n: newProj.members.length + 1 })}</label>
                <div className="npm__search">
                  <span className="ic">
                    <Search size={14} />
                  </span>
                  <input
                    placeholder={dict.npSearch}
                    value={newProj.q}
                    onChange={(e) => setNewProj({ ...newProj, q: e.target.value })}
                  />
                  {newProj.q && (
                    <button className="npm__clear" onClick={() => setNewProj({ ...newProj, q: "" })}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                <div className="npm__list">
                  {list.length === 0 ? (
                    <div className="railempty" style={{ padding: "14px 12px" }}>
                      {dict.shNoResult}
                    </div>
                  ) : (
                    list.map((u) => (
                      <button
                        key={u.id}
                        className={`urow ${newProj.members.includes(u.id) ? "on" : ""}`}
                        onClick={() => toggle(u.id)}
                      >
                        <Avatar id={u.id} />
                        <div className="urow__b">
                          <div className="urow__n">{u.name}</div>
                          <div className="urow__r">{u.role}</div>
                        </div>
                        <span className="ucheck">
                          <Check size={14} />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="shp__hint" style={{ margin: 0 }}>
                <Share2 size={14} />
                {dict.npHint}
              </div>
            </div>
            <div className="sch__foot">
              <button className="btn btn--ghost btn--sm" onClick={() => setNewProj(null)}>
                {dict.npCancel}
              </button>
              <button className="btn btn--pri btn--sm" disabled={!newProj.name.trim()} onClick={save}>
                {dict.npCreate}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  function durText(mins: number): string {
    const opt = DURATION_OPTIONS.find((o) => o.value === mins);
    return opt ? dict[opt.key] : "";
  }

  // ── CONFIRM MODAL (destructive actions) ─────────────────────────────────────────────────────
  /**
   * 반복 삭제 선택 모달 — 회차 하나 vs 시리즈 전체.
   *
   * 파괴 정도가 다른 두 동작을 한 버튼에 묶지 않는다. 두 선택지는 같은 크기의 행으로 놓아 "고르는
   * 화면"으로 읽히게 하고, 되돌릴 수 없는 쪽(전체 삭제)만 danger 톤으로 구분한다. 헤더에 반복 주기를
   * 같이 보여줘 "전체"가 무엇을 뜻하는지 누르기 전에 알 수 있게 했다.
   */
  function RecurDeleteModal() {
    if (!recurDel) return null;
    const { task, date } = recurDel;
    const opt = (
      opts: { icon: ReactNode; title: string; sub: string; onClick: () => void; warn?: boolean },
    ) => (
      <button className={`rcopt${opts.warn ? " rcopt--warn" : ""}`} onClick={opts.onClick}>
        <span className="rcopt__ic">{opts.icon}</span>
        <span className="rcopt__t">
          <b>{opts.title}</b>
          <i>{opts.sub}</i>
        </span>
        <ChevronRight className="rcopt__go" size={15} />
      </button>
    );
    return (
      <>
        <div className="day-scrim" onClick={() => setRecurDel(null)} />
        <div className="day-wrap" onClick={() => setRecurDel(null)}>
          <div className="pop rcm" onClick={(e) => e.stopPropagation()}>
            <div className="dp__top">
              <span className="dp__crumb">
                <Repeat size={14} />
                <b>{repeatShort(task.recurrenceRule, dict, locale)}</b>
              </span>
              <span className="sp" />
              <button className="dp__tb" onClick={() => setRecurDel(null)}>
                <X size={16} />
              </button>
            </div>
            <p className="rcm__title">{task.title}</p>
            <div className="rcm__opts">
              {opt({
                icon: <SkipForward size={16} />,
                title: fill(dict.recurSkipOne, { date: fmtShort(date, locale) }),
                sub: dict.recurSkipOneSub,
                onClick: () => skipOccurrenceWithUndo(task, date),
              })}
              {opt({
                icon: <Trash2 size={16} />,
                title: dict.recurDeleteAll,
                sub: dict.recurDeleteAllSub,
                warn: true,
                onClick: () => {
                  setRecurDel(null);
                  deleteWithUndo(task);
                },
              })}
            </div>
          </div>
        </div>
      </>
    );
  }

  function ConfirmModal() {
    if (!confirm) return null;
    const c = confirm;
    return (
      <>
        <div className="day-scrim" onClick={() => setConfirm(null)} />
        <div className="day-wrap" onClick={() => setConfirm(null)}>
          <div className="pop" style={{ width: 380, maxWidth: "92vw" }} onClick={(e) => e.stopPropagation()}>
            <div className="dp__top">
              <span className="dp__crumb">
                <AlertTriangle size={14} />
                <b>{dict.confirmTitle}</b>
              </span>
              <span className="sp" />
              <button className="dp__tb" onClick={() => setConfirm(null)}>
                <X size={16} />
              </button>
            </div>
            {/* pre-line: the bulk-delete message appends a second line about shared tasks. */}
            <div
              style={{
                padding: "6px 20px 16px",
                fontSize: 14,
                color: "var(--ink-soft)",
                lineHeight: 1.5,
                whiteSpace: "pre-line",
              }}
            >
              {c.message}
            </div>
            <div className="sch__foot">
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirm(null)}>
                {dict.iaCancel}
              </button>
              <span style={{ flex: 1 }} />
              <button
                className="btn btn--warn btn--sm"
                onClick={() => {
                  setConfirm(null);
                  c.onConfirm();
                }}
              >
                <Trash2 size={15} />
                {c.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }
}

// ── tiny helpers (module scope) ───────────────────────────────────────────────────────────────
function MetaRow({ icon, k, children }: { icon: ReactNode; k: string; children: ReactNode }) {
  return (
    <div className="meta__r">
      <span className="meta__ic">{icon}</span>
      <span className="meta__k">{k}</span>
      <span className="meta__v">{children}</span>
    </div>
  );
}

function fmtMonthTitle(y: number, m: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function fmtLog(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ja" ? "ja-JP" : locale === "en" ? "en-US" : "ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(d);
}
