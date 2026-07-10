import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ReservationInternalNoteRow =
  Database["public"]["Tables"]["reservation_internal_notes"]["Row"];

function untyped(client: SupabaseClient<Database>): SupabaseClient {
  return client as unknown as SupabaseClient;
}

export async function listReservationInternalNotes(
  session: AppSession,
  reservationIds: string[],
): Promise<Record<string, string>> {
  if (reservationIds.length === 0) {
    return {};
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await untyped(supabase)
    .from("reservation_internal_notes")
    .select("reservation_id, note")
    .eq("organization_id", session.organization.id)
    .in("reservation_id", reservationIds);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as Pick<ReservationInternalNoteRow, "reservation_id" | "note">[]).reduce<
    Record<string, string>
  >((acc, row) => {
    acc[row.reservation_id] = row.note;
    return acc;
  }, {});
}

export async function saveReservationInternalNote(input: {
  note: string;
  reservationId: string;
  session: AppSession;
}): Promise<string> {
  const { note, reservationId, session } = input;
  const trimmed = note.trim();
  const supabase = await getSupabaseServerClient();

  if (!trimmed) {
    const { error } = await untyped(supabase)
      .from("reservation_internal_notes")
      .delete()
      .eq("organization_id", session.organization.id)
      .eq("reservation_id", reservationId);

    if (error) {
      throw new Error(error.message);
    }

    return "";
  }

  const payload: Database["public"]["Tables"]["reservation_internal_notes"]["Insert"] = {
    note: trimmed,
    organization_id: session.organization.id,
    reservation_id: reservationId,
    updated_by_user_id: session.user.id,
  };

  const { data, error } = await untyped(supabase)
    .from("reservation_internal_notes")
    .upsert(payload, {
      onConflict: "organization_id,reservation_id",
    })
    .select("note")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "save_failed");
  }

  return (data as Pick<ReservationInternalNoteRow, "note">).note;
}
