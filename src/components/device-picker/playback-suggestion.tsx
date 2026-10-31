"use client";

import { useCallback, useEffect, useState } from "react";
import { playingDeviceFrom, sameTarget, targetFor, BROWSER_TARGET, type SpotifyDevice } from "@/lib/playback/devices";
import { spotifyCall } from "@/lib/playback/spotify-web-api";
import { setPlaybackTarget, usePlaybackTarget } from "@/lib/playback/target";
import { DeviceIcon, DevicePickerSheet, targetIcon } from "./device-picker";
import styles from "./playback-suggestion.module.css";

// On a start screen: if Spotify already plays somewhere, offer to play the game there.
// One Spotify call per visit. Shows nothing when Spotify plays nowhere and the phone is chosen.
export function PlaybackSuggestion() {
  const target = usePlaybackTarget();
  const [playing, setPlaying] = useState<SpotifyDevice | null>(null);
  const [answered, setAnswered] = useState(false);
  const [picking, setPicking] = useState(false);
  const closePicker = useCallback(() => setPicking(false), []);

  useEffect(() => {
    let cancelled = false;
    spotifyCall("/me/player")
      .then(async (response) => {
        // 204 means Spotify plays nowhere; any failure simply means no suggestion.
        if (response.status !== 200) return;
        const device = playingDeviceFrom(await response.json());
        if (!cancelled) setPlaying(device);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const asking = playing !== null && !answered && !sameTarget(target, targetFor(playing));

  if (asking) {
    return (
      <div className={styles.suggest}>
        <div className={styles.head}>
          <span className={styles.icon}>
            <DeviceIcon name={targetIcon(targetFor(playing))} />
          </span>
          <span className={styles.text}>
            <strong>Spotify speelt nu op {playing.name}</strong>
            <small>Wil je de muziek daar horen?</small>
          </span>
        </div>
        <div className={styles.row}>
          <button
            type="button"
            className={styles.yes}
            onClick={() => {
              setPlaybackTarget(targetFor(playing));
              setAnswered(true);
            }}
          >
            Ja, op {playing.name}
          </button>
          <button
            type="button"
            className={styles.no}
            onClick={() => {
              setPlaybackTarget(BROWSER_TARGET);
              setAnswered(true);
            }}
          >
            Nee, op telefoon
          </button>
        </div>
      </div>
    );
  }

  if (target.kind === "browser" && !answered) return null;

  return (
    <>
      <p className={`${styles.chosen} ${target.kind === "browser" ? styles.here : ""}`}>
        <DeviceIcon name={targetIcon(target)} />
        <span>Muziek op {target.kind === "browser" ? "deze telefoon" : target.name}</span>
        <button type="button" className={styles.change} onClick={() => setPicking(true)}>
          wijzig
        </button>
      </p>
      <DevicePickerSheet open={picking} target={target} onChoose={setPlaybackTarget} onClose={closePicker} />
    </>
  );
}
