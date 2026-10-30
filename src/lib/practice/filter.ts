// The practice filter: one artist and/or a card-year range (a decade is a range of ten years).
// Shared by Oefenen, "Nog een ronde" and Ontdek, which all carry it as the same three fields:
// `artiest`, `van` and `tot`. Pure, so it is tested without a database.

import { decadeOf } from "./mix";

export type PracticeFilter = {
  artistId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
};

export const NO_FILTER: PracticeFilter = { artistId: null, yearFrom: null, yearTo: null };

const MIN_YEAR = 1800;
const MAX_YEAR = 2100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function year(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

// Reads the fields from a form or the query string. Garbage is dropped, and a range typed the
// wrong way round is turned around. `decennium=1980` and `jaar=1985` are shortcuts for a range.
export function parseFilter(get: (name: string) => unknown): PracticeFilter {
  const artist = get("artiest");
  const artistId = typeof artist === "string" && UUID.test(artist) ? artist : null;

  const decade = year(get("decennium"));
  const single = year(get("jaar"));
  let yearFrom: number | null;
  let yearTo: number | null;
  if (decade !== null) {
    yearFrom = decadeOf(decade);
    yearTo = yearFrom + 9;
  } else if (single !== null) {
    yearFrom = yearTo = single;
  } else {
    yearFrom = year(get("van"));
    yearTo = year(get("tot"));
  }
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom];
  return { artistId, yearFrom, yearTo };
}

export function fromSearchParams(params: Record<string, string | string[] | undefined>): PracticeFilter {
  return parseFilter((name) => {
    const value = params[name];
    return Array.isArray(value) ? value[0] : value;
  });
}

export function isFiltered(filter: PracticeFilter): boolean {
  return filter.artistId !== null || filter.yearFrom !== null || filter.yearTo !== null;
}

// The decade the range is exactly, or null.
export function decadeOfRange(filter: PracticeFilter): number | null {
  const { yearFrom, yearTo } = filter;
  return yearFrom !== null && yearFrom % 10 === 0 && yearTo === yearFrom + 9 ? yearFrom : null;
}

// "80s", "1983", "1983–1987", "vanaf 1990", "tot 1970", or null without a range.
export function rangeLabel(filter: PracticeFilter): string | null {
  const { yearFrom, yearTo } = filter;
  const decade = decadeOfRange(filter);
  if (decade !== null) return `${String(decade % 100).padStart(2, "0")}s`;
  if (yearFrom !== null && yearTo !== null) return yearFrom === yearTo ? `${yearFrom}` : `${yearFrom}–${yearTo}`;
  if (yearFrom !== null) return `vanaf ${yearFrom}`;
  if (yearTo !== null) return `tot ${yearTo}`;
  return null;
}

// The query string for a filter, for links and for "Oefen deze nummers".
export function filterQuery(filter: PracticeFilter): string {
  const params = new URLSearchParams();
  if (filter.artistId) params.set("artiest", filter.artistId);
  if (filter.yearFrom !== null) params.set("van", String(filter.yearFrom));
  if (filter.yearTo !== null) params.set("tot", String(filter.yearTo));
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

// Every decade from the oldest to the newest card year, for the decade buttons.
export function decadesBetween(oldest: number | null, newest: number | null): number[] {
  if (oldest === null || newest === null) return [];
  const out: number[] = [];
  for (let d = decadeOf(oldest); d <= decadeOf(newest); d += 10) out.push(d);
  return out;
}
