import type { ArtistKind, JumboCard, YearRow } from "./sources";

export type YearSource = "songseeker" | "hitify" | "musicbrainz" | "bram";
export type YearStatus = "certain" | "uncertain" | "missing";

// One card of an edition before the Spotify lookup.
export type JoinedCard = {
  cardNumber: number;
  spotifyTrackId: string;
  title: string;
  cardArtist: string;
  cardYear: number | null;
  yearSource: YearSource | null;
  yearStatus: YearStatus;
  artistKind: ArtistKind | null;
};

export type JoinResult = {
  cards: JoinedCard[];
  // Card numbers in the year list that Jumbo has no Spotify track for. They cannot be played.
  withoutTrack: number[];
  // Jumbo cards the year list has no row for. Without a title they cannot become a song.
  withoutYearRow: number[];
};

// Join on card number: the Spotify track from Jumbo, artist, title and year from the year list.
// Only songseeker's years count as certain. Another source's year is certain only when songseeker
// gives the same track the same year (`songseekerYears`, by Spotify track ID).
export function joinEdition(
  jumbo: JumboCard[],
  years: YearRow[],
  yearSource: YearSource,
  songseekerYears: Map<string, number> = new Map(),
): JoinResult {
  const tracks = new Map(jumbo.map((card) => [card.cardNumber, card]));
  const cards: JoinedCard[] = [];
  const withoutTrack: number[] = [];

  for (const row of [...years].sort((a, b) => a.cardNumber - b.cardNumber)) {
    const track = tracks.get(row.cardNumber);
    if (!track) {
      withoutTrack.push(row.cardNumber);
      continue;
    }
    cards.push({
      cardNumber: row.cardNumber,
      spotifyTrackId: track.spotifyTrackId,
      title: row.title,
      cardArtist: row.artist,
      cardYear: row.year,
      yearSource: row.year === null ? null : yearSource,
      yearStatus:
        row.year === null
          ? "missing"
          : yearSource === "songseeker" || songseekerYears.get(track.spotifyTrackId) === row.year
            ? "certain"
            : "uncertain",
      artistKind: track.artistKind,
    });
  }

  const rowNumbers = new Set(years.map((row) => row.cardNumber));
  const withoutYearRow = jumbo.map((card) => card.cardNumber).filter((n) => !rowNumbers.has(n));
  return { cards, withoutTrack, withoutYearRow };
}

// Songseeker's year per Spotify track, for checking another source's years against.
export function songseekerYearsByTrack(jumbo: JumboCard[], songseeker: YearRow[]): Map<string, number> {
  const { cards } = joinEdition(jumbo, songseeker, "songseeker");
  return new Map(cards.flatMap((c) => (c.cardYear === null ? [] : [[c.spotifyTrackId, c.cardYear] as const])));
}

// How much a card year is trusted. A song printed in several editions takes the best one.
const YEAR_RANK: Record<string, number> = {
  "songseeker/certain": 4,
  "hitify/certain": 3,
  "hitify/uncertain": 2,
  "musicbrainz/uncertain": 1,
};
const yearRank = (card: JoinedCard) => YEAR_RANK[`${card.yearSource}/${card.yearStatus}`] ?? 0;

// The card that gives each Spotify track its title and year, over every edition. Ties go to the
// edition listed first, so the answer does not depend on which editions a run imports.
export function bestYears(editions: JoinedCard[][]): Map<string, JoinedCard> {
  const best = new Map<string, JoinedCard>();
  for (const cards of editions) {
    for (const card of cards) {
      const current = best.get(card.spotifyTrackId);
      if (!current || yearRank(card) > yearRank(current)) best.set(card.spotifyTrackId, card);
    }
  }
  return best;
}

// A card with the title and year of the best card of its track.
export function withBestYear(card: JoinedCard, best: Map<string, JoinedCard>): JoinedCard {
  const from = best.get(card.spotifyTrackId) ?? card;
  const { title, cardYear, yearSource, yearStatus } = from;
  return { ...card, title, cardYear, yearSource, yearStatus };
}
