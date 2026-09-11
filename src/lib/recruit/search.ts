import type { ApplicationListRow } from "@/lib/recruit/applications";

/**
 * 지원자 목록 검색 (2026-09-11).
 *
 * **브라우저에서 돈다.** 예전에는 검색어를 쿼리스트링에 넣어 서버가 걸렀는데, 그러면 글자를
 * 지울 때 손에 있는 건 이미 좁혀진 목록뿐이라 서버 왕복이 끝나야 넓어졌다 — 「한 글자만 쳐도
 * 바로, 지우면 바로 전체」가 안 되던 원인이다. 목록은 탭 기준 전량이 이미 와 있으므로 여기서
 * 거르면 즉시 끝난다.
 *
 * 조건은 **서버가 쓰던 것과 같다** — 이름 또는 전화번호 부분일치, 대소문자 무시
 * (`applicant_name.ilike.%q%,phone.ilike.%q%`). 다른 조건을 쓰면 링크로 들어온 `?q=` 와 화면에서
 * 친 검색이 다른 결과를 낸다.
 *
 * 전화는 **뒤 4자리만** 비교한다. 목록에 그 4자리만 내려오기 때문이고, 그건 문서에 적힌 검색
 * 방식이기도 하다(`ApplicationListRow.phoneTail`).
 */
export function filterApplicationsBySearch<T extends Pick<ApplicationListRow, "name" | "phoneTail">>(
  rows: readonly T[],
  query: string,
): readonly T[] {
  const needle = query.trim().toLowerCase();
  // 공백만 친 경우도 「검색 안 함」이다 — 빈 목록을 보여주면 다 사라진 것처럼 보인다.
  if (!needle) return rows;
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) ||
      (row.phoneTail !== null && row.phoneTail.includes(needle)),
  );
}
