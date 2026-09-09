"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * 채용 콘솔 실시간 갱신 (2026-09-09).
 *
 * 채용 사이트 → 웹훅 → `job_applications` 로 지원서가 들어오는 순간 콘솔이 스스로 갱신된다.
 * 새로고침을 눌러야 보이면 「실시간 연동」이 아니다.
 *
 * **행 데이터는 쓰지 않는다.** 지원서에는 이름·전화·주소·비자가 함께 들어 있어 웹소켓으로 흘리지
 * 않고, 변경이 있었다는 신호만 받아 `router.refresh()` 로 서버 렌더를 다시 받는다. 그래서 화면에
 * 뜨는 값은 마스킹·권한 검사를 전부 통과한 서버 결과 그대로다. 구독 자체도 select RLS 를 통과해야
 * 하므로(owner / 전무 / office_admin / platform_admin) 권한 없는 세션은 신호조차 받지 못한다.
 *
 * 250ms 디바운스는 벌크 상태 전환처럼 한 번에 여러 행이 바뀔 때 새로고침이 그 수만큼 도는 것을
 * 막는다. 탭이 숨겨져 있으면 미뤄 뒀다가 돌아올 때 한 번만 갱신한다 — 보이지 않는 탭을 위해
 * 서버 렌더를 돌리는 건 낭비다.
 *
 * 캘린더(`mobile-calendar-live-view.tsx`)와 같은 패턴이다. 폴링이 아니라 이미 열려 있는 웹소켓
 * 신호라 Vercel 함수 호출이 늘지 않는다.
 *
 * 알려진 한계: 삭제는 신호가 오지 않는다. RLS 가 걸린 테이블에서 realtime 이 DELETE 를 배달하려면
 * `replica identity full` 이 필요한데, 그러면 지워진 행 전체가 WAL 로 나간다. 삭제는 드물고 수동이라
 * 개인정보를 더 흘리는 쪽을 택하지 않았다.
 *
 * 도메인 계약: docs/product/30-recruit-workflow.md
 */
export function RecruitLiveRefresh({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefreshRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const scheduleRefresh = () => {
      if (document.visibilityState !== "visible") {
        pendingRefreshRef.current = true;
        return;
      }
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        pendingRefreshRef.current = false;
        router.refresh();
      }, 250);
    };

    const channel = supabase
      .channel(`recruit-applications:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_applications",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && pendingRefreshRef.current) {
        scheduleRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  return null;
}
