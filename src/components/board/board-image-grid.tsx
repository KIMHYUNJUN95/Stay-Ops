"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageLightbox } from "@/components/shell/image-lightbox";

/**
 * Board post photos as a compact thumbnail strip. Thumbnails are small fixed-size squares (wrapping
 * rows) so they don't dominate the post; tapping any one opens the shared full-screen `ImageLightbox`
 * (swipeable, original-resolution, portaled) — never `target="_blank"`, per the project image
 * contract (decision-log 2026-06-22).
 */
export function BoardImageGrid({
  urls,
  viewPhotoLabel,
  closeLabel,
}: {
  urls: string[];
  viewPhotoLabel: string;
  closeLabel: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (urls.length === 0) return null;

  return (
    <div className="mt-[12px] flex flex-wrap gap-[6px]">
      {urls.map((url, index) => (
        <button
          key={url}
          type="button"
          onClick={() => setOpenIndex(index)}
          aria-label={`${viewPhotoLabel} ${index + 1}`}
          className="group relative size-[76px] overflow-hidden rounded-[10px] border border-border bg-[hsl(40_22%_92%)]"
        >
          <Image
            src={url}
            alt=""
            fill
            sizes="76px"
            className="object-cover transition-transform duration-300 group-active:scale-[1.05]"
          />
          <span className="pointer-events-none absolute inset-0 bg-foreground/0 transition-colors group-active:bg-foreground/10" />
        </button>
      ))}

      <ImageLightbox
        urls={urls}
        openIndex={openIndex}
        onClose={() => setOpenIndex(null)}
        closeLabel={closeLabel}
      />
    </div>
  );
}
