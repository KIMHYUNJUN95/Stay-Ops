"use client";

import { useCallback, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  LogOut,
  MoreVertical,
  Plus,
  Share2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { completeTask, reopenTask } from "@/app/mobile/tasks/[id]/actions";
import {
  addProjectSection,
  deleteProject,
  deleteProjectSection,
  inviteProjectMembers,
  leaveProject,
  removeProjectMember,
  renameProjectSection,
  reorderProjectSections,
} from "@/app/mobile/tasks/projects/actions";
import { ReorderableSectionList } from "@/components/tasks/reorderable-section-list";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";
import { SharePicker } from "@/components/tasks/share-picker";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { ProjectDetailData, ProjectSectionInfo } from "@/lib/projects";
import type { ShareableUser } from "@/lib/tasks";
import type { TaskRecord } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];

function anchorChip(task: TaskRecord, locale: Locale): string | null {
  const iso = task.dueAt ?? (task.scheduledDate ? `${task.scheduledDate}T00:00:00+09:00` : null);
  if (!iso) return null;
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}

function TaskRow({
  task,
  locale,
  onToggle,
}: {
  task: TaskRecord;
  locale: Locale;
  onToggle: (task: TaskRecord) => void;
}) {
  const router = useRouter();
  const done = task.status === "completed";
  const due = anchorChip(task, locale);
  const important = task.priority === "important" || task.priority === "urgent";
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-border bg-surface px-3.5 py-3">
      <button
        aria-label="toggle"
        className={cn(
          "mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : important
              ? "border-amber-400"
              : "border-slate-200",
        )}
        onClick={() => onToggle(task)}
        type="button"
      >
        {done ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
      </button>
      <button
        className="min-w-0 flex-1 text-left"
        onClick={() => router.push(`/mobile/tasks/${task.id}`)}
        type="button"
      >
        <div
          className={cn(
            "text-[14px] font-bold leading-snug tracking-[-0.01em]",
            done ? "text-muted-foreground line-through" : "text-foreground",
          )}
        >
          {task.title}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          {due ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-[3px] text-[10.5px] font-bold text-amber-700">
              <CalendarDays className="size-3" aria-hidden="true" />
              {due}
            </span>
          ) : null}
          <span className="ml-auto inline-flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-600">
            {task.authorName.slice(0, 1)}
          </span>
        </div>
      </button>
    </div>
  );
}

