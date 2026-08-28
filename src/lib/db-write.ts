import type { Database } from "@/types/database";

/**
 * Supabase 쓰기 페이로드를 **타입 검사받게** 하는 얇은 헬퍼.
 *
 * **왜 필요한가.** `src/types/database.ts` 는 손으로 유지하는 파일이라 각 테이블에 `Relationships`
 * 가 없다. 그래서 `@supabase/supabase-js` v2 의 스키마 제약(`GenericSchema`)을 만족하지 못하고,
 * `.insert()` / `.update()` 의 인자 타입이 `never` 로 무너진다. 그 결과 호출부마다 `as never` 를
 * 붙이게 됐고 — 투두 기능에서만 83곳 — **컬럼명 오타나 타입 불일치가 컴파일에서 안 걸린다.**
 *
 * 실제로 이 구멍이 다른 기능에서 사고를 냈다: `attendance-finalization.ts` 는 존재하지 않는
 * `target_month` 컬럼으로 필터를 걸고 있었고(조회가 조용히 빈 결과), 알림 생성은 DB enum 에 없는
 * `bug_report_activity` 를 넣고 있었다. 둘 다 타입이 살아 있었다면 컴파일에서 잡혔다.
 *
 * **근본 해법은 타입 재생성이다**(`Relationships` 포함). 다만 그때 위 두 건 같은 실제 결함이
 * 컴파일 에러로 드러나므로 별도 작업으로 다룬다. 그전까지는 이 헬퍼로 **거짓말을 한 곳에 가둔다** —
 * 인자는 진짜 `Insert`/`Update` 타입으로 검사받고, `never` 캐스트는 여기서만 일어난다.
 *
 * 테이블 이름을 `.from()` 과 여기 두 번 쓰는 것은 의도적이다. 그 인자가 없으면 어떤 테이블의
 * 스키마로 검사할지 알 수 없다.
 */

type Tables = Database["public"]["Tables"];
type TableName = keyof Tables;

/**
 * `.insert(insertRow("tasks", {...}))` — 인자가 그 테이블의 `Insert` 타입으로 검사된다.
 * 반환 타입이 `never` 인 것은 무너진 클라이언트 타입에 그대로 끼우기 위해서다.
 */
export function insertRow<T extends TableName>(_table: T, value: Tables[T]["Insert"]): never {
  return value as never;
}

/** 여러 행 삽입. `.insert(insertRows("task_participants", rows))` */
export function insertRows<T extends TableName>(_table: T, values: Tables[T]["Insert"][]): never {
  return values as never;
}

/** `.update(updateRow("tasks", {...}))` — 부분 갱신이라 `Update` 타입으로 검사된다. */
export function updateRow<T extends TableName>(_table: T, value: Tables[T]["Update"]): never {
  return value as never;
}

/** `.upsert(upsertRow("task_occurrence_state", row), { onConflict })` — 단건. */
export function upsertRow<T extends TableName>(_table: T, value: Tables[T]["Insert"]): never {
  return value as never;
}

/** `.upsert(upsertRows("task_occurrence_state", rows), { onConflict })` */
export function upsertRows<T extends TableName>(_table: T, values: Tables[T]["Insert"][]): never {
  return values as never;
}
