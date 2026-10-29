// Scores one practice answer and sums up a practice session. Pure functions; the answer
// server action is the only caller that writes points. Rules: issue #7.

import { matchArtist, type CreditedArtist } from "@/lib/matching/match";

export const SESSION_SIZE = 15;
export const ARTIST_POINTS = 2;
export const MAX_POINTS_PER_SONG = 5 + ARTIST_POINTS;

// exact = spot on, close = 1 off, near = 2-3 off, wrong = further off, unknown = "Ken ik niet".
export type YearResult = "exact" | "close" | "near" | "wrong" | "unknown";

export type Answer = {
  // Null for "Ken ik niet".
  guessedYear: number | null;
  artistInput: string;
};

export type Score = {
  // Guessed year minus card year; negative is too early. Null for "Ken ik niet".
  yearDiff: number | null;
  yearResult: YearResult;
  artistCorrect: boolean;
  dontKnow: boolean;
  points: number;
};

export function yearResult(yearDiff: number | null): YearResult {
  if (yearDiff === null) return "unknown";
  const off = Math.abs(yearDiff);
  if (off === 0) return "exact";
  if (off === 1) return "close";
  if (off <= 3) return "near";
  return "wrong";
}

const YEAR_POINTS: Record<YearResult, number> = { exact: 5, close: 3, near: 1, wrong: 0, unknown: 0 };

export function yearPoints(yearDiff: number | null): number {
  return YEAR_POINTS[yearResult(yearDiff)];
}

// "Ken ik niet" scores 0, even if an artist was typed.
export function scoreAnswer(answer: Answer, cardYear: number, artists: CreditedArtist[]): Score {
  if (answer.guessedYear === null) {
    return { yearDiff: null, yearResult: "unknown", artistCorrect: false, dontKnow: true, points: 0 };
  }
  const yearDiff = answer.guessedYear - cardYear;
  const artistCorrect = matchArtist(answer.artistInput, artists);
  return {
    yearDiff,
    yearResult: yearResult(yearDiff),
    artistCorrect,
    dontKnow: false,
    points: yearPoints(yearDiff) + (artistCorrect ? ARTIST_POINTS : 0),
  };
}

export type ScoredAttempt = {
  cardYear: number;
  yearDiff: number | null;
  points: number;
};

export type DecadeScore = {
  // First year of the decade, e.g. 1980.
  decade: number;
  songs: number;
  points: number;
  maxPoints: number;
};

export type SessionSummary = {
  points: number;
  maxPoints: number;
  // Over the answers with a year; null when every song was "Ken ik niet".
  averageYearsOff: number | null;
  decades: DecadeScore[];
};

export function summarise(attempts: ScoredAttempt[]): SessionSummary {
  const withYear = attempts.filter((a) => a.yearDiff !== null);
  const byDecade = new Map<number, DecadeScore>();
  for (const a of attempts) {
    const decade = Math.floor(a.cardYear / 10) * 10;
    const d = byDecade.get(decade) ?? { decade, songs: 0, points: 0, maxPoints: 0 };
    d.songs += 1;
    d.points += a.points;
    d.maxPoints += MAX_POINTS_PER_SONG;
    byDecade.set(decade, d);
  }
  return {
    points: attempts.reduce((sum, a) => sum + a.points, 0),
    maxPoints: attempts.length * MAX_POINTS_PER_SONG,
    averageYearsOff:
      withYear.length === 0
        ? null
        : withYear.reduce((sum, a) => sum + Math.abs(a.yearDiff!), 0) / withYear.length,
    decades: [...byDecade.values()].sort((a, b) => a.decade - b.decade),
  };
}
