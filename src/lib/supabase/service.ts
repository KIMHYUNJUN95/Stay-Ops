import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getServiceSupabaseEnv } from "@/lib/env";

let serviceClient: SupabaseClient<Database> | null = null;

export function getSupabaseServiceClient() {
  if (!serviceClient) {
    const { serviceRoleKey, url } = getServiceSupabaseEnv();
    serviceClient = createClient<Database>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceClient;
}
