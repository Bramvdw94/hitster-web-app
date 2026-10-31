// Zoekhulp: suggestions while typing an artist or title. Pure functions, so they run on the
// phone without a request per letter. A suggestion only fills the field; judging stays with
// src/lib/matching/match.ts, so Zoekhulp never changes points, tokens or records.

import { normalise, similarity } from "@/lib/matching/match";

// Fewer letters than this shows nothing, so the help never hands you the answer for free.
export const MIN_LETTERS = 3;
export const MAX_SUGGESTIONS = 4;

// From this many letters a typo still finds something ("dier" finds "Dire Straits").
const FUZZY_FROM = 4;
const FUZZY_THRESHOLD = 0.75;

export type Entry = { name: string; key: string; words: string[] };

// Normalises a list once, dropping names that normalise to the same text.
export function prepare(names: string[]): Entry[] {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  for (const name of names) {
    const key = normalise(name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    entries.push({ name, key, words: key.split(" ") });
  }
  return entries;
}

function rank(query: string, entry: Entry): number {
  const { key, words } = entry;
  if (key.startsWith(query)) return 4;
  if (words.some((_, i) => words.slice(i).join(" ").startsWith(query))) return 3;
  if (key.replace(/ /g, "").includes(query.replace(/ /g, ""))) return 2;
  if (query.replace(/ /g, "").length < FUZZY_FROM) return 0;
  // A typo: compare with the start of the name, or of any word, at the typed length.
  const starts = [key, ...words.slice(1).map((_, i) => words.slice(i + 1).join(" "))];
  const close = starts.some((s) => similarity(query, s.slice(0, query.length)) >= FUZZY_THRESHOLD);
  return close ? 1 : 0;
}

// Best matches first: whole name starts with it, then a word does, then anywhere, then typos.
export function suggest(input: string, entries: Entry[], max = MAX_SUGGESTIONS): string[] {
  const query = normalise(input);
  if (query.replace(/ /g, "").length < MIN_LETTERS) return [];
  return entries
    .map((entry) => ({ entry, score: rank(query, entry) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.key.length - b.entry.key.length || a.entry.key.localeCompare(b.entry.key))
    .slice(0, max)
    .map((hit) => hit.entry.name);
}

// How many letters are still needed before suggestions show, or 0.
export function lettersToGo(input: string): number {
  const typed = normalise(input).replace(/ /g, "").length;
  return typed === 0 ? 0 : Math.max(0, MIN_LETTERS - typed);
}
