// External review scoring rules — pure domain values, safe on both server and client.
//
// This module deliberately has NO `server-only` marker and NO imports: the review scale and
// the risk thresholds are needed by server helpers (`external-reviews.ts`, the Beds24 sync)
// *and* by client components that render a score. Importing a value out of the server-only
// module from a client component drags the whole Supabase/`next/headers` chain into the
// browser bundle and fails the build, so the shared constants live here instead.
//
// Contract: docs/product/25-complaint-workflow.md → "Rating Risk Rules"

export type ReviewProvider = "airbnb" | "booking";
export type ReviewRiskLevel = "unrated" | "normal" | "risk";

/** 플랫폼별 원점수 척도. 두 값을 하나의 평균으로 합치지 않는다. */
export const REVIEW_SCALE: Record<ReviewProvider, number> = {
  airbnb: 5,
  booking: 10,
};

/**
 * 위험도 경계. **경계값은 위험 쪽에 포함**한다 (Airbnb 3점, Booking 7.0점은 `risk`).
 * 2026-08-04 확정 — 이전 초안의 Booking `critical`(<7.0) 단계는 폐기.
 */
const RISK_THRESHOLD: Record<ReviewProvider, number> = {
  airbnb: 3,
  booking: 7,
};

/**
 * 서버 단일 출처 위험도 계산. 사용자가 편집하는 값이 아니다.
 *
 * 점수가 없거나(본문만 있는 경우) 척도를 벗어나면 `unrated` — 평균에도 문제 건수에도
 * 넣지 않는다. Airbnb `overall_rating`은 API가 정수로 주므로 실질 위험 구간은 1~3이다.
 *
 * 클라이언트에서도 부를 수 있지만 **표시용으로만** 쓴다. 저장되는 `risk_level`은 항상
 * 수집 경로가 계산한 값이다.
 */
export function calcRiskLevel(
  provider: ReviewProvider,
  ratingValue: number | null | undefined,
): ReviewRiskLevel {
  if (ratingValue === null || ratingValue === undefined) return "unrated";
  if (!Number.isFinite(ratingValue)) return "unrated";
  const scale = REVIEW_SCALE[provider];
  if (ratingValue < 0 || ratingValue > scale) return "unrated";
  return ratingValue <= RISK_THRESHOLD[provider] ? "risk" : "normal";
}