export function ProjectDetailView({
  copy,
  locale,
  project,
  shareableUsers,
}: {
  copy: Copy;
  locale: Locale;
  project: ProjectDetailData;
  shareableUsers: ShareableUser[];
}) {
  const p = copy.projects;
  const isOwner = project.viewerIsOwner;

  const [, startToggle] = useTransition();
  const onToggle = (task: TaskRecord) => {
    startToggle(async () => {
      if (task.status === "completed") await reopenTask(task.id);
      else await completeTask(task.id);
    });
  };

  const [, startReorder] = useTransition();
  const persistSectionOrder = (orderedIds: string[]) => {
    startReorder(async () => {
      await reorderProjectSections(project.id, orderedIds);
    });
  };

  // Invite members — called directly with a constructed FormData (no hidden form), so the selected
  // ids are guaranteed to reach the server action (the old hidden-input + requestSubmit raced state).
  const [, startInvite] = useTransition();
  const inviteMembers = (ids: string[]) => {
    if (ids.length === 0) return;
    startInvite(async () => {
      const fd = new FormData();
      fd.set("projectId", project.id);
      fd.set("shareJson", JSON.stringify(ids));
      await inviteProjectMembers(fd);
    });
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteSection, setDeleteSection] = useState<ProjectSectionInfo | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectSectionInfo | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  // Members sheet — mount/shown split so it slides in/out (and supports drag-to-dismiss).
  const [membersOpen, setMembersOpen] = useState(false); // present in the DOM
  const [membersShown, setMembersShown] = useState(false); // drives the slide in/out
  const openMembers = useCallback(() => {
    setMembersOpen(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setMembersShown(true)));
  }, []);
  const closeMembers = useCallback(() => {
    setMembersShown(false);
    setTimeout(() => setMembersOpen(false), 320);
  }, []);
  const membersDrag = useSheetDragDismiss({ shown: membersShown, onDismiss: closeMembers });

  const unsectioned = project.tasks.filter((t) => !t.sectionId);
  const tasksOf = (sectionId: string) => project.tasks.filter((t) => t.sectionId === sectionId);

  const taskCountOf = (key: string) =>
    key === "none" ? unsectioned.length : tasksOf(key).length;

  // "작업 추가" opens the full create form (so a project task can link a room/reservation, set a
  // date, priority, etc.), pre-bound to this project and section; createTask returns here on save.
  const addTaskLink = (sectionId: string | null) => (
    <Link
      className="mb-0.5 mt-2 inline-flex items-center gap-1.5 px-1 py-2 text-[13px] font-bold text-primary"
      href={`/mobile/tasks/new?project=${project.id}${sectionId ? `&section=${sectionId}` : ""}`}
    >
      <Plus className="size-4" aria-hidden="true" />
      {p.addTask}
    </Link>
  );

  return (
    <div className="relative min-h-[60vh] pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 py-1.5 pb-4">
        <span className="min-w-0 flex-1 truncate text-[19px] font-black tracking-[-0.03em] text-foreground">
          {project.title}
        </span>
        <button
          aria-label={p.memberManage}
          className="flex shrink-0 items-center transition-opacity active:opacity-70"
          onClick={openMembers}
          type="button"
        >
          {project.members.slice(0, 3).map((m, i) => (
            <span
              className={cn(
                "inline-flex size-[30px] items-center justify-center rounded-full border-2 border-background text-[11px] font-extrabold",
                i === 0 ? "ml-0" : "-ml-2",
                m.role === "owner" ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600",
              )}
              key={m.userId}
            >
              {m.name.slice(0, 1)}
            </span>
          ))}
          {project.members.length > 3 ? (
            <span className="-ml-2 inline-flex size-[30px] items-center justify-center rounded-full border-2 border-background bg-slate-100 text-[11px] font-extrabold text-muted-foreground">
              +{project.members.length - 3}
            </span>
          ) : null}
        </button>
        {isOwner ? (
          <button
            aria-label={p.inviteLabel}
            className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            <Share2 className="size-[17px]" aria-hidden="true" />
          </button>
        ) : null}
        <div className="relative shrink-0">
          <button
            aria-label="more"
            className="flex size-[34px] items-center justify-center rounded-full bg-slate-100 text-slate-600"
            onClick={() => setMenuOpen((v) => !v)}
            type="button"
          >
            <MoreVertical className="size-[17px]" aria-hidden="true" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-[40]" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-[40px] z-[41] w-44 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-[0_18px_44px_-16px_rgba(20,16,10,0.4)]">
                {isOwner ? (
                  <>
                    <button
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] font-bold text-foreground active:bg-slate-50"
                      onClick={() => {
                        setMenuOpen(false);
                        openMembers();
                      }}
                      type="button"
                    >
                      <UserPlus className="size-[16px] text-muted-foreground" aria-hidden="true" />
                      {p.memberManage}
                    </button>
                    <button
                      className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] font-bold text-rose-600 active:bg-rose-50"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteProjectOpen(true);
                      }}
                      type="button"
                    >
                      <Trash2 className="size-[16px]" aria-hidden="true" />
                      {p.deleteProject}
                    </button>
                  </>
                ) : (
                  <button
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] font-bold text-rose-600 active:bg-rose-50"
                    onClick={() => {
                      setMenuOpen(false);
                      setLeaveOpen(true);
                    }}
                    type="button"
                  >
                    <LogOut className="size-[16px]" aria-hidden="true" />
                    {p.leave}
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Unsectioned (pinned top) */}
      <div className="mb-2">
        <div className="flex items-center gap-1.5 px-0.5 pb-2 pt-3">
          <span className="whitespace-nowrap text-[13.5px] font-extrabold tracking-[-0.01em] text-foreground">
            {p.sectionNone}
          </span>
          <span className="text-[11.5px] font-bold text-muted-foreground/70">{taskCountOf("none")}</span>
        </div>
        <div className="flex flex-col gap-2">
          {unsectioned.map((t) => (
            <TaskRow key={t.id} locale={locale} onToggle={onToggle} task={t} />
          ))}
        </div>
        {addTaskLink(null)}
      </div>

      {/* Named sections — drag-reorderable by the owner (grip handle). */}
      {project.sections.length > 0 ? (
        <ReorderableSectionList
          countOf={(id) => taskCountOf(id)}
          deleteLabel={copy.deleteAction}
          disabled={!isOwner}
          editLabel={copy.actionEdit}
          isOwner={isOwner}
          onDelete={(s) => setDeleteSection(s)}
          onPersist={persistSectionOrder}
          onRename={(s) => setRenameTarget(s)}
          renderBody={(section) => (
            <>
              <div className="flex flex-col gap-2">
                {tasksOf(section.id).map((t) => (
                  <TaskRow key={t.id} locale={locale} onToggle={onToggle} task={t} />
                ))}
              </div>
              {addTaskLink(section.id)}
            </>
          )}
          reorderHandleLabel={copy.reorderHandle}
          sections={project.sections}
        />
      ) : null}

      {/* Add section (Owner only) */}
      {isOwner ? (
        addingSection ? (
          <form action={addProjectSection} className="mt-4 flex items-center gap-2">
            <input name="projectId" type="hidden" value={project.id} />
            <input
              autoFocus
              className="h-11 flex-1 rounded-[14px] border border-border bg-background px-3.5 text-[13.5px] font-medium text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              name="title"
              placeholder={p.sectionNamePlaceholder}
              required
            />
            <button
              className="h-11 shrink-0 rounded-[14px] bg-primary px-4 text-[13px] font-extrabold text-primary-foreground"
              type="submit"
            >
              {p.add}
            </button>
            <button
              aria-label={copy.cancel}
              className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-slate-100 text-slate-500"
              onClick={() => setAddingSection(false)}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <button
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.4px] border-dashed border-border bg-transparent py-3.5 text-[13.5px] font-bold text-muted-foreground"
            onClick={() => setAddingSection(true)}
            type="button"
          >
            <Plus className="size-[17px]" aria-hidden="true" />
            {p.addSection}
          </button>
        )
      ) : null}


      {/* Section delete confirm */}
      {deleteSection ? (
        <ConfirmModal
          body={p.deleteSectionBody
            .replace("{name}", deleteSection.title)
            .replace("{count}", String(tasksOf(deleteSection.id).length))}
          cancelLabel={copy.cancel}
          confirmLabel={copy.deleteAction}
          icon={<Trash2 className="size-[26px]" aria-hidden="true" />}
          onClose={() => setDeleteSection(null)}
          title={p.deleteSectionTitle}
        >
          <form action={deleteProjectSection} className="flex-1">
            <input name="projectId" type="hidden" value={project.id} />
            <input name="sectionId" type="hidden" value={deleteSection.id} />
            <button
              className="h-11 w-full rounded-xl bg-rose-600 text-[14px] font-extrabold text-white"
              type="submit"
            >
              {copy.deleteAction}
            </button>
          </form>
        </ConfirmModal>
      ) : null}

      {/* Rename section */}
      {renameTarget ? (
        createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(20,16,10,0.55)] px-7"
          onClick={() => setRenameTarget(null)}
          style={{ animation: "modal-overlay-in 180ms ease-out both" }}
        >
          <div
            className="w-full max-w-[340px] rounded-[22px] bg-surface p-5 shadow-[0_30px_60px_-20px_rgba(16,22,30,0.5)]"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "modal-card-in 240ms cubic-bezier(0.34,1.26,0.64,1) both" }}
          >
            <p className="mb-3 text-[16px] font-black text-foreground">{p.renameSectionTitle}</p>
            <form action={renameProjectSection}>
              <input name="projectId" type="hidden" value={project.id} />
              <input name="sectionId" type="hidden" value={renameTarget.id} />
              <input
                autoFocus
                className="h-12 w-full rounded-xl border border-border bg-background px-3.5 text-[15px] font-bold text-foreground outline-none focus:border-primary"
                defaultValue={renameTarget.title}
                name="title"
                required
              />
              <div className="mt-4 flex gap-2.5">
                <button
                  className="h-11 flex-1 rounded-xl bg-slate-100 text-[14px] font-extrabold text-slate-700"
                  onClick={() => setRenameTarget(null)}
                  type="button"
                >
                  {copy.cancel}
                </button>
                <button
                  className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-extrabold text-primary-foreground"
                  type="submit"
                >
                  {copy.save}
                </button>
              </div>
            </form>
          </div>
        </div>,
          document.body,
        )
      ) : null}

      {/* Delete project confirm */}
      {deleteProjectOpen ? (
        <ConfirmModal
          body={p.deleteProjectBody}
          cancelLabel={copy.cancel}
          confirmLabel={p.deleteProject}
          icon={<Trash2 className="size-[26px]" aria-hidden="true" />}
          onClose={() => setDeleteProjectOpen(false)}
          title={p.deleteProjectTitle}
        >
          <form action={deleteProject} className="flex-1">
            <input name="projectId" type="hidden" value={project.id} />
            <button
              className="h-11 w-full rounded-xl bg-rose-600 text-[14px] font-extrabold text-white"
              type="submit"
            >
              {p.deleteProject}
            </button>
          </form>
        </ConfirmModal>
      ) : null}

      {/* Leave project confirm */}
      {leaveOpen ? (
        <ConfirmModal
          body={p.leaveConfirmBody}
          cancelLabel={copy.cancel}
          confirmLabel={p.leave}
          icon={<LogOut className="size-[26px]" aria-hidden="true" />}
          onClose={() => setLeaveOpen(false)}
          title={p.leaveConfirmTitle}
        >
          <form action={leaveProject} className="flex-1">
            <input name="projectId" type="hidden" value={project.id} />
            <button
              className="h-11 w-full rounded-xl bg-rose-600 text-[14px] font-extrabold text-white"
              type="submit"
            >
              {p.leave}
            </button>
          </form>
        </ConfirmModal>
      ) : null}

      {/* Members management (owner) */}
      {membersOpen ? (
        createPortal(
        <div
          className={cn(
            "fixed inset-0 z-[90] flex items-end justify-center bg-[rgba(20,16,10,0.5)] transition-opacity duration-300 motion-reduce:transition-none",
            membersShown ? "opacity-100" : "opacity-0",
          )}
          onClick={closeMembers}
          style={membersDrag.scrimStyle}
        >
          <div
            className={cn(
              "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3",
              "transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
              membersShown ? "translate-y-0" : "translate-y-full",
            )}
            data-sheet
            onClick={(e) => e.stopPropagation()}
            style={membersDrag.sheetStyle}
          >
            <div
              className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-slate-200"
              {...membersDrag.handleProps}
            />
            <div className="mb-3 flex items-center justify-between" {...membersDrag.handleProps}>
              <p className="text-[16px] font-black text-foreground">
                {p.memberManage}
                <span className="ml-1.5 text-[13px] font-bold text-muted-foreground">
                  {project.members.length}
                </span>
              </p>
              {isOwner ? (
                <button
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary/[0.08] px-3 py-1.5 text-[12.5px] font-bold text-primary"
                  onClick={() => {
                    closeMembers();
                    setPickerOpen(true);
                  }}
                  type="button"
                >
                  <UserPlus className="size-3.5" aria-hidden="true" />
                  {p.inviteLabel}
                </button>
              ) : null}
            </div>
            <div className="flex min-h-[28vh] max-h-[60vh] flex-col gap-1 overflow-y-auto pb-2">
              {project.members.map((m) => (
                <div className="flex items-center gap-3 rounded-2xl px-2 py-2" key={m.userId}>
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                    {m.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-foreground">{m.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.role === "owner" ? p.roleOwner : p.roleMember}
                    </span>
                  </span>
                  {isOwner && m.role !== "owner" && m.userId !== project.createdByUserId ? (
                    <form action={removeProjectMember}>
                      <input name="projectId" type="hidden" value={project.id} />
                      <input name="userId" type="hidden" value={m.userId} />
                      <button
                        aria-label={copy.deleteAction}
                        className="flex size-8 items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        type="submit"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>,
          document.body,
        )
      ) : null}

      {pickerOpen ? (
        <SharePicker
          copy={copy}
          initialSelected={[]}
          onApply={(ids) => {
            setPickerOpen(false);
            inviteMembers(ids);
          }}
          onClose={() => setPickerOpen(false)}
          users={shareableUsers.filter((u) => !project.members.some((m) => m.userId === u.id))}
        />
      ) : null}
    </div>
  );
}

function ConfirmModal({
  body,
  cancelLabel,
  children,
  icon,
  onClose,
  title,
}: {
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  children: React.ReactNode;
  icon: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  // Portal to <body> so the modal escapes the shell's transformed scroll container and dims the full
  // viewport (top chrome + bottom tab bar included). Only rendered on interaction, so no SSR mismatch.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(20,16,10,0.55)] px-7"
      onClick={onClose}
      style={{ animation: "modal-overlay-in 180ms ease-out both" }}
    >
      <div
        className="w-full max-w-[340px] rounded-[22px] bg-surface p-6 text-center shadow-[0_30px_60px_-20px_rgba(16,22,30,0.5)]"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "modal-card-in 240ms cubic-bezier(0.34,1.26,0.64,1) both" }}
      >
        <span className="mx-auto mb-4 flex size-[52px] items-center justify-center rounded-[15px] bg-rose-50 text-rose-600">
          {icon}
        </span>
        <h3 className="mb-2 text-[18px] font-black tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="mb-[22px] text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
        <div className="flex gap-2.5">
          <button
            className="h-11 flex-1 rounded-xl bg-slate-100 text-[14px] font-extrabold text-slate-700"
            onClick={onClose}
            type="button"
          >
            {cancelLabel}
          </button>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
