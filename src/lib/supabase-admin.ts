import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return client;
}

export function setSupabaseAdminForTests(nextClient: SupabaseClient | null) {
  client = nextClient;
}
