import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { updateMaintenanceStatus } from "@/app/admin/maintenance/actions";
import { AnnouncementImageGrid } from "@/components/announcements/announcement-image-grid";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getMaintenanceReportById, maintenanceStatuses, type MaintenanceStatus } from "@/lib/maintenance-reports";
import { requireAdminSession } from "@/lib/admin-session";
import { localizePropertyName } from "@/lib/room-label-normalization";

const statusBadgeClass: Record<MaintenanceStatus, string> = {
  open: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300",
  in_progress: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  resolved: "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/50 dark:text-green-300",
  closed: "border-border bg-muted/50 text-muted-foreground",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ statusUpdated?: string; error?: string }>;
};

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function AdminMaintenanceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [session, { id }, query] = await Promise.all([
    requireAdminSession(),
    params,
    searchParams,
  ]);
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.maintenance;

  const report = await getMaintenanceReportById(session, id);
  if (!report) {
    notFound();
  }

  const errorMessage = query.error ? (copy.errors[query.error] ?? null) : null;

  return (
    <AdminShell activeItem="maintenance" title={copy.detailTitle}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/maintenance">
            <Button type="button" variant="secondary">
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {copy.backToList}
            </Button>
          </Link>
        </div>

        {query.statusUpdated ? (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            {copy.statusUpdated}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {report.cleaning_session_id ? (
                <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                  {copy.fromCleaningTag}
                </p>
              ) : null}
              <h2 className="mt-1 text-2xl font-black">{report.issue_title}</h2>
            </div>
            <Badge className={statusBadgeClass[report.status]}>{copy.statusLabels[report.status]}</Badge>
          </div>

          <dl className="mt-4 space-y-3">
            {report.property_name ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <dt className="font-semibold text-muted-foreground">{dictionary.cleaning.manualBuildingLabel}</dt>
                <dd className="font-black">{localizePropertyName(report.property_name, dictionary.cleaning.buildingLabels)}</dd>
              </div>
            ) : null}
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.room}</dt>
              <dd className="font-black">{report.room_label}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.reporter}</dt>
              <dd className="font-semibold">{report.reporter_name}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.reportedAt}</dt>
              <dd className="font-semibold">{formatDateTime(report.created_at, locale)}</dd>
            </div>
            {report.cleaning_session_id ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <dt className="font-semibold text-muted-foreground">
                  {copy.fromCleaningTag}
                </dt>
                <dd className="truncate font-mono text-xs text-muted-foreground">
                  {report.cleaning_session_id}
                </dd>
              </div>
            ) : null}
          </dl>

          {report.description ? (
            <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold text-muted-foreground">{copy.description}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{report.description}</p>
            </div>
          ) : null}

          <AnnouncementImageGrid imageUrls={report.image_urls} />
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-black">{copy.changeStatus}</h3>
          <form action={updateMaintenanceStatus} className="mt-4 flex items-center gap-3">
            <input name="reportId" type="hidden" value={report.id} />
            <select
              className="h-10 flex-1 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              defaultValue={report.status}
              name="status"
            >
              {maintenanceStatuses.map((s) => (
                <option key={s} value={s}>
                  {copy.statusLabels[s]}
                </option>
              ))}
            </select>
            <Button className="h-10 rounded-xl font-black" type="submit">
              {copy.changeStatus}
            </Button>
          </form>
        </Card>
      </div>
    </AdminShell>
  );
}
