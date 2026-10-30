import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArtistRow, CardRow, EditionRow, Existing, IncomingCard, Plan, SongArtistRow, SongRow } from "./plan";
import type { StoredTrack } from "./stored";

// PostgREST puts `in` filters in the URL, so long ID lists go in chunks.
const CHUNK = 100;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function selectIn<T>(db: SupabaseClient, table: string, columns: string, column: string, values: string[]) {
  const rows: T[] = [];
  for (const part of chunks([...new Set(values)])) {
    const { data, error } = await db.from(table).select(columns).in(column, part);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    rows.push(...(data as T[]));
  }
  return rows;
}

export async function loadExisting(db: SupabaseClient, sku: string, incoming: IncomingCard[]): Promise<Existing> {
  const { data: edition, error } = await db
    .from("editions")
    .select("id, sku, name, card_count, is_expansion")
    .eq("sku", sku)
    .maybeSingle<EditionRow>();
  if (error) throw new Error(`Reading editions: ${error.message}`);

  const songs = await selectIn<SongRow>(
    db,
    "songs",
    "id, spotify_track_id, title, card_year, year_source, year_status, playable_nl, cover_url, musicbrainz_year, musicbrainz_checked_at",
    "spotify_track_id",
    incoming.map((c) => c.spotifyTrackId),
  );
  const artists = await selectIn<ArtistRow>(
    db,
    "artists",
    "id, spotify_artist_id, name, kind, aliases",
    "spotify_artist_id",
    incoming.flatMap((c) => c.track?.artists.map((a) => a.id) ?? []),
  );
  const songArtists = await selectIn<SongArtistRow>(
    db,
    "song_artists",
    "song_id, artist_id, position",
    "song_id",
    songs.map((s) => s.id),
  );

  let cards: CardRow[] = [];
  if (edition) {
    const result = await db.from("cards").select("edition_id, card_number, song_id").eq("edition_id", edition.id);
    if (result.error) throw new Error(`Reading cards: ${result.error.message}`);
    cards = result.data as CardRow[];
  }

  return { edition, songs, artists, songArtists, cards };
}

// Cover, NL playability and credits as an earlier run stored them, per Spotify track ID.
export async function loadStoredTracks(db: SupabaseClient, trackIds: string[]): Promise<Map<string, StoredTrack>> {
  type Row = { id: string; spotify_track_id: string; cover_url: string | null; playable_nl: boolean; checked_at: string | null };
  const songs = await selectIn<Row>(db, "songs", "id, spotify_track_id, cover_url, playable_nl, checked_at", "spotify_track_id", trackIds);
  const credits = await selectIn<SongArtistRow>(db, "song_artists", "song_id, artist_id, position", "song_id", songs.map((s) => s.id));
  const artists = await selectIn<Pick<ArtistRow, "id" | "spotify_artist_id" | "name">>(
    db,
    "artists",
    "id, spotify_artist_id, name",
    "id",
    credits.map((c) => c.artist_id),
  );
  const artistById = new Map(artists.map((a) => [a.id, a]));

  return new Map(
    songs.map((song) => {
      const credited = credits
        .filter((c) => c.song_id === song.id)
        .sort((a, b) => a.position - b.position)
        .flatMap((c) => {
          const artist = artistById.get(c.artist_id);
          return artist?.spotify_artist_id ? [{ id: artist.spotify_artist_id, name: artist.name }] : [];
        });
      const track = { coverUrl: song.cover_url, artists: credited, playableNl: song.playable_nl };
      return [song.spotify_track_id, { checkedAt: song.checked_at, track }];
    }),
  );
}

async function check(step: string, request: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await request;
  if (error) throw new Error(`${step}: ${error.message}`);
}

// Writes only what the plan lists, plus checked_at for the tracks looked up on Spotify.
// year_overrides is never touched.
export async function applyPlan(
  db: SupabaseClient,
  plan: Plan,
  lookedUp: string[],
  askedMusicbrainz: string[] = [],
  now = new Date().toISOString(),
) {
  if (plan.edition) await check("Writing edition", db.from("editions").upsert(plan.edition, { onConflict: "sku" }));

  for (const part of chunks(plan.artists)) {
    await check("Writing artists", db.from("artists").upsert(part, { onConflict: "id" }));
  }
  for (const part of chunks(plan.songs)) {
    await check("Writing songs", db.from("songs").upsert(part, { onConflict: "spotify_track_id" }));
  }
  for (const part of chunks(plan.replaceArtistsOf)) {
    await check("Clearing credits", db.from("song_artists").delete().in("song_id", part));
  }
  for (const part of chunks(plan.songArtists)) {
    await check("Writing credits", db.from("song_artists").insert(part));
  }
  for (const part of chunks(plan.cards)) {
    await check("Writing cards", db.from("cards").upsert(part, { onConflict: "edition_id,card_number" }));
  }
  for (const part of chunks(lookedUp)) {
    await check("Marking songs checked", db.from("songs").update({ checked_at: now }).in("spotify_track_id", part));
  }
  for (const part of chunks(askedMusicbrainz)) {
    await check(
      "Marking songs checked on MusicBrainz",
      db.from("songs").update({ musicbrainz_checked_at: now }).in("spotify_track_id", part),
    );
  }
  if (plan.removedCards.length > 0) {
    await check(
      "Removing cards",
      db.from("cards").delete().eq("edition_id", plan.editionId).in("card_number", plan.removedCards),
    );
  }
}
