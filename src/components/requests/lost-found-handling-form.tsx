"use client";

// 모바일 분실물 상세 — 현장 처리 블록 (상태 변경 + 처리 메모 + 증빙 사진).
// 2026-07-15 신설. 그동안 모바일 상세는 상태를 "보여주기만" 했다(읽기 전용 진행바). 수리·점검의
// 현장 처리(MaintenanceHandlingForm)와 동일한 구조·매커니즘이다.
//
// 반환완료(returned)는 "손님에게 전달을 마친" 되돌릴 수 없는 종결이라, 저장 전에 canonical
// BottomSheet로 한 번 더 확인한다(오조작 방지). 그 외 상태 변경은 확인 없이 바로 저장한다.
// part_time_staff는 렌더 자체를 안 하고, 서버 액션과 RLS가 최종 게이트다.
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, TriangleAlert } from "lucide-react";
import {
  AnnouncementImageUploader,
  type AnnouncementImageUploaderHandle,
} from "@/components/announcements/announcement-image-uploader";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { Button } from "@/components/ui/button";
import {
  updateLostItemHandling,
  type LostItemHandlingResult,
} from "@/app/mobile/requests/lost-found/actions";
import type { Dictionary } from "@/lib/i18n";
import {
  lostItemStatuses,
  LOST_FOUND_HANDLING_IMAGE_LIMIT,
  type LostItemStatus,
} from "@/lib/lost-found-constants";
import { cn } from "@/lib/utils";

type LostFoundHandlingFormProps = {
  canHandle: boolean;
  copy: Dictionary["lostFound"];
  imgCopy: Dictionary["requestImages"];
  handlerName: string;
  initialMemo: string;
  initialStatus: LostItemStatus;
  itemName: string;
  itemId: string;
  organizationId: string;
};

const CARD =
  "rounded-[24px] border border-slate-200/80 bg-surface p-4 shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)]";

function statusChipClass(status: LostItemStatus, active: boolean) {
  if (!active) return "border-slate-200 bg-white text-slate-600";
  switch (status) {
    case "registered":
      return "border-blue-300 bg-blue-50 text-blue-700";
    case "stored":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "disposal_scheduled":
      return "border-orange-300 bg-orange-50 text-orange-700";
    case "disposed":
      return "border-slate-400 bg-slate-100 text-slate-700";
    case "returned":
      // 반환완료 = 브랜드 네이비 (green/teal 금지 — 폐기 경로와 구분).
      return "border-[#3949ab] bg-[#3949ab] text-white";
  }
}

