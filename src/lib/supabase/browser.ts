"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicSupabaseEnv } from "@/lib/env";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const { anonKey, url } = getPublicSupabaseEnv();
    browserClient = createBrowserClient<Database>(url, anonKey);
  }

  return browserClient;
}
