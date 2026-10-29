import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { boxBefore, dueInterval, nextBox } from "./leitner";
import type { Candidate, DecadeStat } from "./mix";

export type AttemptInput = {
  playerId: string;
  songId: string;
  // Null for a solo game attempt (#27).
  practiceSessionId: string | null;
  guessedYear: number | null;
  yearDiff: number | null;
  artistInput: string | null;
  artistCorrect: boolean;
  dontKnow: boolean;
  points: number;
};

export type RecordedAttempt = { boxBefore: number; boxAfter: number };

// The one path that stores an answer and moves the song's Leitner box, shared by practice and
// the solo game. Takes the admin client: players never write attempts or progress themselves.
// Throws the Supabase error as is; code 23505 means this song was already answered.
export async function recordAttempt(admin: SupabaseClient, input: AttemptInput): Promise<RecordedAttempt> {
  const { data: progress, error: readError } = await admin
    .from("song_progress")
    .select("box")
    .eq("player_id", input.playerId)
    .eq("song_id", input.songId)
    .maybeSingle<{ box: number }>();
  if (readError) throw readError;

  const before = boxBefore(progress?.box);
  const after = nextBox(before, input.yearDiff);
  const { error } = await admin.rpc("record_attempt", {
    p_player_id: input.playerId,
    p_song_id: input.songId,
    p_practice_session_id: input.practiceSessionId,
    p_guessed_year: input.guessedYear,
    p_year_diff: input.yearDiff,
    p_artist_input: input.artistInput,
    p_artist_correct: input.artistCorrect,
    p_dont_know: input.dontKnow,
    p_points: input.points,
    p_box_before: before,
    p_box_after: after,
    p_due_interval: dueInterval(after),
  });
  if (error) throw error;
  return { boxBefore: before, boxAfter: after };
}

// Playable songs in the editions (empty = Alles) with the player's box; weak only = box 1-2
// across every edition. With the player's client.
export async function loadCandidates(
  supabase: SupabaseClient,
  editionIds: string[],
  weakOnly = false,
): Promise<Candidate[]> {
  const { data, error } = await supabase.rpc("practice_candidates", {
    p_edition_ids: editionIds,
    p_weak_only: weakOnly,
  });
  if (error) throw error;
  return data as Candidate[];
}

export async function loadDecadeStats(supabase: SupabaseClient): Promise<DecadeStat[]> {
  const { data, error } = await supabase
    .from("practice_decade_stats")
    .select("decade, answered, close")
    .returns<DecadeStat[]>();
  if (error) throw error;
  return data;
}
