// A solo game as stored in games.state, and the moves on it. Pure, so tests can play a game
// without a database. Rules: #5, #27 and #28 (tokens, variants).

import { fitsGap } from "./placement";

export const WINNING_CARDS = 10;
export const START_TOKENS = 2;
export const MAX_TOKENS = 5;
export const SKIP_COST = 1;
export const BUY_COST = 3;
// Enough for any realistic game: even placing half wrong, 10 cards take about 20 songs.
export const DECK_SIZE = 200;

export type TimelineCard = {
  songId: string;
  year: number;
  title: string;
  artist: string;
};

export type Variant = "original" | "pro" | "expert";

export const VARIANT_NAMES: Record<Variant, string> = { original: "Original", pro: "Pro", expert: "Expert" };

export type SoloState = {
  // Every song of the game in play order; deck[0] is the starting card. No song twice.
  deck: string[];
  // Index in deck of the song that is playing now.
  next: number;
  // Oldest first.
  timeline: TimelineCard[];
  // Songs played so far: placed (right or wrong), skipped or bought. The starting card doesn't
  // count. Also the turn number the server guards on.
  placed: number;
  // Missing in games started before #28, which count as START_TOKENS.
  tokens?: number;
};

export type Outcome = "playing" | "won" | "deck_empty";

export function startSolo(deck: string[], startingCard: TimelineCard): SoloState {
  if (deck.length < 2) throw new Error("A game needs a starting card and at least one song");
  if (deck[0] !== startingCard.songId) throw new Error("The starting card must be the first song of the deck");
  return { deck, next: 1, timeline: [startingCard], placed: 0, tokens: START_TOKENS };
}

export function tokensOf(state: SoloState): number {
  return state.tokens ?? START_TOKENS;
}

export function currentSong(state: SoloState): string | null {
  return state.deck[state.next] ?? null;
}

// What the player typed before placing, already checked against the card. `yearExact` only
// matters in Expert.
export type Naming = { artistCorrect: boolean; titleCorrect: boolean; yearExact: boolean };

const NOTHING_NAMED: Naming = { artistCorrect: false, titleCorrect: false, yearExact: false };

// Original: the placement decides. Pro: also artist and title. Expert: also the exact year.
export function winsCard(variant: Variant, placedRight: boolean, naming: Naming): boolean {
  if (!placedRight) return false;
  if (variant === "original") return true;
  const named = naming.artistCorrect && naming.titleCorrect;
  return variant === "pro" ? named : named && naming.yearExact;
}

// Naming both artist and title earns a token in every variant, up to MAX_TOKENS.
export function tokensEarned(state: SoloState, naming: Naming): number {
  return naming.artistCorrect && naming.titleCorrect && tokensOf(state) < MAX_TOKENS ? 1 : 0;
}

export type Placement = {
  state: SoloState;
  // Whether the card fitted where it was put.
  correct: boolean;
  // Whether it joined the timeline; in Pro and Expert that takes the naming too.
  won: boolean;
  // Where the card was put in the timeline before the move, for the reveal.
  gap: number;
  // Token change of this move: +1, 0, or minus the cost of a skip or buy.
  tokenChange: number;
  outcome: Outcome;
};

function checkTurn(state: SoloState, card: TimelineCard) {
  if (card.songId !== currentSong(state)) throw new Error("That song is not the one playing");
}

function insertAt(timeline: TimelineCard[], gap: number, card: TimelineCard): TimelineCard[] {
  return [...timeline.slice(0, gap), card, ...timeline.slice(gap)];
}

// The gap where a card goes when it is bought: after every card with the same or an older year.
export function rightGap(timeline: TimelineCard[], year: number): number {
  const i = timeline.findIndex((c) => c.year > year);
  return i === -1 ? timeline.length : i;
}

// Places the current song at `gap`. A won card joins the timeline; otherwise it is discarded.
// The game ends at 10 cards, or when the deck has no songs left. Without a variant, Original
// with nothing named.
export function placeCard(
  state: SoloState,
  gap: number,
  card: TimelineCard,
  variant: Variant = "original",
  naming: Naming = NOTHING_NAMED,
): Placement {
  checkTurn(state, card);
  const years = state.timeline.map((c) => c.year);
  if (!Number.isInteger(gap) || gap < 0 || gap > years.length) throw new Error("No such gap");

  const correct = fitsGap(years, gap, card.year);
  const won = winsCard(variant, correct, naming);
  const tokenChange = tokensEarned(state, naming);
  const next: SoloState = {
    ...state,
    next: state.next + 1,
    timeline: won ? insertAt(state.timeline, gap, card) : state.timeline,
    placed: state.placed + 1,
    tokens: tokensOf(state) + tokenChange,
  };
  return { state: next, correct, won, gap, tokenChange, outcome: outcomeOf(next) };
}

export function canSkip(state: SoloState): boolean {
  return tokensOf(state) >= SKIP_COST;
}

export function canBuy(state: SoloState): boolean {
  return tokensOf(state) >= BUY_COST;
}

// Spends a token to skip the current song: no placement, the next song plays. It still counts
// as a song for the score.
export function skipSong(state: SoloState): SoloState {
  if (currentSong(state) === null) throw new Error("No song is playing");
  if (!canSkip(state)) throw new Error("Not enough tokens to skip");
  return { ...state, next: state.next + 1, placed: state.placed + 1, tokens: tokensOf(state) - SKIP_COST };
}

// Spends three tokens to put the current song straight onto the timeline at its right spot.
export function buyCard(state: SoloState, card: TimelineCard): Placement {
  checkTurn(state, card);
  if (!canBuy(state)) throw new Error("Not enough tokens to buy");
  const gap = rightGap(state.timeline, card.year);
  const next: SoloState = {
    ...state,
    next: state.next + 1,
    timeline: insertAt(state.timeline, gap, card),
    placed: state.placed + 1,
    tokens: tokensOf(state) - BUY_COST,
  };
  return { state: next, correct: true, won: true, gap, tokenChange: -BUY_COST, outcome: outcomeOf(next) };
}

export function outcomeOf(state: SoloState): Outcome {
  if (state.timeline.length >= WINNING_CARDS) return "won";
  if (currentSong(state) === null) return "deck_empty";
  return "playing";
}

// The solo score: songs played to reach 10 cards, lower is better. Null when not won.
export function songsNeeded(state: SoloState): number | null {
  return outcomeOf(state) === "won" ? state.placed : null;
}

// A personal best is beaten only by fewer songs, not by the same number.
export function isNewRecord(score: number, previousBest: number | null): boolean {
  return previousBest === null || score < previousBest;
}
