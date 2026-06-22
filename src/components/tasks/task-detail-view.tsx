"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Crown,
  Flag,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  Repeat2,
  RotateCcw,
  Send,
  Share2,
  Trash2,
  UserMinus,
} from "lucide-react";
import {
  addTaskUpdate,
  completeTask,
  deleteTask,
  removeTaskParticipant,
  reopenTask,
  shareTaskWithUsers,
} from "@/app/mobile/tasks/[id]/actions";
import {
  AnnouncementImageUploader,
  type AnnouncementImageUploaderHandle,
} from "@/components/announcements/announcement-image-uploader";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import { PhotoGallery } from "@/components/tasks/photo-gallery";
import { LinkedContextBlock } from "@/components/tasks/linked-context-block";
import { SharePicker } from "@/components/tasks/share-picker";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { ShareableUser, TaskDetail } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];

function longDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${value}T00:00:00+09:00`));
}
function longDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
}
// Date-only (Tokyo) rendering of a timestamptz — used for all-day due dates so they never
// render as a misleading "00:00" timed value.
function longDateOnlyIso(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(iso));
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
function prioLabel(p: string, copy: Copy): string {
  return p === "urgent" ? copy.prioUrgent : p === "important" ? copy.prioImportant : copy.prioNormal;
}
export function TaskDetailView({
  buildingLabels,
  canEditCore,
  copy,
  currentUserId,
  imgCopy,
  locale,
  task,
  users,
}: {
  buildingLabels: Record<string, string>;
  canEditCore: boolean;
  copy: Copy;
  currentUserId: string;
  imgCopy: Dictionary["requestImages"];
  locale: Locale;
  task: TaskDetail;
  users: ShareableUser[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{ userId: string; name: string } | null>(null);
  const [updatePhotosOpen, setUpdatePhotosOpen] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [isTogglingStatus, startStatusTransition] = useTransition();
  const updateBodyRef = useRef<HTMLInputElement>(null);
  const updateUploaderRef = useRef<AnnouncementImageUploaderHandle>(null);
  const shareFormRef = useRef<HTMLFormElement>(null);
  const shareInputRef = useRef<HTMLInputElement>(null);

  const done = task.status === "completed";
  const existingParticipantIds = task.participants.map((p) => p.userId);
  const shareableForMore = users.filter((u) => !existingParticipantIds.includes(u.id));

  const meta: { icon: typeof Clock; label: string; value: string }[] = [];
  if (task.scheduledDate) meta.push({ icon: CalendarDays, label: copy.scheduledDate, value: longDate(task.scheduledDate, locale) });
  if (task.dueAt)
    meta.push({
      icon: Flag,
      label: copy.dueDate,
      // All-day due dates are stored at 00:00 Tokyo — render them date-only so they don't
      // contradict the "All day" time row; timed tasks keep date + time.
      value: task.allDay ? longDateOnlyIso(task.dueAt, locale) : longDateTime(task.dueAt, locale),
    });
  meta.push({ icon: Clock, label: copy.sectionTime, value: task.timeLabel || copy.allDay });
  if (task.recurrenceRule) meta.push({ icon: Repeat2, label: copy.sectionRepeat, value: repeatLabel(task.recurrenceRule, copy) });
  meta.push({ icon: Flag, label: copy.sectionPriority, value: prioLabel(task.priority, copy) });

  function submitShare(ids: string[]) {
    setPickerOpen(false);
    if (shareInputRef.current && shareFormRef.current) {
      shareInputRef.current.value = JSON.stringify(ids);
      shareFormRef.current.requestSubmit();
    }
  }

  async function handleUpdateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUpdateError(null);
    const body = updateBodyRef.current?.value.trim() ?? "";
    const photos = updateUploaderRef.current?.getItems() ?? [];
    if (!body && photos.length === 0) return;

    const formData = new FormData();
    formData.set("taskId", task.id);
    formData.set("body", body);

    if (photos.length > 0) {
      try {
        const { imageUrls } = await uploadRequestImages({
          items: photos,
          organizationId: task.organizationId,
          requestId: crypto.randomUUID(),
          requestType: "task-update-images",
        });
        for (const url of imageUrls) formData.append("imageUrls", url);
      } catch {
        // Surface the failure instead of swallowing it: keep the typed text and the
        // selected photos in place so the user can retry. Nothing is submitted.
        setUpdateError(copy.errors.upload_failed);
        return;
      }
    }

    if (updateBodyRef.current) updateBodyRef.current.value = "";
    setUpdatePhotosOpen(false);
    startUpdateTransition(async () => {
      await addTaskUpdate(formData);
    });
  }

  return (
    <div className="pb-10">
      {/* Context bar */}
      <div className="relative flex items-center gap-[11px] px-0.5 pb-3 pt-2">
        <p className="flex-1 text-[19px] font-black tracking-[-0.03em] text-foreground">
          {copy.detailTitle}
        </p>
        {canEditCore ? (
          <div className="relative">
            <button
              aria-label={copy.editTask}
              className="flex size-9 items-center justify-center rounded-full bg-slate-50 text-slate-700"
              onClick={() => setMenuOpen((v) => !v)}
              type="button"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)]">
                <Link
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  href={`/mobile/tasks/${task.id}/edit`}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  {copy.editTask}
                </Link>
                <button
                  className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm font-bold text-red-600 hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  type="button"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {copy.deleteAction}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Header card */}
      <div className="rounded-[22px] border border-border bg-surface p-5 shadow-[0_18px_70px_hsl(214_37%_12%/0.08)]">
        {task.priority !== "normal" ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold",
              task.priority === "urgent" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700",
            )}
          >
            <Flag className="size-3" aria-hidden="true" />
            {prioLabel(task.priority, copy)}
          </span>
        ) : null}
        <h2
          className={cn(
            "mt-2 text-[22px] font-black leading-tight tracking-[-0.02em]",
            done ? "text-slate-400 line-through" : "text-foreground",
          )}
        >
          {task.title}
        </h2>
        {task.description ? (
          <p className="mt-2 text-[14px] leading-6 text-slate-600">{task.description}</p>
        ) : null}
        {task.tags.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {task.tags.map((tg) => (
              <span className="rounded-full bg-primary/[0.06] px-2.5 py-1 text-[12px] font-bold text-primary" key={tg}>
                #{tg}
              </span>
            ))}
          </div>
        ) : null}
        {task.imageUrls.length ? (
          <PhotoGallery
            closeLabel={copy.cancel}
            size="md"
            title={imgCopy.attachments}
            urls={task.imageUrls}
          />
        ) : null}
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          {meta.map((m, i) => (
            <div className="flex items-center gap-2 text-[13.5px]" key={i}>
              <m.icon className="size-4 text-slate-400" aria-hidden="true" />
              <span className="text-muted-foreground">{m.label}</span>
              <b className="ml-auto font-bold text-foreground">{m.value}</b>
            </div>
          ))}
        </div>
        {!canEditCore ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-muted-foreground">
            <Crown className="size-3.5 text-amber-500" aria-hidden="true" />
            {copy.coreEditHint.replace("{name}", task.authorName)}
          </p>
        ) : null}

        {/* Complete / reopen — any participant may toggle their shared task's completion. */}
        <button
          className={cn(
            "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-extrabold transition-colors disabled:opacity-60",
            done
              ? "border border-border bg-surface text-foreground active:bg-slate-50"
              : "bg-primary text-primary-foreground active:opacity-90",
          )}
          disabled={isTogglingStatus}
          onClick={() =>
            startStatusTransition(async () => {
              if (done) await reopenTask(task.id);
              else await completeTask(task.id);
            })
          }
          type="button"
        >
          {done ? (
            <>
              <RotateCcw className="size-4" aria-hidden="true" />
              {copy.reopen}
            </>
          ) : (
            <>
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {copy.complete}
            </>
          )}
        </button>
      </div>

      {/* Linked context */}
      {task.resolvedContext ? (
        <LinkedContextBlock
          buildingLabels={buildingLabels}
          copy={{
            contextGoToReservation: copy.contextGoToReservation,
            contextLinkedSection: copy.contextLinkedSection,
            contextPickerNightsUnit: copy.contextPickerNightsUnit,
            contextPickerRoomSuffix: copy.contextPickerRoomSuffix,
          }}
          context={task.resolvedContext}
        />
      ) : null}

      {/* Participants / share */}
      {task.isShared ? (
        <div className="mt-4 rounded-[22px] border border-border bg-surface p-4">
          <p className="mb-2.5 flex items-center gap-2 px-0.5 text-[12.5px] font-extrabold text-foreground">
            {copy.participants}
            <span className="text-[11px] font-semibold text-slate-400">
              {copy.participantsCommon.replace("{count}", String(task.participants.length))}
            </span>
          </p>
          <div className="flex flex-col gap-2">
            {task.participants.map((p) => (
              <div className="flex items-center gap-2.5" key={p.userId}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-extrabold text-primary">
                  {p.name.slice(0, 1)}
                </span>
                <span className="flex-1 text-sm font-bold text-foreground">
                  {p.name}
                  {p.userId === currentUserId ? copy.meSuffix : ""}
                </span>
                {p.role === "author" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
                    <Crown className="size-3" aria-hidden="true" />
                    {copy.roleAuthor}
                  </span>
                ) : p.isFirstRecipient ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
                    {copy.roleFirstRecipient}
                  </span>
                ) : null}
                {canEditCore && p.role !== "author" && p.userId !== currentUserId ? (
                  <button
                    aria-label={copy.removeParticipant}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                    onClick={() => setConfirmRemove({ userId: p.userId, name: p.name })}
                    type="button"
                  >
                    <UserMinus className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] font-bold text-primary"
              onClick={() => setPickerOpen(true)}
              type="button"
            >
              <Share2 className="size-3.5" aria-hidden="true" />
              {copy.shareMore}
            </button>
            <button
              className="inline-flex items-center rounded-full border border-rose-200 px-3 py-1.5 text-[12.5px] font-bold text-rose-600"
              onClick={() => setConfirmLeave(true)}
              type="button"
            >
              {canEditCore ? copy.leaveWarnAuthor : copy.leaveSelf}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            className="flex w-full items-center gap-2.5 rounded-[22px] border border-border bg-surface px-4 py-3.5 text-left"
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Share2 className="size-4" aria-hidden="true" />
            </span>
            <span className="flex-1 text-sm font-semibold text-muted-foreground">
              {copy.privateShareHint}
            </span>
          </button>
        </div>
      )}

      {/* Update log */}
      <div className="mt-4 rounded-[22px] border border-border bg-surface p-4">
        <p className="mb-3 px-0.5 text-[12.5px] font-extrabold text-foreground">{copy.updateLog}</p>
        {task.updates.length === 0 ? (
          <p className="px-0.5 text-[12.5px] font-medium text-muted-foreground">{copy.noUpdates}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {task.updates.map((u) =>
              u.type === "note" ? (
                <div className="flex gap-2.5" key={u.id}>
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-extrabold text-primary">
                    {u.byName.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <b className="text-[13px] font-bold text-foreground">{u.byName}</b>
                      <span className="text-[11px] text-muted-foreground">{longDateTime(u.createdAt, locale)}</span>
                    </div>
                    {u.body ? <p className="mt-0.5 text-[13.5px] leading-5 text-slate-600">{u.body}</p> : null}
                    {u.imageUrls.length ? (
                      <PhotoGallery
                        closeLabel={copy.cancel}
                        size="sm"
                        title={imgCopy.attachments}
                        urls={u.imageUrls}
                      />
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 pl-1 text-[11.5px] font-medium text-muted-foreground" key={u.id}>
                  <span className="size-1.5 rounded-full bg-slate-300" />
                  {systemLabel(u.type, u.body, copy)} · {longDateTime(u.createdAt, locale)}
                </div>
              ),
            )}
          </div>
        )}
        <div className="mt-3">
          {updatePhotosOpen ? (
            <div className="mb-2 rounded-xl border border-border bg-slate-50/60 p-2">
              <AnnouncementImageUploader
                addImagesLabel={imgCopy.addPhotos}
                errorCountExceeded={imgCopy.errorCount}
                errorSizeExceeded={imgCopy.errorSize}
                errorTypeInvalid={imgCopy.errorType}
                imageAttachmentsLabel={imgCopy.attachments}
                imageLimitLabel={imgCopy.limit}
                imageRemoveLabel={imgCopy.remove}
                ref={updateUploaderRef}
              />
            </div>
          ) : null}
          <form className="flex items-center gap-2" onSubmit={handleUpdateSubmit}>
            <button
              aria-label={copy.sectionPhotos}
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-2xl border transition-colors",
                updatePhotosOpen
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-slate-400",
              )}
              onClick={() => setUpdatePhotosOpen((v) => !v)}
              type="button"
            >
              <ImageIcon className="size-4" aria-hidden="true" />
            </button>
            <input
              ref={updateBodyRef}
              enterKeyHint="send"
              className="h-11 flex-1 rounded-2xl border border-border bg-background/60 px-3.5 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
              placeholder={copy.updatePlaceholder}
            />
            <button
              aria-label={copy.updateLog}
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-60"
              disabled={isUpdating}
              type="submit"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </form>
          {updateError ? (
            <p className="mt-1.5 px-0.5 text-xs font-semibold text-rose-500" role="alert">
              {updateError}
            </p>
          ) : null}
        </div>
      </div>

      {/* Hidden share-more form (submitted by the picker) */}
      <form action={shareTaskWithUsers} className="hidden" ref={shareFormRef}>
        <input name="taskId" type="hidden" value={task.id} />
        <input name="shareJson" ref={shareInputRef} type="hidden" defaultValue="[]" />
      </form>

      {pickerOpen ? (
        <SharePicker
          copy={copy}
          initialSelected={[]}
          onApply={submitShare}
          onClose={() => setPickerOpen(false)}
          users={shareableForMore}
        />
      ) : null}

      {confirmDelete ? (
        <BottomSheet
          ariaLabel={copy.deleteConfirmTitle}
          header={
            <div className="text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-red-50 text-red-500">
                <Trash2 className="size-6" aria-hidden="true" />
              </span>
              <p className="text-[17px] font-black text-foreground">{copy.deleteConfirmTitle}</p>
              <p className="mt-2 text-sm text-muted-foreground">{copy.deleteConfirmBody}</p>
            </div>
          }
          onClose={() => setConfirmDelete(false)}
        >
          {({ close }) => (
            <div className="mt-6 flex gap-2.5">
              <button
                className="h-12 flex-1 rounded-2xl border border-border bg-surface text-sm font-bold text-slate-700"
                onClick={close}
                type="button"
              >
                {copy.cancel}
              </button>
              <form action={deleteTask} className="flex-1">
                <input name="taskId" type="hidden" value={task.id} />
                <button className="h-12 w-full rounded-2xl bg-red-500 text-sm font-extrabold text-white" type="submit">
                  {copy.confirm}
                </button>
              </form>
            </div>
          )}
        </BottomSheet>
      ) : null}

      {confirmLeave ? (
        <BottomSheet
          ariaLabel={canEditCore ? copy.leaveAuthorConfirmTitle : copy.leaveConfirmTitle}
          header={
            <div className="text-center">
              <span
                className={cn(
                  "mx-auto mb-4 flex size-14 items-center justify-center rounded-full",
                  canEditCore ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500",
                )}
              >
                <UserMinus className="size-6" aria-hidden="true" />
              </span>
              <p className="text-[17px] font-black text-foreground">
                {canEditCore ? copy.leaveAuthorConfirmTitle : copy.leaveConfirmTitle}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {canEditCore ? copy.leaveAuthorConfirmBody : copy.leaveConfirmBody}
              </p>
            </div>
          }
          onClose={() => setConfirmLeave(false)}
        >
          {({ close }) => (
            <div className="mt-6 flex gap-2.5">
              <button
                className="h-12 flex-1 rounded-2xl border border-border bg-surface text-sm font-bold text-slate-700"
                onClick={close}
                type="button"
              >
                {copy.cancel}
              </button>
              <form action={removeTaskParticipant} className="flex-1">
                <input name="taskId" type="hidden" value={task.id} />
                <input name="userId" type="hidden" value={currentUserId} />
                <button
                  className={cn(
                    "h-12 w-full rounded-2xl text-sm font-extrabold text-white",
                    canEditCore ? "bg-red-500" : "bg-rose-400",
                  )}
                  type="submit"
                >
                  {copy.confirm}
                </button>
              </form>
            </div>
          )}
        </BottomSheet>
      ) : null}

      {confirmRemove ? (
        <BottomSheet
          ariaLabel={copy.removeParticipantConfirmTitle.replace("{name}", confirmRemove.name)}
          header={
            <div className="text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <UserMinus className="size-6" aria-hidden="true" />
              </span>
              <p className="text-[17px] font-black text-foreground">
                {copy.removeParticipantConfirmTitle.replace("{name}", confirmRemove.name)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {copy.removeParticipantConfirmBody.replace("{name}", confirmRemove.name)}
              </p>
            </div>
          }
          onClose={() => setConfirmRemove(null)}
        >
          {({ close }) => (
            <div className="mt-6 flex gap-2.5">
              <button
                className="h-12 flex-1 rounded-2xl border border-border bg-surface text-sm font-bold text-slate-700"
                onClick={close}
                type="button"
              >
                {copy.cancel}
              </button>
              <form action={removeTaskParticipant} className="flex-1">
                <input name="taskId" type="hidden" value={task.id} />
                <input name="userId" type="hidden" value={confirmRemove.userId} />
                <button
                  className="h-12 w-full rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground"
                  type="submit"
                >
                  {copy.confirm}
                </button>
              </form>
            </div>
          )}
        </BottomSheet>
      ) : null}
    </div>
  );
}

function systemLabel(type: string, body: string | null, copy: Copy): string {
  switch (type) {
    case "system_shared":
      return copy.viewSent;
    case "system_edited":
      return copy.editTask;
    case "completed":
      return copy.statusCompleted;
    case "reopened":
      return copy.reopen;
    case "status_changed":
      return body === "in_progress" ? copy.statusInProgress : copy.statusOpen;
    default:
      return type;
  }
}
