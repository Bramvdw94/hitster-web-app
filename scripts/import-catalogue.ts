// Catalogue import: loads editions, cards and songs into Supabase from the snapshots in data/sources/.
// See docs/spec/data-model.md. Run by the "Import catalogue" GitHub Action, or locally:
//
//   SUPABASE_SECRET_KEY=… SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… \
//     npm run import:catalogue -- --editions aaaa0001 [--dry-run]
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { applyPlan, loadExisting } from "./catalogue/db";
import { JUMBO_FILE, selectEditions } from "./catalogue/editions";
import { joinEdition } from "./catalogue/join";
import { lookupArtistKind } from "./catalogue/musicbrainz";
import { artistsNeedingKind, type IncomingCard, planImport } from "./catalogue/plan";
import { buildReport, formatReport } from "./catalogue/report";
import { parseJumbo, parseSongseeker, type ArtistKind } from "./catalogue/sources";
import { fetchTrack, getAppToken } from "./catalogue/spotify";

const DEFAULT_SUPABASE_URL = "https://vijpefspdqpgpffwoxaj.supabase.co";
// Stay well under Spotify's rolling rate limit; 429s are retried anyway.
const SPOTIFY_DELAY_MS = 300;
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
  const token = await getAppToken(clientId, clientSecret);

  for (const config of editions) {
    console.log(`\n${config.name} (${config.sku}): joining sources`);
    const years = parseSongseeker(readFileSync(config.years.file, "utf8"));
    const { cards, withoutTrack } = joinEdition(parseJumbo(jumbo, config.sku), years, config.years.source);

    // Look everything up first, so a Spotify failure aborts before anything is written.
    console.log(`Looking up ${cards.length} tracks on Spotify`);
    const incoming: IncomingCard[] = [];
    for (const card of cards) {
      incoming.push({ ...card, track: await fetchTrack(card.spotifyTrackId, token) });
      if (incoming.length % 50 === 0) console.log(`  ${incoming.length} of ${cards.length}`);
      await sleep(SPOTIFY_DELAY_MS);
    }

    const existing = await loadExisting(db, config.sku, incoming);

    const needKind = artistsNeedingKind(existing, incoming);
    const kinds = new Map<string, ArtistKind>();
    if (needKind.length > 0) console.log(`Looking up ${needKind.length} artist kinds on MusicBrainz`);
    for (const artist of needKind) {
      const kind = await lookupArtistKind(artist.name);
      if (kind) kinds.set(artist.id, kind);
      await sleep(MUSICBRAINZ_DELAY_MS);
    }

    const plan = planImport(config, existing, incoming, kinds);
    if (!dryRun) await applyPlan(db, plan);

    const report = formatReport(buildReport(config, incoming, withoutTrack, plan.changes), { dryRun });
    console.log(`\n${report}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
