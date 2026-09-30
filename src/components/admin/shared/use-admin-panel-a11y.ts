"use client";

// Shared admin-console side-panel / centered-modal behavior hook.
// Esc to close, body scroll lock, focus the panel on open, restore focus on close.
// `trapFocus` (opt-in, 2026-09-30 — sales summary modal) keeps Tab / Shift+Tab inside the panel.
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useAdminPanelA11y<T extends HTMLElement>(
  onClose: () => void,
  options: { disabled?: boolean; trapFocus?: boolean } = {},
) {
  const panelRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  const disabledRef = useRef(options.disabled ?? false);
  const trapFocus = options.trapFocus ?? false;

  useEffect(() => {
    onCloseRef.current = onClose;
    disabledRef.current = options.disabled ?? false;
  }, [onClose, options.disabled]);

  useEffect(() => {
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Tab" && trapFocus) {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
          (element) => element.offsetParent !== null || element === document.activeElement,
        );
        if (focusable.length === 0) {
          event.preventDefault();
          panel.focus({ preventScroll: true });
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && panel.contains(active);
        if (event.shiftKey && (active === first || active === panel || !inside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !inside)) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key !== "Escape" || disabledRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      previousActive?.focus({ preventScroll: true });
    };
  }, [trapFocus]);

  return panelRef;
}
