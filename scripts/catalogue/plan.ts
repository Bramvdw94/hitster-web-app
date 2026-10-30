import type { EditionConfig } from "./editions";
import type { JoinedCard, YearSource, YearStatus } from "./join";
import type { ArtistKind } from "./sources";
import type { SpotifyTrack } from "./spotify";

// Rows as they are stored in Supabase (see supabase/migrations/*_catalogue.sql).
export type EditionRow = { id: string; sku: string; name: string; card_count: number; is_expansion: boolean };
export type SongRow = {
  id: string;
  spotify_track_id: string;
  title: string;
  card_year: number | null;
  year_source: YearSource | null;
  year_status: YearStatus;
  playable_nl: boolean;
  cover_url: string | null;
};
export type ArtistRow = {
  id: string;
  spotify_artist_id: string | null;
  name: string;
  kind: ArtistKind | null;
  aliases: string[];
};
export type SongArtistRow = { song_id: string; artist_id: string; position: number };
export type CardRow = { edition_id: string; card_number: number; song_id: string };

// What the database holds today for the songs and artists this edition touches.
export type Existing = {
  edition: EditionRow | null;
  songs: SongRow[];
  artists: ArtistRow[];
  songArtists: SongArtistRow[];
  cards: CardRow[];
};

export type IncomingCard = JoinedCard & { track: SpotifyTrack | null };

export type Changes = { editions: number; songs: number; artists: number; songArtists: number; cards: number };

// Only rows that differ from the database. Applying an empty plan writes nothing.
export type Plan = {
  editionId: string;
  edition: EditionRow | null;
  artists: ArtistRow[];
  songs: SongRow[];
  // The credited artists of these songs are replaced by `songArtists`.
  replaceArtistsOf: string[];
  songArtists: SongArtistRow[];
  cards: CardRow[];
  removedCards: number[];
  changes: Changes;
};

const normalise = (name: string) =>
  name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

const sameRow = <T extends object>(a: T, b: T) =>
  (Object.keys(a) as (keyof T)[]).every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));

// Spotify artists that still need a kind from MusicBrainz: no kind stored and no ArtistType from Jumbo.
export function artistsNeedingKind(existing: Existing, incoming: IncomingCard[]): { id: string; name: string }[] {
  const stored = new Map(existing.artists.map((a) => [a.spotify_artist_id, a]));
  const fromJumbo = jumboKinds(incoming);
  const needed = new Map<string, string>();

  for (const card of incoming) {
    for (const artist of card.track?.artists ?? []) {
      if (stored.get(artist.id)?.kind || fromJumbo.has(artist.id)) continue;
      needed.set(artist.id, artist.name);
    }
  }
  return [...needed].map(([id, name]) => ({ id, name }));
}

// Jumbo's ArtistType describes the card's (first) artist.
function jumboKinds(incoming: IncomingCard[]): Map<string, ArtistKind> {
  const kinds = new Map<string, ArtistKind>();
  for (const card of incoming) {
    const first = card.track?.artists[0];
    if (first && card.artistKind && !kinds.has(first.id)) kinds.set(first.id, card.artistKind);
  }
  return kinds;
}

