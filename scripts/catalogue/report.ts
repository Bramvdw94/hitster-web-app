import type { EditionConfig } from "./editions";
import type { Changes, IncomingCard } from "./plan";

export type EditionReport = {
  sku: string;
  name: string;
  expectedCards: number;
  cards: number;
  withoutTrack: number[];
  withoutYearRow: number[];
  withoutYear: number[];
  musicbrainzYears: number[];
  waitingForSpotify: number[];
  uncertainYears: number[];
  notOnSpotify: number[];
  notPlayableNl: number[];
  changes: Changes;
};

export function buildReport(
  config: EditionConfig,
  incoming: IncomingCard[],
  join: { withoutTrack: number[]; withoutYearRow: number[] },
  changes: Changes,
  // Cards left for a later run because the Spotify budget ran out.
  waitingForSpotify: number[] = [],
): EditionReport {
  const numbers = (keep: (card: IncomingCard) => boolean) => incoming.filter(keep).map((c) => c.cardNumber);
  return {
    sku: config.sku,
    name: config.name,
    expectedCards: config.cardCount,
    cards: incoming.length,
    withoutTrack: join.withoutTrack,
    withoutYearRow: join.withoutYearRow,
    withoutYear: numbers((c) => c.cardYear === null),
    musicbrainzYears: numbers((c) => c.yearSource === "musicbrainz"),
    waitingForSpotify,
    uncertainYears: numbers((c) => c.yearStatus === "uncertain"),
    notOnSpotify: numbers((c) => c.track === null),
    notPlayableNl: numbers((c) => !c.track?.playableNl),
    changes,
  };
}

export function totalChanges(changes: Changes): number {
  return Object.values(changes).reduce((sum, n) => sum + n, 0);
}

// Card numbers only while the list stays readable: a hitify edition has hundreds of uncertain years.
const list = (cards: number[]) =>
  cards.length === 0 ? "0" : cards.length > 20 ? String(cards.length) : `${cards.length} (cards ${cards.join(", ")})`;

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
    `| Jumbo cards missing from the year list | ${list(report.withoutYearRow)} |`,
    `| Songs without a year | ${list(report.withoutYear)} |`,
    `| Uncertain years | ${list(report.uncertainYears)} |`,
    `| Years from MusicBrainz | ${list(report.musicbrainzYears)} |`,
    `| Not found on Spotify | ${list(report.notOnSpotify)} |`,
    `| Not playable in NL | ${list(report.notPlayableNl)} |`,
    `| Waiting for a later run (Spotify budget) | ${list(report.waitingForSpotify)} |`,
    `| ${dryRun ? "Would change" : "Changed"} | ${changed} |`,
    "",
  ].join("\n");
}
