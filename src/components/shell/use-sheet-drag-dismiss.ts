"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * iOS-style drag-to-dismiss for the app's bottom sheets — a drag-only primitive.
 *
 * One place owns the drag mechanics so every sheet feels identical, while each sheet keeps its own
 * open/close lifecycle (the `shown ? translate-y-0 : translate-y-full` + `opacity` slide it already
 * has). The hook never owns mounting/visibility — it only:
 *   - follows the finger downward while dragging the grab handle / header (clamped at 0)
 *   - on release: calls the sheet's own close (`onDismiss`) if pulled far/fast enough, else snaps back
 *   - dims the scrim in proportion to the drag distance
 *
 * Because the hook leaves transform/opacity to the sheet's className whenever it is NOT dragging,
 * the existing slide-in / slide-out / scrim-fade (and `motion-reduce` opt-out) all stay intact; the
 * hook only sets inline transform/opacity (and disables the transition) for the live drag.
 *
 * Drag mechanics mirror `reorderable-section-list.tsx`: window pointermove/up listeners attached
 * once, live values mirrored into refs so the effect never re-binds and render stays clean
 * (satisfies react-hooks/refs + set-state-in-effect).
 *
 * Usage:
 *   const drag = useSheetDragDismiss({ shown, onDismiss: close });
 *   // scrim:  <div className="... transition-opacity ..." style={drag.scrimStyle} onClick={close}>
 *   // sheet:  <div data-sheet className="... shown ? translate-y-0 : translate-y-full" style={drag.sheetStyle}>
 *   // handle: <div {...drag.handleProps} /> and/or the header block
 */

// Dismiss thresholds (confirmed defaults).
const DISTANCE_RATIO = 0.25; // fraction of sheet height
const DISTANCE_FLOOR = 80; // px — minimum deliberate pull
const VELOCITY_CLOSE = 0.5; // px/ms downward flick
const SCRIM_DIM = 0.5; // scrim fades to (1 - this) at a full-height drag

type Options = {
  /** True while the sheet rests on-screen. The sheet keeps owning its own slide in/out. */
  shown: boolean;
  /** Run the sheet's existing close() — fired when a drag crosses the dismiss threshold. */
  onDismiss: () => void;
};

export function useSheetDragDismiss({ shown, onDismiss }: Options) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [height, setHeight] = useState(0); // sheet height captured at drag start (for scrim dim)

  // Live mirrors for the window listeners.
  const draggingRef = useRef(false);
  const dragYRef = useRef(0);
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTRef = useRef(0);
  const velRef = useRef(0);
  const heightRef = useRef(0);
  const shownRef = useRef(shown);
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // If the sheet is hidden while a stale drag offset lingers, clear it so the next open is clean.
  useEffect(() => {
    if (shown) return;
    if (dragYRef.current === 0 && !draggingRef.current) return;
    draggingRef.current = false;
    dragYRef.current = 0;
    setDragging(false);
    setDragY(0);
  }, [shown]);

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      e.preventDefault();
      const dy = e.clientY - startYRef.current;
      const clamped = dy > 0 ? dy : 0; // downward only
      const dt = e.timeStamp - lastTRef.current;
      if (dt > 0) velRef.current = (e.clientY - lastYRef.current) / dt;
      lastYRef.current = e.clientY;
      lastTRef.current = e.timeStamp;
      dragYRef.current = clamped;
      setDragY(clamped);
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragging(false);
      const dy = dragYRef.current;
      const threshold = Math.max(DISTANCE_FLOOR, heightRef.current * DISTANCE_RATIO);
      dragYRef.current = 0;
      setDragY(0);
      if (dy >= threshold || velRef.current >= VELOCITY_CLOSE) {
        onDismissRef.current();
      }
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!shownRef.current) return;
    const handle = e.currentTarget as HTMLElement;
    const sheet = handle.closest("[data-sheet]") as HTMLElement | null;
    const h = sheet?.getBoundingClientRect().height ?? 0;
    heightRef.current = h;
    setHeight(h);
    startYRef.current = e.clientY;
    lastYRef.current = e.clientY;
    lastTRef.current = e.timeStamp;
    velRef.current = 0;
    dragYRef.current = 0;
    draggingRef.current = true;
    setDragging(true);
    setDragY(0);
  }, []);

  const dim = height > 0 ? Math.min(1, dragY / height) : 0;

  return {
    /** True only while the finger is down and dragging. */
    dragging,
    /**
     * Inline style for the sheet container (also tag it with `data-sheet`). Only set while dragging;
     * otherwise undefined so the sheet's own `translate-y-0 / translate-y-full` class drives the slide.
     */
    sheetStyle: {
      transform: dragging ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? "none" : undefined,
    } as React.CSSProperties,
    /** Inline style for the scrim/backdrop — dims with the drag, otherwise class-driven. */
    scrimStyle: {
      opacity: dragging ? 1 - dim * SCRIM_DIM : undefined,
      transition: dragging ? "none" : undefined,
    } as React.CSSProperties,
    /** Spread onto the grab handle (and optionally the header block). */
    handleProps: {
      onPointerDown,
      // Sheets portal to <body>, but React synthetic touch events still bubble through the React
      // tree — i.e. up into the mobile shell's content div, whose pull-to-refresh / swipe-nav
      // handlers would otherwise drag the background screen down with the sheet. Touch events stay
      // bound to their start target, so stopping them here isolates the whole drag gesture.
      onTouchStart: stopTouch,
      onTouchMove: stopTouch,
      onTouchEnd: stopTouch,
      style: { touchAction: "none" as const },
    },
  };
}

function stopTouch(e: React.TouchEvent) {
  e.preventDefault();
  e.stopPropagation();
}
