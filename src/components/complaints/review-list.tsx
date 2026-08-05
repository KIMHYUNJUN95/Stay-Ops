"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource, RatingPill, PLATFORMS } from "./cx-platform";
import { getDictionary } from "@/lib/i18n";
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

  const buildings = useMemo(() => {
    const seen = new Set<string>();
    for (const review of reviews) {
      if (review.propertyName) seen.add(review.propertyName);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [reviews]);

  const rows = reviews.filter((review) => {
    if (provider !== "all" && review.provider !== provider) return false;
    if (riskOnly && review.riskLevel !== "risk") return false;
    if (building !== "all" && review.propertyName !== building) return false;
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
          {buildings.map((name) => (
            <button
              key={name}
              type="button"
              className={`cx-fchip${building === name ? " on" : ""}`}
              onClick={() => setBuilding(name)}
            >
              {name}
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
                    {review.propertyName ?? "—"}
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
