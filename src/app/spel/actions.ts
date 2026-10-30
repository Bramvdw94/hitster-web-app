"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { findActiveGame, loadGame, personalBest, timelineCard } from "@/lib/game/games";
import {
  buyCard,
  canBuy,
  canSkip,
  currentSong,
  DECK_SIZE,
  isNewRecord,
  outcomeOf,
  placeCard,
  skipSong,
  songsNeeded,
  startSolo,
  tokensOf,
  type Naming,
  type Outcome,
  type SoloState,
  type TimelineCard,
  type Variant,
} from "@/lib/game/state";
import { matchArtist, matchTitle } from "@/lib/matching/match";
import { shuffle } from "@/lib/practice/mix";
import { loadCandidates, recordAttempt } from "@/lib/practice/progress";
import { revealSong, trackIdOf } from "@/lib/practice/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const VARIANTS: Variant[] = ["original", "pro", "expert"];

// "Start spel": a solo game in the chosen variant from the ticked editions (none ticked = all).
// With a game still running, the form must say `vervang`, which the page only sends after a
// confirm.
export async function startSoloGame(formData: FormData) {
  const variantField = formData.get("variant");
  const variant = VARIANTS.find((v) => v === variantField) ?? "original";
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
      .insert({ owner_id: playerId, mode: "solo", variant, edition_ids: editionIds, state })
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

export type TurnKind = "placed" | "skipped" | "bought";

export type PlacementReveal = {
  kind: TurnKind;
  variant: Variant;
  songId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  cardYear: number;
  uncertainYear: boolean;
  // Whether the card fitted where it was put. True for a bought card, false for a skip.
  correct: boolean;
  // Whether it joined the timeline; in Pro and Expert that takes the naming too.
  won: boolean;
  // What the player typed and whether it was right. Null for a skip or a buy.
  naming: (Naming & { artistInput: string; titleInput: string; guessedYear: number | null }) | null;
  tokens: number;
  tokenChange: number;
  // Where the card went, so the ladder can show it there (green, or red before it's discarded).
  gap: number;
  // The timeline before this turn; a won card is inserted at `gap`.
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

// What the player typed before placing. `year` only counts in Expert.
export type Answer = { artist: string; title: string; year: number | null };

type Turn = { kind: "place"; gap: number; answer: Answer } | { kind: "skip" } | { kind: "buy" };

const MAX_INPUT = 200;

// Checks and stores one placement on the server. `placed` is the turn the player saw: a stale
// page (another tab, a double tap) gets "verouderd" and reloads the game where it really is.
export async function placeSoloCard(
  gameId: string,
  placed: number,
  gap: number,
  answer: Answer = { artist: "", title: "", year: null },
): Promise<PlacementResult> {
  if (!Number.isInteger(gap)) return { ok: false, problem: "mislukt" };
  if (typeof answer?.artist !== "string" || typeof answer.title !== "string") return { ok: false, problem: "mislukt" };
  if (answer.year !== null && !Number.isInteger(answer.year)) return { ok: false, problem: "mislukt" };
  return playTurn(gameId, placed, {
    kind: "place",
    gap,
    answer: { artist: answer.artist.slice(0, MAX_INPUT), title: answer.title.slice(0, MAX_INPUT), year: answer.year },
  });
}

// Spends a token to skip the song playing now.
export async function skipSoloSong(gameId: string, placed: number): Promise<PlacementResult> {
  return playTurn(gameId, placed, { kind: "skip" });
}

// Spends three tokens to put the song playing now straight onto the timeline.
export async function buySoloCard(gameId: string, placed: number): Promise<PlacementResult> {
  return playTurn(gameId, placed, { kind: "buy" });
}

async function playTurn(gameId: string, placed: number, turn: Turn): Promise<PlacementResult> {
  if (!Number.isInteger(placed)) return { ok: false, problem: "mislukt" };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  if (!playerId) return { ok: false, problem: "mislukt" };

  try {
    const game = await loadGame(supabase, gameId);
    if (!game || game.owner_id !== playerId || game.mode !== "solo") return { ok: false, problem: "mislukt" };
    if (game.status !== "active" || game.state.placed !== placed) return { ok: false, problem: "verouderd" };
    if (turn.kind === "place" && (turn.gap < 0 || turn.gap > game.state.timeline.length)) {
      return { ok: false, problem: "mislukt" };
    }
    if (turn.kind === "place" && game.variant === "expert" && turn.answer.year === null) {
      return { ok: false, problem: "mislukt" };
    }
    // The page hides these buttons without enough tokens; a stale page lands here.
    if ((turn.kind === "skip" && !canSkip(game.state)) || (turn.kind === "buy" && !canBuy(game.state))) {
      return { ok: false, problem: "verouderd" };
    }

    const songId = currentSong(game.state);
    if (songId === null) return { ok: false, problem: "verouderd" };
    const song = await revealSong(supabase, songId);
    const card = timelineCard(songId, song);

    let state: SoloState;
    let correct = false;
    let won = false;
    let gap = 0;
    let naming: PlacementReveal["naming"] = null;
    if (turn.kind === "place") {
      const guessedYear = game.variant === "expert" ? turn.answer.year : null;
      const checked: Naming = {
        artistCorrect: matchArtist(turn.answer.artist, song.artists),
        titleCorrect: matchTitle(turn.answer.title, song.title),
        yearExact: guessedYear === song.cardYear,
      };
      const move = placeCard(game.state, turn.gap, card, game.variant, checked);
      ({ state, correct, won, gap } = move);
      naming = { ...checked, artistInput: turn.answer.artist, titleInput: turn.answer.title, guessedYear };
    } else if (turn.kind === "buy") {
      const move = buyCard(game.state, card);
      ({ state, correct, won, gap } = move);
    } else {
      state = skipSong(game.state);
    }

    const outcome = outcomeOf(state);
    const score = songsNeeded(state);
    const over = outcome !== "playing";
    const now = new Date().toISOString();

    // Saved first and only if nobody played this turn in the meantime, so the game can always
    // go on; the weak-song attempt comes after.
    const admin = createAdminClient();
    const { data: saved, error } = await admin
      .from("games")
      .update({
        state,
        updated_at: now,
        ...(over ? { status: "finished", finished_at: now, songs_needed: score } : {}),
      })
      .eq("id", gameId)
      .eq("status", "active")
      .eq("state->>placed", String(placed))
      .select("id");
    if (error) throw error;
    if (saved.length === 0) return { ok: false, problem: "verouderd" };

    // Only a placement is an attempt: a skip or a buy names nothing and places nothing.
    if (naming) {
      try {
        // In Expert the typed year moves the box, as in practice; otherwise the placement does.
        await recordAttempt(admin, {
          playerId,
          songId,
          practiceSessionId: null,
          gameId,
          guessedYear: naming.guessedYear,
          yearDiff: naming.guessedYear === null ? null : naming.guessedYear - song.cardYear,
          artistInput: naming.artistInput || null,
          artistCorrect: naming.artistCorrect,
          dontKnow: false,
          points: 0,
          placedCorrectly: correct,
        });
      } catch (attemptError) {
        // A lost attempt only costs one box move; the game itself is saved.
        console.error("Solo placement attempt not stored", attemptError);
      }
    }

    const best = score === null ? null : await personalBest(supabase, playerId, game.variant, { gameId, finishedAt: now });
    const nextSong = currentSong(state);
    return {
      ok: true,
      reveal: {
        kind: turn.kind === "place" ? "placed" : turn.kind === "buy" ? "bought" : "skipped",
        variant: game.variant,
        songId,
        title: song.title,
        artist: song.artists.map((a) => a.name).join(", "),
        coverUrl: song.coverUrl,
        cardYear: song.cardYear,
        uncertainYear: song.uncertainYear,
        correct,
        won,
        naming,
        tokens: tokensOf(state),
        tokenChange: tokensOf(state) - tokensOf(game.state),
        gap,
        timeline: game.state.timeline,
        placed: state.placed,
        outcome,
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
