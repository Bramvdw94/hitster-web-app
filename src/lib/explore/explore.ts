import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PracticeFilter } from "@/lib/practice/filter";

export type ArtistHit = { id: string; name: string; songCount: number };

export type ExploreSong = {
  id: string;
  title: string;
  artists: string | null;
  cardYear: number;
  uncertainYear: boolean;
  coverUrl: string | null;
  // The player's Leitner box, null when never heard.
  box: number | null;
  // Answers with a year, and the average years off over them (null without any).
  guesses: number;
  avgOff: number | null;
};

export type ExploreResult = { total: number; songs: ExploreSong[] };

export const EXPLORE_LIMIT = 400;

// The Ontdek timeline: playable songs for the filter, oldest first. With the player's client,
// so box and years off are their own.
export async function exploreSongs(supabase: SupabaseClient, filter: PracticeFilter): Promise<ExploreResult> {
  const { data, error } = await supabase.rpc("explore_songs", {
    p_artist_id: filter.artistId,
    p_year_from: filter.yearFrom,
    p_year_to: filter.yearTo,
    p_limit: EXPLORE_LIMIT,
  });
  if (error) throw error;
  return data as ExploreResult;
}

export async function artistName(supabase: SupabaseClient, artistId: string | null): Promise<string | null> {
  if (!artistId) return null;
  const { data, error } = await supabase.from("artists").select("name").eq("id", artistId).maybeSingle<{ name: string }>();
  if (error) throw error;
  return data?.name ?? null;
}

// The oldest and newest card year in the catalogue, for the decade buttons.
export async function catalogueYears(supabase: SupabaseClient): Promise<{ oldest: number | null; newest: number | null }> {
  const edge = (ascending: boolean) =>
    supabase
      .from("playable_songs")
      .select("card_year")
      .order("card_year", { ascending })
      .limit(1)
      .maybeSingle<{ card_year: number }>();
  const [{ data: first, error }, { data: last, error: lastError }] = await Promise.all([edge(true), edge(false)]);
  if (error) throw error;
  if (lastError) throw lastError;
  return { oldest: first?.card_year ?? null, newest: last?.card_year ?? null };
}
