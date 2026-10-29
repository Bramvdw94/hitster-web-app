// The Dutch editions the catalogue import knows about. All of them are in Jumbo's database,
// so none needs a playlist copied into Bram's own Spotify account (data/sources/own-playlists.json).
export type YearSourceFile = { source: "songseeker" | "hitify"; file: string };

export type EditionConfig = {
  sku: string;
  name: string;
  cardCount: number;
  isExpansion: boolean;
  // Where the card years come from, relative to the repo root.
  years: YearSourceFile;
};

// Hitify's page for an edition, from which scripts/snapshot-hitify.ts makes data/sources/hitify/<sku>.csv.
export type HitifyEdition = EditionConfig & { hitifySlug: string };

export const JUMBO_FILE = "data/sources/jumbo/gameset_database.json";
export const SONGSEEKER_FILE = "data/sources/songseeker/hitster-nl.csv";
// The edition songseeker's years belong to; other editions check hitify's years against it.
export const SONGSEEKER_SKU = "aaaa0001";

const hitify = (sku: string, name: string, cardCount: number, hitifySlug: string, isExpansion = false): HitifyEdition => ({
  sku,
  name,
  cardCount,
  isExpansion,
  hitifySlug,
  years: { source: "hitify", file: `data/sources/hitify/${sku}.csv` },
});

export const HITIFY_EDITIONS: HitifyEdition[] = [
  hitify("aaaa0069", "Original Refresh", 314, "original-refresh-netherlands"),
  hitify("aaaa0006", "Guilty Pleasures", 334, "guilty-pleasures-netherlands"),
  hitify("aaaa0011", "Summer Party", 308, "summer-party-netherlands"),
  hitify("aaaa0029", "100% NL", 308, "100-nl-netherlands"),
  hitify("aaaa0089", "Top 40 NL", 308, "top-40-nl-netherlands"),
  hitify("aaaa0041", "Celebration", 308, "celebration-netherlands"),
  hitify("aaaa0063", "Battle of the Generations", 420, "battle-of-the-generations-netherlands"),
  hitify("aaaa0078", "Flying Mic", 226, "flying-mic-netherlands"),
  hitify("aaaa0020", "Bingo", 225, "bingo-netherlands"),
  hitify("aaaa0098", "Q-Music Het Foute Uur", 308, "q-music-het-foute-uur-benelux"),
  hitify("aaaa0037", "Christmas", 154, "christmas-expansion-netherlands", true),
  hitify("aaaa0060", "Hip Hop", 154, "hip-hop-expansion-netherlands", true),
  hitify("aaaa0036", "Rock", 154, "rock-expansion-netherlands", true),
  hitify("aaaa0026", "Soundtracks", 154, "soundtracks-expansion-netherlands", true),
];

export const EDITIONS: EditionConfig[] = [
  {
    sku: SONGSEEKER_SKU,
    name: "Original",
    cardCount: 308,
    isExpansion: false,
    years: { source: "songseeker", file: SONGSEEKER_FILE },
  },
  ...HITIFY_EDITIONS,
];

// "all" or a comma-separated list of SKUs.
export function selectEditions(input: string): EditionConfig[] {
  const wanted = input.trim();
  if (wanted === "" || wanted === "all") return EDITIONS;

  const skus = wanted.split(",").map((sku) => sku.trim()).filter(Boolean);
  const unknown = skus.filter((sku) => !EDITIONS.some((e) => e.sku === sku));
  if (unknown.length > 0) {
    throw new Error(`Unknown edition: ${unknown.join(", ")}. Known: ${EDITIONS.map((e) => e.sku).join(", ")}`);
  }
  return EDITIONS.filter((e) => skus.includes(e.sku));
}
