import { describe, expect, it } from "vitest";
import type { TimelineCard } from "./state";
import {
  activeWins,
  buyCard,
  cleanNames,
  currentSong,
  judgeTurn,
  lockPlacement,
  outcomeOf,
  resolveSteals,
  rightGap,
  skipSong,
  startTogether,
  stealOrder,
  type Judgement,
  type TogetherState,
} from "./together";

const card = (songId: string, year: number): TimelineCard => ({ songId, year, title: songId, artist: "x" });
const unnamed: Judgement = { named: false, exactYear: false };
const named: Judgement = { named: true, exactYear: false };

// Starting cards first, one per name, then the songs to play.
function game(names: string[], deckYears: number[]): { state: TogetherState; cards: TimelineCard[] } {
  const cards = deckYears.map((year, i) => card(`s${i}`, year));
  return {
    state: startTogether(
      names,
      cards.map((c) => c.songId),
      cards.slice(0, names.length),
    ),
    cards,
  };
}

const years = (state: TogetherState, seat: number) => state.seats[seat].timeline.map((c) => c.year);

describe("cleanNames", () => {
  it("trims names and drops empty ones", () => {
    expect(cleanNames([" Bram ", "", "Anna"])).toEqual(["Bram", "Anna"]);
  });

  it("needs 2 to 8 players", () => {
    expect(cleanNames(["Bram", " "])).toBeNull();
    expect(cleanNames(Array.from({ length: 9 }, (_, i) => `P${i}`))).toBeNull();
  });
});

describe("startTogether", () => {
  it("deals each player a starting card and 2 tokens, and the first name starts", () => {
    const { state } = game(["A", "B", "C"], [1980, 1990, 2000, 1975]);
    expect(state.seats.map((s) => [s.name, s.tokens, s.timeline.length])).toEqual([
      ["A", 2, 1],
      ["B", 2, 1],
      ["C", 2, 1],
    ]);
    expect(state.turn).toBe(0);
    expect(currentSong(state)).toBe("s3");
  });
});

describe("resolveSteals", () => {
  // The active timeline is [1980, 2000]; the card is from 1990, so only gap 1 is right.
  const timeline = [1980, 2000];

  it("gives the card to the active player when they are right", () => {
    expect(resolveSteals(timeline, 1990, { seat: 0, gap: 1, wins: true }, [{ seat: 1, gap: 0 }])).toEqual({
      winner: 0,
      stolen: false,
    });
  });

  it("gives the card to the stealer who is right", () => {
    expect(resolveSteals(timeline, 1990, { seat: 0, gap: 0, wins: false }, [{ seat: 2, gap: 1 }])).toEqual({
      winner: 2,
      stolen: true,
    });
  });

  it("discards the card when nobody is right", () => {
    expect(
      resolveSteals(timeline, 1990, { seat: 0, gap: 0, wins: false }, [
        { seat: 1, gap: 2 },
        { seat: 2, gap: 2 },
      ]),
    ).toEqual({ winner: null, stolen: false });
  });

  it("with two stealers, gives it to the one who is right", () => {
    expect(
      resolveSteals(timeline, 1990, { seat: 0, gap: 2, wins: false }, [
        { seat: 1, gap: 0 },
        { seat: 2, gap: 1 },
      ]),
    ).toEqual({ winner: 2, stolen: true });
  });

  it("with two right stealers next to equal years, the first in play order wins", () => {
    expect(
      resolveSteals([1990, 1990], 1990, { seat: 0, gap: 0, wins: false }, [
        { seat: 2, gap: 1 },
        { seat: 1, gap: 2 },
      ]),
    ).toEqual({ winner: 2, stolen: true });
  });
});

describe("activeWins", () => {
  it("only looks at the placement in Original", () => {
    expect(activeWins("original", true, unnamed)).toBe(true);
    expect(activeWins("original", false, named)).toBe(false);
  });

  it("also needs artist and title in Pro", () => {
    expect(activeWins("pro", true, unnamed)).toBe(false);
    expect(activeWins("pro", true, named)).toBe(true);
  });

  it("also needs the exact year in Expert", () => {
    expect(activeWins("expert", true, named)).toBe(false);
    expect(activeWins("expert", true, { named: true, exactYear: true })).toBe(true);
  });
});

