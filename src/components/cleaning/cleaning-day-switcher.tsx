"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * 모바일 청소 화면의 운영일 이동 — `‹ 8월 4일 (월) ›` + 라벨 탭으로 달력 열기.
 *
 * 콘솔은 공용 `AdminDatePicker` 를 쓰지만(CLAUDE.md §4a) **그 규칙은 콘솔 한정**이고, 모바일은 앱
 * 표준 입력을 쓴다. 여기서 네이티브 `<input type="date">` 를 쓰는 이유는 현장에서 한 손으로 쓰는
 * 화면이라 OS 기본 달력이 가장 빠르고 익숙하기 때문이다. 입력은 화면 밖에 두고 라벨을 눌러 연다.
 *
 * 미래 날짜를 막지 않는다 — 청소 대상은 예약에서 파생되므로 내일·다음 주도 계산되고, 그것이 인력
 * 배치의 근거가 된다.
 */
export function CleaningDaySwitcher({
  date,
  today,
  locale,
  basePath,
  labels,
}: {
  date: string;
  today: string;
  locale: string;
  basePath: string;
  labels: { prev: string; next: string; select: string; today: string };
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (next: string) => router.push(`${basePath}?date=${next}`);

  const shift = (delta: number) => {
    const [y, m, d] = date.split("-").map(Number);
    // Tokyo 운영일 문자열을 UTC 로 다뤄 자정·서머타임 영향을 받지 않게 한다(저장소 관례).
    const at = new Date(Date.UTC(y, m - 1, d + delta));
    go(at.toISOString().slice(0, 10));
  };

  const label = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00+09:00`));

  const isToday = date === today;

  return (
    <div className="flex items-center gap-1.5">
      <button
        aria-label={labels.prev}
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors active:bg-muted"
        onClick={() => shift(-1)}
        type="button"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>

      <div className="relative min-w-0 flex-1">
        <button
          aria-label={labels.select}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-extrabold tracking-[-0.01em] text-foreground transition-colors active:bg-muted"
          onClick={() => inputRef.current?.showPicker?.()}
          type="button"
        >
          <span className="truncate">{label}</span>
          {isToday ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-bold text-primary">
              {labels.today}
            </span>
          ) : null}
        </button>
        {/* 화면에는 보이지 않지만 접근성 트리에는 남긴다 — showPicker 가 막힌 브라우저에서는
            이 입력 자체가 대체 경로가 되어야 한다. */}
        <input
          aria-label={labels.select}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(e) => {
            if (e.target.value) go(e.target.value);
          }}
          ref={inputRef}
          type="date"
          value={date}
        />
      </div>

      <button
        aria-label={labels.next}
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors active:bg-muted"
        onClick={() => shift(1)}
        type="button"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
