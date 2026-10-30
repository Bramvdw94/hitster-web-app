import { describe, expect, it } from "vitest";
import {
  buyCard,
  canBuy,
  canSkip,
  currentSong,
  isNewRecord,
  outcomeOf,
  MAX_TOKENS,
  placeCard,
  rightGap as gapFor,
  skipSong,
  songsNeeded,
  START_TOKENS,
  startSolo,
  tokensOf,
  winsCard,
  type Naming,
  type SoloState,
  type TimelineCard,
} from "./state";

const card = (songId: string, year: number): TimelineCard => ({ songId, year, title: songId, artist: "x" });

function game(deckYears: number[]): { state: SoloState; cards: TimelineCard[] } {
  const cards = deckYears.map((year, i) => card(`s${i}`, year));
  return { state: startSolo(cards.map((c) => c.songId), cards[0]), cards };
}

// The gap where `year` fits, so a test can play right every time.
const rightGap = (state: SoloState, year: number) => gapFor(state.timeline, year);

const named = (artistCorrect: boolean, titleCorrect: boolean, yearExact = false): Naming => ({
  artistCorrect,
  titleCorrect,
  yearExact,
});

describe("startSolo", () => {
  it("puts the starting card on the timeline and plays the second song", () => {
    const { state } = game([1980, 1990, 2000]);
    expect(state.timeline.map((c) => c.year)).toEqual([1980]);
    expect(currentSong(state)).toBe("s1");
    expect(state.placed).toBe(0);
  });
});

describe("placeCard", () => {
  it("adds a right card to the timeline in order", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    const first = placeCard(state, 0, cards[1]);
    expect(first.correct).toBe(true);
    expect(first.state.timeline.map((c) => c.year)).toEqual([1970, 1980]);
    expect(first.state.placed).toBe(1);
    expect(currentSong(first.state)).toBe("s2");
  });

  it("discards a wrong card but still counts the song", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    const move = placeCard(state, 1, cards[1]);
    expect(move.correct).toBe(false);
    expect(move.state.timeline.map((c) => c.year)).toEqual([1980]);
    expect(move.state.placed).toBe(1);
    expect(move.outcome).toBe("playing");
  });

  it("refuses a song that is not playing", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    expect(() => placeCard(state, 0, cards[2])).toThrow();
  });

  it("refuses a gap that doesn't exist", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    expect(() => placeCard(state, 2, cards[1])).toThrow();
  });

  it("wins at 10 cards and scores the songs placed", () => {
    const years = [1980, 1975, 1960, 1999, 1999, 2010, 1955, 1985, 1985, 2020, 1930, 1940];
    let { state } = game(years);
    const { cards } = game(years);
    // Song 2 (1960) is put in the wrong place on purpose.
    let i = 1;
    let last = placeCard(state, rightGap(state, cards[i].year), cards[i]);
    for (;;) {
      state = last.state;
      if (last.outcome !== "playing") break;
      i++;
      const gap = i === 2 ? state.timeline.length : rightGap(state, cards[i].year);
      last = placeCard(state, gap, cards[i]);
    }
    expect(last.outcome).toBe("won");
    expect(state.timeline).toHaveLength(10);
    expect(state.timeline.map((c) => c.year)).toEqual([...state.timeline.map((c) => c.year)].sort((a, b) => a - b));
    // 9 right placements plus the wrong one.
    expect(songsNeeded(state)).toBe(10);
  });

  it("ends without a score when the deck runs out", () => {
    const { state, cards } = game([1980, 1970]);
    const move = placeCard(state, 1, cards[1]);
    expect(move.outcome).toBe("deck_empty");
    expect(currentSong(move.state)).toBeNull();
    expect(songsNeeded(move.state)).toBeNull();
    expect(outcomeOf(move.state)).toBe("deck_empty");
  });
});

describe("isNewRecord", () => {
  it("counts only fewer songs as a record", () => {
    expect(isNewRecord(12, null)).toBe(true);
    expect(isNewRecord(11, 12)).toBe(true);
    expect(isNewRecord(12, 12)).toBe(false);
    expect(isNewRecord(13, 12)).toBe(false);
  });
});

describe("winsCard", () => {
  it("lets the placement decide in Original", () => {
    expect(winsCard("original", true, named(false, false))).toBe(true);
    expect(winsCard("original", false, named(true, true, true))).toBe(false);
  });

  it("needs artist and title as well in Pro", () => {
    expect(winsCard("pro", true, named(true, true))).toBe(true);
    expect(winsCard("pro", true, named(false, true))).toBe(false);
    expect(winsCard("pro", true, named(true, false))).toBe(false);
    expect(winsCard("pro", false, named(true, true))).toBe(false);
  });

  it("needs the exact year as well in Expert", () => {
    expect(winsCard("expert", true, named(true, true, true))).toBe(true);
    expect(winsCard("expert", true, named(true, true, false))).toBe(false);
    expect(winsCard("expert", true, named(false, true, true))).toBe(false);
    expect(winsCard("expert", false, named(true, true, true))).toBe(false);
  });
});

