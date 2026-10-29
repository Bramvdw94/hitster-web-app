import { describe, expect, it } from "vitest";
import type { CreditedArtist } from "@/lib/matching/match";
import { scoreAnswer, summarise, yearPoints, yearResult } from "./scoring";

const hazes: CreditedArtist[] = [{ name: "André Hazes", kind: "person", aliases: [] }];

describe("yearPoints", () => {
  it.each([
    [0, 5],
    [1, 3],
    [-1, 3],
    [2, 1],
    [-3, 1],
    [4, 0],
    [-25, 0],
    [null, 0],
  ])("diff %s scores %i", (diff, points) => {
    expect(yearPoints(diff)).toBe(points);
  });

  it("names the bands", () => {
    expect([0, 1, 3, 4, null].map(yearResult)).toEqual(["exact", "close", "near", "wrong", "unknown"]);
  });
});

describe("scoreAnswer", () => {
  it("scores an exact year with the right artist as 7", () => {
    expect(scoreAnswer({ guessedYear: 1980, artistInput: "andre hazes" }, 1980, hazes)).toEqual({
      yearDiff: 0,
      yearResult: "exact",
      artistCorrect: true,
      dontKnow: false,
      points: 7,
    });
  });

  it("keeps the sign of the year difference", () => {
    expect(scoreAnswer({ guessedYear: 1978, artistInput: "" }, 1980, hazes)).toMatchObject({
      yearDiff: -2,
      yearResult: "near",
      points: 1,
    });
  });

  it("adds 2 for the artist even when the year is far off", () => {
    expect(scoreAnswer({ guessedYear: 1960, artistInput: "Hazes" }, 1980, hazes)).toMatchObject({
      artistCorrect: true,
      points: 2,
    });
  });

  it("gives nothing for a wrong or empty artist", () => {
    expect(scoreAnswer({ guessedYear: 1981, artistInput: "Frans Bauer" }, 1980, hazes)).toMatchObject({
      artistCorrect: false,
      points: 3,
    });
    expect(scoreAnswer({ guessedYear: 1981, artistInput: "  " }, 1980, hazes).artistCorrect).toBe(false);
  });

  it("scores Ken ik niet as 0, whatever was typed", () => {
    expect(scoreAnswer({ guessedYear: null, artistInput: "André Hazes" }, 1980, hazes)).toEqual({
      yearDiff: null,
      yearResult: "unknown",
      artistCorrect: false,
      dontKnow: true,
      points: 0,
    });
  });
});

describe("summarise", () => {
  it("adds up points, years off and decades", () => {
    const summary = summarise([
      { cardYear: 1984, yearDiff: 0, points: 7 },
      { cardYear: 1989, yearDiff: -4, points: 0 },
      { cardYear: 1965, yearDiff: 2, points: 3 },
      { cardYear: 1971, yearDiff: null, points: 0 },
    ]);
    expect(summary.points).toBe(10);
    expect(summary.maxPoints).toBe(28);
    expect(summary.averageYearsOff).toBe(2);
    expect(summary.decades).toEqual([
      { decade: 1960, songs: 1, points: 3, maxPoints: 7 },
      { decade: 1970, songs: 1, points: 0, maxPoints: 7 },
      { decade: 1980, songs: 2, points: 7, maxPoints: 14 },
    ]);
  });

  it("has no average when every song was Ken ik niet", () => {
    expect(summarise([{ cardYear: 1990, yearDiff: null, points: 0 }]).averageYearsOff).toBeNull();
  });
});
