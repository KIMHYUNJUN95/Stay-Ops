"use client";

import { Printer } from "lucide-react";

// 인쇄 시트 상단 바 — 화면에만 보이고 인쇄에는 빠진다(`.qrsheet__bar` 는 @media print 에서 숨김).
// 자동으로 인쇄 대화상자를 띄우지 않는다: 몇 장이 나오는지, 제외된 현장이 있는지 먼저 확인한 뒤
// 누르는 편이 낫다. 인쇄물이라 잘못 뽑으면 종이와 시간이 낭비된다.
export function PrintTrigger({ disabled, label }: { disabled: boolean; label: string }) {
  return (
    <div className="qrsheet__bar">
      <button className="qrsheet__btn" disabled={disabled} onClick={() => window.print()} type="button">
        <Printer aria-hidden="true" />
        {label}
      </button>
    </div>
  );
}
