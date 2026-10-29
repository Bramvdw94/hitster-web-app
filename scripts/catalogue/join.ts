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
};

// Join on card number: the Spotify track from Jumbo, artist, title and year from the year list.
// A Jumbo card without a year row has no title, so it cannot become a song either.
export function joinEdition(jumbo: JumboCard[], years: YearRow[], yearSource: YearSource): JoinResult {
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
      yearStatus: row.year === null ? "missing" : yearSource === "songseeker" ? "certain" : "uncertain",
      artistKind: track.artistKind,
    });
  }

  return { cards, withoutTrack };
}
