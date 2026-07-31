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
export default async function AdminSettingsPage() {
  const session = await requireAdminSession();
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;

  const canManageAttendance =
    isOrgTopAdminOrPlatform(session.user.role) && hasOrganizationContext(session);
  // 조직 설정은 플랫폼 개발자 전용이다. 예전에는 카드가 모두에게 보이는데 페이지만 막혀 있어서
  // 누르면 forbidden 으로 튕겼다 — 카드 노출을 페이지 권한과 맞춘다.
  const canManageOrganization = session.user.role === "developer_super_admin";

  const sites = canManageAttendance
    ? await getAttendanceSiteQrOverview(session.organization.id)
    : [];
  const readyCount = sites.filter(
    (row) => row.token && attendanceQrLinkState(buildAttendanceQrValue(row.token.token)) === "ok",
  ).length;
  const attentionCount = sites.length - readyCount;

  return (
    <AdminShell activeItem="settings" title={settings.settingsTitle}>
      <p className="hmeta" style={{ marginBottom: 16 }}>
        {settings.settingsDescription}
      </p>

      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        }}
      >
        {canManageOrganization ? (
          <Link className="card" href="/admin/settings/organization" style={{ display: "block" }}>
            <div className="card__h">
              <span className="ic" style={{ fontSize: 22, color: "var(--primary)" }}>
                <Building2 aria-hidden="true" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card__t">{settings.organizationTitle}</div>
                <div className="card__s">{settings.organizationDescription}</div>
              </div>
              <span className="ic" style={{ color: "var(--faint)" }}>
                <ChevronRight aria-hidden="true" />
              </span>
            </div>
          </Link>
        ) : null}

        {canManageAttendance ? (
          <Link className="card" href="/admin/settings/attendance" style={{ display: "block" }}>
            <div className="card__h">
              <span className="ic" style={{ fontSize: 22, color: "var(--primary)" }}>
                <QrCode aria-hidden="true" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card__t">{settings.attendanceTitle}</div>
                <div className="card__s">{settings.attendanceDescription}</div>
              </div>
              <span className="ic" style={{ color: "var(--faint)" }}>
                <ChevronRight aria-hidden="true" />
              </span>
            </div>
            <div className="card__b" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
            </div>
          </Link>
        ) : null}
      </div>
    </AdminShell>
  );
}
