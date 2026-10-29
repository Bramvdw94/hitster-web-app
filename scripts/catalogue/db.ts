import type { SupabaseClient } from "@supabase/supabase-js";
import type { ArtistRow, CardRow, EditionRow, Existing, IncomingCard, Plan, SongArtistRow, SongRow } from "./plan";

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
    "id, spotify_track_id, title, card_year, year_source, year_status, playable_nl, cover_url",
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

async function check(step: string, request: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await request;
  if (error) throw new Error(`${step}: ${error.message}`);
}

// Writes only what the plan lists. year_overrides is never touched.
export async function applyPlan(db: SupabaseClient, plan: Plan, now = new Date().toISOString()) {
  if (plan.edition) await check("Writing edition", db.from("editions").upsert(plan.edition, { onConflict: "sku" }));

  for (const part of chunks(plan.artists)) {
    await check("Writing artists", db.from("artists").upsert(part, { onConflict: "id" }));
  }
  for (const part of chunks(plan.songs.map((s) => ({ ...s, checked_at: now })))) {
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
  if (plan.removedCards.length > 0) {
    await check(
      "Removing cards",
      db.from("cards").delete().eq("edition_id", plan.editionId).in("card_number", plan.removedCards),
    );
  }
}
