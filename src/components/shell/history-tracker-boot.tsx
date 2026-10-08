"use client";

import { useEffect } from "react";
import { installHistoryTracker } from "@/lib/swipe-back/history-tracker";

/**
 * 앱 안 이동 기록 추적을 켠다(화면 스와이프 뒤로가기 · 뒤로 전환 방향, 2026-10-08). 루트 레이아웃에 한 번만 둔다.
 * `/mobile` 밖(계정 · 온보딩)에서 시작해도 기록 번호가 이어지게 루트에서 켠다. 문서: docs/product/16-mobile-navigation.md
 */
export function HistoryTrackerBoot() {
  useEffect(() => {
    installHistoryTracker();
  }, []);
  return null;
}
