"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Camera, X } from "lucide-react";

const MAX_IMAGES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/gif", "image/jpeg", "image/png", "image/webp"];
const MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.75;

export type PreviewItem = {
  id: string;
  file: File;
  previewUrl: string;
};

export type AnnouncementImageUploaderHandle = {
  getItems: () => PreviewItem[];
};

type Props = {
  addImagesLabel: string;
  errorCountExceeded: string;
  errorSizeExceeded: string;
  errorTypeInvalid: string;
  imageAttachmentsLabel: string;
  imageLimitLabel: string;
  imageRemoveLabel: string;
};

async function compressImageFile(file: File): Promise<File> {
  // GIF: skip compression to preserve animation
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > MAX_DIM || height > MAX_DIM) {
    if (width >= height) {
      height = Math.round((height * MAX_DIM) / width);
      width = MAX_DIM;
    } else {
      width = Math.round((width * MAX_DIM) / height);
      height = MAX_DIM;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // PNG keeps PNG (preserves transparency), WebP keeps WebP, others → JPEG
  const outputType =
    file.type === "image/png"
      ? "image/png"
      : file.type === "image/webp"
        ? "image/webp"
        : "image/jpeg";

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(file);
          return;
        }
        const ext = outputType.split("/")[1];
        const baseName = file.name.replace(/\.[^.]+$/, "");
        resolve(new File([blob], `${baseName}.${ext}`, { type: outputType }));
      },
      outputType,
      COMPRESS_QUALITY,
    );
  });
}

export const AnnouncementImageUploader = forwardRef<
  AnnouncementImageUploaderHandle,
  Props
>(function AnnouncementImageUploader(
  {
    addImagesLabel,
    errorCountExceeded,
    errorSizeExceeded,
    errorTypeInvalid,
    imageAttachmentsLabel,
    imageLimitLabel,
    imageRemoveLabel,
  },
  ref,
) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pickInputRef = useRef<HTMLInputElement>(null);
  // Track current items in a ref for use in cleanup effect
  const itemsRef = useRef(items);

  // Keep ref current after every render (must not be done during render)
  useEffect(() => {
    itemsRef.current = items;
  });

  // Revoke all blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getItems: () => items,
    }),
    [items],
  );

  const handlePickChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      // Reset so the same file can be re-selected after removal
      e.target.value = "";
      if (selected.length === 0) return;

      // Validate: type
      const invalidType = selected.find((f) => !ALLOWED_TYPES.includes(f.type));
      if (invalidType) {
        setError(errorTypeInvalid);
        return;
      }

      // Validate: count (against current items)
      if (itemsRef.current.length + selected.length > MAX_IMAGES) {
        setError(errorCountExceeded);
        return;
      }

      // Validate: size (original file before compression)
      const tooBig = selected.find((f) => f.size > MAX_BYTES);
      if (tooBig) {
        setError(errorSizeExceeded);
        return;
      }

      setError(null);

      const newItems: PreviewItem[] = await Promise.all(
        selected.map(async (file) => {
          const compressed = await compressImageFile(file);
          const previewUrl = URL.createObjectURL(compressed);
          return {
            id: `${Date.now()}-${Math.random()}`,
            file: compressed,
            previewUrl,
          };
        }),
      );

      setItems((prev) => [...prev, ...newItems]);
    },
    [errorTypeInvalid, errorCountExceeded, errorSizeExceeded],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
    setError(null);
  }, []);

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-semibold text-muted-foreground">{imageAttachmentsLabel}</span>

      {/* Previews & Add button in a horizontal scrollable row */}
      <div className="flex items-center gap-3 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
        {/* Add button — hidden when limit reached */}
        {items.length < MAX_IMAGES && (
          <button
            className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border bg-background/40 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/40 hover:text-foreground active:scale-95"
            onClick={() => pickInputRef.current?.click()}
            type="button"
          >
            <Camera className="size-5 text-muted-foreground/80" aria-hidden="true" />
            <span className="text-[11px] font-bold tracking-tight">{addImagesLabel}</span>
          </button>
        )}

        {/* Previews */}
        {items.map((item) => (
          <div
            className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/20"
            key={item.id}
          >
            {/* Blob URLs cannot be optimised by Next.js Image, use plain img */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              aria-hidden="true"
              className="size-full object-cover"
              src={item.previewUrl}
            />
            <button
              aria-label={imageRemoveLabel}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition-transform hover:scale-105 active:scale-95"
              onClick={() => removeItem(item.id)}
              type="button"
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      <input
        accept="image/gif,image/jpeg,image/png,image/webp"
        className="sr-only"
        multiple
        onChange={handlePickChange}
        ref={pickInputRef}
        type="file"
      />

      {error !== null && (
        <p className="text-xs font-semibold text-destructive" role="alert">
          {error}
        </p>
      )}

      <span className="pl-0.5 text-[11px] font-semibold text-muted-foreground">
        {imageLimitLabel}
      </span>
    </div>
  );
});
