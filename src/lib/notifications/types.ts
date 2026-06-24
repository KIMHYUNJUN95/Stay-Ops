import type { Database } from "@/types/database";
import type { OrganizationRole } from "@/config/roles";

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

export type AnnouncementNotificationPayload = {
  announcementId: string;
  announcementTitle: string;
  actorUserId: string | null;
  event: "important_published";
};

export type AttendanceNotificationPayload = {
  // One discriminated `attendance_activity` type carries every event (no enum value per event).
  // `open_session_reminder` is worker-facing (the 18:30 reminder); the others are admin/user alerts.
  event:
    | "correction_created"
    | "correction_approved"
    | "correction_rejected"
    | "abnormal_session"
    | "open_session_reminder";
  /** The worker the alert is about (admin alerts); the recipient themselves for the reminder. */
  subjectUserId?: string | null;
  subjectName?: string | null;
  sessionId?: string | null;
  correctionId?: string | null;
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
  announcement_activity: AnnouncementNotificationPayload;
  attendance_activity: AttendanceNotificationPayload;
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

export function isAnnouncementNotificationPayload(
  payload: unknown,
): payload is AnnouncementNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return (
    typeof record.announcementId === "string" &&
    typeof record.announcementTitle === "string" &&
    record.event === "important_published"
  );
}

export function isAttendanceNotificationPayload(
  payload: unknown,
): payload is AttendanceNotificationPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return (
    record.event === "correction_created" ||
    record.event === "correction_approved" ||
    record.event === "correction_rejected" ||
    record.event === "abnormal_session" ||
    record.event === "open_session_reminder"
  );
}
