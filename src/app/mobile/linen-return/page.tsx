import { redirect } from "next/navigation";
import { BuildingPicker } from "@/components/linen-return/building-picker";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import {
  getLinenBuildings,
  getLinenBuildingStats,
} from "@/lib/linen-returns";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

export default async function LinenReturnPickerPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/linen-return")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.linenReturn;

  const [buildings, stats, navBadges] = await Promise.all([
    getLinenBuildings(session),
    getLinenBuildingStats(session),
    getMobileNavBadges(),
  ]);

  return (
    <MobileShell activeItem="linen-return" badges={navBadges} title={copy.eyebrow}>
      <BuildingPicker
        buildingLabels={dict.cleaning.buildingLabels}
        buildings={buildings}
        copy={copy}
        locale={locale}
        stats={stats}
      />
    </MobileShell>
  );
}
