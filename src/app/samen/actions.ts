"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { findActiveGame, gamePath, loadGame, timelineCard, type Game } from "@/lib/game/games";
import { revealedCard, viewOf, type RevealedCard, type TogetherView } from "@/lib/game/together-view";
import { DECK_SIZE } from "@/lib/game/state";
import {
  buyCard,
  cleanNames,
  currentSong,
  judgeTurn,
  lockPlacement,
  outcomeOf,
  skipSong,
  startTogether,
  type Judgement,
  type Steal,
  type TogetherState,
  type Variant,
} from "@/lib/game/together";
import { shuffle } from "@/lib/practice/mix";
import { loadCandidates } from "@/lib/practice/progress";
import { revealSong } from "@/lib/practice/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Pass-and-play (#29). The names live only in games.state, and nothing here writes attempts:
// a game at the table doesn't touch weak songs or stats.

const VARIANTS: Variant[] = ["original", "pro", "expert"];

// "Start": 2 to 8 names in turn order, a variant and the ticked editions (none = all). With a
// game still running, the form must say `vervang`, which the page only sends after a confirm.
export async function startTogetherGame(formData: FormData) {
  const names = cleanNames(formData.getAll("speler").filter((v): v is string => typeof v === "string"));
  const variantInput = formData.get("variant");
  const variant = VARIANTS.find((v) => v === variantInput) ?? "original";
  const editionIds = formData.getAll("edition").filter((v): v is string => typeof v === "string" && v !== "");
  const replace = formData.get("vervang") === "1";
  if (names === null) redirect("/samen?fout=spelers");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  if (!playerId) redirect("/login");

  let gameId: string;
  try {
    const running = await findActiveGame(supabase, playerId);
    if (running && !replace) redirect(gamePath(running));

    const candidates = await loadCandidates(supabase, editionIds);
    const deck = shuffle(candidates, Math.random)
      .slice(0, DECK_SIZE)
      .map((c) => c.id);
    if (deck.length <= names.length) redirect("/samen?fout=geen_nummers");

    const startingCards = await Promise.all(
      deck.slice(0, names.length).map(async (id) => timelineCard(id, await revealSong(supabase, id))),
    );
    const state = startTogether(names, deck, startingCards);
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
      .insert({ owner_id: playerId, mode: "pass_and_play", variant, edition_ids: editionIds, state })
      .select("id")
      .single<{ id: string }>();
    if (error) throw error;
    gameId = data.id;
  } catch (error) {
    // redirect() works by throwing; let it through.
    unstable_rethrow(error);
    redirect("/samen?fout=starten");
  }
  redirect(`/samen/${gameId}`);
}

// What happened on the turn just played, for the result screen.
export type TurnSummary =
  | { kind: "skip" }
  | { kind: "buy"; card: RevealedCard; seat: number }
  | {
      kind: "judged";
      card: RevealedCard;
      seat: number;
      placedRight: boolean;
      winner: number | null;
      stolen: boolean;
      earned: number;
    };

export type MoveResult =
  | { ok: true; view: TogetherView; summary: TurnSummary | null }
  | { ok: false; problem: "verouderd" | "mislukt" };

type Move = (
  state: TogetherState,
  game: Game<TogetherState>,
  card: () => Promise<RevealedCard>,
) => Promise<{ state: TogetherState; summary: TurnSummary | null }>;

// Loads the game, makes one move and saves it only if nobody moved in the meantime. `moves` is
// the move the phone saw: a stale page gets "verouderd" and reloads the game where it is.
async function play(gameId: string, moves: number, move: Move): Promise<MoveResult> {
  if (!Number.isInteger(moves)) return { ok: false, problem: "mislukt" };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  if (!playerId) return { ok: false, problem: "mislukt" };

  try {
    const game = await loadGame<TogetherState>(supabase, gameId);
    if (!game || game.owner_id !== playerId || game.mode !== "pass_and_play") return { ok: false, problem: "mislukt" };
    if (game.status !== "active" || game.state.moves !== moves) return { ok: false, problem: "verouderd" };
    const songId = currentSong(game.state);
    if (songId === null) return { ok: false, problem: "verouderd" };

    let result: Awaited<ReturnType<Move>>;
    try {
      result = await move(game.state, game, () => revealedCard(supabase, songId));
    } catch {
      // The rules refused the move: not enough tokens, a taken gap, a wrong step.
      return { ok: false, problem: "mislukt" };
    }
    const over = outcomeOf(result.state) !== "playing";
    const now = new Date().toISOString();
    const { data: saved, error } = await createAdminClient()
      .from("games")
      .update({ state: result.state, updated_at: now, ...(over ? { status: "finished", finished_at: now } : {}) })
      .eq("id", gameId)
      .eq("status", "active")
      .eq("state->>moves", String(moves))
      .select("id");
    if (error) throw error;
    if (saved.length === 0) return { ok: false, problem: "verouderd" };

    const view = await viewOf(supabase, {
      ...game,
      state: result.state,
      status: over ? "finished" : "active",
    });
    return { ok: true, view, summary: result.summary };
  } catch {
    return { ok: false, problem: "mislukt" };
  }
}

// 1 token: the active player hears another song.
export async function skipTogether(gameId: string, moves: number): Promise<MoveResult> {
  return play(gameId, moves, async (state) => ({ state: skipSong(state), summary: { kind: "skip" } }));
}

// 3 tokens: the current song goes onto the active timeline at its right spot.
export async function buyTogether(gameId: string, moves: number): Promise<MoveResult> {
  return play(gameId, moves, async (state, _game, reveal) => {
    const card = await reveal();
    return { state: buyCard(state, card), summary: { kind: "buy", card, seat: state.turn } };
  });
}

// The placement and the steals, saved before the reveal.
export async function lockTogether(gameId: string, moves: number, gap: number, steals: Steal[]): Promise<MoveResult> {
  if (!Array.isArray(steals)) return { ok: false, problem: "mislukt" };
  const clean = steals.map((s) => ({ seat: Number(s?.seat), gap: Number(s?.gap) }));
  return play(gameId, moves, async (state) => ({ state: lockPlacement(state, gap, clean), summary: null }));
}

// The group's taps after the reveal; the card goes to whoever was right.
export async function judgeTogether(gameId: string, moves: number, judgement: Judgement): Promise<MoveResult> {
  const taps = { named: judgement?.named === true, exactYear: judgement?.exactYear === true };
  return play(gameId, moves, async (state, game, reveal) => {
    const card = await reveal();
    const turn = judgeTurn(state, game.variant, card, taps);
    return {
      state: turn.state,
      summary: {
        kind: "judged",
        card,
        seat: state.turn,
        placedRight: turn.placedRight,
        winner: turn.winner,
        stolen: turn.stolen,
        earned: turn.earned,
      },
    };
  });
}
