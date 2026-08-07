"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource } from "./cx-platform";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { getDictionary } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
import { REVIEW_SCALE, parseReviewBreakdown } from "@/lib/external-review-rules";
import type { ExternalReviewDetail } from "@/lib/external-reviews";
import type { TranslationPart } from "@/lib/review-translate";
import {
  convertReviewToComplaintAction,
  translateReviewPartAction,
} from "@/app/mobile/complaints/actions";

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
    new Date(iso),
  );
}

/** Only used to skip an obviously-redundant translate offer (Booking gives a source language). */
function isSameLanguage(sourceLanguageCode: string | null, locale: string): boolean {
  if (!sourceLanguageCode) return false;
  return sourceLanguageCode.trim().slice(0, 2).toLowerCase() === locale;
}

// External Reviews — Screen 2 (read-only detail). See docs/product/25-complaint-workflow.md.
export function ReviewDetail({
  review,
  locale,
  canConvert,
  initialTranslations,
}: {
  review: ExternalReviewDetail;
  locale: string;
  canConvert: boolean;
  initialTranslations: Partial<Record<TranslationPart, string>>;
}) {
  const dict = getDictionary(locale);
  const t = dict.complaints;
  const buildingLabels = dict.cleaning.buildingLabels;
  const router = useRouter();

  const scale = REVIEW_SCALE[review.provider];
  const hasBody = Boolean(
    review.reviewText || review.positiveReviewText || review.negativeReviewText,
  );
  // Sub-score labels are localized from the dictionary; the stored keys stay as the platform sent them.
  const breakdown = parseReviewBreakdown(review.provider, review.ratingBreakdown, t.breakdownLabels);

  // 원문 언어를 안정적으로 아는 건 Booking.com뿐이다(source_language_code). Airbnb는 항상
  // 자동 감지로 넘긴다 — 번역 여부를 미리 판단할 수 없으므로 버튼은 그대로 노출한다.
  const rawParts: { part: TranslationPart; text: string | null }[] = [
    { part: "headline", text: review.headline },
    { part: "review", text: review.provider === "airbnb" ? review.reviewText : null },
    { part: "positive", text: review.provider === "booking" ? review.positiveReviewText : null },
    { part: "negative", text: review.provider === "booking" ? review.negativeReviewText : null },
    { part: "private", text: review.provider === "airbnb" ? review.privateFeedback : null },
  ];
  const parts = rawParts.filter(
    (p): p is { part: TranslationPart; text: string } => Boolean(p.text),
  );

  const offerTranslate = parts.length > 0 && !isSameLanguage(review.sourceLanguageCode, locale);

  const [translations, setTranslations] =
    useState<Partial<Record<TranslationPart, string>>>(initialTranslations);
  const [showTranslation, setShowTranslation] = useState(false);
  const [translateError, setTranslateError] = useState(false);
  const [isTranslating, startTranslating] = useTransition();

  function textFor(part: TranslationPart, original: string | null): string | null {
    if (!original) return null;
    if (showTranslation && translations[part]) return translations[part] as string;
    return original;
  }

  function handleToggleTranslation() {
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    const missing = parts.filter((p) => !translations[p.part]);
    if (missing.length === 0) {
      setShowTranslation(true);
      return;
    }
    setTranslateError(false);
    startTranslating(async () => {
      const results = await Promise.all(
        missing.map(async (p) => ({
          part: p.part,
          res: await translateReviewPartAction(review.id, p.part, p.text, review.sourceLanguageCode),
        })),
      );
      setTranslations((prev) => {
        const next = { ...prev };
        for (const { part, res } of results) {
          if (res.status === "ok") next[part] = res.text;
        }
        return next;
      });
      setShowTranslation(true);
      if (results.every((r) => r.res.status !== "ok")) setTranslateError(true);
    });
  }

  const headlineText = textFor("headline", review.headline);

  const [showConvert, setShowConvert] = useState(false);
  const [convertError, setConvertError] = useState(false);
  const [isConverting, startConverting] = useTransition();
  const convertTitleRef = useRef<HTMLInputElement>(null);
  const convertBodyRef = useRef<HTMLTextAreaElement>(null);

  function handleConvert(close: () => void) {
    const title =
      convertTitleRef.current?.value.trim() || review.headline || review.propertyName || "";
    if (!title) {
      setConvertError(true);
      return;
    }
    setConvertError(false);
    startConverting(async () => {
      const res = await convertReviewToComplaintAction(
        review.id,
        title,
        convertBodyRef.current?.value ?? "",
      );
      if ("id" in res) {
        close();
        router.push(`/mobile/complaints/${res.id}`);
      } else {
        setConvertError(true);
      }
    });
  }

  return (
    <div className="cx cx-detail cx-rdetail">
      {/* 순서는 어드민 상세 패널과 동일하다 — 칩 → hero(점수+제목) → 세부 점수 → 본문 →
          비공개 → OTA 답글 → 문맥 → 전환. 두 화면이 다른 순서를 쓰면 같은 리뷰를 두고
          대화가 안 된다. */}
      <div className="cx-dsrc-row">
        <PlatformSource plat={review.provider} dict={dict} />
        {review.riskLevel === "risk" && <span className="cx-risk-chip risk">{t.riskChip}</span>}
        {review.riskLevel === "normal" && <span className="cx-risk-chip normal">{t.normalChip}</span>}
        {review.riskLevel === "unrated" && <span className="cx-risk-chip unrated">{t.unratedChip}</span>}
        <span className="time mono">{formatDate(review.reviewedAt, locale)}</span>
      </div>

      {/* hero — 점수는 판단의 시작점이라 가장 먼저·가장 크게. */}
      <div className="cx-hero">
        <span
          className={`cx-hero__score${review.riskLevel === "risk" ? " is-bad" : ""}${
            review.ratingValue == null ? " is-none" : ""
          }`}
        >
          <b>{review.ratingValue == null ? "—" : review.ratingValue}</b>
          <i>/ {scale}</i>
        </span>
        <div className="cx-hero__b">
          {headlineText ? (
            <h2 className="cx-hero__t">{headlineText}</h2>
          ) : review.provider === "airbnb" ? (
            <div className="cx-hero__t is-dim">{t.noHeadlineAirbnb}</div>
          ) : null}
          <div className="cx-hero__rule">
            {review.provider === "airbnb" ? t.riskRuleAirbnb : t.riskRuleBooking}
          </div>
        </div>
      </div>

      {breakdown.length > 0 && (
        <>
          <div className="cx-sechead">
            <span>{t.breakdownTitle}</span>
            <span className="opt">{t.breakdownSource}</span>
          </div>
          <div className="cx-kvcard">
            {breakdown.map((row) => (
              <div className="cx-kvrow" key={row.key}>
                <span className="cx-kvrow__k">{row.label}</span>
                <span className={`cx-kvrow__v mono${row.value === "—" ? " is-dim" : ""}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 본문 헤더 우측에 번역 컨트롤. 번역은 **이 리뷰 하나**에만, 누를 때만 실행된다 —
          목록·상세 어디서도 자동 번역하지 않는다(크레딧·정확성 둘 다의 이유). */}
      <div className="cx-sechead">
        <span>
          {review.provider === "airbnb" ? t.publicReview : t.reviewBody}
          {showTranslation && <span className="cx-trbadge">{t.translatedBadge}</span>}
        </span>
        {offerTranslate && (
          <button
            type="button"
            className={`cx-trbtn${showTranslation ? " is-plain" : ""}`}
            onClick={handleToggleTranslation}
            disabled={isTranslating}
          >
            {isTranslating ? (
              <>
                <span className="cx-spin" aria-hidden="true" />
                {t.translating}
              </>
            ) : (
              <>
                <CIc>{showTranslation ? CxIcon.undo : CxIcon.translate}</CIc>
                {showTranslation ? t.originalAction : t.translateAction}
              </>
            )}
          </button>
        )}
      </div>

      {translateError && (
        <div className="cx-trfail">
          <CIc>{CxIcon.warn}</CIc>
          <div>
            <div className="cx-trfail__t">{t.translateFailed}</div>
          </div>
          <button type="button" className="cx-trfail__retry" onClick={handleToggleTranslation}>
            {t.translateAction}
          </button>
        </div>
      )}

      {!hasBody ? (
        <div className="cx-bodycard is-dim">
          <span className="cx-risk-chip unrated">{t.scoreOnly}</span>
          <p className="cx-bodycard__b">{t.scoreOnlyNote}</p>
        </div>
      ) : (
        <>
          {review.positiveReviewText && (
            <div className="cx-bodycard">
              <div className="cx-bodycard__h">
                <span className="cx-pn__k is-pos">+</span>
                <span className="is-pos">{t.positiveLabel}</span>
              </div>
              <p className="cx-bodycard__b">{textFor("positive", review.positiveReviewText)}</p>
            </div>
          )}
          {review.negativeReviewText && (
            <div className="cx-bodycard">
              <div className="cx-bodycard__h">
                <span className="cx-pn__k is-neg">−</span>
                <span className="is-neg">{t.negativeLabel}</span>
              </div>
              <p className="cx-bodycard__b">{textFor("negative", review.negativeReviewText)}</p>
            </div>
          )}
          {review.reviewText && (
            <div className="cx-bodycard">
              <p className="cx-bodycard__b">{textFor("review", review.reviewText)}</p>
            </div>
          )}
        </>
      )}

      {/* 비공개 피드백 — v1 의 중립 회색은 약하다. 목적이 «직원이 공개 내용으로 오해하는 것»을
          막는 데 있으므로 경고 톤(앰버 + 점선)으로 올리고 출처와 각주를 함께 둔다. */}
      {review.provider === "airbnb" && review.privateFeedback && (
        <div className="cx-privcard">
          <div className="cx-privcard__h">
            <CIc>{CxIcon.lock}</CIc>
            <span className="cx-privcard__t">{t.privateFeedbackTitle}</span>
            <span className="cx-privcard__badge">{t.privateBadge}</span>
          </div>
          <div className="cx-privcard__from mono">{t.privateFrom}</div>
          <p className="cx-privcard__b">{textFor("private", review.privateFeedback)}</p>
          <p className="cx-privcard__note">{t.privateNote}</p>
        </div>
      )}

      {/* Booking.com OTA 답글 — 읽기 전용. StayOps 는 답글을 작성·전송하지 않는다.
          번역 대상도 아니다(review_translations 에 "reply" source_part 가 없다). */}
      {review.provider === "booking" && review.otaReplyText && (
        <div className="cx-bodycard cx-replycard">
          <div className="cx-bodycard__h">
            <span className="cx-replycard__t">{t.otaReply}</span>
            <span className="cx-risk-chip unrated">{t.readOnly}</span>
          </div>
          <p className="cx-bodycard__b">{review.otaReplyText}</p>
          <p className="cx-privcard__note">{t.otaReplyNote}</p>
        </div>
      )}

      <div className="cx-sechead">
        <span>{t.contextTitle}</span>
      </div>
      <div className="cx-kvcard">
        <div className="cx-kvrow">
          <span className="cx-kvrow__k">{t.metaBuilding}</span>
          <span className="cx-kvrow__v">
            {review.propertyName
              ? localizePropertyName(getCanonicalPropertyName(review.propertyName), buildingLabels)
              : "—"}
          </span>
        </div>
        <div className="cx-kvrow">
          <span className="cx-kvrow__k">{t.metaRoom}</span>
          <span className={`cx-kvrow__v${review.roomLabel ? "" : " is-dim"}`}>
            {review.roomLabel ?? t.noRoom}
          </span>
        </div>
        <div className="cx-kvrow">
          <span className="cx-kvrow__k">{dict.mobile.calendarReservationId}</span>
          {/* 제공자가 쓰는 예약 번호 — 운영자가 OTA 익스트라넷에서 검색할 수 있는 값이다. */}
          <span className={`cx-kvrow__v${review.sourceReservationId ? " mono" : " is-dim"}`}>
            {review.sourceReservationId ?? t.noReservationLink}
          </span>
        </div>
        <div className="cx-kvrow">
          <span className="cx-kvrow__k">{t.metaGuest}</span>
          <span className={`cx-kvrow__v${review.guestDisplayName ? "" : " is-dim"}`}>
            {review.guestDisplayName ?? t.noGuestName}
          </span>
        </div>
        <div className="cx-kvrow">
          <span className="cx-kvrow__k">{t.importedAt}</span>
          <span className="cx-kvrow__v mono">{formatDate(review.importedAt, locale)}</span>
        </div>
      </div>

      <div className="cx-convertzone">
        <div className="cx-note">
          <CIc>{CxIcon.info}</CIc>
          <span>{t.convertNote}</span>
        </div>
        {review.linkedComplaintId ? (
          <Link
            href={`/mobile/complaints/${review.linkedComplaintId}`}
            className="cx-prim-btn done-state"
          >
            <CIc>{CxIcon.check}</CIc>
            {t.viewLinkedComplaint}
          </Link>
        ) : canConvert ? (
          <button type="button" className="cx-prim-btn" onClick={() => setShowConvert(true)}>
            <CIc>{CxIcon.plus}</CIc>
            {t.convert}
          </button>
        ) : (
          // 권한이 없으면 버튼을 숨기지 않고 왜 못 하는지 말한다 — 없어진 버튼은 고장으로 읽힌다.
          <div className="cx-nopermit">
            <CIc>{CxIcon.lock}</CIc>
            <span>{t.noPermission}</span>
          </div>
        )}
      </div>

      {showConvert && (
        <BottomSheet ariaLabel={t.createTitle} onClose={() => setShowConvert(false)}>
          {({ close }) => (
            <div className="cx cx-sheet">
              <div className="cx-sheet__head">
                <p className="cx-sheet__title">{t.createTitle}</p>
              </div>
              <div className="cx-fsec">
                <div className="cx-fsec__h">
                  {t.fieldTitle} <span className="req">{t.required}</span>
                </div>
                <input
                  ref={convertTitleRef}
                  className="cx-fld"
                  placeholder={t.fieldTitle}
                  defaultValue={review.headline ?? ""}
                />
              </div>
              <div className="cx-fsec">
                <div className="cx-fsec__h">
                  {t.fieldBody} <span className="opt">{t.optional}</span>
                </div>
                <textarea ref={convertBodyRef} className="cx-fld" placeholder={t.fieldBodyPlaceholder} />
              </div>
              {convertError && <div className="cx-rate-none">{t.convertFailed}</div>}
              <button
                type="button"
                className="cx-submit"
                disabled={isConverting}
                onClick={() => handleConvert(close)}
              >
                <CIc>{CxIcon.check}</CIc>
                {t.submit}
              </button>
            </div>
          )}
        </BottomSheet>
      )}
    </div>
  );
}
