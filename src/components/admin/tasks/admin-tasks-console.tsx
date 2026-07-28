"use client";

// 어드민 Todoist 콘솔(데스크톱). 모바일 코어 패리티 + 매니저 "업무 지시".
// 셸(사이드바/탑바)은 AdminShell 이 소유하고, 여기서는 서브내비 + 뷰 + 상세/팝오버/모달을 렌더한다.
// 디자인: Claude Design "StayOps 투두 (admin)" 이식. CSS: admin-tasks-console.css (.adm 스코프).
// 서버 액션(@/app/admin/tasks/actions)이 모든 쓰기를 처리하고, revalidatePath + router.refresh() 로 갱신한다.
// See docs/product/28-admin-todoist-console.md.
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
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
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  Crown,
  FileText,
  Flag,
  Hash,
  Inbox,
  Lock,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
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
  createConsoleProject,
  createConsoleTask,
  deleteConsoleTask,
  generateConsoleReport,
  getConsoleProjectDetail,
  getConsoleTaskDetail,
  leaveConsoleTask,
  moveConsoleToInbox,
  moveConsoleToToday,
  rescheduleConsoleTask,
  setConsoleTaskStatus,
  shareConsoleTask,
  toggleConsoleComplete,
  updateConsoleTaskCore,
  type TaskActionResult,
} from "@/app/admin/tasks/actions";
import type { AdminTasksData } from "@/lib/admin-tasks";
import { getAdminTasksDictionary } from "@/lib/admin-tasks-i18n";
import type { Locale } from "@/lib/i18n";
import type { ProjectDetailData } from "@/lib/projects";
import type { TaskDetail, TaskRecord } from "@/lib/tasks";
import { AdminToast, useAdminToast } from "@/components/admin/shared/admin-toast";
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
  partsOf,
  prioSort,
  dateSort,
  recvInstr,
  REPEAT_RULES,
  repeatLabel,
  repeatShort,
  sentInstr,
  timeRange,
  tokyoToday,
  weekdayIndex,
  type DateFilterKey,
} from "./helpers";
import "./admin-tasks-console.css";

type View = "today" | "tomorrow" | "inbox" | "shared" | "instr" | "completed" | "calendar";

type AddDraft = {
  ctx: "today" | "tomorrow" | "inbox" | "project" | "day";
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
};

type Anchor = { x: number; y: number };
type SchedulePop = {
  kind: "schedule";
  src: "add" | "task";
  taskId: string | null;
  draft: { date: string; time: string; dur: number | null; repeat: string };
  calMonth: string;
  expand: "time" | "repeat" | null;
} & Anchor;
type PrioPop = { kind: "prio"; src: "add" | "task"; taskId: string | null; cur: string } & Anchor;
type SharePop = {
  kind: "share";
  src: "add" | "task";
  taskId: string | null;
  mode: "target" | "share";
  sel: string[];
  q: string;
} & Anchor;
type RowMenuPop = { kind: "rowmenu"; taskId: string } & Anchor;
type DateFilterPop = { kind: "datefilter" } & Anchor;
type PrioFilterPop = { kind: "priofilter" } & Anchor;
type Pop = SchedulePop | PrioPop | SharePop | RowMenuPop | DateFilterPop | PrioFilterPop | null;

function anchorFrom(e: ReactMouseEvent): Anchor {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { x: r.left, y: r.bottom + 6 };
}

