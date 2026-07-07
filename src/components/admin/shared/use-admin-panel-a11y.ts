"use client";

// Shared admin-console side-panel behavior hook.
import { useEffect, useRef } from "react";

export function useAdminPanelA11y<T extends HTMLElement>(
  onClose: () => void,
  options: { disabled?: boolean } = {},
) {
  const panelRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  const disabledRef = useRef(options.disabled ?? false);

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
  }, []);

  return panelRef;
}
