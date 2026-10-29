// What the record player shows, kept free of the Spotify SDK so it can be tested.
// The state never holds the title, artist or cover: nothing can leak before the reveal.

export type PlaybackStatus = "verbinden" | "klaar" | "starten" | "speelt" | "pauze" | "fout";

export type PlaybackProblem =
  | "verbinding" // the player did not connect or dropped
  | "afspelen" // a song did not start
  | "browser" // this browser cannot run the SDK
  | "geen_premium"
  | "opnieuw_inloggen";

export type PlaybackState = {
  status: PlaybackStatus;
  problem: PlaybackProblem | null;
  positionMs: number;
  durationMs: number;
  // When positionMs was measured (ms since epoch), to count on while playing.
  measuredAt: number;
};

export type PlaybackEvent =
  | { type: "verbinden" }
  | { type: "klaar" }
  | { type: "starten" }
  | { type: "stand"; paused: boolean; positionMs: number; durationMs: number; at: number }
  | { type: "fout"; problem: PlaybackProblem };

export const initialPlaybackState: PlaybackState = {
  status: "verbinden",
  problem: null,
  positionMs: 0,
  durationMs: 0,
  measuredAt: 0,
};

export function playbackReducer(state: PlaybackState, event: PlaybackEvent): PlaybackState {
  switch (event.type) {
    case "verbinden":
      return { ...initialPlaybackState };
    case "klaar":
      // The SDK also says "ready" after a silent reconnect; only a fresh connect moves on.
      return state.status === "verbinden" ? { ...state, status: "klaar" } : state;
    case "starten":
      if (state.status === "fout" || state.status === "verbinden") return state;
      return { ...state, status: "starten", problem: null, positionMs: 0, measuredAt: 0 };
    case "stand": {
      // Only a song we started counts. A paused stand while starting is the SDK loading it.
      const playing = state.status === "speelt" || state.status === "pauze";
      if (!playing && !(state.status === "starten" && !event.paused)) return state;
      return {
        ...state,
        status: event.paused ? "pauze" : "speelt",
        positionMs: event.positionMs,
        durationMs: event.durationMs,
        measuredAt: event.at,
      };
    }
    case "fout":
      // A missing Premium or an expired login is the real cause; keep it over later noise.
      if (state.status === "fout" && (state.problem === "geen_premium" || state.problem === "opnieuw_inloggen")) {
        return state;
      }
      return { ...state, status: "fout", problem: event.problem };
  }
}

export function problemFromSdkError(event: Spotify.ErrorEvent): PlaybackProblem {
  switch (event) {
    case "initialization_error":
      return "browser";
    case "authentication_error":
      return "opnieuw_inloggen";
    case "account_error":
      return "geen_premium";
    case "playback_error":
      return "afspelen";
  }
}

export const problemMessages: Record<PlaybackProblem, string> = {
  verbinding: "De speler kreeg geen verbinding met Spotify.",
  afspelen: "Het nummer wil niet starten.",
  browser: "Deze browser kan Spotify niet afspelen. Open het nummer in de Spotify-app.",
  geen_premium: "Afspelen in de browser kan alleen met Spotify Premium. Open het nummer in de Spotify-app.",
  opnieuw_inloggen: "Je Spotify-login is verlopen. Log uit en log opnieuw in met Spotify.",
};

// Where the song is now, counting on from the last measurement while it plays.
export function elapsedMs(state: PlaybackState, now: number): number {
  if (state.status === "speelt") {
    const ms = state.positionMs + Math.max(0, now - state.measuredAt);
    return state.durationMs > 0 ? Math.min(ms, state.durationMs) : ms;
  }
  if (state.status === "pauze") return state.positionMs;
  return 0;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function spotifyTrackUri(trackId: string): string {
  return `spotify:track:${trackId}`;
}

export function spotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${encodeURIComponent(trackId)}`;
}

// Bram wants Spotify Web API calls far apart: at most one every 3 seconds.
export const SPOTIFY_CALL_GAP_MS = 3000;

export function waitBeforeNextCall(lastCallAt: number | null, now: number, gapMs = SPOTIFY_CALL_GAP_MS): number {
  if (lastCallAt === null) return 0;
  return Math.max(0, lastCallAt + gapMs - now);
}
