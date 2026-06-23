"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useSheetDragDismiss } from "@/components/shell/use-sheet-drag-dismiss";

/**
 * BottomSheet — the single canonical bottom sheet for the whole app.
 *
 * Every slide-up sheet (anchored to the bottom of the screen, dimmed scrim behind)
 * must use this so they all look and feel identical:
 *   - portals to <body> (so the mobile shell's pull-to-refresh transform can't trap it)
 *   - slate scrim (`bg-slate-950/45`) that dims as you drag the sheet down
 *   - iOS-style drag-to-dismiss on the grab handle / header (shared `useSheetDragDismiss`)
 *   - rounded-top cream surface, 38px grab handle, 460px max width, 20px safe-area pad
 *   - body scroll lock + Esc-to-close while open
 *   - dismiss via drag past threshold, scrim tap, or Esc — NO top-right X button
 *
 * Mount-driven (matches every existing sheet): the parent conditionally renders the
 * sheet; it plays the slide-in on mount, and on dismiss it plays the slide-out and
 * THEN calls `onClose` (so the parent unmounts only after the exit animation).
 *
 *   {open && <BottomSheet onClose={() => setOpen(false)}>…</BottomSheet>}
 *
 * Programmatic close from inside (Cancel button, post-submit): use the render-prop
 * `children={({ close }) => …}` or `useBottomSheetClose()`. Make any extra element a
 * drag-to-dismiss zone with `useBottomSheetDragHandle()`.
 */

type HandleProps = ReturnType<typeof useSheetDragDismiss>["handleProps"];

const BottomSheetDragContext = createContext<HandleProps>({} as HandleProps);
const BottomSheetCloseContext = createContext<() => void>(() => {});

/** Spread onto any element inside a BottomSheet to make it a drag-to-dismiss zone. */
export function useBottomSheetDragHandle() {
  return useContext(BottomSheetDragContext);
}
/** Animate the enclosing BottomSheet closed (slide-out, then the parent's onClose). */
export function useBottomSheetClose() {
  return useContext(BottomSheetCloseContext);
}

type BottomSheetProps = {
  /** Fired AFTER the slide-out completes — the parent should unmount the sheet here. */
  onClose: () => void;
  children:
    | ReactNode
    | ((api: { close: () => void; dragHandleProps: HandleProps }) => ReactNode);
  /** Optional title/header row rendered under the handle; it becomes a drag zone. */
  header?: ReactNode;
  /** Extra classes for the sheet container (e.g. `max-h-[82dvh] flex flex-col`). */
  className?: string;
  /** Scrim/sheet z-index. Default `z-[80]`; raise when stacking over another sheet. */
  zIndexClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
};

export function BottomSheet({
  onClose,
  children,
  header,
  className,
  zIndexClassName = "z-[80]",
  ariaLabel,
  ariaLabelledBy,
}: BottomSheetProps) {
  const [shown, setShown] = useState(false);

  const close = useCallback(() => {
    setShown(false);
    setTimeout(onClose, 320); // matches the slide-out transition duration
  }, [onClose]);

  const drag = useSheetDragDismiss({ shown, onDismiss: close });

  // Slide in on mount (double rAF so the initial translate-y-full paints first).
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  // Body scroll lock + Esc-to-close while mounted.
  useEffect(() => {
    const scrollY = window.scrollY;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPosition = document.body.style.position;
    const prevBodyTop = document.body.style.top;
    const prevBodyWidth = document.body.style.width;
    const prevBodyTouchAction = document.body.style.touchAction;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.position = prevBodyPosition;
      document.body.style.top = prevBodyTop;
      document.body.style.width = prevBodyWidth;
      document.body.style.touchAction = prevBodyTouchAction;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      window.scrollTo(0, scrollY);
      window.removeEventListener("keydown", onKey);
    };
  }, [close]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <BottomSheetCloseContext.Provider value={close}>
      <BottomSheetDragContext.Provider value={drag.handleProps}>
        <div
          className={cn(
            "fixed inset-0 flex items-end justify-center bg-slate-950/45 pb-[var(--keyboard-inset,0px)] transition-opacity duration-300 motion-reduce:transition-none",
            zIndexClassName,
            shown ? "opacity-100" : "opacity-0",
          )}
          onClick={close}
          style={drag.scrimStyle}
        >
          <div
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-modal="true"
            className={cn(
              "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-0",
              "transition-transform duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform motion-reduce:transition-none",
              shown ? "translate-y-0" : "translate-y-full",
              className,
            )}
            data-sheet
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            style={drag.sheetStyle}
          >
            <div
              className="-mx-5 flex min-h-[44px] cursor-grab items-start justify-center px-5 pt-[10px] active:cursor-grabbing"
              {...drag.handleProps}
            >
              <div className="h-1 w-[38px] rounded-full bg-slate-200" />
            </div>
            {header != null ? <div {...drag.handleProps}>{header}</div> : null}
            {typeof children === "function"
              ? children({ close, dragHandleProps: drag.handleProps })
              : children}
          </div>
        </div>
      </BottomSheetDragContext.Provider>
    </BottomSheetCloseContext.Provider>,
    document.body,
  );
}
