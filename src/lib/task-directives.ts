import type { TaskRecord } from "@/lib/tasks";

/**
 * 지시(work directive) 판별 술어 — **모바일과 관리 콘솔이 반드시 같은 규칙을 써야 한다.**
 *
 * 지시는 `tasks.is_directive` 로 표시된다(마이그레이션 `202607270001_task_directive.sql`):
 * 작성자(`created_by_user_id`) = 지시자, 참여자 = 대상. 별도 컬럼 없이 "누가 지시했는지"가 작성자다.
 *
 * 원래 이 술어들은 `src/components/admin/tasks/helpers.ts` 안에만 있었다. 2026-07-30 모바일에도
 * 받은/보낸 지시 화면이 생기면서, 두 곳에 같은 규칙을 복사하면 이 저장소가 이미 한 번 크게 데인
 * 쌍둥이 파일 문제(`tasks.ts` / `tasks-recurrence.ts` 의 반복 규칙 분기)를 되풀이하게 된다.
 * 그래서 여기 한 곳에 두고 `helpers.ts` 는 재수출만 한다.
 *
 * `@/lib/tasks` 는 server-only 이지만 여기서는 **타입만** 가져오므로 클라이언트에서도 안전하다.
 */

/** 작성자를 뺀 참여자(= 지시 대상 / 공유 상대) id 목록. */
export function partsOf(t: TaskRecord): string[] {
  return t.participants.filter((p) => p.userId !== t.createdByUserId).map((p) => p.userId);
}

export function isMine(t: TaskRecord, meId: string): boolean {
  return t.createdByUserId === meId;
}

/** 내가 **보낸** 지시(내가 지시자, 대상이 한 명 이상). */
export function sentInstr(t: TaskRecord, meId: string): boolean {
  return t.isDirective && isMine(t, meId) && partsOf(t).length > 0;
}

/** 내가 **받은** 지시(남이 지시자, 대상에 내가 포함). */
export function recvInstr(t: TaskRecord, meId: string): boolean {
  return t.isDirective && !isMine(t, meId) && t.participants.some((p) => p.userId === meId);
}

/**
 * 내 일정 뷰(오늘/내일/관리함/캘린더)에 들어갈 작업인지.
 *
 * 내가 보낸 지시는 **대상자의 일정**이므로 내 목록에서 뺀다 — 지시자는 "지시 › 보낸 지시"에서
 * 진행 상황만 본다. 받은 지시는 반대로 내 일정이므로 그대로 남는다.
 */
export function myOwn(t: TaskRecord, meId: string): boolean {
  return !sentInstr(t, meId);
}
