import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  ExternalLink,
  MapPin,
  MessageSquareText,
  Package,
  ShoppingCart,
  User,
} from "lucide-react";
import { OrderActionBar } from "@/components/requests/order-action-bar";
import { MobileShell } from "@/components/shell/mobile-shell";
import { getMobileNavBadges } from "@/lib/nav-badges";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getDictionary, type Locale } from "@/lib/i18n";
import { getOrderRequestById, type OrderRequestItem } from "@/lib/order-requests";
import { getOnboardingState } from "@/lib/onboarding";
import { getCurrentAppSession, hasOrganizationContext } from "@/lib/session";
import { cn } from "@/lib/utils";

type ListFilterQuery = {
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

const LIST_FILTER_KEYS = [
  "scope", "type", "status", "building", "date", "startDate", "endDate",
] as const;

// "received" is not shown as an active step in MVP; map it to "ordered" for progress display.
const TIMELINE_STATUSES = ["requested", "approved", "ordered"] as const;

const statusBadgeClass = {
  requested:
    "border-blue-200 bg-blue-50 text-blue-700",
  approved:
    "border-indigo-200 bg-indigo-50 text-indigo-700",
  ordered:
    "border-amber-200 bg-amber-50 text-amber-700",
  received:
    "border-green-200 bg-green-50 text-green-700",
  closed: "border-border bg-muted/50 text-muted-foreground",
} as const;
const DETAIL_CARD =
  "rounded-[24px] border border-slate-200/80 bg-[linear-gradient(145deg,#ffffff_0%,#fbfcff_100%)] shadow-[0_16px_34px_-28px_rgba(31,58,95,0.48)]";

function buildBackToListHref(query: ListFilterQuery): string {
  const params = new URLSearchParams();
  for (const key of LIST_FILTER_KEYS) {
    const val = query[key];
    if (val) params.set(key, val);
  }
  const qs = params.toString();
  return qs ? `/mobile/requests?${qs}` : "/mobile/requests";
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// delivery_date is date-only (YYYY-MM-DD). 03:00 UTC = noon JST keeps the
// calendar day stable regardless of server/client timezone.
function formatDeliveryDate(value: string, locale: Locale): string {
  if (!isValidDateOnly(value)) return "-";
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(Date.UTC(y, m - 1, d, 3, 0, 0)));
}

function formatDeliveryDateWindow(
  startDate: string | null,
  endDate: string | null,
  exactDate: string | null,
  locale: Locale,
): string {
  if (startDate && endDate) {
    return `${formatDeliveryDate(startDate, locale)} - ${formatDeliveryDate(endDate, locale)}`;
  }
  if (exactDate) {
    return formatDeliveryDate(exactDate, locale);
  }
  return "-";
}

// Only render clickable anchors for valid absolute http/https URLs.
function isValidAbsoluteUrl(value: string): boolean {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseItems(raw: unknown): OrderRequestItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = String(record.name ?? "").trim();
    const quantity = String(record.quantity ?? "").trim();
    if (!name) return [];
    const rawImageUrls = record.imageUrls;
    const imageUrls =
      Array.isArray(rawImageUrls)
        ? rawImageUrls.filter((u): u is string => typeof u === "string" && u.length > 0)
        : undefined;
    return [{
      id: String(record.id ?? ""),
      imageUrls: imageUrls && imageUrls.length > 0 ? imageUrls : undefined,
      link: String(record.link ?? "").trim(),
      memo: String(record.memo ?? "").trim(),
      name,
      quantity: quantity || "1",
    }];
  });
}

