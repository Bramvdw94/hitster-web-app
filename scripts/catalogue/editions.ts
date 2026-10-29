// The editions the catalogue import knows about. Other editions follow in #25.
export type EditionConfig = {
  sku: string;
  name: string;
  cardCount: number;
  isExpansion: boolean;
  // Where the card years come from, relative to the repo root.
  years: { source: "songseeker"; file: string };
};

export const JUMBO_FILE = "data/sources/jumbo/gameset_database.json";

export const EDITIONS: EditionConfig[] = [
  {
    sku: "aaaa0001",
    name: "Original",
    cardCount: 308,
    isExpansion: false,
    years: { source: "songseeker", file: "data/sources/songseeker/hitster-nl.csv" },
  },
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
