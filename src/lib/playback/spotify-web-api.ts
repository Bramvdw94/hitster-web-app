"use client";

import { waitBeforeNextCall, type PlaybackProblem } from "./playback";

// Ask the token route again a minute before the token dies.
const TOKEN_MARGIN_MS = 60_000;
// A request that hangs (a phone waking from sleep) must not block the queue for good.
const CALL_TIMEOUT_MS = 10_000;

export class PlaybackProblemError extends Error {
  constructor(readonly problem: PlaybackProblem) {
    super(problem);
  }
}

export function problemOf(error: unknown): PlaybackProblem {
  return error instanceof PlaybackProblemError ? error.problem : "afspelen";
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export function forgetAccessToken() {
  cachedToken = null;
}

// The token route from #19 refreshes on the server; the browser only ever sees access tokens.
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > TOKEN_MARGIN_MS) {
    return cachedToken.accessToken;
  }
  const response = await fetch("/api/spotify/token", {
    cache: "no-store",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch(() => {
    throw new PlaybackProblemError("verbinding");
  });
  if (response.status === 401) throw new PlaybackProblemError("opnieuw_inloggen");
  if (!response.ok) throw new PlaybackProblemError("verbinding");
  const body = (await response.json()) as { accessToken: string; expiresAt: string };
  cachedToken = { accessToken: body.accessToken, expiresAt: new Date(body.expiresAt).getTime() };
  return body.accessToken;
}

let lastSpotifyCallAt: number | null = null;
// Calls wait in line, so two taps never reach Spotify closer than the gap.
let queue: Promise<unknown> = Promise.resolve();

// Every Spotify Web API call in the browser goes through here: at most one per SPOTIFY_CALL_GAP_MS.
export function spotifyCall(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const call = queue.then(async () => {
    const wait = waitBeforeNextCall(lastSpotifyCallAt, Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const accessToken = await getAccessToken();
    lastSpotifyCallAt = Date.now();
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    }).catch(() => {
      throw new PlaybackProblemError("verbinding");
    });
    if (response.status === 401) cachedToken = null;
    return response;
  });
  queue = call.catch(() => {});
  return call;
}

// Turns a failed player call into what the record player shows.
export async function throwPlayerProblem(response: Response, missingDevice: PlaybackProblem): Promise<never> {
  if (response.status === 401) throw new PlaybackProblemError("opnieuw_inloggen");
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { error?: { reason?: string } };
    throw new PlaybackProblemError(body.error?.reason === "PREMIUM_REQUIRED" ? "geen_premium" : "afspelen");
  }
  if (response.status === 429) throw new PlaybackProblemError("te_veel_verzoeken");
  // 404 means Spotify no longer knows the device.
  throw new PlaybackProblemError(response.status === 404 ? missingDevice : "afspelen");
}
