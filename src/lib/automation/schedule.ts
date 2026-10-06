/**
 * 자동화 시각 계산 — 「지금 보내야 하나」 · 「다음에 언제 다시 보나」. **순수하다.**
 *
 * 도메인 계약: docs/product/36-automation-control.md 「발송 시각 — 대시보드에서 설정」
 *
 * 시각은 전부 **도쿄** 기준이다(CLAUDE.md §7). 저쪽은 `onSchedule("30 6 * * *")` 를 코드에 박고 06:50 · 07:50 ·
 * 08:50 재시도 스케줄을 따로 뒀다. 여기서는 1분 틱 하나가 「발송 시각 ≤ 지금 ≤ 재시도 마감」이고 오늘 아직 끝내지
 * 않았으면 보낸다. 바꾼 시각은 다음 틱부터 적용되고, 오늘 이미 끝냈으면 내일부터다.
 */

import { ymdShift } from "@/lib/tokyo-date";

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

export type TokyoClock = {
  /** YYYY-MM-DD */
  date: string;
  /** 0 ~ 1439 */
  minutes: number;
  /** ISO 1=월 … 7=일 */
  weekday: number;
};

export function tokyoClock(now: Date): TokyoClock {
  const shifted = new Date(now.getTime() + TOKYO_OFFSET_MS);
  const day = shifted.getUTCDay();
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: day === 0 ? 7 : day,
  };
}

export function hhmmToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/** 도쿄 날짜 + "HH:MM" → 그 순간. */
export function tokyoInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+09:00`);
}

export function isoWeekdayOf(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export type ScheduleInput = {
  enabled: boolean;
  sendTime: string;
  retryUntil: string;
  weekdays: number[];
  /** 오늘 정시 발송을 끝낸 도쿄 날짜(보냈거나 마감까지 못 보냄). */
  lastDoneOn: string | null;
};

/** 지금 정시 발송(또는 재시도)을 해야 하나. */
export function isScheduledSendDue(job: ScheduleInput, now: Date): boolean {
  if (!job.enabled) return false;
  const clock = tokyoClock(now);
  if (!job.weekdays.includes(clock.weekday)) return false;
  if (job.lastDoneOn === clock.date) return false;
  return clock.minutes >= hhmmToMinutes(job.sendTime) && clock.minutes <= hhmmToMinutes(job.retryUntil);
}

/** 오늘 이후로 처음 오는 「요일이 맞는 날의 발송 시각」. 없으면 null(요일을 하나도 안 골랐다). */
export function nextScheduledSend(job: ScheduleInput, now: Date): Date | null {
  if (!job.enabled || job.weekdays.length === 0) return null;
  const clock = tokyoClock(now);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = ymdShift(clock.date, offset);
    if (!job.weekdays.includes(isoWeekdayOf(date))) continue;
    if (offset === 0) {
      if (job.lastDoneOn === date) continue;
      if (clock.minutes > hhmmToMinutes(job.retryUntil)) continue;
      // 창 안이면 지금, 창 전이면 발송 시각.
      return clock.minutes >= hhmmToMinutes(job.sendTime) ? now : tokyoInstant(date, job.sendTime);
    }
    return tokyoInstant(date, job.sendTime);
  }
  return null;
}

export const RETRY_AFTER_MS = 5 * 60 * 1000;
export const RECHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * 틱이 이 자동화를 다시 볼 시각.
 *
 * - 정시 발송이 남았으면 그 시각(실패 직후면 5분 뒤 — 매 분 두드리지 않는다).
 * - 오늘 보냈고 「변동 재전송 / 정정본」 확인 창(`recheckUntil`) 안이면 10분마다.
 * - 둘 중 이른 것.
 */
export function computeNextWake(
  job: ScheduleInput & { recheckUntil: string | null },
  now: Date,
  options: { retryAfterFailure?: boolean } = {},
): Date | null {
  if (!job.enabled) return null;
  const clock = tokyoClock(now);
  const candidates: Date[] = [];

  const scheduled = nextScheduledSend(job, now);
  if (scheduled) {
    if (options.retryAfterFailure && scheduled.getTime() <= now.getTime()) {
      candidates.push(new Date(now.getTime() + RETRY_AFTER_MS));
    } else {
      candidates.push(scheduled);
    }
  }

  if (job.recheckUntil && job.lastDoneOn === clock.date && clock.minutes < hhmmToMinutes(job.recheckUntil)) {
    candidates.push(new Date(now.getTime() + RECHECK_EVERY_MS));
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, item) => (item.getTime() < earliest.getTime() ? item : earliest));
}

/** 정시 발송을 마감까지 못 했나(이번 시도가 마지막이었나). */
export function isPastRetryDeadline(job: Pick<ScheduleInput, "retryUntil">, now: Date): boolean {
  const clock = tokyoClock(now);
  return clock.minutes + RETRY_AFTER_MS / 60_000 > hhmmToMinutes(job.retryUntil);
}
