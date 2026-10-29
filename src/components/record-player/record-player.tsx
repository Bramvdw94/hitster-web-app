"use client";

import { useEffect, useState } from "react";
import { elapsedMs, formatElapsed, problemMessages, spotifyTrackUrl } from "@/lib/playback/playback";
import type { Playback } from "@/lib/playback/use-playback";
import styles from "./record-player.module.css";

const statusText = {
  verbinden: "Speler verbinden…",
  klaar: "Klaar om te draaien",
  starten: "Plaat opzetten…",
  speelt: "Speelt",
  pauze: "Gepauzeerd",
  fout: "Er ging iets mis",
} as const;

// The Platenspeler from #6: a spinning record with a "?" label. It never shows the song.
export function RecordPlayer({ playback }: { playback: Playback }) {
  const { state, trackId } = playback;
  // Starts at 0 (the time is unknown while prerendering); the interval below takes over.
  const [now, setNow] = useState(0);
  const spinning = state.status === "speelt";
  const armDown = state.status === "speelt" || state.status === "pauze" || state.status === "starten";
  const hasSong = state.status === "speelt" || state.status === "pauze";

  useEffect(() => {
    if (!spinning) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [spinning]);

  return (
    <section className={styles.player} aria-label="Platenspeler">
      <div className={`${styles.deck} ${spinning ? styles.spinning : ""} ${armDown ? styles.armDown : ""}`}>
        <div className={styles.vinyl}>
          <div className={styles.label}>
            <span>?</span>
          </div>
        </div>
        <div className={styles.arm} aria-hidden="true" />
      </div>

      <p className={styles.status} role="status">
        {statusText[state.status]}
      </p>

      {state.status === "fout" && state.problem ? (
        <div className={styles.problem} role="alert">
          <p>{problemMessages[state.problem]}</p>
          <div className={styles.problemActions}>
            <button type="button" className={styles.retry} onClick={playback.retry}>
              Probeer opnieuw
            </button>
            {trackId ? (
              <a className={styles.openSpotify} href={spotifyTrackUrl(trackId)} target="_blank" rel="noreferrer">
                Open in Spotify
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.restart}
            onClick={playback.restart}
            disabled={!hasSong}
            aria-label="Opnieuw vanaf het begin"
          >
            <span aria-hidden="true">↺</span>
          </button>
          <button
            type="button"
            className={styles.playPause}
            onClick={state.status === "speelt" ? playback.pause : playback.resume}
            disabled={!hasSong}
            aria-label={state.status === "speelt" ? "Pauze" : "Verder spelen"}
          >
            <span aria-hidden="true">{state.status === "speelt" ? "❚❚" : "▶"}</span>
          </button>
          <span className={styles.time} aria-label="Verstreken tijd">
            {formatElapsed(elapsedMs(state, now))}
          </span>
        </div>
      )}
    </section>
  );
}
