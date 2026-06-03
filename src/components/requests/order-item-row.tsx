"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";
import { Camera, Clipboard, ExternalLink, Link2, Minus, Plus, Trash2, X } from "lucide-react";
import type { PreviewItem } from "@/components/announcements/announcement-image-uploader";
import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 5;
const PHOTO_ALLOWED_TYPES = ["image/gif", "image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_MAX_DIM = 1600;
const PHOTO_COMPRESS_QUALITY = 0.75;

async function compressPhoto(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > PHOTO_MAX_DIM || height > PHOTO_MAX_DIM) {
    if (width >= height) { height = Math.round((height * PHOTO_MAX_DIM) / width); width = PHOTO_MAX_DIM; }
    else { width = Math.round((width * PHOTO_MAX_DIM) / height); height = PHOTO_MAX_DIM; }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const outputType = file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { resolve(file); return; }
        const ext = outputType.split("/")[1];
        resolve(new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: outputType }));
      },
      outputType,
      PHOTO_COMPRESS_QUALITY,
    );
  });
}

export type OrderLinkDomain = "amazon" | "ikea" | "other" | null;

export type OrderLineItem = {
  id: string;
  name: string;
  quantity: string;
  link: string;
  memo: string;
};

type OrderItemRowProps = {
  canRemove: boolean;
  copy: Dictionary["mobile"]["orderForm"];
  domain: OrderLinkDomain;
  errors: string[];
  imgCopy: Dictionary["requestImages"];
  index: number;
  item: OrderLineItem;
  onChange: (id: string, patch: Partial<OrderLineItem>) => void;
  onPasteLink: (id: string) => Promise<void>;
  onPhotosChange: (id: string, photos: PreviewItem[]) => void;
  onRemove: (id: string) => void;
  photos: PreviewItem[];
};

const INPUT_CLASS =
  "h-11 w-full rounded-xl border border-border bg-background/65 px-3 text-sm font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[#315F91] focus:ring-2 focus:ring-[#315F91]/20";

