import Link from "next/link";
import { Package } from "lucide-react";
import { ExportCsvLink } from "@/components/admin/export-csv-link";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getOrgLostItems, lostItemStatuses, type LostItemStatus } from "@/lib/lost-found";
import { requireAdminSession } from "@/lib/admin-session";
import { parseRequestDateRange } from "@/lib/request-filters";
import { resolveRequestLocation } from "@/lib/request-location";
import { getActiveRoomCatalogServer } from "@/lib/rooms";

type PageProps = {
  searchParams: Promise<{
    endDate?: string;
    error?: string;
    startDate?: string;
    status?: string;
  }>;
};

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const statusBadgeClass: Record<LostItemStatus, string> = {
  registered: "border-blue-200 bg-blue-50 text-blue-700",
  stored: "border-amber-200 bg-amber-50 text-amber-700",
  disposal_scheduled: "border-orange-200 bg-orange-50 text-orange-700",
  disposed: "border-border bg-muted/50 text-muted-foreground",
};

function parseStatus(value: string | undefined): LostItemStatus | undefined {
  return lostItemStatuses.includes(value as LostItemStatus)
    ? (value as LostItemStatus)
    : undefined;
}

export default async function AdminLostFoundPage({ searchParams }: PageProps) {
  const [session, params] = await Promise.all([
    requireAdminSession(),
    searchParams,
  ]);
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.lostFound;
  const dateRange = parseRequestDateRange(params);
  const status = parseStatus(params.status);
  const [items, roomCatalog] = await Promise.all([
    getOrgLostItems(session, { ...dateRange, status }),
    getActiveRoomCatalogServer(session.organization.id).catch(() => undefined),
  ]);
  const errorMessage = params.error ? (copy.errors[params.error] ?? null) : null;

  return (
    <AdminShell activeItem="lost-found" title={copy.adminTitle}>
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Package className="size-6" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                  {session.organization.name}
                </p>
                <h2 className="mt-1 text-2xl font-black">{copy.adminTitle}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {copy.adminDescription}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-right">
              <p className="text-xs font-semibold text-muted-foreground">{copy.mobileListTitle}</p>
              <p className="mt-1 text-3xl font-black text-primary">{items.length}</p>
            </div>
          </div>
        </Card>

        {errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <Card className="p-4">
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]" method="get">
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {dictionary.common.dateFrom}
              <input
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={dateRange.startDate ?? ""}
                name="startDate"
                type="date"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {dictionary.common.dateTo}
              <input
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={dateRange.endDate ?? ""}
                name="endDate"
                type="date"
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-muted-foreground">
              {dictionary.common.status}
              <select
                className="h-10 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                defaultValue={status ?? ""}
                name="status"
              >
                <option value="">{dictionary.common.all}</option>
                {lostItemStatuses.map((itemStatus) => (
                  <option key={itemStatus} value={itemStatus}>
                    {copy.statusLabels[itemStatus]}
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
              <Link href="/admin/lost-found">
                <Button className="h-10 w-full rounded-xl" type="button" variant="secondary">
                  {dictionary.common.clear}
                </Button>
              </Link>
            </div>
            <div className="flex items-end">
              <ExportCsvLink
                label={dictionary.common.exportCsv}
                resource="lost-found"
                searchParams={{
                  endDate: dateRange.endDate,
                  startDate: dateRange.startDate,
                  status: status ?? undefined,
                }}
              />
            </div>
          </form>
        </Card>

        <Card className="overflow-hidden">
          {items.length > 0 ? (
            <div className="divide-y divide-border">
              <div className="grid grid-cols-[1.5fr_1.6fr_1fr_1fr_1.2fr] gap-3 bg-muted/30 px-4 py-3 text-xs font-black uppercase tracking-[0.08em] text-muted-foreground">
                <span>{dictionary.cleaning.manualBuildingLabel} / {copy.room}</span>
                <span>{copy.itemName}</span>
                <span>{copy.statusLabel}</span>
                <span>{copy.reporter}</span>
                <span>{copy.foundAt}</span>
              </div>
              {items.map((item) => {
                const location = resolveRequestLocation(
                  item.room_label,
                  roomCatalog,
                  dictionary.cleaning.buildingLabels,
                );
                return (
                <Link
                  className="grid grid-cols-[1.5fr_1.6fr_1fr_1fr_1.2fr] items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/20"
                  href={`/admin/lost-found/${item.id}`}
                  key={item.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-black">
                      {location.buildingLabel ?? "-"}
                    </span>
                    <span className="block truncate text-xs font-semibold text-muted-foreground">
                      {copy.room}: {location.roomLabel}
                    </span>
                  </span>
                  <span className="truncate font-semibold">
                    {item.item_name}
                    {item.cleaning_session_id ? (
                      <span className="ml-2 inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-primary">
                        {copy.fromCleaningTag}
                      </span>
                    ) : null}
                  </span>
                  <span>
                    <Badge className={statusBadgeClass[item.status]}>
                      {copy.statusLabels[item.status]}
                    </Badge>
                  </span>
                  <span className="truncate text-muted-foreground">{item.reporter_name}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(item.found_at, locale)}
                  </span>
                </Link>
              );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-sm font-semibold text-muted-foreground">
              {copy.noRecords}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
