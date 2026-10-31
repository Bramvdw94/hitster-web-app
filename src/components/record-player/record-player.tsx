"use client";

import { useCallback, useEffect, useState } from "react";
import { DeviceIcon, DevicePickerSheet, targetIcon } from "@/components/device-picker/device-picker";
import { BROWSER_TARGET } from "@/lib/playback/devices";
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

export function playbackStatusText(playback: Playback): string {
  return statusText[playback.state.status];
}

// The record and its tonearm, sized by its parent (`className`). It spins while a song plays.
export function Vinyl({ playback, className = "", arm = true }: { playback: Playback; className?: string; arm?: boolean }) {
  const status = playback.state.status;
  const spinning = status === "speelt";
  const armDown = status === "speelt" || status === "pauze" || status === "starten";
  return (
    <div
      className={`${styles.deck} ${spinning ? styles.spinning : ""} ${armDown ? styles.armDown : ""} ${className}`}
      aria-hidden="true"
    >
      <div className={styles.vinyl}>
        <div className={styles.label}>
          <span>?</span>
        </div>
      </div>
      {arm ? <div className={styles.arm} /> : null}
    </div>
  );
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.2v13.6L19 12z" />
  </svg>
);
const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z" />
  </svg>
);
const RestartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
    <path d="M4 4.5v4.2h4.2" />
  </svg>
);

type PlayProps = {
  playback: Playback;
  // False until the first tap of this turn: the button is orange and starts the song.
  started: boolean;
  onStart: () => void;
  className?: string;
};

// One button for the whole song: orange "start" first (it replaced "Zet de plaat op"), then a
// grey play/pause. It starts the song inside the tap, so phones let it play.
export function PlayButton({ playback, started, onStart, className = "" }: PlayProps) {
  const status = playback.state.status;
  const waiting = status === "verbinden" || status === "starten";
  const fresh = !started || status === "klaar";
  const label = waiting
    ? status === "verbinden"
      ? "Speler verbinden"
      : "Plaat opzetten"
    : fresh
      ? "Start het nummer"
      : status === "speelt"
        ? "Pauze"
        : "Verder spelen";

  function onClick() {
    if (fresh) onStart();
    else if (status === "speelt") playback.pause();
    else if (status === "pauze") playback.resume();
  }

  return (
    <button
      type="button"
      className={`${styles.play} ${!started ? styles.playStart : ""} ${className}`}
      onClick={onClick}
      disabled={waiting || status === "fout"}
      aria-label={label}
    >
      {waiting ? <span className={styles.spinner} aria-hidden="true" /> : status === "speelt" && started ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

export function RestartButton({ playback, className = "" }: { playback: Playback; className?: string }) {
  const hasSong = playback.state.status === "speelt" || playback.state.status === "pauze";
  return (
    <button
      type="button"
      className={`${styles.round} ${className}`}
      onClick={playback.restart}
      disabled={!hasSong}
      aria-label="Opnieuw vanaf het begin"
    >
      <RestartIcon />
    </button>
  );
}

// The Spotify-style device button with its "Afspelen op" sheet. Green while the song plays
// on another device.
export function DeviceButton({ playback, className = "" }: { playback: Playback; className?: string }) {
  const { target } = playback;
  const elsewhere = target.kind === "device";
  const [picking, setPicking] = useState(false);
  const close = useCallback(() => setPicking(false), []);
  return (
    <>
      <button
        type="button"
        className={`${styles.round} ${elsewhere ? styles.elsewhere : ""} ${className}`}
        onClick={() => setPicking(true)}
        aria-label={elsewhere ? `Speelt op ${target.name}. Kies waar de muziek speelt` : "Kies waar de muziek speelt"}
      >
        <DeviceIcon name={elsewhere ? targetIcon(target) : "apparaten"} />
      </button>
      <DevicePickerSheet open={picking} target={target} onChoose={playback.switchTarget} onClose={close} />
    </>
  );
}

// Time since the song started, counted locally.
export function ElapsedTime({ playback, className = "" }: { playback: Playback; className?: string }) {
  const { state } = playback;
  // Starts at 0 (the time is unknown while prerendering); the interval below takes over.
  const [now, setNow] = useState(0);
  const spinning = state.status === "speelt";
  useEffect(() => {
    if (!spinning) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [spinning]);
  return (
    <span className={`${styles.time} ${className}`} aria-label="Verstreken tijd">
      {formatElapsed(elapsedMs(state, now))}
    </span>
  );
}

// "Speelt op Woonkamer" while the song plays on another device.
export function OnDevice({ playback, className = "" }: { playback: Playback; className?: string }) {
  const { target } = playback;
  if (target.kind !== "device" || playback.state.status === "fout") return null;
  return (
    <p className={`${styles.onDevice} ${className}`}>
      <DeviceIcon name={targetIcon(target)} />
      <span>Speelt op {target.name}</span>
    </p>
  );
}

// What went wrong, with the ways out: try again, another device, or open the song in Spotify.
export function PlaybackProblem({ playback, className = "" }: { playback: Playback; className?: string }) {
  const { state, trackId } = playback;
  const [picking, setPicking] = useState(false);
  const close = useCallback(() => setPicking(false), []);
  if (state.status !== "fout" || !state.problem) return null;
  return (
    <div className={`${styles.problem} ${className}`} role="alert">
      <p>{problemMessages[state.problem]}</p>
      <div className={styles.problemActions}>
        {state.problem === "apparaat_weg" ? (
          <>
            <button type="button" className={styles.retry} onClick={() => playback.switchTarget(BROWSER_TARGET)}>
              Speel op deze telefoon
            </button>
            <button type="button" className={styles.otherDevice} onClick={() => setPicking(true)}>
              Kies een ander apparaat
            </button>
          </>
        ) : (
          <button type="button" className={styles.retry} onClick={playback.retry}>
            Probeer opnieuw
          </button>
        )}
        {trackId ? (
          <a className={styles.openSpotify} href={spotifyTrackUrl(trackId)} target="_blank" rel="noreferrer">
            Open in Spotify
          </a>
        ) : null}
      </div>
      <DevicePickerSheet open={picking} target={playback.target} onChoose={playback.switchTarget} onClose={close} />
    </div>
  );
}

type Props = {
  playback: Playback;
  started: boolean;
  onStart: () => void;
};

// The Platenspeler from #6: a spinning record with a "?" label. It never shows the song.
// The orange play button starts the song; after that it is a grey play/pause.
export function RecordPlayer({ playback, started, onStart }: Props) {
  const failed = playback.state.status === "fout";
  return (
    <section className={styles.player} aria-label="Platenspeler">
      <Vinyl playback={playback} className={styles.big} />

      <p className={styles.status} role="status">
        {playbackStatusText(playback)}
      </p>

      <OnDevice playback={playback} />

      {failed ? (
        <PlaybackProblem playback={playback} />
      ) : (
        <div className={styles.controls}>
          <RestartButton playback={playback} />
          <PlayButton playback={playback} started={started} onStart={onStart} />
          <ElapsedTime playback={playback} />
          <DeviceButton playback={playback} />
        </div>
      )}
    </section>
  );
}
