import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Check, Plus, TriangleAlert } from "lucide-react";
import { createOrganization, updateOrganization } from "@/app/admin/settings/actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { OrgDeleteButton } from "@/components/admin/settings/org-delete-button";
import { SettingsSubnav } from "@/components/admin/settings/settings-subnav";
import "@/components/admin/settings/settings-console.css";
import { getDictionary } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/admin-session";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
type OrganizationStatus = Database["public"]["Enums"]["organization_status"];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusPillClass(status: OrganizationStatus): string {
  if (status === "active") return "pill pill--done";
  if (status === "suspended") return "pill pill--warn";
  return "pill pill--muted";
}

// Admin · 조직 설정 — 마스터·디테일 (2026-07-31 리디자인, 디자인 초안 1b).
// 좌측에 조직 목록, 우측에 선택한 조직의 편집/삭제와 신규 생성. 출퇴근 QR 화면과 같은 구조라
// 설정 섹션 안에서 조작 방식이 바뀌지 않는다. 플랫폼 개발자 전용 화면이다.
export default async function AdminOrganizationSettingsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession();
  if (session.user.role !== "developer_super_admin") {
    redirect("/admin/settings?error=forbidden");
  }

  const params = (await searchParams) ?? {};
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;
  const statusLabels = settings.organizationStatusLabels as Record<OrganizationStatus, string>;

  const service = getSupabaseServiceClient();
  const [{ data }, { data: memberRows }] = await Promise.all([
    service
      .from("organizations")
      .select("id, name, slug, status, created_at, updated_at")
      .order("created_at", { ascending: false }),
    service.from("memberships").select("organization_id"),
  ]);
  const organizations = (data ?? []) as OrganizationRow[];

  const memberCounts = new Map<string, number>();
  for (const row of (memberRows ?? []) as { organization_id: string }[]) {
    memberCounts.set(row.organization_id, (memberCounts.get(row.organization_id) ?? 0) + 1);
  }

  const selectedOrgId = firstParam(params.org) ?? "";
  const selected =
    organizations.find((org) => org.id === selectedOrgId) ??
    (selectedOrgId ? null : organizations[0] ?? null);
  const selectedMembers = selected ? (memberCounts.get(selected.id) ?? 0) : 0;

  const created = firstParam(params.created) === "1";
  const updated = firstParam(params.updated) === "1";
  const deleted = firstParam(params.deleted) === "1";
  const errorKey = firstParam(params.error);
  const flashMessage = created
    ? settings.success.organizationCreated
    : updated
      ? settings.success.organizationUpdated
      : deleted
        ? settings.success.organizationDeleted
        : errorKey
          ? (settings.errors[errorKey] ?? settings.errors.save_failed)
          : "";

  return (
    <AdminShell activeItem="settings" title={settings.organizationTitle}>
      <SettingsSubnav active="organization" settings={settings} showOrganization />

      {flashMessage ? (
        <div
          className={`setnote ${errorKey ? "setnote--warn" : "setnote--ok"}`}
          style={{ marginBottom: 14 }}
        >
          <span className="ic">{errorKey ? <TriangleAlert /> : <Check />}</span>
          <span>{flashMessage}</span>
        </div>
      ) : null}

      <div className="setgrid">
        {/* ── 마스터: 조직 목록 ── */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card__h">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="card__t">
                {settings.currentOrganizations} {organizations.length}
              </div>
            </div>
            <Link className="chipbtn" href="/admin/settings/organization?org=new">
              <span className="ic">
                <Plus aria-hidden="true" />
              </span>
              {settings.create}
            </Link>
          </div>

          {organizations.length === 0 ? (
            <div className="card__body">
              <div className="setnote setnote--dim">{settings.emptyOrganizations}</div>
            </div>
          ) : (
            <div>
              {organizations.map((org) => (
                <Link
                  className={`setrow${selected?.id === org.id ? " is-sel" : ""}`}
                  href={`/admin/settings/organization?org=${org.id}`}
                  key={org.id}
                >
                  <span className="setrow__b">
                    <span className="setsite__n">{org.name}</span>
                    <span className="setsite__m">{org.slug}</span>
                  </span>
                  <span className="setrow__side">
                    <span className={statusPillClass(org.status)}>
                      {statusLabels[org.status] ?? org.status}
                    </span>
                    <span className="setsite__m">
                      {settings.membersLabel} {memberCounts.get(org.id) ?? 0}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── 디테일 ── */}
        <div className="setstack">
          {selected ? (
            <div className="card">
              <div className="card__h">
                <span className="card__ic bg-pri">
                  <span className="ic">
                    <Building2 aria-hidden="true" />
                  </span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card__t">{selected.name}</div>
                  <div className="setsub">
                    {selected.slug} · {settings.membersLabel} {selectedMembers}
                  </div>
                </div>
                <span className={statusPillClass(selected.status)}>
                  {statusLabels[selected.status] ?? selected.status}
                </span>
              </div>
              <div className="card__body">
                <form action={updateOrganization} className="setform">
                  <input name="organizationId" type="hidden" value={selected.id} />
                  <div className="fld">
                    <label className="fld__l" htmlFor="org-name">
                      {settings.organizationName}
                    </label>
                    <div className="setinline">
                      <div className="fld">
                        <input defaultValue={selected.name} id="org-name" name="name" required />
                      </div>
                      <button className="btn btn--pri" type="submit">
                        {settings.saveName}
                      </button>
                    </div>
                  </div>
                </form>

                <div style={{ marginTop: 16 }}>
                  {selectedMembers === 0 ? (
                    <OrgDeleteButton
                      labels={{
                        delete: settings.deleteOrganization,
                        cancel: dictionary.common.cancel,
                        confirm: settings.orgDeleteConfirm,
                      }}
                      organizationId={selected.id}
                    />
                  ) : (
                    <div className="setnote setnote--dim">{settings.errors.org_not_empty}</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* 신규 생성 */}
          <div className="card">
            <div className="card__h">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card__t">{settings.createOrganization}</div>
                <div className="setsub">{settings.organizationDescription}</div>
              </div>
            </div>
            <div className="card__body">
              <form action={createOrganization} className="setform">
                <div className="fld">
                  <label className="fld__l" htmlFor="new-org-name">
                    {settings.organizationName}
                  </label>
                  <input id="new-org-name" name="name" required />
                </div>
                <div className="fld" style={{ marginTop: 11 }}>
                  <label className="fld__l" htmlFor="new-org-slug">
                    {settings.organizationSlug}
                  </label>
                  <input id="new-org-slug" name="slug" />
                </div>
                <label
                  className="setnote setnote--dim"
                  style={{ marginTop: 12, cursor: "pointer", alignItems: "center" }}
                >
                  <input defaultChecked name="addOwner" type="checkbox" />
                  <span>{settings.ownerMembership}</span>
                </label>
                <button className="btn btn--pri" style={{ marginTop: 14 }} type="submit">
                  {settings.create}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
