import { redirect } from "next/navigation";
import { LinenReturnCreateForm } from "@/components/linen-return/linen-return-create-form";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getDictionary } from "@/lib/i18n";
import {
  canManageLinenRecord,
  getActiveLinenItems,
  getLinenReturnRecordById,
} from "@/lib/linen-returns";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { localizePropertyName } from "@/lib/room-label-normalization";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function LinenReturnEditPage({ params, searchParams }: PageProps) {
  const [state, session, { id }, query] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(`/mobile/linen-return/record/${id}/edit`)}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const record = await getLinenReturnRecordById(session, id);
  if (!record) {
    redirect("/mobile/linen-return");
  }
  const detailHref = `/mobile/linen-return/record/${id}?building=${encodeURIComponent(record.buildingName)}`;
  if (!canManageLinenRecord(session, record)) {
    redirect(detailHref);
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.linenReturn;
  const buildingLabel = localizePropertyName(record.buildingName, dict.cleaning.buildingLabels);

  const [items, navBadges] = await Promise.all([
    getActiveLinenItems(session, record.buildingName),
    getMobileNavBadges(),
  ]);

  const serverError = query.error ? copy.errors[query.error] ?? copy.errors.save_failed : null;

  return (
    <MobileShell
      activeItem="linen-return"
      badges={navBadges}
      hideBottomNav
      title={copy.editAction}
    >
      <div className="flex items-center gap-[11px] px-0.5 pb-3 pt-2">
        <p className="text-[19px] font-black leading-tight tracking-[-0.03em] text-foreground">
          {copy.editAction}
        </p>
      </div>

      <LinenReturnCreateForm
        building={record.buildingName}
        buildingLabel={buildingLabel}
        copy={copy}
        imgCopy={dict.requestImages}
        initialLines={record.lines.map((line) => ({
          itemId: line.itemId,
          quantity: line.quantity,
        }))}
        initialNote={record.note ?? ""}
        items={items}
        mode="edit"
        organizationId={session.organization.id}
        recordId={record.id}
        reporterName={record.registrantName}
        serverError={serverError}
        submitLabel={copy.editAction}
      />
    </MobileShell>
  );
}
