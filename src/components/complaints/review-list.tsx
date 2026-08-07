import Link from "next/link";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PLATFORMS } from "./cx-platform";
import { ReviewRangeChip } from "./review-range-chip";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
import { REVIEW_SCALE } from "@/lib/external-review-rules";
import type { ExternalReview, ReviewProvider } from "@/lib/external-reviews";

/** 한 페이지에 보여줄 리뷰 수. 카드가 본문을 전량 노출해 세로가 길어 20건이 상한선이다. */
export const REVIEW_PAGE_SIZE = 20;

/** 기간 칩 프리셋. 목업(2o)의 7 / 30 / 90 / 1년. */
export const RANGE_PRESET_DAYS = [7, 30, 90, 365];

const PROVIDERS: ("all" | ReviewProvider)[] = ["all", "airbnb", "booking"];

function formatShortDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(new Date(iso));
}

type Props = {
  locale: Locale;
  reviews: ExternalReview[];
  total: number;
  /** 현재 필터 안의 «문제» 건수 — 카운트 줄에 함께 보여 준다. */
  riskTotal: number;
  page: number;
  provider: "all" | ReviewProvider;
  riskOnly: boolean;
  from: string | null;
  to: string | null;
  rangeDays: number | null;
};

/**
 * External Reviews — S2 목록 (v2 디자인).
 *
 * **서버 컴포넌트다.** 필터·페이지가 전부 쿼리스트링이라 클라이언트 상태가 필요 없고, 이 화면은
 * 클라이언트 번들에서 통째로 빠진다(기간 시트만 별도 client 조각).
 *
 * 컨트롤은 **2줄로 고정**한다 — 플랫폼 3분할 + 위험도 2분할 + 기간을 한 줄에 넣으면 390px 에서
 * 각 항목이 44px 밑으로 떨어진다. 위험도 토글은 세 번째 컨트롤 바를 만드는 대신 카운트 줄
 * 오른쪽에 얹었다. 문제 수와 필터가 같은 줄에 있는 편이 의미도 맞는다.
 *
 * 본문은 **발췌하지 않고 전량** 노출한다. 말줄임으로는 문제 리뷰인지 판단할 수 없다.
 *
 * See docs/product/25-complaint-workflow.md.
 */
