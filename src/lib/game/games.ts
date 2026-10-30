import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RevealedSong } from "@/lib/practice/session";
import type { SoloState, TimelineCard, Variant } from "./state";
import type { TogetherState } from "./together";

export type GameVariant = Variant;

// `state` is a SoloState in solo and a TogetherState in pass-and-play.
export type Game<S = SoloState> = {
  id: string;
  owner_id: string;
  mode: "solo" | "pass_and_play";
  variant: GameVariant;
  edition_ids: string[];
  status: "active" | "finished" | "abandoned";
  state: S;
  songs_needed: number | null;
  finished_at: string | null;
};

const GAME_COLUMNS = "id, owner_id, mode, variant, edition_ids, status, state, songs_needed, finished_at";

// With the player's client, RLS only finds their own game.
export async function loadGame<S = SoloState>(supabase: SupabaseClient, gameId: string): Promise<Game<S> | null> {
  const { data, error } = await supabase.from("games").select(GAME_COLUMNS).eq("id", gameId).maybeSingle<Game<S>>();
  if (error) throw error;
  return data;
}

export type ActiveGame =
  | (Pick<Game, "id" | "state"> & { mode: "solo" })
  | (Pick<Game<TogetherState>, "id" | "state"> & { mode: "pass_and_play" });

// The one game a player has running, solo or pass-and-play.
export async function findActiveGame(supabase: SupabaseClient, playerId: string): Promise<ActiveGame | null> {
  const { data, error } = await supabase
    .from("games")
    .select("id, mode, state")
    .eq("owner_id", playerId)
    .eq("status", "active")
    .maybeSingle<ActiveGame>();
  if (error) throw error;
  return data;
}

// Where a running game is played.
export function gamePath(game: Pick<Game, "id" | "mode">): string {
  return game.mode === "solo" ? `/spel/${game.id}` : `/samen/${game.id}`;
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
