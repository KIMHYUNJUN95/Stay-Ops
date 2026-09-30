"use client";

import { useSyncExternalStore } from "react";
import { BEDS24_LIVE_STATUS_EVENT, currentBeds24LiveStatus } from "@/components/shared/beds24-live-refresh";

/**
 * 실시간 연결 상태 점 — 초록 = 연결됨, 회색 = 끊김(자동 재연결 중).
 *
 * 「내 컴퓨터엔 뜨는데 다른 컴퓨터는 안 바뀐다」(2026-09-30)를 화면에서 바로 가려내려고 둔다.
 * 상태는 `useBeds24LiveRefresh` 가 `window` 이벤트로 알린다. 문구는 부르는 쪽이 넘긴다(i18n).
 */
function subscribe(onChange: () => void) {
  window.addEventListener(BEDS24_LIVE_STATUS_EVENT, onChange);
  return () => window.removeEventListener(BEDS24_LIVE_STATUS_EVENT, onChange);
}

export function Beds24LiveDot({ onLabel, offLabel }: { onLabel: string; offLabel: string }) {
  const status = useSyncExternalStore(subscribe, currentBeds24LiveStatus, () => null);
  if (status === null) return null;
  const label = status === "connected" ? onLabel : offLabel;
  return (
    <span
      aria-label={label}
      className={`ops__live${status === "connected" ? " is-on" : ""}`}
      role="status"
      title={label}
    />
  );
}
