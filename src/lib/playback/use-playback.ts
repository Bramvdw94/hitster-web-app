"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BROWSER_DEVICE_NAME, sameTarget, type DeviceTarget, type PlaybackTarget } from "./devices";
import {
  elapsedMs,
  initialPlaybackState,
  playbackReducer,
  problemFromSdkError,
  spotifyTrackUri,
  type PlaybackEvent,
  type PlaybackProblem,
  type PlaybackState,
} from "./playback";
import {
  PlaybackProblemError,
  forgetAccessToken,
  getAccessToken,
  problemOf,
  spotifyCall,
  throwPlayerProblem,
} from "./spotify-web-api";
import { getPlaybackTarget, setPlaybackTarget, usePlaybackTarget } from "./target";

const SDK_URL = "https://sdk.scdn.co/spotify-player.js";
const READY_TIMEOUT_MS = 15_000;
const START_TIMEOUT_MS = 12_000;

export type Playback = {
  state: PlaybackState;
  // The song last asked for, for the "Open in Spotify" fallback.
  trackId: string | null;
  // Where songs play: this browser, or a Spotify device the player picked.
  target: PlaybackTarget;
  play: (trackId: string) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  // Throws the player away, connects a new one and starts the song again.
  retry: () => void;
  // Must be called inside a tap. A song that was on moves along, from the start.
  switchTarget: (target: PlaybackTarget) => void;
};

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

// Starts a song on this browser's SDK player.
async function startTrackOnDevice(deviceId: string, trackId: string): Promise<void> {
  const response = await spotifyCall(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    body: { uris: [spotifyTrackUri(trackId)], position_ms: 0 },
  });
  if (!response.ok) await throwPlayerProblem(response, "verbinding");
}

// Sends a command to a Spotify Connect device. Nothing comes back from the device itself.
async function commandDevice(device: DeviceTarget, path: string, body?: unknown): Promise<void> {
  const join = path.includes("?") ? "&" : "?";
  const response = await spotifyCall(`${path}${join}device_id=${encodeURIComponent(device.id)}`, { method: "PUT", body });
  if (!response.ok) await throwPlayerProblem(response, "apparaat_weg");
}

// Phones show the media session on the lock screen. Keep the song a secret there too.
function hideNowPlaying() {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: BROWSER_DEVICE_NAME, artist: "?" });
}

type PlayerEvent =
  | { type: "klaar" }
  | { type: "fout"; problem: PlaybackProblem }
  | { type: "stand"; sdkState: Spotify.WebPlaybackState };

// One player for the whole page visit. A new player per turn piled up devices at Spotify,
// and after a full game a fresh one sometimes never got ready until a reload.
type SharedPlayer = {
  player: Spotify.Player;
  device: Promise<string>;
  ready: boolean;
  // After an error or a dropped connection the next turn starts with a new player.
  broken: boolean;
};

let shared: SharedPlayer | null = null;
const subscribers = new Set<(event: PlayerEvent) => void>();

function emit(player: Spotify.Player, event: PlayerEvent) {
  if (shared?.player !== player) return;
  if (event.type === "fout") shared.broken = true;
  for (const subscriber of subscribers) subscriber(event);
}

// Creates a player for the loaded SDK. Synchronous, so a tap can activate it right away.
function createSharedPlayer(): SharedPlayer {
  shared?.player.disconnect();
  const SpotifySdk = window.Spotify!;
  const player = new SpotifySdk.Player({
    name: BROWSER_DEVICE_NAME,
    volume: 0.8,
    getOAuthToken: (callback) => {
      getAccessToken()
        .then(callback)
        .catch((error) => emit(player, { type: "fout", problem: problemOf(error) }));
    },
  });
  const device = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PlaybackProblemError("verbinding")), READY_TIMEOUT_MS);
    player.addListener("ready", ({ device_id }) => {
      clearTimeout(timer);
      resolve(device_id);
      if (shared?.player === player) shared.ready = true;
      emit(player, { type: "klaar" });
    });
  });
  const created: SharedPlayer = { player, device, ready: false, broken: false };
  shared = created;

  // Nobody may be waiting yet; the failure still shows through the subscribers.
  device.catch((error) => emit(player, { type: "fout", problem: problemOf(error) }));
  player.addListener("not_ready", () => emit(player, { type: "fout", problem: "verbinding" }));
  for (const event of ["initialization_error", "authentication_error", "account_error", "playback_error"] as const) {
    player.addListener(event, () => {
      if (event === "authentication_error") forgetAccessToken();
      emit(player, { type: "fout", problem: problemFromSdkError(event) });
    });
  }
  player.addListener("player_state_changed", (sdkState) => {
    if (!sdkState) return;
    hideNowPlaying();
    emit(player, { type: "stand", sdkState });
  });
  player.connect().then((connected) => {
    if (!connected) emit(player, { type: "fout", problem: "verbinding" });
  });
  return created;
}

