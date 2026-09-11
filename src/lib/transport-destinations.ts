/**
 * 교통비 「출근지」 — **순수 모듈. 서버 import 없음** (2026-09-11).
 *
 * 입력 화면(클라이언트)과 저장 경로(서버)가 **같은 키와 같은 판정**을 써야 한다. 특히
 * `transportDestinationRequiresMemo` 가 갈라지면 화면은 통과시키고 서버는 거절하는(또는 그
 * 반대) 상태가 된다. 목록을 실제로 읽어오는 쪽은 `transport-destinations-server.ts` 다.
 *
 * ## 왜 만들었나
 *
 * 예전에는 출근지가 **코드에 박힌 문자열 목록**이었다(`transport-statement.tsx` 의
 * `BUILDING_KEYS`). 그래서 두 가지가 동시에 틀어져 있었다.
 *
 * 1. **새로 연 건물이 목록에 없었다.** 2026-09 에 문을 연 STAY ARI Apartment Hotel 로 출근한
 *    알바생은 고를 항목 자체가 없었다. 목록에는 대신 `스카이` 가 있었는데, 그건 같은 건물의
 *    **오픈 전 이름**이었다.
 * 2. **저장되는 값이 「번역된 라벨」이었다.** 일본어로 쓰는 직원이 고르면 `高田馬場`, 한국어면
 *    `다카다노바바` 가 저장된다 — 같은 건물이 언어별로 다른 값이 된다. 금액을 기억하려면 이 값을
 *    키로 삼아야 하는데 키로 쓸 수가 없었다.
 *
 * 그래서 **캘린더가 쓰는 건물 목록과 같은 곳**에서 가져온다. 건물이 늘면 따라오고, 저장은 라벨이
 * 아니라 `property_id` 로 한다.
 *
 * ## 목록의 구성
 *
 * - **건물** — Beds24 에서 동기화된 운영 건물. 사노는 운영 대상이 아니라 빠진다(캘린더와 동일
 *   기준: `isExcludedOperationalProperty`).
 * - **사무실** — 건물이 아니지만 출근한다. `property_id` 가 없으므로 고정 키로 구분한다.
 * - **기타** — 건물 외 영수증(가끔 있다). **메모가 필수다** — 어디에 왜 썼는지가 없으면 나중에
 *   정산할 수가 없다.
 */

/** 저장·조회에 쓰는 안 흔들리는 키. 건물은 `property_id`, 나머지는 고정값. */
export const TRANSPORT_OFFICE_KEY = "office";
export const TRANSPORT_OTHER_KEY = "other";

export type TransportDestination = {
  /** 금액 기억과 저장에 쓰는 키. 건물이면 `property_id`. */
  key: string;
  /** 화면에 보이는 이름(로케일 반영). 저장 키로 쓰지 말 것. */
  label: string;
  /** 건물이면 `properties.id`, 사무실·기타는 null. */
  propertyId: string | null;
  kind: "property" | "office" | "other";
};

/** `기타` 는 메모가 없으면 저장할 수 없다. 화면과 서버가 같은 판정을 쓴다. */
export function transportDestinationRequiresMemo(key: string): boolean {
  return key === TRANSPORT_OTHER_KEY;
}
