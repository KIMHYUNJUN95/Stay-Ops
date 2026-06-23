import { redirect } from "next/navigation";
import { Phone, Users } from "lucide-react";
import { MobileShell } from "@/components/shell/mobile-shell";
import { Card } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const GLASS_CARD =
  "rounded-[20px] border border-slate-200/80 bg-surface shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)]";

type StaffMember = {
  membershipId: string;
  name: string;
  role: MembershipRow["role"];
  status: Database["public"]["Enums"]["membership_status"];
  phone: string;
};

export default async function MobileDirectoryPage() {
  const [state, session] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
  ]);

  if (state.status === "unauthenticated") {
    redirect("/auth/login?next=/mobile/directory");
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
  }

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.mobile.directory;
  const roles = dictionary.roles;

  const service = getSupabaseServiceClient();
  const { data: membershipData } = await service
    .from("memberships")
    .select("id, user_id, role, status")
    .eq("organization_id", session.organization.id)
    .in("status", ["active", "invited"])
    .order("role", { ascending: true });

  const memberships = (membershipData ?? []) as Pick<MembershipRow, "id" | "user_id" | "role" | "status">[];
  const userIds = memberships.map((m) => m.user_id);

  const { data: profileData } = userIds.length > 0
    ? await service.from("profiles").select("id, name, phone_number").in("id", userIds)
    : { data: [] };

  const profileMap = new Map(
    ((profileData ?? []) as Pick<ProfileRow, "id" | "name" | "phone_number">[]).map((p) => [p.id, p]),
  );

  const members: StaffMember[] = memberships.map((m) => {
    const profile = profileMap.get(m.user_id);
    return {
      membershipId: m.id,
      name: profile?.name ?? "—",
      role: m.role,
      status: m.status,
      phone: profile?.phone_number ?? "",
    };
  }).sort((a, b) => a.name.localeCompare(b.name, locale));

  const ROLE_ORDER: Record<string, number> = {
    developer_super_admin: 0,
    owner: 1,
    office_admin: 2,
    field_manager: 3,
    cs_staff: 4,
    staff: 5,
    part_time_staff: 6,
  };

  const sorted = [...members].sort((a, b) => {
    const ro = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (ro !== 0) return ro;
    return a.name.localeCompare(b.name, locale);
  });

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="directory" badges={navBadges} title={copy.title}>
      <div className="space-y-3 pb-6">
        {sorted.length === 0 ? (
          <Card className={`${GLASS_CARD} flex flex-col items-center justify-center gap-3 p-10 text-center`}>
            <Users className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold text-muted-foreground">{copy.empty}</p>
          </Card>
        ) : (
          sorted.map((member) => (
            <div
              className={`${GLASS_CARD} flex items-center gap-3 px-4 py-3`}
              key={member.membershipId}
            >
              {/* Avatar */}
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-black text-primary">
                {member.name.slice(0, 1)}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-slate-900">{member.name}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
                  {roles[member.role]}
                </p>
                {member.phone ? (
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{member.phone}</p>
                ) : null}
              </div>

              {/* Call button */}
              {member.phone ? (
                <a
                  aria-label={`${copy.call} ${member.name}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary shadow-[0_8px_16px_-12px_hsl(var(--primary-hsl)/0.4)] ring-1 ring-primary/15 transition-colors active:bg-primary/20"
                  href={`tel:${member.phone}`}
                >
                  <Phone className="size-4" aria-hidden="true" />
                </a>
              ) : (
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground/40 ring-1 ring-border/50">
                  <Phone className="size-4" aria-hidden="true" />
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </MobileShell>
  );
}
