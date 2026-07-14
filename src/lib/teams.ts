import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/types/database";

export type TeamKind = Database["public"]["Enums"]["team_kind"];
export type TeamRow = Pick<
  Database["public"]["Tables"]["teams"]["Row"],
  "id" | "name" | "kind"
>;

/**
 * Teams for an org (현장/사무실 소속). Ordered field-first then by name, so kind groups read cleanly in
 * assignment dropdowns and filters. Org-scoped like every other business read.
 */
export async function getOrgTeams(organizationId: string): Promise<TeamRow[]> {
  const { data } = await getSupabaseServiceClient()
    .from("teams")
    .select("id, name, kind")
    .eq("organization_id", organizationId)
    .order("kind", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as TeamRow[];
}
