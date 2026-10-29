// Snapshots hitify.app's card list of every edition the import reads from hitify into
// data/sources/hitify/<sku>.csv, and records the date in data/sources/hitify/snapshot.json.
// Personal, non-commercial use, as hitify's terms allow: one page every 5 seconds, with a user agent.
//
//   npm run snapshot:hitify [-- --editions aaaa0006,aaaa0011]
//
// Run by the "Snapshot hitify" GitHub Action (hitify is blocked from Claude's container), or locally.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { HITIFY_EDITIONS } from "./catalogue/editions";
import { formatYearCsv, parseHitifyHtml } from "./catalogue/hitify";

const USER_AGENT = "Jaartal/0.1 (private practice app; https://github.com/Bramvdw94/hitster-web-app)";
const DELAY_MS = 5000;
const DIR = "data/sources/hitify";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const index = process.argv.indexOf("--editions");
  const wanted = index >= 0 ? process.argv[index + 1].split(",").map((s) => s.trim()) : null;
  const editions = wanted ? HITIFY_EDITIONS.filter((e) => wanted.includes(e.sku)) : HITIFY_EDITIONS;
  if (wanted && editions.length !== wanted.length) throw new Error(`Unknown hitify edition in ${wanted.join(", ")}`);

  mkdirSync(DIR, { recursive: true });
  const snapshot: Record<string, { url: string; date: string; cards: number; withoutYear: number }> = {};
  const problems: string[] = [];

  for (const [i, edition] of editions.entries()) {
    if (i > 0) await sleep(DELAY_MS);
    const url = `https://hitify.app/en/hitster-editions/${edition.hitifySlug}`;
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
    if (!response.ok) throw new Error(`hitify answered ${response.status} for ${url}`);

    const html = await response.text();
    const rows = parseHitifyHtml(html);
    if (rows.length === 0) throw new Error(`No card rows found on ${url} (${html.length} characters); the page layout changed?`);

    const withoutYear = rows.filter((r) => r.year === null).length;
    console.log(`${edition.name} (${edition.sku}): ${rows.length} of ${edition.cardCount} cards, ${withoutYear} without a year`);
    if (rows.length !== edition.cardCount) problems.push(`${edition.name}: ${rows.length} rows, expected ${edition.cardCount}`);

    writeFileSync(edition.years.file, formatYearCsv(rows));
    snapshot[edition.sku] = { url, date: new Date().toISOString().slice(0, 10), cards: rows.length, withoutYear };
  }

  // Keep the dates of editions this run did not fetch.
  const file = `${DIR}/snapshot.json`;
  const previous: typeof snapshot = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileSync(file, JSON.stringify({ ...previous, ...snapshot }, null, 2) + "\n");

  if (problems.length > 0) console.log(`\nCheck these editions:\n${problems.join("\n")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
