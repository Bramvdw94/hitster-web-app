// Spotify access tokens live an hour. The server refreshes them a little early,
// so the browser never gets a token that dies halfway through a song.
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

export function needsRefresh(expiresAt: Date, now: Date, marginMs = REFRESH_MARGIN_MS): boolean {
  return expiresAt.getTime() - now.getTime() <= marginMs;
}

export function expiryFrom(now: Date, expiresInSeconds: number): Date {
  return new Date(now.getTime() + expiresInSeconds * 1000);
}

export type RefreshedToken = {
  accessToken: string;
  expiresAt: Date;
  // Spotify sometimes rotates the refresh token; null means keep the stored one.
  refreshToken: string | null;
};

// The player revoked access or the refresh token is gone: they have to log in again.
export class SpotifyLoginExpiredError extends Error {
  constructor(message = "Spotify refresh token is no longer valid") {
    super(message);
    this.name = "SpotifyLoginExpiredError";
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  credentials: { clientId: string; clientSecret: string },
  now: Date,
  fetchFn: typeof fetch = fetch,
): Promise<RefreshedToken> {
  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const response = await fetchFn("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };

  if (!response.ok || !body.access_token) {
    if (body.error === "invalid_grant") {
      throw new SpotifyLoginExpiredError();
    }
    throw new Error(`Spotify token refresh failed (${response.status}${body.error ? `: ${body.error}` : ""})`);
  }

  return {
    accessToken: body.access_token,
    expiresAt: expiryFrom(now, body.expires_in ?? 3600),
    refreshToken: body.refresh_token ?? null,
  };
}
