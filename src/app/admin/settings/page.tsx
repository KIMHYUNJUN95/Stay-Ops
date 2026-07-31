import Link from "next/link";
import { Building2, ChevronRight, QrCode, TriangleAlert } from "lucide-react";
import { AdminShell } from "@/components/shell/admin-shell";
import "@/components/admin/settings/settings-console.css";
import { isOrgTopAdminOrPlatform } from "@/config/roles";
import { requireAdminSession } from "@/lib/admin-session";
import { attendanceQrLinkState, buildAttendanceQrValue } from "@/lib/attendance-qr";
import { getAttendanceSiteQrOverview } from "@/lib/attendance-sites";
import { getDictionary } from "@/lib/i18n";
import { hasOrganizationContext } from "@/lib/session";

// Admin · 설정 — 섹션 랜딩.
//
// 2026-07-31 리디자인: 설정 3화면만 구형 Tailwind Card/Button 조합으로 남아 다른 콘솔과 톤이
// 어긋나 있었다. 공용 `.adm` 프리미티브로 옮기면서, 카드가 단순 링크가 아니라 **지금 상태**를
// 같이 보여주게 했다(현장 수 / QR 준비됨 / 교체 필요). "오쿠보C에 QR이 있나?" 를 클릭 없이 알 수
// 있어야 한다. 초대코드는 2026-07-13 에 `/admin/users/invites` 로 옮겨져 여기 없다.
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdminSession();
  const params = (await searchParams) ?? {};
  const errorRaw = params.error;
  const errorKey = Array.isArray(errorRaw) ? errorRaw[0] : errorRaw;
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;

  const canManageAttendance =
    isOrgTopAdminOrPlatform(session.user.role) && hasOrganizationContext(session);
  // 조직 설정은 플랫폼 개발자 전용이다. 예전에는 카드가 모두에게 보이는데 페이지만 막혀 있어서
  // 누르면 forbidden 으로 튕겼다 — 카드 노출을 페이지 권한과 맞춘다.
  const canManageOrganization = session.user.role === "developer_super_admin";

  const allSites = canManageAttendance
    ? await getAttendanceSiteQrOverview(session.organization.id)
    : [];
  // 비활성 현장은 의도적으로 운영에서 뺀 것이므로 카운트·경고에서 제외한다.
  const sites = allSites.filter((row) => row.site.is_active);
  const readyCount = sites.filter(
    (row) => row.token && attendanceQrLinkState(buildAttendanceQrValue(row.token.token)) === "ok",
  ).length;
  const attentionCount = sites.length - readyCount;

  return (
    <AdminShell activeItem="settings" title={settings.settingsTitle}>
      <div className="setpage">
        <div className="setpage__h">
          <div className="setpage__t">{settings.settingsTitle}</div>
          <div className="setpage__s">{settings.settingsDescription}</div>
        </div>

        {errorKey ? (
          <div className="setnote setnote--warn" style={{ marginBottom: 14 }}>
            <span className="ic">
              <TriangleAlert aria-hidden="true" />
            </span>
            <span>{settings.errors[errorKey] ?? settings.errors.save_failed}</span>
          </div>
        ) : null}

        <div className="card setindex">
        {canManageOrganization ? (
          <Link className="setrow" href="/admin/settings/organization">
            <span className="card__ic bg-pri">
              <span className="ic">
                <Building2 aria-hidden="true" />
              </span>
            </span>
            <span className="setrow__b">
              <span className="card__t">{settings.organizationTitle}</span>
              <span className="setsub">{settings.organizationDescription}</span>
            </span>
            <span className="ic setrow__chev">
              <ChevronRight aria-hidden="true" />
            </span>
          </Link>
        ) : null}

        {canManageAttendance ? (
          <Link className="setrow" href="/admin/settings/attendance">
            <span className="card__ic bg-pri">
              <span className="ic">
                <QrCode aria-hidden="true" />
              </span>
            </span>
            <span className="setrow__b">
              <span className="card__t">{settings.attendanceTitle}</span>
              <span className="setsub">{settings.attendanceDescription}</span>
              <span className="setrow__pills">
                <span className="pill pill--muted">
                  {settings.settingsSitesLabel} {sites.length}
                </span>
                <span className={readyCount > 0 ? "pill pill--done" : "pill pill--muted"}>
                  {settings.settingsQrReadyLabel} {readyCount}
                </span>
                {attentionCount > 0 ? (
                  <span className="pill pill--warn">
                    <span className="ic">
                      <TriangleAlert aria-hidden="true" />
                    </span>
                    {settings.settingsQrAttentionLabel} {attentionCount}
                  </span>
                ) : null}
              </span>
            </span>
            <span className="ic setrow__chev">
              <ChevronRight aria-hidden="true" />
            </span>
          </Link>
          ) : null}
        </div>
      </div>
    </AdminShell>
  );
}
