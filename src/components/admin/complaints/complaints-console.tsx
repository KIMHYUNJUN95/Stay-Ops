import Link from "next/link";
import { AlertTriangle, Inbox, MessageSquareWarning, Star, ThumbsDown, ThumbsUp, Unlink } from "lucide-react";
import { DateRangeFormField } from "@/components/admin/shared/date-range-form-field";
import { ReviewDetailPanel, type ReviewPanelLabels } from "@/components/admin/complaints/review-detail-panel";
import { ReviewDetailOverlay } from "@/components/admin/complaints/review-detail-overlay";
import { ManualComplaintList } from "@/components/admin/complaints/manual-complaint-list";
import { ComplaintCreateLauncher } from "@/components/admin/complaints/complaint-create-launcher";
import type { PlacePickRow, ReservationPickRow } from "@/lib/complaint-reservations";
import type { Complaint } from "@/lib/complaints";
import type {
  BuildingSummary,
  ExternalReview,
  ExternalReviewDetail,
  PlaceSummary,
  PlatformStat,
  ReviewListFilter,
} from "@/lib/external-reviews";
import { reviewRoomFallbackLabel } from "@/lib/external-review-rules";
import { REVIEW_SCALE } from "@/lib/external-reviews";
import type { TranslationPart } from "@/lib/review-translate";
import type { Dictionary, Locale } from "@/lib/i18n";
import { getCanonicalPropertyName, localizePropertyName } from "@/lib/room-label-normalization";
import "./complaints-console.css";

type ConsoleView = "manual" | "reviews" | "rooms";

type Props = {
  copy: Dictionary["complaints"];
  sharedCopy: Dictionary["admin"]["shared"];
  /**
   * `dictionary.cleaning.buildingLabels` — 캘린더·청소 콘솔과 같은 건물 표기를 쓰기 위해 받는다.
   * 리뷰 행의 `propertyName` 은 Beds24 원본 표기(`Okubo_A (B棟)`)라 그대로 보여 주면 안 된다.
   */
  buildingLabels: Record<string, string>;
  locale: Locale;
  view: ConsoleView;
  from: string;
  to: string;
  filter: ReviewListFilter;
  complaints: Complaint[];
  /** 수동 컴플레인 행별 삭제 버튼 노출 판단용 — 실제 권한은 서버가 다시 검증한다. */
  currentUserId: string;
  canModerate: boolean;
  /** 수동 컴플레인 직접 등록 진입점 노출 판단용 — 실제 권한은 서버 액션이 다시 검증한다. */
  canWrite: boolean;
  /** 등록 패널의 예약 연결 후보. */
  createReservations: ReservationPickRow[];
  /** 등록 패널의 건물·객실 직접 선택 후보 (Beds24를 거치지 않은 예약용). */
  createPlaces: PlacePickRow[];
  reviews: ExternalReview[];
  summaries: BuildingSummary[];
  selectedReview: ExternalReviewDetail | null;
  showTranslation: boolean;
  translations: Partial<Record<TranslationPart, string>>;
  canConvert: boolean;
  panelLabels: ReviewPanelLabels;
};

const LOCALE_TAG: Record<Locale, string> = { ko: "ko-KR", ja: "ja-JP", en: "en-US" };

const PROVIDER_LABEL: Record<"airbnb" | "booking", string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
};

function fill(template: string, n: number): string {
  return template.replace("{n}", String(n));
}

/** 원점수는 척도가 달라 서로 비교하지 않는다. 표시만 소수 1자리로 맞춘다. */
function fmtAvg(value: number | null): string | null {
  return value === null ? null : value.toFixed(1);
}

function ratioClass(ratio: number | null): string {
  if (ratio === null) return "cxratio__fill is-low";
  if (ratio >= 25) return "cxratio__fill";
  if (ratio >= 10) return "cxratio__fill is-mid";
  return "cxratio__fill is-low";
}

