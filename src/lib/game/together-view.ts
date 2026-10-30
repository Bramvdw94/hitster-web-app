import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trackIdOf, revealSong } from "@/lib/practice/session";
import { timelineCard, type Game } from "./games";
import type { TimelineCard } from "./state";
import { currentSong, outcomeOf, type TogetherState, type Variant } from "./together";

export type RevealedCard = TimelineCard & { coverUrl: string | null; uncertainYear: boolean };

// What the phone needs to show a turn. The deck stays on the server.
export type TogetherView = {
  variant: Variant;
  seats: TogetherState["seats"];
  turn: number;
  moves: number;
  locked: TogetherState["locked"];
  over: boolean;
  // The seat that reached 10 cards.
  winner: number | null;
  // The song playing now, or null when the game is over.
  trackId: string | null;
  // The song once it's revealed: after the placement is locked.
  song: RevealedCard | null;
};

export async function revealedCard(supabase: SupabaseClient, songId: string): Promise<RevealedCard> {
  const song = await revealSong(supabase, songId);
  return { ...timelineCard(songId, song), coverUrl: song.coverUrl, uncertainYear: song.uncertainYear };
}

export async function viewOf(supabase: SupabaseClient, game: Game<TogetherState>): Promise<TogetherView> {
  const { state } = game;
  const songId = currentSong(state);
  const over = game.status !== "active" || outcomeOf(state) !== "playing";
  return {
    variant: game.variant,
    seats: state.seats,
    turn: state.turn,
    moves: state.moves,
    locked: state.locked,
    over,
    winner: state.winner,
    trackId: over || songId === null ? null : await trackIdOf(supabase, songId),
    song: state.locked && songId !== null ? await revealedCard(supabase, songId) : null,
  };
}