export function AdminTasksConsole({ locale, data }: { locale: Locale; data: AdminTasksData }) {
  const dict = getAdminTasksDictionary(locale);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { toast, showToast, dismiss } = useAdminToast();

  const meId = data.me.id;
  const today = useMemo(() => tokyoToday(), []);

  const [view, setView] = useState<View>("today");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailData | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [add, setAdd] = useState<AddDraft | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [instrTab, setInstrTab] = useState<"recv" | "sent">("recv");
  const [calMonth, setCalMonth] = useState<string>(() => today.slice(0, 7));
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterKey | null>(null);
  const [prioFilter, setPrioFilter] = useState("");
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [report, setReport] = useState<{ date: string; text: string; loading: boolean; error: string | null } | null>(
    null,
  );
  const [reportEdited, setReportEdited] = useState("");
  const [newProj, setNewProj] = useState<{ name: string; members: string[]; q: string } | null>(null);

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
  const projById = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);

  // ── action runner ──────────────────────────────────────────────────────────────
  const errMsg = useCallback(
    (code: string) =>
      code === "auth"
        ? dict.errAuth
        : code === "forbidden"
          ? dict.errForbidden
          : code === "save_failed" || code === "delete_failed"
            ? dict.errSave
            : dict.errGeneric,
    [dict],
  );
  const run = useCallback(
    (
      fn: () => Promise<TaskActionResult>,
      opts?: { toast?: string; after?: () => void },
    ) => {
      startTransition(async () => {
        const res = await fn();
        if (res.ok) {
          if (opts?.toast) showToast(opts.toast);
          opts?.after?.();
          router.refresh();
        } else {
          showToast(errMsg(res.error));
        }
      });
    },
    [errMsg, router, showToast],
  );

  // ── detail loading (updates + resolved context) ─────────────────────────────────
  // Load full detail (updates + context) for the open task. `detail` may briefly hold the previous
  // task's data after `sel` changes; consumers gate on `detail.id === sel` (no sync setState here).
  useEffect(() => {
    if (!sel) return;
    let alive = true;
    getConsoleTaskDetail(sel).then((res) => {
      if (alive && res.ok) setDetail(res.task);
    });
    return () => {
      alive = false;
    };
  }, [sel, data]);

  const openTask = useCallback((id: string) => {
    setSel(id);
    setNoteDraft("");
  }, []);
  const closePanel = useCallback(() => {
    setSel(null);
    setDetail(null);
  }, []);

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
      if (pop) setPop(null);
      else if (daySheet) setDaySheet(null);
      else if (report) setReport(null);
      else if (newProj) setNewProj(null);
      else if (sel) closePanel();
      else if (add) setAdd(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pop, daySheet, report, newProj, sel, add, closePanel]);

  // ── derived task groups (내 뷰는 myOwn) ────────────────────────────────────────────
  const overdueList = tasks.filter((t) => isOverdue(t, today) && myOwn(t, meId));
  const inboxCount = tasks.filter((t) => t.isInbox && isActive(t) && myOwn(t, meId)).length;
  const todayCount = tasks.filter((t) => isTodayTask(t, today) && myOwn(t, meId)).length + overdueList.length;
  const tomorrowCount = tasks.filter((t) => isTomorrowTask(t, today) && myOwn(t, meId)).length;
  const sharedCount = tasks.filter(
    (t) => isActive(t) && isSharedTask(t) && !sentInstr(t, meId) && !recvInstr(t, meId),
  ).length;
  const recvOpen = tasks.filter((t) => recvInstr(t, meId) && isActive(t)).length;
  const sentOpen = tasks.filter((t) => sentInstr(t, meId) && isActive(t)).length;

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
  const renderRow = (t: TaskRecord, opts?: { hideDate?: boolean; extraByLabel?: string }) => {
    const done = t.status === "completed";
    const overdue = isOverdue(t, today);
    const selected = sel === t.id;
    const instr = t.isDirective && !isMine(t, meId) ? t.authorName : null;
    const received = !isMine(t, meId) && !instr;
    const pcls = t.priority !== "normal" ? `p-${t.priority}` : "";
    const d = dateOf(t);
    const cx = ctxItems(t);
    const trng = timeRange(t.timeLabel, t.durationMinutes);

    const dateChip =
      !opts?.hideDate && d ? (
        <button
          className={`chip chip--date chip--btn ${overdue ? "chip--over" : d === today ? "chip--today" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            openSchedulePop(e, t);
          }}
        >
          <CalendarDays size={13} />
          {overdue
            ? `${fmtShort(d, locale)} · ${dict.stOverdue}`
            : d === today
              ? dict.today
              : d === addDays(today, 1)
                ? dict.tomorrow
                : `${fmtShort(d, locale)} (${fmtWeekday(d, locale)})`}
        </button>
      ) : null;

    return (
      <div
        key={t.id}
        className={`trow ${done ? "is-done" : ""} ${selected ? "sel" : ""}`}
        onClick={() => openTask(t.id)}
      >
        <button
          className={`tchk ${pcls} ${done ? "is-done" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            run(() => toggleConsoleComplete(t.id, !done), {
              toast: done ? dict.tReopened : dict.tCompleted,
            });
          }}
          aria-label={dict.stCompleted}
        >
          <Check size={13} />
        </button>
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
                  {repeatShort(t.recurrenceRule, dict)}
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
            openRowMenu(e, t.id);
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
    children,
  }: {
    title: string;
    n: number;
    mod?: string;
    children: ReactNode;
  }) => (
    <>
      <div className={`sech ${mod ? `sech--${mod}` : ""}`}>
        <span className="sech__t">{title}</span>
        <span className="sech__n">{n}</span>
        <span className="sech__line" />
      </div>
      <div className="tlist">{children}</div>
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
    const date = ctx === "today" ? today : ctx === "tomorrow" ? addDays(today, 1) : ctx === "day" ? onDate : "";
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
    });
  };
  const saveInlineAdd = () => {
    if (!add || !add.title.trim()) return;
    const draft = add;
    run(
      () =>
        createConsoleTask({
          title: draft.title,
          desc: draft.desc,
          date: draft.date,
          time: draft.time,
          durationMinutes: draft.dur,
          repeat: draft.repeat,
          priority: draft.prio,
          tags: [],
          projectId: draft.ctx === "project" ? projectId : null,
          sectionId: draft.ctx === "project" ? draft.sectionId : null,
          targetUserIds: draft.targets,
          isDirective: draft.targets.length > 0,
        }),
      { toast: draft.targets.length > 0 ? dict.tInstructed : dict.tCreated, after: () => setAdd(null) },
    );
  };

  const InlineAdd = () => {
    if (!add) return null;
    const schLabel = add.date
      ? `${fmtShort(add.date, locale)}(${fmtWeekday(add.date, locale)})${add.time ? ` ${add.time}` : ""}`
      : dict.iaSchedule;
    const prLabel =
      add.prio === "normal"
        ? dict.iaPriority
        : add.prio === "important"
          ? dict.prioImportant
          : dict.prioUrgent;
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
          <button className="btn btn--pri btn--sm" disabled={!add.title.trim()} onClick={saveInlineAdd}>
            {dict.iaSave}
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
  const openRowMenu = (e: ReactMouseEvent, taskId: string) => {
    e.stopPropagation();
    setPop({ kind: "rowmenu", taskId, ...anchorFrom(e) });
  };

  // ── SCHEDULE / PRIO / SHARE APPLY ─────────────────────────────────────────────────────
  const applySchedule = (p: SchedulePop) => {
    if (p.src === "add") {
      if (add) setAdd({ ...add, date: p.draft.date, time: p.draft.time, dur: p.draft.dur, repeat: p.draft.repeat });
      setPop(null);
      return;
    }
    if (!p.taskId || !p.draft.date) {
      setPop(null);
      return;
    }
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

  // ── OVERDUE BULK ────────────────────────────────────────────────────────────────────
  const rescheduleAllOverdue = () => {
    const ids = overdueList.map((t) => t.id);
    startTransition(async () => {
      for (const id of ids) await moveConsoleToToday(id);
      showToast(dict.tMoved);
      router.refresh();
    });
  };
  const clearOverdue = () => {
    const items = overdueList.slice();
    startTransition(async () => {
      for (const t of items) {
        if (isMine(t, meId)) await deleteConsoleTask(t.id);
        else await leaveConsoleTask(t.id);
      }
      showToast(dict.tDeleted);
      router.refresh();
    });
  };

  // ── VIEWS ────────────────────────────────────────────────────────────────────────────
  const todayView = () => {
    const od = filtered(overdueList).sort((a, b) => dateSort(a, b) || prioSort(a, b));
    const td = filtered(tasks.filter((t) => isTodayTask(t, today) && myOwn(t, meId))).sort(prioSort);
    if (od.length === 0 && td.length === 0 && !add)
      return hasActiveFilter ? (
        <EmptyState icon={<Search size={26} />} t={dict.emFilter} s={dict.emFilterS} />
      ) : (
        <EmptyState icon={<Sun size={26} />} t={dict.emToday} s={dict.emTodayS} ctx="today" />
      );
    return (
      <>
        {od.length > 0 && (
          <>
            <div className="odbanner">
              <div className="odbanner__ic">
                <AlertTriangle size={18} />
              </div>
              <div className="odbanner__b">
                <div className="odbanner__t">{fill(dict.overdueTitle, { n: od.length })}</div>
                <div className="odbanner__s">{dict.overdueSub}</div>
              </div>
              <div className="odbanner__acts">
                <button className="od-b" onClick={rescheduleAllOverdue}>
                  {dict.overdueReschedule}
                </button>
                <button className="od-b od-b--ghost" onClick={clearOverdue}>
                  {dict.overdueClear}
                </button>
              </div>
            </div>
            {Section({ title: dict.secOverdue, n: od.length, mod: "over", children: od.map((t) => renderRow(t)) })}
          </>
        )}
        {Section({
          title: dict.secToday,
          n: td.length,
          children: (
            <>
              {td.map((t) => renderRow(t))}
              {InlineAddSlot({ ctx: "today" })}
            </>
          ),
        })}
      </>
    );
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

  const inboxView = () => {
    const items = filtered(tasks.filter((t) => t.isInbox && isActive(t) && myOwn(t, meId))).sort(
      (a, b) => prioSort(a, b) || dateSort(a, b),
    );
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
            {items.map((t) => renderRow(t, { hideDate: true }))}
            {InlineAddSlot({ ctx: "inbox" })}
          </div>
        )}
      </>
    );
  };

  const sharedView = () => {
    const all = filtered(
      tasks.filter((t) => isActive(t) && isSharedTask(t) && !sentInstr(t, meId) && !recvInstr(t, meId)),
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
    const all = filtered(tasks.filter((t) => sentInstr(t, meId)));
    const note = (
      <div className="sentnote">
        <Megaphone size={15} />
        <span>
          <b>{dict.instrSentNote.split(".")[0]}.</b>
          {dict.instrSentNote.slice(dict.instrSentNote.indexOf(".") + 1)}
        </span>
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
            <button
              className="srow__b2"
              onClick={(e) => {
                e.stopPropagation();
                openTask(t.id);
              }}
              title={dict.instrRemind}
            >
              <Bell size={15} />
            </button>
          </div>
        </div>
      );
    };
    const sec = (title: string, list: TaskRecord[]) =>
      list.length > 0
        ? Section({ title, n: list.length, children: <div className="slist">{list.map(srow)}</div> })
        : null;
    return (
      <>
        {note}
        {sec(dict.instrSecUnconfirmed, openT)}
        {sec(dict.instrSecInProgress, progT)}
        {sec(dict.instrSecCompleted, doneT)}
      </>
    );
  };

  const recvView = () => {
    const all = filtered(tasks.filter((t) => recvInstr(t, meId)));
    const note = (
      <div className="sentnote sentnote--recv">
        <Bell size={15} />
        <span>
          <b>{dict.instrRecvNote.split(".")[0]}.</b>
          {dict.instrRecvNote.slice(dict.instrRecvNote.indexOf(".") + 1)}
        </span>
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
              run(() => toggleConsoleComplete(t.id, !done), { toast: done ? dict.tReopened : dict.tCompleted });
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
        ? Section({ title, n: list.length, mod, children: <div className="slist">{list.map(rrow)}</div> })
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
    const arr = filtered(tasks.filter((t) => t.status === "completed"));
    if (arr.length === 0)
      return <EmptyState icon={<CheckCircle2 size={26} />} t={dict.emCompleted} s={dict.emCompletedS} />;
    const byDay = new Map<string, TaskRecord[]>();
    for (const t of arr) {
      const day = completedDateOf(t) ?? "?";
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(t);
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
                {list.map((t) =>
                  renderRow(t, {
                    hideDate: true,
                    extraByLabel:
                      t.completedByUserId && t.completedByUserId !== meId
                        ? fill(dict.cmpBy, { name: nameOf(t.completedByUserId) })
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
    const tasksOn = (dstr: string) =>
      tasks
        .filter((t) => isActive(t) && myOwn(t, meId) && (t.scheduledDate === dstr || dueDateOf(t) === dstr))
        .sort((a, b) => (a.timeLabel ?? "99").localeCompare(b.timeLabel ?? "99") || prioSort(a, b));
    const monthCount = tasks.filter((t) => {
      const d = dateOf(t);
      return isActive(t) && myOwn(t, meId) && !!d && d.slice(0, 7) === calMonth;
    }).length;
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
    const upcoming = tasks
      .filter((t) => {
        const d = dateOf(t);
        return isActive(t) && myOwn(t, meId) && !!d && d >= today && d.slice(0, 7) === calMonth;
      })
      .sort(dateSort);
    const agByDay = new Map<string, TaskRecord[]>();
    for (const t of upcoming) {
      const d = dateOf(t)!;
      if (!agByDay.has(d)) agByDay.set(d, []);
      agByDay.get(d)!.push(t);
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
            <span className="sech__n">{upcoming.length}</span>
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
    const members = summary.members.map((mem) => mem.userId);
    const pd = projectDetail && projectDetail.id === projectId ? projectDetail : null;
    const sections =
      pd?.sections && pd.sections.length > 0
        ? pd.sections
        : [{ id: "__default", title: dict.dpTask, sortOrder: 0 }];
    const projTasks = filtered(tasks.filter((t) => t.projectId === projectId && isActive(t)));
    const banner = (
      <div className="pjbanner">
        <div className="pjbanner__b">
          <div className="pjbanner__t">{fill(dict.pjBanner, { n: members.length + 1 })}</div>
          <div className="pjbanner__avs">
            <div className="row">
              <Avatars ids={[summary.createdByUserId, ...members]} />
            </div>
            <span className="names">{[summary.createdByUserId, ...members].map((id) => nameOf(id)).join(", ")}</span>
          </div>
        </div>
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
                <b>{sec.title}</b>
                <span className="n">{list.length}</span>
              </div>
              <div className="tlist">{list.map((t) => renderRow(t))}</div>
              {InlineAddSlot({ ctx: "project", sectionId: sec.id, label: fill(dict.pjAddTaskTo, { name: sec.title }) })}
            </div>
          );
        })}
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
        ? listView(
            tasks.filter((t) => isTomorrowTask(t, today) && myOwn(t, meId)),
            dict.vTomorrow,
            "tomorrow",
            <Sunrise size={26} />,
            dict.emTomorrow,
            dict.emTomorrowS,
          )
        : view === "inbox"
          ? inboxView()
          : view === "shared"
            ? sharedView()
            : view === "instr"
              ? instrView()
              : view === "completed"
                ? completedView()
                : calendarView();

  // ── RAIL ─────────────────────────────────────────────────────────────────────────────────
  const rail = () => {
    const scope = tasks.filter((t) => (isTodayTask(t, today) || isOverdue(t, today)) && myOwn(t, meId));
    const open = scope.filter((t) => t.status === "open").length;
    const prog = scope.filter((t) => t.status === "in_progress").length;
    const doneToday = tasks.filter((t) => t.status === "completed" && completedDateOf(t) === today).length;
    const pct = scope.length + doneToday ? Math.round((doneToday / (scope.length + doneToday)) * 100) : 0;
    const qrow = (t: TaskRecord, right: ReactNode) => {
      const cx = ctxItems(t);
      return (
        <div key={t.id} className="qrow" onClick={() => openTask(t.id)}>
          <span
            className={`qrow__ic ${t.priority === "urgent" ? "bg-danger" : t.priority === "important" ? "bg-warn" : "bg-surf"}`}
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
    const inbound = tasks
      .filter((t) => recvInstr(t, meId) && isActive(t))
      .sort((a, b) => prioSort(a, b) || dateSort(a, b))
      .slice(0, 4);
    const up = tasks
      .filter((t) => {
        const d = dateOf(t);
        return isActive(t) && !!d && d > today;
      })
      .sort(dateSort)
      .slice(0, 4);
    const byMember = new Map<string, number>();
    for (const t of tasks.filter((t) => isActive(t) && isSharedTask(t)))
      for (const id of [t.createdByUserId, ...partsOf(t)]) if (id !== meId) byMember.set(id, (byMember.get(id) ?? 0) + 1);
    const mem = Array.from(byMember.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sent = tasks
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
              <span className="card__t">{dict.vToday}</span>
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
                <div className="ministat__k">{dict.cmpToday}</div>
              </div>
            </div>
            <div className="railbar">
              <div className="railbar__k">
                {dict.vToday}
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
              <button className="linkmore" onClick={() => { setProjectId(null); setView("instr"); setInstrTab("recv"); }}>
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
              <button className="linkmore" onClick={() => { setProjectId(null); setView("instr"); setInstrTab("sent"); }}>
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
              <button className="linkmore" onClick={() => { setProjectId(null); setView("calendar"); }}>
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
              <div className="railempty">{dict.calNoMonth}</div>
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
    if (!sel || !noteDraft.trim()) return;
    const id = sel;
    const body = noteDraft;
    run(() => addConsoleNote(id, body), {
      toast: dict.tNoteAdded,
      after: () => {
        setNoteDraft("");
        getConsoleTaskDetail(id).then((res) => {
          if (res.ok) setDetail(res.task);
        });
      },
    });
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
              ["today", dict.vToday, <Sun key="i" size={15} />, todayCount, overdueList.length > 0],
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
              onClick={() => {
                setProjectId(null);
                setView(v);
                setAdd(null);
              }}
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
            <Search size={14} />
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
            {prioFilter
              ? prioFilter === "urgent"
                ? dict.prioUrgent
                : prioFilter === "important"
                  ? dict.prioImportant
                  : dict.prioNormal
              : dict.filterPrio}
          </button>
        </div>
      )}

      {/* BODY */}
      {showRail ? (
        <div className="tgrid">
          <div className="wcol">{body}</div>
          {rail()}
        </div>
      ) : (
        <div className="wcol">{body}</div>
      )}

      {/* DETAIL PANEL */}
      {sel && DetailPanel()}

      {/* POPOVERS / SHEETS / MODALS */}
      {pop && PopoverLayer()}
      {daySheet && DaySheet()}
      {report && ReportModal()}
      {newProj && NewProjectModal()}

      {toast && <AdminToast message={toast.message} onDismiss={dismiss} />}
      {pending && <span className="sr-only" aria-live="polite" />}
    </div>
  );

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // DETAIL PANEL (E)
  // ────────────────────────────────────────────────────────────────────────────────────────────
  function DetailPanel() {
    const loaded = detail && detail.id === sel ? detail : null;
    const t = loaded ?? tasks.find((x) => x.id === sel) ?? null;
    if (!t) return null;
    const done = t.status === "completed";
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
      <aside className="dp on" onClick={(e) => e.stopPropagation()}>
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
              onClick={() => run(() => toggleConsoleComplete(t.id, !done), { toast: done ? dict.tReopened : dict.tCompleted })}
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
                  {instr && (
                    <span className="dbadge dbadge--instr">
                      <Megaphone size={12} />
                      {fill(dict.instructedBy, { name: instr })}
                    </span>
                  )}
                </div>
              )}
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
            </div>
          </div>

          <div className="dp__status">
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
            <button
              className={`done ${done ? "on" : ""}`}
              onClick={() => run(() => setConsoleTaskStatus(t.id, "completed"), { toast: dict.tCompleted })}
            >
              {dict.stCompleted}
            </button>
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
              <button
                className="dp__sharebtn"
                style={{ marginTop: 10 }}
                onClick={(e) => openSchedulePop(e, t)}
              >
                <CalendarDays size={14} />
                {dict.dpScheduleChange}
              </button>
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} className="ph" src={url} alt="" />
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
              {(loaded?.updates ?? [])
                .filter((u) => u.type === "note")
                .map((u) => (
                  <div key={u.id} className="log-note">
                    <Avatar id={u.byUserId ?? ""} />
                    <div className="log-note__b">
                      <div className="log-note__h">
                        <b>{u.byName}</b>
                        <span>{fmtLog(u.createdAt, locale)}</span>
                      </div>
                      <p className="log-note__p">{u.body}</p>
                    </div>
                  </div>
                ))}
              <div className="log-input">
                <input
                  placeholder={dict.dpLogInput}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendNote();
                  }}
                />
                <button className="log-send" onClick={sendNote} disabled={!noteDraft.trim()}>
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="dp__foot">
          {mine ? (
            <>
              <Link className="dp__tb" href={`/mobile/tasks/${t.id}`} title={dict.dpEdit}>
                <Pencil size={16} />
              </Link>
              {!t.projectId && (
                <button className="dp__tb" onClick={(e) => openSharePop(e, t, "share")} title={dict.dpShare}>
                  <Share2 size={16} />
                </button>
              )}
              <span className="sp" />
              <button
                className="btn btn--warn btn--sm"
                onClick={() =>
                  run(() => deleteConsoleTask(t.id), { toast: dict.tDeleted, after: closePanel })
                }
              >
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
                onClick={() => run(() => leaveConsoleTask(t.id), { toast: dict.tDeleted, after: closePanel })}
              >
                {dict.dpLeave}
              </button>
            </>
          )}
        </div>
      </aside>
    );
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────
  // POPOVER LAYER
  // ────────────────────────────────────────────────────────────────────────────────────────────
  function PopoverLayer() {
    if (!pop) return null;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const style: CSSProperties = {
      left: Math.max(8, Math.min(pop.x, vw - 372)),
      top: Math.max(8, Math.min(pop.y, vh - 80)),
    };
    return createPortal(
      <div className="adm" style={{ display: "contents" }}>
        <div className="tpop-scrim" onClick={() => setPop(null)} />
        <div className="tpop-anchor" style={style} onClick={(e) => e.stopPropagation()}>
          {pop.kind === "schedule" && SchedulePopover({ p: pop })}
          {pop.kind === "prio" && PrioMenu({ p: pop })}
          {pop.kind === "share" && SharePopover({ p: pop })}
          {pop.kind === "rowmenu" && RowMenu({ p: pop })}
          {pop.kind === "datefilter" && DateFilterMenu()}
          {pop.kind === "priofilter" && PrioFilterMenu()}
        </div>
      </div>,
      document.body,
    );
  }

  function SchedulePopover({ p }: { p: SchedulePop }) {
    const sel0 = p.draft.date;
    const dow = weekdayIndex(today);
    const nextMon = addDays(today, ((8 - dow) % 7) || 7);
    const nextSat = addDays(today, ((6 - dow + 7) % 7) || 7);
    const set = (patch: Partial<SchedulePop["draft"]>) => setPop({ ...p, draft: { ...p.draft, ...patch } });
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
              </div>
            </div>
          </div>
        </div>
        <div className="sch__foot">
          <button className="btn btn--ghost btn--sm" onClick={() => setPop(null)}>
            {dict.schCancel}
          </button>
          <button className="btn btn--pri btn--sm" onClick={() => applySchedule(p)}>
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
        {it("urgent", dict.prioUrgent, "var(--rose)", true)}
        {it("important", dict.prioImportant, "var(--amber)", true)}
        {it("normal", dict.prioNormal, "var(--faint)", false)}
      </div>
    );
  }

  function SharePopover({ p }: { p: SharePop }) {
    const list = data.users.filter(
      (u) => u.id !== meId && (!p.q || u.name.includes(p.q) || u.role.includes(p.q)),
    );
    const toggle = (uid: string) =>
      setPop({ ...p, sel: p.sel.includes(uid) ? p.sel.filter((x) => x !== uid) : [...p.sel, uid] });
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
              <button key={u.id} className={`urow ${p.sel.includes(u.id) ? "on" : ""}`} onClick={() => toggle(u.id)}>
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
          <button className="btn btn--pri" disabled={p.sel.length === 0} onClick={() => applyShare(p)}>
            {cta}
          </button>
        </div>
      </div>
    );
  }

  function RowMenu({ p }: { p: RowMenuPop }) {
    const t = tasks.find((x) => x.id === p.taskId);
    if (!t) return null;
    const mine = isMine(t, meId);
    const close = () => setPop(null);
    return (
      <div className="pop menu">
        <button className="mitem" onClick={(e) => openSchedulePop(e, t)}>
          <CalendarDays size={15} />
          {dict.mScheduleChange}
        </button>
        <button className="mitem" onClick={(e) => openPrioPop(e, t)}>
          <Flag size={15} />
          {dict.mPriority}
        </button>
        {mine && !t.projectId && (
          <button className="mitem" onClick={(e) => openSharePop(e, t, "share")}>
            <UserPlus size={15} />
            {dict.mShareInstr}
          </button>
        )}
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
        <div className="msep" />
        {mine ? (
          <button
            className="mitem mitem--warn"
            onClick={() => {
              close();
              run(() => deleteConsoleTask(t.id), { toast: dict.tDeleted, after: () => sel === t.id && closePanel() });
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
              run(() => leaveConsoleTask(t.id), { toast: dict.tDeleted, after: () => sel === t.id && closePanel() });
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
        {opt("urgent", dict.prioUrgent, "var(--rose)")}
        {opt("important", dict.prioImportant, "var(--amber)")}
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
    const list = tasks
      .filter((t) => isActive(t) && myOwn(t, meId) && (t.scheduledDate === iso || dueDateOf(t) === iso))
      .sort(prioSort);
    return createPortal(
      <div className="adm" style={{ display: "contents" }}>
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
      </div>,
      document.body,
    );
  }

  // ── REPORT MODAL ─────────────────────────────────────────────────────────────────────────
  function ReportModal() {
    if (!report) return null;
    return createPortal(
      <div className="adm" style={{ display: "contents" }}>
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
                  {report.error === "forbidden" ? dict.errForbidden : dict.emCompleted}
                </div>
              ) : (
                <>
                  <div className="rpt__hint">
                    <Share2 size={14} />
                    {fill(dict.rptHint, {
                      n: tasks.filter((t) => t.status === "completed" && completedDateOf(t) === report.date).length,
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
      </div>,
      document.body,
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
    return createPortal(
      <div className="adm" style={{ display: "contents" }}>
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
      </div>,
      document.body,
    );
  }

  function durText(mins: number): string {
    const opt = DURATION_OPTIONS.find((o) => o.value === mins);
    return opt ? dict[opt.key] : "";
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
