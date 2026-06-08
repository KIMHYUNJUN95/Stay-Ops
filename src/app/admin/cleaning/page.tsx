import { ExportCsvLink } from "@/components/admin/export-csv-link";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatDuration,
  getOrgCleaningSessionsFiltered,
  isCleaningTaskKey,
} from "@/lib/cleaning";
import { cleaningExportStatuses, parseCleaningExportFilters } from "@/lib/export/cleaning-filters";
import { getDictionary, type Locale } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/admin-session";
import { getOrgMemberOptions } from "@/lib/org-members";
import { resolveRequestLocation } from "@/lib/request-location";
import { isExcludedOperationalProperty } from "@/lib/room-label-normalization";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
type AdminCleaningPageProps = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    property?: string;
    staff?: string;
    status?: string;
  }>;
};

// i18n-ignore-start: canonical building-name domain keys (room-label normalization), not UI copy.
const BUILDING_ORDER = [
  "아라키초A",
  "아라키초B",
  "가부키초",
  "다카다노바바",
  "오쿠보A",
  "오쿠보B",
  "오쿠보C",
] as const;
// i18n-ignore-end

function sortBuildings(arr: string[]) {
  return [...arr].sort((a, b) => {
    const ai = BUILDING_ORDER.indexOf(a as (typeof BUILDING_ORDER)[number]);
    const bi = BUILDING_ORDER.indexOf(b as (typeof BUILDING_ORDER)[number]);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b, "ko");
  });
}

function formatTime(value: string | null, locale: Locale) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getTaskLabel(
  taskLabel: string,
  copy: ReturnType<typeof getDictionary>["cleaning"],
) {
  return isCleaningTaskKey(taskLabel) ? copy.taskOptions[taskLabel] : taskLabel;
}

function localizeProperty(
  name: string,
  buildingLabels: ReturnType<typeof getDictionary>["cleaning"]["buildingLabels"],
) {
  // i18n-ignore-start: canonical building-name domain keys (room-label normalization), not UI copy.
  const keyMap: Record<string, keyof typeof buildingLabels> = {
    아라키초A: "arakicho_a",
    아라키초B: "arakicho_b",
    가부키초: "kabukicho",
    다카다노바바: "takadanobaba",
    오쿠보A: "okubo_a",
    오쿠보B: "okubo_b",
    오쿠보C: "okubo_c",
  };
  // i18n-ignore-end
  const key = keyMap[name];
  return key ? (buildingLabels[key] ?? name) : name;
}

export default async function AdminCleaningPage({
  searchParams,
}: AdminCleaningPageProps) {
  const [session, params] = await Promise.all([
    requireAdminSession(),
    searchParams,
  ]);
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.cleaning;
  const filters = parseCleaningExportFilters(params);
  const selectedProperty = filters.propertyName ?? "";
  const [roomCatalog, staffOptions] = await Promise.all([
    getActiveRoomCatalogServer(session.organization.id).catch(() => undefined),
    getOrgMemberOptions(session.organization.id).catch(() => []),
  ]);
  const propertyOptions = sortBuildings(
    [...new Set((roomCatalog ?? []).map((item) => item.propertyName))].filter(
      (name) => !isExcludedOperationalProperty(name),
    ),
  );
  const sessions = await getOrgCleaningSessionsFiltered(session, filters, roomCatalog);
  const completedCount = sessions.filter((item) => item.status === "completed").length;
  const activeCount = sessions.filter((item) => item.status === "in_progress").length;
  const dateLabel =
    filters.startDate === filters.endDate
      ? filters.startDate
      : `${filters.startDate} – ${filters.endDate}`;

  return (
    <AdminShell activeItem="cleaning" title={copy.adminTitle}>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                {dateLabel}
              </p>
              <h2 className="mt-2 text-2xl font-black">{copy.adminTitle}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {copy.adminDescription}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border bg-background/70 px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {copy.activeCleaning}
                </p>
                <p className="mt-1 text-3xl font-black text-primary">{activeCount}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/70 px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  {copy.completedToday}
                </p>
                <p className="mt-1 text-3xl font-black text-primary">
                  {completedCount}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto_auto]"
            method="get"
          >
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {dictionary.common.exportWorkDate}
              <input
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={filters.startDate}
                name="date"
                type="date"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {dictionary.common.dateTo}
              <input
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={
                  filters.endDate !== filters.startDate ? filters.endDate : ""
                }
                name="endDate"
                type="date"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {copy.manualBuildingLabel}
              <select
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={selectedProperty}
                name="property"
              >
                <option value="">{dictionary.common.all}</option>
                {propertyOptions.map((property) => (
                  <option key={property} value={property}>
                    {localizeProperty(property, copy.buildingLabels)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {copy.staff}
              <select
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={filters.staffUserId ?? ""}
                name="staff"
              >
                <option value="">{dictionary.common.all}</option>
                {staffOptions.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {copy.status}
              <select
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={filters.status ?? ""}
                name="status"
              >
                <option value="">{dictionary.common.all}</option>
                {cleaningExportStatuses.map((sessionStatus) => (
                  <option key={sessionStatus} value={sessionStatus}>
                    {copy.statusLabels[sessionStatus]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <Button className="h-10 w-full rounded-xl" type="submit">
                {dictionary.common.apply}
              </Button>
            </div>
            <div className="flex items-end">
              <ExportCsvLink
                label={dictionary.common.exportCsv}
                resource="cleaning"
                searchParams={{
                  date: filters.startDate,
                  endDate:
                    filters.endDate !== filters.startDate ? filters.endDate : undefined,
                  property: selectedProperty || undefined,
                  staff: filters.staffUserId,
                  status: filters.status,
                }}
              />
            </div>
          </form>
        </Card>

        <Card className="overflow-hidden">
          {sessions.length > 0 ? (
            <div className="divide-y divide-border">
              <div className="grid grid-cols-[1.1fr_1.2fr_1fr_1fr_1fr_1fr] gap-3 bg-muted/30 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-muted-foreground">
                <span>{copy.room}</span>
                <span>{copy.task}</span>
                <span>{copy.staff}</span>
                <span>{copy.status}</span>
                <span>{copy.startedAt}</span>
                <span>{copy.duration}</span>
              </div>
              {sessions.map((item) => {
                const location = resolveRequestLocation(
                  item.room_label,
                  roomCatalog,
                  copy.buildingLabels,
                );
                return (
                  <div
                    className="grid grid-cols-[1.1fr_1.2fr_1fr_1fr_1fr_1fr] items-center gap-3 px-4 py-3 text-sm"
                    key={item.id}
                  >
                    <span className="min-w-0 font-black">
                      <span className="block truncate">
                        {location.buildingLabel ? `${location.buildingLabel} · ` : ""}
                        {location.roomLabel}
                      </span>
                    </span>
                    <span className="font-semibold">
                      {getTaskLabel(item.task_label, copy)}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {item.staff_name}
                    </span>
                    <span>
                      <Badge>{copy.statusLabels[item.status]}</Badge>
                    </span>
                    <span className="text-muted-foreground">
                      {formatTime(item.started_at, locale)}
                    </span>
                    <span className="font-semibold">
                      {formatDuration(item.duration_seconds)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-sm font-semibold text-muted-foreground">
              {copy.noSessions}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
