"use server";

import { redirect } from "next/navigation";
import { scoreAnswer, type YearResult } from "@/lib/practice/scoring";
import { finishSession, loadSession, revealSong, trackIdOf } from "@/lib/practice/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MIN_YEAR = 1800;
const MAX_YEAR = 2100;
const MAX_ARTIST_LENGTH = 200;

// "Start" and "Nog een ronde". No ticked edition means Alles.
export async function startPractice(formData: FormData) {
  const editionIds = formData.getAll("edition").filter((v): v is string => typeof v === "string" && v !== "");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_practice_session", { p_edition_ids: editionIds });
  if (error) {
    redirect(`/oefenen?fout=${error.code === "P0002" ? "geen_nummers" : "starten"}`);
  }
  redirect(`/oefenen/${data as string}`);
}

export type Reveal = {
  title: string;
  artist: string;
  coverUrl: string | null;
  cardYear: number;
  uncertainYear: boolean;
  guessedYear: number | null;
  yearResult: YearResult;
  artistInput: string;
  artistCorrect: boolean;
  points: number;
  // The session so far, this answer included.
  totalPoints: number;
  answered: number;
  // The next song to play, or null when this was the last one.
  nextTrackId: string | null;
};

export type AnswerResult = { ok: true; reveal: Reveal } | { ok: false; problem: "verouderd" | "mislukt" };

// Scores and stores one answer on the server, so the browser can't fake points. `songIndex`
// is the song the player heard; a stale page (another tab, a double tap) gets "verouderd".
export async function answerSong(
  sessionId: string,
  songIndex: number,
  guessedYear: number | null,
  artistInput: string,
): Promise<AnswerResult> {
  if (guessedYear !== null && (!Number.isInteger(guessedYear) || guessedYear < MIN_YEAR || guessedYear > MAX_YEAR)) {
    return { ok: false, problem: "mislukt" };
  }
  const artist = guessedYear === null ? "" : artistInput.trim().slice(0, MAX_ARTIST_LENGTH);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  if (!playerId) return { ok: false, problem: "mislukt" };

  try {
    const state = await loadSession(supabase, sessionId);
    if (!state || state.session.player_id !== playerId) return { ok: false, problem: "mislukt" };
    if (state.session.status !== "active" || state.current !== songIndex) {
      return { ok: false, problem: "verouderd" };
    }

    const songId = state.session.song_ids[songIndex];
    const song = await revealSong(supabase, songId);
    const score = scoreAnswer({ guessedYear, artistInput: artist }, song.cardYear, song.artists);

    const admin = createAdminClient();
    const { error } = await admin.from("attempts").insert({
      player_id: playerId,
      song_id: songId,
      practice_session_id: sessionId,
      guessed_year: guessedYear,
      year_diff: score.yearDiff,
      artist_input: artist === "" ? null : artist,
      artist_correct: score.artistCorrect,
      dont_know: score.dontKnow,
      points: score.points,
    });
    // 23505: this song was answered a moment ago, in another tab or by a double tap.
    if (error) return { ok: false, problem: error.code === "23505" ? "verouderd" : "mislukt" };

    const answered = songIndex + 1;
    const isLast = answered >= state.session.song_ids.length;
    if (isLast) {
      await finishSession(admin, sessionId);
    }

    return {
      ok: true,
      reveal: {
        title: song.title,
        artist: song.artists.map((a) => a.name).join(", "),
        coverUrl: song.coverUrl,
        cardYear: song.cardYear,
        uncertainYear: song.uncertainYear,
        guessedYear,
        yearResult: score.yearResult,
        artistInput: artist,
        artistCorrect: score.artistCorrect,
        points: score.points,
        totalPoints: state.points + score.points,
        answered,
        nextTrackId: isLast ? null : await trackIdOf(supabase, state.session.song_ids[answered]),
      },
    };
  } catch {
    return { ok: false, problem: "mislukt" };
  }
}
