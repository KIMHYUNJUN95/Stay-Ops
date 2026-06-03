import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, User } from "lucide-react";
import { updateMemberRole, updateMemberStatus } from "@/app/admin/users/actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAdminSession } from "@/lib/admin-session";
import { getDictionary, type Locale } from "@/lib/i18n";
import { organizationRoles } from "@/config/roles";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type MembershipRow = Database["public"]["Tables"]["memberships"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type MembershipStatus = Database["public"]["Enums"]["membership_status"];

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ roleUpdated?: string; statusUpdated?: string; error?: string }>;
};

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(new Date(value));
}

function statusBadgeClass(status: MembershipStatus) {
  const map: Record<MembershipStatus, string> = {
    active: "border-green-200 bg-green-50 text-green-700",
    invited: "border-blue-200 bg-blue-50 text-blue-700",
    removed: "border-border bg-muted/50 text-muted-foreground",
    suspended: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return map[status];
}

function getStatusLabel(status: MembershipStatus, locale: Locale) {
  const labels: Record<MembershipStatus, Record<Locale, string>> = {
    active: { ko: "활성", ja: "アクティブ", en: "Active" },
    invited: { ko: "초대됨", ja: "招待済み", en: "Invited" },
    removed: { ko: "제거됨", ja: "削除済み", en: "Removed" },
    suspended: { ko: "중지됨", ja: "停止済み", en: "Suspended" },
  };
  return labels[status][locale];
}

export default async function AdminUserDetailPage({ params, searchParams }: PageProps) {
  const [session, { id }, query] = await Promise.all([
    requireAdminSession(),
    params,
    searchParams,
  ]);

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.admin.users;
  const service = getSupabaseServiceClient();

  const { data: membershipData } = await service
    .from("memberships")
    .select("id, organization_id, user_id, role, status, joined_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!membershipData) notFound();
  const membership = membershipData as MembershipRow;

  // Scope guard: non-super-admins may only view members of their own organization.
  const isSuperAdmin = session.user.role === "developer_super_admin";
  if (!isSuperAdmin && membership.organization_id !== session.organization.id) {
    notFound();
  }

  const [{ data: profileData }, authUserResult] = await Promise.all([
    service.from("profiles").select("*").eq("id", membership.user_id).maybeSingle(),
    service.auth.admin.getUserById(membership.user_id),
  ]);

  const profile = profileData as ProfileRow | null;
  const email = authUserResult.data.user?.email ?? "—";

  return (
    <AdminShell activeItem="users" title={copy.detailTitle}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/users">
            <Button type="button" variant="secondary">
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {copy.backToList}
            </Button>
          </Link>
        </div>

        {(query.roleUpdated || query.statusUpdated || query.error) && (
          <div className="rounded-xl border border-border bg-surface/70 px-4 py-3 text-sm font-semibold">
            {query.roleUpdated && copy.success.roleUpdated}
            {query.statusUpdated && copy.success.statusUpdated}
            {query.error && (copy.errors[query.error] ?? copy.errors.save_failed)}
          </div>
        )}

        {/* Profile card */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              {profile?.profile_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={profile.name}
                  className="size-14 rounded-2xl object-cover"
                  src={profile.profile_photo_url}
                />
              ) : (
                <User className="size-7" aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black">{profile?.name ?? "—"}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge className={statusBadgeClass(membership.status)}>
                  {getStatusLabel(membership.status, locale)}
                </Badge>
                <span className="text-sm font-semibold text-muted-foreground">
                  {dictionary.roles[membership.role]}
                </span>
              </div>
            </div>
          </div>

          <dl className="mt-6 space-y-3 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="flex items-center gap-2 font-semibold text-muted-foreground">
                <Mail className="size-4" aria-hidden="true" />
                {copy.email}
              </dt>
              <dd className="font-semibold">{email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="flex items-center gap-2 font-semibold text-muted-foreground">
                <Phone className="size-4" aria-hidden="true" />
                {copy.phone}
              </dt>
              <dd className="font-semibold">
                {profile?.phone_number ? (
                  <a
                    className="text-primary underline-offset-2 hover:underline"
                    href={`tel:${profile.phone_number}`}
                  >
                    {profile.phone_number}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {profile?.age != null && (
              <div className="flex items-center justify-between gap-3 text-sm">
                <dt className="font-semibold text-muted-foreground">{copy.age}</dt>
                <dd className="font-semibold">{profile.age}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.joinedAt}</dt>
              <dd className="font-semibold">{formatDate(membership.joined_at, locale)}</dd>
            </div>
          </dl>
        </Card>

        {/* Role & status management */}
        <Card className="p-5">
          <h3 className="text-base font-black">{copy.actions}</h3>
          <div className="mt-4 space-y-3">
            <form action={updateMemberRole} className="flex items-center gap-2">
              <input name="membershipId" type="hidden" value={membership.id} />
              <input name="redirectTo" type="hidden" value="detail" />
              <select
                className="h-10 flex-1 rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground outline-none"
                defaultValue={membership.role}
                name="role"
              >
                {organizationRoles.map((role) => (
                  <option key={role} value={role}>
                    {dictionary.roles[role]}
                  </option>
                ))}
              </select>
              <Button className="h-10 shrink-0 rounded-xl font-black" type="submit">
                {copy.saveRole}
              </Button>
            </form>
            <form action={updateMemberStatus} className="flex items-center gap-2">
              <input name="membershipId" type="hidden" value={membership.id} />
              <input name="redirectTo" type="hidden" value="detail" />
              <select
                className="h-10 flex-1 rounded-xl border border-border bg-surface/80 px-3 text-sm font-semibold text-foreground outline-none"
                defaultValue={membership.status}
                name="status"
              >
                {(["active", "invited", "removed", "suspended"] as const).map((s) => (
                  <option key={s} value={s}>
                    {getStatusLabel(s, locale)}
                  </option>
                ))}
              </select>
              <Button className="h-10 shrink-0 rounded-xl font-black" type="submit">
                {copy.saveStatus}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </AdminShell>
  );
}
