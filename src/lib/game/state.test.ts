import { describe, expect, it } from "vitest";
import {
  currentSong,
  isNewRecord,
  outcomeOf,
  placeCard,
  songsNeeded,
  startSolo,
  type SoloState,
  type TimelineCard,
} from "./state";

const card = (songId: string, year: number): TimelineCard => ({ songId, year, title: songId, artist: "x" });

function game(deckYears: number[]): { state: SoloState; cards: TimelineCard[] } {
  const cards = deckYears.map((year, i) => card(`s${i}`, year));
  return { state: startSolo(cards.map((c) => c.songId), cards[0]), cards };
}

// The gap where `year` fits, so a test can play right every time.
const rightGap = (state: SoloState, year: number) => {
  const i = state.timeline.findIndex((c) => c.year > year);
  return i === -1 ? state.timeline.length : i;
};

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
