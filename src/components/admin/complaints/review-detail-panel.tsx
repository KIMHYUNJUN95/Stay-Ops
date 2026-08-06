import Link from "next/link";
import { Languages, RotateCcw, X } from "lucide-react";
import { convertReviewAction, translateReviewAction } from "@/app/admin/complaints/actions";
import { REVIEW_SCALE, type ExternalReviewDetail, type ReviewProvider } from "@/lib/external-reviews";
import { parseReviewBreakdown } from "@/lib/external-review-rules";
import type { TranslationPart } from "@/lib/review-translate";
import type { Dictionary } from "@/lib/i18n";

// 외부 리뷰 상세 패널 — 서버 컴포넌트. 콘솔과 마찬가지로 상태는 전부 쿼리스트링(review/tr)이고,
// 전환·번역은 서버 액션 폼으로만 일어난다. 클라이언트 상태를 새로 만들지 않는다.
// 도메인 계약: docs/product/25-complaint-workflow.md → "External Review Fields", "Review Translation"

const PROVIDER_LABEL: Record<ReviewProvider, string> = { airbnb: "Airbnb", booking: "Booking.com" };

export type ReviewPanelLabels = {
  building: string;
  room: string;
  reservation: string;
  guest: string;
  close: string;
};

type Props = {
  review: ExternalReviewDetail;
  copy: Dictionary["complaints"];
  labels: ReviewPanelLabels;
  closeHref: string;
  showTranslation: boolean;
  originalHref: string;
  translateRedirectTo: string;
  translations: Partial<Record<TranslationPart, string>>;
  canConvert: boolean;
  convertRedirectTo: string;
  linkedComplaintHref: string | null;
};

/** 토글이 켜져 있고 해당 파트의 저장된 번역이 있으면 번역문, 아니면 원문. 번역 실패는 조용히 원문으로. */
function textFor(
  part: TranslationPart,
  original: string | null,
  showTranslation: boolean,
  translations: Partial<Record<TranslationPart, string>>,
): string | null {
  if (!original) return null;
  if (showTranslation && translations[part]) return translations[part] as string;
  return original;
}

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="kv">
      <span className="kv__k">{label}</span>
      <span className="kv__v">{children}</span>
    </div>
  );
}

