export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

// Next.js inlines NEXT_PUBLIC_* only when they are read as literal property accesses,
// so the values are passed in rather than looked up by name.
export function readSupabaseEnv(
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
): SupabaseEnv {
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing Supabase environment variables: ${missing.join(", ")}`);
  }

  return { url: url!, publishableKey: publishableKey! };
}
