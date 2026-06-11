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

export type TaskNotificationPayload = {
  taskId: string;
  taskTitle: string;
  actorUserId: string | null;
  // `due_soon`/`overdue` are system reminders (no actor); the rest are activity events.
  event: "shared" | "edited" | "note" | "completed" | "reopened" | "due_soon" | "overdue";
};

export type NotificationPayloadByType = {
  order_processed: OrderProcessedNotificationPayload;
  task_shared: TaskNotificationPayload;
  task_updated: TaskNotificationPayload;
  task_completed: TaskNotificationPayload;
  task_due_soon: TaskNotificationPayload;
  task_overdue: TaskNotificationPayload;
};

export function isTaskNotificationPayload(
  payload: unknown,
): payload is TaskNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.taskId === "string" && typeof record.taskTitle === "string";
}

export function isOrderProcessedPayload(
  payload: unknown,
): payload is OrderProcessedNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.orderId === "string" && typeof record.orderTitle === "string";
}
