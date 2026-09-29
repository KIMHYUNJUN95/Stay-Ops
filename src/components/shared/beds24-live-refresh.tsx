"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { BEDS24_LIVE_EVENT, beds24LiveTopic } from "@/lib/beds24-live";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Beds24 데이터가 바뀌면 이 화면을 새로고침 없이 다시 읽는다.
 *
 * 계약: `src/lib/beds24-live.ts` · 문서 `docs/product/33-calendar-write-features.md` → 「화면도 웹훅 기준으로」
 *
 * - 신호가 몰려 와도(웹훅 여러 건 · 요금+차단) **한 번**만 다시 읽는다(`REFRESH_DEBOUNCE_MS`).
 * - 탭이 가려져 있으면 미뤘다가 다시 보일 때 한 번 읽는다.
 * - `router.refresh()` 는 서버 컴포넌트만 다시 받는다 — 열려 있는 패널·입력·선택 같은 클라이언트
 *   상태는 그대로 남는다.
 */
const REFRESH_DEBOUNCE_MS = 600;

export function useBeds24LiveRefresh(organizationId: string | null | undefined, onChange?: () => void) {
  const router = useRouter();
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!organizationId) return;
    const supabase = getSupabaseBrowserClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const refresh = () => {
      pending = false;
      if (onChangeRef.current) onChangeRef.current();
      else router.refresh();
    };
    const schedule = () => {
      if (document.visibilityState !== "visible") {
        pending = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && pending) schedule();
    };

    const channel = supabase
      .channel(beds24LiveTopic(organizationId))
      .on("broadcast", { event: BEDS24_LIVE_EVENT }, schedule)
      .subscribe();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);
}

/** 서버 페이지에 한 줄로 끼우는 형태. 아무것도 그리지 않는다. */
export function Beds24LiveRefresh({ organizationId }: { organizationId: string }) {
  useBeds24LiveRefresh(organizationId);
  return null;
}