export default async function MobileOrderRequestDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [state, session, { id }, query] = await Promise.all([
    getOnboardingState(),
    getCurrentAppSession(),
    params,
    searchParams,
  ]);

  if (state.status === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(`/mobile/requests/orders/${id}`)}`);
  }
  if (state.status !== "ready" || !session) {
    redirect("/onboarding");
  }
  if (!hasOrganizationContext(session)) {
    redirect("/admin");
  }

  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.mobile.orderDetail;
  const statusLabels = dictionary.mobile.orderStatusLabels;
  const backHref = buildBackToListHref(query);

  const order = await getOrderRequestById(session, id);
  if (!order) {
    redirect(backHref);
  }

  const items = parseItems(order.items);
  const isClosed = order.status === "closed";
  // closed: neutral timeline (all muted) ??the badge already communicates the terminal state.
  // received: maps to ordered (MVP hides the received step).
  const progressStatus: (typeof TIMELINE_STATUSES)[number] | null = isClosed
    ? null
    : order.status === "requested"
      ? "requested"
      : order.status === "approved"
        ? "approved"
        : "ordered"; // ordered / received ??show full active progress
  // -1 when closed so every i <= currentIdx check is false ??all bars muted.
  const currentIdx = progressStatus !== null ? TIMELINE_STATUSES.indexOf(progressStatus) : -1;

  const navBadges = await getMobileNavBadges();

  return (
    <MobileShell activeItem="requests" badges={navBadges} title={copy.title}>
      <div className="space-y-4 pb-2">
        <Link
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/82 px-3 py-1.5 text-xs font-black text-slate-500 shadow-[0_10px_20px_-18px_rgba(31,58,95,0.4)] transition-colors hover:text-slate-900"
          href={backHref}
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          {copy.backToList}
        </Link>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge className={statusBadgeClass[order.status]}>
              {statusLabels[order.status]}
            </Badge>
            <span className="font-mono text-xs font-semibold text-muted-foreground">{order.id}</span>
          </div>
          <h1 className="text-2xl font-black leading-tight tracking-tight text-foreground">{order.title}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="size-3.5" aria-hidden="true" />
            {`${copy.submittedAt} ${String.fromCharCode(183)} ${formatDateTime(order.created_at, locale)}`}
          </p>
        </div>

        <Card className={`${DETAIL_CARD} overflow-hidden`}>
          <div className="flex items-center gap-2 px-4 pt-4">
            <Package className="size-4 text-[#315F91]" aria-hidden="true" />
            <h2 className="text-sm font-black uppercase tracking-wide text-foreground">{copy.itemsTitle}</h2>
          </div>
          <div className="mt-3 divide-y divide-border/60">
            {items.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">-</p>
            ) : (
              items.map((item) => (
                <div className="px-4 py-3" key={item.id || `${item.name}-${item.quantity}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF1F8] text-[#315F91]">
                      <ShoppingCart className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.memo || "-"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-black leading-none text-foreground">{item.quantity}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">EA</p>
                    </div>
                  </div>
                  {isValidAbsoluteUrl(item.link) ? (
                    <a
                      aria-label={copy.itemLinkLabel}
                      className="mt-2 flex min-h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-3 py-1.5 text-xs font-semibold text-[#315F91] transition-colors hover:bg-muted/50"
                      href={item.link}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.link}</span>
                    </a>
                  ) : null}
                  {item.imageUrls && item.imageUrls.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.imageUrls.map((url, idx) => (
                        <a
                          href={url}
                          key={`${item.id}-img-${idx}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <div className="relative size-16 overflow-hidden rounded-xl border border-border/60 bg-muted">
                            <Image
                              alt=""
                              className="object-cover"
                              fill
                              sizes="64px"
                              src={url}
                            />
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className={`${DETAIL_CARD} divide-y divide-slate-200/70`}>
          <div className="flex items-start gap-3 p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#EAF1F8] text-[#315F91]">
              <MapPin className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{copy.locationTitle}</p>
              <p className="mt-0.5 font-bold text-foreground">{order.building_name}</p>
              <p className="text-sm text-muted-foreground">{order.room_label}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1F3A5F] text-sm font-black text-white">
              <User className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{copy.requesterTitle}</p>
              <p className="mt-0.5 font-bold text-foreground">{order.reporter_name || "-"}</p>
            </div>
          </div>
        </Card>

        {order.delivery_date || (order.delivery_start_date && order.delivery_end_date) ? (
          <Card className={`${DETAIL_CARD} p-4`}>
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#EAF1F8] text-[#315F91]">
                <CalendarDays className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{copy.deliveryDateLabel}</p>
                <p className="mt-0.5 font-bold text-foreground">
                  {formatDeliveryDateWindow(
                    order.delivery_start_date,
                    order.delivery_end_date,
                    order.delivery_date,
                    locale,
                  )}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {order.reason || order.description ? (
          <Card className={`${DETAIL_CARD} p-4`}>
            <div className="mb-2 flex items-center gap-2">
              <MessageSquareText className="size-4 text-[#315F91]" aria-hidden="true" />
              <h2 className="text-sm font-black uppercase tracking-wide text-foreground">{copy.memoTitle}</h2>
            </div>
            <p className="rounded-xl border border-border bg-background/60 p-3.5 text-sm leading-6 text-foreground/90">
              {order.reason || order.description}
            </p>
          </Card>
        ) : null}

        <Card className={`${DETAIL_CARD} p-4`}>
          <div className="mb-4 flex items-center gap-2">
            <ShoppingCart className="size-4 text-[#315F91]" aria-hidden="true" />
            <h2 className="text-sm font-black uppercase tracking-wide text-foreground">{copy.timelineTitle}</h2>
          </div>
          <div className="flex gap-1.5">
            {TIMELINE_STATUSES.map((s, i) => (
              <div
                className={cn("h-2 flex-1 rounded-full", i <= currentIdx ? "bg-[#315F91]" : "bg-muted")}
                key={s}
              />
            ))}
          </div>
          <div className="mt-2 flex">
            {TIMELINE_STATUSES.map((s) => (
              <p
                className={cn(
                  "flex-1 text-center text-[10px] font-bold leading-tight",
                  progressStatus !== null && s === progressStatus ? "text-[#1F3A5F]" : "text-muted-foreground/40",
                )}
                key={s}
              >
                {statusLabels[s]}
              </p>
            ))}
          </div>
        </Card>

        <OrderActionBar
          labels={{
            actionApprove: copy.actionApprove,
            actionMarkOrdered: copy.actionMarkOrdered,
            actionReject: copy.actionReject,
            successApprove: copy.successApprove,
            successOrdered: copy.successOrdered,
            successReject: copy.successReject,
            successBody: copy.successBody,
            done: copy.done,
            errorInvalidTransition: copy.errorInvalidTransition,
            errorSaveFailed: copy.errorSaveFailed,
            deliveryDateLabel: copy.deliveryDateLabel,
            deliveryDatePlaceholder: copy.deliveryDatePlaceholder,
            deliveryDateRequired: copy.deliveryDateRequired,
            deliveryDateInvalid: copy.deliveryDateInvalid,
            deliveryRangeRequired: copy.deliveryRangeRequired,
            deliveryRangeInvalid: copy.deliveryRangeInvalid,
            deliveryModeExact: copy.deliveryModeExact,
            deliveryModeRange: copy.deliveryModeRange,
            deliveryStartDateLabel: copy.deliveryStartDateLabel,
            deliveryEndDateLabel: copy.deliveryEndDateLabel,
            actionProcessOrderWithDateTitle: copy.actionProcessOrderWithDateTitle,
            actionProcessOrderWithDateBody: copy.actionProcessOrderWithDateBody,
            hintStatusRequested: copy.hintStatusRequested,
            hintStatusApproved: copy.hintStatusApproved,
            hintStatusOrdered: copy.hintStatusOrdered,
            hintStatusClosed: copy.hintStatusClosed,
          }}
          locale={locale}
          orderId={order.id}
          status={order.status}
        />
      </div>
    </MobileShell>
  );
}
