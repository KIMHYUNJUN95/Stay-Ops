"use client";

/**
 * Desktop photo attach/preview control for the admin Todoist console.
 * Used at three call sites: the inline task-add row (compact), the detail-panel task photos
 * (full), and the note composer in the detail panel (compact). Selection/preview/removal only —
 * the actual upload is delegated to the caller via `uploadPendingTaskPhotos` /
 * `uploadPendingTaskUpdatePhotos` so no call site duplicates the upload loop.
 *
 * Reuses the existing upload contract rather than reinventing it:
 * - `compressImageFile` / `PreviewItem` from the announcement uploader (client-side compression
 *   policy — CLAUDE.md §8).
 * - `uploadRequestImages` from the shared request-image-upload helper.
 */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import {
  compressImageFile,
  type PreviewItem,
} from "@/components/announcements/announcement-image-uploader";
import { uploadRequestImages } from "@/components/requests/request-image-upload";

// Matches the size cap already enforced by the announcement uploader — kept in lockstep so the
// same file that would be rejected there is rejected here.
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/gif", "image/jpeg", "image/png", "image/webp"];

export type PhotoUploaderCopy = {
  /** Drop-zone label, non-compact variant. e.g. "사진 추가" */
  add: string;
  /** Drop-zone label, compact variant (inline-add row / note composer). e.g. "사진" */
  addCompact: string;
  /** Subtext under the label, non-compact only. e.g. "클릭하거나 파일을 끌어다 놓으세요" */
  dropHint: string;
  /** Count badge. Placeholders: {n} current count, {max} cap. e.g. "{n}/{max}" */
  count: string;
  /** aria-label for each thumbnail's remove button. e.g. "사진 삭제" */
  remove: string;
  /** Shown when a selection would exceed the cap. Placeholder: {max}. e.g. "최대 {max}장까지 첨부할 수 있어요" */
  tooMany: string;
  /** Shown for a non-image file. e.g. "이미지 파일만 첨부할 수 있어요" */
  invalidType: string;
  /** Shown for an over-size file. Placeholder: {max} (MB). e.g. "파일 용량은 {max}MB 이하만 가능해요" */
  tooLarge: string;
  /** Shown in place of the add label while `uploading` is true. e.g. "업로드 중…" */
  uploading: string;
};

function fillCopy(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [key, val]) => acc.replaceAll(`{${key}}`, String(val)),
    template,
  );
}

type Props = {
  /** Already-uploaded public URLs (existing photos, e.g. when editing). */
  value: string[];
  /** Locally selected, not yet uploaded. */
  pending: PreviewItem[];
  onChange: (next: { value: string[]; pending: PreviewItem[] }) => void;
  /** Cap: caller passes 5 or 20 — project tasks get 20, everything else 5 (CLAUDE.md §8). */
  maxImages: number;
  copy: PhotoUploaderCopy;
  disabled?: boolean;
  /** Smaller variant for the inline-add row and the note composer. */
  compact?: boolean;
  /** True while the caller is mid-upload (e.g. inside a submit transition) — locks the control. */
  uploading?: boolean;
};

