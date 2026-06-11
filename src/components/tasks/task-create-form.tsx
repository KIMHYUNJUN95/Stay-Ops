"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Share2, Users, X } from "lucide-react";
import { createTask } from "@/app/mobile/tasks/new/actions";
import { updateTaskCore } from "@/app/mobile/tasks/[id]/actions";
import {
  AnnouncementImageUploader,
  type AnnouncementImageUploaderHandle,
} from "@/components/announcements/announcement-image-uploader";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import { SharePicker } from "@/components/tasks/share-picker";
import type { Dictionary } from "@/lib/i18n";
import type { ShareableUser } from "@/lib/tasks";
import { cn } from "@/lib/utils";

type Copy = Dictionary["tasks"];

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function nextWeekday(ymd: string): string {
  let cur = addDays(ymd, 1);
  for (let i = 0; i < 7; i++) {
    const [y, m, d] = cur.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow >= 1 && dow <= 5) return cur;
    cur = addDays(cur, 1);
  }
  return cur;
}
function nextWeekend(ymd: string): string {
  let cur = addDays(ymd, 1);
  for (let i = 0; i < 7; i++) {
    const [y, m, d] = cur.split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 6) return cur;
    cur = addDays(cur, 1);
  }
  return cur;
}

const PRIOS = ["normal", "important", "urgent"] as const;
const REPEATS = ["", "daily", "weekly", "monthly", "weekdays", "weekends"] as const;

type TaskInitial = {
  title: string;
  description: string;
  scheduled: string;
  due: string;
  time: string;
  priority: string;
  repeat: string;
  tags: string[];
  imageUrls: string[];
};