export function LostFoundHandlingForm({
  canHandle,
  copy,
  imgCopy,
  handlerName,
  initialMemo,
  initialStatus,
  itemName,
  itemId,
  organizationId,
}: LostFoundHandlingFormProps) {
  const t = copy.handling;
  const router = useRouter();
  const [status, setStatus] = useState<LostItemStatus>(initialStatus);
  const [memo, setMemo] = useState(initialMemo);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const uploaderRef = useRef<AnnouncementImageUploaderHandle | null>(null);

  if (!canHandle) {
    return (
      <section className={CARD}>
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          {t.readOnlySub}
        </div>
      </section>
    );
  }

  // 반환완료로 새로 넘어가는 경우만 종결 확인 시트를 띄운다. 그 외에는 바로 저장.
  const needsReturnConfirm = status === "returned" && initialStatus !== "returned";

  async function performSave() {
    setError(null);
    setSaved(false);
    let handlingImageUrls: string[] = [];
    try {
      const items = uploaderRef.current?.getItems() ?? [];
      if (items.length > 0) {
        const uploaded = await uploadRequestImages({
          items,
          organizationId,
          requestId: itemId,
          requestType: "lost-found-handling",
        });
        handlingImageUrls = uploaded.imageUrls;
      }
    } catch {
      setError(copy.errors.save_failed);
      return;
    }

    startTransition(async () => {
      const result: LostItemHandlingResult = await updateLostItemHandling({
        itemId,
        status,
        memo,
        handlingImageUrls,
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
        return;
      }
      setError(
        result.error === "forbidden"
          ? copy.errors.forbidden
          : result.error === "not_found"
            ? copy.errors.not_found
            : copy.errors.status_update_failed,
      );
    });
  }

  function handleSaveClick() {
    if (needsReturnConfirm) {
      setConfirmOpen(true);
      return;
    }
    void performSave();
  }

  return (
    <>
      <section className={cn(CARD, "flex flex-col gap-4")}>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-black text-foreground">{t.title}</h2>
          <p className="text-xs font-semibold leading-5 text-muted-foreground">{t.hint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{t.statusLabel}</span>
          <div className="flex flex-wrap gap-2">
            {lostItemStatuses.map((value) => (
              <button
                aria-pressed={status === value}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-bold transition-colors active:scale-95",
                  statusChipClass(value, status === value),
                )}
                key={value}
                onClick={() => setStatus(value)}
                type="button"
              >
                {copy.statusLabels[value]}
              </button>
            ))}
          </div>
          {needsReturnConfirm ? (
            <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-xs font-bold leading-5 text-indigo-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t.returnWarn}</span>
            </div>
          ) : null}
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{t.memoLabel}</span>
          <textarea
            className="min-h-24 w-full resize-none rounded-2xl border border-slate-200/80 bg-white/82 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-200/60"
            onChange={(e) => setMemo(e.target.value)}
            placeholder={t.memoPlaceholder}
            rows={3}
            value={memo}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {t.photosLabel} · <span className="text-muted-foreground/70">{t.photosHint}</span>
          </span>
          <AnnouncementImageUploader
            addImagesLabel={imgCopy.addPhotos}
            errorCountExceeded={imgCopy.errorCount}
            errorSizeExceeded={imgCopy.errorSize}
            errorTypeInvalid={imgCopy.errorType}
            imageAttachmentsLabel={imgCopy.attachments}
            imageLimitLabel={imgCopy.limit}
            imageRemoveLabel={imgCopy.remove}
            maxImages={LOST_FOUND_HANDLING_IMAGE_LIMIT}
            ref={uploaderRef}
          />
        </div>

        {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
        {saved ? (
          <p className="flex items-center gap-1.5 text-xs font-bold text-green-700">
            <Check className="size-4" aria-hidden="true" />
            {t.updated}
          </p>
        ) : null}

        <Button
          className="h-12 w-full rounded-2xl bg-[#315F91] text-sm font-black text-white hover:bg-[#274D76]"
          disabled={isPending}
          onClick={handleSaveClick}
          type="button"
        >
          {isPending ? t.submitting : t.submit}
        </Button>
      </section>

      {confirmOpen ? (
        <ReturnConfirmSheet
          t={t}
          fromLabel={copy.statusLabels[initialStatus]}
          toLabel={copy.statusLabels.returned}
          itemName={itemName}
          handlerName={handlerName}
          memo={memo.trim()}
          pending={isPending}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => void performSave()}
        />
      ) : null}
    </>
  );
}

type ReturnConfirmSheetProps = {
  t: Dictionary["lostFound"]["handling"];
  fromLabel: string;
  toLabel: string;
  itemName: string;
  handlerName: string;
  memo: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function ReturnConfirmSheet({
  t,
  fromLabel,
  toLabel,
  itemName,
  handlerName,
  memo,
  pending,
  onClose,
  onConfirm,
}: ReturnConfirmSheetProps) {
  return (
    <BottomSheet ariaLabel={t.confirmTitle} onClose={onClose}>
      {({ close }) => (
        <div className="flex flex-col pt-1">
          <div className="px-1 pb-1 text-center">
            <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-indigo-50 text-[#3949ab] ring-1 ring-indigo-200">
              <Check className="size-6" aria-hidden="true" />
            </span>
            <h3 className="text-lg font-black tracking-tight">{t.confirmTitle}</h3>
            <p className="mt-1.5 text-sm font-medium leading-relaxed text-muted-foreground">
              {t.confirmDesc}
            </p>
          </div>

          <dl className="mt-4 divide-y divide-slate-200/70 overflow-hidden rounded-2xl border border-slate-200/70">
            <ConfirmRow k={t.confirmItem} v={itemName} />
            <ConfirmRow
              k={t.confirmChange}
              v={
                <>
                  {fromLabel} → <span className="font-black text-[#3949ab]">{toLabel}</span>
                </>
              }
            />
            <ConfirmRow k={t.handledBy} v={handlerName || "-"} />
            {memo ? <ConfirmRow k={t.memoLabel} v={memo} /> : null}
          </dl>

          <div className="mt-4 flex flex-col gap-2.5">
            <Button
              className="h-12 w-full rounded-2xl bg-[#315F91] text-sm font-black text-white hover:bg-[#274D76]"
              disabled={pending}
              onClick={() => {
                onConfirm();
                close();
              }}
              type="button"
            >
              <Check className="mr-1.5 size-4" aria-hidden="true" />
              {t.confirmSave}
            </Button>
            <button
              className="h-12 w-full rounded-2xl text-sm font-bold text-slate-600"
              onClick={close}
              type="button"
            >
              {t.confirmBack}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

function ConfirmRow({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="text-right text-sm font-bold">{v}</dd>
    </div>
  );
}
