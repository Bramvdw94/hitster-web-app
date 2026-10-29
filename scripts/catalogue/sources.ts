// Parsers for the snapshotted sources in data/sources/.

export type ArtistKind = "person" | "group";

export type JumboCard = {
  cardNumber: number;
  spotifyTrackId: string;
  artistKind: ArtistKind | null;
};

export type YearRow = {
  cardNumber: number;
  artist: string;
  title: string;
  year: number | null;
};

type JumboDatabase = {
  gamesets?: {
    sku?: string;
    gameset_data?: {
      cards?: { CardNumber?: string; Spotify?: string; ArtistType?: string }[];
    };
  }[];
};

// Accepts a bare ID, a spotify:track: URI or an open.spotify.com link.
export function spotifyTrackId(value: string): string | null {
  const match = value.trim().match(/(?:^|track[:/])([A-Za-z0-9]{22})(?:$|[?#])/);
  return match ? match[1] : null;
}

export function parseJumbo(json: string, sku: string): JumboCard[] {
  const db = JSON.parse(json) as JumboDatabase;
  const gameset = db.gamesets?.find((g) => g.sku === sku);
  if (!gameset) throw new Error(`Jumbo database has no gameset with SKU ${sku}`);

  return (gameset.gameset_data?.cards ?? []).flatMap((card) => {
    const cardNumber = Number.parseInt(card.CardNumber ?? "", 10);
    const trackId = spotifyTrackId(card.Spotify ?? "");
    if (!Number.isInteger(cardNumber) || cardNumber <= 0 || !trackId) return [];

    const type = card.ArtistType?.toLowerCase();
    const artistKind = type === "solo" ? "person" : type === "group" ? "group" : null;
    return [{ cardNumber, spotifyTrackId: trackId, artistKind }];
  });
}

// RFC 4180: quoted fields may hold commas, newlines and doubled quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

// A year list: the songseeker CSV, or a hitify snapshot written in the same shape (Card#, Artist, Title, Year).
export function parseYearCsv(csv: string): YearRow[] {
  const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ""));
  const col = (name: string) => {
    const index = header.findIndex((h) => h.trim().toLowerCase() === name);
    if (index < 0) throw new Error(`Year list has no "${name}" column`);
    return index;
  };
  const card = col("card#");
  const artist = col("artist");
  const title = col("title");
  const year = col("year");

  return rows.map((r) => {
    const parsedYear = Number.parseInt(r[year] ?? "", 10);
    return {
      cardNumber: Number.parseInt(r[card], 10),
      artist: r[artist].trim(),
      title: r[title].trim(),
      year: Number.isInteger(parsedYear) ? parsedYear : null,
    };
  });
}