describe("tokens", () => {
  it("starts with two", () => {
    const { state } = game([1980, 1970, 2000]);
    expect(tokensOf(state)).toBe(START_TOKENS);
    expect(START_TOKENS).toBe(2);
  });

  it("counts a game from before tokens as two", () => {
    const { state } = game([1980, 1970, 2000]);
    expect(tokensOf({ ...state, tokens: undefined })).toBe(2);
  });

  it("earns one for artist and title, even when the placement is wrong", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    const move = placeCard(state, 1, cards[1], "original", named(true, true));
    expect(move.correct).toBe(false);
    expect(move.tokenChange).toBe(1);
    expect(tokensOf(move.state)).toBe(3);
  });

  it("earns nothing for only one of the two", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    expect(placeCard(state, 0, cards[1], "original", named(true, false)).tokenChange).toBe(0);
    expect(placeCard(state, 0, cards[1], "original", named(false, true)).tokenChange).toBe(0);
  });

  it("holds at most five", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    const full = { ...state, tokens: MAX_TOKENS };
    const move = placeCard(full, 0, cards[1], "original", named(true, true));
    expect(move.tokenChange).toBe(0);
    expect(tokensOf(move.state)).toBe(MAX_TOKENS);
  });
});

describe("placeCard in Pro and Expert", () => {
  it("discards a right placement in Pro when the artist is wrong", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    const move = placeCard(state, 0, cards[1], "pro", named(false, true));
    expect(move.correct).toBe(true);
    expect(move.won).toBe(false);
    expect(move.state.timeline.map((c) => c.year)).toEqual([1980]);
    expect(move.state.placed).toBe(1);
  });

  it("keeps the card in Pro when everything is right", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    const move = placeCard(state, 0, cards[1], "pro", named(true, true));
    expect(move.won).toBe(true);
    expect(move.state.timeline.map((c) => c.year)).toEqual([1970, 1980]);
  });

  it("discards the card in Expert when the year is off", () => {
    const { state, cards } = game([1980, 1970, 2000]);
    expect(placeCard(state, 0, cards[1], "expert", named(true, true, false)).won).toBe(false);
    expect(placeCard(state, 0, cards[1], "expert", named(true, true, true)).won).toBe(true);
  });
});

describe("skipSong", () => {
  it("costs one token and plays the next song without placing", () => {
    const { state } = game([1980, 1970, 2000]);
    const skipped = skipSong(state);
    expect(tokensOf(skipped)).toBe(1);
    expect(currentSong(skipped)).toBe("s2");
    expect(skipped.timeline).toEqual(state.timeline);
    expect(skipped.placed).toBe(1);
  });

  it("refuses without a token", () => {
    const { state } = game([1980, 1970, 2000]);
    const broke = { ...state, tokens: 0 };
    expect(canSkip(broke)).toBe(false);
    expect(() => skipSong(broke)).toThrow();
  });

  it("can empty the deck", () => {
    const { state } = game([1980, 1970]);
    expect(outcomeOf(skipSong(state))).toBe("deck_empty");
  });
});

describe("buyCard", () => {
  it("costs three tokens and puts the card at its right spot", () => {
    const { state, cards } = game([1980, 1970, 1990]);
    const rich = { ...state, tokens: 4 };
    const move = buyCard(rich, cards[1]);
    expect(move.won).toBe(true);
    expect(move.tokenChange).toBe(-3);
    expect(tokensOf(move.state)).toBe(1);
    expect(move.state.timeline.map((c) => c.year)).toEqual([1970, 1980]);
    expect(move.gap).toBe(0);
    expect(currentSong(move.state)).toBe("s2");
  });

  it("refuses with fewer than three tokens", () => {
    const { state, cards } = game([1980, 1970, 1990]);
    expect(canBuy(state)).toBe(false);
    expect(() => buyCard(state, cards[1])).toThrow();
  });

  it("refuses a song that is not playing", () => {
    const { state, cards } = game([1980, 1970, 1990]);
    expect(() => buyCard({ ...state, tokens: 3 }, cards[2])).toThrow();
  });

  it("can win the game", () => {
    const { state, cards } = game([1980, 1970, 1990]);
    const nine = { ...state, tokens: 3, timeline: Array.from({ length: 9 }, (_, i) => card(`t${i}`, 1950 + i)) };
    expect(buyCard(nine, cards[1]).outcome).toBe("won");
  });
});
