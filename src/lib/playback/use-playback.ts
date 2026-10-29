"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  initialPlaybackState,
  playbackReducer,
  problemFromSdkError,
  spotifyTrackUri,
  waitBeforeNextCall,
  type PlaybackProblem,
  type PlaybackState,
} from "./playback";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
// Shown in the Spotify app's device list, so it must say nothing about the song.
const DEVICE_NAME = "Jaartal";
const READY_TIMEOUT_MS = 15_000;
const START_TIMEOUT_MS = 12_000;
// Ask the token route again a minute before the token dies.
const TOKEN_MARGIN_MS = 60_000;

export type Playback = {
  state: PlaybackState;
  // The song last asked for, for the "Open in Spotify" fallback.
  trackId: string | null;
  play: (trackId: string) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  // Throws the player away, connects a new one and starts the song again.
  retry: () => void;
};

class PlaybackProblemError extends Error {
  constructor(readonly problem: PlaybackProblem) {
    super(problem);
  }
}

let sdkLoading: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Spotify) return Promise.resolve();
  sdkLoading ??= new Promise<void>((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onerror = () => {
      sdkLoading = null;
      script.remove();
      reject(new PlaybackProblemError("verbinding"));
    };
    document.body.appendChild(script);
  });
  return sdkLoading;
}

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// The token route from #19 refreshes on the server; the browser only ever sees access tokens.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > TOKEN_MARGIN_MS) {
    return cachedToken.accessToken;
  }
  const response = await fetch("/api/spotify/token", { cache: "no-store" });
  if (response.status === 401) throw new PlaybackProblemError("opnieuw_inloggen");
  if (!response.ok) throw new PlaybackProblemError("verbinding");
  const body = (await response.json()) as { accessToken: string; expiresAt: string };
  cachedToken = { accessToken: body.accessToken, expiresAt: new Date(body.expiresAt).getTime() };
  return body.accessToken;
}

let lastSpotifyCallAt: number | null = null;

// The only Spotify Web API call the player makes, spaced out per waitBeforeNextCall.
async function startTrackOnDevice(deviceId: string, trackId: string): Promise<void> {
  const wait = waitBeforeNextCall(lastSpotifyCallAt, Date.now());
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const accessToken = await getAccessToken();
  lastSpotifyCallAt = Date.now();
  const response = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ uris: [spotifyTrackUri(trackId)], position_ms: 0 }),
    },
  );
  if (response.ok) return;
  if (response.status === 401) {
    cachedToken = null;
    throw new PlaybackProblemError("opnieuw_inloggen");
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { error?: { reason?: string } };
    throw new PlaybackProblemError(body.error?.reason === "PREMIUM_REQUIRED" ? "geen_premium" : "afspelen");
  }
  if (response.status === 429) throw new PlaybackProblemError("te_veel_verzoeken");
  // 404 means Spotify no longer knows this browser as a device.
  throw new PlaybackProblemError(response.status === 404 ? "verbinding" : "afspelen");
}

function problemOf(error: unknown): PlaybackProblem {
  return error instanceof PlaybackProblemError ? error.problem : "afspelen";
}

// Phones show the media session on the lock screen. Keep the song a secret there too.
function hideNowPlaying() {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: DEVICE_NAME, artist: "?" });
}

