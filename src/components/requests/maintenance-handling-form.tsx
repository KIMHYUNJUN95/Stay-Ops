"use client";

// 모바일 수리·점검 상세 — 현장 처리 블록 (상태 변경 + 처리 메모 + 완료 사진).
// 2026-07-14 신설. 문서상 "현장이 모바일에서 처리한다"가 그동안 구현되어 있지 않았다.
// part_time_staff는 렌더 자체를 하지 않고(읽기 전용 안내만), 서버 액션과 RLS가 최종 게이트다.
import { useRef, useState, useTransition } from "react";
import { Check, Lock } from "lucide-react";
import {
  AnnouncementImageUploader,
  type AnnouncementImageUploaderHandle,
} from "@/components/announcements/announcement-image-uploader";
import { uploadRequestImages } from "@/components/requests/request-image-upload";
import { Button } from "@/components/ui/button";
import {
  updateMaintenanceHandling,
  type MaintenanceHandlingResult,
} from "@/app/mobile/requests/maintenance/actions";
import type { Dictionary } from "@/lib/i18n";
import {
  maintenanceStatuses,
  MAINTENANCE_RESOLUTION_IMAGE_LIMIT,
  type MaintenanceStatus,
} from "@/lib/maintenance-constants";
import { cn } from "@/lib/utils";

type MaintenanceHandlingFormProps = {
  canHandle: boolean;
  copy: Dictionary["maintenance"];
  imgCopy: Dictionary["requestImages"];
  initialMemo: string;
  initialStatus: MaintenanceStatus;
  organizationId: string;
  reportId: string;
};

const CARD =
  "rounded-[24px] border border-slate-200/80 bg-surface p-4 shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)]";

function statusChipClass(status: MaintenanceStatus, active: boolean) {
  if (!active) return "border-slate-200 bg-white text-slate-600";
  switch (status) {
    case "open":
      return "border-blue-300 bg-blue-50 text-blue-700";
    case "in_progress":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "closed":
      return "border-green-300 bg-green-50 text-green-700";
    case "cancelled":
      return "border-slate-400 bg-slate-100 text-slate-700";
  }
}

export function MaintenanceHandlingForm({
  canHandle,
  copy,
  imgCopy,
  initialMemo,
  initialStatus,
  organizationId,
  reportId,
}: MaintenanceHandlingFormProps) {
  const t = copy.handling;
  const [status, setStatus] = useState<MaintenanceStatus>(initialStatus);
  const [memo, setMemo] = useState(initialMemo);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const uploaderRef = useRef<AnnouncementImageUploaderHandle | null>(null);

  if (!canHandle) {
    return (
      <section className={CARD}>
        <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          {t.readOnly}
        </div>
      </section>
    );
  }

  async function handleSave() {
    setError(null);
    setSaved(false);
    let resolutionImageUrls: string[] = [];
    try {
      const items = uploaderRef.current?.getItems() ?? [];
      if (items.length > 0) {
        const uploaded = await uploadRequestImages({
          items,
          organizationId,
          requestId: reportId,
          requestType: "maintenance-resolutions",
        });
        resolutionImageUrls = uploaded.imageUrls;
      }
    } catch {
      setError(copy.errors.save_failed);
      return;
    }

    startTransition(async () => {
      const result: MaintenanceHandlingResult = await updateMaintenanceHandling({
        reportId,
        status,
        memo,
        resolutionImageUrls,
      });
      if (result.ok) {
        setSaved(true);
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

  return (
    <section className={cn(CARD, "flex flex-col gap-4")}>
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-black text-foreground">{t.title}</h2>
        <p className="text-xs font-semibold leading-5 text-muted-foreground">{t.hint}</p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{t.statusLabel}</span>
        <div className="flex flex-wrap gap-2">
          {maintenanceStatuses.map((value) => (
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
        {status === "cancelled" ? (
          <p className="text-xs font-semibold leading-5 text-amber-700">{t.cancelHint}</p>
        ) : null}
        {(status === "open" || status === "in_progress") &&
        (initialStatus === "closed" || initialStatus === "cancelled") ? (
          <p className="text-xs font-semibold leading-5 text-muted-foreground">{t.reopenHint}</p>
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
        <span className="text-xs font-semibold text-muted-foreground">{t.photosLabel}</span>
        <p className="text-xs font-semibold text-muted-foreground/80">{t.photosHint}</p>
        <AnnouncementImageUploader
          addImagesLabel={imgCopy.addPhotos}
          errorCountExceeded={imgCopy.errorCount}
          errorSizeExceeded={imgCopy.errorSize}
          errorTypeInvalid={imgCopy.errorType}
          imageAttachmentsLabel={imgCopy.attachments}
          imageLimitLabel={imgCopy.limit}
          imageRemoveLabel={imgCopy.remove}
          maxImages={MAINTENANCE_RESOLUTION_IMAGE_LIMIT}
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
        onClick={handleSave}
        type="button"
      >
        {isPending ? t.submitting : t.submit}
      </Button>
    </section>
  );
}
