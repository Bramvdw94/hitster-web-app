"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { findActiveGame, loadGame, personalBest, timelineCard } from "@/lib/game/games";
import {
  currentSong,
  DECK_SIZE,
  isNewRecord,
  placeCard,
  songsNeeded,
  startSolo,
  type Outcome,
  type TimelineCard,
} from "@/lib/game/state";
import { shuffle } from "@/lib/practice/mix";
import { loadCandidates, recordAttempt } from "@/lib/practice/progress";
import { revealSong, trackIdOf } from "@/lib/practice/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// "Start spel": a solo Original game from the ticked editions (none ticked = all). With a game
// still running, the form must say `vervang`, which the page only sends after a confirm.
export async function startSoloGame(formData: FormData) {
  const editionIds = formData.getAll("edition").filter((v): v is string => typeof v === "string" && v !== "");
  const replace = formData.get("vervang") === "1";
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  if (!playerId) redirect("/login");

  let gameId: string;
  try {
    const running = await findActiveGame(supabase, playerId);
    if (running && !replace) redirect(`/spel/${running.id}`);

    const candidates = await loadCandidates(supabase, editionIds);
    const deck = shuffle(candidates, Math.random)
      .slice(0, DECK_SIZE)
      .map((c) => c.id);
    if (deck.length < 2) redirect("/spel?fout=geen_nummers");

    const state = startSolo(deck, timelineCard(deck[0], await revealSong(supabase, deck[0])));
    const admin = createAdminClient();
    if (running) {
      const { error } = await admin
        .from("games")
        .update({ status: "abandoned", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("owner_id", playerId)
        .eq("status", "active");
      if (error) throw error;
    }
    const { data, error } = await admin
      .from("games")
      .insert({ owner_id: playerId, mode: "solo", variant: "original", edition_ids: editionIds, state })
      .select("id")
      .single<{ id: string }>();
    if (error) throw error;
    gameId = data.id;
  } catch (error) {
    // redirect() works by throwing; let it through.
    unstable_rethrow(error);
    redirect("/spel?fout=starten");
  }
  redirect(`/spel/${gameId}`);
}

export type PlacementReveal = {
  songId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  cardYear: number;
  uncertainYear: boolean;
  correct: boolean;
  // Where the card went, so the ladder can show it there (green, or red before it's discarded).
  gap: number;
  // The timeline before this placement; a right card is inserted at `gap`.
  timeline: TimelineCard[];
  placed: number;
  outcome: Outcome;
  songsNeeded: number | null;
  personalBest: number | null;
  newRecord: boolean;
  // The next song to play, or null when the game is over.
  nextTrackId: string | null;
};

export type PlacementResult = { ok: true; reveal: PlacementReveal } | { ok: false; problem: "verouderd" | "mislukt" };

// Checks and stores one placement on the server. `placed` is the turn the player saw: a stale
// page (another tab, a double tap) gets "verouderd" and reloads the game where it really is.
export async function placeSoloCard(gameId: string, placed: number, gap: number): Promise<PlacementResult> {
  if (!Number.isInteger(placed) || !Number.isInteger(gap)) return { ok: false, problem: "mislukt" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  if (!playerId) return { ok: false, problem: "mislukt" };

  try {
    const game = await loadGame(supabase, gameId);
    if (!game || game.owner_id !== playerId || game.mode !== "solo") return { ok: false, problem: "mislukt" };
    if (game.status !== "active" || game.state.placed !== placed) return { ok: false, problem: "verouderd" };
    if (gap < 0 || gap > game.state.timeline.length) return { ok: false, problem: "mislukt" };

    const songId = currentSong(game.state);
    if (songId === null) return { ok: false, problem: "verouderd" };
    const song = await revealSong(supabase, songId);
    const move = placeCard(game.state, gap, timelineCard(songId, song));
    const score = songsNeeded(move.state);
    const over = move.outcome !== "playing";
    const now = new Date().toISOString();

    // Saved first and only if nobody placed this turn in the meantime, so the game can always
    // go on; the weak-song attempt comes after.
    const admin = createAdminClient();
    const { data: saved, error } = await admin
      .from("games")
      .update({
        state: move.state,
        updated_at: now,
        ...(over ? { status: "finished", finished_at: now, songs_needed: score } : {}),
      })
      .eq("id", gameId)
      .eq("status", "active")
      .eq("state->>placed", String(placed))
      .select("id");
    if (error) throw error;
    if (saved.length === 0) return { ok: false, problem: "verouderd" };

    try {
      await recordAttempt(admin, {
        playerId,
        songId,
        practiceSessionId: null,
        gameId,
        guessedYear: null,
        yearDiff: null,
        artistInput: null,
        artistCorrect: false,
        dontKnow: false,
        points: 0,
        placedCorrectly: move.correct,
      });
    } catch (attemptError) {
      // A lost attempt only costs one box move; the game itself is saved.
      console.error("Solo placement attempt not stored", attemptError);
    }

    const best = score === null ? null : await personalBest(supabase, playerId, game.variant, { gameId, finishedAt: now });
    const nextSong = currentSong(move.state);
    return {
      ok: true,
      reveal: {
        songId,
        title: song.title,
        artist: song.artists.map((a) => a.name).join(", "),
        coverUrl: song.coverUrl,
        cardYear: song.cardYear,
        uncertainYear: song.uncertainYear,
        correct: move.correct,
        gap,
        timeline: game.state.timeline,
        placed: move.state.placed,
        outcome: move.outcome,
        songsNeeded: score,
        personalBest: best,
        newRecord: score !== null && isNewRecord(score, best),
        nextTrackId: over || nextSong === null ? null : await trackIdOf(supabase, nextSong),
      },
    };
  } catch {
    return { ok: false, problem: "mislukt" };
  }
}
