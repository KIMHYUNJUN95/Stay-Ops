import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { deleteLostItemById, updateLostItemStatus } from "@/app/admin/lost-found/actions";
import { DeleteConfirmButton } from "@/components/requests/delete-confirm-button";
import { AnnouncementImageGrid } from "@/components/announcements/announcement-image-grid";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getLostItemById, lostItemStatuses, type LostItemStatus } from "@/lib/lost-found";
import { requireAdminSession } from "@/lib/admin-session";
import { resolveRequestLocation } from "@/lib/request-location";
import { getActiveRoomCatalogServer } from "@/lib/rooms";

const statusBadgeClass: Record<LostItemStatus, string> = {
  registered: "border-blue-200 bg-blue-50 text-blue-700",
  stored: "border-amber-200 bg-amber-50 text-amber-700",
  disposal_scheduled: "border-orange-200 bg-orange-50 text-orange-700",
  disposed: "border-border bg-muted/50 text-muted-foreground",
  returned: "border-indigo-200 bg-indigo-50 text-indigo-700",
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

export default async function AdminLostFoundDetailPage({
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
  const copy = dictionary.lostFound;
  const common = dictionary.common;

  const [item, roomCatalog] = await Promise.all([
    getLostItemById(session, id),
    getActiveRoomCatalogServer(session.organization.id).catch(() => undefined),
  ]);
  if (!item) {
    notFound();
  }

  const location = resolveRequestLocation(
    item.room_label,
    roomCatalog,
    dictionary.cleaning.buildingLabels,
    item.property_name,
  );

  const errorMessage = query.error ? (copy.errors[query.error] ?? null) : null;

  return (
    <AdminShell activeItem="lost-found" title={copy.detailTitle}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin/lost-found">
            <Button type="button" variant="secondary">
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {copy.backToList}
            </Button>
          </Link>
          <DeleteConfirmButton
            deleteAction={deleteLostItemById.bind(null, item.id)}
            labels={{
              cancel: common.cancel,
              confirmBody: common.deleteRecordBody,
              confirmTitle: common.deleteRecordTitle,
              deleteFailed: common.deleteFailed,
              deletePermanently: common.deletePermanently,
              deleteRecord: common.deleteRecord,
              permissionDeniedMessage: common.permissionDeniedBody,
            }}
            redirectTo="/admin/lost-found"
            title={item.item_name}
          />
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
              {item.cleaning_session_id ? (
                <p className="text-xs font-black uppercase tracking-[0.12em] text-primary">
                  {copy.fromCleaningTag}
                </p>
              ) : null}
              <h2 className="mt-1 text-2xl font-black">{item.item_name}</h2>
            </div>
            <Badge className={statusBadgeClass[item.status]}>{copy.statusLabels[item.status]}</Badge>
          </div>

          <dl className="mt-4 space-y-3">
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">
                {dictionary.cleaning.manualBuildingLabel}
              </dt>
              <dd className="font-black">{location.buildingLabel ?? "-"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.room}</dt>
              <dd className="font-black">{location.roomLabel}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.reporter}</dt>
              <dd className="font-semibold">{item.reporter_name}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.foundAt}</dt>
              <dd className="font-semibold">{formatDateTime(item.found_at, locale)}</dd>
            </div>
            {item.cleaning_session_id ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <dt className="font-semibold text-muted-foreground">
                  {copy.fromCleaningTag}
                </dt>
                <dd className="truncate font-mono text-xs text-muted-foreground">
                  {item.cleaning_session_id}
                </dd>
              </div>
            ) : null}
          </dl>

          {item.reservation_id || item.guest_name ? (
            <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold text-muted-foreground">
                {dictionary.tasks.contextLinkedSection}
              </p>
              <dl className="mt-2 space-y-2 text-sm">
                {item.guest_name ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="font-semibold text-muted-foreground">
                      {dictionary.admin.calendar.guestName}
                    </dt>
                    <dd className="font-black">{item.guest_name}</dd>
                  </div>
                ) : null}
                {item.reservation_id ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="font-semibold text-muted-foreground">
                      {dictionary.mobile.calendarReservationId}
                    </dt>
                    <dd className="font-mono text-xs font-semibold">{item.reservation_id}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {item.memo ? (
            <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
              <p className="text-xs font-semibold text-muted-foreground">{copy.memo}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.memo}</p>
            </div>
          ) : null}

          <AnnouncementImageGrid imageUrls={item.image_urls} />
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-black">{copy.changeStatus}</h3>
          <form action={updateLostItemStatus} className="mt-4 flex items-center gap-3">
            <input name="itemId" type="hidden" value={item.id} />
            <select
              className="h-10 flex-1 rounded-xl border border-border bg-background/70 px-3 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              defaultValue={item.status}
              name="status"
            >
              {lostItemStatuses.map((s) => (
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
