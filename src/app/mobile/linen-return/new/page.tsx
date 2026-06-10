import { redirect } from "next/navigation";
import { LinenReturnCreateForm } from "@/components/linen-return/linen-return-create-form";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import { getActiveLinenItems, isKnownBuilding } from "@/lib/linen-returns";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{ building?: string; error?: string }>;
};

export default async function LinenReturnNewPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  const building = (params.building ?? "").trim();

  if (state.status === "unauthenticated") {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/mobile/linen-return/new?building=${encodeURIComponent(building)}`)}`,
    );
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }
  if (!building || !(await isKnownBuilding(session, building))) {
    redirect("/mobile/linen-return");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.linenReturn;
  const buildingLabel = localizePropertyName(building, dict.cleaning.buildingLabels);

  const [items, navBadges] = await Promise.all([
    getActiveLinenItems(session, building),
    getMobileNavBadges(),
  ]);

  const serverError = params.error ? copy.errors[params.error] ?? copy.errors.save_failed : null;

  return (
    <MobileShell activeItem="linen-return" badges={navBadges} title={copy.createTitle}>
      <LinenReturnCreateForm
        building={building}
        buildingLabel={buildingLabel}
        copy={copy}
        imgCopy={dict.requestImages}
        items={items}
        organizationId={session.organization.id}
        reporterName={session.user.name}
        serverError={serverError}
      />
    </MobileShell>
  );
}