export function ReviewList({
  locale,
  reviews,
  total,
  riskTotal,
  page,
  provider,
  riskOnly,
  from,
  to,
  rangeDays,
}: Props) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const buildingLabels = dict.cleaning.buildingLabels;

  const totalPages = Math.max(Math.ceil(total / REVIEW_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);

  const baseParams: Record<string, string> = { view: "reviews" };
  if (provider !== "all") baseParams.provider = provider;
  if (riskOnly) baseParams.risk = "1";

  function hrefWith(patch: Record<string, string | null>, keepPage = false): string {
    const params = new URLSearchParams(baseParams);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (keepPage && currentPage > 1) params.set("page", String(currentPage));
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `/mobile/complaints?${params.toString()}`;
  }

  const hasFilters = provider !== "all" || riskOnly || Boolean(from) || Boolean(to);
  const rangeChipLabel = rangeDays
    ? t.rangeDays.replace("{n}", String(rangeDays))
    : from && to
      ? `${formatShortDate(from, locale)} – ${formatShortDate(to, locale)}`
      : t.rangeTitle;

  return (
    <div className="cx cx-reviews">
      {/* ── 컨트롤 1줄: 플랫폼 세그 + 기간 칩 ── */}
      <div className="cx-ctrlrow">
        <div className="cx-seg cx-seg--plat">
          {PROVIDERS.map((p) => (
            <Link
              key={p}
              href={hrefWith({ provider: p === "all" ? null : p, page: null })}
              className={provider === p ? "on" : undefined}
              scroll={false}
            >
              {p === "all" ? (
                t.filterAll
              ) : (
                <>
                  <span className="d" style={{ background: PLATFORMS[p].solid }} />
                  {PLATFORMS[p].name}
                </>
              )}
            </Link>
          ))}
        </div>
        <ReviewRangeChip
          from={from}
          to={to}
          locale={locale}
          baseParams={baseParams}
          labels={{
            chip: rangeChipLabel,
            title: t.rangeTitle,
            apply: dict.common.apply,
            clear: dict.common.clear,
            close: dict.common.close,
            previousMonth: t.rangePrevMonth,
            nextMonth: t.rangeNextMonth,
            selectStart: t.rangeHintStart,
            selectEnd: t.rangeHintEnd,
            summary: t.rangeSummary,
            presets: RANGE_PRESET_DAYS.map((days) => ({
              days,
              label: t.rangeDays.replace("{n}", String(days)),
            })),
          }}
        />
      </div>

      {/* ── 카운트 줄 + 문제만 토글 (세 번째 컨트롤 바를 만들지 않기 위해 여기에 얹었다) ── */}
      <div className="cx-countrow">
        <span className="cx-countrow__t">
          {t.viewReviews} <b className="mono">{total}</b>
          {riskTotal > 0 && (
            <>
              <span className="sep">·</span>
              {t.riskChip} <b className="mono is-bad">{riskTotal}</b>
            </>
          )}
        </span>
        <Link
          href={hrefWith({ risk: riskOnly ? null : "1", page: null })}
          className={`cx-riskpill${riskOnly ? " on" : ""}`}
          scroll={false}
        >
          {riskOnly && <CIc>{CxIcon.check}</CIc>}
          {t.riskOnly}
        </Link>
      </div>

      <div className="cx-rlist">
        {reviews.length === 0 ? (
          <div className="cx-rempty">
            <span className="cx-rempty__ic">
              <CIc>{CxIcon.chat}</CIc>
            </span>
            <div className="cx-rempty__t">{t.reviewsEmptyTitle}</div>
            <p className="cx-rempty__s">{t.reviewsEmptyBody}</p>
            {/* 빈 화면에서 다음 행동을 주지 않으면 사용자가 필터를 되돌릴 방법을 찾아야 한다. */}
            <div className="cx-rempty__acts">
              <Link className="cx-rempty__btn" href={hrefWith({ from: null, to: null, page: null })}>
                {t.emptyWiden}
              </Link>
              {hasFilters && (
                <Link className="cx-rempty__btn is-pri" href="/mobile/complaints?view=reviews">
                  {t.emptyReset}
                </Link>
              )}
            </div>
          </div>
        ) : (
          reviews.map((review) => {
            const scale = REVIEW_SCALE[review.provider];
            const plat = PLATFORMS[review.provider];
            const bad = review.riskLevel === "risk";
            const unrated = review.ratingValue === null;
            const hasBody = Boolean(
              review.reviewText || review.positiveReviewText || review.negativeReviewText,
            );
            return (
              <Link
                key={review.id}
                href={`/mobile/complaints/reviews/${review.id}`}
                className="cx-rcard"
              >
                <div className="cx-rcard__h">
                  <span className={`cx-score${bad ? " is-bad" : ""}${unrated ? " is-none" : ""}`}>
                    <b>{unrated ? "—" : review.ratingValue}</b>
                    <i>/ {scale}</i>
                  </span>
                  <div className="cx-rcard__hb">
                    <div className="cx-rcard__chips">
                      <span className="cx-psrc" style={{ background: plat.bg, color: plat.ink }}>
                        <span className="d" style={{ background: plat.solid }} />
                        {plat.name}
                      </span>
                      {bad && <span className="cx-risk-chip risk">{t.riskChip}</span>}
                      {unrated && <span className="cx-risk-chip unrated">{t.unratedChip}</span>}
                      {!hasBody && <span className="cx-risk-chip unrated">{t.scoreOnly}</span>}
                    </div>
                    {review.headline ? (
                      <div className="cx-rcard__t">{review.headline}</div>
                    ) : review.provider === "airbnb" ? (
                      <div className="cx-rcard__t is-dim">{t.noHeadlineAirbnb}</div>
                    ) : null}
                  </div>
                </div>

                {/* Booking 은 긍정/부정을 나눠 주고, Airbnb 는 본문 하나다. 어느 쪽이든 발췌하지 않는다. */}
                {hasBody && (
                  <div className="cx-rcard__body">
                    {review.positiveReviewText && (
                      <div className="cx-pn">
                        <span className="cx-pn__k is-pos">+</span>
                        <div>
                          <div className="cx-pn__l is-pos">{t.positiveLabel}</div>
                          <p className="cx-pn__b">{review.positiveReviewText}</p>
                        </div>
                      </div>
                    )}
                    {review.negativeReviewText && (
                      <div className="cx-pn">
                        <span className="cx-pn__k is-neg">−</span>
                        <div>
                          <div className="cx-pn__l is-neg">{t.negativeLabel}</div>
                          <p className="cx-pn__b">{review.negativeReviewText}</p>
                        </div>
                      </div>
                    )}
                    {review.reviewText && <p className="cx-rcard__plain">{review.reviewText}</p>}
                  </div>
                )}
                {!hasBody && <p className="cx-rcard__plain is-dim">{t.scoreOnlyNote}</p>}

                <div className="cx-rcard__f">
                  <span className="cx-rcard__place">
                    {review.propertyName
                      ? localizePropertyName(
                          getCanonicalPropertyName(review.propertyName),
                          buildingLabels,
                        )
                      : "—"}
                  </span>
                  <span className="sep">·</span>
                  <span className={review.displayRoomLabel ? undefined : "is-dim"}>
                    {review.displayRoomLabel ?? t.noRoom}
                  </span>
                  <span className="sep">·</span>
                  <span className="mono">{formatShortDate(review.reviewedAt, locale)}</span>
                  {review.linkedComplaintId ? (
                    <span className="cx-rcard__link is-on">
                      <CIc>{CxIcon.check}</CIc>
                      {t.linkedShort}
                    </span>
                  ) : (
                    <span className="cx-rcard__link">{t.notLinkedShort}</span>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>

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
