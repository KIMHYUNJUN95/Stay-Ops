/**
 * 판매 캘린더의 **건물 다중 선택**(2026-09-30) — 순수 헬퍼.
 *
 * 도메인 계약: docs/product/33-calendar-write-features.md 「건물 여러 곳 함께 보기」
 *
 * - URL 은 `property` 를 **반복**한다(`?property=A&property=B`). 하나만 고르면 예전과 똑같이
 *   `?property=A` 다 — 옛 링크가 그대로 산다.
 * - 고른 목록은 항상 **탭 순서**(`propertyOptions`)로 정렬한다. 누른 순서가 아니다 — 격자가 건물을
 *   탭 순서로 쌓으므로 URL 도 같은 순서여야 같은 화면이 같은 주소를 갖는다.
 * - 빈 목록 = 전체, 하나 = 그 건물만(예전 단일 선택), 둘 이상 = 그 건물들만 위아래로.
 */

/** Next 의 `searchParams` 값 — 키가 반복되면 배열로 온다. */
export type OpsSearchParamValue = string | string[] | undefined;

/** `searchParams.property` 를 문자열 목록으로. 앞뒤 공백을 자르고 빈 값·중복을 뺀다(순서는 들어온 대로). */
export function parsePropertyParam(raw: OpsSearchParamValue): string[] {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/** 요청된 건물 중 **실제 있는 건물만**, 탭 순서로. 하나도 안 맞으면 빈 목록(= 전체). */
export function resolveSelectedProperties(requested: readonly string[], options: readonly string[]): string[] {
  const wanted = new Set(requested);
  return options.filter((name) => wanted.has(name));
}

/**
 * 건물 하나를 넣거나 뺀다(체크 동그라미 · Ctrl/⌘/Shift + 클릭).
 *
 * 전체(빈 목록)에서 넣으면 그 건물 하나, 하나 남은 것을 빼면 전체로 돌아간다. 결과는 탭 순서.
 */
export function togglePropertySelection(
  selected: readonly string[],
  name: string,
  options: readonly string[],
): string[] {
  const next = new Set(selected);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  return resolveSelectedProperties([...next], options);
}

/**
 * 판매 캘린더 주소. 배열 값은 **키를 반복**해 싣는다(`URLSearchParams.append`) — 건물 이름에 공백·괄호·
 * 한자가 있어도 인코딩은 `URLSearchParams` 가 맡는다. 빈 문자열·`undefined` 는 뺀다.
 */
export function buildOpsCalendarHref(
  params: Record<string, OpsSearchParamValue>,
  basePath = "/admin/ops/calendar",
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      if (typeof item === "string" && item) query.append(key, item);
    }
  }
  return `${basePath}${query.size > 0 ? `?${query.toString()}` : ""}`;
}
