import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readServerEnv } from "../server-env";
import { readSupabaseEnv } from "./env";

// Supabase client with the secret key (role service_role). Bypasses RLS, so use it only
// for what the browser may never do itself, such as reading Spotify tokens.
export function createAdminClient() {
  const { url } = readSupabaseEnv();
  const { supabaseSecretKey } = readServerEnv();

  return createClient(url, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
