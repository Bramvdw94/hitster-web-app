import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditedArtist } from "@/lib/matching/match";

export type PracticeSession = {
  id: string;
  player_id: string;
  session_number: number;
  edition_ids: string[];
  weak_only: boolean;
  song_ids: string[];
  // Abandoned: replaced by a new session from Ontdek before it was done.
  status: "active" | "finished" | "abandoned";
  // The filter it was dealt with (src/lib/practice/filter.ts); null means none.
  artist_id: string | null;
  year_from: number | null;
  year_to: number | null;
};

export type SessionAttempt = {
  song_id: string;
  year_diff: number | null;
  points: number;
  box_before: number | null;
  box_after: number | null;
};

export type SessionState = {
  session: PracticeSession;
  attempts: SessionAttempt[];
  // Index in song_ids of the first unanswered song; equals song_ids.length when all are answered.
  current: number;
  points: number;
};

// Reads a session and its answers. With the player's client, RLS only finds their own session.
export async function loadSession(supabase: SupabaseClient, sessionId: string): Promise<SessionState | null> {
  const { data: session, error } = await supabase
    .from("practice_sessions")
    .select("id, player_id, session_number, edition_ids, weak_only, song_ids, status, artist_id, year_from, year_to")
    .eq("id", sessionId)
    .maybeSingle<PracticeSession>();
  if (error) throw error;
  if (!session) return null;

  const { data: attempts, error: attemptsError } = await supabase
    .from("attempts")
    .select("song_id, year_diff, points, box_before, box_after")
    .eq("practice_session_id", sessionId)
    .returns<SessionAttempt[]>();
  if (attemptsError) throw attemptsError;

  const answered = new Set(attempts.map((a) => a.song_id));
  const current = session.song_ids.findIndex((id) => !answered.has(id));
  return {
    session,
    attempts,
    current: current === -1 ? session.song_ids.length : current,
    points: attempts.reduce((sum, a) => sum + a.points, 0),
  };
}

export async function findActiveSessionId(supabase: SupabaseClient, playerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("id")
    .eq("player_id", playerId)
    .eq("status", "active")
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  return data?.id ?? null;
}

export async function trackIdOf(supabase: SupabaseClient, songId: string): Promise<string> {
  const { data, error } = await supabase
    .from("songs")
    .select("spotify_track_id")
    .eq("id", songId)
    .single<{ spotify_track_id: string }>();
  if (error) throw error;
  return data.spotify_track_id;
}

export type RevealedSong = {
  title: string;
  coverUrl: string | null;
  cardYear: number;
  uncertainYear: boolean;
  artists: CreditedArtist[];
};

type SongRow = {
  title: string;
  cover_url: string | null;
  song_artists: { position: number; artists: { name: string; kind: "person" | "group" | null; aliases: string[] } }[];
};

// Everything the answer screen shows, with the effective card year (Bram's correction wins).
export async function revealSong(supabase: SupabaseClient, songId: string): Promise<RevealedSong> {
  const [{ data: song, error }, { data: year, error: yearError }] = await Promise.all([
    supabase
      .from("songs")
      .select("title, cover_url, song_artists(position, artists(name, kind, aliases))")
      .eq("id", songId)
      .single<SongRow>(),
    supabase
      .from("song_card_years")
      .select("card_year, year_status")
      .eq("song_id", songId)
      .single<{ card_year: number | null; year_status: "certain" | "uncertain" | "missing" }>(),
  ]);
  if (error) throw error;
  if (yearError) throw yearError;
  if (year.card_year === null) throw new Error(`Song ${songId} has no card year`);

  return {
    title: song.title,
    coverUrl: song.cover_url,
    cardYear: year.card_year,
    uncertainYear: year.year_status === "uncertain",
    artists: [...song.song_artists]
      .sort((a, b) => a.position - b.position)
      // An artist without a known kind gets no surname rule, like a group.
      .map(({ artists: a }) => ({ name: a.name, kind: a.kind ?? "group", aliases: a.aliases })),
  };
}

// Card years of the given songs, for the summary's decade bars.
export async function cardYearsOf(supabase: SupabaseClient, songIds: string[]): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("song_card_years")
    .select("song_id, card_year")
    .in("song_id", songIds)
    .returns<{ song_id: string; card_year: number | null }[]>();
  if (error) throw error;
  return new Map(data.filter((r) => r.card_year !== null).map((r) => [r.song_id, r.card_year!]));
}

// Song titles, for the summary's box moves.
export async function titlesOf(supabase: SupabaseClient, songIds: string[]): Promise<Map<string, string>> {
  if (songIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("songs")
    .select("id, title")
    .in("id", songIds)
    .returns<{ id: string; title: string }[]>();
  if (error) throw error;
  return new Map(data.map((r) => [r.id, r.title]));
}

// Marks a session finished. Takes the admin client: players can't write sessions themselves.
export async function finishSession(admin: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await admin
    .from("practice_sessions")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "active");
  if (error) throw error;
}