export function planImport(
  config: EditionConfig,
  existing: Existing,
  incoming: IncomingCard[],
  lookedUpKinds: Map<string, ArtistKind> = new Map(),
  newId: () => string = () => crypto.randomUUID(),
): Plan {
  const changes: Changes = { editions: 0, songs: 0, artists: 0, songArtists: 0, cards: 0 };

  // Edition
  const editionId = existing.edition?.id ?? newId();
  const editionRow: EditionRow = {
    id: editionId,
    sku: config.sku,
    name: config.name,
    card_count: config.cardCount,
    is_expansion: config.isExpansion,
  };
  const edition = existing.edition && sameRow(editionRow, existing.edition) ? null : editionRow;
  if (edition) changes.editions++;

  // Artists: a stored kind is kept, so a hand fix survives. Aliases only grow.
  const fromJumbo = jumboKinds(incoming);
  const storedArtists = new Map(existing.artists.map((a) => [a.spotify_artist_id, a]));
  const desiredArtists = new Map<string, ArtistRow>();

  for (const card of incoming) {
    const credited = card.track?.artists ?? [];
    credited.forEach((artist, position) => {
      const current = desiredArtists.get(artist.id) ?? storedArtists.get(artist.id);
      const row: ArtistRow = current
        ? { ...current, aliases: [...current.aliases] }
        : { id: newId(), spotify_artist_id: artist.id, name: artist.name, kind: null, aliases: [] };
      row.name = artist.name;
      row.kind = row.kind ?? (position === 0 ? fromJumbo.get(artist.id) : undefined) ?? lookedUpKinds.get(artist.id) ?? null;

      // The card's spelling of a solo credit, e.g. "Peter Koelewijn en Zijn Rockets", helps matching (#20).
      const cardName = card.cardArtist;
      const known = [row.name, ...row.aliases].map(normalise);
      if (credited.length === 1 && cardName && !known.includes(normalise(cardName))) row.aliases.push(cardName);

      desiredArtists.set(artist.id, row);
    });
  }

  const artists = [...desiredArtists.values()].filter((row) => {
    const stored = storedArtists.get(row.spotify_artist_id);
    return !stored || !sameRow(row, stored);
  });
  changes.artists = artists.length;

  // Songs: one per Spotify track; the first card of the track wins.
  const storedSongs = new Map(existing.songs.map((s) => [s.spotify_track_id, s]));
  const desiredSongs = new Map<string, SongRow>();
  const creditsBySong = new Map<string, string[]>();

  for (const card of incoming) {
    if (desiredSongs.has(card.spotifyTrackId)) continue;
    const id = storedSongs.get(card.spotifyTrackId)?.id ?? newId();
    desiredSongs.set(card.spotifyTrackId, {
      id,
      spotify_track_id: card.spotifyTrackId,
      title: card.title,
      card_year: card.cardYear,
      year_source: card.yearSource,
      year_status: card.yearStatus,
      playable_nl: card.track?.playableNl ?? false,
      cover_url: card.track?.coverUrl ?? null,
    });
    creditsBySong.set(id, (card.track?.artists ?? []).map((a) => desiredArtists.get(a.id)!.id));
  }

  const songs = [...desiredSongs.values()].filter((row) => {
    const stored = storedSongs.get(row.spotify_track_id);
    return !stored || !sameRow(row, stored);
  });
  changes.songs = songs.length;

  // Credited artists. A song Spotify does not know keeps the credits it had.
  const storedCredits = new Map<string, string[]>();
  for (const row of [...existing.songArtists].sort((a, b) => a.position - b.position)) {
    storedCredits.set(row.song_id, [...(storedCredits.get(row.song_id) ?? []), row.artist_id]);
  }
  const replaceArtistsOf: string[] = [];
  const songArtists: SongArtistRow[] = [];
  for (const [songId, artistIds] of creditsBySong) {
    if (artistIds.length === 0) continue;
    if (JSON.stringify(artistIds) === JSON.stringify(storedCredits.get(songId) ?? [])) continue;
    replaceArtistsOf.push(songId);
    artistIds.forEach((artistId, position) => songArtists.push({ song_id: songId, artist_id: artistId, position }));
  }
  changes.songArtists = replaceArtistsOf.length;

  // Cards
  const storedCards = new Map(existing.cards.map((c) => [c.card_number, c]));
  const cards: CardRow[] = [];
  for (const card of incoming) {
    const songId = desiredSongs.get(card.spotifyTrackId)!.id;
    if (storedCards.get(card.cardNumber)?.song_id === songId) continue;
    cards.push({ edition_id: editionId, card_number: card.cardNumber, song_id: songId });
  }
  const incomingNumbers = new Set(incoming.map((c) => c.cardNumber));
  const removedCards = existing.cards.map((c) => c.card_number).filter((n) => !incomingNumbers.has(n));
  changes.cards = cards.length + removedCards.length;

  return { editionId, edition, artists, songs, replaceArtistsOf, songArtists, cards, removedCards, changes };
}

// A run that stopped before every card's track was known only adds cards; it never removes the rest.
export function keepUnseenCards(plan: Plan): Plan {
  return {
    ...plan,
    removedCards: [],
    changes: { ...plan.changes, cards: plan.changes.cards - plan.removedCards.length },
  };
}
