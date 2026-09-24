"use client";

import { useRouter } from "next/navigation";
import { AdminDatePicker } from "@/components/admin/shared/admin-date-picker";

/**
 * 판매 캘린더의 **날짜 점프** — 가로축 라벨을 눌러 달력에서 고른다.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「뷰 모드 두 가지」
 *
 * 화살표는 30일씩 옮기므로 **먼 날짜로 가려면 몇 번을 눌러야 한다.** 2027년 4월 가격을 보려면
 * 일곱 번이다. 라벨 자체를 달력으로 만들어 한 번에 간다.
 *
 * 달력은 콘솔 **공용 프리미티브**(`AdminDatePicker`)를 그대로 쓴다 — 이 콘솔에는 달력이
 * 하나뿐이어야 한다(CLAUDE.md §4a). 여기만의 것은 **방아쇠에 뜨는 글자**뿐이다:
 * 고른 날이 곧 30일 창의 **시작일**이라 `09/23 → 10/22` 로 범위를 보여준다.
 */
export function OpsCalendarJump({
  ariaLabel,
  display,
  labels,
  localeTag,
  params,
  start,
}: {
  ariaLabel: string;
  /** 방아쇠에 뜨는 글자. 보통 `09/23 → 10/22`. */
  display: string;
  labels: { prevMonth: string; nextMonth: string; today: string };
  localeTag: string;
  /** 지금 걸려 있는 쿼리. 날짜만 갈아 끼우고 나머지(건물·모드·취소)는 그대로 둔다. */
  params: Record<string, string | undefined>;
  /** 30일 창의 시작일. */
  start: string;
}) {
  const router = useRouter();

  return (
    <AdminDatePicker
      ariaLabel={ariaLabel}
      display={display}
      labels={labels}
      localeTag={localeTag}
      onChange={(picked) => {
        const query = new URLSearchParams();
        // 고른 날이 **시작일**이다. 「그 날짜 기준으로 앞으로 30일」이 이 화면의 축이다.
        for (const [key, value] of Object.entries({ ...params, month: undefined, start: picked })) {
          if (value) query.set(key, value);
        }
        router.push(`/admin/ops/calendar?${query.toString()}`);
      }}
      value={start}
    />
  );
}
