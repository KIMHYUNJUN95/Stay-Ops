import type { SupabaseClient } from "@supabase/supabase-js";
import { isNotificationsTableUnavailable } from "@/lib/notifications/schema";
import type { OrderProcessedNotificationPayload } from "@/lib/notifications/types";
import type { Database } from "@/types/database";

type CreateNotificationInput = {
  organizationId: string;
  recipientUserId: string;
  type: Database["public"]["Enums"]["notification_type"];
  href: string;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
  payload: Database["public"]["Tables"]["notifications"]["Insert"]["payload"];
};

export async function createNotification(
  supabase: SupabaseClient<Database>,
  input: CreateNotificationInput,
): Promise<{ created: boolean; id: string | null }> {
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      organization_id: input.organizationId,
      recipient_user_id: input.recipientUserId,
      type: input.type,
      href: input.href,
      source_type: input.sourceType,
      source_id: input.sourceId,
      dedupe_key: input.dedupeKey,
      payload: input.payload,
    } as never)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { created: false, id: null };
    }
    if (isNotificationsTableUnavailable(error.message)) {
      console.warn("[notifications] create skipped — table not migrated:", error.message);
      return { created: false, id: null };
    }
    console.error("[notifications] create failed", {
      type: input.type,
      dedupeKey: input.dedupeKey,
      error: error.message,
    });
    return { created: false, id: null };
  }

  return { created: true, id: (data as { id: string } | null)?.id ?? null };
}

export async function createOrderProcessedNotification(params: {
  supabase: SupabaseClient<Database>;
  organizationId: string;
  recipientUserId: string;
  processedByUserId: string;
  order: {
    id: string;
    title: string;
    building_name: string;
    room_label: string;
    delivery_date: string | null;
    delivery_start_date: string | null;
    delivery_end_date: string | null;
  };
}) {
  if (params.recipientUserId === params.processedByUserId) {
    return { created: false, id: null };
  }

  const payload: OrderProcessedNotificationPayload = {
    orderId: params.order.id,
    orderTitle: params.order.title,
    buildingName: params.order.building_name,
    roomLabel: params.order.room_label,
    status: "ordered",
    deliveryDate: params.order.delivery_date,
    deliveryStartDate: params.order.delivery_start_date,
    deliveryEndDate: params.order.delivery_end_date,
    processedByUserId: params.processedByUserId,
  };

  return createNotification(params.supabase, {
    organizationId: params.organizationId,
    recipientUserId: params.recipientUserId,
    type: "order_processed",
    href: `/mobile/requests/orders/${params.order.id}`,
    sourceType: "order_request",
    sourceId: params.order.id,
    dedupeKey: `order_processed:${params.order.id}`,
    payload,
  });
}
