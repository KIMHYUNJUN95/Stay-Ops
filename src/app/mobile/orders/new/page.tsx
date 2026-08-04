import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { OrderCreateForm } from "@/components/requests/order-create-form";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { Card } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { sanitizeSharedUrl } from "@/lib/share-target";

type PageProps = {
  searchParams: Promise<{ sharedUrl?: string; shareError?: string; error?: string }>;
};

export default async function MobileOrderNewPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/orders/new")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = {
    ...dict.mobile.orderForm,
    // Functions cannot be passed to Client Components from RSC props.
    confirmSummary: undefined,
    itemCardTitle: undefined,
  } as unknown as typeof dict.mobile.orderForm;

  // 서버 액션이 `?error=` 로 넘긴 실패 사유. 예전에는 이 화면이 그 파라미터를 **아예 읽지 않아**,
  // 저장에 실패해도 폼만 다시 그려지고 아무 안내가 없었다(2026-08-04). 사전에 없는 키여도
  // `save_failed` 문구로 폴백해 무반응만은 피한다.
  const errorMessage = params.error
    ? (copy.errors?.[params.error] ?? copy.errors?.save_failed ?? params.error)
    : null;

  // Double-validate the URL from the Web Share Target redirect (route already checked once).
  const sharedUrl = sanitizeSharedUrl(params.sharedUrl ?? null);
  // shareError=1 means a URL was shared but failed validation in the route handler.
  const shareError = !sharedUrl && params.shareError === "1";

  const catalog = (await getActiveRoomCatalogServer(session.organization.id)) ?? [];
  const buildings = Array.from(new Set(catalog.map((item) => item.propertyName))).sort();

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="requests" badges={navBadges} hideBottomNav title={copy.title}>
      <div className="space-y-4 pb-8">
        <Card className="rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#EAF1F8] text-[#315F91]">
              <ShoppingCart className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black tracking-tight">{copy.title}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{copy.subtitle}</p>
            </div>
          </div>
        </Card>

        {errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <OrderCreateForm
          buildingLabels={dict.cleaning.buildingLabels}
          buildings={buildings}
          copy={copy}
          imgCopy={dict.requestImages}
          organizationId={session.organization.id}
          reporterName={session.user.name}
          shareError={shareError}
          sharedUrl={sharedUrl}
        />
      </div>
    </MobileShell>
  );
}
