"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageLightbox } from "@/components/shell/image-lightbox";

type AnnouncementImageGridProps = {
  imageUrls: string[];
  variant?: "grid" | "feature";
};

export function AnnouncementImageGrid({
  imageUrls,
  variant = "grid",
}: AnnouncementImageGridProps) {
  // Open photos in an in-app lightbox instead of `target="_blank"`, which would eject an installed
  // standalone PWA into a separate Safari tab just to view an attachment.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (imageUrls.length === 0) {
    return null;
  }

  const lightbox = (
    <ImageLightbox
      onClose={() => setOpenIndex(null)}
      openIndex={openIndex}
      urls={imageUrls}
    />
  );

  if (variant === "feature") {
    return (
      <div className="mt-4 space-y-2">
        {imageUrls.map((url, index) => (
          <button
            className="group block w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-[0_14px_28px_-24px_rgba(31,58,95,0.42)]"
            key={url}
            onClick={() => setOpenIndex(index)}
            type="button"
          >
            <Image
              alt={`Announcement attachment ${index + 1}`}
              className="aspect-[16/10] w-full object-cover transition-transform group-hover:scale-[1.02]"
              height={800}
              src={url}
              width={1280}
            />
          </button>
        ))}
        {lightbox}
      </div>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-3">
      {imageUrls.map((url, index) => (
        <button
          className="group block w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-[0_12px_24px_-22px_rgba(31,58,95,0.42)]"
          key={url}
          onClick={() => setOpenIndex(index)}
          type="button"
        >
          <Image
            alt={`Announcement attachment ${index + 1}`}
            className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02] sm:aspect-[4/3]"
            height={900}
            src={url}
            width={1200}
          />
        </button>
      ))}
      {lightbox}
    </div>
  );
}
