import Image from "next/image";
import {
  ArrowUpRight,
  CalendarDays,
  ImageIcon,
  Megaphone,
  Pin,
  ShieldAlert,
  Users,
} from "lucide-react";
import Link from "next/link";
import { DeleteAnnouncementButton } from "@/components/announcements/delete-announcement-button";
import { AnnouncementCreateCard } from "@/components/announcements/announcement-create-card";
import { AnnouncementPopup } from "@/components/announcements/announcement-popup";
import { OrphanCleanupButton } from "@/components/announcements/orphan-cleanup-button";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  deleteAnnouncement,
  updateAnnouncementStatus,
} from "@/app/admin/announcements/actions";
import type { OrganizationRole } from "@/config/roles";
import { getAnnouncementDictionary } from "@/lib/announcement-i18n";
import { requireAdminSession } from "@/lib/admin-session";
import {
  filterAnnouncementsByTargetVisibility,
  getPopupDismissals,
} from "@/lib/announcements";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type AnnouncementRow = Database["public"]["Tables"]["announcements"]["Row"];
type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "name"
>;
type MembershipRow = Pick<
  Database["public"]["Tables"]["memberships"]["Row"],
  "organization_id" | "role"
>;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null, locale: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function canManageAnnouncementInList(
  announcement: AnnouncementRow,
  isPlatformAdmin: boolean,
  membershipRoleByOrgId: Map<string, OrganizationRole>,
  userId: string,
) {
  if (isPlatformAdmin) {
    return true;
  }

  const role = membershipRoleByOrgId.get(announcement.organization_id);

  if (role === "owner" || role === "office_admin") {
    return true;
  }

  return Boolean(role && announcement.created_by_user_id === userId);
}

type WritableOrgResult = {
  organizations: OrganizationRow[];
  membershipRoleByOrgId: Map<string, OrganizationRole>;
};

async function getWritableOrganizations(
  userId: string,
  role: string,
): Promise<WritableOrgResult> {
  const service = getSupabaseServiceClient();

  if (role === "developer_super_admin") {
    const { data } = await service
      .from("organizations")
      .select("id, name, slug, status, created_at, updated_at")
      .order("created_at", { ascending: false });

    return {
      organizations: (data ?? []) as OrganizationRow[],
      membershipRoleByOrgId: new Map(),
    };
  }

  const { data: membershipData } = await service
    .from("memberships")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .neq("role", "part_time_staff");
  const memberships = (membershipData ?? []) as MembershipRow[];
  const membershipRoleByOrgId = new Map(
    memberships.map((m) => [m.organization_id, m.role as OrganizationRole]),
  );
  const organizationIds = memberships.map((m) => m.organization_id);

  if (organizationIds.length === 0) {
    return { organizations: [], membershipRoleByOrgId: new Map() };
  }

  const { data } = await service
    .from("organizations")
    .select("id, name, slug, status, created_at, updated_at")
    .in("id", organizationIds)
    .order("created_at", { ascending: false });

  return {
    organizations: (data ?? []) as OrganizationRow[],
    membershipRoleByOrgId,
  };
}

