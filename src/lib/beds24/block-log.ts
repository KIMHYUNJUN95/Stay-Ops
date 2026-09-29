import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * 차단 전송 로그 한 줄 남기기 — 판매 캘린더 「이력 → Beds24 전송」.
 *
 * 계약: `supabase/migrations/202609290001_beds24_block_logs.sql`
 *
 * **절대 던지지 않는다.** 로그를 못 남겼다고 이미 Beds24 에 반영된 차단을 실패로 보고하면 사람이
 * 또 누른다. 실패는 서버 로그에만 남긴다.
 */
export async function recordBlockLog(
  supabase: SupabaseClient<Database>,
  entry: Database["public"]["Tables"]["beds24_block_logs"]["Insert"],
): Promise<void> {
  try {
    const saved = await supabase.from("beds24_block_logs").insert(entry);
    if (saved.error) console.error("[beds24/block-log] insert failed", saved.error);
  } catch (error) {
    console.error("[beds24/block-log] insert error", error);
  }
}
