import type { Database } from "@/types/database";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export type OrderProcessedNotificationPayload = {
  orderId: string;
  orderTitle: string;
  buildingName: string;
  roomLabel: string;
  status: "ordered";
  deliveryDate: string | null;
  deliveryStartDate: string | null;
  deliveryEndDate: string | null;
  processedByUserId: string | null;
};

export type NotificationPayloadByType = {
  order_processed: OrderProcessedNotificationPayload;
};

export function isOrderProcessedPayload(
  payload: unknown,
): payload is OrderProcessedNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.orderId === "string" && typeof record.orderTitle === "string";
}
