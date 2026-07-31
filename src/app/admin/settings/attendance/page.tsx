import Link from "next/link";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { Check, Plus, QrCode as QrIcon, Smartphone, TriangleAlert } from "lucide-react";
import {
  issueAttendanceSiteQr,
  revokeAttendanceTrustedDevice,
  saveAttendanceSiteSettings,
} from "@/app/admin/settings/attendance/actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { SettingsSubnav } from "@/components/admin/settings/settings-subnav";
import "@/components/admin/settings/settings-console.css";
import { isOrgTopAdminOrPlatform } from "@/config/roles";
import { requireAdminSession } from "@/lib/admin-session";
import { attendanceQrLinkState, buildAttendanceQrValue } from "@/lib/attendance-qr";
import { getAttendanceSiteQrOverview, getQrTokenHistory } from "@/lib/attendance-sites";
import { listTrustedDevices } from "@/lib/attendance-trusted-device";
import { getDictionary } from "@/lib/i18n";
import { hasOrganizationContext } from "@/lib/session";
import type { AttendanceSiteRow } from "@/lib/attendance";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatField(site: AttendanceSiteRow | null, key: "latitude" | "longitude") {
  if (!site) return "";
  return typeof site[key] === "number" ? String(site[key]) : String(site[key] ?? "");
}

