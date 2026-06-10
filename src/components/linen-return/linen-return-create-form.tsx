"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Building2,
  ChevronDown,
  Clock,
  Minus,
  Plus,
  Trash2,
  TriangleAlert,
  User,
} from "lucide-react";
import { createLinenReturnRecord } from "@/app/mobile/linen-return/new/actions";
import { updateLinenReturnRecord } from "@/app/mobile/linen-return/record/[id]/actions";
import {
  AnnouncementImageUploader,
  type AnnouncementImageUploaderHandle,
} from "@/components/announcements/announcement-image-uploader";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import type { Dictionary } from "@/lib/i18n";
import type { LinenItemOption } from "@/lib/linen-returns";
import { cn } from "@/lib/utils";

type FormLine = { itemId: string; quantity: number };

type LinenReturnCreateFormProps = {
  building: string;
  buildingLabel: string;
  copy: Dictionary["linenReturn"];
  imgCopy: Dictionary["requestImages"];
  items: LinenItemOption[];
  organizationId: string;
  reporterName: string;
  serverError: string | null;
  /** Edit mode reuses this form; defaults to create. */
  mode?: "create" | "edit";
  recordId?: string;
  initialLines?: FormLine[];
  initialNote?: string;
  submitLabel?: string;
};

export function LinenReturnCreateForm({
  building,
  buildingLabel,
  copy,
  imgCopy,
  items,
  organizationId,
  reporterName,
  serverError,
  mode = "create",
  recordId,
  initialLines,
  initialNote,
  submitLabel,
}: LinenReturnCreateFormProps) {
  const isEdit = mode === "edit";
  const formRef = useRef<HTMLFormElement>(null);
  const uploaderRef = useRef<AnnouncementImageUploaderHandle>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const hasItems = items.length > 0;
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (isEdit && initialLines && initialLines.length > 0) return initialLines;
    return hasItems ? [{ itemId: items[0].id, quantity: 1 }] : [];
  });
  const [openLine, setOpenLine] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(serverError);
  const [isPending, startTransition] = useTransition();

  const itemName = (id: string) => items.find((it) => it.id === id)?.name ?? "";
  const usedIds = lines.map((l) => l.itemId);
  const allUsed = usedIds.length >= items.length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenLine(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

  function addLine() {
    if (allUsed) return;
    const next = items.find((it) => !usedIds.includes(it.id));
    if (!next) return;
    setLines((prev) => [...prev, { itemId: next.id, quantity: 1 }]);
    setError(null);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
    setOpenLine(null);
  }

  function setLineItem(index: number, itemId: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, itemId } : l)));
    setOpenLine(null);
    setError(null);
  }

  function changeQty(index: number, delta: number) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l,
      ),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (lines.length === 0) {
      setError(copy.errorMinItems);
      return;
    }

    const form = formRef.current;
    if (!form) return;
    const formData = new FormData(form);
    formData.set("building", building);
    formData.set(
      "linesJson",
      JSON.stringify(lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity }))),
    );

    if (isEdit) {
      formData.set("recordId", recordId ?? "");
      startTransition(async () => {
        await updateLinenReturnRecord(formData);
      });
      return;
    }

    const requestId = crypto.randomUUID();
    formData.set("id", requestId);

    try {
      const photos = uploaderRef.current?.getItems() ?? [];
      const { imageUrls } = await uploadRequestImages({
        items: photos,
        organizationId,
        requestId,
        requestType: "linen-returns",
      });
      for (const url of imageUrls) {
        formData.append("imageUrls", url);
      }
    } catch {
      setError(copy.errors.save_failed);
      return;
    }

    startTransition(async () => {
      await createLinenReturnRecord(formData);
    });
  }

  return (
    <form className="relative pb-28" onSubmit={handleSubmit} ref={formRef}>
      {/* Locked building */}
      <div className="mb-2.5 flex items-center gap-3 rounded-[20px] border border-primary/20 bg-primary/10 p-3.5">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-surface text-primary">
          <Building2 className="size-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-primary">
            {copy.buildingFieldLabel}
          </span>
          <span className="truncate text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
            {buildingLabel}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-bold text-primary">
          {copy.buildingLockedBadge}
        </span>
      </div>
      <div className="mb-[22px] flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
        <User className="size-[15px] text-slate-400" aria-hidden="true" />
        <span>
          {copy.registrantLabel} <b className="font-bold text-slate-700">{reporterName}</b>
        </span>
        <span className="size-[3px] rounded-full bg-border" />
        <Clock className="size-[15px] text-slate-400" aria-hidden="true" />
        <span>{copy.autoNowLabel}</span>
      </div>

      {/* Items */}
      <div className="mb-[22px]" ref={dropdownRef}>
        <div className="mb-[11px] flex items-center gap-2 px-0.5 text-[12.5px] font-extrabold tracking-[-0.01em] text-foreground">
          <span>{copy.itemsSectionTitle}</span>
          <span className="rounded-full bg-slate-50 px-[7px] py-px font-mono text-[10.5px] font-semibold text-muted-foreground">
            {lines.length}
            {copy.linesUnit}
          </span>
        </div>

        {hasItems ? (
          <>
            <div className="flex flex-col gap-2.5">
              {lines.map((line, index) => {
                const options = items.filter(
                  (it) => it.id === line.itemId || !usedIds.includes(it.id),
                );
                const isOpen = openLine === index;
                return (
                  <div className="flex items-center gap-2.5" key={index}>
                    <div className="relative min-w-0 flex-1">
                      <button
                        className={cn(
                          "flex h-12 w-full items-center justify-between rounded-2xl border bg-surface px-3.5 text-left text-sm font-bold text-foreground outline-none transition-colors",
                          isOpen ? "border-primary ring-2 ring-primary/15" : "border-border",
                        )}
                        onClick={() => setOpenLine(isOpen ? null : index)}
                        type="button"
                      >
                        <span className="truncate">{itemName(line.itemId)}</span>
                        <ChevronDown
                          aria-hidden="true"
                          className="size-4 shrink-0 text-slate-400 transition-transform duration-200"
                          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                        />
                      </button>
                      {isOpen ? (
                        <ul className="absolute left-0 z-50 mt-1.5 max-h-60 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-border bg-surface p-1 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.55)]">
                          {options.map((it) => (
                            <li
                              className={cn(
                                "flex h-10 w-full cursor-pointer items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                                line.itemId === it.id
                                  ? "bg-primary/10 text-primary"
                                  : "text-slate-700 hover:bg-slate-50",
                              )}
                              key={it.id}
                              onClick={() => setLineItem(index, it.id)}
                            >
                              {it.name}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className="flex h-12 shrink-0 items-center gap-0.5 rounded-2xl border border-border bg-slate-50 px-[3px]">
                      <button
                        className="flex size-9 items-center justify-center rounded-[10px] text-slate-700 disabled:text-slate-300"
                        disabled={line.quantity <= 1}
                        onClick={() => changeQty(index, -1)}
                        type="button"
                      >
                        <Minus className="size-[18px]" aria-hidden="true" />
                      </button>
                      <span className="min-w-[26px] text-center font-mono text-base font-bold text-foreground">
                        {line.quantity}
                      </span>
                      <button
                        className="flex size-9 items-center justify-center rounded-[10px] text-slate-700"
                        onClick={() => changeQty(index, 1)}
                        type="button"
                      >
                        <Plus className="size-[18px]" aria-hidden="true" />
                      </button>
                    </div>

                    <button
                      className="flex h-12 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface disabled:hover:text-slate-400"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(index)}
                      type="button"
                    >
                      <Trash2 className="size-[18px]" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              className={cn(
                "mt-[11px] flex h-[46px] w-full items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed text-[13.5px] font-bold transition-colors",
                allUsed
                  ? "cursor-default border-border text-slate-400"
                  : "border-border text-primary hover:border-primary/40 hover:bg-primary/10",
              )}
              disabled={allUsed}
              onClick={addLine}
              type="button"
            >
              <Plus className="size-[18px]" aria-hidden="true" />
              <span>{allUsed ? copy.allItemsAdded : copy.addItem}</span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] font-semibold text-amber-700">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {copy.noItemsAvailable}
          </div>
        )}
      </div>

      {/* Note */}
      <div className="mb-[22px]">
        <div className="mb-[11px] flex items-center gap-2 px-0.5 text-[12.5px] font-extrabold tracking-[-0.01em] text-foreground">
          <span>{copy.memoSectionTitle}</span>
          <span className="text-[11px] font-semibold text-slate-400">{copy.optionalLabel}</span>
        </div>
        <textarea
          className="min-h-[84px] w-full resize-none rounded-2xl border border-border bg-slate-50 px-3.5 py-3 text-sm font-medium leading-6 text-foreground outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:bg-surface"
          defaultValue={initialNote ?? ""}
          name="note"
          placeholder={copy.memoPlaceholder}
          rows={3}
        />
      </div>

      {/* Photos (create only; photo editing is deferred) */}
      {isEdit ? null : (
        <div className="mb-[22px]">
          <div className="mb-[11px] flex items-center gap-2 px-0.5 text-[12.5px] font-extrabold tracking-[-0.01em] text-foreground">
            <span>{copy.photoSectionTitle}</span>
            <span className="text-[11px] font-semibold text-slate-400">{copy.optionalLabel}</span>
          </div>
          <div className="rounded-2xl border border-border bg-slate-50/60 p-3">
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
          </div>
        </div>
      )}

      {error ? (
        <p className="mb-2 flex items-center gap-1.5 px-0.5 text-xs font-semibold text-red-500">
          <TriangleAlert className="size-3.5" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {/* Submit bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 bg-[linear-gradient(180deg,rgba(255,255,255,0),var(--surface)_26%)] px-[18px] pb-[max(18px,env(safe-area-inset-bottom))] pt-3.5">
        <div className="whitespace-nowrap text-[12.5px] font-semibold text-muted-foreground">
          {copy.totalPrefix}{" "}
          <b className="font-mono text-base font-bold text-foreground">{totalQuantity}</b>
          {copy.quantityUnit} · {lines.length}
          {copy.kindsUnit}
        </div>
        <button
          className="flex h-[50px] flex-1 items-center justify-center rounded-2xl bg-primary text-[15px] font-extrabold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
          disabled={isPending || !hasItems || lines.length === 0}
          type="submit"
        >
          {submitLabel ?? copy.submitButton}
        </button>
      </div>
    </form>
  );
}
