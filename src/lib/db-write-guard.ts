import "server-only";

/**
 * Supabase 쓰기의 **실패를 무시할 수 없게** 만드는 두 헬퍼.
 *
 * **왜 필요한가.** `await supabase.from(…).update(…)` 처럼 결과를 받지 않으면, 실패해도 코드가
 * 그대로 다음 줄로 넘어간다. 사용자는 저장됐다고 믿고 데이터는 없다. 전 코드베이스 점검에서
 * 그런 쓰기가 **111곳**이었다(2026-09-08).
 *
 * 이 저장소는 이미 한 번 당했다 — `setOccurrenceOrders` 에 남아 있는 주석:
 * «초기 구현이 결과를 버려, 테이블 미적용 상태에서 저장이 조용히 실패했다. 화면은 낙관적으로
 * 바뀌고 새로고침하면 되돌아가는데 아무 단서가 없었다.»
 *
 * **111곳을 기계적으로 고치지는 않았다.** 대부분은 감사 로그·알림·읽음 표시처럼 실패해도 본 흐름을
 * 막을 이유가 없는 부수 기록이고, 그런 곳에 조기 반환을 심으면 오히려 정상 동작을 깨뜨린다.
 * 대신 위험도로 갈라 다룬다:
 *
 * - **`mustWrite`** — 실패하면 진행하면 안 되는 쓰기. 특히 **되돌릴 수 없는 후속 작업 앞**에서
 *   쓴다(계정 삭제의 묘비 처리, 섹션 삭제 전 하위 작업 정리). false 를 돌려주므로 호출부가
 *   중단·에러 리다이렉트를 선택한다.
 * - **`bestEffortWrite`** — 실패해도 본 흐름은 계속하되 **조용하지는 않게**. 감사 로그·부수 기록용.
 *
 * 새 쓰기를 추가할 때 «그냥 await» 는 쓰지 말 것. 둘 중 하나를 고르는 것 자체가 «이 실패가
 * 중요한가» 를 명시하는 일이다.
 */

/** Supabase 쓰기 결과의 최소 형태. 빌더는 thenable 이라 그대로 넘기면 된다. */
type WriteOutcome = { error: { message: string } | null };

/**
 * 실패하면 `false`. **호출부는 반드시 반환값을 보고 분기해야 한다** — 특히 그 다음 줄이 되돌릴 수
 * 없는 작업이라면.
 *
 * `label` 은 로그에만 쓰인다. 「무엇을 저장하려다 실패했는가」가 드러나게 적을 것.
 */
export async function mustWrite(label: string, write: PromiseLike<WriteOutcome>): Promise<boolean> {
  const { error } = await write;
  if (error) {
    console.error(`[db-write] ${label} failed:`, error.message);
    return false;
  }
  return true;
}

/**
 * 실패해도 진행하되 로그는 남긴다. 감사 로그·알림·읽음 표시처럼 **본 흐름을 막을 이유가 없는**
 * 부수 기록에만 쓴다. 사용자에게 보이는 주 데이터에는 `mustWrite` 를 쓸 것.
 */
export async function bestEffortWrite(
  label: string,
  write: PromiseLike<WriteOutcome>,
): Promise<boolean> {
  const { error } = await write;
  if (error) {
    console.warn(`[db-write] ${label} failed (continuing):`, error.message);
    return false;
  }
  return true;
}
