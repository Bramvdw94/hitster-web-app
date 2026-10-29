// Leitner boxes: one per player per song, 1 to 5. Pure rules; recordAttempt() in progress.ts
// is the only writer. Rules: issue #24 and GLOSSARY.md (box, known song, weak song).

export const MIN_BOX = 1;
export const KNOWN_BOX = 5;
// Box 1-2 counts as a weak song.
export const WEAK_MAX_BOX = 2;

// A song the player has never seen counts as box 1.
export function boxBefore(stored: number | null | undefined): number {
  return stored ?? MIN_BOX;
}

// At most 1 year off moves the song up a box; anything else, "Ken ik niet" included, sends it
// back to box 1. The artist doesn't count.
export function nextBox(box: number, yearDiff: number | null): number {
  if (yearDiff !== null && Math.abs(yearDiff) <= 1) return Math.min(box + 1, KNOWN_BOX);
  return MIN_BOX;
}

// A solo game placement has no year to judge, so the placement itself counts: right moves the
// song up a box, wrong sends it back to box 1 (#27).
export function nextBoxAfterPlacement(box: number, correct: boolean): number {
  return correct ? Math.min(box + 1, KNOWN_BOX) : MIN_BOX;
}

// Practice sessions until the song is due again: box 1 every session, then 2, 4, 8, 16.
export function dueInterval(box: number): number {
  return 2 ** (box - 1);
}

export type BoxMove = "up" | "down" | "same";

export function boxMove(before: number | null, after: number | null): BoxMove {
  if (before === null || after === null || before === after) return "same";
  return after > before ? "up" : "down";
}
