import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RevealedSong } from "@/lib/practice/session";
import type { SoloState, TimelineCard } from "./state";

export type GameVariant = "original" | "pro" | "expert";

export type Game = {
  id: string;
  owner_id: string;
  mode: "solo" | "pass_and_play";
  variant: GameVariant;
  edition_ids: string[];
  status: "active" | "finished" | "abandoned";
  state: SoloState;
  songs_needed: number | null;
  finished_at: string | null;
};

const GAME_COLUMNS = "id, owner_id, mode, variant, edition_ids, status, state, songs_needed, finished_at";

// With the player's client, RLS only finds their own game.
export async function loadGame(supabase: SupabaseClient, gameId: string): Promise<Game | null> {
  const { data, error } = await supabase.from("games").select(GAME_COLUMNS).eq("id", gameId).maybeSingle<Game>();
  if (error) throw error;
  return data;
}

export async function findActiveGame(
  supabase: SupabaseClient,
  playerId: string,
): Promise<Pick<Game, "id" | "state"> | null> {
  const { data, error } = await supabase
    .from("games")
    .select("id, state")
    .eq("owner_id", playerId)
    .eq("status", "active")
    .maybeSingle<Pick<Game, "id" | "state">>();
  if (error) throw error;
  return data;
}

// The fewest songs over the player's won solo games in this variant. `before` limits it to
// games finished earlier, so a finished game can tell whether it set a new record.
export async function personalBest(
  supabase: SupabaseClient,
  playerId: string,
  variant: GameVariant,
  before?: { gameId: string; finishedAt: string },
): Promise<number | null> {
  let query = supabase
    .from("games")
    .select("songs_needed")
    .eq("owner_id", playerId)
    .eq("mode", "solo")
    .eq("variant", variant)
    .eq("status", "finished")
    .not("songs_needed", "is", null);
  if (before) query = query.neq("id", before.gameId).lt("finished_at", before.finishedAt);
  const { data, error } = await query
    .order("songs_needed", { ascending: true })
    .limit(1)
    .maybeSingle<{ songs_needed: number }>();
  if (error) throw error;
  return data?.songs_needed ?? null;
}

export function timelineCard(songId: string, song: RevealedSong): TimelineCard {
  return {
    songId,
    year: song.cardYear,
    title: song.title,
    artist: song.artists.map((a) => a.name).join(", "),
  };
}
