import type { ArtistKind } from "./sources";

// Fallbacks for an artist's kind when Jumbo has no ArtistType, and for a card year when no list has one.
// MusicBrainz allows one request per second and asks for a descriptive User-Agent.
const USER_AGENT = "Jaartal/0.1 ( https://github.com/Bramvdw94/hitster-web-app )";

const KINDS: Record<string, ArtistKind> = {
  Person: "person",
  Character: "person",
  Group: "group",
  Orchestra: "group",
  Choir: "group",
};

type SearchResponse = { artists?: { name: string; type?: string; score?: number }[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(
  url: string,
  { fetchFn, maxAttempts, retryDelayMs }: { fetchFn: typeof fetch; maxAttempts: number; retryDelayMs: number },
): Promise<Response> {
  let response: Response;
  for (let attempt = 1; ; attempt++) {
    try {
      response = await fetchFn(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    } catch {
      // A network error ("fetch failed") is retried like a busy server, and in the end reads as an
      // unanswered request instead of stopping the whole import.
      response = new Response(null, { status: 599, statusText: "fetch failed" });
    }
    if ((response.status !== 503 && response.status !== 429 && response.status !== 599) || attempt >= maxAttempts) return response;
    await sleep(retryDelayMs * attempt);
  }
}

// Only a top hit with the exact name (ignoring case) counts; anything else stays unknown.
// MusicBrainz answers 503 when it is busy, so that is retried rather than read as "unknown".
export async function lookupArtistKind(
  name: string,
  { fetchFn = fetch, maxAttempts = 4, retryDelayMs = 2000 }: { fetchFn?: typeof fetch; maxAttempts?: number; retryDelayMs?: number } = {},
): Promise<ArtistKind | null> {
  const query = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  const response = await get(`https://musicbrainz.org/ws/2/artist?query=${query}&limit=1&fmt=json`, {
    fetchFn,
    maxAttempts,
    retryDelayMs,
  });
  if (!response.ok) {
    console.log(`MusicBrainz answered ${response.status} for ${name}; kind stays unknown`);
    return null;
  }

  const top = ((await response.json()) as SearchResponse).artists?.[0];
  if (!top || top.name.toLowerCase() !== name.toLowerCase() || (top.score ?? 0) < 90) return null;
  return (top.type && KINDS[top.type]) || null;
}

type RecordingResponse = { recordings?: { title: string; score?: number; "first-release-date"?: string }[] };

const normalise = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Spotify-style titles carry version notes ("Let It Be - Remastered 2009", "Song (feat. X)") that
// MusicBrainz keeps out of the original recording's title.
export function baseTitle(title: string): string {
  return title
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s*[([](feat\.?|ft\.?|with|from|remaster|live|radio|single|version|mono|stereo)\b[^)\]]*[)\]]/gi, "")
    .trim();
}

// The earliest first-release year over recordings with this title by this artist. Remasters,
// live takes and compilations are separate recordings or releases, and a well-known song has
// hundreds of them that all score 100, so one page of hits often misses the original. After the
// first page the search is repeated for recordings released before the earliest year found so
// far, until MusicBrainz has nothing earlier.
// Null when no hit with the same title scores 90 or more; undefined when MusicBrainz could not be
// asked, so the song is asked again next run.
export async function lookupFirstReleaseYear(
  artist: string,
  title: string,
  {
    fetchFn = fetch,
    maxAttempts = 4,
    retryDelayMs = 2000,
    delayMs = 1100,
    maxSearches = 6,
  }: { fetchFn?: typeof fetch; maxAttempts?: number; retryDelayMs?: number; delayMs?: number; maxSearches?: number } = {},
): Promise<number | null | undefined> {
  const wanted = baseTitle(title);
  const clean = (text: string) => text.replace(/"/g, "");
  const base = `recording:"${clean(wanted)}" AND artist:"${clean(artist)}"`;

  let earliest: number | null = null;
  for (let search = 0; search < maxSearches; search++) {
    if (search > 0) await sleep(delayMs);
    const query = earliest === null ? base : `${base} AND firstreleasedate:[0 TO ${earliest - 1}-12-31]`;
    const response = await get(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&limit=100&fmt=json`, {
      fetchFn,
      maxAttempts,
      retryDelayMs,
    });
    if (!response.ok) {
      console.log(`MusicBrainz answered ${response.status} for ${artist} - ${title}; asking again next run`);
      return undefined;
    }

    const years = (((await response.json()) as RecordingResponse).recordings ?? [])
      .filter((r) => (r.score ?? 0) >= 90 && normalise(baseTitle(r.title)) === normalise(wanted))
      .map((r) => Number.parseInt(r["first-release-date"]?.slice(0, 4) ?? "", 10))
      .filter((year) => Number.isInteger(year) && year >= 1800 && (earliest === null || year < earliest));
    if (years.length === 0) break;
    earliest = Math.min(...years);
  }
  return earliest;
}
