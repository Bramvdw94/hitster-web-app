"use server";

import { createClient } from "@/lib/supabase/server";
import type { ArtistHit } from "./explore";

const MAX_QUERY_LENGTH = 100;

// Artist suggestions while typing, on Oefenen and Ontdek. Reads the database only, never Spotify.
export async function searchArtists(query: string): Promise<ArtistHit[]> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (q.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_artists", { p_query: q });
  if (error) return [];
  return data as ArtistHit[];
}
