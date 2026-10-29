import type { EditionConfig } from "./editions";
import type { Changes, IncomingCard } from "./plan";

export type EditionReport = {
  sku: string;
  name: string;
  expectedCards: number;
  cards: number;
  withoutTrack: number[];
  withoutYear: number[];
  uncertainYears: number[];
  notOnSpotify: number[];
  notPlayableNl: number[];
  changes: Changes;
};

export function buildReport(
  config: EditionConfig,
  incoming: IncomingCard[],
  withoutTrack: number[],
  changes: Changes,
): EditionReport {
  const numbers = (keep: (card: IncomingCard) => boolean) => incoming.filter(keep).map((c) => c.cardNumber);
  return {
    sku: config.sku,
    name: config.name,
    expectedCards: config.cardCount,
    cards: incoming.length,
    withoutTrack,
    withoutYear: numbers((c) => c.cardYear === null),
    uncertainYears: numbers((c) => c.yearStatus === "uncertain"),
    notOnSpotify: numbers((c) => c.track === null),
    notPlayableNl: numbers((c) => !c.track?.playableNl),
    changes,
  };
}

export function totalChanges(changes: Changes): number {
  return Object.values(changes).reduce((sum, n) => sum + n, 0);
}

const list = (cards: number[]) => (cards.length === 0 ? "0" : `${cards.length} (cards ${cards.join(", ")})`);

export function formatReport(report: EditionReport, { dryRun = false } = {}): string {
  const c = report.changes;
  const changed = totalChanges(c) === 0
    ? "no changes"
    : `${c.editions} edition, ${c.songs} songs, ${c.artists} artists, ${c.songArtists} credits, ${c.cards} cards`;
  return [
    `## ${report.name} (${report.sku})`,
    "",
    `| | |`,
    `|---|---|`,
    `| Cards | ${report.cards} of ${report.expectedCards} |`,
    `| No Spotify track in Jumbo | ${list(report.withoutTrack)} |`,
    `| Songs without a year | ${list(report.withoutYear)} |`,
    `| Uncertain years | ${list(report.uncertainYears)} |`,
    `| Not found on Spotify | ${list(report.notOnSpotify)} |`,
    `| Not playable in NL | ${list(report.notPlayableNl)} |`,
    `| ${dryRun ? "Would change" : "Changed"} | ${changed} |`,
    "",
  ].join("\n");
}
