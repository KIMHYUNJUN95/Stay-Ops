import type { Locale } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";
import {
  isOrderProcessedPayload,
  type NotificationRow,
  type NotificationType,
} from "@/lib/notifications/types";

export type NotificationDisplay = {
  title: string;
  body: string;
  statusLabel: string;
  kindLabel: string;
  locationLabel: string;
};

function formatDeliverySummary(
  payload: {
    deliveryDate: string | null;
    deliveryStartDate: string | null;
    deliveryEndDate: string | null;
  },
  locale: Locale,
  copy: ReturnType<typeof getDictionary>["mobile"]["notifications"],
) {
  if (payload.deliveryStartDate && payload.deliveryEndDate) {
    const start = formatDateOnly(payload.deliveryStartDate, locale);
    const end = formatDateOnly(payload.deliveryEndDate, locale);
    return copy.deliveryRange.replace("{start}", start).replace("{end}", end);
  }
  if (payload.deliveryDate) {
    return copy.deliveryExact.replace(
      "{date}",
      formatDateOnly(payload.deliveryDate, locale),
    );
  }
  return null;
}

function formatDateOnly(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${value}T00:00:00+09:00`));
}

export function formatNotificationTimestamp(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(new Date(value));
}

export function getNotificationDisplay(
  notification: Pick<NotificationRow, "type" | "payload">,
  locale: Locale,
): NotificationDisplay {
  const dictionary = getDictionary(locale);
  const copy = dictionary.mobile.notifications;
  const statusLabels = dictionary.mobile.orderStatusLabels;

  if (notification.type === "order_processed" && isOrderProcessedPayload(notification.payload)) {
    const payload = notification.payload;
    const location =
      payload.roomLabel && payload.roomLabel !== "-"
        ? `${payload.buildingName} · ${payload.roomLabel}`
        : payload.buildingName;
    const delivery = formatDeliverySummary(payload, locale, copy);
    const body = delivery
      ? copy.orderProcessedBodyWithDelivery
          .replace("{title}", payload.orderTitle)
          .replace("{delivery}", delivery)
      : copy.orderProcessedBody.replace("{title}", payload.orderTitle);

    return {
      title: copy.orderProcessedTitle,
      body,
      statusLabel: statusLabels.ordered,
      kindLabel: copy.kindOrder,
      locationLabel: location,
    };
  }

  return {
    title: copy.fallbackTitle,
    body: copy.fallbackBody,
    statusLabel: copy.fallbackStatus,
    kindLabel: copy.fallbackKind,
    locationLabel: "",
  };
}

export function notificationTypeLabel(type: NotificationType, locale: Locale) {
  const copy = getDictionary(locale).mobile.notifications;
  switch (type) {
    case "order_processed":
      return copy.kindOrder;
    default:
      return copy.fallbackKind;
  }
}
