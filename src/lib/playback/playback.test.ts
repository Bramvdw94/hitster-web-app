import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  formatElapsed,
  initialPlaybackState,
  playbackReducer,
  problemFromSdkError,
  spotifyTrackUrl,
  waitBeforeNextCall,
  type PlaybackEvent,
  type PlaybackState,
} from "./playback";

function run(...events: PlaybackEvent[]): PlaybackState {
  return events.reduce(playbackReducer, initialPlaybackState);
}

const stand = (paused: boolean, positionMs = 0, at = 1000): PlaybackEvent => ({
  type: "stand",
  paused,
  positionMs,
  durationMs: 200_000,
  at,
});

describe("playbackReducer", () => {
  it("is ready once the player connects", () => {
    expect(run({ type: "klaar" }).status).toBe("klaar");
  });

  it("plays once the SDK reports the started song unpaused", () => {
    const starting = run({ type: "klaar" }, { type: "starten" }, stand(true));
    expect(starting.status).toBe("starten");
    expect(playbackReducer(starting, stand(false, 120)).status).toBe("speelt");
  });

  it("ignores SDK states before a song was started", () => {
    expect(run({ type: "klaar" }, stand(false)).status).toBe("klaar");
  });

  it("follows pause and resume", () => {
    const paused = run({ type: "klaar" }, { type: "starten" }, stand(false), stand(true, 5000));
    expect(paused).toMatchObject({ status: "pauze", positionMs: 5000 });
    expect(playbackReducer(paused, stand(false, 5000)).status).toBe("speelt");
  });

  it("starts the next song from zero", () => {
    const next = run({ type: "klaar" }, { type: "starten" }, stand(false, 30_000), { type: "starten" });
    expect(next).toMatchObject({ status: "starten", positionMs: 0 });
  });

  it("keeps a missing Premium over a later playback error", () => {
    const state = run(
      { type: "klaar" },
      { type: "fout", problem: "geen_premium" },
      { type: "fout", problem: "afspelen" },
    );
    expect(state.problem).toBe("geen_premium");
  });

  it("does not start a song while broken, and a retry starts over", () => {
    const broken = run({ type: "klaar" }, { type: "fout", problem: "verbinding" });
    expect(playbackReducer(broken, { type: "starten" }).status).toBe("fout");
    const retried = run({ type: "fout", problem: "verbinding" }, { type: "verbinden" }, { type: "klaar" });
    expect(retried).toMatchObject({ status: "klaar", problem: null });
  });

  it("does not jump back to ready on a silent reconnect", () => {
    const playing = run({ type: "klaar" }, { type: "starten" }, stand(false));
    expect(playbackReducer(playing, { type: "klaar" }).status).toBe("speelt");
  });
});

describe("problemFromSdkError", () => {
  it("maps an account error to no Premium", () => {
    expect(problemFromSdkError("account_error")).toBe("geen_premium");
    expect(problemFromSdkError("playback_error")).toBe("afspelen");
  });
});

describe("elapsedMs", () => {
  it("counts on while playing and stops at the end", () => {
    const playing = run({ type: "klaar" }, { type: "starten" }, stand(false, 10_000, 1000));
    expect(elapsedMs(playing, 3500)).toBe(12_500);
    expect(elapsedMs(playing, 10_000_000)).toBe(200_000);
  });

  it("stands still while paused", () => {
    const paused = run({ type: "klaar" }, { type: "starten" }, stand(false), stand(true, 7000, 1000));
    expect(elapsedMs(paused, 99_000)).toBe(7000);
  });
});

describe("formatElapsed", () => {
  it("shows minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_400)).toBe("1:05");
  });
});

describe("spotifyTrackUrl", () => {
  it("links to the track", () => {
    expect(spotifyTrackUrl("4uLU6hMCjMI75M1A2tKUQC")).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
  });
});

describe("waitBeforeNextCall", () => {
  it("keeps Spotify calls 3 seconds apart", () => {
    expect(waitBeforeNextCall(null, 5000)).toBe(0);
    expect(waitBeforeNextCall(5000, 6000)).toBe(2000);
    expect(waitBeforeNextCall(5000, 9000)).toBe(0);
  });
});
