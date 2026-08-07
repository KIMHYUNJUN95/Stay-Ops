import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { ComplaintList } from "@/components/complaints/complaint-list";
import { ComplaintViewTabs } from "@/components/complaints/complaint-view-tabs";
import {
  ReviewList,
  REVIEW_PAGE_SIZE,
  RANGE_PRESET_DAYS,
} from "@/components/complaints/review-list";
import { ReviewRoomsBoard } from "@/components/complaints/review-rooms-board";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { listComplaints, canWriteComplaint } from "@/lib/complaints";
import {
  listExternalReviewPage,
  summarizeReviewsByPlace,
  type ReviewListFilter,
  type ReviewProvider,
} from "@/lib/external-reviews";

// 세션 쿠키를 읽어 어차피 동적이지만, «지금»(기본 기간 계산)에 의존하므로 명시한다.
export const dynamic = "force-dynamic";

/**
 * 문제 객실 뷰의 기본 기간 — 최근 90일(오늘 포함).
 *
 * **컴포넌트 밖에 두는 이유:** 렌더 본문에서 `Date.now()` 를 부르면 «순수하지 않은 호출»로
 * 걸린다. 어드민 컴플레인 페이지의 `defaultRange()` 도 같은 이유로 모듈 스코프에 있다.
 */
function defaultRoomsRange(): { from: string; to: string } {
  const now = new Date();
  return {
    to: now.toISOString().slice(0, 10),
    from: new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}

/** 프리셋과 정확히 맞을 때만 기간 칩에 «90일» 처럼 일수로 표기한다. */
function matchPresetDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const end = new Date(`${to}T00:00:00Z`).getTime();
  const today = new Date().toISOString().slice(0, 10);
  if (to !== today) return null;
  return (
    RANGE_PRESET_DAYS.find(
      (days) => from === new Date(end - (days - 1) * 864e5).toISOString().slice(0, 10),
    ) ?? null
  );
}

type PageProps = {
  searchParams: Promise<{
    view?: string;
    provider?: string;
    risk?: string;
    page?: string;
    /** 객실 미연결 리뷰만 보기 (문제 객실 화면에서 넘어옴). */
    unmapped?: string;
    propertyId?: string;
    /** 포함 (YYYY-MM-DD) */
    from?: string;
    to?: string;
  }>;
};

// Complaints / 컴플레인 — 2뷰 진입점 (수동 컴플레인 / 외부 리뷰).
// See docs/product/25-complaint-workflow.md, docs/product/16-mobile-navigation.md.
//
// 외부 리뷰 목록의 필터·페이지는 **전부 쿼리스트링**이다. 예전에는 서버가 최신 500건을 통째로
// 내려보내고 클라이언트가 걸렀는데, 리뷰가 2,400건을 넘으면서 나머지가 화면에 존재하지도 않았고
// 필터도 그 500건 안에서만 돌았다. 서버에서 필터·정렬·페이지를 끝내야 누락이 없다.
export default async function MobileComplaintsPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/complaints")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const view =
    params.view === "reviews" || params.view === "rooms" ? params.view : "manual";
  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const navBadges = await getMobileNavBadges();

  const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
  const from = isDate(params.from) ? params.from! : null;
  const to = isDate(params.to) ? params.to! : null;

  const rangeDays = matchPresetDays(from, to);

  if (view === "rooms") {
    // 집계는 어드민과 같은 함수를 쓴다 — 화면별 집계를 만들면 두 화면의 숫자가 갈라진다.
    // 기간을 지정하지 않으면 최근 90일. 문제 객실은 «지금 문제인 방»을 보는 화면이라
    // 전 기간 합계는 오히려 현재 상태를 가린다(외부 리뷰 목록의 기본값과 다른 이유다).
    const fallback = defaultRoomsRange();
    const rangeFrom = from ?? fallback.from;
    const rangeTo = to ?? fallback.to;
    const summaries = await summarizeReviewsByPlace({
      session,
      from: rangeFrom,
      to: rangeTo,
    });
    return (
      <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.pageTitle}>
        <ComplaintViewTabs view={view} dict={dict} />
        <ReviewRoomsBoard
          locale={locale}
          summaries={summaries}
          from={rangeFrom}
          to={rangeTo}
          rangeDays={rangeDays ?? (from ? null : 90)}
        />
      </MobileShell>
    );
  }

  if (view === "reviews") {
    const provider: ReviewProvider | undefined =
      params.provider === "airbnb" || params.provider === "booking" ? params.provider : undefined;
    const riskOnly = params.risk === "1";
    const page = Math.max(Number(params.page ?? "1") || 1, 1);

    const filter: ReviewListFilter = {
      provider,
      riskOnly,
      unmappedOnly: params.unmapped === "1",
      propertyId: params.propertyId?.trim() || undefined,
      from: from ?? undefined,
      to: to ?? undefined,
    };

    // 카운트 줄의 «문제 N» 은 현재 필터 안의 위험 건수다. `문제만` 이 켜져 있으면 전체가 곧
    // 문제 건수라 추가 질의를 하지 않는다.
    const [{ rows, total }, riskPage] = await Promise.all([
      listExternalReviewPage({ session, filter, page, pageSize: REVIEW_PAGE_SIZE }),
      riskOnly
        ? Promise.resolve(null)
        : listExternalReviewPage({
            session,
            filter: { ...filter, riskOnly: true },
            page: 1,
            pageSize: 1,
          }),
    ]);

    return (
      <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.pageTitle}>
        <ComplaintViewTabs view={view} dict={dict} />
        <ReviewList
          locale={locale}
          reviews={rows}
          total={total}
          riskTotal={riskOnly ? total : (riskPage?.total ?? 0)}
          page={page}
          provider={provider ?? "all"}
          riskOnly={riskOnly}
          from={from}
          to={to}
          rangeDays={rangeDays}
        />
      </MobileShell>
    );
  }

  const complaints = await listComplaints({ session });
  return (
    <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.pageTitle}>
      <ComplaintViewTabs view={view} dict={dict} />
      <ComplaintList
        locale={locale}
        complaints={complaints}
        canCreate={canWriteComplaint(session.user.role)}
      />
    </MobileShell>
  );
}