export function ReviewDetailPanel({
  review,
  copy,
  labels,
  closeHref,
  showTranslation,
  originalHref,
  translateRedirectTo,
  translations,
  canConvert,
  convertRedirectTo,
  linkedComplaintHref,
}: Props) {
  const scale = REVIEW_SCALE[review.provider];
  const hasBody = Boolean(review.reviewText || review.positiveReviewText || review.negativeReviewText);
  // 번역 버튼은 텍스트가 실제로 있을 때만 — 점수만 있는 리뷰에는 번역할 것이 없다.
  const hasTranslatableText = Boolean(
    review.reviewText ||
      review.positiveReviewText ||
      review.negativeReviewText ||
      review.headline ||
      review.privateFeedback,
  );
  // 세부 점수 라벨은 사전으로 현지화한다 — 저장된 원본 키·구조는 그대로다.
  const breakdown = parseReviewBreakdown(review.provider, review.ratingBreakdown, copy.breakdownLabels);

  const headlineText = textFor("headline", review.headline, showTranslation, translations);
  const publicText = textFor("review", review.reviewText, showTranslation, translations);
  const positiveText = textFor("positive", review.positiveReviewText, showTranslation, translations);
  const negativeText = textFor("negative", review.negativeReviewText, showTranslation, translations);
  const privateText = textFor("private", review.privateFeedback, showTranslation, translations);

  return (
    <>
      <Link href={closeHref} className="panel-scrim" aria-label={labels.close} data-panel-close />
      <aside className="panel" role="dialog" aria-label={copy.viewReviews}>
        <div className="panel__h">
          <div className="panel__top">
            <span className="panel__kicker">{copy.viewReviews}</span>
            <Link href={closeHref} className="panel__x" aria-label={labels.close} data-panel-close>
              <X />
            </Link>
          </div>
          <div className="panel__chips">
            <span className="rchip void">{PROVIDER_LABEL[review.provider]}</span>
            {review.riskLevel === "risk" ? <span className="rchip review">{copy.riskChip}</span> : null}
            {review.riskLevel === "normal" ? <span className="rchip void">{copy.normalChip}</span> : null}
            {review.riskLevel === "unrated" ? <span className="rchip void">{copy.unratedChip}</span> : null}
          </div>

          <div className="cxhero">
            <div className="cxhero__score">
              <span className={review.riskLevel === "risk" ? "cxhero__v is-bad" : "cxhero__v"}>
                {review.ratingValue === null ? "—" : review.ratingValue}
              </span>
              <span className="cxhero__scale">{`/ ${scale}`}</span>
            </div>
            {headlineText ? (
              <div className="cxhero__title">{headlineText}</div>
            ) : review.provider === "airbnb" ? (
              <div className="cxhero__title is-dim">{copy.noHeadlineAirbnb}</div>
            ) : null}
          </div>
        </div>

        <div className="panel__body">
          {breakdown.length > 0 ? (
            <div className="pblock">
              <div className="pblock__t cxbodyhead">
                <span>{copy.breakdownTitle}</span>
                <span className="cxsrc">{copy.breakdownSource}</span>
              </div>
              {breakdown.map((row) => (
                <Kv key={row.key} label={row.label}>
                  {row.value}
                </Kv>
              ))}
            </div>
          ) : null}

          <div className="pblock">
            <div className="pblock__t cxbodyhead">
              <span>
                {review.provider === "airbnb" ? copy.publicReview : copy.reviewBody}
                {/* 번역본을 보여줄 때는 그것이 자동 번역임을 반드시 밝힌다 —
                    docs/product/25-complaint-workflow.md → "Review Translation". */}
                {showTranslation ? <span className="cxsrc"> · {copy.translatedBadge}</span> : null}
              </span>
              {hasTranslatableText ? (
                showTranslation ? (
                  <Link
                    href={originalHref}
                    className="cxtrbtn"
                    aria-label={copy.originalAction}
                    title={copy.originalAction}
                  >
                    <RotateCcw aria-hidden="true" />
                  </Link>
                ) : (
                  <form action={translateReviewAction}>
                    <input type="hidden" name="reviewId" value={review.id} />
                    <input type="hidden" name="redirectTo" value={translateRedirectTo} />
                    <button
                      type="submit"
                      className="cxtrbtn"
                      aria-label={copy.translateAction}
                      title={copy.translateAction}
                    >
                      <Languages aria-hidden="true" />
                    </button>
                  </form>
                )
              ) : null}
            </div>

            {!hasBody ? (
              <div className="cxscoreonly">
                <span className="rchip void">{copy.scoreOnly}</span>
                <p>{copy.scoreOnlyNote}</p>
              </div>
            ) : review.provider === "booking" ? (
              <>
                {positiveText ? (
                  <div className="cxbodypart">
                    <div className="cxbodypart__t">{copy.positiveLabel}</div>
                    <p className="cxbodypart__b">{positiveText}</p>
                  </div>
                ) : null}
                {negativeText ? (
                  <div className="cxbodypart">
                    <div className="cxbodypart__t">{copy.negativeLabel}</div>
                    <p className="cxbodypart__b">{negativeText}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="cxbodypart__b">{publicText}</p>
            )}
          </div>

          {/* 비공개 피드백 — Airbnb 전용, 공개 리뷰와 반드시 시각적으로 분리한다 (점선 테두리 + warn 톤). */}
          {review.privateFeedback ? (
            <div className="cxprivate">
              <div className="cxprivate__top">
                <span className="rchip review">{copy.privateBadge}</span>
                <span className="cxprivate__from">{copy.privateFrom}</span>
              </div>
              <p className="cxprivate__body">{privateText}</p>
              <p className="cxprivate__note">{copy.privateNote}</p>
            </div>
          ) : null}

          {/* OTA 답글 — Booking.com 전용, 읽기 전용. StayOps에서 답글을 작성·전송하지 않는다. */}
          {review.otaReplyText ? (
            <div className="cxreply">
              <div className="cxreply__top">
                <span className="cxreply__t">{copy.otaReply}</span>
                <span className="rchip void">{copy.readOnly}</span>
              </div>
              <p className="cxreply__body">{review.otaReplyText}</p>
              <p className="cxreply__note">{copy.otaReplyNote}</p>
            </div>
          ) : null}

          <div className="pblock">
            <div className="pblock__t">{copy.contextTitle}</div>
            <Kv label={labels.building}>{review.propertyName ?? "—"}</Kv>
            <Kv label={labels.room}>{review.roomLabel ?? copy.noRoom}</Kv>
            {/* 제공자가 쓰는 예약 번호를 그대로 보여 준다 — 운영자가 OTA 익스트라넷에서 검색할 수
                있는 값이라야 의미가 있다. 우리 예약 행의 uuid는 노출하지 않는다. */}
            <Kv label={labels.reservation}>
              {review.sourceReservationId ? (
                <span className="mono">{review.sourceReservationId}</span>
              ) : (
                copy.noReservationLink
              )}
            </Kv>
            <Kv label={labels.guest}>{review.guestDisplayName ?? copy.noGuestName}</Kv>
            <Kv label={copy.importedAt}>
              <span className="mono">{review.importedAt.slice(0, 10)}</span>
            </Kv>
          </div>

          <div className="pblock">
            {review.linkedComplaintId && linkedComplaintHref ? (
              <Link href={linkedComplaintHref} className="cxlinked">
                <span className="rchip void">{copy.converted}</span>
              </Link>
            ) : canConvert ? (
              <form action={convertReviewAction}>
                <input type="hidden" name="reviewId" value={review.id} />
                <input type="hidden" name="redirectTo" value={convertRedirectTo} />
                <p className="cxconvertnote">{copy.convertNote}</p>
                <button type="submit" className="btn btn--pri cxconvertbtn">
                  {copy.convert}
                </button>
              </form>
            ) : (
              <p className="cxconvertnote">{copy.convertNote}</p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
