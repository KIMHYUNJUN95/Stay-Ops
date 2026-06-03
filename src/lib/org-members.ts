import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "name">;
type MembershipRow = Pick<
  Database["public"]["Tables"]["memberships"]["Row"],
  "user_id" | "status"
>;

export type OrgMemberOption = {
  id: string;
  name: string;
};

export async function getOrgMemberOptions(
  organizationId: string,
): Promise<OrgMemberOption[]> {
  const supabase = await getSupabaseServerClient();
  const { data: membershipData, error } = await supabase
    .from("memberships")
    .select("user_id, status")
    .eq("organization_id", organizationId)
    .in("status", ["active", "invited"]);

  if (error) {
    throw new Error(error.message);
  }

  const memberships = (membershipData ?? []) as MembershipRow[];
  const userIds = [...new Set(memberships.map((m) => m.user_id))];
  if (userIds.length === 0) {
    return [];
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, name")
    .in("id", userIds);

  if (profileError) {
    throw new Error(profileError.message);
  }

  return ((profileData ?? []) as ProfileRow[])
    .map((profile) => ({ id: profile.id, name: profile.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
