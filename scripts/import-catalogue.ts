// Catalogue import: loads editions, cards and songs into Supabase from the snapshots in data/sources/.
// See docs/spec/data-model.md. Run by the "Import catalogue" GitHub Action, or locally:
//
//   SUPABASE_SECRET_KEY=… SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… \
//     npm run import:catalogue -- --editions aaaa0001,aaaa0006 [--dry-run] [--recheck-spotify]
//
// Every edition with a year list is joined first, so a song printed in several editions gets the
// best year of all of them, whichever editions this run imports. A song no list has a year for
// gets MusicBrainz' first-release year, looked up once and then reused from the database.
//
// Tracks an earlier run checked in the last 30 days are not looked up on Spotify again,
// unless --recheck-spotify is given.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { applyPlan, loadExisting, loadStoredTracks } from "./catalogue/db";
import { EDITIONS, JUMBO_FILE, selectEditions, SONGSEEKER_FILE, SONGSEEKER_SKU } from "./catalogue/editions";
import { bestYears, joinEdition, type JoinResult, songseekerYearsByTrack, withBestYear } from "./catalogue/join";
import { lookupArtistKind, lookupFirstReleaseYear } from "./catalogue/musicbrainz";
import { artistsNeedingKind, type IncomingCard, planImport } from "./catalogue/plan";
import { buildReport, formatReport } from "./catalogue/report";
import { parseJumbo, parseYearCsv, type ArtistKind } from "./catalogue/sources";
import { fetchTrack, getAppToken, type SpotifyTrack } from "./catalogue/spotify";
import { splitByFreshness } from "./catalogue/stored";

const DEFAULT_SUPABASE_URL = "https://vijpefspdqpgpffwoxaj.supabase.co";
// A development-mode app gets a small, unpublished rolling budget, and going over it locks the app
// out for a day. Bram asked to go very slowly: one call every 3 seconds (about 20 a minute).
const SPOTIFY_DELAY_MS = 3000;
const MUSICBRAINZ_DELAY_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requireEnv(...names: string[]): string[] {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  return names.map((name) => process.env[name]!);
}

async function main() {
  const editions = selectEditions(argument("editions") ?? "all");
  const dryRun = process.argv.includes("--dry-run");
  const recheck = process.argv.includes("--recheck-spotify");
  const [secretKey, clientId, clientSecret] = requireEnv(
    "SUPABASE_SECRET_KEY",
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
  );

  if (!existsSync(JUMBO_FILE)) {
    throw new Error(`No Jumbo snapshot at ${JUMBO_FILE}. See data/sources/README.md.`);
  }
  const jumbo = readFileSync(JUMBO_FILE, "utf8");

  const db = createClient(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let token: string | undefined;

  const songseekerYears = songseekerYearsByTrack(
    parseJumbo(jumbo, SONGSEEKER_SKU),
    parseYearCsv(readFileSync(SONGSEEKER_FILE, "utf8")),
  );
  const joined = new Map<string, JoinResult>();
  for (const config of EDITIONS) {
    if (!existsSync(config.years.file)) continue;
    const years = parseYearCsv(readFileSync(config.years.file, "utf8"));
    joined.set(config.sku, joinEdition(parseJumbo(jumbo, config.sku), years, config.years.source, songseekerYears));
  }
  const best = bestYears([...joined.values()].map((j) => j.cards));
  const musicbrainzYears = new Map<string, number | null>();

  for (const config of editions) {
    const join = joined.get(config.sku);
    if (!join) {
      const skipped = `## ${config.name} (${config.sku})\n\nSkipped: no year list at ${config.years.file}. Run the "Snapshot hitify" Action first.\n`;
      console.log(`\n${skipped}`);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${skipped}\n`);
      continue;
    }
    console.log(`\n${config.name} (${config.sku}): ${join.cards.length} cards joined`);
    const cards = join.cards.map((card) => withBestYear(card, best));

    // Look everything up first, so a Spotify failure aborts before anything is written.
    const stored = await loadStoredTracks(db, cards.map((c) => c.spotifyTrackId));
    const { reused, toLookUp } = splitByFreshness(cards, stored, { recheck });
    console.log(`Looking up ${toLookUp.length} tracks on Spotify (${reused.size} checked recently)`);
    const tracks = new Map<string, SpotifyTrack | null>(reused);
    for (const id of toLookUp) {
      token ??= await getAppToken(clientId, clientSecret);
      tracks.set(id, await fetchTrack(id, token));
      if (tracks.size % 50 === 0) console.log(`  ${tracks.size - reused.size} of ${toLookUp.length}`);
      await sleep(SPOTIFY_DELAY_MS);
    }
    let incoming: IncomingCard[] = cards.map((card) => ({ ...card, track: tracks.get(card.spotifyTrackId)! }));

    const existing = await loadExisting(db, config.sku, incoming);

    // Years no list has: an earlier MusicBrainz year is reused, the rest are looked up once per run.
    const storedYears = new Map(
      existing.songs.filter((s) => s.year_source === "musicbrainz").map((s) => [s.spotify_track_id, s.card_year]),
    );
    const toLookUpYear = incoming.filter(
      (c) => c.cardYear === null && !storedYears.has(c.spotifyTrackId) && !musicbrainzYears.has(c.spotifyTrackId),
    );
    if (toLookUpYear.length > 0) console.log(`Looking up ${toLookUpYear.length} years on MusicBrainz`);
    for (const card of toLookUpYear) {
      if (musicbrainzYears.has(card.spotifyTrackId)) continue;
      const artist = card.track?.artists[0]?.name ?? card.cardArtist.split(", ")[0];
      musicbrainzYears.set(card.spotifyTrackId, await lookupFirstReleaseYear(artist, card.title));
      await sleep(MUSICBRAINZ_DELAY_MS);
    }
    incoming = incoming.map((card) => {
      if (card.cardYear !== null) return card;
      const year = storedYears.get(card.spotifyTrackId) ?? musicbrainzYears.get(card.spotifyTrackId) ?? null;
      return year === null ? card : { ...card, cardYear: year, yearSource: "musicbrainz", yearStatus: "uncertain" };
    });

    const needKind = artistsNeedingKind(existing, incoming);
    const kinds = new Map<string, ArtistKind>();
    if (needKind.length > 0) console.log(`Looking up ${needKind.length} artist kinds on MusicBrainz`);
    for (const artist of needKind) {
      const kind = await lookupArtistKind(artist.name);
      if (kind) kinds.set(artist.id, kind);
      await sleep(MUSICBRAINZ_DELAY_MS);
    }

    const plan = planImport(config, existing, incoming, kinds);
    if (!dryRun) await applyPlan(db, plan, toLookUp);

    const report = formatReport(buildReport(config, incoming, join, plan.changes), { dryRun });
    console.log(`\n${report}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
