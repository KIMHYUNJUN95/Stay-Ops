import { notFound, redirect } from "next/navigation";
import { Info, Lock, Package } from "lucide-react";
import { AnnouncementImageGrid } from "@/components/announcements/announcement-image-grid";
import { LostFoundHandlingForm } from "@/components/requests/lost-found-handling-form";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDictionary, type Locale } from "@/lib/i18n";
import {
  getLostItemById,
  isLostItemTerminal,
  lostItemLinearStatuses,
  type LostItemStatus,
} from "@/lib/lost-found";
import { getOnboardingState } from "@/lib/onboarding";
import { resolveRequestLocation } from "@/lib/request-location";
import { getActiveRoomCatalogServer } from "@/lib/rooms";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { cn } from "@/lib/utils";

const statusBadgeClass: Record<LostItemStatus, string> = {
  registered: "border-blue-200 bg-blue-50 text-blue-700",
  stored: "border-amber-200 bg-amber-50 text-amber-700",
  disposal_scheduled: "border-orange-200 bg-orange-50 text-orange-700",
  disposed: "border-border bg-muted/50 text-muted-foreground",
  returned: "border-[#c5cdf0] bg-[#eef1fb] text-[#3949ab]",
};
const DETAIL_CARD =
  "rounded-[24px] border border-slate-200/80 bg-surface shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)]";

type ListFilterQuery = {
  building?: string;
  created?: string;
  date?: string;
  endDate?: string;
  scope?: string;
  startDate?: string;
  status?: string;
  type?: string;
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
    redirect(`/auth/login?next=${encodeURIComponent(`/mobile/requests/lost-found/${id}`)}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }

  if (!hasOrganizationContext(session)) {
    redirect("/mobile/unavailable");
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
    item.property_name,
  );
  const isTerminal = isLostItemTerminal(item.status);
  // 상태 변경 = part_time_staff 제외 전원. 서버 액션과 RLS가 최종 게이트, 여기서는 UI만 감춘다.
  const canHandle = session.user.role !== "part_time_staff";
  // 읽기 전용 진행바는 폐기 경로(4단계)만 표시한다. 반환완료는 이 선형 흐름 밖의 종결이다.
  const linearStatusIdx = lostItemLinearStatuses.indexOf(item.status);
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
              <dd className="text-right font-black">{item.reporter_name || "-"}</dd>
            </div>
          </dl>

          {item.reservation_id || item.guest_name ? (
            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/82 p-3.5 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
              <p className="text-xs font-semibold text-muted-foreground">
                {dictionary.tasks.contextLinkedSection}
              </p>
              <dl className="mt-2 space-y-2 text-sm">
                {item.guest_name ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="font-semibold text-muted-foreground">
                      {dictionary.admin.calendar.guestName}
                    </dt>
                    <dd className="text-right font-black">{item.guest_name}</dd>
                  </div>
                ) : null}
                {item.reservation_id ? (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="font-semibold text-muted-foreground">
                      {dictionary.mobile.calendarReservationId}
                    </dt>
                    <dd className="font-mono text-[11px] font-semibold">{item.reservation_id}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {item.memo ? (
            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/82 p-3.5 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)]">
              <p className="text-xs font-semibold text-muted-foreground">{copy.memo}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.memo}</p>
            </div>
          ) : null}

          <AnnouncementImageGrid imageUrls={item.image_urls} />
        </Card>

        {isTerminal ? (
          <Card className={`${DETAIL_CARD} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                {copy.statusLabel}
              </p>
              <Badge className={statusBadgeClass[item.status]}>
                {copy.statusLabels[item.status]}
              </Badge>
            </div>

            <dl className="mt-4 space-y-2.5 border-t border-slate-200/70 pt-4">
              {item.handled_by_name ? (
                <div className="flex items-start justify-between gap-3 text-sm">
                  <dt className="font-semibold text-muted-foreground">{copy.handling.handledBy}</dt>
                  <dd className="text-right font-black">{item.handled_by_name}</dd>
                </div>
              ) : null}
              {item.handled_at ? (
                <div className="flex items-start justify-between gap-3 text-sm">
                  <dt className="font-semibold text-muted-foreground">{copy.handling.handledAt}</dt>
                  <dd className="font-semibold">{formatDateTime(item.handled_at, locale)}</dd>
                </div>
              ) : null}
            </dl>

            {item.handling_memo ? (
              <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/82 p-3.5">
                <p className="text-xs font-semibold text-muted-foreground">
                  {copy.handling.memoLabel}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{item.handling_memo}</p>
              </div>
            ) : null}

            {item.handling_image_urls.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground">
                  {copy.handling.photosLabel}
                </p>
                <AnnouncementImageGrid imageUrls={item.handling_image_urls} />
              </div>
            ) : null}

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-muted/40 px-3 py-2.5 text-xs font-semibold leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{copy.handling.adminNote}</span>
            </div>
          </Card>
        ) : canHandle ? (
          <LostFoundHandlingForm
            canHandle={canHandle}
            copy={copy}
            handlerName={session.user.name}
            imgCopy={dictionary.requestImages}
            initialMemo={item.handling_memo ?? ""}
            initialStatus={item.status}
            itemId={item.id}
            itemName={item.item_name}
            organizationId={session.organization.id}
          />
        ) : (
          <>
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
                {lostItemLinearStatuses.map((s, i) => (
                  <div
                    key={s}
                    className={cn(
                      "h-2 flex-1 rounded-full",
                      i <= linearStatusIdx ? "bg-primary" : "bg-muted",
                    )}
                  />
                ))}
              </div>
              <div className="mt-2 flex">
                {lostItemLinearStatuses.map((s) => (
                  <p
                    key={s}
                    className={cn(
                      "flex-1 text-center text-[10px] font-semibold leading-tight",
                      s === item.status ? "text-foreground" : "text-muted-foreground/40",
                    )}
                  >
                    {copy.statusLabels[s]}
                  </p>
                ))}
              </div>
            </Card>

            <Card className={`${DETAIL_CARD} p-5`}>
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Lock className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-black text-foreground">{copy.handling.readOnlyTitle}</p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-muted-foreground">
                    {copy.handling.readOnlySub}
                  </p>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </MobileShell>
  );
}
