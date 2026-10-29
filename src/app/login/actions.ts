"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SPOTIFY_SCOPES } from "@/lib/spotify/token";
import { createClient } from "@/lib/supabase/server";

export async function logInWithSpotify() {
  // The origin works for production, every preview URL and localhost alike,
  // as long as it is on Supabase's redirect allowlist (docs/setup.md).
  const origin = (await headers()).get("origin");
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "spotify",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: SPOTIFY_SCOPES,
    },
  });

  if (error || !data.url) {
    console.error("Spotify login: could not start", error);
    redirect("/login?fout=onbekend");
  }
  redirect(data.url);
}