export default async function AdminAnnouncementsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession();
  const params = (await searchParams) ?? {};
  const copy = getAnnouncementDictionary(session.user.preferredLanguage);
  const service = getSupabaseServiceClient();
  const { organizations, membershipRoleByOrgId } = await getWritableOrganizations(
    session.user.id,
    session.user.role,
  );
  const isPlatformAdmin = session.user.role === "developer_super_admin";
  const organizationIds = organizations.map((organization) => organization.id);
  const organizationNames = new Map(
    organizations.map((organization) => [organization.id, organization.name]),
  );

  const announcementQuery = service
    .from("announcements")
    .select(
      "id, organization_id, title, content, created_by_user_id, target_scope, target_roles, status, is_important, is_pinned, show_popup_on_app_open, popup_until, allow_comments, image_urls, published_at, archived_at, created_at, updated_at",
    )
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: announcementData } =
    organizationIds.length > 0
      ? await announcementQuery.in("organization_id", organizationIds)
      : { data: [] };
  const announcements = (announcementData ?? []) as AnnouncementRow[];
  const authorIds = [
    ...new Set(announcements.map((announcement) => announcement.created_by_user_id)),
  ];

  const { data: profileData } =
    authorIds.length > 0
      ? await service.from("profiles").select("id, name").in("id", authorIds)
      : { data: [] };
  const profiles = (profileData ?? []) as ProfileRow[];
  const authorNames = new Map(profiles.map((profile) => [profile.id, profile.name]));

  const created = firstParam(params.created) === "1";
  const deleted = firstParam(params.deleted) === "1";
  const statusUpdated = firstParam(params.statusUpdated) === "1";
  const errorKey = firstParam(params.error);
  const now = new Date();
  const publishedPopups = announcements.filter(
    (announcement) =>
      announcement.status === "published" && announcement.show_popup_on_app_open,
  );
  const popupCandidates = filterAnnouncementsByTargetVisibility(
    publishedPopups,
    isPlatformAdmin,
    membershipRoleByOrgId,
  );
  const dismissals = await getPopupDismissals(
    session.user.id,
    popupCandidates.map((a) => a.id),
  );
  const popupAnnouncements = popupCandidates
    .filter(
      (announcement) =>
        !dismissals.has(announcement.id) &&
        (!announcement.popup_until || new Date(announcement.popup_until) > now),
    )
    .map((announcement) => ({
      content: announcement.content,
      id: announcement.id,
      imageUrls: announcement.image_urls,
      isImportant: announcement.is_important,
      organizationId: announcement.organization_id,
      title: announcement.title,
    }));

  return (
    <AdminShell activeItem="announcements" title={copy.title}>
      <AnnouncementPopup
        announcements={popupAnnouncements}
        detailHrefBase="/admin/announcements"
        locale={session.user.preferredLanguage}
      />

      <div className="rounded-lg border border-border bg-surface/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Megaphone className="size-5" aria-hidden="true" />
              </div>
              <Badge className="rounded-md">{announcements.length}</Badge>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-muted-foreground">
              {copy.description}
            </p>
          </div>
        </div>
      </div>

      {(created || deleted || statusUpdated || errorKey) && (
        <div className="mt-5 rounded-lg border border-border bg-surface/70 px-4 py-3 text-sm font-semibold shadow-sm">
          {created && copy.success.created}
          {deleted && copy.success.deleted}
          {statusUpdated && copy.success.statusUpdated}
          {errorKey && (copy.errors[errorKey] ?? copy.errors.save_failed)}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(360px,480px)_1fr]">
        <AnnouncementCreateCard
          copy={copy}
          organizations={organizations.map((o) => ({ id: o.id, name: o.name }))}
        />

        <Card className="rounded-lg p-4 shadow-sm">
          {announcements.length === 0 && (
            <div className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-background/40 p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Megaphone className="size-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-black text-foreground">{copy.title}</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm font-semibold leading-6 text-muted-foreground">
                  {copy.empty}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {announcements.map((announcement) => {
              const canManage = canManageAnnouncementInList(
                announcement,
                isPlatformAdmin,
                membershipRoleByOrgId,
                session.user.id,
              );

              return (
                <article
                  className="rounded-lg border border-border/80 bg-background/45 p-4 transition-colors hover:border-primary/20 hover:bg-background/70"
                  key={announcement.id}
                >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_9rem]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-md">
                      {copy.statuses[announcement.status]}
                    </Badge>
                    {announcement.is_important && (
                      <Badge className="rounded-md border-destructive/20 bg-destructive/10 text-destructive">
                        <ShieldAlert className="mr-1 size-3" aria-hidden="true" />
                        {copy.important}
                      </Badge>
                    )}
                    {announcement.is_pinned && (
                      <Badge className="rounded-md">
                        <Pin className="mr-1 size-3" aria-hidden="true" />
                        {copy.pinned}
                      </Badge>
                    )}
                    {announcement.image_urls.length > 0 && (
                      <Badge className="rounded-md">
                        <ImageIcon className="mr-1 size-3" aria-hidden="true" />
                        {announcement.image_urls.length}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
                    <div className="min-w-0">
                      <Link
                        className="group inline-flex max-w-full items-start gap-1 text-lg font-black leading-snug text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:underline"
                        href={`/admin/announcements/${announcement.id}`}
                      >
                        <span className="line-clamp-2 break-words">
                          {announcement.title}
                        </span>
                        <ArrowUpRight
                          className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                          aria-hidden="true"
                        />
                      </Link>
                      <Link
                        className="mt-2 line-clamp-3 block text-sm font-semibold leading-6 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
                        href={`/admin/announcements/${announcement.id}`}
                      >
                        {announcement.content}
                      </Link>
                    </div>

                    <Link
                      className="hidden overflow-hidden rounded-lg border border-border bg-surface/70 sm:block"
                      href={`/admin/announcements/${announcement.id}`}
                    >
                      {announcement.image_urls[0] ? (
                        <Image
                          alt=""
                          className="aspect-square w-full object-cover"
                          height={160}
                          src={announcement.image_urls[0]}
                          width={160}
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center text-muted-foreground">
                          <Megaphone className="size-6" aria-hidden="true" />
                        </div>
                      )}
                    </Link>
                  </div>

                  <dl className="mt-4 grid gap-3 border-t border-border/70 pt-4 text-xs font-semibold text-muted-foreground md:grid-cols-3">
                    <div className="min-w-0">
                      <dt>{copy.organization}</dt>
                      <dd className="mt-1 line-clamp-2 break-words text-foreground">
                        {organizationNames.get(announcement.organization_id) ?? ""}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt>{copy.author}</dt>
                      <dd className="mt-1 line-clamp-2 break-words text-foreground">
                        {authorNames.get(announcement.created_by_user_id) ?? ""}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="flex items-center gap-1">
                        <Users className="size-3" aria-hidden="true" />
                        {copy.target}
                      </dt>
                      <dd className="mt-1 line-clamp-2 break-words text-foreground">
                        {announcement.target_scope === "everyone"
                          ? copy.targetScopes.everyone
                          : announcement.target_roles
                              .map((role) => copy.targetRoles[role])
                              .join(", ")}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="flex items-center gap-1">
                        <CalendarDays className="size-3" aria-hidden="true" />
                        {copy.publishedAt}
                      </dt>
                      <dd className="mt-1 truncate text-foreground">
                        {formatDate(
                          announcement.published_at,
                          session.user.preferredLanguage,
                        )}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt>{copy.archivedAt}</dt>
                      <dd className="mt-1 truncate text-foreground">
                        {formatDate(
                          announcement.archived_at,
                          session.user.preferredLanguage,
                        )}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt>{copy.status}</dt>
                      <dd className="mt-1 truncate text-foreground">
                        {copy.statuses[announcement.status]}
                      </dd>
                    </div>
                  </dl>
                </div>

                {canManage && (
                  <div className="grid content-start gap-2 sm:grid-cols-3 lg:grid-cols-1">
                    {announcement.status !== "published" && (
                      <form action={updateAnnouncementStatus}>
                        <input name="announcementId" type="hidden" value={announcement.id} />
                        <input name="status" type="hidden" value="published" />
                        <Button className="w-full" type="submit" variant="secondary">
                          {copy.publish}
                        </Button>
                      </form>
                    )}
                    {announcement.status !== "draft" && (
                      <form action={updateAnnouncementStatus}>
                        <input name="announcementId" type="hidden" value={announcement.id} />
                        <input name="status" type="hidden" value="draft" />
                        <Button className="w-full" type="submit" variant="secondary">
                          {copy.backToDraft}
                        </Button>
                      </form>
                    )}
                    {announcement.status !== "archived" && (
                      <form action={updateAnnouncementStatus}>
                        <input name="announcementId" type="hidden" value={announcement.id} />
                        <input name="status" type="hidden" value="archived" />
                        <Button className="w-full" type="submit" variant="secondary">
                          {copy.archive}
                        </Button>
                      </form>
                    )}
                    <DeleteAnnouncementButton
                      action={deleteAnnouncement}
                      announcementId={announcement.id}
                      cancelLabel={copy.cancel}
                      confirmBody={copy.confirmDeleteBody}
                      confirmTitle={copy.confirmDeleteTitle}
                      deleteLabel={copy.delete}
                    />
                  </div>
                )}
              </div>
                </article>
              );
            })}
          </div>
        </Card>
      </div>

      {isPlatformAdmin && (
        <div className="mt-6">
          <Card className="rounded-lg p-5 shadow-sm">
            <h2 className="text-base font-black">{copy.maintenance.title}</h2>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              {copy.maintenance.description}
            </p>
            <div className="mt-4">
              <OrphanCleanupButton
                labels={{
                  button: copy.maintenance.button,
                  deleted: copy.maintenance.deleted,
                  errors: copy.maintenance.errors,
                  failed: copy.maintenance.failed,
                  listingFailures: copy.maintenance.listingFailures,
                  running: copy.maintenance.running,
                  skippedGrace: copy.maintenance.skippedGrace,
                  skippedReferenced: copy.maintenance.skippedReferenced,
                }}
              />
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
