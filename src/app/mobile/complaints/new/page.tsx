import { redirect } from "next/navigation";
import { MobileShell } from "@/components/shell/mobile-shell";
import { ComplaintCreate } from "@/components/complaints/complaint-create";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getDictionary } from "@/lib/i18n";
import { canWriteComplaint } from "@/lib/complaints";
import { listComplaintPickerReservations } from "@/lib/complaint-reservations";

// Complaints / 컴플레인 — Screen 3 (create). See docs/product/26-complaint-workflow.md.
export default async function MobileComplaintCreatePage() {
  const [state, session] = await Promise.all([getOnboardingState(), getCurrentAppSession()]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile/complaints/new")}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  // part_time_staff 등 작성 권한 없는 역할은 목록으로 리다이렉트
  if (!canWriteComplaint(session.user.role)) {
    redirect("/mobile/complaints");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);

  const [navBadges, pickRows] = await Promise.all([
    getMobileNavBadges(),
    listComplaintPickerReservations(session.organization.id, locale),
  ]);

  return (
    <MobileShell activeItem="complaints" badges={navBadges} title={dict.complaints.createTitle}>
      <ComplaintCreate locale={locale} pickRows={pickRows} />
    </MobileShell>
  );
}
