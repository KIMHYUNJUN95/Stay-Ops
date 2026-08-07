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

// ── 세부 점수(rating_breakdown) 표시 ──────────────────────────────────────
//
// 모바일 상세와 어드민 상세 패널이 같은 로직을 두 벌 들고 있던 것을 여기로 합쳤다.
// 저장된 `rating_breakdown`은 플랫폼 원본 구조·키 그대로 두고(공통 스키마로 정규화하지
// 않는다 — docs/product/25-complaint-workflow.md), **표시 라벨만** 사전으로 현지화한다.

export type ReviewBreakdownRow = { key: string; label: string; value: string };

/**
 * Booking.com `scoring{}` 이 실제로 주는 항목 (2026-08-07 실측, 리뷰 253건 전수 조사).
 *
 * 기획 초안에 있던 `services` 는 **payload 에 존재하지 않는다** — 253건 전부에 없어 상세에
 * 빈 줄만 만들고 있었다. 반대로 `comfort` 는 245건에 값이 있는데 목록에 없어 읽히지 않고
 * 버려지고 있었다. 실측 키로 맞춘다.
 *
 * 순서는 화면 표시 순서다. 값이 없는 항목은 «—»로 자리만 남긴다 — 항목이 사라지면 그 리뷰만
 * 줄 수가 달라져 비교가 어려워진다.
 */
export const BOOKING_SCORING_KEYS = [
  "clean",
  "comfort",
  "facilities",
  "location",
  "staff",
  "value",
] as const;

/** 사전에 없는 항목은 최소한 읽을 수 있게만 만든다 (`check_in` → `Check In`). */
function humanizeKey(key: string): string {
  return key.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** `check_in` / `checkIn` / `Check-In`이 모두 같은 사전 항목을 찾도록 한다. */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function labelFor(key: string, labels: Record<string, string>): string {
  return labels[normalizeKey(key)] ?? humanizeKey(key);
}

/**
 * `rating_breakdown` 원본을 플랫폼별로 파싱해 표시용 행으로 만든다.
 * Airbnb는 `category_ratings[]`, Booking.com은 `scoring{...}` — 둘을 합치지 않는다.
 *
 * @param labels `dictionary.complaints.breakdownLabels` (정규화된 소문자 키 → 현지화 라벨)
 */
export function parseReviewBreakdown(
  provider: ReviewProvider,
  raw: unknown,
  labels: Record<string, string>,
): ReviewBreakdownRow[] {
  if (!raw || typeof raw !== "object") return [];

  if (provider === "airbnb") {
    const categories = (raw as { category_ratings?: unknown }).category_ratings;
    if (!Array.isArray(categories)) return [];
    const rows: ReviewBreakdownRow[] = [];
    for (const entry of categories) {
      if (!entry || typeof entry !== "object") continue;
      const category = (entry as { category?: unknown }).category;
      const rating = (entry as { rating?: unknown }).rating;
      if (typeof category !== "string") continue;
      rows.push({
        key: category,
        label: labelFor(category, labels),
        value: typeof rating === "number" ? String(rating) : "—",
      });
    }
    return rows;
  }

  const scoring = (raw as { scoring?: unknown }).scoring;
  if (!scoring || typeof scoring !== "object") return [];
  return BOOKING_SCORING_KEYS.map((key) => {
    const value = (scoring as Record<string, unknown>)[key];
    return {
      key,
      label: labelFor(key, labels),
      value: typeof value === "number" ? String(value) : "—",
    };
  });
}
