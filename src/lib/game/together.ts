// A pass-and-play game ("Samen") as stored in games.state, and the moves on it. Pure, so tests
// can play a game without a database. Rules: #5 and #29. Nobody types: the group taps whether
// the active player named the song, and these rules only take those taps.

import { fitsGap } from "./placement";
import {
  BUY_COST,
  MAX_TOKENS,
  rightGap,
  SKIP_COST,
  START_TOKENS,
  winsCard,
  WINNING_CARDS,
  type TimelineCard,
  type Variant,
} from "./state";

// The token rules are the solo ones from #28; stealing is the one move solo doesn't have.
export { BUY_COST, MAX_TOKENS, SKIP_COST, START_TOKENS, type Variant };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const MAX_NAME_LENGTH = 20;
export const STEAL_COST = 1;

// A name in this game only, never an account (#16).
export type Seat = {
  name: string;
  tokens: number;
  // Oldest first.
  timeline: TimelineCard[];
};

export type Steal = { seat: number; gap: number };

// The placement and the steals of the turn, saved before the reveal so a reload can't undo them.
export type Locked = { gap: number; steals: Steal[] };

export type TogetherState = {
  // Every song of the game; deck[0..players-1] are the starting cards. No song twice.
  deck: string[];
  // Index in deck of the song that is playing now.
  next: number;
  seats: Seat[];
  // The seat whose turn it is.
  turn: number;
  // Counts every saved move, so a stale page (a double tap, another tab) can be refused.
  moves: number;
  locked: Locked | null;
  // The seat that reached 10 cards first.
  winner: number | null;
};

export type Outcome = "playing" | "won" | "deck_empty";

export type Judgement = {
  // Artist and title both named right, by the group's tap.
  named: boolean;
  // The exact card year named right; only counts in Expert.
  exactYear: boolean;
};

// Trims the names and checks there are 2 to 8; returns null when they don't make a game.
export function cleanNames(names: string[]): string[] | null {
  const cleaned = names.map((n) => n.trim().slice(0, MAX_NAME_LENGTH)).filter((n) => n !== "");
  if (cleaned.length < MIN_PLAYERS || cleaned.length > MAX_PLAYERS) return null;
  return cleaned;
}

// Each player gets a starting card from the top of the deck and 2 tokens; the first name starts.
export function startTogether(names: string[], deck: string[], startingCards: TimelineCard[]): TogetherState {
  if (names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) throw new Error("A game needs 2 to 8 players");
  if (deck.length <= names.length) throw new Error("A game needs a starting card each and at least one song");
  if (startingCards.length !== names.length || startingCards.some((c, i) => c.songId !== deck[i])) {
    throw new Error("The starting cards must be the first songs of the deck, one per player");
  }
  return {
    deck,
    next: names.length,
    seats: names.map((name, i) => ({ name, tokens: START_TOKENS, timeline: [startingCards[i]] })),
    turn: 0,
    moves: 0,
    locked: null,
    winner: null,
  };
}

export function currentSong(state: TogetherState): string | null {
  return state.deck[state.next] ?? null;
}

export function outcomeOf(state: TogetherState): Outcome {
  if (state.winner !== null) return "won";
  if (currentSong(state) === null) return "deck_empty";
  return "playing";
}

function insertAt(timeline: TimelineCard[], gap: number, card: TimelineCard): TimelineCard[] {
  return [...timeline.slice(0, gap), card, ...timeline.slice(gap)];
}

function withSeat(seats: Seat[], index: number, change: (seat: Seat) => Seat): Seat[] {
  return seats.map((seat, i) => (i === index ? change(seat) : seat));
}

function assertPlaying(state: TogetherState, locked: boolean) {
  if (outcomeOf(state) !== "playing") throw new Error("The game is over");
  if ((state.locked !== null) !== locked) throw new Error(locked ? "Nothing placed yet" : "Already placed");
}

// The next song for the next seat.
function nextTurn(state: TogetherState): TogetherState {
  return { ...state, next: state.next + 1, turn: (state.turn + 1) % state.seats.length, locked: null };
}

// Who may steal now, in play order after the active seat: everyone else with a token.
export function stealOrder(state: Pick<TogetherState, "seats" | "turn">): number[] {
  const n = state.seats.length;
  return Array.from({ length: n - 1 }, (_, i) => (state.turn + 1 + i) % n).filter(
    (seat) => state.seats[seat].tokens >= STEAL_COST,
  );
}

// 1 token: the current song is skipped and the same player hears the next one.
export function skipSong(state: TogetherState): TogetherState {
  assertPlaying(state, false);
  const seat = state.seats[state.turn];
  if (seat.tokens < SKIP_COST) throw new Error("Not enough tokens to skip");
  return {
    ...state,
    next: state.next + 1,
    moves: state.moves + 1,
    seats: withSeat(state.seats, state.turn, (s) => ({ ...s, tokens: s.tokens - SKIP_COST })),
  };
}