export function TaskPhotoUploader({
  value,
  pending,
  onChange,
  maxImages,
  copy,
  disabled = false,
  compact = false,
  uploading = false,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isBusy = disabled || uploading;
  const total = value.length + pending.length;
  const atCap = total >= maxImages;

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || isBusy) return;

      const invalidType = files.find((f) => !ALLOWED_TYPES.includes(f.type));
      if (invalidType) {
        setError(copy.invalidType);
        return;
      }
      const tooBig = files.find((f) => f.size > MAX_BYTES);
      if (tooBig) {
        setError(fillCopy(copy.tooLarge, { max: Math.round(MAX_BYTES / (1024 * 1024)) }));
        return;
      }
      if (total + files.length > maxImages) {
        setError(fillCopy(copy.tooMany, { max: maxImages }));
        return;
      }

      setError(null);
      const items: PreviewItem[] = await Promise.all(
        files.map(async (file) => {
          const compressed = await compressImageFile(file);
          return {
            id: `${Date.now()}-${Math.random()}`,
            file: compressed,
            previewUrl: URL.createObjectURL(compressed),
          };
        }),
      );
      onChange({ value, pending: [...pending, ...items] });
    },
    [copy, isBusy, maxImages, onChange, pending, total, value],
  );

  const handlePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      // Reset so the same file can be re-selected after removal
      e.target.value = "";
      void addFiles(files);
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (isBusy) return;
      void addFiles(Array.from(e.dataTransfer.files ?? []));
    },
    [addFiles, isBusy],
  );

  const removeExisting = useCallback(
    (url: string) => {
      onChange({ value: value.filter((v) => v !== url), pending });
      setError(null);
    },
    [onChange, pending, value],
  );

  const removePending = useCallback(
    (id: string) => {
      const item = pending.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      onChange({ value, pending: pending.filter((p) => p.id !== id) });
      setError(null);
    },
    [onChange, pending, value],
  );

  // Revoke any still-pending object URLs on unmount so preview blobs don't leak.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  });
  useEffect(() => {
    return () => {
      for (const item of pendingRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  const dropDisabled = isBusy || atCap;

  return (
    <div className={`tphoto${compact ? " tphoto--compact" : ""}`}>
      <div
        aria-disabled={dropDisabled}
        aria-label={compact ? copy.addCompact : copy.add}
        className={`tphoto__drop${dragOver ? " is-drag" : ""}${dropDisabled ? " is-disabled" : ""}`}
        onClick={() => !dropDisabled && inputRef.current?.click()}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dropDisabled) setDragOver(true);
        }}
        onDrop={handleDrop}
        onKeyDown={(e) => {
          if (dropDisabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={dropDisabled ? -1 : 0}
      >
        {uploading ? (
          <Loader2 aria-hidden="true" className="tphoto__spin" size={compact ? 14 : 16} />
        ) : (
          <ImagePlus aria-hidden="true" size={compact ? 14 : 16} />
        )}
        <span className="tphoto__addlabel">
          {uploading ? copy.uploading : compact ? copy.addCompact : copy.add}
        </span>
        {!compact && !uploading && <span className="tphoto__hint">{copy.dropHint}</span>}
        {/* Compact renders as a chip alongside 날짜/우선순위/대상 — a "0/5" suffix on an empty chip
            is noise, so the count only appears once something is attached. */}
        {(!compact || total > 0) && (
          <span className="tphoto__count">{fillCopy(copy.count, { n: total, max: maxImages })}</span>
        )}
      </div>

      <input
        accept="image/gif,image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={dropDisabled}
        multiple
        onChange={handlePick}
        ref={inputRef}
        type="file"
      />

      {(value.length > 0 || pending.length > 0) && (
        <div className="tphoto__grid">
          {value.map((url) => (
            <div className="tphoto__thumb" key={url}>
              {/* `request-images` 는 next.config 의 remotePatterns 에 있다 — 예전 주석의
                  「허용 목록에 없다」는 사실과 다르다(2026-08-11 확인). */}
              <Image alt="" className="tphoto__img" src={url} width={64} height={64} />
              <button
                aria-label={copy.remove}
                className="tphoto__remove"
                disabled={isBusy}
                onClick={() => removeExisting(url)}
                type="button"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </div>
          ))}
          {pending.map((item) => (
            <div className="tphoto__thumb" key={item.id}>
              {/* Blob URLs cannot be optimised by Next.js Image, use plain img */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="tphoto__img" src={item.previewUrl} />
              <button
                aria-label={copy.remove}
                className="tphoto__remove"
                disabled={isBusy}
                onClick={() => removePending(item.id)}
                type="button"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error !== null && (
        <p className="tphoto__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

async function uploadTaskPhotos(params: {
  pending: PreviewItem[];
  organizationId: string;
  requestId: string;
  requestType: "task-images" | "task-update-images";
}): Promise<string[]> {
  const { pending, organizationId, requestId, requestType } = params;
  if (pending.length === 0) return [];
  const { imageUrls } = await uploadRequestImages({
    items: pending,
    organizationId,
    requestId,
    requestType,
  });
  return imageUrls;
}

/**
 * Uploads task-level photos (inline-add row + detail-panel task photos).
 * Storage path lands under `${organizationId}/task-images/...` — required by
 * `cleanupRemovedTaskImages` in src/lib/task-images.ts, which only recognizes that prefix.
 */
export async function uploadPendingTaskPhotos(params: {
  pending: PreviewItem[];
  organizationId: string;
  taskId: string; // or a fresh uuid for a not-yet-created task
}): Promise<string[]> {
  return uploadTaskPhotos({ ...params, requestId: params.taskId, requestType: "task-images" });
}

/**
 * Uploads note/update-log photos (detail-panel note composer). Separate `requestType` from
 * `uploadPendingTaskPhotos` — matches the folder split the mobile task detail view already uses
 * (`task-update-images` vs `task-images`) so admin and mobile land in the same storage layout.
 */
export async function uploadPendingTaskUpdatePhotos(params: {
  pending: PreviewItem[];
  organizationId: string;
  taskId: string;
}): Promise<string[]> {
  return uploadTaskPhotos({
    ...params,
    requestId: params.taskId,
    requestType: "task-update-images",
  });
}
