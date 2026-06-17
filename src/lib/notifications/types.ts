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
  // Distinguishes the original "order processed" fan-out from a later delivery-date edit. Both reuse
  // the `order_processed` notification type (no enum migration); the display branches on this.
  kind?: "processed" | "delivery_updated";
};

export type TaskNotificationPayload = {
  taskId: string;
  taskTitle: string;
  actorUserId: string | null;
  // `due_soon`/`overdue` are system reminders (no actor); the rest are activity events.
  event: "shared" | "edited" | "note" | "completed" | "reopened" | "due_soon" | "overdue";
};

export type ProjectNotificationPayload = {
  projectId: string;
  projectTitle: string;
  actorUserId: string | null;
  event: "shared";
};

export type SuggestionNotificationPayload = {
  suggestionId: string;
  suggestionTitle: string;
  actorUserId: string | null;
  // One discriminated `suggestion_activity` type carries every event (no enum value per event).
  event: "created" | "referenced" | "status" | "comment";
  // Present for `status` events so the display can name the new status (e.g. on_hold / completed).
  status?: "submitted" | "reviewing" | "on_hold" | "completed" | null;
};

export type NotificationPayloadByType = {
  order_processed: OrderProcessedNotificationPayload;
  task_shared: TaskNotificationPayload;
  task_updated: TaskNotificationPayload;
  task_completed: TaskNotificationPayload;
  task_due_soon: TaskNotificationPayload;
  task_overdue: TaskNotificationPayload;
  project_shared: ProjectNotificationPayload;
  suggestion_activity: SuggestionNotificationPayload;
};

export function isTaskNotificationPayload(
  payload: unknown,
): payload is TaskNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.taskId === "string" && typeof record.taskTitle === "string";
}

export function isProjectNotificationPayload(
  payload: unknown,
): payload is ProjectNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.projectId === "string" && typeof record.projectTitle === "string";
}

export function isOrderProcessedPayload(
  payload: unknown,
): payload is OrderProcessedNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return typeof record.orderId === "string" && typeof record.orderTitle === "string";
}

export function isSuggestionNotificationPayload(
  payload: unknown,
): payload is SuggestionNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return (
    typeof record.suggestionId === "string" && typeof record.suggestionTitle === "string"
  );
}
