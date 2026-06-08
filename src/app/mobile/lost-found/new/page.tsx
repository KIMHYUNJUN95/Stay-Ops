import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Package } from "lucide-react";
import { LostFoundLinkedForm } from "@/components/cleaning/lost-found-linked-form";
import { LostFoundCreateForm } from "@/components/requests/lost-found-create-form";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getOnboardingState } from "@/lib/onboarding";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    sessionId?: string;
  }>;
};

export default async function LostFoundNewPage({ searchParams }: PageProps) {
  const [state, session, params] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    const basePath = "/mobile/lost-found/new";
    const targetPath = params.sessionId
      ? `${basePath}?sessionId=${encodeURIComponent(params.sessionId)}`
      : basePath;
    redirect(`/auth/login?next=${encodeURIComponent(targetPath)}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const locale = session.user.preferredLanguage;
  const dict = getDictionary(locale);
  const copy = dict.lostFound;
  const imgCopy = dict.requestImages;

  // Distinguish: no sessionId (standalone) vs sessionId provided (linked mode).
  const isLinkedMode = !!params.sessionId;
  let linkedSessionValid = false;
  let defaultRoom = "";
  let cleaningSessionId = "";

  if (isLinkedMode) {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase
      .from("cleaning_sessions")
      .select("id, room_label")
      .eq("id", params.sessionId!)
      .eq("organization_id", session.organization.id)
      .eq("staff_user_id", session.user.id)
      // No status filter: accept any session (in_progress or completed) so the link is
      // preserved even when the user finishes cleaning before submitting the form.
      .maybeSingle();
    const linked = data as { id: string; room_label: string } | null;
    if (linked) {
      linkedSessionValid = true;
      defaultRoom = linked.room_label;
      cleaningSessionId = linked.id;
    }
    // If linked is null: session not found, wrong user, or wrong org → show error state.
  }

  const catalog = await getActiveRoomCatalogServer(session.organization.id);

  // Field-level error from an action redirect (only relevant when form is visible).
  const errorMessage =
    !isLinkedMode || linkedSessionValid
      ? params.error
        ? (copy.errors[params.error] ?? null)
        : null
      : null;

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="requests" badges={navBadges} title={copy.mobileTitle}>
      <div className="space-y-4">
        <Card className="rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              {isLinkedMode && linkedSessionValid ? (
                <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                  {copy.fromCleaning}
                </p>
              ) : null}
              <h2 className="mt-1 text-2xl font-black">{copy.mobileTitle}</h2>
            </div>
          </div>
        </Card>

        {/* Invalid linked session: show explicit error — do not fall back to standalone form. */}
        {isLinkedMode && !linkedSessionValid ? (
          <>
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {copy.errors.invalid_session}
            </div>
            <Link href="/mobile/cleaning">
              <Button className="h-12 w-full rounded-xl" type="button" variant="secondary">
                <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                {copy.backToCleaning}
              </Button>
            </Link>
          </>
        ) : (
          <>
            {errorMessage ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                {errorMessage}
              </div>
            ) : null}

            {isLinkedMode ? (
              <LostFoundLinkedForm
                buildingLabels={dict.cleaning.buildingLabels}
                cleaningSessionId={cleaningSessionId}
                copy={copy}
                defaultRoom={defaultRoom}
                imgCopy={imgCopy}
                organizationId={session.organization.id}
                reporterName={session.user.name}
                roomCatalog={catalog || []}
              />
            ) : (
              <LostFoundCreateForm
                buildingLabels={dict.cleaning.buildingLabels}
                cleaningSessionId={cleaningSessionId}
                copy={copy}
                defaultRoom={defaultRoom}
                imgCopy={imgCopy}
                organizationId={session.organization.id}
                reporterName={session.user.name}
                roomCatalog={catalog || []}
              />
            )}

            <Link href="/mobile/cleaning">
              <Button className="h-12 w-full rounded-xl" type="button" variant="secondary">
                <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                {copy.backToCleaning}
              </Button>
            </Link>
          </>
        )}
      </div>
    </MobileShell>
  );
}
