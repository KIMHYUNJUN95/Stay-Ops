/**
 * 방 라벨 후보 생성 — **순수 모듈**.
 *
 * `room-sync.ts` 는 Supabase 서버 클라이언트를 끌고 오므로 테스트에서 못 읽는다. 순서가 곧
 * 규칙인 이 부분만 떼어 둔다.
 *
 * 회귀 배경: `src/lib/__tests__/beds24-room-label-candidates.test.ts`
 */

/** 라벨이 이미 다른 방에게 잡혀 있을 때 붙일 접미사의 상한. */
export const ROOM_LABEL_SUFFIX_LIMIT = 9;

/**
 * 라벨 후보를 순서대로 만든다: `401`, `401_2`, `401_3` …
 *
 * **첫 후보는 반드시 Beds24 가 준 이름 그대로여야 한다** — 겹치지 않는 대부분의 방이 접미사를
 * 받으면 안 된다. 접미사 형식은 우리가 만든 게 아니라 Beds24 가 듀얼 유닛에 이미 쓰는 것이다
 * (`201` / `201_2`). 표시 계층(`getDisplayRoomLabel`)이 `_N` 을 떼어 한 행으로 합친다.
 */
export function roomLabelCandidates(desiredLabel: string): string[] {
  const candidates: string[] = [];
  for (let attempt = 1; attempt <= ROOM_LABEL_SUFFIX_LIMIT; attempt += 1) {
    candidates.push(attempt === 1 ? desiredLabel : `${desiredLabel}_${attempt}`);
  }
  return candidates;
}
