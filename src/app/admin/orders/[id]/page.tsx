import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  MapPin,
  MessageSquareText,
  Package,
  ShoppingCart,
  User,
} from "lucide-react";
import { OrderActionBar } from "@/components/requests/order-action-bar";
import { AdminShell } from "@/components/shell/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDictionary, type Locale } from "@/lib/i18n";
import { requireAdminSession } from "@/lib/admin-session";
import { getOrderRequestById, parseOrderItems, type OrderRequestStatus } from "@/lib/order-requests";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

const TIMELINE_STATUSES = ["requested", "approved", "ordered"] as const;

const statusBadgeClass: Record<OrderRequestStatus, string> = {
  requested:
    "border-blue-200 bg-blue-50 text-blue-700",
  approved:
    "border-indigo-200 bg-indigo-50 text-indigo-700",
  ordered:
    "border-amber-200 bg-amber-50 text-amber-700",
  received:
    "border-green-200 bg-green-50 text-green-700",
  closed: "border-border bg-muted/50 text-muted-foreground",
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

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

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

function formatDeliveryWindow(
  startDate: string | null,
  endDate: string | null,
  exactDate: string | null,
  locale: Locale,
): string {
  if (startDate && endDate) {
    return `${formatDeliveryDate(startDate, locale)} – ${formatDeliveryDate(endDate, locale)}`;
  }
  if (exactDate) return formatDeliveryDate(exactDate, locale);
  return "-";
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export default async function AdminOrderDetailPage({ params }: PageProps) {
  const [session, { id }] = await Promise.all([requireAdminSession(), params]);
  const locale = session.user.preferredLanguage;
  const dictionary = getDictionary(locale);
  const copy = dictionary.admin.orders;
  const mobileCopy = dictionary.mobile.orderDetail;
  const statusLabels = dictionary.mobile.orderStatusLabels;

  const order = await getOrderRequestById(session, id);
  if (!order) notFound();

  const items = parseOrderItems(order.items);
  const hasDelivery =
    Boolean(order.delivery_date) ||
    Boolean(order.delivery_start_date && order.delivery_end_date);

  const isClosed = order.status === "closed";
  const progressStatus: (typeof TIMELINE_STATUSES)[number] | null = isClosed
    ? null
    : order.status === "requested"
      ? "requested"
      : order.status === "approved"
        ? "approved"
        : "ordered";
  const currentIdx =
    progressStatus !== null ? TIMELINE_STATUSES.indexOf(progressStatus) : -1;

  return (
    <AdminShell activeItem="orders" title={copy.detailTitle}>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/orders">
            <Button type="button" variant="secondary">
              <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
              {copy.backToList}
            </Button>
          </Link>
        </div>

        {/* ── Header ── */}
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-black">{order.title}</h2>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{order.id}</p>
            </div>
            <Badge className={statusBadgeClass[order.status]}>
              {statusLabels[order.status]}
            </Badge>
          </div>

          <dl className="mt-4 space-y-3">
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">
                <MapPin className="mr-1 inline size-3.5" aria-hidden="true" />
                {dictionary.cleaning.manualBuildingLabel}
              </dt>
              <dd className="font-black text-right">{order.building_name}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.room}</dt>
              <dd className="font-black">{order.room_label}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">
                <User className="mr-1 inline size-3.5" aria-hidden="true" />
                {copy.reporter}
              </dt>
              <dd className="font-semibold">{order.reporter_name || "-"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3 text-sm">
              <dt className="font-semibold text-muted-foreground">{copy.createdAt}</dt>
              <dd className="font-semibold">{formatDateTime(order.created_at, locale)}</dd>
            </div>
            {hasDelivery ? (
              <div className="flex items-start justify-between gap-3 text-sm">
                <dt className="font-semibold text-muted-foreground">
                  <CalendarDays className="mr-1 inline size-3.5" aria-hidden="true" />
                  {mobileCopy.deliveryDateLabel}
                </dt>
                <dd className="font-black">
                  {formatDeliveryWindow(
                    order.delivery_start_date,
                    order.delivery_end_date,
                    order.delivery_date,
                    locale,
                  )}
                </dd>
              </div>
            ) : null}
          </dl>

          {order.reason || order.description ? (
            <div className="mt-4 rounded-2xl border border-border bg-background/70 p-4">
              <div className="mb-1.5 flex items-center gap-1.5">
                <MessageSquareText className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs font-semibold text-muted-foreground">{mobileCopy.memoTitle}</p>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">
                {order.reason || order.description}
              </p>
            </div>
          ) : null}
        </Card>

        {/* ── Requested Items ── */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-5">
            <Package className="size-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-black uppercase tracking-wide">{mobileCopy.itemsTitle}</h3>
          </div>
          <div className="mt-3 divide-y divide-border/60">
            {items.length === 0 ? (
              <p className="px-5 pb-5 text-sm text-muted-foreground">-</p>
            ) : (
              items.map((item) => (
                <div className="px-5 py-3" key={item.id || `${item.name}-${item.quantity}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ShoppingCart className="size-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{item.name}</p>
                      {item.memo ? (
                        <p className="truncate text-xs text-muted-foreground">{item.memo}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-lg font-black leading-none">{item.quantity}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        EA
                      </p>
                    </div>
                  </div>
                  {isValidAbsoluteUrl(item.link) ? (
                    <a
                      className="mt-2 flex min-h-9 items-center gap-1.5 rounded-lg border border-border/60 bg-background/50 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-muted/50"
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

        {/* ── Status Timeline ── */}
        <Card className="p-5">
          <h3 className="text-sm font-black uppercase tracking-wide">{mobileCopy.timelineTitle}</h3>
          <div className="mt-3 flex gap-1.5">
            {TIMELINE_STATUSES.map((s, i) => (
              <div
                className={cn(
                  "h-2 flex-1 rounded-full",
                  i <= currentIdx ? "bg-primary" : "bg-muted",
                )}
                key={s}
              />
            ))}
          </div>
          <div className="mt-2 flex">
            {TIMELINE_STATUSES.map((s) => (
              <p
                className={cn(
                  "flex-1 text-center text-[10px] font-bold leading-tight",
                  progressStatus !== null && s === progressStatus
                    ? "text-foreground"
                    : "text-muted-foreground/40",
                )}
                key={s}
              >
                {statusLabels[s]}
              </p>
            ))}
          </div>
        </Card>

        {/* ── Action Bar ── */}
        <OrderActionBar
          labels={{
            actionApprove: mobileCopy.actionApprove,
            actionMarkOrdered: mobileCopy.actionMarkOrdered,
            actionReject: mobileCopy.actionReject,
            successApprove: mobileCopy.successApprove,
            successOrdered: mobileCopy.successOrdered,
            successReject: mobileCopy.successReject,
            successBody: mobileCopy.successBody,
            done: mobileCopy.done,
            errorInvalidTransition: mobileCopy.errorInvalidTransition,
            errorSaveFailed: mobileCopy.errorSaveFailed,
            deliveryDateLabel: mobileCopy.deliveryDateLabel,
            deliveryDatePlaceholder: mobileCopy.deliveryDatePlaceholder,
            deliveryDateRequired: mobileCopy.deliveryDateRequired,
            deliveryDateInvalid: mobileCopy.deliveryDateInvalid,
            deliveryRangeRequired: mobileCopy.deliveryRangeRequired,
            deliveryRangeInvalid: mobileCopy.deliveryRangeInvalid,
            deliveryModeExact: mobileCopy.deliveryModeExact,
            deliveryModeRange: mobileCopy.deliveryModeRange,
            deliveryStartDateLabel: mobileCopy.deliveryStartDateLabel,
            deliveryEndDateLabel: mobileCopy.deliveryEndDateLabel,
            actionProcessOrderWithDateTitle: mobileCopy.actionProcessOrderWithDateTitle,
            actionProcessOrderWithDateBody: mobileCopy.actionProcessOrderWithDateBody,
            hintStatusRequested: mobileCopy.hintStatusRequested,
            hintStatusApproved: mobileCopy.hintStatusApproved,
            hintStatusOrdered: mobileCopy.hintStatusOrdered,
            hintStatusClosed: mobileCopy.hintStatusClosed,
          }}
          locale={locale}
          orderId={order.id}
          status={order.status}
        />
      </div>
    </AdminShell>
  );
}
