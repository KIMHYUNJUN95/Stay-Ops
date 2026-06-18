"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, CircleCheck, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { AnnouncementImageGrid } from "@/components/announcements/announcement-image-grid";
import type { Locale } from "@/lib/i18n";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import { dismissPopupForWeek } from "@/app/announcements/popup-actions";

const POPUP_HIDE_STORAGE_KEY = "stayops:announcement-popup-hidden-until";
const POPUP_HIDE_STORAGE_EVENT = "stayops:announcement-popup-storage";
const HIDE_FOR_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type HiddenPopupMap = Record<string, string>;
type HidePreference = {
  announcementId: string | null;
  checked: boolean;
};

function readHiddenPopupSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const raw = window.localStorage.getItem(POPUP_HIDE_STORAGE_KEY);

    if (!raw) {
      return "";
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return "";
    }

    const now = Date.now();
    const nextMap = Object.fromEntries(
      Object.entries(parsed).filter((entry) => {
        const [, value] = entry;

        return typeof value === "string" && new Date(value).getTime() > now;
      }),
    ) as HiddenPopupMap;
    const nextSnapshot = JSON.stringify(nextMap);

    if (raw !== nextSnapshot) {
      window.localStorage.setItem(POPUP_HIDE_STORAGE_KEY, nextSnapshot);
    }

    return nextSnapshot;
  } catch {
    return "";
  }
}

function subscribeHiddenPopupSnapshot(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onCustomEvent = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key === POPUP_HIDE_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener(POPUP_HIDE_STORAGE_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(POPUP_HIDE_STORAGE_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorage);
  };
}

function writeHiddenPopupMap(map: HiddenPopupMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(POPUP_HIDE_STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(POPUP_HIDE_STORAGE_EVENT));
  } catch {}
}

function subscribeHydration(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const id = window.requestAnimationFrame(() => callback());

  return () => window.cancelAnimationFrame(id);
}

export type PopupAnnouncement = {
  content: string;
  id: string;
  imageUrls: string[];
  isImportant: boolean;
  organizationId: string;
  title: string;
};

type AnnouncementPopupProps = {
  announcements: PopupAnnouncement[];
  detailHrefBase: string;
  locale: Locale;
};

export function AnnouncementPopup({
  announcements,
  detailHrefBase,
  locale,
}: AnnouncementPopupProps) {
  const copy = getAnnouncementDictionary(locale);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const [hidePreference, setHidePreference] = useState<HidePreference>({
    announcementId: null,
    checked: false,
  });
  const [, startTransition] = useTransition();
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const hiddenPopupSnapshot = useSyncExternalStore(
    subscribeHiddenPopupSnapshot,
    readHiddenPopupSnapshot,
    () => "",
  );
  const hiddenPopupMap = useMemo<HiddenPopupMap>(() => {
    if (!hiddenPopupSnapshot) {
      return {};
    }

    try {
      return JSON.parse(hiddenPopupSnapshot) as HiddenPopupMap;
    } catch {
      return {};
    }
  }, [hiddenPopupSnapshot]);

  const announcement = useMemo(
    () =>
      announcements.find((item) => {
        if (dismissedIds.has(item.id)) {
          return false;
        }

        return !hiddenPopupMap?.[item.id];
      }),
    [announcements, dismissedIds, hiddenPopupMap],
  );
  const hideForWeek =
    announcement?.id === hidePreference.announcementId && hidePreference.checked;

  if (!isHydrated || !announcement) {
    return null;
  }

  function dismissCurrentAnnouncement() {
    if (!announcement) {
      return;
    }

    if (hideForWeek) {
      const nextMap: HiddenPopupMap = {
        ...hiddenPopupMap,
        [announcement.id]: new Date(Date.now() + HIDE_FOR_WEEK_MS).toISOString(),
      };

      writeHiddenPopupMap(nextMap);

      // Persist to server — fire-and-forget inside transition so it does not
      // block the immediate UI update.
      startTransition(() => {
        void dismissPopupForWeek(announcement.id, announcement.organizationId);
      });
    }

    setDismissedIds((current) => new Set(current).add(announcement.id));
  }

  return (
    <BottomSheet
      ariaLabel={copy.important}
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
      header={
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600">
            <AlertCircle className="size-6" aria-hidden="true" />
          </div>
          <h2 className="text-[25px] font-black leading-tight">
            {copy.important}
          </h2>
        </div>
      }
      onClose={dismissCurrentAnnouncement}
    >
      {({ close }) => (
        <>
          <div className="mt-4 rounded-[24px] border border-slate-200/80 bg-surface/82 p-5 shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="line-clamp-2 break-words text-base font-black leading-6 text-foreground">
                  {announcement.title}
                </p>
                <p className="mt-3 line-clamp-6 whitespace-pre-line break-words text-base font-medium leading-7 text-slate-600">
                  {announcement.content}
                </p>
              </div>
              {announcement.imageUrls[0] ? (
                <Image
                  alt=""
                  className="h-[92px] w-[92px] shrink-0 rounded-2xl object-cover shadow-[0_12px_22px_-18px_rgba(31,58,95,0.45)]"
                  height={112}
                  src={announcement.imageUrls[0]}
                  width={112}
                />
              ) : (
                <div className="flex h-[92px] w-[92px] shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Megaphone className="size-8" aria-hidden="true" />
                </div>
              )}
            </div>
          </div>

          {announcement.imageUrls.length > 1 ? (
            <AnnouncementImageGrid imageUrls={announcement.imageUrls.slice(1)} />
          ) : null}

          <label className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
            <input
              checked={hideForWeek}
              className="size-4 rounded border border-slate-300 bg-surface accent-primary"
              onChange={(event) =>
                setHidePreference({
                  announcementId: announcement.id,
                  checked: event.target.checked,
                })
              }
              type="checkbox"
            />
            {copy.hideForWeek}
          </label>

          <div className="mt-5 space-y-3">
            <Link
              className="inline-flex h-[54px] w-full items-center justify-center rounded-2xl bg-primary px-4 text-base font-black text-primary-foreground shadow-[0_18px_34px_-22px_hsl(var(--primary-hsl)/0.68)] transition-colors hover:bg-primary/90"
              href={`${detailHrefBase}/${announcement.id}`}
            >
              {copy.readAnnouncement}
            </Link>
            <Button
              className="h-12 w-full rounded-2xl border-border bg-surface text-slate-700 shadow-[0_12px_24px_-22px_rgba(31,58,95,0.45)] hover:bg-slate-50"
              onClick={close}
              type="button"
              variant="secondary"
            >
              <CircleCheck className="size-4" aria-hidden="true" />
              {copy.close}
            </Button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
