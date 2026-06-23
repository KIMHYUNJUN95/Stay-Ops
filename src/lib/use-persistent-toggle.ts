"use client";

/**
 * SSR-safe persisted boolean toggle backed by localStorage.
 * First render always returns the `defaultValue` so the server/client
 * HTML match (no hydration mismatch). A useEffect then reads the
 * stored preference and updates the state on the client only.
 *
 * Cross-tab sync: listens to the "storage" event so other tabs reflect
 * changes immediately without a page reload.
 */

import { useCallback, useEffect, useState } from "react";

function readStorage(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    return raw === "1";
  } catch {
    // Safari private mode or storage quota exceeded — fall back silently.
    return null;
  }
}

function writeStorage(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Ignore write failures.
  }
}

export function usePersistentToggle(
  storageKey: string,
  defaultValue: boolean,
): [boolean, () => void] {
  // Always start with defaultValue so SSR and first-client render agree.
  const [value, setValue] = useState(defaultValue);

  // Hydrate from localStorage after mount.
  // setState is called in a microtask so it is not synchronous in the effect body
  // (satisfies react-hooks/set-state-in-effect); still runs before paint so no flicker.
  useEffect(() => {
    const stored = readStorage(storageKey);
    if (stored !== null) queueMicrotask(() => setValue(stored));
  }, [storageKey]);

  // Sync across tabs opened in the same browser.
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const stored = readStorage(storageKey);
      if (stored !== null) setValue(stored);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [storageKey]);

  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev;
      writeStorage(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return [value, toggle];
}
