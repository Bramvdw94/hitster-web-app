// Decides whether a typed artist or title counts as correct. Pure functions, shared by
// practice mode and solo game mode. Calibration and reasoning: issue #4 and #7.

export type CreditedArtist = {
  name: string;
  kind: "person" | "group";
  aliases: string[];
};

export const MATCH_THRESHOLD = 0.8;

// Letters that NFKD leaves alone, so stripping accents does not fold them.
const FOLD: Record<string, string> = {
  ø: "o",
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

export function normalise(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => FOLD[c])
    .replace(/\s*[&+]\s*/g, " and ")
    .replace(/\ben\b/g, "and")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^(the|de|het) /, "");
}

// Optimal string alignment distance: Levenshtein plus swapping two adjacent letters.
function osa(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Takes normalised strings and compares them with spaces removed ("doemaar" = "doe maar").
export function similarity(a: string, b: string): number {
  const x = a.replace(/ /g, "");
  const y = b.replace(/ /g, "");
  const longest = Math.max(x.length, y.length);
  return longest === 0 ? 1 : 1 - osa(x, y) / longest;
}

// Runs on normalised text, so "&", "+" and "en" have already become "and".
const ARTIST_SPLIT = /\s*\b(?:feat|ft|featuring|with|met|vs|x|and)\b\s*/;

function surname(artist: CreditedArtist): string | undefined {
  if (artist.kind !== "person") return undefined;
  const words = normalise(artist.name)
    .split(" ")
    .filter((w) => w !== "jr" && w !== "sr");
  return words.length > 1 ? words[words.length - 1] : undefined;
}

function matchesAny(parts: string[], candidates: string[]): boolean {
  return parts.some((p) => candidates.some((c) => similarity(p, c) >= MATCH_THRESHOLD));
}

export function matchArtist(guess: string, artists: CreditedArtist[]): boolean {
  const whole = normalise(guess);
  if (whole === "") return false;

  // The whole guess is tried too, so "earth wind and fire" survives the split on "and".
  const split = normalise(guess.replace(/[,;/]/g, " and ")).split(ARTIST_SPLIT);
  const parts = [whole, ...split.map(normalise)].filter((p) => p !== "");
  const candidates = [
    artists.map((a) => a.name).join(", "),
    ...artists.flatMap((a) => [a.name, ...a.aliases]),
  ].map(normalise);
  const surnames = artists.map(surname).filter((s): s is string => s !== undefined);

  return matchesAny(parts, [...candidates, ...surnames]);
}

const TITLE_SUFFIXES = [
  /\s+-\s+.*\bremaster(ed)?\b.*$/i,
  /\s+-\s+radio edit\b.*$/i,
  /\s*[([][^)\]]*\bremaster(ed)?\b[^)\]]*[)\]]/gi,
  /\s*[([]radio edit[)\]]/gi,
  /\s*[([](feat|ft)\b[^)\]]*[)\]]/gi,
];

export function stripTitleSuffixes(title: string): string {
  return TITLE_SUFFIXES.reduce((t, suffix) => t.replace(suffix, ""), title).trim();
}

// A long title is distinctive, so it may take one typo more: "the rthymn of the night"
// (4 edits in 16 letters) passes, while short look-alikes such as "titanium" for
// "Titanic" still fail.
const LONG_TITLE = 12;
const LONG_TITLE_THRESHOLD = 0.75;

export function matchTitle(guess: string, title: string): boolean {
  const g = normalise(stripTitleSuffixes(guess));
  if (g === "") return false;
  const t = normalise(stripTitleSuffixes(title));
  const threshold = t.replace(/ /g, "").length >= LONG_TITLE ? LONG_TITLE_THRESHOLD : MATCH_THRESHOLD;
  return similarity(g, t) >= threshold;
}
