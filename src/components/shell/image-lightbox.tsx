"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Controlled full-screen, swipeable image viewer (scroll-snap carousel + counter).
 *
 * Why this exists: in an installed standalone PWA, opening an image via `<a target="_blank">`
 * ejects the user into a separate mobile-Safari tab (or, same-window, strands them on a raw
 * image with no back button). This keeps photo viewing **inside the app** — tap a thumbnail to
 * open, swipe between photos, close to return exactly where you were. Portals to <body> so the
 * mobile shell's transformed scroll container can't trap its `position: fixed`.
 *
 * Controlled: parent owns `openIndex` (the index to show, or null when closed) and `onClose`.
 * Extracted from the task PhotoGallery lightbox so every image surface shares one viewer.
 */
export function ImageLightbox({
  urls,
  openIndex,
  onClose,
  closeLabel = "닫기",
}: {
  urls: string[];
  openIndex: number | null;
  onClose: () => void;
  closeLabel?: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const open = openIndex !== null;

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // On open / index change, jump the rail to the requested slide (no smooth scroll on open).
  useEffect(() => {
    if (openIndex === null) return;
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({ left: openIndex * rail.clientWidth, behavior: "auto" });
    setActiveIndex(openIndex);
  }, [openIndex]);

  const goTo = (index: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({ left: index * rail.clientWidth, behavior: "smooth" });
  };

  const onRailScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const i = Math.round(rail.scrollLeft / rail.clientWidth);
    setActiveIndex((prev) => {
      const clamped = Math.max(0, Math.min(urls.length - 1, i));
      return clamped === prev ? prev : clamped;
    });
  }, [urls.length]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-slate-950/95 backdrop-blur-sm"
      style={{ animation: "modal-overlay-in 200ms ease-out both" }}
    >
      {/* Top glass bar — counter + close. */}
      <div className="flex items-center justify-between px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
        <span className="rounded-full bg-white/12 px-3 py-1 text-[12.5px] font-bold tabular-nums text-white/90 backdrop-blur-md ring-1 ring-inset ring-white/15">
          {activeIndex + 1} / {urls.length}
        </span>
        <button
          aria-label={closeLabel}
          className="flex size-9 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-md ring-1 ring-inset ring-white/15 transition-colors active:bg-white/20"
          onClick={onClose}
          type="button"
        >
          <X className="size-[18px]" aria-hidden="true" />
        </button>
      </div>

      {/* Scroll-snap carousel. */}
      <div
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={onRailScroll}
        ref={railRef}
      >
        {urls.map((url, i) => (
          <div
            className="flex h-full w-full shrink-0 snap-center items-center justify-center px-3"
            key={i}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="max-h-full max-w-full select-none rounded-lg object-contain shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)]"
              draggable={false}
              src={url}
            />
          </div>
        ))}
      </div>

      {/* Prev / next (multi-photo, pointer devices) + dots. */}
      {urls.length > 1 ? (
        <>
          {activeIndex > 0 ? (
            <button
              aria-label="←"
              className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md ring-1 ring-inset ring-white/15 transition-colors active:bg-white/20 sm:flex"
              onClick={() => goTo(activeIndex - 1)}
              type="button"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
          ) : null}
          {activeIndex < urls.length - 1 ? (
            <button
              aria-label="→"
              className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md ring-1 ring-inset ring-white/15 transition-colors active:bg-white/20 sm:flex"
              onClick={() => goTo(activeIndex + 1)}
              type="button"
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          ) : null}

          <div className="flex items-center justify-center gap-1.5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
            {urls.map((_, i) => (
              <button
                aria-label={`${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/35",
                )}
                key={i}
                onClick={() => goTo(i)}
                type="button"
              />
            ))}
          </div>
        </>
      ) : (
        <div className="pb-[max(18px,env(safe-area-inset-bottom))]" />
      )}
    </div>,
    document.body,
  );
}