describe("a turn with steals", () => {
  // A: 1980, B: 1970, C: 2010; A's song is from 1990.
  const start = () => game(["A", "B", "C"], [1980, 1970, 2010, 1990, 1960, 2005]);

  it("asks the others in play order, only those with a token", () => {
    const { state } = start();
    expect(stealOrder(state)).toEqual([1, 2]);
    const broke = { ...state, turn: 1, seats: state.seats.map((s, i) => (i === 2 ? { ...s, tokens: 0 } : s)) };
    expect(stealOrder(broke)).toEqual([0]);
  });

  it("spends the stealers' tokens when they steal", () => {
    const { state } = start();
    const locked = lockPlacement(state, 0, [{ seat: 1, gap: 1 }]);
    expect(locked.seats.map((s) => s.tokens)).toEqual([2, 1, 2]);
    expect(locked.locked).toEqual({ gap: 0, steals: [{ seat: 1, gap: 1 }] });
  });

  it("refuses a gap that is already taken, or a seat out of order", () => {
    const { state } = start();
    expect(() => lockPlacement(state, 1, [{ seat: 1, gap: 1 }])).toThrow();
    expect(() => lockPlacement(state, 0, [{ seat: 0, gap: 1 }])).toThrow();
    expect(() =>
      lockPlacement(state, 0, [
        { seat: 2, gap: 1 },
        { seat: 1, gap: 1 },
      ]),
    ).toThrow();
  });

  it("puts a stolen card on the stealer's own timeline and passes the turn", () => {
    const { state, cards } = start();
    const locked = lockPlacement(state, 0, [{ seat: 1, gap: 1 }]);
    const turn = judgeTurn(locked, "original", cards[3], unnamed);
    expect(turn).toMatchObject({ placedRight: false, winner: 1, stolen: true, earned: 0 });
    expect(years(turn.state, 0)).toEqual([1980]);
    expect(years(turn.state, 1)).toEqual([1970, 1990]);
    expect(turn.state.turn).toBe(1);
    expect(turn.state.locked).toBeNull();
    expect(currentSong(turn.state)).toBe("s4");
  });

  it("keeps the card for a right active player, and the stealer's token is gone", () => {
    const { state, cards } = start();
    const locked = lockPlacement(state, 1, [{ seat: 2, gap: 0 }]);
    const turn = judgeTurn(locked, "original", cards[3], named);
    expect(turn).toMatchObject({ placedRight: true, winner: 0, stolen: false, earned: 1 });
    expect(years(turn.state, 0)).toEqual([1980, 1990]);
    expect(turn.state.seats.map((s) => s.tokens)).toEqual([3, 2, 1]);
  });

  it("discards the card when nobody is right", () => {
    const { state, cards } = start();
    const turn = judgeTurn(lockPlacement(state, 0, []), "original", cards[3], unnamed);
    expect(turn.winner).toBeNull();
    expect(turn.state.seats.map((s) => s.timeline.length)).toEqual([1, 1, 1]);
  });

  it("in Pro, a right placement without artist and title is lost, also to a right stealer", () => {
    const { state, cards } = game(["A", "B"], [1990, 1970, 1990, 2000]);
    // A's timeline is [1990] and the card is 1990: both gaps are right.
    const turn = judgeTurn(lockPlacement(state, 0, [{ seat: 1, gap: 1 }]), "pro", cards[2], unnamed);
    expect(turn).toMatchObject({ placedRight: true, winner: 1, stolen: true });
    const alone = judgeTurn(lockPlacement(state, 0, []), "pro", cards[2], unnamed);
    expect(alone.winner).toBeNull();
  });
});