// 3 tokens: the current song goes straight onto the active timeline at its right spot, and the
// turn passes. A bought tenth card wins.
export function buyCard(state: TogetherState, card: TimelineCard): TogetherState {
  assertPlaying(state, false);
  if (card.songId !== currentSong(state)) throw new Error("That song is not the one playing");
  const seat = state.seats[state.turn];
  if (seat.tokens < BUY_COST) throw new Error("Not enough tokens to buy");
  const gap = rightGap(seat.timeline, card.year);
  const seats = withSeat(state.seats, state.turn, (s) => ({
    ...s,
    tokens: s.tokens - BUY_COST,
    timeline: insertAt(s.timeline, gap, card),
  }));
  const won = seats[state.turn].timeline.length >= WINNING_CARDS;
  return { ...nextTurn({ ...state, seats }), moves: state.moves + 1, winner: won ? state.turn : null };
}

// The active placement and the steals, before the reveal. Every stealer spends a token now and
// needs a gap nobody took yet; it's gone even when they turn out wrong.
export function lockPlacement(state: TogetherState, gap: number, steals: Steal[]): TogetherState {
  assertPlaying(state, false);
  const gaps = state.seats[state.turn].timeline.length + 1;
  const valid = (g: number) => Number.isInteger(g) && g >= 0 && g < gaps;
  if (!valid(gap)) throw new Error("No such gap");

  const allowed = stealOrder(state);
  const taken = new Set([gap]);
  let order = -1;
  for (const steal of steals) {
    const at = allowed.indexOf(steal.seat);
    // In play order, each seat once.
    if (at <= order) throw new Error("That player can't steal now");
    if (!valid(steal.gap) || taken.has(steal.gap)) throw new Error("That gap is taken");
    order = at;
    taken.add(steal.gap);
  }

  let seats = state.seats;
  for (const steal of steals) seats = withSeat(seats, steal.seat, (s) => ({ ...s, tokens: s.tokens - STEAL_COST }));
  return { ...state, seats, moves: state.moves + 1, locked: { gap, steals: steals.map((s) => ({ ...s })) } };
}

// Whether the active player wins the card: the placement fits, plus the group's taps in Pro and
// Expert. Original only looks at the placement.
export function activeWins(variant: Variant, placedRight: boolean, judgement: Judgement): boolean {
  return winsCard(variant, placedRight, {
    artistCorrect: judgement.named,
    titleCorrect: judgement.named,
    yearExact: judgement.exactYear,
  });
}

export type StealResult = {
  // The seat that wins the card, or null when it's discarded.
  winner: number | null;
  // Whether the card came from a steal.
  stolen: boolean;
};

// The right spot wins: the active player first, then the first right stealer in play order.
// Two gaps can both be right only next to equal years.
export function resolveSteals(
  years: number[],
  cardYear: number,
  active: { seat: number; gap: number; wins: boolean },
  steals: Steal[],
): StealResult {
  if (active.wins) return { winner: active.seat, stolen: false };
  const stealer = steals.find((s) => fitsGap(years, s.gap, cardYear));
  return stealer ? { winner: stealer.seat, stolen: true } : { winner: null, stolen: false };
}

export type TurnResult = {
  state: TogetherState;
  // Whether the active placement fitted, whatever the taps said.
  placedRight: boolean;
  winner: number | null;
  stolen: boolean;
  // The token the active player earned by naming artist and title (0 at the cap of 5).
  earned: number;
  outcome: Outcome;
};

// The reveal: the card goes to whoever was right, the active player may earn a token, and the
// turn passes. Reaching 10 cards wins on the spot, also for a stealer.
export function judgeTurn(state: TogetherState, variant: Variant, card: TimelineCard, judgement: Judgement): TurnResult {
  assertPlaying(state, true);
  if (card.songId !== currentSong(state)) throw new Error("That song is not the one playing");
  const locked = state.locked!;
  const years = state.seats[state.turn].timeline.map((c) => c.year);
  const placedRight = fitsGap(years, locked.gap, card.year);
  const { winner, stolen } = resolveSteals(
    years,
    card.year,
    { seat: state.turn, gap: locked.gap, wins: activeWins(variant, placedRight, judgement) },
    locked.steals,
  );

  let seats = state.seats;
  const earned = judgement.named && seats[state.turn].tokens < MAX_TOKENS ? 1 : 0;
  seats = withSeat(seats, state.turn, (s) => ({ ...s, tokens: s.tokens + earned }));
  if (winner !== null) {
    seats = withSeat(seats, winner, (s) => ({
      ...s,
      timeline: insertAt(s.timeline, rightGap(s.timeline, card.year), card),
    }));
  }
  const won = winner !== null && seats[winner].timeline.length >= WINNING_CARDS;
  const next = { ...nextTurn({ ...state, seats }), moves: state.moves + 1, winner: won ? winner : null };
  return { state: next, placedRight, winner, stolen, earned, outcome: outcomeOf(next) };
}