function sharedPlayer(): SharedPlayer {
  return shared && !shared.broken ? shared : createSharedPlayer();
}

// The record player's connection to Spotify. Modes use this and never touch the SDK.
// Songs play on this browser through the SDK, or on a Spotify Connect device through the Web API.
export function usePlayback(): Playback {
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState);
  const stateRef = useRef(state);
  const target = usePlaybackTarget();
  const targetRef = useRef<PlaybackTarget>(getPlaybackTarget());
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceRef = useRef<Promise<string> | null>(null);
  const trackIdRef = useRef<string | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Counts remote requests, so an answer to an older one changes nothing.
  const remoteRequestRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fail = useCallback((problem: PlaybackProblem) => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    // Whatever went wrong, the next turn gets a fresh player, as before the player was shared.
    if (shared && shared.player === playerRef.current) shared.broken = true;
    dispatch({ type: "fout", problem });
  }, []);

  // Points this hook at the shared player, which may already be ready from an earlier turn.
  const attachPlayer = useCallback((current: SharedPlayer): Spotify.Player => {
    playerRef.current = current.player;
    deviceRef.current = current.device;
    if (current.ready || targetRef.current.kind === "device") dispatch({ type: "klaar" });
    return current.player;
  }, []);

  const dropPlayer = useCallback(() => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    playerRef.current = null;
    deviceRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const remoteRequests = remoteRequestRef;
    const onEvent = (event: PlayerEvent) => {
      // While a Spotify device plays, the browser player only waits in reserve.
      if (targetRef.current.kind === "device" && event.type !== "klaar") return;
      if (event.type === "klaar") dispatch({ type: "klaar" });
      else if (event.type === "fout") fail(event.problem);
      else {
        const { sdkState } = event;
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
      }
    };
    subscribers.add(onEvent);
    // A device needs no browser player to start; the SDK still loads to switch back later.
    if (targetRef.current.kind === "device") dispatch({ type: "klaar" });
    loadSdk()
      .then(() => {
        if (!cancelled) attachPlayer(sharedPlayer());
      })
      .catch((error) => {
        if (!cancelled && targetRef.current.kind === "browser") fail(problemOf(error));
      });
    return () => {
      cancelled = true;
      subscribers.delete(onEvent);
      // Leaving the turn stops the song; the player itself stays for the next turn.
      const current = targetRef.current;
      if (current.kind === "device") {
        if (stateRef.current.status === "speelt") commandDevice(current, "/me/player/pause").catch(() => {});
      } else {
        playerRef.current?.pause().catch(() => {});
      }
      remoteRequests.current++;
      dropPlayer();
    };
  }, [attachPlayer, dropPlayer, fail]);

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
        if (playerRef.current === player && targetRef.current.kind === "browser") fail(problemOf(error));
      });
    },
    [fail],
  );

  // Runs one command on the chosen device. Shows the result right away and corrects it on failure.
  const remote = useCallback((run: (device: DeviceTarget) => Promise<void>, shown?: PlaybackEvent) => {
    const device = targetRef.current;
    if (device.kind !== "device") return;
    const request = ++remoteRequestRef.current;
    if (shown) dispatch(shown);
    run(device).catch((error) => {
      if (remoteRequestRef.current === request && targetRef.current === device) {
        dispatch({ type: "fout", problem: problemOf(error) });
      }
    });
  }, []);

  // The device sends no updates, so the player counts on from the moment Spotify said yes.
  const startRemote = useCallback(
    (trackId: string) => {
      const device = targetRef.current;
      if (device.kind !== "device") return;
      trackIdRef.current = trackId;
      dispatch({ type: "starten" });
      const request = ++remoteRequestRef.current;
      commandDevice(device, "/me/player/play", { uris: [spotifyTrackUri(trackId)], position_ms: 0 })
        .then(() => {
          if (remoteRequestRef.current !== request) return;
          dispatch({ type: "stand", paused: false, positionMs: 0, durationMs: 0, at: Date.now() });
        })
        .catch((error) => {
          if (remoteRequestRef.current === request) dispatch({ type: "fout", problem: problemOf(error) });
        });
    },
    [],
  );

  const play = useCallback(
    (trackId: string) => {
      const player = playerRef.current;
      trackIdRef.current = trackId;
      setTrackId(trackId);
      const status = stateRef.current.status;
      if (status === "verbinden" || status === "fout") return;
      if (targetRef.current.kind === "device") {
        startRemote(trackId);
        return;
      }
      if (!player) return;
      startTrack(player, trackId);
    },
    [startRemote, startTrack],
  );

  // Connects the browser player, a fresh one if asked, and starts the song once it is ready.
  const connectBrowser = useCallback(
    (fresh: boolean, trackId: string | null) => {
      dropPlayer();
      dispatch({ type: "verbinden" });
      if (!window.Spotify) {
        loadSdk()
          .then(() => attachPlayer(fresh ? createSharedPlayer() : sharedPlayer()))
          .catch((error) => fail(problemOf(error)));
        return;
      }
      const player = attachPlayer(fresh ? createSharedPlayer() : sharedPlayer());
      if (!trackId) return;
      // Activate inside this tap; the play request waits for the device itself.
      const activated = player.activateElement();
      deviceRef.current
        ?.then(async () => {
          await activated;
          if (playerRef.current === player) startTrack(player, trackId);
        })
        .catch(() => {});
    },
    [attachPlayer, dropPlayer, fail, startTrack],
  );

  const retry = useCallback(() => {
    if (targetRef.current.kind === "device") {
      remoteRequestRef.current++;
      dispatch({ type: "verbinden" });
      dispatch({ type: "klaar" });
      if (trackIdRef.current) startRemote(trackIdRef.current);
      return;
    }
    connectBrowser(true, trackIdRef.current);
  }, [connectBrowser, startRemote]);

  const switchTarget = useCallback(
    (next: PlaybackTarget) => {
      if (sameTarget(targetRef.current, next)) return;
      const { status } = stateRef.current;
      // A song that was on (or that failed) starts again on the new choice.
      const trackId =
        status === "starten" || status === "speelt" || status === "pauze" || status === "fout"
          ? trackIdRef.current
          : null;
      targetRef.current = next;
      setPlaybackTarget(next);
      remoteRequestRef.current++;
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      if (next.kind === "device") {
        // Spotify plays on one device at a time, so starting there silences this browser.
        dispatch({ type: "verbinden" });
        dispatch({ type: "klaar" });
        if (trackId) startRemote(trackId);
        return;
      }
      connectBrowser(false, trackId);
    },
    [connectBrowser, startRemote],
  );

  const pause = useCallback(() => {
    if (targetRef.current.kind === "device") {
      const now = Date.now();
      remote((device) => commandDevice(device, "/me/player/pause"), {
        type: "stand",
        paused: true,
        positionMs: elapsedMs(stateRef.current, now),
        durationMs: 0,
        at: now,
      });
      return;
    }
    playerRef.current?.pause().catch(() => fail("afspelen"));
  }, [fail, remote]);

  const resume = useCallback(() => {
    if (targetRef.current.kind === "device") {
      remote((device) => commandDevice(device, "/me/player/play"), {
        type: "stand",
        paused: false,
        positionMs: stateRef.current.positionMs,
        durationMs: 0,
        at: Date.now(),
      });
      return;
    }
    playerRef.current?.resume().catch(() => fail("afspelen"));
  }, [fail, remote]);

  const restart = useCallback(() => {
    if (targetRef.current.kind === "device") {
      remote((device) => commandDevice(device, "/me/player/seek?position_ms=0"), {
        type: "stand",
        paused: stateRef.current.status === "pauze",
        positionMs: 0,
        durationMs: 0,
        at: Date.now(),
      });
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    player
      .seek(0)
      .then(() => (stateRef.current.status === "pauze" ? player.resume() : undefined))
      .catch(() => fail("afspelen"));
  }, [fail, remote]);

  return { state, trackId, target, play, pause, resume, restart, retry, switchTarget };
}
