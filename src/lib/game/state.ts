// A solo game as stored in games.state, and the moves on it. Pure, so tests can play a game
// without a database. Rules: #5 and #27.

import { fitsGap } from "./placement";

export const WINNING_CARDS = 10;
// Enough for any realistic game: even placing half wrong, 10 cards take about 20 songs.
export const DECK_SIZE = 200;

export type TimelineCard = {
  songId: string;
  year: number;
  title: string;
  artist: string;
};

export type SoloState = {
  // Every song of the game in play order; deck[0] is the starting card. No song twice.
  deck: string[];
  // Index in deck of the song that is playing now.
  next: number;
  // Oldest first.
  timeline: TimelineCard[];
  // Songs placed so far, right or wrong. The starting card doesn't count.
  placed: number;
};

export type Outcome = "playing" | "won" | "deck_empty";

export function startSolo(deck: string[], startingCard: TimelineCard): SoloState {
  if (deck.length < 2) throw new Error("A game needs a starting card and at least one song");
  if (deck[0] !== startingCard.songId) throw new Error("The starting card must be the first song of the deck");
  return { deck, next: 1, timeline: [startingCard], placed: 0 };
}

export function currentSong(state: SoloState): string | null {
  return state.deck[state.next] ?? null;
}

export type Placement = {
  state: SoloState;
  correct: boolean;
  // Where the card was put in the timeline before the move, for the reveal.
  gap: number;
  outcome: Outcome;
};

// Places the current song at `gap`. A right card joins the timeline; a wrong one is discarded.
// The game ends at 10 cards, or when the deck has no songs left.
export function placeCard(state: SoloState, gap: number, card: TimelineCard): Placement {
  if (card.songId !== currentSong(state)) throw new Error("That song is not the one playing");
  const years = state.timeline.map((c) => c.year);
  if (!Number.isInteger(gap) || gap < 0 || gap > years.length) throw new Error("No such gap");

  const correct = fitsGap(years, gap, card.year);
  const timeline = correct ? [...state.timeline.slice(0, gap), card, ...state.timeline.slice(gap)] : state.timeline;
  const next: SoloState = { ...state, next: state.next + 1, timeline, placed: state.placed + 1 };
  return { state: next, correct, gap, outcome: outcomeOf(next) };
}

export function outcomeOf(state: SoloState): Outcome {
  if (state.timeline.length >= WINNING_CARDS) return "won";
  if (currentSong(state) === null) return "deck_empty";
  return "playing";
}

// The solo score: songs placed to reach 10 cards, lower is better. Null when not won.
export function songsNeeded(state: SoloState): number | null {
  return outcomeOf(state) === "won" ? state.placed : null;
}

// A personal best is beaten only by fewer songs, not by the same number.
export function isNewRecord(score: number, previousBest: number | null): boolean {
  return previousBest === null || score < previousBest;
}