function normalizeQuantity(value: string) {
  const digits = value.replace(/[^0-9]/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

function OrderItemRowComponent({
  canRemove,
  copy,
  domain,
  errors,
  imgCopy,
  index,
  item,
  onChange,
  onPasteLink,
  onPhotosChange,
  onRemove,
  photos,
}: OrderItemRowProps) {
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(item.link || item.memo));
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (selected.length === 0) return;

      const invalidType = selected.find((f) => !PHOTO_ALLOWED_TYPES.includes(f.type));
      if (invalidType) { setPhotoError(imgCopy.errorType); return; }

      if (photos.length + selected.length > MAX_PHOTOS) { setPhotoError(imgCopy.errorCount); return; }

      const tooBig = selected.find((f) => f.size > PHOTO_MAX_BYTES);
      if (tooBig) { setPhotoError(imgCopy.errorSize); return; }

      setPhotoError(null);

      const newItems: PreviewItem[] = await Promise.all(
        selected.map(async (file) => {
          const compressed = await compressPhoto(file);
          return {
            id: `${Date.now()}-${Math.random()}`,
            file: compressed,
            previewUrl: URL.createObjectURL(compressed),
          };
        }),
      );

      onPhotosChange(item.id, [...photos, ...newItems]);
    },
    [imgCopy, item.id, onPhotosChange, photos],
  );

  const removePhoto = useCallback(
    (photoId: string) => {
      const target = photos.find((p) => p.id === photoId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      onPhotosChange(item.id, photos.filter((p) => p.id !== photoId));
      setPhotoError(null);
    },
    [item.id, onPhotosChange, photos],
  );

  function renderItemCardTitle(indexValue: number) {
    if (typeof copy.itemCardTitle === "function") {
      return copy.itemCardTitle(indexValue);
    }
    return `Item ${indexValue}`;
  }

  const quantityNumber = Number(item.quantity || "0");
  const domainLabel = useMemo(() => {
    if (domain === "amazon") return copy.domainAmazon;
    if (domain === "ikea") return copy.domainIkea;
    if (domain === "other") return copy.domainOther;
    return null;
  }, [copy, domain]);

  const hasLinkWarning = item.link.trim().length > 0 && domain === null;

  function updateQuantity(next: number) {
    onChange(item.id, { quantity: String(Math.max(1, next)) });
  }

  return (
    <article className="rounded-2xl border border-border bg-surface/78 p-3.5 shadow-glass backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#EAF1F8] text-xs font-black text-[#1F3A5F] dark:bg-[#315F91]/25 dark:text-[#D9E8F7]">
            {index + 1}
          </div>
          <h3 className="truncate text-sm font-black text-foreground">
            {renderItemCardTitle(index + 1)}
          </h3>
        </div>
        {canRemove ? (
          <button
            aria-label={`${copy.removeItem} ${index + 1}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
            onClick={() => onRemove(item.id)}
            type="button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            {copy.itemName}
          </span>
          <input
            autoComplete="off"
            className={cn(INPUT_CLASS, errors.includes("name") && "border-destructive focus:border-destructive focus:ring-destructive/20")}
            onChange={(event) => onChange(item.id, { name: event.target.value })}
            placeholder={copy.itemNamePlaceholder}
            type="text"
            value={item.name}
          />
        </label>

        <div className="space-y-1.5">
          <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
            {copy.quantity}
          </span>
          <div className="grid grid-cols-[44px_1fr_44px] gap-2">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background/65 text-foreground transition-colors hover:bg-muted/70 disabled:opacity-40"
              disabled={quantityNumber <= 1}
              onClick={() => updateQuantity(quantityNumber - 1)}
              type="button"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <input
              autoComplete="off"
              className={cn(INPUT_CLASS, "text-center text-base font-black", errors.includes("quantity") && "border-destructive focus:border-destructive focus:ring-destructive/20")}
              inputMode="numeric"
              onChange={(event) => onChange(item.id, { quantity: normalizeQuantity(event.target.value) })}
              placeholder={copy.quantityPlaceholder}
              type="text"
              value={item.quantity}
            />
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background/65 text-foreground transition-colors hover:bg-muted/70"
              onClick={() => updateQuantity(quantityNumber + 1)}
              type="button"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 쇼핑몰 검색 + 사진 추가 버튼 행 */}
        <div className="flex gap-2">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-between rounded-xl border border-dashed border-border bg-background/45 px-3 text-left text-sm font-bold text-[#1F3A5F] transition-colors hover:bg-[#EAF1F8]/70 dark:text-[#D9E8F7] dark:hover:bg-[#315F91]/20"
            onClick={() => setAdvancedOpen((open) => !open)}
            type="button"
          >
            <span>{copy.itemAdvancedToggle}</span>
            <span className="text-xs text-muted-foreground">
              {advancedOpen ? "-" : "+"}
            </span>
          </button>

          {/* 사진 추가 버튼 */}
          <button
            aria-label={imgCopy.addPhotos}
            className={cn(
              "relative inline-flex min-h-11 min-w-[72px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-background/45 px-2.5 text-xs font-bold transition-colors",
              photos.length >= MAX_PHOTOS
                ? "cursor-not-allowed text-muted-foreground/50"
                : "text-[#1F3A5F] hover:bg-[#EAF1F8]/70 dark:text-[#D9E8F7] dark:hover:bg-[#315F91]/20",
            )}
            disabled={photos.length >= MAX_PHOTOS}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Camera className="size-4 shrink-0" aria-hidden="true" />
            <span>
              {photos.length}/{MAX_PHOTOS}
            </span>
          </button>
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-hidden="true"
            className="sr-only"
            multiple
            onChange={handlePhotoChange}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {/* 사진 에러 메시지 */}
        {photoError ? (
          <p className="text-xs font-semibold text-destructive">{photoError}</p>
        ) : null}

        {/* 사진 썸네일 */}
        {photos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div className="relative" key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  className="size-16 rounded-xl border border-border object-cover"
                  src={photo.previewUrl}
                />
                <button
                  aria-label={imgCopy.remove}
                  className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-destructive hover:text-white"
                  onClick={() => removePhoto(photo.id)}
                  type="button"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {advancedOpen ? (
          <div className="space-y-3 rounded-xl border border-border/80 bg-background/45 p-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                  {copy.referenceUrl}
                </span>
                {domainLabel ? (
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide",
                    domain === "amazon" && "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
                    domain === "ikea" && "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
                    domain === "other" && "bg-muted text-muted-foreground",
                  )}>
                    {domainLabel}
                  </span>
                ) : null}
              </div>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input
                    autoComplete="off"
                    className={cn(INPUT_CLASS, "pl-9")}
                    onChange={(event) => onChange(item.id, { link: event.target.value })}
                    placeholder={copy.referenceUrlPlaceholder}
                    type="url"
                    value={item.link}
                  />
                </div>
                <button
                  aria-label={copy.pasteLink}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-background/70 text-[#315F91] transition-colors hover:bg-[#EAF1F8] dark:text-[#D9E8F7] dark:hover:bg-[#315F91]/20"
                  onClick={() => onPasteLink(item.id)}
                  type="button"
                >
                  <Clipboard className="size-4" aria-hidden="true" />
                </button>
              </div>
              {hasLinkWarning ? (
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-300">
                  {copy.linkWarning}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <a
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-background/70 text-sm font-bold text-foreground transition-colors hover:bg-muted/70"
                href="https://www.amazon.co.jp/?ref_=abn_logo"
                rel="noreferrer"
                target="_blank"
              >
                Amazon
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
              <a
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-background/70 text-sm font-bold text-foreground transition-colors hover:bg-muted/70"
                href="https://www.ikea.com/jp/ja/"
                rel="noreferrer"
                target="_blank"
              >
                IKEA
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>

            <label className="block space-y-1.5">
              <span className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">
                {copy.itemMemo}
              </span>
              <textarea
                className="min-h-20 w-full resize-none rounded-xl border border-border bg-background/65 px-3 py-2.5 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[#315F91] focus:ring-2 focus:ring-[#315F91]/20"
                onChange={(event) => onChange(item.id, { memo: event.target.value })}
                placeholder={copy.itemMemoPlaceholder}
                rows={3}
                value={item.memo}
              />
            </label>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export const OrderItemRow = memo(OrderItemRowComponent);

