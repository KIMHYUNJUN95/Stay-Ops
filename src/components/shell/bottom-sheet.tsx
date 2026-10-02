"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
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

/*
 * ── 움직임 — 모든 하단 시트가 같은 곡선 · 같은 길이(2026-10-02 사용자 지시 「물 흐르듯이, 너무 빠르지 않게, 닫을 때도」) ──
 * iOS 시트 곡선(빠르게 출발 → 길게 감속). 여는 쪽이 조금 더 길다 — 닫힘은 손을 뗀 뒤라 기다리게 하지 않는다.
 * 내용이 늦게 와서 시트가 **커지면** 위 끝이 툭 튀지 않고 같은 곡선으로 미끄러져 올라간다(아래 FLIP).
 */
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const SHEET_OPEN_MS = 480;
const SHEET_CLOSE_MS = 380;
const SHEET_GROW_MS = 420;

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
    setTimeout(onClose, SHEET_CLOSE_MS); // matches the slide-out transition duration
  }, [onClose]);

  const drag = useSheetDragDismiss({ shown, onDismiss: close });

  // 스크림 탭으로 닫으려면 **포인터가 스크림 위에서 눌렸어야** 한다.
  //
  // 시트는 <body> 로 포털되어 화면 전체를 덮는다. 모바일에서 한 번의 탭은
  // pointerdown → pointerup → click 순으로 오는데, 그 사이에 시트가 마운트되면
  // 뒤따라오는 click 이 방금 생긴 스크림 위에 떨어진다. 시트를 연 그 탭이 곧바로
  // 시트를 닫아버려서 "잠깐 떴다 사라지는" 것처럼 보인다(2026-07-31, 근태 결과 시트).
  // 시트가 열리기 전에 눌린 탭에는 스크림 pointerdown 이 없으므로 이 가드로 걸러진다.
  const scrimArmedRef = useRef(false);

  /*
   * 내용이 커지면(불러오는 중 → 다 받음) 시트 위 끝이 한 번에 튀어 오른다. 커진 만큼 아래로 내린 자리에서 0 으로
   * 미끄러뜨린다(FLIP — `translate` 속성만 움직여 합성기에서 돈다. 끌기 · 열고 닫기의 `transform` 과 따로 논다).
   * 작아질 때는 그대로 둔다 — 같은 방법이면 시트가 바닥에서 떠서 아래로 스크림이 비친다.
   */
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof ResizeObserver === "undefined" || typeof sheet.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = sheet.offsetHeight;
    let grow: Animation | null = null;
    const observer = new ResizeObserver(() => {
      const next = sheet.offsetHeight;
      const delta = next - last;
      last = next;
      if (delta <= 2) return;
      // 미끄러지는 도중에 또 커지면 남은 거리에 더한다(멈칫하지 않게).
      let carry = 0;
      if (grow && grow.playState === "running") {
        carry = Number.parseFloat(getComputedStyle(sheet).translate.split(" ")[1] ?? "0") || 0;
        grow.cancel();
      }
      grow = sheet.animate([{ translate: `0 ${delta + carry}px` }, { translate: "0 0" }], {
        duration: SHEET_GROW_MS,
        easing: SHEET_EASE,
      });
    });
    observer.observe(sheet);
    return () => {
      observer.disconnect();
      grow?.cancel();
    };
  }, []);

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
            "fixed inset-0 flex items-end justify-center bg-slate-950/45 motion-reduce:transition-none!",
            zIndexClassName,
            shown ? "opacity-100" : "opacity-0",
          )}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (!scrimArmedRef.current) return;
            scrimArmedRef.current = false;
            close();
          }}
          onPointerDown={(e) => {
            scrimArmedRef.current = e.target === e.currentTarget;
          }}
          style={{
            ...drag.scrimStyle,
            transition: drag.dragging
              ? "none"
              : `opacity ${shown ? SHEET_OPEN_MS : SHEET_CLOSE_MS}ms ${SHEET_EASE}`,
          }}
        >
          <div
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-modal="true"
            className={cn(
              "w-full max-w-[460px] rounded-t-[24px] bg-surface px-5 pb-[calc(max(20px,env(safe-area-inset-bottom))+var(--keyboard-inset,0px))] pt-0",
              "motion-reduce:transition-none!",
              shown ? "translate-y-0" : "translate-y-full",
              className,
            )}
            data-sheet
            onClick={(e) => e.stopPropagation()}
            // Sheets portal to <body>, but React synthetic touch events still bubble through the
            // React tree into the mobile shell's content div, whose pull-to-refresh / swipe-nav
            // handlers would otherwise scroll/drag the background when the user touches a
            // non-handle area of the sheet (gutter, padding, the gap above the scroll region).
            // Isolating touchmove here keeps the background frozen while a sheet is open; the
            // sheet's own scroll regions still scroll natively (stopPropagation ≠ preventDefault).
            onTouchMove={(e) => e.stopPropagation()}
            ref={sheetRef}
            role="dialog"
            style={{
              ...drag.sheetStyle,
              transition: drag.dragging
                ? "none"
                : `transform ${shown ? SHEET_OPEN_MS : SHEET_CLOSE_MS}ms ${SHEET_EASE}`,
              willChange: "transform",
            }}
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
