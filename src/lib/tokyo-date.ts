/**
 * Tokyo 운영 날짜 유틸 — **순수 모듈, 서버 import 없음.**
 *
 * 이 프로젝트의 업무 날짜는 전부 도쿄 달력 기준이다(CLAUDE.md → Tokyo timezone). 그런데 정본이던
 * `@/lib/tasks` 가 supabase/session 을 끌어오는 서버 전용 모듈이라, 클라이언트 컴포넌트가 값으로
 * 가져올 수 없었다. 그래서 같은 함수가 투두 기능 안에서만 **일곱 벌** 재구현돼 있었다:
 * `tasks.ts` · `tasks-recurrence.ts` · `admin/tasks/helpers.ts` · `tasks-workspace.tsx` ·
 * `task-card.tsx` · `task-schedule-sheet.tsx` · `date-time-fields.tsx`.
 *
 * 이 저장소가 반복해서 당한 사고가 정확히 그 «쌍둥이 어긋남»이다(결정 로그 참고). 날짜 계산은
 * 갈라지면 조용히 하루가 어긋나고, 그 하루가 지연·회차·정산 판정을 전부 뒤집는다. 그래서 서버·
 * 클라이언트가 **같은 파일 하나**를 보게 한다.
 *
 * 서버 쪽 호출부는 그대로 두기 위해 `@/lib/tasks` 가 여기서 재수출한다.
 */

const TZ = "Asia/Tokyo";

/** 오늘의 도쿄 운영 날짜(YYYY-MM-DD). 컷오버 시각은 없다 — 순수한 도쿄 달력 날짜다. */
export function tokyoToday(): string {
  return tokyoDateOfDate(new Date());
}

/** `timestamptz` 값이 도쿄 달력으로 몇 일인지(YYYY-MM-DD). null 은 그대로 null. */
export function tokyoDateOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return tokyoDateOfDate(d);
}

function tokyoDateOfDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * YYYY-MM-DD 를 `days` 만큼 옮긴다. 달·해 경계를 `Date.UTC` 정규화로 넘긴다.
 *
 * UTC 로 계산하는 것이 맞다 — 입력이 이미 «도쿄 달력 날짜»라는 시간대 없는 값이므로, 로컬 시간대로
 * 파싱하면 실행 환경에 따라 하루가 밀린다.
 */
export function ymdShift(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 형식인가. 라우트 파라미터처럼 믿을 수 없는 입력을 거를 때 쓴다. */
export function isYmd(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