describe("tokens", () => {
  it("earns 1 for artist and title, never above 5", () => {
    const { state, cards } = game(["A", "B"], [1980, 1970, 1990]);
    const full = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, tokens: 5 } : s)) };
    const turn = judgeTurn(lockPlacement(full, 1, []), "original", cards[2], named);
    expect(turn.earned).toBe(0);
    expect(turn.state.seats[0].tokens).toBe(5);
  });

  it("skips for 1 token, and the same player hears the next song", () => {
    const { state } = game(["A", "B"], [1980, 1970, 1990, 2000]);
    const skipped = skipSong(state);
    expect(skipped.seats[0].tokens).toBe(1);
    expect(skipped.turn).toBe(0);
    expect(currentSong(skipped)).toBe("s3");
    expect(() => skipSong({ ...skipped, seats: skipped.seats.map((s) => ({ ...s, tokens: 0 })) })).toThrow();
  });

  it("buys for 3 tokens: the card goes to its right spot and the turn passes", () => {
    const { state, cards } = game(["A", "B"], [1980, 1970, 1975, 2000]);
    expect(() => buyCard(state, cards[2])).toThrow();
    const rich = { ...state, seats: state.seats.map((s, i) => (i === 0 ? { ...s, tokens: 3 } : s)) };
    const bought = buyCard(rich, cards[2]);
    expect(years(bought, 0)).toEqual([1975, 1980]);
    expect(bought.seats[0].tokens).toBe(0);
    expect(bought.turn).toBe(1);
  });
});

describe("winning", () => {
  it("wins on the spot at 10 cards, also by a steal", () => {
    const { state, cards } = game(["A", "B"], [2000, 1900, 1950]);
    // B has 9 cards before 1950.
    const nine = Array.from({ length: 9 }, (_, i) => card(`b${i}`, 1900 + i));
    const almost = { ...state, seats: state.seats.map((s, i) => (i === 1 ? { ...s, timeline: nine } : s)) };
    const turn = judgeTurn(lockPlacement(almost, 1, [{ seat: 1, gap: 0 }]), "original", cards[2], unnamed);
    expect(turn.winner).toBe(1);
    expect(turn.outcome).toBe("won");
    expect(turn.state.winner).toBe(1);
    expect(() => skipSong(turn.state)).toThrow();
  });

  it("ends without a winner when the deck runs out", () => {
    const { state, cards } = game(["A", "B"], [1980, 1970, 1990]);
    const turn = judgeTurn(lockPlacement(state, 0, []), "original", cards[2], unnamed);
    expect(outcomeOf(turn.state)).toBe("deck_empty");
  });
});

describe("rightGap", () => {
  it("finds where a year fits", () => {
    expect(rightGap([], 1990)).toBe(0);
    expect(rightGap([1980, 2000], 1990)).toBe(1);
    expect(rightGap([1980, 2000], 2010)).toBe(2);
  });
});

describe("a whole game", () => {
  it("plays 3 players with a steal to a winner", () => {
    // Starting cards 1900, 1901, 1902; then songs 1950, 1951, ... so the last gap is always right.
    const { state: start, cards } = game(
      ["A", "B", "C"],
      [1900, 1901, 1902, ...Array.from({ length: 60 }, (_, i) => 1950 + i)],
    );
    let state = start;
    let steals = 0;
    for (let i = 3; outcomeOf(state) === "playing"; i++) {
      const seat = state.turn;
      const last = state.seats[seat].timeline.length;
      // B steals A's first song: A puts it at the front (wrong), B takes the last gap (right).
      const turn =
        i === 3
          ? judgeTurn(lockPlacement(state, 0, [{ seat: 1, gap: last }]), "original", cards[i], unnamed)
          : judgeTurn(lockPlacement(state, last, []), "original", cards[i], named);
      if (turn.stolen) steals++;
      state = turn.state;
    }
    expect(steals).toBe(1);
    expect(state.winner).toBe(1);
    expect(state.seats[1].timeline).toHaveLength(10);
    expect(state.seats.map((s) => s.timeline.length)).toEqual([8, 10, 8]);
  });
});