// The record player's connection to Spotify. Modes use this and never touch the SDK.
export function usePlayback(): Playback {
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState);
  const stateRef = useRef(state);
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceRef = useRef<Promise<string> | null>(null);
  const trackIdRef = useRef<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fail = useCallback((problem: PlaybackProblem) => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    dispatch({ type: "fout", problem });
  }, []);

  // Creates a player for the loaded SDK. Synchronous, so a tap can activate it right away.
  const createPlayer = useCallback((): Spotify.Player => {
    const SpotifySdk = window.Spotify!;
    const player = new SpotifySdk.Player({
      name: DEVICE_NAME,
      volume: 0.8,
      getOAuthToken: (callback) => {
        getAccessToken()
          .then(callback)
          .catch((error) => fail(problemOf(error)));
      },
    });
    playerRef.current = player;

    deviceRef.current = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new PlaybackProblemError("verbinding")), READY_TIMEOUT_MS);
      player.addListener("ready", ({ device_id }) => {
        clearTimeout(timer);
        resolve(device_id);
        if (playerRef.current === player) dispatch({ type: "klaar" });
      });
    });
    // Nobody may be waiting yet; the failure still shows through the catch below.
    deviceRef.current.catch((error) => {
      if (playerRef.current === player) fail(problemOf(error));
    });

    player.addListener("not_ready", () => {
      if (playerRef.current === player) fail("verbinding");
    });
    for (const event of ["initialization_error", "authentication_error", "account_error", "playback_error"] as const) {
      player.addListener(event, () => {
        if (playerRef.current !== player) return;
        if (event === "authentication_error") cachedToken = null;
        fail(problemFromSdkError(event));
      });
    }
    player.addListener("player_state_changed", (sdkState) => {
      if (playerRef.current !== player || !sdkState) return;
      hideNowPlaying();
      if (!sdkState.paused && startTimerRef.current) {
        clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
      dispatch({
        type: "stand",
        paused: sdkState.paused,
        positionMs: sdkState.position,
        durationMs: sdkState.duration,
        at: Date.now(),
      });
    });

    player.connect().then((connected) => {
      if (!connected && playerRef.current === player) fail("verbinding");
    });
    return player;
  }, [fail]);

  const dropPlayer = useCallback(() => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    playerRef.current?.disconnect();
    playerRef.current = null;
    deviceRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSdk()
      .then(() => {
        if (!cancelled) createPlayer();
      })
      .catch((error) => {
        if (!cancelled) fail(problemOf(error));
      });
    return () => {
      cancelled = true;
      dropPlayer();
    };
  }, [createPlayer, dropPlayer, fail]);

  // Must be called inside the tap: mobile browsers only allow sound that a tap started.
  const startTrack = useCallback(
    (player: Spotify.Player, trackId: string) => {
      const activated = player.activateElement();
      trackIdRef.current = trackId;
      dispatch({ type: "starten" });
      const device = deviceRef.current;
      (async () => {
        await activated;
        if (!device) throw new PlaybackProblemError("verbinding");
        await startTrackOnDevice(await device, trackId);
        if (playerRef.current !== player) return;
        if (startTimerRef.current) clearTimeout(startTimerRef.current);
        startTimerRef.current = setTimeout(() => {
          startTimerRef.current = null;
          if (stateRef.current.status === "starten") fail("afspelen");
        }, START_TIMEOUT_MS);
      })().catch((error) => {
        if (playerRef.current === player) fail(problemOf(error));
      });
    },
    [fail],
  );

  const play = useCallback(
    (trackId: string) => {
      const player = playerRef.current;
      trackIdRef.current = trackId;
      setTrackId(trackId);
      if (!player || stateRef.current.status === "verbinden" || stateRef.current.status === "fout") return;
      startTrack(player, trackId);
    },
    [startTrack],
  );

  const retry = useCallback(() => {
    dropPlayer();
    dispatch({ type: "verbinden" });
    if (!window.Spotify) {
      loadSdk()
        .then(() => createPlayer())
        .catch((error) => fail(problemOf(error)));
      return;
    }
    const player = createPlayer();
    const trackId = trackIdRef.current;
    if (!trackId) return;
    // Activate inside this tap; the play request waits for the new device itself.
    const activated = player.activateElement();
    deviceRef.current
      ?.then(async () => {
        await activated;
        if (playerRef.current === player) startTrack(player, trackId);
      })
      .catch(() => {});
  }, [createPlayer, dropPlayer, fail, startTrack]);

  const pause = useCallback(() => {
    playerRef.current?.pause().catch(() => fail("afspelen"));
  }, [fail]);

  const resume = useCallback(() => {
    playerRef.current?.resume().catch(() => fail("afspelen"));
  }, [fail]);

  const restart = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player
      .seek(0)
      .then(() => (stateRef.current.status === "pauze" ? player.resume() : undefined))
      .catch(() => fail("afspelen"));
  }, [fail]);

  return { state, trackId, play, pause, resume, restart, retry };
}
