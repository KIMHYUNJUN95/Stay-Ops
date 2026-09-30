"use client";

/**
 * 도구줄의 「1박 갭 N」 — **누르면 바로 고친다**(2026-09-30 사용자 요청).
 *
 * 격자가 최소 숙박일 모드로 들어가 고를 수 있는 갭 칸을 전부 고르고, 오른쪽 패널이 열린다
 * (`ops-calendar-grid.tsx` 가 `OPS_GAP_OPEN_EVENT` 를 받는다). 배지는 서버가 그리는 도구줄에 있고
 * 모드·선택은 격자가 쥐고 있어 이벤트로 잇는다.
 */
export const OPS_GAP_OPEN_EVENT = "ops:gap-open";

export function OpsGapButton({ count, hint, label }: { count: number; hint: string; label: string }) {
  return (
    <button
      className="ops__gapbtn"
      onClick={() => window.dispatchEvent(new Event(OPS_GAP_OPEN_EVENT))}
      title={hint}
      type="button"
    >
      {label}
      <span className="ops__gapn">{count}</span>
    </button>
  );
}