/** 목록·이력의 날짜는 도쿄 기준으로 짧게. */
function tokyoDate(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// Admin · 출퇴근 QR — 마스터·디테일 (2026-07-31 리디자인, 디자인 초안 1b).
//
// 현장이 여러 곳인 현실을 정면으로 다룬다: 좌측 표에서 **전 현장의 QR 상태를 한눈에** 보고,
// 우측에서 선택한 한 곳을 관리한다(현장 정보 / QR / 기억된 기기). 린넨·청소 콘솔의
// 목록+상세 패턴과 같은 구조이고, 시각 표현은 공용 `.adm` 프리미티브를 그대로 쓴다.
//
// QR 은 인쇄물이라 "지금 뽑아도 되는가"를 출력 전에 알려주는 것이 이 화면의 핵심 책임이다.
// See docs/product/24-attendance-workflow.md → "QR Deep Link" / "인쇄 전 안전장치".
export default async function AdminAttendanceSettingsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession();
  if (!isOrgTopAdminOrPlatform(session.user.role) || !hasOrganizationContext(session)) {
    redirect("/admin/settings?error=forbidden");
  }

  const params = (await searchParams) ?? {};
  const selectedSiteId = firstParam(params.site) ?? "";
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;
  const organizationId = session.organization.id;

  const rows = await getAttendanceSiteQrOverview(organizationId);
  // `?site=new` 는 "선택 없음" = 신규 등록 폼. 그 외에는 선택된 현장, 없으면 첫 현장.
  const selectedRow =
    rows.find((row) => row.site.id === selectedSiteId) ?? (selectedSiteId ? null : rows[0] ?? null);
  const selectedSite = selectedRow?.site ?? null;
  const activeQr = selectedRow?.token ?? null;

  // QR 에는 토큰이 아니라 절대 URL 을 담는다 — 휴대폰 기본 카메라로 찍으면 바로 인증 화면으로
  // 들어오게 하기 위해서다. 토큰 값 자체는 그대로라 기존 인쇄물도 앱 스캔에서 계속 동작한다.
  const qrValue = activeQr ? buildAttendanceQrValue(activeQr.token) : null;
  const qrSvg = qrValue ? await QRCode.toString(qrValue, { type: "svg", margin: 1, width: 256 }) : null;
  const qrLinkState = qrValue ? attendanceQrLinkState(qrValue) : null;

  const [history, trustedDevices] = await Promise.all([
    selectedSite ? getQrTokenHistory(organizationId, selectedSite.id) : Promise.resolve([]),
    listTrustedDevices(organizationId),
  ]);

  const saved = firstParam(params.saved) === "1";
  const issued = firstParam(params.issued) === "1";
  const reissued = firstParam(params.reissued) === "1";
  const deviceRevoked = firstParam(params.device_revoked) === "1";
  const errorKey = firstParam(params.error);
  const flashMessage =
    (saved && settings.success.attendanceSiteSaved) ||
    (issued && settings.success.attendanceQrIssued) ||
    (reissued && settings.success.attendanceQrReissued) ||
    (deviceRevoked && settings.success.attendanceDeviceRevoked) ||
    (errorKey ? settings.errors[errorKey] ?? settings.errors.save_failed : "");
  const flashIsError = Boolean(errorKey);
  const missingQr = rows.filter((row) => !row.token).length;

  return (
    <AdminShell activeItem="settings" title={settings.attendanceTitle}>
      <SettingsSubnav
        active="attendance"
        settings={settings}
        showOrganization={session.user.role === "developer_super_admin"}
      />

      {flashMessage ? (
        <div
          className={`setnote ${flashIsError ? "setnote--warn" : "setnote--ok"}`}
          style={{ marginBottom: 14 }}
        >
          <span className="ic">{flashIsError ? <TriangleAlert /> : <Check />}</span>
          <span>{flashMessage}</span>
        </div>
      ) : null}

      {missingQr > 0 ? (
        <div className="setnote setnote--warn" style={{ marginBottom: 14 }}>
          <span className="ic">
            <TriangleAlert aria-hidden="true" />
          </span>
          <span>{settings.attendanceMissingQrWarn.replace("{n}", String(missingQr))}</span>
        </div>
      ) : null}

      <div className="setgrid">
        {/* ── 마스터: 현장 목록 + QR 상태 ── */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card__h">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="card__t">
                {settings.attendanceSiteListTitle} {rows.length}
              </div>
              <div className="setsub">{settings.attendanceSiteListDescription}</div>
            </div>
            <Link className="chipbtn" href="/admin/settings/attendance?site=new">
              <span className="ic">
                <Plus aria-hidden="true" />
              </span>
              {settings.attendanceNewSite}
            </Link>
          </div>

          {rows.length === 0 ? (
            <div className="card__body">
              <div className="setnote setnote--dim">{settings.attendanceEmptySites}</div>
            </div>
          ) : (
            <div>
              {rows.map((row) => {
                const state = row.token
                  ? attendanceQrLinkState(buildAttendanceQrValue(row.token.token))
                  : null;
                return (
                  <Link
                    className={`setrow${selectedSite?.id === row.site.id ? " is-sel" : ""}`}
                    href={`/admin/settings/attendance?site=${row.site.id}`}
                    key={row.site.id}
                  >
                    <span className="setrow__b">
                      <span className="setsite__n">{row.site.name}</span>
                      <span className="setsite__m">
                        {row.site.latitude}, {row.site.longitude} · {row.site.allowed_radius_meters}m
                      </span>
                    </span>
                    {!row.token ? (
                      <span className="pill pill--danger">{settings.attendanceQrNone}</span>
                    ) : state === "ok" ? (
                      <span className="pill pill--done">{settings.attendanceQrOk}</span>
                    ) : (
                      <span className="pill pill--warn">{settings.attendanceQrNeedsFix}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 디테일: 선택한 현장 ── */}
        <div className="setstack">
          <div className="card">
            <div className="card__h">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card__t">
                  {selectedSite ? selectedSite.name : settings.attendanceCreateSiteTitle}
                </div>
                <div className="setsub">
                  {selectedSite
                    ? settings.attendanceEditSiteDescription
                    : settings.attendanceCreateSiteDescription}
                </div>
              </div>
            </div>
            <div className="card__body">
              <form action={saveAttendanceSiteSettings} className="setform">
                <input name="siteId" type="hidden" value={selectedSite?.id ?? ""} />
                <div className="fld">
                  <label className="fld__l" htmlFor="site-name">
                    {settings.attendanceSiteName}
                  </label>
                  <input defaultValue={selectedSite?.name ?? ""} id="site-name" name="name" required />
                </div>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 11 }}
                >
                  <div className="fld">
                    <label className="fld__l" htmlFor="site-lat">
                      {settings.attendanceLatitude}
                    </label>
                    <input
                      defaultValue={formatField(selectedSite, "latitude")}
                      id="site-lat"
                      inputMode="decimal"
                      name="latitude"
                      required
                      step="any"
                      type="number"
                    />
                  </div>
                  <div className="fld">
                    <label className="fld__l" htmlFor="site-lng">
                      {settings.attendanceLongitude}
                    </label>
                    <input
                      defaultValue={formatField(selectedSite, "longitude")}
                      id="site-lng"
                      inputMode="decimal"
                      name="longitude"
                      required
                      step="any"
                      type="number"
                    />
                  </div>
                </div>
                <div className="fld" style={{ marginTop: 11 }}>
                  <label className="fld__l" htmlFor="site-radius">
                    {settings.attendanceRadius}
                  </label>
                  <input
                    defaultValue={selectedSite?.allowed_radius_meters?.toString() ?? "100"}
                    id="site-radius"
                    inputMode="numeric"
                    min={1}
                    name="radius"
                    required
                    step={1}
                    type="number"
                  />
                  <p className="fld__hint">{settings.attendanceRadiusHint}</p>
                </div>
                <button className="btn btn--pri" style={{ marginTop: 14 }} type="submit">
                  {selectedSite ? settings.attendanceSaveSite : settings.attendanceCreateSiteCta}
                </button>
              </form>
            </div>
          </div>

          {/* QR */}
          <div className="card">
            <div className="card__h">
              <span className="card__ic bg-pri">
                <span className="ic">
                  <QrIcon aria-hidden="true" />
                </span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card__t">{settings.attendanceQrSectionTitle}</div>
                <div className="setsub">{settings.attendanceQrSectionDescription}</div>
              </div>
            </div>
            <div className="card__body">
              {!selectedSite ? (
                <div className="setnote setnote--dim">{settings.attendanceCreateFirstHint}</div>
              ) : activeQr && qrSvg ? (
                <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div className="setqr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div
                      className={`setnote ${qrLinkState === "ok" ? "setnote--ok" : "setnote--warn"}`}
                    >
                      <span className="ic">
                        {qrLinkState === "ok" ? <Check /> : <TriangleAlert />}
                      </span>
                      <span>
                        {qrLinkState === "ok"
                          ? settings.attendanceQrReady
                          : qrLinkState === "local"
                            ? settings.attendanceQrWarnLocal
                            : settings.attendanceQrWarnMissing}
                      </span>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div className="kv">
                        <span className="kv__k">{settings.attendanceQrLink}</span>
                        <span className="kv__v mono" style={{ fontSize: 11 }}>
                          {qrValue}
                        </span>
                      </div>
                      <div className="kv">
                        <span className="kv__k">{settings.attendanceToken}</span>
                        <span className="kv__v mono" style={{ fontSize: 11 }}>
                          {activeQr.token}
                        </span>
                      </div>
                      <div className="kv">
                        <span className="kv__k">{settings.attendanceIssuedAt}</span>
                        <span className="kv__v mono">{tokyoDate(activeQr.issued_at)}</span>
                      </div>
                    </div>
                    <form action={issueAttendanceSiteQr} style={{ marginTop: 12 }}>
                      <input name="siteId" type="hidden" value={selectedSite.id} />
                      <button className="btn btn--ghost btn--sm" type="submit">
                        {settings.attendanceReissueQr}
                      </button>
                      <p className="fld__hint">{settings.attendanceReissueHint}</p>
                    </form>
                  </div>
                </div>
              ) : (
                <>
                  <div className="setnote setnote--warn">
                    <span className="ic">
                      <TriangleAlert aria-hidden="true" />
                    </span>
                    <span>{settings.attendanceNoQr}</span>
                  </div>
                  <form action={issueAttendanceSiteQr} style={{ marginTop: 12 }}>
                    <input name="siteId" type="hidden" value={selectedSite.id} />
                    <button className="btn btn--pri" type="submit">
                      {settings.attendanceIssueQr}
                    </button>
                  </form>
                </>
              )}

              {history.length > 1 ? (
                <div style={{ marginTop: 16 }}>
                  <div className="fld__l">{settings.attendanceQrHistory}</div>
                  {history.map((token) => (
                    <div className="sethist" key={token.id}>
                      <span className={token.is_active ? "pill pill--done" : "pill pill--muted"}>
                        {token.is_active ? settings.attendanceQrOk : settings.attendanceQrRevoked}
                      </span>
                      <span style={{ flex: 1 }} />
                      <span className="sethist__d">{tokyoDate(token.issued_at)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* 기억된 기기 */}
          <div className="card">
            <div className="card__h">
              <span className="card__ic bg-pri">
                <span className="ic">
                  <Smartphone aria-hidden="true" />
                </span>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="card__t">
                  {settings.attendanceDevicesTitle} {trustedDevices.length}
                </div>
                <div className="setsub">{settings.attendanceDevicesDescription}</div>
              </div>
            </div>
            {trustedDevices.length === 0 ? (
              <div className="card__body">
                <div className="setnote setnote--dim">{settings.attendanceDevicesEmpty}</div>
              </div>
            ) : (
              <table className="qtbl">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 16 }}>{settings.attendanceDeviceStaff}</th>
                    <th>{settings.attendanceDeviceLastUsed}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {trustedDevices.map((device) => (
                    <tr key={device.id}>
                      <td style={{ paddingLeft: 16 }}>
                        <span className="setsite__n">{device.userName}</span>
                        <span className="setsite__m">
                          {device.deviceLabel ?? settings.attendanceDeviceUnknown}
                        </span>
                      </td>
                      <td className="mono" style={{ color: "var(--muted)" }}>
                        {tokyoDate(device.lastUsedAt)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <form action={revokeAttendanceTrustedDevice}>
                          <input name="deviceId" type="hidden" value={device.id} />
                          <input name="siteId" type="hidden" value={selectedSite?.id ?? ""} />
                          <button className="btn btn--ghost btn--sm" type="submit">
                            {settings.attendanceDeviceRevoke}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
