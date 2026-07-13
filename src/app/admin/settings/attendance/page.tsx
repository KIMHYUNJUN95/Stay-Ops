import Link from "next/link";
import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { MapPinned, Plus, QrCode } from "lucide-react";
import { issueAttendanceSiteQr, saveAttendanceSiteSettings } from "@/app/admin/settings/attendance/actions";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDictionary } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/admin-session";
import { getActiveQrToken, listAttendanceSites } from "@/lib/attendance-sites";
import { hasOrganizationContext } from "@/lib/session";
import { isOrgTopAdmin } from "@/config/roles";
import type { AttendanceSiteRow } from "@/lib/attendance";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminAttendanceSettingsPage({ searchParams }: PageProps) {
  const session = await requireAdminSession();
  if (!isOrgTopAdmin(session.user.role) || !hasOrganizationContext(session)) {
    redirect("/admin/settings?error=forbidden");
  }

  const params = (await searchParams) ?? {};
  const selectedSiteId = firstParam(params.site) ?? "";
  const dictionary = getDictionary(session.user.preferredLanguage);
  const settings = dictionary.admin.settings;
  const sites = await listAttendanceSites(session.organization.id);
  const selectedSite =
    sites.find((site) => site.id === selectedSiteId) ??
    (selectedSiteId ? null : sites[0] ?? null);
  const activeQr = selectedSite ? await getActiveQrToken(session.organization.id, selectedSite.id) : null;
  const qrSvg = activeQr
    ? await QRCode.toString(activeQr.token, { type: "svg", margin: 1, width: 256 })
    : null;

  const saved = firstParam(params.saved) === "1";
  const issued = firstParam(params.issued) === "1";
  const reissued = firstParam(params.reissued) === "1";
  const errorKey = firstParam(params.error);
  const flashMessage =
    (saved && settings.success.attendanceSiteSaved) ||
    (issued && settings.success.attendanceQrIssued) ||
    (reissued && settings.success.attendanceQrReissued) ||
    (errorKey ? settings.errors[errorKey] ?? settings.errors.save_failed : "");

  return (
    <AdminShell activeItem="settings" title={settings.attendanceTitle}>
      <Link
        className="text-sm font-semibold text-muted-foreground hover:text-foreground"
        href="/admin/settings"
      >
        {settings.backToSettings}
      </Link>

      <p className="mt-4 max-w-3xl text-sm font-semibold leading-6 text-muted-foreground">
        {settings.attendanceDescription}
      </p>

      {flashMessage ? (
        <div className="mt-4 rounded-xl border border-border bg-background/70 px-4 py-3 text-sm font-semibold">
          {flashMessage}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">{settings.attendanceSiteListTitle}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
                {settings.attendanceSiteListDescription}
              </p>
            </div>
            <Link
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface/80 px-4 text-sm font-semibold shadow-glass backdrop-blur-xl transition-colors hover:bg-surface"
              href="/admin/settings/attendance"
            >
              <Plus className="size-4" aria-hidden="true" />
              {settings.attendanceNewSite}
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {sites.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm font-semibold text-muted-foreground">
                {settings.attendanceEmptySites}
              </p>
            ) : (
              sites.map((site) => {
                const isSelected = selectedSite?.id === site.id;
                return (
                  <Link
                    className={`block rounded-xl border px-4 py-3 transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/8 text-foreground"
                        : "border-border bg-background/70 text-foreground hover:bg-surface"
                    }`}
                    href={`/admin/settings/attendance?site=${site.id}`}
                    key={site.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{site.name}</p>
                        <p className="mt-1 text-sm font-semibold text-muted-foreground">
                          {site.latitude}, {site.longitude}
                        </p>
                      </div>
                      <Badge className={site.is_active ? "" : "border-border bg-muted text-muted-foreground"}>
                        {site.is_active ? dictionary.common.active : dictionary.common.inactive}
                      </Badge>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="p-5">
            <MapPinned className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-8 text-xl font-black">
              {selectedSite ? settings.attendanceEditSiteTitle : settings.attendanceCreateSiteTitle}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
              {selectedSite ? settings.attendanceEditSiteDescription : settings.attendanceCreateSiteDescription}
            </p>

            <form action={saveAttendanceSiteSettings} className="mt-5 space-y-3">
              <input name="siteId" type="hidden" value={selectedSite?.id ?? ""} />
              <Input
                defaultValue={selectedSite?.name ?? ""}
                name="name"
                placeholder={settings.attendanceSiteName}
                required
              />
              <Input
                defaultValue={formatField(selectedSite, "latitude")}
                inputMode="decimal"
                name="latitude"
                placeholder={settings.attendanceLatitude}
                required
                step="any"
                type="number"
              />
              <Input
                defaultValue={formatField(selectedSite, "longitude")}
                inputMode="decimal"
                name="longitude"
                placeholder={settings.attendanceLongitude}
                required
                step="any"
                type="number"
              />
              <Input
                defaultValue={selectedSite?.allowed_radius_meters?.toString() ?? "100"}
                inputMode="numeric"
                min={1}
                name="radius"
                placeholder={settings.attendanceRadius}
                required
                step={1}
                type="number"
              />
              <p className="text-xs font-semibold text-muted-foreground">
                {settings.attendanceRadiusHint}
              </p>
              <Button className="w-full" type="submit">
                {selectedSite ? settings.attendanceSaveSite : settings.attendanceCreateSiteCta}
              </Button>
            </form>
          </Card>

          <Card className="p-5">
            <QrCode className="size-6 text-primary" aria-hidden="true" />
            <h2 className="mt-8 text-xl font-black">{settings.attendanceQrSectionTitle}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-muted-foreground">
              {settings.attendanceQrSectionDescription}
            </p>

            {!selectedSite ? (
              <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-5 text-sm font-semibold text-muted-foreground">
                {settings.attendanceCreateFirstHint}
              </p>
            ) : activeQr && qrSvg ? (
              <>
                <div
                  className="mt-5 flex justify-center rounded-2xl border border-border bg-white p-4"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div className="mt-4 rounded-xl border border-border bg-background/70 p-4">
                  <p className="text-sm font-semibold text-muted-foreground">{settings.attendanceToken}</p>
                  <p className="mt-2 break-all font-mono text-xs font-semibold">{activeQr.token}</p>
                  <p className="mt-4 text-sm font-semibold text-muted-foreground">{settings.attendanceIssuedAt}</p>
                  <p className="mt-2 text-sm font-semibold">{activeQr.issued_at}</p>
                </div>
                <form action={issueAttendanceSiteQr} className="mt-4">
                  <input name="siteId" type="hidden" value={selectedSite.id} />
                  <Button className="w-full" type="submit">
                    {settings.attendanceReissueQr}
                  </Button>
                </form>
                <p className="mt-3 text-xs font-semibold text-muted-foreground">
                  {settings.attendanceReissueHint}
                </p>
              </>
            ) : (
              <>
                <p className="mt-5 rounded-xl border border-dashed border-border px-4 py-5 text-sm font-semibold text-muted-foreground">
                  {settings.attendanceNoQr}
                </p>
                <form action={issueAttendanceSiteQr} className="mt-4">
                  <input name="siteId" type="hidden" value={selectedSite.id} />
                  <Button className="w-full" type="submit">
                    {settings.attendanceIssueQr}
                  </Button>
                </form>
              </>
            )}
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function formatField(site: AttendanceSiteRow | null, key: "latitude" | "longitude") {
  if (!site) return "";
  return typeof site[key] === "number" ? String(site[key]) : String(site[key] ?? "");
}
