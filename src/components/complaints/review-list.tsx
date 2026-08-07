"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource, RatingPill, PLATFORMS } from "./cx-platform";
import { getDictionary } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
import type { ExternalReview, ReviewProvider } from "@/lib/external-reviews";

const PROVIDERS: ("all" | ReviewProvider)[] = ["all", "airbnb", "booking"];

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(iso));
}

// External Reviews — Screen 1 (read-only list). See docs/product/25-complaint-workflow.md.
// Sort order (risk -> lower score -> newest) comes from `listExternalReviews`; this component
// only applies client-side chip filters, mirroring ComplaintList's pattern.
export function ReviewList({ locale, reviews }: { locale: string; reviews: ExternalReview[] }) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const [provider, setProvider] = useState<"all" | ReviewProvider>("all");
  const [riskOnly, setRiskOnly] = useState(false);
  const [building, setBuilding] = useState<string>("all");

  /**
   * 건물명은 Beds24 원본(`Arakicho A`, `Okubo_A (B棟)` …)이 그대로 들어온다. 이건 운영자용
   * 식별자이지 사용자에게 보여줄 이름이 아니다 — 캘린더·청소가 쓰는 것과 같은 경로로
   * (정규화 → 로케일 라벨) 바꿔서 ko/ja/en 어디서든 읽히게 한다.
   *
   * 필터 값은 **정규화 이름**으로 잡는다. 같은 건물이 원본 표기만 다르게 여러 개 들어와도
   * 칩이 쪼개지지 않는다. 객실 라벨은 건드리지 않는다.
   */
  const buildingLabels = dict.cleaning.buildingLabels;

  const buildings = useMemo(() => {
    const byCanonical = new Map<string, string>();
    for (const review of reviews) {
      if (!review.propertyName) continue;
      const canonical = getCanonicalPropertyName(review.propertyName);
      if (!byCanonical.has(canonical)) {
        byCanonical.set(canonical, localizePropertyName(canonical, buildingLabels));
      }
    }
    return Array.from(byCanonical, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label, locale),
    );
  }, [reviews, buildingLabels, locale]);

  const rows = reviews.filter((review) => {
    if (provider !== "all" && review.provider !== provider) return false;
    if (riskOnly && review.riskLevel !== "risk") return false;
    if (building !== "all") {
      if (!review.propertyName) return false;
      if (getCanonicalPropertyName(review.propertyName) !== building) return false;
    }
    return true;
  });

  return (
    <div className="cx">
      <div className="cx-lhead">
        <h2>{t.viewReviews}</h2>
      </div>

      <div className="cx-fchips">
        {PROVIDERS.map((p) => {
          const on = provider === p;
          if (p === "all") {
            return (
              <button
                key={p}
                type="button"
                className={`cx-fchip${on ? " on" : ""}`}
                onClick={() => setProvider("all")}
              >
                {t.filterAll}
              </button>
            );
          }
          const def = PLATFORMS[p];
          return (
            <button
              key={p}
              type="button"
              className={`cx-fchip${on ? " on" : ""}`}
              onClick={() => setProvider(p)}
            >
              <span className="d" style={{ background: def.solid }} />
              {def.name}
            </button>
          );
        })}
        <button
          type="button"
          className={`cx-fchip${riskOnly ? " on" : ""}`}
          onClick={() => setRiskOnly((v) => !v)}
        >
          {t.riskOnly}
        </button>
      </div>

      {buildings.length > 1 && (
        <div className="cx-fchips">
          <button
            type="button"
            className={`cx-fchip${building === "all" ? " on" : ""}`}
            onClick={() => setBuilding("all")}
          >
            {t.allBuildings}
          </button>
          {buildings.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`cx-fchip${building === item.value ? " on" : ""}`}
              onClick={() => setBuilding(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="cx-list">
        {rows.length === 0 ? (
          <div className="cx-empty">{t.reviewsEmptyTitle}</div>
        ) : (
          rows.map((review) => {
            const hasBody = Boolean(
              review.reviewText || review.positiveReviewText || review.negativeReviewText,
            );
            const excerpt =
              review.negativeReviewText ?? review.reviewText ?? review.positiveReviewText ?? "";
            return (
              <Link
                key={review.id}
                href={`/mobile/complaints/reviews/${review.id}`}
                className="cx-card"
              >
                <div className="cx-card__b">
                  <div className="cx-card__top">
                    <PlatformSource plat={review.provider} dict={dict} />
                    {review.riskLevel === "risk" && (
                      <span className="cx-risk-chip risk">{t.riskChip}</span>
                    )}
                    {review.riskLevel === "unrated" && (
                      <span className="cx-risk-chip unrated">{t.unratedChip}</span>
                    )}
                    <span className="cx-card__date mono">
                      {formatDate(review.reviewedAt, locale)}
                    </span>
                  </div>
                  <div className="cx-card__t">
                    {review.headline || (hasBody ? excerpt : t.scoreOnlyNote)}
                  </div>
                  <div className="cx-card__meta">
                    <CIc>{CxIcon.building}</CIc>
                    {/* 칩과 카드가 다른 이름을 보이면 같은 건물인지 알 수 없다 — 같은 경로로 맞춘다.
                        객실 라벨은 운영 식별자 그대로 둔다. */}
                    {review.propertyName
                      ? localizePropertyName(
                          getCanonicalPropertyName(review.propertyName),
                          buildingLabels,
                        )
                      : "—"}
                    <span className="sep">·</span>
                    {review.roomLabel ?? t.noRoom}
                  </div>
                </div>
                <div className="cx-card__r">
                  <RatingPill plat={review.provider} rating={review.ratingValue} />
                  {review.linkedComplaintId && (
                    <span className="imgi">
                      <CIc>{CxIcon.check}</CIc>
                    </span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
