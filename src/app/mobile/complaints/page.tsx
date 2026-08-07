import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { ComplaintList } from "@/components/complaints/complaint-list";
import { ComplaintViewTabs } from "@/components/complaints/complaint-view-tabs";
import { ReviewList, REVIEW_PAGE_SIZE } from "@/components/complaints/review-list";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { listComplaints, canWriteComplaint } from "@/lib/complaints";
import {
  listExternalReviewPage,
  listReviewBuildingOptions,
  type ReviewListFilter,
  type ReviewProvider,
} from "@/lib/external-reviews";

type PageProps = {
  searchParams: Promise<{
    view?: string;
    provider?: string;
    risk?: string;
    building?: string;
    page?: string;
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
    const building = params.building?.trim() || null;
    const page = Math.max(Number(params.page ?? "1") || 1, 1);

    const buildings = await listReviewBuildingOptions({ session, locale });
    const selected = building ? buildings.find((b) => b.value === building) : undefined;

    const filter: ReviewListFilter = {
      provider,
      riskOnly,
      // 선택한 건물이 목록에 없으면(옛 링크·오타) 필터를 걸지 않는다 — 0건 화면보다 전체가 낫다.
      propertyIds: selected?.propertyIds,
    };

    const { rows, total } = await listExternalReviewPage({
      session,
      filter,
      page,
      pageSize: REVIEW_PAGE_SIZE,
    });

    return (
      <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.pageTitle}>
        <ComplaintViewTabs view={view} dict={dict} />
        <ReviewList
          locale={locale}
          reviews={rows}
          total={total}
          page={page}
          buildings={buildings}
          provider={provider ?? "all"}
          riskOnly={riskOnly}
          building={selected?.value ?? "all"}
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
