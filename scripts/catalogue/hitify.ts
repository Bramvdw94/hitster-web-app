import type { YearRow } from "./sources";

// hitify.app lists every card of an edition on one page, as a table of card number, artist, title and year.
// Its terms allow personal, non-commercial use and forbid overloading it, so it is snapshotted once
// (scripts/snapshot-hitify.ts) and never fetched by the app.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const cellText = (html: string) => decode(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

// Rows whose first cell is a card number. A year cell that is empty or not a year gives `year: null`.
export function parseHitifyHtml(html: string): YearRow[] {
  const rows: YearRow[] = [];
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => cellText(cell));
    if (cells.length < 4 || !/^\d+$/.test(cells[0])) continue;

    const year = cells.slice(3).find((cell) => /^\d{4}$/.test(cell));
    rows.push({
      cardNumber: Number.parseInt(cells[0], 10),
      artist: cells[1],
      title: cells[2],
      year: year ? Number.parseInt(year, 10) : null,
    });
  }
  return rows;
}

const csvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

// The same columns as the songseeker CSV, so parseYearCsv reads both.
export function formatYearCsv(rows: YearRow[]): string {
  const lines = rows.map((r) => [String(r.cardNumber), r.artist, r.title, r.year === null ? "" : String(r.year)].map(csvField).join(","));
  return ["Card#,Artist,Title,Year", ...lines].join("\n") + "\n";
}
