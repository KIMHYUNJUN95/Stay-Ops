import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource, RatingPill, PLATFORMS } from "./cx-platform";
import { getDictionary } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
import type {
  ExternalReview,
  ReviewBuildingOption,
  ReviewProvider,
} from "@/lib/external-reviews";

/** 한 페이지에 보여줄 리뷰 수. 카드가 본문을 전량 노출해 세로가 길어 20건이 상한선이다. */
export const REVIEW_PAGE_SIZE = 20;

const PROVIDERS: ("all" | ReviewProvider)[] = ["all", "airbnb", "booking"];

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(iso));
}

type Props = {
  locale: string;
  reviews: ExternalReview[];
  /** 필터 적용 후 전체 건수 — 페이지 수 계산용. */
  total: number;
  page: number;
  buildings: ReviewBuildingOption[];
  provider: "all" | ReviewProvider;
  riskOnly: boolean;
  building: string;
};

/**
 * External Reviews — Screen 1 (read-only list).
 *
 * **서버 컴포넌트다.** 필터·페이지가 전부 쿼리스트링이라 클라이언트 상태가 필요 없고, 그래서
 * 이 화면은 클라이언트 번들에서 통째로 빠진다. 예전에는 서버가 최신 500건을 내려보내고
 * 클라이언트가 걸렀는데, 리뷰 2,400건 중 나머지는 화면에 존재하지도 않았다.
 *
 * See docs/product/25-complaint-workflow.md.
 */
export function ReviewList({
  locale,
  reviews,
  total,
  page,
  buildings,
  provider,
  riskOnly,
  building,
}: Props) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const buildingLabels = dict.cleaning.buildingLabels;

  const totalPages = Math.max(Math.ceil(total / REVIEW_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  /** 컨트롤을 누르면 페이지는 항상 1로 돌아간다 — 3페이지에서 필터를 바꾸면 빈 화면이 된다. */
  function hrefWith(patch: Record<string, string | null>, keepPage = false): string {
    const params = new URLSearchParams({ view: "reviews" });
    if (provider !== "all") params.set("provider", provider);
    if (riskOnly) params.set("risk", "1");
    if (building !== "all") params.set("building", building);
    if (keepPage && currentPage > 1) params.set("page", String(currentPage));
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `/mobile/complaints?${params.toString()}`;
  }

  return (
    <div className="cx">
      <div className="cx-lhead">
        <h2>{t.viewReviews}</h2>
      </div>

      <div className="cx-fchips">
        {PROVIDERS.map((p) => {
          const on = provider === p;
          const href = hrefWith({ provider: p === "all" ? null : p, page: null });
          return (
            <Link key={p} href={href} className={`cx-fchip${on ? " on" : ""}`} scroll={false}>
              {p === "all" ? (
                t.filterAll
              ) : (
                <>
                  <span className="d" style={{ background: PLATFORMS[p].solid }} />
                  {PLATFORMS[p].name}
                </>
              )}
            </Link>
          );
        })}
        <Link
          href={hrefWith({ risk: riskOnly ? null : "1", page: null })}
          className={`cx-fchip${riskOnly ? " on" : ""}`}
          scroll={false}
        >
          {t.riskOnly}
        </Link>
      </div>

      {buildings.length > 1 && (
        <div className="cx-fchips">
          <Link
            href={hrefWith({ building: null, page: null })}
            className={`cx-fchip${building === "all" ? " on" : ""}`}
            scroll={false}
          >
            {t.allBuildings}
          </Link>
          {buildings.map((item) => (
            <Link
              key={item.value}
              href={hrefWith({ building: item.value, page: null })}
              className={`cx-fchip${building === item.value ? " on" : ""}`}
              scroll={false}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}

      <div className="cx-list">
        {reviews.length === 0 ? (
          <div className="cx-empty">{t.reviewsEmptyTitle}</div>
        ) : (
          reviews.map((review) => {
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

      {/* 페이지 컨트롤. 전체가 한 페이지에 들어가면 그리지 않는다. */}
      {totalPages > 1 && (
        <nav className="cx-pager" aria-label={t.viewReviews}>
          {currentPage > 1 ? (
            <Link
              className="cx-pager__btn"
              href={hrefWith({ page: currentPage - 1 === 1 ? null : String(currentPage - 1) })}
            >
              <CIc>{CxIcon.chevL}</CIc>
              {t.pagerPrev}
            </Link>
          ) : (
            <span className="cx-pager__btn is-off">
              <CIc>{CxIcon.chevL}</CIc>
              {t.pagerPrev}
            </span>
          )}

          <span className="cx-pager__pos">
            <b className="mono">{currentPage}</b>
            <span className="sep">/</span>
            <span className="mono">{totalPages}</span>
            <span className="cx-pager__total">{t.pagerTotal.replace("{n}", String(total))}</span>
          </span>

          {currentPage < totalPages ? (
            <Link className="cx-pager__btn" href={hrefWith({ page: String(currentPage + 1) })}>
              {t.pagerNext}
              <CIc>{CxIcon.chevR}</CIc>
            </Link>
          ) : (
            <span className="cx-pager__btn is-off">
              {t.pagerNext}
              <CIc>{CxIcon.chevR}</CIc>
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
