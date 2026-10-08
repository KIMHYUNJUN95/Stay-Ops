/**
 * 매출 비교(A vs B) — 건물 나누기 · 차이 분해(브리지) · 눈금 · 요점 재료. **순수하다.**
 *
 * 도메인 계약: docs/product/34-metrics-and-automation.md 「매출 비교」
 *
 * 칸(`RevenueCell`)은 매출 화면과 같은 식으로 서버가 낸 것(`getOpsRevenueCompareData`). 여기는 합계에 넣을 건물을
 * 골라 더하고, B → A 차이를 「기존 건물의 변화 + 새로 판 건물 + 판매가 없어진 건물」로 나눈다.
 */

import { sumMetrics, type RevenueCell, type RevenueMetrics } from "@/lib/ops-revenue";

export type CompareCells = Record<string, RevenueCell | undefined>;

/** 그 기간에 팔았나 — 판매 박이나 매출이 있으면. */
export function hasSales(cell: RevenueCell | undefined): boolean {
  return !!cell && (cell.occupiedNights > 0 || cell.revenue !== 0);
}

export type CompareGroups = {
  /** 두 기간 모두 판 건물. */
  existing: string[];
  /** A 에만 판 건물(새로 열었거나 그동안 쉬었던). */
  fresh: string[];
  /** B 에만 판 건물. */
  closed: string[];
};

export function groupProperties(names: readonly string[], a: CompareCells, b: CompareCells): CompareGroups {
  const groups: CompareGroups = { closed: [], existing: [], fresh: [] };
  for (const name of names) {
    const inA = hasSales(a[name]);
    const inB = hasSales(b[name]);
    if (inA && inB) groups.existing.push(name);
    else if (inA) groups.fresh.push(name);
    else if (inB) groups.closed.push(name);
  }
  return groups;
}

export const totalOf = (names: readonly string[], cells: CompareCells): RevenueMetrics => sumMetrics(names.map((name) => cells[name]));

export type BridgeStep = {
  kind: "B" | "A" | "up" | "down";
  /** 무엇의 몫인가 — 화면이 문구를 고른다. */
  role: "totalB" | "totalA" | "existing" | "fresh" | "freshOther" | "closed";
  /** `fresh` · `closed` 는 건물 이름, `freshOther` 는 묶인 건물들. */
  names: string[];
  /** 막대 아래 · 위(누적 금액). 합계 막대는 `from = 0`. */
  from: number;
  to: number;
};

/**
 * B 합계 → 기존 건물 변화 → 새로 판 건물(큰 순, `maxFresh` 개 넘으면 나머지는 하나로) → 판매가 없어진 건물 → A 합계.
 * 몫이 0 인 단계는 뺀다. 마지막 누적은 언제나 A 합계와 같다(테스트로 고정).
 */
export function buildBridge(groups: CompareGroups, a: CompareCells, b: CompareCells, maxFresh = 3): BridgeStep[] {
  const bTotal = totalOf([...groups.existing, ...groups.closed], b).revenue;
  const aTotal = totalOf([...groups.existing, ...groups.fresh], a).revenue;
  const steps: BridgeStep[] = [{ from: 0, kind: "B", names: [], role: "totalB", to: bTotal }];
  let running = bTotal;
  const push = (role: BridgeStep["role"], names: string[], delta: number) => {
    if (delta === 0) return;
    steps.push({ from: running, kind: delta >= 0 ? "up" : "down", names, role, to: running + delta });
    running += delta;
  };
  push("existing", groups.existing, totalOf(groups.existing, a).revenue - totalOf(groups.existing, b).revenue);
  const fresh = [...groups.fresh].sort((x, y) => (a[y]?.revenue ?? 0) - (a[x]?.revenue ?? 0));
  const head = fresh.length > maxFresh ? fresh.slice(0, maxFresh - 1) : fresh;
  for (const name of head) push("fresh", [name], a[name]?.revenue ?? 0);
  const rest = fresh.slice(head.length);
  if (rest.length > 0) push("freshOther", rest, totalOf(rest, a).revenue);
  if (groups.closed.length > 0) push("closed", groups.closed, -totalOf(groups.closed, b).revenue);
  steps.push({ from: 0, kind: "A", names: [], role: "totalA", to: aTotal });
  return steps;
}

/** 1 · 2 · 5 × 10ⁿ 중 `raw` 이상인 가장 작은 값. */
export function niceUnit(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) {
    const unit = m * 10 ** exp;
    if (unit >= raw) return unit;
  }
  return 10 ** (exp + 1);
}

/**
 * 브리지 눈금 — 작은 차이가 보이게 0 이 아니라 **누적 최솟값 근처부터** 시작한다(합계 막대 아래는 물결 = 생략).
 * 최솟값이 최댓값의 35% 아래면 0 부터(잘라 낼 이유가 없다). 눈금 칸은 4개 안팎.
 */
export function bridgeScale(steps: readonly BridgeStep[]): { base: number; top: number; unit: number; ticks: number[] } {
  const values = steps.flatMap((step) => (step.kind === "A" || step.kind === "B" ? [step.to] : [step.from, step.to]));
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const unit = niceUnit(max / 5);
  const top = Math.ceil((max * 1.04) / unit) * unit;
  let base = Math.floor((min * 0.85) / unit) * unit;
  if (base < 0 || min < max * 0.35) base = 0;
  const ticks: number[] = [];
  for (let v = base; v <= top + 0.5; v += unit) ticks.push(v);
  return { base, ticks, top, unit };
}

/** 0 이 아니면 증감률(%), B 가 0 이면 `null`. */
export function changePctOrNull(a: number, b: number): number | null {
  return b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null;
}

/** 기존 건물 중 매출 증감률이 가장 큰 건물(늘어난 쪽 우선, 하나도 없으면 가장 적게 줄어든 쪽 대신 가장 크게 줄어든 쪽). */
export function topMover(existing: readonly string[], a: CompareCells, b: CompareCells): { name: string; pct: number } | null {
  const moves = existing
    .map((name) => ({ name, pct: changePctOrNull(a[name]?.revenue ?? 0, b[name]?.revenue ?? 0) }))
    .filter((move): move is { name: string; pct: number } => move.pct !== null);
  if (moves.length === 0) return null;
  const up = moves.filter((move) => move.pct > 0).sort((x, y) => y.pct - x.pct);
  if (up.length > 0) return up[0];
  return [...moves].sort((x, y) => x.pct - y.pct)[0];
}
