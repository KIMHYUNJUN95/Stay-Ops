import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { ComplaintList } from "@/components/complaints/complaint-list";
import { ComplaintViewTabs } from "@/components/complaints/complaint-view-tabs";
import {
  ReviewList,
  REVIEW_PAGE_SIZE,
  RANGE_PRESET_DAYS,
} from "@/components/complaints/review-list";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { listComplaints, canWriteComplaint } from "@/lib/complaints";
import {
  listExternalReviewPage,
  type ReviewListFilter,
  type ReviewProvider,
} from "@/lib/external-reviews";

type PageProps = {
  searchParams: Promise<{
    view?: string;
    provider?: string;
    risk?: string;
    page?: string;
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

  const view = params.view === "reviews" ? "reviews" : "manual";
  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const navBadges = await getMobileNavBadges();

  if (view === "reviews") {
    const provider: ReviewProvider | undefined =
      params.provider === "airbnb" || params.provider === "booking" ? params.provider : undefined;
    const riskOnly = params.risk === "1";
    const page = Math.max(Number(params.page ?? "1") || 1, 1);
    const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
    const from = isDate(params.from) ? params.from! : null;
    const to = isDate(params.to) ? params.to! : null;

    const filter: ReviewListFilter = {
      provider,
      riskOnly,
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

    /** 기간 칩에 «90일» 처럼 보여주기 위한 역산. 프리셋과 정확히 맞을 때만 일수로 표기한다. */
    const rangeDays =
      from && to
        ? RANGE_PRESET_DAYS.find(
            (days) =>
              from ===
                new Date(new Date(`${to}T00:00:00Z`).getTime() - (days - 1) * 864e5)
                  .toISOString()
                  .slice(0, 10) && to === new Date().toISOString().slice(0, 10),
          ) ?? null
        : null;

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
