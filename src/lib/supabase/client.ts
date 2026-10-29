import { createBrowserClient } from "@supabase/ssr";
import { readSupabaseEnv } from "./env";

// Supabase client for Client Components.
export function createClient() {
  const { url, publishableKey } = readSupabaseEnv();
  return createBrowserClient(url, publishableKey);
}
