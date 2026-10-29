// Deals a practice session: due repeats, new songs weighted towards weak decades, then the
// least recently seen songs as filler. Pure and seeded, so tests can pin the outcome. Rules: #24.

import { SESSION_SIZE } from "./scoring";

export type Candidate = {
  id: string;
  cardYear: number;
  // Null when the player has never had this song.
  box: number | null;
  lastSeen: number | null;
  dueAt: number | null;
};

export type DecadeStat = { decade: number; answered: number; close: number };

// Returns a number in [0, 1), like Math.random.
export type Random = () => number;

export const MAX_REPEATS = 8;
// Even a decade the player always gets right keeps some chance of new songs.
const MIN_DECADE_WEIGHT = 0.1;

// mulberry32: small, fast and good enough for shuffling songs.
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

// Weight per decade: 1 minus the share at most 1 year off. A decade without answers gets the
// player's overall share, so with no history at all every decade weighs the same.
export function decadeWeights(stats: DecadeStat[]): (decade: number) => number {
  const byDecade = new Map(stats.filter((s) => s.answered > 0).map((s) => [s.decade, s.close / s.answered]));
  const answered = stats.reduce((sum, s) => sum + s.answered, 0);
  const overall = answered === 0 ? 0 : stats.reduce((sum, s) => sum + s.close, 0) / answered;
  return (decade) => Math.max(MIN_DECADE_WEIGHT, 1 - (byDecade.get(decade) ?? overall));
}

// Weighted sampling without replacement (Efraimidis-Spirakis): highest u^(1/w) wins.
function weightedPick<T>(items: T[], count: number, weight: (item: T) => number, random: Random): T[] {
  return items
    .map((item) => ({ item, key: random() ** (1 / weight(item)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map((k) => k.item);
}

function shuffle<T>(items: T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const byBoxThenDue = (a: Candidate, b: Candidate) => a.box! - b.box! || a.dueAt! - b.dueAt!;
const byLastSeen = (a: Candidate, b: Candidate) => (a.lastSeen ?? -1) - (b.lastSeen ?? -1);

// `session` is the number the new session will get, so a song is due when dueAt <= session.
export function dealSession(
  candidates: Candidate[],
  stats: DecadeStat[],
  session: number,
  random: Random,
  size = SESSION_SIZE,
): string[] {
  const repeats = candidates
    .filter((c) => c.box !== null && c.dueAt !== null && c.dueAt <= session)
    .sort(byBoxThenDue)
    .slice(0, Math.min(MAX_REPEATS, Math.ceil(size / 2)));

  const weight = decadeWeights(stats);
  const fresh = weightedPick(
    candidates.filter((c) => c.box === null),
    size - repeats.length,
    (c) => weight(decadeOf(c.cardYear)),
    random,
  );

  const picked = new Set([...repeats, ...fresh].map((c) => c.id));
  const filler = candidates
    .filter((c) => !picked.has(c.id))
    .sort(byLastSeen)
    .slice(0, size - picked.size);

  return shuffle([...repeats, ...fresh, ...filler], random).map((c) => c.id);
}

// "Oefen mijn zwakke nummers": box 1-2 songs (the candidates are already those), lowest box
// first, then the longest unseen.
export function dealWeakSession(candidates: Candidate[], random: Random, size = SESSION_SIZE): string[] {
  const picked = candidates
    .filter((c) => c.box !== null)
    .sort((a, b) => a.box! - b.box! || byLastSeen(a, b))
    .slice(0, size);
  return shuffle(picked, random).map((c) => c.id);
}