export function TaskCreateForm({
  copy,
  defaultDate,
  defaultTitle,
  imgCopy,
  initial,
  mode = "create",
  organizationId,
  serverError,
  taskId,
  users,
}: {
  copy: Copy;
  defaultDate: string | null;
  // Prefilled title carried over from Quick Add (create mode only). Kept separate from
  // `initial` so the Calendar date-prefill (`defaultDate`) keeps working.
  defaultTitle?: string;
  imgCopy: Dictionary["requestImages"];
  initial?: TaskInitial;
  mode?: "create" | "edit";
  organizationId: string;
  serverError: string | null;
  taskId?: string;
  users: ShareableUser[];
}) {
  const isEdit = mode === "edit";
  const formRef = useRef<HTMLFormElement>(null);
  const uploaderRef = useRef<AnnouncementImageUploaderHandle>(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());

  const [scheduled, setScheduled] = useState<string>(initial?.scheduled ?? defaultDate ?? "");
  const [due, setDue] = useState<string>(initial?.due ?? "");
  const [time, setTime] = useState<string>(initial?.time ?? "");
  const [priority, setPriority] = useState<string>(initial?.priority ?? "normal");
  const [repeat, setRepeat] = useState<string>(initial?.repeat ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [existingImgUrls, setExistingImgUrls] = useState<string[]>(initial?.imageUrls ?? []);
  const [shareIds, setShareIds] = useState<string[]>([]);
  const [more, setMore] = useState(isEdit);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(serverError);
  const [isPending, startTransition] = useTransition();

  // `custom` is a recognized stored recurrence bucket but is NOT user-creatable in this slice
  // (no rule builder). It is surfaced read-only only when the task being edited already uses it,
  // so a legacy value is not silently lost and the selection never looks ambiguous.
  const hadCustom = initial?.repeat === "custom";

  const dateChips: { k: string; l: string; v: () => string }[] = [
    { k: "today", l: copy.quickToday, v: () => today },
    { k: "tomorrow", l: copy.quickTomorrow, v: () => addDays(today, 1) },
    { k: "weekday", l: copy.quickWeekday, v: () => nextWeekday(today) },
    { k: "weekend", l: copy.quickWeekend, v: () => nextWeekend(today) },
  ];

  function addTag() {
    const t = tagDraft.trim();
    if (!t || tags.includes(t) || tags.length >= 10) return;
    setTags((p) => [...p, t]);
    setTagDraft("");
  }

  const shareNames = users.filter((u) => shareIds.includes(u.id)).map((u) => u.name);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    const title = String(formData.get("title") ?? "").trim();
    if (!title) {
      setError(copy.errors.missing_title);
      return;
    }
    // A specific time needs a date anchor — block submission instead of silently dropping it.
    if (time && !scheduled && !due) {
      setError(copy.errors.time_needs_date);
      return;
    }
    formData.set("scheduledDate", scheduled);
    formData.set("dueDate", due);
    formData.set("time", time);
    formData.set("priority", priority);
    formData.set("repeat", repeat);
    formData.set("tagsJson", JSON.stringify(tags));
    formData.set("shareJson", JSON.stringify(shareIds));

    if (isEdit) {
      formData.set("taskId", taskId ?? "");
      for (const url of existingImgUrls) formData.append("imageUrls", url);
      const newPhotos = uploaderRef.current?.getItems() ?? [];
      const newSlots = Math.max(0, 5 - existingImgUrls.length);
      if (newPhotos.length > 0 && newSlots > 0) {
        const requestId = crypto.randomUUID();
        try {
          const { imageUrls } = await uploadRequestImages({
            items: newPhotos.slice(0, newSlots),
            organizationId,
            requestId,
            requestType: "task-images",
          });
          for (const url of imageUrls) formData.append("imageUrls", url);
        } catch {
          setError(copy.errors.save_failed);
          return;
        }
      }
      startTransition(async () => {
        await updateTaskCore(formData);
      });
      return;
    }

    const requestId = crypto.randomUUID();
    try {
      const photos = uploaderRef.current?.getItems() ?? [];
      const { imageUrls } = await uploadRequestImages({
        items: photos,
        organizationId,
        requestId,
        requestType: "task-images",
      });
      for (const url of imageUrls) formData.append("imageUrls", url);
    } catch {
      setError(copy.errors.save_failed);
      return;
    }
    startTransition(async () => {
      await createTask(formData);
    });
  }

  const sectionTitle = "mb-2 px-0.5 text-[12.5px] font-extrabold tracking-[-0.01em] text-foreground";
  const chip =
    "rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors";

  return (
    <form className="space-y-5 pb-28" onSubmit={handleSubmit} ref={formRef}>
      <input
        autoComplete="off"
        className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-[17px] font-extrabold text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        defaultValue={initial?.title ?? defaultTitle ?? ""}
        name="title"
        placeholder={copy.titlePlaceholder}
        required
      />
      <textarea
        className="min-h-[64px] w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
        defaultValue={initial?.description ?? ""}
        name="description"
        placeholder={copy.descPlaceholder}
        rows={2}
      />

      {/* Dates */}
      <div>
        <p className={sectionTitle}>{copy.sectionDates}</p>
        <div className="mb-2.5 flex flex-wrap gap-2">
          {dateChips.map((c) => (
            <button
              className={cn(
                chip,
                scheduled === c.v()
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-slate-600",
              )}
              key={c.k}
              onClick={() => setScheduled(c.v())}
              type="button"
            >
              {c.l}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1 rounded-2xl border border-border bg-surface px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {copy.scheduledDate}
            </span>
            <input
              className="bg-transparent text-sm font-bold text-foreground outline-none"
              onChange={(e) => setScheduled(e.target.value)}
              type="date"
              value={scheduled}
            />
          </label>
          <label className="flex flex-col gap-1 rounded-2xl border border-border bg-surface px-3 py-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {copy.dueDate}
            </span>
            <input
              className="bg-transparent text-sm font-bold text-foreground outline-none"
              onChange={(e) => setDue(e.target.value)}
              type="date"
              value={due}
            />
          </label>
        </div>
      </div>

      {/* Share — creation only; sharing on an existing task is managed from the detail view. */}
      {!isEdit ? (
        <div>
          <p className={sectionTitle}>{copy.sectionShare}</p>
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left",
              shareIds.length ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-surface",
            )}
            onClick={() => setPickerOpen(true)}
            type="button"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
              {shareIds.length ? <Users className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {shareNames.length ? shareNames.join(", ") : copy.sharePrivate}
            </span>
            <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {/* More */}
      <button
        className="flex w-full items-center gap-2 px-0.5 text-[13px] font-bold text-primary"
        onClick={() => setMore((v) => !v)}
        type="button"
      >
        {more ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
        {copy.moreToggle}
      </button>

      {more ? (
        <div className="space-y-5">
          <div>
            <p className={sectionTitle}>{copy.sectionTime}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={cn(
                  chip,
                  !time ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-slate-600",
                )}
                onClick={() => setTime("")}
                type="button"
              >
                {copy.allDay}
              </button>
              <input
                aria-label={copy.sectionTime}
                className={cn(
                  "h-10 rounded-xl border px-3 text-sm font-bold outline-none transition-colors focus:border-primary",
                  time ? "border-primary bg-primary/[0.06] text-primary" : "border-border bg-surface text-slate-600",
                )}
                onChange={(e) => setTime(e.target.value)}
                type="time"
                value={time}
              />
              {time ? (
                <button
                  aria-label={copy.clearDate}
                  className="flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-slate-400"
                  onClick={() => setTime("")}
                  type="button"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {["09:00", "12:00", "18:00"].map((tv) => (
                <button
                  className={cn(
                    chip,
                    time === tv ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-slate-600",
                  )}
                  key={tv}
                  onClick={() => setTime(tv)}
                  type="button"
                >
                  {tv}
                </button>
              ))}
            </div>
            {time && !scheduled && !due ? (
              <p className="mt-2 px-0.5 text-[11.5px] font-semibold text-amber-600">
                {copy.timeNeedsDate}
              </p>
            ) : null}
          </div>
          <div>
            <p className={sectionTitle}>{copy.sectionPriority}</p>
            <div className="flex gap-2">
              {PRIOS.map((p) => (
                <button
                  className={cn(
                    "flex-1 rounded-2xl border py-2 text-[13px] font-bold transition-colors",
                    priority === p
                      ? p === "urgent"
                        ? "border-rose-300 bg-rose-50 text-rose-700"
                        : p === "important"
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-slate-600",
                  )}
                  key={p}
                  onClick={() => setPriority(p)}
                  type="button"
                >
                  {p === "normal" ? copy.prioNormal : p === "important" ? copy.prioImportant : copy.prioUrgent}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={sectionTitle}>
              {copy.sectionTags} <span className="text-[11px] font-semibold text-slate-400">{copy.tagsMax}</span>
            </p>
            <div className="mb-2 flex flex-wrap gap-2">
              {tags.map((tg) => (
                <button
                  className="rounded-full bg-primary/[0.06] px-2.5 py-1 text-[12.5px] font-bold text-primary"
                  key={tg}
                  onClick={() => setTags((p) => p.filter((x) => x !== tg))}
                  type="button"
                >
                  #{tg} ✕
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground outline-none focus:border-primary"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={copy.tagPlaceholder}
                value={tagDraft}
              />
              <button
                className="rounded-xl border border-border bg-surface px-4 text-[13px] font-bold text-primary"
                onClick={addTag}
                type="button"
              >
                {copy.addTag}
              </button>
            </div>
          </div>
          <div>
            <p className={sectionTitle}>
              {copy.sectionPhotos} <span className="text-[11px] font-semibold text-slate-400">{copy.photosMax}</span>
            </p>
            <div className="rounded-2xl border border-border bg-slate-50/60 p-3">
              {isEdit && existingImgUrls.length > 0 ? (
                <div className="mb-3 flex items-center gap-3 overflow-x-auto pb-1">
                  {existingImgUrls.map((url, i) => (
                    <div
                      className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/20"
                      key={i}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="" aria-hidden="true" className="size-full object-cover" src={url} />
                      <button
                        aria-label={imgCopy.remove}
                        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white"
                        onClick={() => setExistingImgUrls((p) => p.filter((_, j) => j !== i))}
                        type="button"
                      >
                        <X className="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {existingImgUrls.length < 5 ? (
                <AnnouncementImageUploader
                  addImagesLabel={imgCopy.addPhotos}
                  errorCountExceeded={imgCopy.errorCount}
                  errorSizeExceeded={imgCopy.errorSize}
                  errorTypeInvalid={imgCopy.errorType}
                  imageAttachmentsLabel={imgCopy.attachments}
                  imageLimitLabel={imgCopy.limit}
                  imageRemoveLabel={imgCopy.remove}
                  ref={uploaderRef}
                />
              ) : (
                <p className="text-[12px] font-semibold text-muted-foreground">{copy.photosMax}</p>
              )}
            </div>
          </div>
          <div>
            <p className={sectionTitle}>{copy.sectionRepeat}</p>
            <div className="flex flex-wrap gap-2">
              {REPEATS.map((r) => {
                const label =
                  r === ""
                    ? copy.repeatNone
                    : r === "daily"
                      ? copy.repeatDaily
                      : r === "weekly"
                        ? copy.repeatWeekly
                        : r === "monthly"
                          ? copy.repeatMonthly
                          : r === "weekdays"
                            ? copy.repeatWeekdays
                            : copy.repeatWeekends;
                return (
                  <button
                    className={cn(
                      chip,
                      repeat === r ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-slate-600",
                    )}
                    key={r || "none"}
                    onClick={() => setRepeat(r)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
              {hadCustom ? (
                <button
                  className={cn(
                    chip,
                    repeat === "custom"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-slate-600",
                  )}
                  onClick={() => setRepeat("custom")}
                  type="button"
                >
                  {copy.repeatCustom}
                </button>
              ) : null}
            </div>
            <p className="mt-2 px-0.5 text-[11.5px] font-medium text-muted-foreground">
              {copy.repeatHint}
            </p>
          </div>
        </div>
      ) : null}

      {error ? <p className="px-0.5 text-xs font-semibold text-rose-500">{error}</p> : null}

      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2.5 bg-[linear-gradient(180deg,transparent,var(--surface)_30%)] px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] pt-4">
        <Link
          className="flex h-[52px] flex-1 items-center justify-center rounded-2xl border border-border bg-surface text-[15px] font-bold text-foreground"
          href="/mobile/tasks"
        >
          {copy.backToList}
        </Link>
        <button
          className="flex h-[52px] flex-[2] items-center justify-center rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {copy.save}
        </button>
      </div>

      {pickerOpen ? (
        <SharePicker
          copy={copy}
          initialSelected={shareIds}
          onApply={(ids) => {
            setShareIds(ids);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
          users={users}
        />
      ) : null}
    </form>
  );
}
