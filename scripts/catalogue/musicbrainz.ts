import type { ArtistKind } from "./sources";

// Fallback for an artist's kind when Jumbo has no ArtistType.
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

// Only a top hit with the exact name (ignoring case) counts; anything else stays unknown.
// MusicBrainz answers 503 when it is busy, so that is retried rather than read as "unknown".
export async function lookupArtistKind(
  name: string,
  { fetchFn = fetch, maxAttempts = 4, retryDelayMs = 2000 }: { fetchFn?: typeof fetch; maxAttempts?: number; retryDelayMs?: number } = {},
): Promise<ArtistKind | null> {
  const query = encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  let response: Response;
  for (let attempt = 1; ; attempt++) {
    response = await fetchFn(`https://musicbrainz.org/ws/2/artist?query=${query}&limit=1&fmt=json`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if ((response.status !== 503 && response.status !== 429) || attempt >= maxAttempts) break;
    await sleep(retryDelayMs * attempt);
  }
  if (!response.ok) {
    console.log(`MusicBrainz answered ${response.status} for ${name}; kind stays unknown`);
    return null;
  }

  const top = ((await response.json()) as SearchResponse).artists?.[0];
  if (!top || top.name.toLowerCase() !== name.toLowerCase() || (top.score ?? 0) < 90) return null;
  return (top.type && KINDS[top.type]) || null;
}
