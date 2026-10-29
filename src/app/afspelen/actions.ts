"use server";

import { createClient } from "@/lib/supabase/server";

// A random playable song for the playback test. Only the Spotify track id leaves the
// server: the title and year stay hidden, as they will in the modes.
export async function pickRandomTrack(): Promise<string | null> {
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("playable_songs")
    .select("id", { count: "exact", head: true });
  if (countError) throw countError;
  if (!count) return null;

  const offset = Math.floor(Math.random() * count);
  const { data, error } = await supabase
    .from("playable_songs")
    .select("spotify_track_id")
    .order("id")
    .range(offset, offset)
    .maybeSingle();
  if (error) throw error;
  return data?.spotify_track_id ?? null;
}
