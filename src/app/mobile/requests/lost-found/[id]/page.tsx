import { notFound, redirect } from "next/navigation";
import { Package } from "lucide-react";
import { AnnouncementImageGrid } from "@/components/announcements/announcement-image-grid";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getLostItemById, lostItemStatuses, type LostItemStatus } from "@/lib/lost-found";
import { getOnboardingState } from "@/lib/onboarding";
import { resolveRequestLocation } from "@/lib/request-location";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { cn } from "@/lib/utils";

const statusBadgeClass: Record<LostItemStatus, string> = {
  registered:
    "border-blue-200 bg-blue-50 text-blue-700",
  stored:
    "border-amber-200 bg-amber-50 text-amber-700",
  disposal_scheduled:
    "border-orange-200 bg-orange-50 text-orange-700",
  disposed: "border-border bg-muted/50 text-muted-foreground",
};
const DETAIL_CARD =
  "rounded-[24px] border border-slate-200/80 bg-surface shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)]";

type ListFilterQuery = {
  created?: string;
  scope?: string;
  type?: string;
  status?: string;
  building?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<ListFilterQuery>;
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

export default async function MobileLostItemDetailPage({ params, searchParams }: PageProps) {
  const [state, session, { id }, query] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/mobile/requests/lost-found/${id}`)}`,
    );
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.lostFound;

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
  );
  const currentStatusIdx = lostItemStatuses.indexOf(item.status);
  const showCreatedBanner = query.created === "1";

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="requests" badges={navBadges} title={copy.detailTitle}>
      <div className="space-y-4">
        {showCreatedBanner ? (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
            {copy.createdSuccess}
          </div>
        ) : null}

        <Card className={`${DETAIL_CARD} p-5`}>
          {item.cleaning_session_id ? (
            <p className="mb-2 text-xs font-black uppercase tracking-[0.12em] text-primary">
              {copy.fromCleaningTag}
            </p>
          ) : null}

          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-200/80">
              <Package className="size-5" aria-hidden="true" />
            </div>
            <h2 className="min-w-0 break-words pt-0.5 text-xl font-black leading-tight">
              {item.item_name}
            </h2>
          </div>

          <dl className="mt-4 space-y-2.5 border-t border-slate-200/70 pt-4">
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">
                {dictionary.cleaning.manualBuildingLabel}
              </dt>
              <dd className="text-right font-black">{location.buildingLabel ?? "-"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.room}</dt>
              <dd className="text-right font-black">{location.roomLabel}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.foundAt}</dt>
              <dd className="font-semibold">{formatDateTime(item.found_at, locale)}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.reporter}</dt>
              <dd className="text-right font-black">{item.reporter_name || "—"}</dd>
            </div>
          </dl>

          {item.memo ? (
            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/82 p-3.5 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
              <p className="text-xs font-semibold text-muted-foreground">{copy.memo}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.memo}</p>
            </div>
          ) : null}

          <AnnouncementImageGrid imageUrls={item.image_urls} />
        </Card>

        <Card className={`${DETAIL_CARD} p-5`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
              {copy.statusLabel}
            </p>
            <Badge className={statusBadgeClass[item.status]}>
              {copy.statusLabels[item.status]}
            </Badge>
          </div>
          <div className="mt-4 flex gap-1.5">
            {lostItemStatuses.map((s, i) => (
              <div
                key={s}
                className={cn(
                  "h-2 flex-1 rounded-full",
                  i <= currentStatusIdx ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
          <div className="mt-2 flex">
            {lostItemStatuses.map((s) => (
              <p
                key={s}
                className={cn(
                  "flex-1 text-center text-[10px] font-semibold leading-tight",
                  s === item.status
                    ? "text-foreground"
                    : "text-muted-foreground/40",
                )}
              >
                {copy.statusLabels[s]}
              </p>
            ))}
          </div>
        </Card>
      </div>
    </MobileShell>
  );
}
