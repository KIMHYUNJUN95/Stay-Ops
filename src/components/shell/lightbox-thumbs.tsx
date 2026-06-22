"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageLightbox } from "@/components/shell/image-lightbox";

/**
 * A wrap of square photo thumbnails that open in the in-app {@link ImageLightbox} instead of a
 * `target="_blank"` new tab (which ejects an installed standalone PWA into Safari). The caller
 * passes the exact wrapper/thumb classes so each surface keeps its original look — this only
 * swaps the `<a>` breakout for a `<button>` that opens the shared viewer.
 */
export function LightboxThumbs({
  urls,
  wrapClassName,
  thumbClassName,
  sizes = "72px",
}: {
  urls: string[];
  /** Class for the flex-wrap container (matches the original markup). */
  wrapClassName: string;
  /** Class for each sized thumbnail box (the element that was inside the old `<a>`). */
  thumbClassName: string;
  sizes?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (urls.length === 0) return null;

  return (
    <div className={wrapClassName}>
      {urls.map((url, idx) => (
        <button key={`${url}-${idx}`} onClick={() => setOpenIndex(idx)} type="button">
          <div className={thumbClassName}>
            <Image alt="" className="object-cover" fill sizes={sizes} src={url} />
          </div>
        </button>
      ))}
      <ImageLightbox onClose={() => setOpenIndex(null)} openIndex={openIndex} urls={urls} />
    </div>
  );
}
