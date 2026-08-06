"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "./complaints.css";
import { CIc, CxIcon } from "./cx-icons";
import { PlatformSource } from "./cx-platform";
import { BottomSheet } from "@/components/shell/bottom-sheet";
import { getDictionary } from "@/lib/i18n";
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
    <div className="cx cx-detail">
      <div className="cx-dsrc-row">
        <PlatformSource plat={review.provider} dict={dict} />
        {review.riskLevel === "risk" && <span className="cx-risk-chip risk">{t.riskChip}</span>}
        {review.riskLevel === "normal" && <span className="cx-risk-chip normal">{t.normalChip}</span>}
        {review.riskLevel === "unrated" && <span className="cx-risk-chip unrated">{t.unratedChip}</span>}
        <span className="time mono">{formatDate(review.reviewedAt, locale)}</span>
      </div>

      {headlineText ? (
        <h2 className="cx-dtitle">{headlineText}</h2>
      ) : review.provider === "airbnb" ? (
        <div className="cx-rate-none" style={{ marginBottom: 14 }}>
          {t.noHeadlineAirbnb}
        </div>
      ) : null}

      <div className="cx-meta">
        <div className="cx-meta__row">
          <span className="cx-meta__l">
            <CIc>{CxIcon.star}</CIc>
            {t.metaRating}
          </span>
          <span className="cx-meta__v">
            {review.ratingValue == null ? "—" : t.ratingOf(review.ratingValue.toFixed(1), scale)}
          </span>
        </div>
      </div>

      {offerTranslate && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="cx-translate-btn"
            onClick={handleToggleTranslation}
            disabled={isTranslating}
          >
            <CIc>{CxIcon.translate}</CIc>
            {isTranslating ? t.translating : showTranslation ? t.originalAction : t.translateAction}
          </button>
          {showTranslation && <span className="opt">{t.translatedBadge}</span>}
          {translateError && <div className="cx-rate-none">{t.translateFailed}</div>}
        </div>
      )}

      {!hasBody ? (
        <div className="cx-fsec">
          <div className="cx-fsec__h">{t.scoreOnly}</div>
          <div className="cx-rate-none">{t.scoreOnlyNote}</div>
        </div>
      ) : review.provider === "booking" ? (
        <>
          {review.positiveReviewText && (
            <div className="cx-fsec">
              <div className="cx-fsec__h">{t.positiveLabel}</div>
              <div className="cx-dbody">{textFor("positive", review.positiveReviewText)}</div>
            </div>
          )}
          {review.negativeReviewText && (
            <div className="cx-fsec">
              <div className="cx-fsec__h">{t.negativeLabel}</div>
              <div className="cx-dbody">{textFor("negative", review.negativeReviewText)}</div>
            </div>
          )}
        </>
      ) : (
        <div className="cx-fsec">
          <div className="cx-fsec__h">{t.publicReview}</div>
          <div className="cx-dbody">{textFor("review", review.reviewText)}</div>
        </div>
      )}

      {/* Airbnb private feedback — visually separated from the public review, never merged in. */}
      {review.provider === "airbnb" && review.privateFeedback && (
        <div className="cx-fsec">
          <div className="cx-fsec__h">
            <span className="cx-priv-badge">{t.privateBadge}</span>
          </div>
          <div className="cx-priv-block">
            <div className="cx-dbody">{textFor("private", review.privateFeedback)}</div>
          </div>
          <div className="cx-rate-none">
            {t.privateFrom} · {t.privateNote}
          </div>
        </div>
      )}

      {/* Booking.com OTA reply — read only, StayOps never composes/sends one. Not translatable
          (review_translations has no "reply" source_part). */}
      {review.provider === "booking" && review.otaReplyText && (
        <div className="cx-fsec">
          <div className="cx-fsec__h">
            {t.otaReply} <span className="opt">{t.readOnly}</span>
          </div>
          <div className="cx-dbody">{review.otaReplyText}</div>
          <div className="cx-rate-none">{t.otaReplyNote}</div>
        </div>
      )}

      {breakdown.length > 0 && (
        <div className="cx-fsec">
          <div className="cx-fsec__h">
            {t.breakdownTitle} <span className="opt">{t.breakdownSource}</span>
          </div>
          <div className="cx-meta">
            {breakdown.map((row) => (
              <div className="cx-meta__row" key={row.key}>
                <span className="cx-meta__l">{row.label}</span>
                <span className="cx-meta__v">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cx-clabel">{t.contextTitle}</div>
      <div className="cx-meta">
        <div className="cx-meta__row">
          <span className="cx-meta__l">
            <CIc>{CxIcon.building}</CIc>
            {t.metaBuilding}
          </span>
          <span className="cx-meta__v">{review.propertyName ?? "—"}</span>
        </div>
        <div className="cx-meta__row">
          <span className="cx-meta__l">
            <CIc>{CxIcon.door}</CIc>
            {t.metaRoom}
          </span>
          <span className="cx-meta__v">{review.roomLabel ?? t.noRoom}</span>
        </div>
        <div className="cx-meta__row">
          <span className="cx-meta__l">
            <CIc>{CxIcon.cal}</CIc>
            {dict.mobile.calendarReservationId}
          </span>
          {/* The provider's own reservation number — the value staff can search on the OTA. */}
          <span className={review.sourceReservationId ? "cx-meta__v mono" : "cx-meta__v"}>
            {review.sourceReservationId ?? t.noReservationLink}
          </span>
        </div>
        <div className="cx-meta__row">
          <span className="cx-meta__l">
            <CIc>{CxIcon.person}</CIc>
            {t.metaGuest}
          </span>
          <span className="cx-meta__v">{review.guestDisplayName ?? t.noGuestName}</span>
        </div>
        <div className="cx-meta__row">
          <span className="cx-meta__l">{t.importedAt}</span>
          <span className="cx-meta__v mono">{formatDate(review.importedAt, locale)}</span>
        </div>
      </div>

      <div className="cx-divider" />

      {review.linkedComplaintId ? (
        <Link href={`/mobile/complaints/${review.linkedComplaintId}`} className="cx-prim-btn done-state">
          <CIc>{CxIcon.check}</CIc>
          {t.viewLinkedComplaint}
        </Link>
      ) : canConvert ? (
        <>
          <button type="button" className="cx-prim-btn" onClick={() => setShowConvert(true)}>
            <CIc>{CxIcon.plus}</CIc>
            {t.convert}
          </button>
          <div className="cx-rate-none" style={{ marginTop: 8 }}>
            {t.convertNote}
          </div>
        </>
      ) : null}

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
