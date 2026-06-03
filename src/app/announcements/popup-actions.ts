"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";

const HIDE_FOR_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function dismissPopupForWeek(
  announcementId: string,
  organizationId: string,
) {
  if (!announcementId || !organizationId) return;

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const hideUntil = new Date(Date.now() + HIDE_FOR_WEEK_MS).toISOString();

  await supabase
    .from("announcement_popup_dismissals")
    .upsert(
      {
        announcement_id: announcementId,
        hide_until: hideUntil,
        organization_id: organizationId,
        user_id: user.id,
      } as never,
      { onConflict: "announcement_id,user_id" },
    );
}