function queryOf(base: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** 한 플랫폼의 3칸(평균·리뷰·문제). 리뷰가 없으면 0점이 아니라 «리뷰 없음». */
function PlatformCells({
  stat,
  copy,
  leading,
}: {
  stat: PlatformStat;
  copy: Dictionary["complaints"];
  leading?: boolean;
}) {
  const average = fmtAvg(stat.average);
  const sepClass = leading ? "cxnum cxsep" : "cxnum";
  if (stat.reviewCount === 0) {
    return (
      <>
        <td className={sepClass}>
          <span className="cxdash">{copy.noReviewsShort}</span>
        </td>
        <td className="cxnum">
          <span className="cxdash">—</span>
        </td>
        <td className="cxnum">
          <span className="cxdash">—</span>
        </td>
      </>
    );
  }
  return (
    <>
      <td className={sepClass}>
        {average === null ? (
          <span className="cxdash">—</span>
        ) : (
          <span className={stat.riskCount > 0 ? "cxavg is-bad" : "cxavg"}>{average}</span>
        )}
      </td>
      <td className="cxnum">
        <span className="cxcount">{stat.reviewCount}</span>
      </td>
      <td className="cxnum">
        <span className={stat.riskCount > 0 ? "cxrisk" : "cxrisk is-zero"}>{stat.riskCount}</span>
      </td>
    </>
  );
}

function RatioCell({ place }: { place: PlaceSummary }) {
  const ratio = place.riskRatio;
  return (
    <td className="cxsep">
      <div className="cxratio">
        <span className="cxratio__bar">
          <span
            className={ratioClass(ratio)}
            style={{ width: `${Math.min(100, (ratio ?? 0) * 2)}%` }}
          />
        </span>
        <span className={ratio && ratio > 0 ? "cxratio__v" : "cxratio__v is-zero"}>
          {ratio === null ? "—" : `${ratio.toFixed(1)}%`}
        </span>
      </div>
    </td>
  );
}

export function ComplaintsConsole({
  copy,
  sharedCopy,
  buildingLabels,
  locale,
  view,
  from,
  to,
  filter,
  complaints,
  currentUserId,
  canModerate,
  canWrite,
  createReservations,
  createPlaces,
  reviews,
  summaries,
  selectedReview,
  showTranslation,
  translations,
  canConvert,
  panelLabels,
}: Props) {
  const openComplaints = complaints.filter((complaint) => complaint.status === "open").length;
  const riskReviews = reviews.filter((review) => review.riskLevel === "risk");
  const unlinked = riskReviews.filter((review) => !review.linkedComplaintId).length;
  const unratedTotal = summaries.reduce((sum, building) => sum + building.unratedCount, 0);
  const riskUnits = summaries.reduce((sum, building) => {
    if (building.standalone) return sum + (building.riskCount > 0 ? 1 : 0);
    return sum + building.rooms.filter((room) => room.riskCount > 0).length;
  }, 0);
  const airbnbCount = reviews.filter((review) => review.provider === "airbnb").length;
  const bookingCount = reviews.length - airbnbCount;

  const base = {
    from,
    to,
    provider: filter.provider,
    property: filter.propertyId,
    room: filter.roomId,
    risk: filter.riskOnly ? "1" : undefined,
  };

  const tabs: { id: ConsoleView; label: string }[] = [
    { id: "manual", label: copy.viewManual },
    { id: "reviews", label: copy.viewReviews },
    { id: "rooms", label: copy.viewRooms },
  ];

  // 상세 패널의 모든 이동은 현재 뷰/필터를 유지한 채 review(=id)/tr(번역 토글)만 얹거나 뗀다.
  const viewBase = { ...base, view };
  const closeHref = `/admin/complaints${queryOf(viewBase)}`;
  const reviewHref = (reviewId: string) => `/admin/complaints${queryOf({ ...viewBase, review: reviewId })}`;
  const originalHref = selectedReview ? reviewHref(selectedReview.id) : closeHref;
  const translateRedirectTo = selectedReview
    ? `/admin/complaints${queryOf({ ...viewBase, review: selectedReview.id, tr: "1" })}`
    : closeHref;
  const convertRedirectTo = selectedReview ? reviewHref(selectedReview.id) : closeHref;
  // 아직 어드민에 컴플레인 단건 상세가 없어, 연결된 컴플레인으로는 수동 컴플레인 목록으로 보낸다.
  const linkedComplaintHref = `/admin/complaints${queryOf({ ...base, view: "manual" })}`;

  return (
    <>
      <div className="opsbar opsbar--5">
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <MessageSquareWarning aria-hidden="true" />
            </span>
            {copy.kpiOpenLabel}
          </div>
          <div className={openComplaints > 0 ? "opscell__v" : "opscell__v is-muted"}>
            {openComplaints}
          </div>
          <div className="opscell__sub">{copy.kpiOpenSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Star aria-hidden="true" />
            </span>
            {copy.kpiReviewsLabel}
          </div>
          <div className={reviews.length > 0 ? "opscell__v" : "opscell__v is-muted"}>
            {reviews.length}
          </div>
          <div className="opscell__sub">{`Airbnb ${airbnbCount} · Booking ${bookingCount}`}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <AlertTriangle aria-hidden="true" />
            </span>
            {copy.kpiRiskLabel}
          </div>
          <div className={riskReviews.length > 0 ? "opscell__v is-danger" : "opscell__v is-muted"}>
            {riskReviews.length}
          </div>
          <div className="opscell__sub">{copy.kpiRiskSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Inbox aria-hidden="true" />
            </span>
            {copy.kpiRoomsLabel}
          </div>
          <div className={riskUnits > 0 ? "opscell__v is-danger" : "opscell__v is-muted"}>
            {riskUnits}
          </div>
          <div className="opscell__sub">{copy.kpiRoomsSub}</div>
        </div>
        <div className="opscell">
          <div className="opscell__k">
            <span className="ic">
              <Unlink aria-hidden="true" />
            </span>
            {copy.kpiUnlinkedLabel}
          </div>
          <div className={unlinked > 0 ? "opscell__v" : "opscell__v is-muted"}>{unlinked}</div>
          <div className="opscell__sub">{copy.kpiUnlinkedSub}</div>
        </div>
      </div>

      <div className="cviewbar">
        <div className="lviews" style={{ margin: 0 }}>
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/admin/complaints${queryOf({ ...base, view: tab.id })}`}
              className={view === tab.id ? "on" : ""}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* 기간은 공용 AdminDateRangePicker(.calpop) 래퍼만 쓴다 — 전용 달력을 만들지 않는다. */}
        <form method="get" action="/admin/complaints" className="cxfilters">
          <input type="hidden" name="view" value={view} />
          {filter.provider ? <input type="hidden" name="provider" value={filter.provider} /> : null}
          {filter.propertyId ? <input type="hidden" name="property" value={filter.propertyId} /> : null}
          {filter.roomId ? <input type="hidden" name="room" value={filter.roomId} /> : null}
          {filter.riskOnly ? <input type="hidden" name="risk" value="1" /> : null}
          <DateRangeFormField
            startName="from"
            endName="to"
            defaultFrom={from}
            defaultTo={to}
            localeTag={LOCALE_TAG[locale]}
            ariaLabel={sharedCopy.pickRange}
            labels={{
              prevMonth: sharedCopy.datePrevMonth,
              nextMonth: sharedCopy.dateNextMonth,
              thisMonth: sharedCopy.dateThisMonth,
              reset: sharedCopy.dateReset,
              apply: sharedCopy.dateApply,
            }}
          />
        </form>

        {view === "reviews" ? (
          <>
            {/* 플랫폼 필터 — Airbnb/Booking.com은 척도가 달라 따로 봐야 한다. 위험도 토글과 서로 독립. */}
            <div className="cxseg">
              <Link
                href={`/admin/complaints${queryOf({ ...base, view: "reviews", provider: undefined })}`}
                className={filter.provider ? "" : "on"}
              >
                {copy.filterAll}
              </Link>
              <Link
                href={`/admin/complaints${queryOf({ ...base, view: "reviews", provider: "airbnb" })}`}
                className={filter.provider === "airbnb" ? "on" : ""}
              >
                {PROVIDER_LABEL.airbnb}
              </Link>
              <Link
                href={`/admin/complaints${queryOf({ ...base, view: "reviews", provider: "booking" })}`}
                className={filter.provider === "booking" ? "on" : ""}
              >
                {PROVIDER_LABEL.booking}
              </Link>
            </div>
            <div className="cxseg">
              <Link
                href={`/admin/complaints${queryOf({ ...base, view: "reviews", risk: undefined })}`}
                className={filter.riskOnly ? "" : "on"}
              >
                {copy.filterAll}
              </Link>
              <Link
                href={`/admin/complaints${queryOf({ ...base, view: "reviews", risk: "1" })}`}
                className={filter.riskOnly ? "on" : ""}
              >
                {copy.riskOnly}
              </Link>
            </div>
          </>
        ) : null}
      </div>

      {/* ── 문제 객실 ── */}
      {view === "rooms" ? (
        <div className="card">
          <div className="card__h">
            <div className="card__t">{copy.viewRooms}</div>
            <div className="card__s">{`${from} ~ ${to}`}</div>
            <div style={{ marginLeft: "auto" }} />
            <div className="card__s">{copy.scaleNote}</div>
          </div>

          {summaries.length === 0 ? (
            <div className="rstate">
              <div className="rstate__ic">
                <span className="ic">
                  <Star aria-hidden="true" />
                </span>
              </div>
              <div className="rstate__t">{copy.roomsEmptyTitle}</div>
              <div className="rstate__s">{copy.roomsEmptyBody}</div>
            </div>
          ) : (
            <>
              <table className="tbl cxtbl">
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: 300 }}>
                      {copy.colPlace}
                    </th>
                    <th colSpan={3} className="cxgrp cxsep">
                      Airbnb
                    </th>
                    <th colSpan={3} className="cxgrp cxsep">
                      Booking.com
                    </th>
                    <th rowSpan={2} className="cxsep" style={{ width: 180 }}>
                      {copy.colRiskRatio}
                    </th>
                  </tr>
                  <tr>
                    <th className="cxnum cxsep">{copy.colAverage}</th>
                    <th className="cxnum">{copy.colReviews}</th>
                    <th className="cxnum">{copy.colRisk}</th>
                    <th className="cxnum cxsep">{copy.colAverage}</th>
                    <th className="cxnum">{copy.colReviews}</th>
                    <th className="cxnum">{copy.colRisk}</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((building) => (
                    <Fragmentish key={building.key}>
                      <tr>
                        <td>
                          <div className="cxbuilding">
                            {/* 서버 집계가 붙여 준 현지화 라벨. `properties.name` 원본 표기
                                (`Okubo_A (B棟)`)를 그대로 쓰면 캘린더와 이름이 갈라진다. */}
                            <span>{building.label || building.name}</span>
                            {building.standalone ? (
                              <span className="rchip void">{copy.standalone}</span>
                            ) : null}
                          </div>
                        </td>
                        <PlatformCells stat={building.airbnb} copy={copy} leading />
                        <PlatformCells stat={building.booking} copy={copy} />
                        <RatioCell place={building} />
                      </tr>

                      {/* 독채는 객실 행을 만들지 않는다 (properties.property_type = 'standalone'). */}
                      {building.rooms.map((room) => (
                        <tr
                          key={room.key}
                          className={
                            room.riskRatio !== null && room.riskRatio >= 25
                              ? "cxroom is-hot"
                              : "cxroom"
                          }
                        >
                          <td>
                            <div className="cxroomname">
                              <span>{room.name}</span>
                            </div>
                          </td>
                          <PlatformCells stat={room.airbnb} copy={copy} leading />
                          <PlatformCells stat={room.booking} copy={copy} />
                          <RatioCell place={room} />
                        </tr>
                      ))}

                      {building.unmappedCount > 0 ? (
                        <tr className="cxroom">
                          <td colSpan={8}>
                            <span className="cxnote">
                              <span className="rchip void">
                                {fill(copy.unmapped, building.unmappedCount)}
                              </span>
                              {copy.unmappedNote}
                            </span>
                          </td>
                        </tr>
                      ) : null}
                    </Fragmentish>
                  ))}
                </tbody>
              </table>
              <div className="foot">
                <span className="rchip void">{fill(copy.unratedFoot, unratedTotal)}</span>
                {copy.unratedNote}
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* ── 외부 리뷰 ── */}
      {view === "reviews" ? (
        <div className="card">
          <div className="card__h">
            <div className="card__t">{`${copy.viewReviews} ${reviews.length}`}</div>
            <div className="card__s">{`${from} ~ ${to}`}</div>
          </div>
          {reviews.length === 0 ? (
            <div className="rstate">
              <div className="rstate__ic">
                <span className="ic">
                  <Star aria-hidden="true" />
                </span>
              </div>
              <div className="rstate__t">{copy.reviewsEmptyTitle}</div>
              <div className="rstate__s">{copy.reviewsEmptyBody}</div>
            </div>
          ) : (
            reviews.map((review) => {
              const scale = REVIEW_SCALE[review.provider];
              const hasBody = Boolean(
                review.reviewText || review.positiveReviewText || review.negativeReviewText,
              );
              return (
                <Link className="cxrow" href={reviewHref(review.id)} key={review.id}>
                  <div className="cxscore">
                    <div
                      className={
                        review.riskLevel === "risk" ? "cxscore__v is-bad" : "cxscore__v"
                      }
                    >
                      {review.ratingValue === null ? "—" : review.ratingValue}
                    </div>
                    <div className="cxscore__s">{`/ ${scale}`}</div>
                  </div>
                  <div className="cxmain">
                    <div className="cxtop">
                      <span className="rchip void">{PROVIDER_LABEL[review.provider]}</span>
                      {review.riskLevel === "risk" ? (
                        <span className="rchip review">{copy.riskChip}</span>
                      ) : null}
                      {review.riskLevel === "unrated" ? (
                        <span className="rchip void">{copy.unratedChip}</span>
                      ) : null}
                      {review.headline ? <span className="cxttl">{review.headline}</span> : null}
                      {!hasBody ? (
                        <span className="rchip void">{copy.scoreOnly}</span>
                      ) : null}
                    </div>
                    {/* 클릭해 상세 패널을 열지 않아도 긍정/부정 본문을 목록에서 전부 볼 수 있어야 한다.
                        Booking.com은 긍정/부정 2단, Airbnb는 공개 리뷰 본문 1단, 본문이 없으면 안내 문구. */}
                    {!hasBody ? (
                      <div className="cxexcerpt is-dim">{copy.scoreOnlyNote}</div>
                    ) : review.positiveReviewText || review.negativeReviewText ? (
                      <div className="cxpn">
                        {review.positiveReviewText ? (
                          <div className="cxpn__col">
                            <div className="cxpn__k is-pos">
                              <ThumbsUp aria-hidden="true" />
                              {copy.positiveLabel}
                            </div>
                            <p className="cxpn__b">{review.positiveReviewText}</p>
                          </div>
                        ) : null}
                        {review.negativeReviewText ? (
                          <div className="cxpn__col">
                            <div className="cxpn__k is-neg">
                              <ThumbsDown aria-hidden="true" />
                              {copy.negativeLabel}
                            </div>
                            <p className="cxpn__b">{review.negativeReviewText}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="cxexcerpt">{review.reviewText}</p>
                    )}
                    <div className="cxmeta">
                      <span>
                        {review.propertyName
                          ? localizePropertyName(
                              getCanonicalPropertyName(review.propertyName),
                              buildingLabels,
                            )
                          : "—"}
                        {` · ${review.displayRoomLabel ?? reviewRoomFallbackLabel(review, copy)}`}
                      </span>
                      <span className="cxdot" />
                      <span>{(review.reviewedAt ?? "").slice(0, 10)}</span>
                      <span className="cxdot" />
                      <span className={review.linkedComplaintId ? "is-linked" : "is-unlinked"}>
                        {review.linkedComplaintId ? copy.converted : copy.kpiUnlinkedLabel}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      ) : null}

      {/* ── 수동 컴플레인 ── */}
      {view === "manual" ? (
        <div className="card">
          <div className="card__h">
            <div className="card__t">{`${copy.viewManual} ${complaints.length}`}</div>
            <div className="card__s">{copy.adminSubtitle}</div>
            {/* 등록 진입점은 목록이 비어 있을 때도 보여야 한다 — 빈 목록이 곧 첫 등록 시점이다. */}
            {canWrite ? (
              <div className="cxcardact">
                <ComplaintCreateLauncher
                  label={copy.createAction}
                  reservations={createReservations}
                  places={createPlaces}
                  labels={{
                    createTitle: copy.createTitle,
                    fieldPlatform: copy.fieldPlatform,
                    fieldRating: copy.fieldRating,
                    fieldTitle: copy.fieldTitle,
                    fieldBody: copy.fieldBody,
                    fieldBodyPlaceholder: copy.fieldBodyPlaceholder,
                    fieldLink: copy.fieldLink,
                    fieldGuestName: copy.fieldGuestName,
                    fieldGuestPlaceholder: copy.fieldGuestPlaceholder,
                    fieldImages: copy.fieldImages,
                    imagesMax: copy.imagesMax,
                    submit: copy.submit,
                    required: copy.required,
                    optional: copy.optional,
                    cancel: copy.cancel,
                    close: panelLabels.close,
                    linkModeReservation: copy.linkModeReservation,
                    linkModePlace: copy.linkModePlace,
                    linkModeNone: copy.linkModeNone,
                    linkModeHint: copy.linkModeHint,
                    pickBuilding: copy.pickBuilding,
                    pickRoom: copy.pickRoom,
                    pickerSearch: copy.pickerSearch,
                    pickerStaying: copy.pickerStaying,
                    pickerUpcoming: copy.pickerUpcoming,
                    pickerLiveTag: copy.pickerLiveTag,
                    ratingNone: copy.ratingNone,
                    titleRequired: copy.titleRequired,
                    createFailed: copy.createFailed,
                    platformDirect: copy.platformDirect,
                  }}
                />
              </div>
            ) : null}
          </div>
          {complaints.length === 0 ? (
            <div className="rstate">
              <div className="rstate__ic">
                <span className="ic">
                  <MessageSquareWarning aria-hidden="true" />
                </span>
              </div>
              <div className="rstate__t">{copy.manualEmptyTitle}</div>
              <div className="rstate__s">{copy.manualEmptySub}</div>
            </div>
          ) : (
            <ManualComplaintList
              complaints={complaints}
              currentUserId={currentUserId}
              canModerate={canModerate}
              labels={{
                statusOpen: copy.statusOpen,
                statusDone: copy.statusDone,
                deleteAction: copy.deleteAction,
                deleteKicker: copy.deleteKicker,
                deleteTitle: copy.deleteTitle,
                deleteBody: copy.deleteBody,
                deleteConfirm: copy.deleteConfirm,
                cancel: copy.cancel,
              }}
            />
          )}
        </div>
      ) : null}

      {selectedReview ? (
        <ReviewDetailOverlay closeHref={closeHref}>
          <ReviewDetailPanel
            review={selectedReview}
            copy={copy}
            buildingLabels={buildingLabels}
            labels={panelLabels}
            closeHref={closeHref}
            showTranslation={showTranslation}
            originalHref={originalHref}
            translateRedirectTo={translateRedirectTo}
            translations={translations}
            canConvert={canConvert}
            convertRedirectTo={convertRedirectTo}
            linkedComplaintHref={linkedComplaintHref}
          />
        </ReviewDetailOverlay>
      ) : null}
    </>
  );
}

/** `<tbody>` 안에서 여러 `<tr>`을 한 키로 묶기 위한 최소 래퍼. */
function Fragmentish({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
