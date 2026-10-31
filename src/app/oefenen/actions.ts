"use server";

import { redirect } from "next/navigation";
import { filterQuery, parseFilter } from "@/lib/practice/filter";
import { dealSession, dealWeakSession } from "@/lib/practice/mix";
import { loadCandidates, loadDecadeStats, recordAttempt } from "@/lib/practice/progress";
import { scoreAnswer, type YearResult } from "@/lib/practice/scoring";
import { finishSession, loadSession, revealSong, trackIdOf } from "@/lib/practice/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MIN_YEAR = 1800;
const MAX_YEAR = 2100;
const MAX_ARTIST_LENGTH = 200;

// "Start" and "Nog een ronde". No ticked edition means Alles. With `zwak` set it is
// "Oefen mijn zwakke nummers": box 1-2 songs from every edition. `artiest`, `van` and `tot`
// narrow either to one artist and/or a range of card years (src/lib/practice/filter.ts).
export async function startPractice(formData: FormData) {
  const weakOnly = formData.get("zwak") === "1";
  const filter = parseFilter((name) => formData.get(name));
  // Ontdek's "Oefen deze nummers" and a new round on /oefenen: stop a running session
  // instead of returning to it.
  const replace = formData.get("vervang") === "1";
  const editionIds = weakOnly
    ? []
    : formData.getAll("edition").filter((v): v is string => typeof v === "string" && v !== "");
  // Back to the start screen with the filter still filled in.
  const back = (problem: string) => {
    const params = new URLSearchParams(filterQuery(filter).slice(1));
    params.set("fout", problem);
    return `/oefenen?${params}`;
  };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  if (!playerId) redirect("/login");

  let songIds: string[];
  try {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("practice_session_count")
      .eq("id", playerId)
      .single<{ practice_session_count: number }>();
    if (error) throw error;
    const candidates = await loadCandidates(supabase, editionIds, weakOnly, filter);
    songIds = weakOnly
      ? dealWeakSession(candidates, Math.random)
      : dealSession(candidates, await loadDecadeStats(supabase), profile.practice_session_count + 1, Math.random);
  } catch {
    redirect(back("starten"));
  }

  const { data, error } = await supabase.rpc("start_practice_session", {
    p_edition_ids: editionIds,
    p_weak_only: weakOnly,
    p_song_ids: songIds,
    p_artist_id: filter.artistId,
    p_year_from: filter.yearFrom,
    p_year_to: filter.yearTo,
    p_replace: replace,
  });
  if (error) {
    const problem = error.code !== "P0002" ? "starten" : weakOnly ? "geen_zwakke" : "geen_nummers";
    redirect(back(problem));
  }
  redirect(`/oefenen/${data as string}`);
}

export type Reveal = {
  songId: string;
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
    try {
      await recordAttempt(admin, {
        playerId,
        songId,
        practiceSessionId: sessionId,
        guessedYear,
        yearDiff: score.yearDiff,
        artistInput: artist === "" ? null : artist,
        artistCorrect: score.artistCorrect,
        dontKnow: score.dontKnow,
        points: score.points,
      });
    } catch (error) {
      // 23505: this song was answered a moment ago, in another tab or by a double tap.
      // 40001: the same, caught on the song's box.
      const code = (error as { code?: string }).code;
      return { ok: false, problem: code === "23505" || code === "40001" ? "verouderd" : "mislukt" };
    }

    const answered = songIndex + 1;
    const isLast = answered >= state.session.song_ids.length;
    if (isLast) {
      await finishSession(admin, sessionId);
    }

    return {
      ok: true,
      reveal: {
        songId,
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
