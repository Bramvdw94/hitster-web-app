// Spotify Web API with an app token (client credentials). One track per call:
// the batch endpoint is gone for new apps (research/spotify-playback.md).

export type SpotifyTrack = {
  coverUrl: string | null;
  artists: { id: string; name: string }[];
  playableNl: boolean;
};

type Fetch = typeof fetch;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getAppToken(clientId: string, clientSecret: string, fetchFn: Fetch = fetch): Promise<string> {
  const response = await fetchFn("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`Spotify token request failed: ${response.status} ${await response.text()}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

type TrackResponse = {
  is_playable?: boolean;
  album?: { images?: { url: string; width: number | null }[] };
  artists?: { id: string | null; name: string }[];
};

// Spotify locked the app out; the message says for how long.
export class SpotifyRateLimitError extends Error {}

// A rate limit longer than this aborts the run instead of sleeping through it.
export const MAX_RETRY_AFTER_SECONDS = 120;
const REQUEST_TIMEOUT_MS = 15_000;

// Null when Spotify does not know the track. Retries on 429 after Retry-After, on 5xx and on a timeout.
export async function fetchTrack(
  trackId: string,
  token: string,
  { fetchFn = fetch, maxAttempts = 5 }: { fetchFn?: Fetch; maxAttempts?: number } = {},
): Promise<SpotifyTrack | null> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetchFn(`https://api.spotify.com/v1/tracks/${trackId}?market=NL`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (attempt >= maxAttempts) throw new Error(`Spotify GET /tracks/${trackId} failed: ${String(error)}`);
      console.log(`Spotify did not answer for ${trackId}, retrying`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (response.ok) {
      const track = (await response.json()) as TrackResponse;
      const images = [...(track.album?.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
      return {
        coverUrl: images[0]?.url ?? null,
        artists: (track.artists ?? []).flatMap((a) => (a.id ? [{ id: a.id, name: a.name }] : [])),
        // With a market, Spotify sets is_playable; relinked tracks count as playable.
        playableNl: track.is_playable === true,
      };
    }
    if (response.status === 404 || response.status === 400) return null;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= maxAttempts) {
      throw new Error(`Spotify GET /tracks/${trackId} failed: ${response.status} ${await response.text()}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    if (retryAfter > MAX_RETRY_AFTER_SECONDS) {
      throw new SpotifyRateLimitError(`Spotify rate limit: retry after ${Math.ceil(retryAfter / 60)} minutes.`);
    }
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    console.log(`Spotify answered ${response.status} for ${trackId}, waiting ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
  }
}
