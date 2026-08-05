import { AdminShell } from "@/components/shell/admin-shell";
import { ComplaintsConsole } from "@/components/admin/complaints/complaints-console";
import { canWriteComplaint, listComplaints } from "@/lib/complaints";
import {
  getExternalReview,
  listExternalReviews,
  summarizeReviewsByPlace,
  type ExternalReviewDetail,
  type ReviewListFilter,
} from "@/lib/external-reviews";
import { getStoredTranslations, type TranslationPart } from "@/lib/review-translate";
import { requireAdminPageSession } from "@/lib/admin-page-auth";
import { getDictionary } from "@/lib/i18n";

// 컴플레인 콘솔 — 수동 컴플레인 + Beds24 외부 리뷰 통합 검토.
// 뷰 전환과 기간/필터는 전부 쿼리스트링으로 다뤄, 서버 렌더 한 번으로 끝난다.
// 도메인 계약: docs/product/25-complaint-workflow.md, IA: docs/product/05-admin-web-ia.md
export const dynamic = "force-dynamic";

type SearchParams = {
  view?: string;
  from?: string;
  to?: string;
  provider?: string;
  property?: string;
  room?: string;
  risk?: string;
  /** 상세 패널을 여는 외부 리뷰 id. */
  review?: string;
  /** "1"이면 저장된 번역을 원문 대신 보여준다. */
  tr?: string;
};

/** 기본 기간은 최근 90일 — Beds24 초기 수집 범위와 같은 창을 본다. */
function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

export default async function AdminComplaintsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireAdminPageSession({ nextPath: "/admin/complaints" });
  const params = await searchParams;
  const dictionary = getDictionary(session.user.preferredLanguage);

  const fallback = defaultRange();
  const from = params.from?.trim() || fallback.from;
  const to = params.to?.trim() || fallback.to;

  const view =
    params.view === "manual" || params.view === "reviews" || params.view === "rooms"
      ? params.view
      : "rooms";

  const filter: ReviewListFilter = {
    from,
    to,
    riskOnly: params.risk === "1",
    provider: params.provider === "airbnb" || params.provider === "booking" ? params.provider : undefined,
    propertyId: params.property?.trim() || undefined,
    roomId: params.room?.trim() || undefined,
  };

  // 세 뷰가 같은 KPI 줄을 공유하므로 집계는 항상 계산한다. 리뷰 목록은 뷰와 무관하게
  // 미전환 건수 계산에 쓰이므로 함께 가져온다.
  const [complaints, reviews, summaries] = await Promise.all([
    listComplaints({ session }),
    listExternalReviews({ session, filter }),
    summarizeReviewsByPlace({ session, from, to }),
  ]);

  // 상세 패널은 ?review=<id> 쿼리로만 연다 — 콘솔의 나머지 상태와 같은 서버 렌더 한 번으로 끝난다.
  const reviewId = params.review?.trim() || null;
  let selectedReview: ExternalReviewDetail | null = null;
  let translations: Partial<Record<TranslationPart, string>> = {};
  const showTranslation = params.tr === "1";
  if (reviewId) {
    selectedReview = await getExternalReview({ session, id: reviewId });
    if (selectedReview && showTranslation) {
      translations = await getStoredTranslations({
        externalReviewId: reviewId,
        targetLocale: session.user.preferredLanguage,
      });
    }
  }

  return (
    <AdminShell activeItem="complaints" title={dictionary.complaints.adminTitle}>
      <ComplaintsConsole
        copy={dictionary.complaints}
        sharedCopy={dictionary.admin.shared}
        locale={session.user.preferredLanguage}
        view={view}
        from={from}
        to={to}
        filter={filter}
        complaints={complaints}
        reviews={reviews}
        summaries={summaries}
        selectedReview={selectedReview}
        showTranslation={showTranslation}
        translations={translations}
        canConvert={canWriteComplaint(session.user.role)}
        panelLabels={{
          building: dictionary.complaints.metaBuilding,
          room: dictionary.complaints.metaRoom,
          reservation: dictionary.mobile.calendarReservationId,
          guest: dictionary.admin.calendar.guestName,
          close: dictionary.common.close,
        }}
      />
    </AdminShell>
  );
}
